# AppErrorLog 🟡 minor

애플리케이션에서 처리되지 않은 예외가 ERROR 로그로 기록됨.

## 확인 순서
1. Slack 알림의 traceId 로 Loki 에서 같은 요청의 전체 로그 조회
   `{app="alertlab"} | json | traceId="<traceId>"`
2. 스택트레이스의 첫 우리 코드 프레임(`com.example.alertlab`) 확인
3. 같은 예외가 반복되는지 대시보드 "ERROR 로그 건수" 패널 확인 → 반복되면 AppErrorBurst 런북으로

## 대응
- `NullPointerException`: 어떤 값이 null 인지 메시지(Helpful NPE) 확인 → 입력/DB 데이터 문제인지, 코드의 null 처리 누락인지 구분
- `IllegalArgumentException` 등 입력 검증 예외: 4xx 로 응답해야 할 예외가 500 으로 새고 있는지 확인 (예외 핸들러 매핑)
- 데이터 문제라면 해당 데이터 보정 후, 코드에 방어 로직 추가
