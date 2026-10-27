package com.shaswatnaman.upimesh.jdbc;

import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;
import java.util.function.Consumer;

/**
 * ============================================================
 * CONCEPT: JDBC (Java Database Connectivity)
 * ============================================================
 * JDBC is the standard Java API to talk to any relational database.
 * The flow is always the same 5 steps:
 *
 *   STEP 1: DataSource  → a pool of connections (Spring configures this)
 *   STEP 2: Connection  → one active connection to the DB
 *   STEP 3: PreparedStatement → the SQL query with ? placeholders
 *   STEP 4: ResultSet   → the rows that come back from the DB
 *   STEP 5: close()     → release the connection back to the pool
 *
 * WHY PreparedStatement and NOT plain Statement?
 *   Statement: "SELECT * FROM t WHERE vpa = '" + userInput + "'"
 *              → SQL Injection risk! Attacker types: alice' OR '1'='1
 *   PreparedStatement: "SELECT * FROM t WHERE vpa = ?"  then ps.setString(1, userInput)
 *              → User input is ALWAYS treated as a value, never as SQL. Safe.
 *
 * WHY try-with-resources?
 *   Connections are limited. If you forget to close them, the app runs out
 *   and crashes. try-with-resources auto-closes Connection, PreparedStatement,
 *   and ResultSet even if an exception is thrown midway.
 *
 * This class uses plain JDBC (no JPA, no JdbcTemplate) intentionally —
 * so every step of the pipeline is visible and explainable in a viva.
 * It reads the same tables Hibernate creates ({@code accounts}, {@code transactions}),
 * so it works unchanged on H2 (default) and MySQL (profile {@code mysql}).
 * ============================================================
 */
@Repository
public class LedgerJdbcDao {

    // SQL CONCEPT: GROUP BY groups rows with the same 'status' value together.
    // COUNT(*) counts rows per group. SUM(amount) adds up amounts per group.
    // COALESCE(SUM(amount), 0) → if SUM returns NULL (no rows), give 0 instead of NULL.
    // This single query gives us settled count, rejected count, and settled volume at once.
    private static final String SQL_STATUS_TOTALS =
            "SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total "
                    + "FROM transactions GROUP BY status";

    private static final String SQL_TOTAL_BALANCE =
            "SELECT COALESCE(SUM(balance), 0) FROM accounts";

    private static final String SQL_COLUMNS =
            "SELECT id, packet_hash, sender_vpa, receiver_vpa, amount, signed_at, "
                    + "settled_at, bridge_node_id, hop_count, status FROM transactions ";

    // SQL CONCEPT: ? is a bind parameter. We fill it with ps.setString(1, senderVpa).
    // ORDER BY id DESC → newest rows first. LIMIT ? → max N rows (prevents loading millions).
    private static final String SQL_BY_SENDER =
            SQL_COLUMNS + "WHERE sender_vpa = ? ORDER BY id DESC LIMIT ?";

    private static final String SQL_ALL = SQL_COLUMNS + "ORDER BY id";

    private static final int STREAM_FETCH_SIZE = 500;

    private final DataSource dataSource;

