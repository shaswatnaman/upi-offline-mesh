package com.shaswatnaman.upimesh.servlet;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shaswatnaman.upimesh.files.LedgerFileService;
import com.shaswatnaman.upimesh.jdbc.DataAccessLayerException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

/**
 * Ledger export as a classic servlet.
 *
 *   GET  /servlet/export              live ledger streamed as a CSV download (straight from JDBC)
 *   GET  /servlet/export?file=NAME    download a previously saved export
 *   GET  /servlet/export?list=1       JSON list of saved exports
 *   POST /servlet/export              save a snapshot to disk, 201 + JSON with the file name
 */
public class LedgerExportServlet extends HttpServlet {

    private final LedgerFileService files;
    private final ObjectMapper mapper;

    public LedgerExportServlet(LedgerFileService files, ObjectMapper mapper) {
        this.files = files;
        this.mapper = mapper;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        try {
            if (req.getParameter("list") != null) {
                writeJson(resp, HttpServletResponse.SC_OK, Map.of("exports", files.listExports()));
                return;
            }

            String name = req.getParameter("file");
            if (name != null) {
                Optional<Path> saved = files.findExport(name);
                if (saved.isEmpty()) {
                    resp.sendError(HttpServletResponse.SC_NOT_FOUND, "No such export");
                    return;
                }
                startCsv(resp, name);
                resp.setContentLengthLong(Files.size(saved.get()));
                Files.copy(saved.get(), resp.getOutputStream());
                return;
            }

            startCsv(resp, "transactions-live.csv");
            Writer out = new OutputStreamWriter(resp.getOutputStream(), StandardCharsets.UTF_8);
            files.writeCsv(out);
        } catch (DataAccessLayerException e) {
            if (!resp.isCommitted()) {
                resp.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Database unavailable");
            }
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        try {
            Path saved = files.exportToFile();
            writeJson(resp, HttpServletResponse.SC_CREATED, Map.of(
                    "file", saved.getFileName().toString(),
                    "download", "/servlet/export?file=" + saved.getFileName()));
        } catch (DataAccessLayerException e) {
            resp.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Database unavailable");
        }
    }

    private static void startCsv(HttpServletResponse resp, String downloadName) {
        resp.setContentType("text/csv");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Content-Disposition", "attachment; filename=\"" + downloadName + "\"");
        resp.setHeader("X-Content-Type-Options", "nosniff");
        resp.setHeader("Cache-Control", "no-store");
    }

    private void writeJson(HttpServletResponse resp, int status, Object body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(resp.getWriter(), body);
    }
}
