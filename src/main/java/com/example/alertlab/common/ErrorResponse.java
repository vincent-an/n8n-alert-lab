package com.example.alertlab.common;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "처리되지 않은 예외 응답")
public record ErrorResponse(
        @Schema(description = "예외 클래스 이름", example = "NullPointerException")
        String error,
        @Schema(description = "요청 추적 ID — Loki 에서 `| json | traceId=\"...\"` 로 검색", example = "3f9c2a7b1d4e5f60")
        String traceId) {
}