    public LedgerJdbcDao(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /** Totals for the ledger. Money is conserved, so totalBalance never changes after seeding. */
    public LedgerSummary summary() {
        // JDBC STEP 1→2: DataSource gives us a Connection.
        // try-with-resources → auto-closes the connection when done (or on exception).
        // con.setReadOnly(true) → tells the DB this is a read-only query (minor optimization).
        try (Connection con = dataSource.getConnection()) {
            con.setReadOnly(true);
            long settled = 0, rejected = 0;
            BigDecimal settledVolume = BigDecimal.ZERO;

            // JDBC STEP 3: PreparedStatement compiles the SQL query.
            // JDBC STEP 4: executeQuery() sends it to DB, returns ResultSet (the rows).
            // Both are in try-with-resources → auto-closed after use.
            try (PreparedStatement ps = con.prepareStatement(SQL_STATUS_TOTALS);
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String status = rs.getString("status");
                    if ("SETTLED".equals(status)) {
                        settled = rs.getLong("cnt");
                        settledVolume = rs.getBigDecimal("total");
                    } else if ("REJECTED".equals(status)) {
                        rejected = rs.getLong("cnt");
                    }
                }
            }

            BigDecimal totalBalance = BigDecimal.ZERO;
            try (PreparedStatement ps = con.prepareStatement(SQL_TOTAL_BALANCE);
                 ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    totalBalance = rs.getBigDecimal(1);
                }
            }
            return new LedgerSummary(settled, rejected, settledVolume, totalBalance);
        } catch (SQLException e) {
            throw new DataAccessLayerException("Could not read ledger summary", e);
        }
    }

    /** Most recent transactions sent by one VPA. */
    public List<TransactionRow> findBySender(String senderVpa, int limit) {
        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(SQL_BY_SENDER)) {
            ps.setString(1, senderVpa);
            ps.setInt(2, Math.max(1, Math.min(limit, 1000)));
            try (ResultSet rs = ps.executeQuery()) {
                List<TransactionRow> rows = new ArrayList<>();
                while (rs.next()) {
                    rows.add(mapRow(rs));
                }
                return rows;
            }
        } catch (SQLException e) {
            throw new DataAccessLayerException("Could not query transactions for " + senderVpa, e);
        }
    }

    /**
     * Visits every transaction one row at a time, so a large ledger can be written to a
     * file or an HTTP response without loading it all into memory.
     *
     * JDBC CONCEPT: setFetchSize(500) → fetch 500 rows at a time from the DB instead of
     * loading ALL rows into memory. If there are 1 million transactions, without this
     * you'd load 1 million objects into RAM and crash. With this, only 500 are in memory
     * at a time. This is called "streaming" or "cursor-based" reading.
     */
    public void forEachTransaction(Consumer<TransactionRow> consumer) {
        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(SQL_ALL)) {
            con.setReadOnly(true);
            ps.setFetchSize(STREAM_FETCH_SIZE); // OOP CONCEPT: Consumer<T> is a functional interface — pass behaviour as a parameter
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    consumer.accept(mapRow(rs));
                }
            }
        } catch (SQLException e) {
            throw new DataAccessLayerException("Could not read transactions", e);
        }
    }

    /** Opens a connection and asks the driver which database it is talking to. */
    public DatabaseInfo databaseInfo() {
        try (Connection con = dataSource.getConnection()) {
            DatabaseMetaData meta = con.getMetaData();
            boolean valid = con.isValid(2);
            return new DatabaseInfo(meta.getDatabaseProductName(),
                    meta.getDatabaseProductVersion(), valid);
        } catch (SQLException e) {
            return new DatabaseInfo("unknown", "unknown", false);
        }
    }

    private TransactionRow mapRow(ResultSet rs) throws SQLException {
        // Hibernate stores Instant as UTC, so read it back with a UTC calendar.
        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        return new TransactionRow(
                rs.getLong("id"),
                rs.getString("packet_hash"),
                rs.getString("sender_vpa"),
                rs.getString("receiver_vpa"),
                rs.getBigDecimal("amount"),
                toInstant(rs.getTimestamp("signed_at", utc)),
                toInstant(rs.getTimestamp("settled_at", utc)),
                rs.getString("bridge_node_id"),
                rs.getInt("hop_count"),
                rs.getString("status"));
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }

    public record TransactionRow(long id, String packetHash, String senderVpa, String receiverVpa,
                                 BigDecimal amount, Instant signedAt, Instant settledAt,
                                 String bridgeNodeId, int hopCount, String status) {}

    public record LedgerSummary(long settledCount, long rejectedCount,
                                BigDecimal settledVolume, BigDecimal totalBalance) {}

    public record DatabaseInfo(String product, String version, boolean up) {}
}
