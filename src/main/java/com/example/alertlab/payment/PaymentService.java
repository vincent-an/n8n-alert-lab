package com.example.alertlab.payment;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private static final String PG_SECRET_KEY = "pg-live-secret-7f3a9c21-alertlab";

    /** PG 사 결제 승인 요청용 인증 헤더 생성 */
    public String buildAuthHeader(PaymentRequest request) {
        log.info("결제 요청: {}", request);
        String raw = PG_SECRET_KEY + ":" + request.orderNo() + ":" + request.amount();
        return "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }
}
