# n8n-alert-lab

에러가 나면 **Grafana 알럿 → n8n → (로그·코드·DB 진단 수집) → LLM 분석 → Slack** 으로
"에러 시간 / 추정 원인 / 관련 코드 / 권장 조치 / 분석 요약" 을 받아보는 실습 프로젝트.
Sentry 가 하는 일(스택트레이스 + 소스 컨텍스트 + 커밋 연결 + 알림)을 직접 파이프라인으로 만들고,
여기에 LLM 원인 분석과 DB 실시간 진단을 더한다.

```
 Spring Boot ──JSON 로그 파일──▶ Alloy ──push──▶ Loki ─┐
     │  ▲                                              ├──▶ Grafana (대시보드·알럿 규칙)
     │  └──── scrape ──── Prometheus ──────────────────┘          │ webhook
     ▼                                                            ▼
   MySQL ◀── 읽기 전용 진단 쿼리 ─────────────────────────────  n8n ──▶ LLM (Gemini 등)
 (alertlab / ops)                         GitHub raw(코드) ◀──┤
                                                              └──▶ Slack
```

| 구성 | 주소 | 비고 |
|---|---|---|
| app (Spring Boot 3.5 / Java 21) | http://localhost:8080 | `/scenarios/*` 에러 재현 |
| Grafana 13 | http://localhost:3000 | admin / `.env` 의 `GF_ADMIN_PASSWORD` |
| n8n 2.x | http://localhost:5678 | 첫 접속 시 owner 계정 생성 |
| Prometheus | http://localhost:9090 | |
| Loki | http://localhost:3100 | |
| Alloy | http://localhost:12345 | 로그 수집 파이프라인 UI |
| MySQL 8.4 | localhost:**3307** | 로컬 MySQL(3306) 과 충돌 방지 |

---

## 1. 준비

### 1-1. `.env` 작성
```bash
cp .env.example .env
```
- `GITHUB_OWNER` : 내 GitHub 아이디 (코드·런북 링크용)
- `SLACK_WEBHOOK_URL` : Slack 앱 → *Incoming Webhooks* 활성화 → 채널 선택 후 발급된 URL
- `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_REASONING_EFFORT` : **OpenAI 호환** Chat Completions API 설정
  - 기본값은 Google Gemini (AI Studio 에서 무료 등급 키 발급 가능, `gemini-3.5-flash`)
  - OpenAI 등 다른 제공자로 바꿀 때는 이 4줄만 교체 (`.env.example` 의 예시 참고)
  - 변수 이름을 `OPENAI_*` 로 두지 않는 이유: PC 환경변수에 같은 이름이 있으면 docker compose 가 `.env` 보다 우선 적용한다
- 나머지 비밀번호·`N8N_ENCRYPTION_KEY` 는 아무 랜덤 문자열

> `.env` 는 `.gitignore` 대상. 워크플로 JSON 에는 비밀값이 없고 `$env` / n8n Credential 로만 참조한다.

### 1-2. GitHub 리포 연결 (Public)
코드 permalink 는 **배포된 커밋 SHA** 로 고정된다(`/actuator/info` 의 `git.commit.id.full`).
커밋이 GitHub 에 push 되어 있어야 Slack 의 코드 링크가 열린다.
push 전이거나 SHA 가 없으면 n8n 은 로컬 소스(`./src` 마운트)로 스니펫을 만들고 링크는 `main` 으로 대체한다.

```bash
git remote add origin https://github.com/<GITHUB_OWNER>/n8n-alert-lab.git
git push -u origin main
```

## 2. 실행
```bash
docker compose up -d --build
```
- MySQL 은 최초 기동 시 `infra/mysql/init/01-init.sh` 로 스키마·계정 3개(`app` / `n8n_diag` 읽기 전용 / `n8n_ops`) 생성
- n8n 은 `n8n/init/n8n-init.sh` 로 **크리덴셜 3개(매 기동마다 `.env` 기준으로 갱신) + 워크플로(최초 1회) import 와 publish(활성화)** 까지 자동 수행
  - `.env` 를 고친 뒤에는 `docker compose up -d` 만 다시 하면 n8n 이 새 값으로 재생성된다
- Grafana 는 데이터소스·대시보드·알럿 규칙 5개·n8n 웹훅 연락처를 프로비저닝

## 3. 에러 재현 시나리오
```bash
curl -X POST localhost:8080/scenarios/npe              # 1. NPE (app)
curl -X POST localhost:8080/scenarios/duplicate        # 2. 중복 키 (db)
curl -X POST localhost:8080/scenarios/slow-query       # 3. 쿼리 실행시간 초과 (db)
curl -X POST localhost:8080/scenarios/pool-exhaustion  # 4. 커넥션 풀 고갈 (db) — 약 45초 동안 풀을 계속 고갈시킴
curl -X POST localhost:8080/scenarios/deadlock         # 5. 데드락 (db)
```
> PowerShell 에서는 `curl.exe -X POST ...` 또는 `Invoke-RestMethod -Method Post ...`

