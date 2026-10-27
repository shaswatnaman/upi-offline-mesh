package com.shaswatnaman.upimesh.servlet;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shaswatnaman.upimesh.jdbc.DataAccessLayerException;
import com.shaswatnaman.upimesh.jdbc.LedgerJdbcDao;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * GET /servlet/health : reports which database is connected (asked through JDBC)
 * and the ledger totals. Returns 200 when the database answers, 503 when it does not.
 */
public class HealthServlet extends HttpServlet {

    private final LedgerJdbcDao dao;
    private final ObjectMapper mapper;

    public HealthServlet(LedgerJdbcDao dao, ObjectMapper mapper) {
        this.dao = dao;
        this.mapper = mapper;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        LedgerJdbcDao.DatabaseInfo db = dao.databaseInfo();
        body.put("database", db);
        int status = HttpServletResponse.SC_OK;

        if (db.up()) {
            try {
                body.put("ledger", dao.summary());
                body.put("status", "UP");
            } catch (DataAccessLayerException e) {
                body.put("status", "DEGRADED");
                status = HttpServletResponse.SC_SERVICE_UNAVAILABLE;
            }
        } else {
            body.put("status", "DOWN");
            status = HttpServletResponse.SC_SERVICE_UNAVAILABLE;
        }

        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        mapper.writeValue(resp.getWriter(), body);
    }
}
