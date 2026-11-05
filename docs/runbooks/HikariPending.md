# HikariPending 🔴 critical

HikariCP 커넥션을 기다리는 스레드가 1분 이상 존재. 곧 `Connection is not available, request timed out` 로 요청 실패가 이어짐.

## 확인 순서
1. 대시보드 HikariCP 패널: active 가 max 에 붙어 있는지, pending 이 계속 쌓이는지
2. DB 진단: `information_schema.PROCESSLIST` 에서 TIME 이 긴 쿼리 / `innodb_trx` 에서 오래 열린 트랜잭션
3. 애플리케이션에서 트랜잭션 안에 외부 API 호출·Thread.sleep·대용량 처리가 있는지 확인

## 대응
- 즉시: 오래 실행 중인 쿼리가 원인이면 `KILL <id>` 검토 (영향 확인 후)
- 근본:
  - 트랜잭션 범위 축소 (외부 호출을 트랜잭션 밖으로)
  - 슬로우 쿼리 인덱스 튜닝
  - 풀 크기는 마지막 수단. DB max_connections 와 인스턴스 수를 함께 계산할 것
