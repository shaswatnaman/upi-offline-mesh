package com.shaswatnaman.upimesh.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shaswatnaman.upimesh.files.AuditLogService;
import com.shaswatnaman.upimesh.files.LedgerFileService;
import com.shaswatnaman.upimesh.jdbc.LedgerJdbcDao;
import com.shaswatnaman.upimesh.servlet.AuditLogServlet;
import com.shaswatnaman.upimesh.servlet.HealthServlet;
import com.shaswatnaman.upimesh.servlet.LedgerExportServlet;
import com.shaswatnaman.upimesh.servlet.RequestLogFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the hand-written servlets and the filter with the embedded Tomcat.
 * They sit beside Spring MVC: /api/** goes to the controllers, /servlet/** goes to these.
 */
@Configuration
public class ServletConfig {

    @Bean
    public ServletRegistrationBean<LedgerExportServlet> exportServlet(LedgerFileService files,
                                                                      ObjectMapper mapper) {
        return new ServletRegistrationBean<>(new LedgerExportServlet(files, mapper), "/servlet/export");
    }

    @Bean
    public ServletRegistrationBean<HealthServlet> healthServlet(LedgerJdbcDao dao, ObjectMapper mapper) {
        return new ServletRegistrationBean<>(new HealthServlet(dao, mapper), "/servlet/health");
    }

    @Bean
    public ServletRegistrationBean<AuditLogServlet> auditServlet(AuditLogService audit) {
        return new ServletRegistrationBean<>(new AuditLogServlet(audit), "/servlet/audit");
    }

    @Bean
    public FilterRegistrationBean<RequestLogFilter> requestLogFilter() {
        FilterRegistrationBean<RequestLogFilter> reg = new FilterRegistrationBean<>(new RequestLogFilter());
        reg.addUrlPatterns("/servlet/*");
        return reg;
    }
}
