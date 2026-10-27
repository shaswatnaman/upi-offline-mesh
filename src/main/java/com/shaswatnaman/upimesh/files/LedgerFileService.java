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
 * ============================================================
 * CONCEPT: File Handling (java.nio.file)
 * ============================================================
 * This class demonstrates modern Java file I/O using the java.nio.file API
 * (NIO = New I/O, introduced in Java 7, preferred over old java.io.File).
 *
 * KEY FILE OPERATIONS USED:
 *   Files.createDirectories(path) → creates folder + all parents if not exist
 *   Files.newBufferedWriter(path, charset) → writes text to a file efficiently
 *   Files.move(src, dst, ATOMIC_MOVE) → renames file in ONE OS operation (safe)
 *   Files.createTempFile(dir, prefix, suffix) → creates a temporary file
 *   Files.list(dir) → lists all files in a folder (returns a Stream<Path>)
 *   Files.isRegularFile(path) → checks if path is an actual file (not a folder)
 *
 * ATOMIC WRITE PATTERN (important for data safety):
 *   Problem: if server crashes mid-write, readers see a half-written CSV.
 *   Solution:
 *     1. Write to a temp file (export-123.tmp)
 *     2. Fully close/flush it
 *     3. Atomically rename it to the final name (transactions-20241027.csv)
 *   Rename is atomic at the OS level — readers see either the OLD complete file
 *   or the NEW complete file, NEVER a half-written one.
 *
 * SECURITY — Path Traversal Attack Prevention:
 *   Attacker could request: ?file=../../etc/passwd → tries to read system files!
 *   We defend with TWO layers:
 *     Layer 1: SAFE_NAME regex → only "transactions-[date].csv" names allowed
 *     Layer 2: p.startsWith(exportDir) → even if regex passes, resolved path
 *              must still be inside our export folder
 *
 * CSV FORMULA INJECTION:
 *   If a VPA starts with '=' (e.g. =cmd|' /C calc'!A0), Excel would run it as
 *   a formula. We prefix such cells with a single quote to neutralize them.
 * ============================================================
 */
@Service
public class LedgerFileService {

    private static final Logger log = LoggerFactory.getLogger(LedgerFileService.class);

    static final String HEADER =
            "id,packet_hash,sender_vpa,receiver_vpa,amount,signed_at,settled_at,bridge_node_id,hop_count,status";

    // FILE SECURITY: regex whitelist — only filenames matching this pattern are served.
    // Blocks: "../../../etc/passwd", "secret.txt", "transactions-abc.csv", etc.
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
        // FILE HANDLING: write to a temp file first (never write directly to final name)
        Path temp = Files.createTempFile(exportDir, "export-", ".tmp");
        try {
            // BufferedWriter buffers writes in memory and flushes in chunks → faster than
            // writing one character at a time. StandardCharsets.UTF_8 → explicit encoding.
            try (BufferedWriter w = Files.newBufferedWriter(temp, StandardCharsets.UTF_8)) {
                writeCsv(w);
            }
            // ATOMIC MOVE: rename temp → final in one OS syscall.
            // If this JVM/OS supports it, the rename is instantaneous and atomic.
            // Fallback: REPLACE_EXISTING does a non-atomic copy if ATOMIC_MOVE fails.
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
