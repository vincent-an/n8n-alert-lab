package com.example.alertlab.common;

import java.sql.SQLException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 처리되지 않은 예외를 ERROR 로 한 번만 기록한다.
 * error_type(app|db) 을 MDC 로 남겨 Loki/Grafana/n8n 이 분기 키로 사용한다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handle(Exception e) {
        String errorType = isDbError(e) ? "db" : "app";
        MDC.put("error_type", errorType);
        try {
            log.error("Unhandled exception: {}", e.getMessage(), e);
        } finally {
            MDC.remove("error_type");
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                        "error", e.getClass().getSimpleName(),
                        "traceId", String.valueOf(MDC.get(MdcFilter.TRACE_ID))));
    }

    private boolean isDbError(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof DataAccessException || t instanceof SQLException || t instanceof TransactionException) {
                return true;
            }
        }
        return false;
    }
}
