package com.example.alertlab.scenario;

import com.example.alertlab.order.OrderSeeder;
import com.example.alertlab.order.OrderService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 알럿 파이프라인 검증용 에러 재현 엔드포인트.
 * 실제 서비스에는 절대 두지 않는다.
 */
@RestController
@RequestMapping("/scenarios")
public class ScenarioController {

    private final OrderService orderService;

    public ScenarioController(OrderService orderService) {
        this.orderService = orderService;
    }

    /** 1. NPE (app) */
    @PostMapping("/npe")
    public String npe() {
        return orderService.getMemoPreview(OrderSeeder.NO_MEMO_ORDER);
    }

    /** 2. 중복 키 (db) */
    @PostMapping("/duplicate")
    public Object duplicate() {
        return orderService.create(OrderSeeder.NO_MEMO_ORDER, "중복 주문", 1);
    }

    /** 3. 슬로우 쿼리 → 실행 시간 초과 (db) */
    @PostMapping("/slow-query")
    public Object slowQuery() {
        return orderService.slowQuery();
    }

    /**
     * 4. 커넥션 풀 고갈 (db/infra) — 풀(3)보다 많은 스레드가 durationSeconds 동안 계속 커넥션을 요구.
     * 대기(pending)가 scrape 주기(15s)보다 길게 이어져야 HikariPending 알럿이 잡힌다.
     */
    @PostMapping("/pool-exhaustion")
    public Object poolExhaustion(@RequestParam(defaultValue = "10") int concurrency,
                                 @RequestParam(defaultValue = "5") int holdSeconds,
                                 @RequestParam(defaultValue = "40") int durationSeconds) {
        long deadline = System.currentTimeMillis() + durationSeconds * 1000L;
        AtomicReference<RuntimeException> firstFailure = new AtomicReference<>();
        runConcurrently(concurrency, () -> {
            while (System.currentTimeMillis() < deadline) {
                try {
                    orderService.holdConnection(holdSeconds);
                } catch (RuntimeException e) {
                    firstFailure.compareAndSet(null, e);
                }
            }
        });
        if (firstFailure.get() != null) {
            throw firstFailure.get();
        }
        return Map.of("result", "ok");
    }

    /** 5. 데드락 (db) — 두 트랜잭션이 A→B, B→A 순서로 행 잠금 */
    @PostMapping("/deadlock")
    public Object deadlock() {
        String a = OrderService.LOCK_ORDER_A;
        String b = OrderService.LOCK_ORDER_B;
        runTasks(List.of(
                () -> orderService.lockInOrder(a, b, 1000),
                () -> orderService.lockInOrder(b, a, 1000)));
        return Map.of("result", "ok");
    }

    private void runConcurrently(int count, Runnable task) {
        List<Runnable> tasks = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            tasks.add(task);
        }
        runTasks(tasks);
    }

    /** 모든 작업을 동시에 실행하고, 하나라도 실패하면 첫 번째 원인 예외를 그대로 던진다 */
    private void runTasks(List<Runnable> tasks) {
        try (ExecutorService executor = Executors.newFixedThreadPool(tasks.size())) {
            List<CompletableFuture<Void>> futures = tasks.stream()
                    .map(t -> CompletableFuture.runAsync(t, executor))
                    .toList();
            for (CompletableFuture<Void> f : futures) {
                try {
                    f.join();
                } catch (CompletionException e) {
                    if (e.getCause() instanceof RuntimeException re) {
                        throw re;
                    }
                    throw e;
                }
            }
        }
    }
}
