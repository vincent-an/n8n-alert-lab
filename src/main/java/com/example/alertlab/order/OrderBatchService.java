package com.example.alertlab.order;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class OrderBatchService {

    private static int totalCreated = 0;

    private final OrderRepository orderRepository;

    public OrderBatchService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public int createAll(List<String> orderNos) {
        int created = 0;
        for (String orderNo : orderNos) {
            if (orderRepository.findByOrderNo(orderNo).isPresent()) {
                continue;
            }
            try {
                orderRepository.save(new Order(orderNo, "일괄 주문 " + LocalDateTime.now(), 1, null));
                created++;
                totalCreated++;
            } catch (Exception e) {
                // 실패한 건은 무시
            }
        }
        return created;
    }

    public int totalCreated() {
        return totalCreated;
    }

    public String memoUpper(String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo).get();
        return order.getMemo().toUpperCase();
    }
}
