package com.shaswatnaman.upimesh.servlet;

import com.shaswatnaman.upimesh.files.AuditLogService;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

/** GET /servlet/audit?lines=50 : the last lines of the ingest audit log as plain text. */
public class AuditLogServlet extends HttpServlet {

    private final AuditLogService audit;

    public AuditLogServlet(AuditLogService audit) {
        this.audit = audit;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        int lines = 50;
        String param = req.getParameter("lines");
        if (param != null) {
            try {
                lines = Integer.parseInt(param);
            } catch (NumberFormatException e) {
                resp.sendError(HttpServletResponse.SC_BAD_REQUEST, "lines must be a number");
                return;
            }
        }
        resp.setContentType("text/plain");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        PrintWriter out = resp.getWriter();
        for (String line : audit.tail(lines)) {
            out.println(line);
        }
    }
}
