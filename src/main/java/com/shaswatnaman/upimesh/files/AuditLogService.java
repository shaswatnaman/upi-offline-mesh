package com.shaswatnaman.upimesh.files;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Append-only audit trail: one line per packet the backend receives, whatever the outcome.
 *
 *   2026-10-27T06:41:12.345Z | SETTLED | - | 9f2c1ab07d44 | bridge-1 | 3
 *
 * Many request threads call {@link #record} at once, so appends are serialised with a lock
 * and each line is written in a single call. A failure to write is logged and swallowed:
 * the audit log must never stop a payment from settling.
 * The file is rotated to a timestamped name once it grows past a size limit.
 */
@Service
public class AuditLogService {

    private static final Logger log = LoggerFactory.getLogger(AuditLogService.class);
    private static final DateTimeFormatter ROTATE_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmssSSS'Z'").withZone(ZoneOffset.UTC);

    private final Path auditDir;
    private final Path auditFile;
    private final long maxBytes;
    private final ReentrantLock lock = new ReentrantLock();

    public AuditLogService(@Value("${upi.mesh.data-dir:./data}") String dataDir,
                           @Value("${upi.mesh.audit-max-bytes:5242880}") long maxBytes) {
        this.auditDir = Path.of(dataDir).toAbsolutePath().normalize().resolve("audit");
        this.auditFile = auditDir.resolve("ingest-audit.log");
        this.maxBytes = maxBytes;
    }

    @PostConstruct
    void createFolder() throws IOException {
        Files.createDirectories(auditDir);
        log.info("Audit log file: {}", auditFile);
    }

    public void record(String outcome, String reason, String packetHash,
                       String bridgeNodeId, int hopCount) {
        String line = String.join(" | ",
                Instant.now().toString(),
                clean(outcome),
                reason == null || reason.isBlank() ? "-" : clean(reason),
                packetHash == null ? "-" : clean(packetHash.length() > 12 ? packetHash.substring(0, 12) : packetHash),
                clean(bridgeNodeId),
                String.valueOf(hopCount)) + System.lineSeparator();

        lock.lock();
        try {
            rotateIfNeeded();
            Files.writeString(auditFile, line, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.warn("Could not write audit line: {}", e.getMessage());
        } finally {
            lock.unlock();
        }
    }

    /** The last {@code n} lines of the audit log (oldest first). Reads line by line. */
    public List<String> tail(int n) throws IOException {
        int keep = Math.max(1, Math.min(n, 1000));
        lock.lock();
        try {
            if (!Files.exists(auditFile)) {
                return List.of();
            }
            Deque<String> window = new ArrayDeque<>(keep);
            try (BufferedReader reader = Files.newBufferedReader(auditFile, StandardCharsets.UTF_8)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (window.size() == keep) {
                        window.removeFirst();
                    }
                    window.addLast(line);
                }
            }
            return new ArrayList<>(window);
        } finally {
            lock.unlock();
        }
    }

    private void rotateIfNeeded() throws IOException {
        if (Files.exists(auditFile) && Files.size(auditFile) >= maxBytes) {
            Path rotated = auditDir.resolve("ingest-audit-" + ROTATE_STAMP.format(Instant.now()) + ".log");
            Files.move(auditFile, rotated);
            log.info("Rotated audit log to {}", rotated.getFileName());
        }
    }

    /** Keeps one record on one line even if a value contains a line break or the separator. */
    private static String clean(String s) {
        return s == null ? "-" : s.replaceAll("[\\r\\n|]", "_");
    }
}
