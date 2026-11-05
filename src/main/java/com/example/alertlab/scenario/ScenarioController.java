package com.example.alertlab.scenario;

import com.example.alertlab.common.ErrorResponse;
import com.example.alertlab.order.Order;
import com.example.alertlab.order.OrderSeeder;
import com.example.alertlab.order.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Scenarios", description = "알럿 파이프라인 검증용 에러 재현 API — 500 응답이 **의도된 결과**")
@RestController
@RequestMapping("/scenarios")
public class ScenarioController {

    private static final String JSON = "application/json";

    private final OrderService orderService;

    public ScenarioController(OrderService orderService) {
        this.orderService = orderService;
    }

    @Operation(
            summary = "1. NPE 발생 (error_type=app)",
            description = """
                    memo 가 null 인 주문(`NO-MEMO`)의 메모 미리보기를 조회해 `NullPointerException` 을 발생시킨다.
                    - 알럿: **AppErrorLog** 🟡 minor
                    - n8n: DB 진단 없이 코드 스니펫(`OrderService.getMemoPreview`) 중심으로 분석
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "500", description = "의도된 실패 — NullPointerException",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorResponse.class),
                            examples = @ExampleObject(value = """
                                    {"error": "NullPointerException", "traceId": "3f9c2a7b1d4e5f60"}"""))),
            @ApiResponse(responseCode = "200", description = "(발생하지 않음) memo 가 채워진 경우의 미리보기 문자열",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = String.class)))
    })
    @PostMapping("/npe")
    public String npe() {
        return orderService.getMemoPreview(OrderSeeder.NO_MEMO_ORDER);
    }

    @Operation(
            summary = "2. 중복 키 위반 (error_type=db)",
            description = """
                    이미 존재하는 주문번호(`NO-MEMO`)로 주문을 저장해 unique 제약(`order_no`) 위반을 발생시킨다.
                    - 예외: `DataIntegrityViolationException` (MySQL `Duplicate entry`)
                    - 알럿: **AppErrorLog** 🟡 minor
                    - n8n: DB 진단(인덱스 목록 포함)이 함께 붙는다
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "500", description = "의도된 실패 — DataIntegrityViolationException",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorResponse.class),
                            examples = @ExampleObject(value = """
                                    {"error": "DataIntegrityViolationException", "traceId": "3f9c2a7b1d4e5f60"}"""))),
            @ApiResponse(responseCode = "200", description = "(발생하지 않음) 저장된 주문",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = Order.class)))
    })
    @PostMapping("/duplicate")
    public Object duplicate() {
        return orderService.create(OrderSeeder.NO_MEMO_ORDER, "중복 주문", 1);
    }

    @Operation(
            summary = "3. 슬로우 쿼리 → 실행 시간 초과 (error_type=db)",
            description = """
                    1억 행을 세는 재귀 CTE 를 `MAX_EXECUTION_TIME(2000)` 힌트로 실행해 2초 후 MySQL 이 강제 중단시킨다.
                    - 예외: `JpaSystemException` ← MySQL `ERROR 3024` (maximum statement execution time exceeded)
                    - 응답까지 약 2초 소요
                    - 알럿: **AppErrorLog** 🟡 minor
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "500", description = "의도된 실패 — 쿼리 실행 시간 초과",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorResponse.class),
                            examples = @ExampleObject(value = """
                                    {"error": "JpaSystemException", "traceId": "3f9c2a7b1d4e5f60"}"""))),
            @ApiResponse(responseCode = "200", description = "(발생하지 않음) 집계 결과",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = Long.class)))
    })
    @PostMapping("/slow-query")
    public Object slowQuery() {
        return orderService.slowQuery();
    }

    @Operation(
            summary = "4. 커넥션 풀 고갈 (error_type=db)",
            description = """
                    풀 크기(3)보다 많은 스레드가 `durationSeconds` 동안 커넥션을 계속 요구한다.
                    커넥션을 얻지 못한 스레드는 2초(connection-timeout) 후 실패한다.
                    - 예외: `CannotCreateTransactionException` ← `Connection is not available, request timed out`
                    - 기본값 기준 응답까지 **약 45초** 소요
                    - 알럿: **HikariPending** 🔴 critical (대기가 scrape 주기 15초보다 길게 이어져야 잡힘), Http5xxRatio
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "500", description = "의도된 실패 — 커넥션 획득 타임아웃",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorResponse.class),
                            examples = @ExampleObject(value = """
                                    {"error": "CannotCreateTransactionException", "traceId": "3f9c2a7b1d4e5f60"}"""))),
            @ApiResponse(responseCode = "200", description = "모든 스레드가 커넥션을 얻은 경우 (concurrency 가 풀 크기 이하일 때)",
                    content = @Content(mediaType = JSON, examples = @ExampleObject(value = """
                            {"result": "ok"}""")))
    })
    @PostMapping("/pool-exhaustion")
    public Object poolExhaustion(
            @Parameter(description = "동시에 커넥션을 요구할 스레드 수 (풀 크기 3 초과 시 고갈)", example = "10")
            @RequestParam(defaultValue = "10") int concurrency,
            @Parameter(description = "커넥션 1개를 붙잡고 있는 시간(초) — `SELECT SLEEP(n)`", example = "5")
            @RequestParam(defaultValue = "5") int holdSeconds,
            @Parameter(description = "풀 고갈 상태를 유지할 전체 시간(초)", example = "40")
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

    @Operation(
            summary = "5. 데드락 (error_type=db)",
            description = """
                    두 트랜잭션이 주문 `LOCK-A`, `LOCK-B` 를 서로 반대 순서로 `SELECT ... FOR UPDATE` 한다.
                    MySQL 이 데드락을 감지해 한쪽을 롤백한다.
                    - 예외: `CannotAcquireLockException` (`Deadlock found when trying to get lock`)
                    - 알럿: **DbLockContention** 🔴 critical
                    - n8n: `SHOW ENGINE INNODB STATUS` 의 LATEST DETECTED DEADLOCK 이 DB 진단에 포함
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "500", description = "의도된 실패 — 데드락으로 한 트랜잭션 롤백",
                    content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorResponse.class),
                            examples = @ExampleObject(value = """
                                    {"error": "CannotAcquireLockException", "traceId": "3f9c2a7b1d4e5f60"}"""))),
            @ApiResponse(responseCode = "200", description = "타이밍이 어긋나 데드락이 발생하지 않은 경우 (드묾)",
                    content = @Content(mediaType = JSON, examples = @ExampleObject(value = """
                            {"result": "ok"}""")))
    })
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