| 알럿 규칙 | 조건 | severity | 주로 잡히는 시나리오 |
|---|---|---|---|
| AppErrorLog | ERROR 로그 5분 내 1건+ (락·풀 에러 제외) | 🟡 minor | 1, 2, 3 |
| AppErrorBurst | ERROR 로그 5분 내 10건+ | 🟠 major | 반복 호출 |
| Http5xxRatio | 5xx 비율 > 5%, 2분 지속 | 🟠 major | 반복 호출 |
| HikariPending | 커넥션 대기 > 0, 1분 지속 | 🔴 critical (`@here`) | 4 |
| DbLockContention | Deadlock / Lock wait timeout 로그 | 🔴 critical (`@here`) | 5 |

## 4. n8n 워크플로 `alert-analyzer`
```
Webhook → Normalize alerts → Firing?
  ├─ resolved → Build resolved message ─────────────────────────────────────┐
  └─ firing → Check dedup → Not analyzed in 10m? → Mark analyzed            │
       → Query Loki → Get app info → Extract error context(스택 파싱·마스킹)  │
       → Fetch source (GitHub) → Build code snippet(±15줄) → DB error?       │
            ├─ db  → Diag ×5(processlist / innodb_trx / lock waits /        │
            │        indexes / INNODB STATUS) → Summarize DB diagnostics ─┐ │
            └─ app ───────────────────────────────────────────────────────┤ │
       → Build prompt → LLM analyze(JSON 스키마 강제, 실패 시 3회 재시도) → Build Slack message → Send to Slack
```
- **프롬프트 수정**: `n8n/prompts/alert-analysis.md` 를 고치면 다음 실행부터 바로 반영(재import 불필요)
- **런북**: `docs/runbooks/<알럿명>.md` — Slack 버튼 링크 + LLM 입력으로 함께 사용
- **DB 진단은 미리 정해둔 읽기 전용 쿼리만** 실행 (`n8n_diag` 계정: SELECT·PROCESS 권한만)
- **중복 제거**: 같은 fingerprint 는 10분 내 재분석하지 않음 (`ops.alert_dedup`)
- LLM 호출 실패 시에도 로그·코드 정보는 Slack 으로 전달 (⚠️ AI 분석 실패 표시)

### Code 노드 수정 → 재반영
Code 노드의 JS 원본은 `n8n/src/` 에 있고, `n8n/build-workflows.mjs` 가 import 용 JSON 을 만든다.
```bash
node n8n/build-workflows.mjs
docker compose exec n8n rm /home/node/.n8n/.alertlab-imported
docker compose restart n8n
```
> n8n UI 에서 직접 고친 내용은 재import 시 덮어써진다. UI 에서 고쳤다면 해당 JS 를 `n8n/src/` 에도 반영할 것.

## 5. 완료 기준 체크리스트 (1단계)
- [ ] `docker compose up -d --build` 한 번으로 7개 컨테이너 기동 (`docker compose ps`)
- [ ] 시나리오 5개 각각 5분 내 Slack 메시지 수신 — 에러 시간 / 추정 원인(근거·확신도) / 코드 permalink / 권장 조치 / 요약 포함
- [ ] DB 시나리오(2~5)에만 🗄️ DB 진단이 붙고, NPE 에는 없음
- [ ] 같은 알럿 10분 내 재발 시 재분석하지 않음
- [ ] 알럿 해제 시 ✅ RESOLVED 메시지 수신

## 6. 트러블슈팅
- **Loki 헬스체크가 없음**: Loki 이미지는 distroless 라 컨테이너 내부 헬스체크 불가. `curl localhost:3100/ready`
- **runbook_url 의 `${GITHUB_OWNER}`**: Grafana 는 알럿 규칙 프로비저닝 파일에서 환경변수를 치환하지 않는다. n8n `Normalize alerts` 가 채운다
- **Promtail 대신 Alloy**: Promtail 은 2026-03 EOL. 역할(파일 tail → 라벨 → Loki push)은 동일하고 설정은 `infra/alloy/config.alloy`
- **slow-query 가 `SLEEP()` 이 아닌 이유**: `SLEEP()` 은 타임아웃으로 중단돼도 에러 없이 1 을 반환해서 재현이 안 됨 → `MAX_EXECUTION_TIME` 힌트로 무거운 쿼리를 끊는다
- **처음부터 다시**: `docker compose down -v` (DB·로그·n8n 데이터 모두 삭제)

## 다음 단계
- 1.5단계: Slack Bot Token + firing/resolved 스레드 묶기 (`ops.alert_thread` 준비됨)
- 2단계: GitHub PR 웹훅 → 셀프 코드리뷰 AI → PR 코멘트
