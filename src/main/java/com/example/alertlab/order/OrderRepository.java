package com.example.alertlab.order;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByOrderNo(String orderNo);

    // SELECT ... FOR UPDATE — 데드락 시나리오용
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.orderNo = :orderNo")
    Optional<Order> findByOrderNoForUpdate(String orderNo);

    // 커넥션 점유 시나리오용
    @Query(value = "SELECT SLEEP(:seconds)", nativeQuery = true)
    Integer sleep(int seconds);

    // 슬로우 쿼리 시나리오용 — 1억 행을 세는 무거운 쿼리를 MySQL 이 2초에서 강제 중단 (ERROR 3024)
    // 참고: SLEEP() 은 중단돼도 에러 없이 1 을 반환하므로 타임아웃 재현에 쓸 수 없다
    @Query(value = """
            WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 100000000)
            SELECT /*+ SET_VAR(cte_max_recursion_depth = 1000000000) MAX_EXECUTION_TIME(2000) */ COUNT(*) FROM seq
            """, nativeQuery = true)
    Long countHugeSequence();
}
