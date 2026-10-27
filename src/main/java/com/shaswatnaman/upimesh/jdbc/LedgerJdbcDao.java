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
 * Plain JDBC access to the ledger tables, written with java.sql directly
 * (no JPA, no JdbcTemplate) so the JDBC steps are visible:
 *
 *   DataSource -> Connection -> PreparedStatement -> ResultSet -> close (try-with-resources)
 *
 * It reads the same tables Hibernate creates ({@code accounts}, {@code transactions}),
 * so it works unchanged on H2 (default) and MySQL (profile {@code mysql}).
 * All SQL uses bind parameters, never string concatenation.
 */
@Repository
public class LedgerJdbcDao {

    private static final String SQL_STATUS_TOTALS =
            "SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total "
                    + "FROM transactions GROUP BY status";

    private static final String SQL_TOTAL_BALANCE =
            "SELECT COALESCE(SUM(balance), 0) FROM accounts";

    private static final String SQL_COLUMNS =
            "SELECT id, packet_hash, sender_vpa, receiver_vpa, amount, signed_at, "
                    + "settled_at, bridge_node_id, hop_count, status FROM transactions ";

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
        try (Connection con = dataSource.getConnection()) {
            con.setReadOnly(true);
            long settled = 0, rejected = 0;
            BigDecimal settledVolume = BigDecimal.ZERO;

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
     */
    public void forEachTransaction(Consumer<TransactionRow> consumer) {
        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(SQL_ALL)) {
            con.setReadOnly(true);
            ps.setFetchSize(STREAM_FETCH_SIZE);
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
