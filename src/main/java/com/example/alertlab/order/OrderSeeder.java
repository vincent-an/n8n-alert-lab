package com.example.alertlab.order;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 시나리오에 필요한 고정 데이터 준비 */
@Component
public class OrderSeeder implements ApplicationRunner {

    public static final String NO_MEMO_ORDER = "NO-MEMO";

    private final OrderRepository orderRepository;

    public OrderSeeder(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seed(NO_MEMO_ORDER, "메모 없는 주문", null);
        seed(OrderService.LOCK_ORDER_A, "락 테스트 A", "lock");
        seed(OrderService.LOCK_ORDER_B, "락 테스트 B", "lock");
    }

    private void seed(String orderNo, String productName, String memo) {
        if (orderRepository.findByOrderNo(orderNo).isEmpty()) {
            orderRepository.save(new Order(orderNo, productName, 1, memo));
        }
    }
}
