# DbLockContention 🔴 critical

데드락(`Deadlock found when trying to get lock`) 또는 락 대기 타임아웃(`Lock wait timeout exceeded`) 발생.

## 확인 순서
1. DB 진단의 `SHOW ENGINE INNODB STATUS` → LATEST DETECTED DEADLOCK 섹션에서 두 트랜잭션이 잡은 락/기다린 락 확인
2. `performance_schema.data_lock_waits` 로 현재 진행 중인 락 대기 관계 확인
3. 코드에서 두 트랜잭션이 **같은 행들을 서로 다른 순서로** 잠그는지 확인

## 대응
- 즉시: 데드락은 MySQL 이 한쪽을 롤백하므로 대부분 자동 해소. 반복되면 해당 기능 호출 빈도 확인
- 근본:
  - 여러 행을 잠글 때 **항상 같은 순서**(예: PK 오름차순)로 잠그기
  - 트랜잭션을 짧게 유지, 잠금 전 불필요한 작업 제거
  - 재시도 가능한 작업이면 `CannotAcquireLockException` 에 대한 제한된 재시도(백오프) 추가
