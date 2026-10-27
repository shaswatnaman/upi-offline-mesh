package com.shaswatnaman.upimesh.servlet;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.UUID;

/**
 * Servlet Filter: runs before and after every /servlet/* request.
 * Adds an X-Request-Id header and logs method, path, status and time taken.
 */
public class RequestLogFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(RequestLogFilter.class);

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String requestId = UUID.randomUUID().toString().substring(0, 8);
        response.setHeader("X-Request-Id", requestId);
        long start = System.nanoTime();
        try {
            chain.doFilter(req, res);
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            log.info("[{}] {} {} -> {} ({} ms)", requestId, request.getMethod(),
                    request.getRequestURI(), response.getStatus(), ms);
        }
    }
}
