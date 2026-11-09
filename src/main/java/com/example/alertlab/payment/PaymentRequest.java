package com.example.alertlab.payment;

public record PaymentRequest(String orderNo, String cardNumber, String cardPassword, long amount) {
}
