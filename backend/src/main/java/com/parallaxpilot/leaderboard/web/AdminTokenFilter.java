package com.parallaxpilot.leaderboard.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class AdminTokenFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Admin-Token";

    private final String expectedToken;
    private final MeterRegistry meterRegistry;

    public AdminTokenFilter(@Value("${app.admin.token:}") String expectedToken, MeterRegistry meterRegistry) {
        this.expectedToken = expectedToken;
        this.meterRegistry = meterRegistry;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/v1/admin/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {
        if (!isAuthorized(request.getHeader(HEADER_NAME))) {
            meterRegistry.counter("leaderboard.admin.auth.failures", "reason", "missing_or_invalid_token").increment();
            writeUnauthorized(response, request.getRequestURI());
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean isAuthorized(String providedToken) {
        if (!StringUtils.hasText(expectedToken) || !StringUtils.hasText(providedToken)) {
            return false;
        }

        return MessageDigest.isEqual(
            expectedToken.getBytes(StandardCharsets.UTF_8),
            providedToken.getBytes(StandardCharsets.UTF_8)
        );
    }

    private void writeUnauthorized(HttpServletResponse response, String path) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("""
            {"status":401,"error":"Unauthorized","message":"Missing or invalid admin token","fieldErrors":{},"path":"%s","timestamp":"%s"}
            """.formatted(path, Instant.now()));
    }
}