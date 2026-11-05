// [Summarize DB diagnostics] 진단 쿼리 결과를 LLM 입력용 텍스트로 요약
// mode: runOnceForAllItems  (진단 결과는 DB 전체 상태라 알럿 수와 무관하게 한 번만 조회됨)
const rows = (name) =>
  $(name)
    .all()
    .map((i) => i.json)
    .filter((r) => r && Object.keys(r).length > 0);

const table = (title, list) =>
  list.length === 0
    ? `### ${title}\n(없음)`
    : `### ${title}\n` + list.map((r) => '- ' + JSON.stringify(r)).join('\n');

// SHOW ENGINE INNODB STATUS 에서 최근 데드락 섹션만 추출
const statusText = rows('Diag: innodb status')[0]?.Status ?? '';
const m = statusText.match(/LATEST DETECTED DEADLOCK\n-+\n([\s\S]*?)\n-{4,}\n[A-Z ]+\n-{4,}/);
const deadlock = m ? m[1].slice(0, 3000) : '(최근 감지된 데드락 없음)';

const summary = [
  table('실행 중인 쿼리 (information_schema.PROCESSLIST, Sleep 제외)', rows('Diag: processlist')),
  table('열린 트랜잭션 (information_schema.innodb_trx)', rows('Diag: innodb trx')),
  table('락 대기 관계 (performance_schema.data_lock_waits)', rows('Diag: lock waits')),
  table('인덱스 (alertlab 스키마)', rows('Diag: indexes')),
  `### 최근 데드락 (SHOW ENGINE INNODB STATUS)\n${deadlock}`,
].join('\n\n');

return $('Build code snippet')
  .all()
  .filter((i) => i.json.error_type === 'db')
  .map((i) => ({ json: { ...i.json, db_diagnostics: summary } }));
