package com.shaswatnaman.upimesh;

import com.shaswatnaman.upimesh.jdbc.LedgerJdbcDao;
import com.shaswatnaman.upimesh.model.MeshPacket;
import com.shaswatnaman.upimesh.service.BridgeIngestionService;
import com.shaswatnaman.upimesh.service.DemoService;
import com.shaswatnaman.upimesh.service.IdempotencyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Plain-JDBC DAO, CSV/audit files and the servlets, all against the default H2 database. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class JdbcFilesServletsTest {

    @LocalServerPort private int port;
    @Autowired private LedgerJdbcDao dao;
    @Autowired private DemoService demo;
    @Autowired private BridgeIngestionService bridge;
    @Autowired private IdempotencyService idempotency;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void reset() {
        idempotency.clear();
    }

    private HttpResponse<String> send(String method, String path) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        b = method.equals("POST") ? b.POST(HttpRequest.BodyPublishers.noBody()) : b.GET();
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private void settle(String from, String to, String amount) throws Exception {
        MeshPacket p = demo.createPacket(from, to, new BigDecimal(amount), "1234", 5);
        assertEquals("SETTLED", bridge.ingest(p, "bridge-test", 2).outcome());
    }

    // ------------------------------------------------------------------ JDBC

    @Test
    void jdbcSummaryCountsSettlementsAndConservesMoney() throws Exception {
        long before = dao.summary().settledCount();
        settle("carol@demo", "bob@demo", "10.00");

        LedgerJdbcDao.LedgerSummary after = dao.summary();
        assertEquals(before + 1, after.settledCount());
        // alice 5000 + bob 1000 + carol 2500 + dave 500: transfers never change the total
        assertEquals(0, new BigDecimal("9000.00").compareTo(after.totalBalance()));
    }

    @Test
    void jdbcFindBySenderReturnsTheRow() throws Exception {
        settle("carol@demo", "dave@demo", "7.25");

        List<LedgerJdbcDao.TransactionRow> rows = dao.findBySender("carol@demo", 5);
        assertFalse(rows.isEmpty());
        LedgerJdbcDao.TransactionRow latest = rows.get(0);
        assertEquals("dave@demo", latest.receiverVpa());
        assertEquals(0, new BigDecimal("7.25").compareTo(latest.amount()));
        assertEquals("SETTLED", latest.status());
        assertNotNull(latest.settledAt());
    }

    @Test
    void jdbcBindParametersStopSqlInjection() {
        assertTrue(dao.findBySender("x' OR '1'='1", 10).isEmpty());
    }

    @Test
    void jdbcReportsDatabaseProduct() {
        LedgerJdbcDao.DatabaseInfo info = dao.databaseInfo();
        assertTrue(info.up());
        assertEquals("H2", info.product());
    }

    // -------------------------------------------------------------- servlets

    @Test
    void healthServletReportsUpAndAddsRequestId() throws Exception {
        HttpResponse<String> r = send("GET", "/servlet/health");
        assertEquals(200, r.statusCode());
        assertTrue(r.body().contains("\"status\":\"UP\""));
        assertTrue(r.body().contains("H2"));
        assertTrue(r.headers().firstValue("X-Request-Id").isPresent(), "filter should add X-Request-Id");
    }

    @Test
    void exportServletStreamsLiveCsv() throws Exception {
        settle("carol@demo", "alice@demo", "1.00");

        HttpResponse<String> r = send("GET", "/servlet/export");
        assertEquals(200, r.statusCode());
        assertTrue(r.headers().firstValue("Content-Type").orElse("").startsWith("text/csv"));
        assertTrue(r.headers().firstValue("Content-Disposition").orElse("").contains("attachment"));
        assertTrue(r.body().startsWith("id,packet_hash,sender_vpa,receiver_vpa,amount"));
        assertTrue(r.body().contains("carol@demo"));
    }

    @Test
    void exportServletSavesFileThenServesIt() throws Exception {
        settle("carol@demo", "bob@demo", "2.00");

        HttpResponse<String> created = send("POST", "/servlet/export");
        assertEquals(201, created.statusCode());
        String body = created.body();
        int start = body.indexOf("transactions-");
        String name = body.substring(start, body.indexOf(".csv", start) + 4);

        HttpResponse<String> list = send("GET", "/servlet/export?list=1");
        assertTrue(list.body().contains(name));

        HttpResponse<String> file = send("GET", "/servlet/export?file=" + name);
        assertEquals(200, file.statusCode());
        assertTrue(file.body().startsWith("id,packet_hash"));
    }

    @Test
    void exportServletRefusesPathTraversal() throws Exception {
        assertEquals(404, send("GET", "/servlet/export?file=../pom.xml").statusCode());
        assertEquals(404, send("GET", "/servlet/export?file=..%2F..%2Fpom.xml").statusCode());
        assertEquals(404, send("GET", "/servlet/export?file=transactions-missing.csv").statusCode());
    }

    // ------------------------------------------------------------- audit log

    @Test
    void everyIngestIsWrittenToTheAuditLog() throws Exception {
        MeshPacket p = demo.createPacket("carol@demo", "bob@demo", new BigDecimal("3.00"), "1234", 5);
        bridge.ingest(p, "bridge-audit-a", 1);
        bridge.ingest(p, "bridge-audit-b", 1); // same packet again: duplicate

        String log = send("GET", "/servlet/audit?lines=200").body();
        assertTrue(log.contains("SETTLED | - ") && log.contains("bridge-audit-a"));
        assertTrue(log.contains("DUPLICATE_DROPPED") && log.contains("bridge-audit-b"));
    }

    @Test
    void auditServletRejectsBadLinesParameter() throws Exception {
        assertEquals(400, send("GET", "/servlet/audit?lines=abc").statusCode());
    }
}
