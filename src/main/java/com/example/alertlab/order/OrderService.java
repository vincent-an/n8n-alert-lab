package com.example.alertlab.order;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    public static final String LOCK_ORDER_A = "LOCK-A";
    public static final String LOCK_ORDER_B = "LOCK-B";

    private final OrderRepository orderRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public List<Order> findAll() {
        return orderRepository.findAll();
    }

    /** [시나리오 1] memo 가 null 인 주문에서 NPE 발생 */
    @Transactional(readOnly = true)
    public String getMemoPreview(String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new IllegalArgumentException("주문 없음: " + orderNo));
        return order.getMemo().substring(0, Math.min(10, order.getMemo().length()));
    }

    /** [시나리오 2] unique 제약(orderNo) 위반 */
    @Transactional
    public Order create(String orderNo, String productName, int quantity) {
        Order order = orderRepository.save(new Order(orderNo, productName, quantity, null));
        entityManager.flush(); // 제약조건 위반을 이 메서드 안에서 즉시 드러나게 함
        return order;
    }

    /** [시나리오 3] 실행 시간 제한(2초)을 넘는 무거운 쿼리 */
    @Transactional(readOnly = true)
    public Long slowQuery() {
        return orderRepository.countHugeSequence();
    }

    /** [시나리오 4] 커넥션을 오래 붙잡고 있는 트랜잭션 */
    @Transactional(readOnly = true)
    public Integer holdConnection(int seconds) {
        return orderRepository.sleep(seconds);
    }

    /** [시나리오 5] first → second 순서로 행 잠금. 반대 순서 호출과 교차하면 데드락 */
    @Transactional
    public void lockInOrder(String first, String second, long pauseMillis) {
        Order a = orderRepository.findByOrderNoForUpdate(first).orElseThrow();
        sleepQuietly(pauseMillis);
        Order b = orderRepository.findByOrderNoForUpdate(second).orElseThrow();
        a.changeQuantity(a.getQuantity() + 1);
        b.changeQuantity(b.getQuantity() + 1);
    }

    private static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
