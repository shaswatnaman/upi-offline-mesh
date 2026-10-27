package com.shaswatnaman.upimesh.files;

import com.shaswatnaman.upimesh.jdbc.LedgerJdbcDao;
import com.shaswatnaman.upimesh.jdbc.LedgerJdbcDao.TransactionRow;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Writes the ledger to CSV files on disk (java.nio.file) and serves them back.
 *
 *  - Files go to {@code <data-dir>/exports}.
 *  - A file is written to a temporary name first and then renamed, so a reader never
 *    sees a half-written export.
 *  - Reads only accept names that match a strict pattern and stay inside the export
 *    folder, so "../../etc/passwd" style names are refused.
 *  - CSV cells are quoted per RFC 4180 and neutralised against spreadsheet formula injection.
 */
@Service
public class LedgerFileService {

    private static final Logger log = LoggerFactory.getLogger(LedgerFileService.class);

    static final String HEADER =
            "id,packet_hash,sender_vpa,receiver_vpa,amount,signed_at,settled_at,bridge_node_id,hop_count,status";

    private static final Pattern SAFE_NAME = Pattern.compile("transactions-[0-9TZ-]+\\.csv");
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private final LedgerJdbcDao dao;
    private final Path exportDir;

    public LedgerFileService(LedgerJdbcDao dao, @Value("${upi.mesh.data-dir:./data}") String dataDir) {
        this.dao = dao;
        this.exportDir = Path.of(dataDir).toAbsolutePath().normalize().resolve("exports");
    }

    @PostConstruct
    void createFolder() throws IOException {
        Files.createDirectories(exportDir);
        log.info("CSV exports folder: {}", exportDir);
    }

    /** Streams every transaction as CSV into the given writer (does not close it). */
    public void writeCsv(Writer out) throws IOException {
        try {
            out.write(HEADER);
            out.write("\n");
            dao.forEachTransaction(row -> {
                try {
                    out.write(toCsvLine(row));
                    out.write("\n");
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
            out.flush();
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
    }

    /** Saves a snapshot of the ledger as a new CSV file and returns its path. */
    public Path exportToFile() throws IOException {
        Files.createDirectories(exportDir);
        String name = "transactions-" + STAMP.format(Instant.now()) + ".csv";
        Path target = exportDir.resolve(name);
        Path temp = Files.createTempFile(exportDir, "export-", ".tmp");
        try {
            try (BufferedWriter w = Files.newBufferedWriter(temp, StandardCharsets.UTF_8)) {
                writeCsv(w);
            }
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temp);
        }
        log.info("Exported ledger to {}", target);
        return target;
    }

    /** File names of saved exports, newest first. */
    public List<String> listExports() throws IOException {
        if (!Files.isDirectory(exportDir)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(exportDir)) {
            return files.map(p -> p.getFileName().toString())
                    .filter(n -> SAFE_NAME.matcher(n).matches())
                    .sorted(java.util.Comparator.reverseOrder())
                    .toList();
        }
    }

    /** Resolves a saved export by name, or empty if the name is unsafe or the file is missing. */
    public Optional<Path> findExport(String name) {
        if (name == null || !SAFE_NAME.matcher(name).matches()) {
            return Optional.empty();
        }
        Path p = exportDir.resolve(name).normalize();
        if (!p.startsWith(exportDir) || !Files.isRegularFile(p)) {
            return Optional.empty();
        }
        return Optional.of(p);
    }

    // ------------------------------------------------------------ CSV helpers

    static String toCsvLine(TransactionRow r) {
        return String.join(",",
                String.valueOf(r.id()),
                cell(r.packetHash()),
                cell(r.senderVpa()),
                cell(r.receiverVpa()),
                r.amount() == null ? "" : r.amount().toPlainString(),
                r.signedAt() == null ? "" : r.signedAt().toString(),
                r.settledAt() == null ? "" : r.settledAt().toString(),
                cell(r.bridgeNodeId()),
                String.valueOf(r.hopCount()),
                cell(r.status()));
    }

    static String cell(String value) {
        if (value == null) {
            return "";
        }
        String v = value;
        // A cell starting with = + - @ can run as a formula when opened in Excel.
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
