// [Normalize alerts] Grafana 웹훅 payload → 알럿 1건당 1 item
// mode: runOnceForAllItems
const body = $input.first().json.body ?? {};
const alerts = body.alerts ?? [];

const BASE = '{app="alertlab", level="ERROR"}';

// 전용 알럿(DbLockContention, HikariPending)이 담당하는 로그.
// infra/grafana/provisioning/alerting/rules.yml 의 AppErrorLog 규칙이 제외하는 조건과 반드시 같아야 한다.
// 다르면 알럿은 A 때문에 떴는데 분석은 B 로그를 보게 된다.
const DEDICATED_ALERT_LOGS = '(?i)deadlock|lock wait timeout|Connection is not available';

// 알럿 종류별로 "원인 로그" 를 찾는 Loki 쿼리를 다르게 잡는다
function lokiQueryFor(alertname, errorType) {
  switch (alertname) {
    case 'DbLockContention':
      return `${BASE} |~ "(?i)deadlock|lock wait timeout"`;
    case 'HikariPending':
      return `${BASE} |~ "Connection is not available"`;
    case 'AppErrorLog': {
      // 규칙과 동일하게 전용 알럿 로그를 제외 (라인 필터는 | json 앞에 와야 한다)
      const filtered = `${BASE} !~ "${DEDICATED_ALERT_LOGS}"`;
      return errorType ? `${filtered} | json | error_type="${errorType}"` : filtered;
    }
    case 'AppErrorBurst':
      // 규칙이 모든 ERROR 로그를 세므로 제외 조건 없음
      return errorType ? `${BASE} | json | error_type="${errorType}"` : BASE;
    default:
      return BASE;
  }
}

// Grafana 는 알럿 규칙 프로비저닝 파일의 ${VAR} 를 치환하지 않으므로 여기서 채운다 (예: runbook_url)
const fillEnv = (annotations) =>
  Object.fromEntries(
    Object.entries(annotations).map(([k, v]) => [
      k,
      String(v).replace(/\$\{(GITHUB_OWNER|GITHUB_REPO)\}/g, (_, name) => $env[name] ?? ''),
    ]),
  );

return alerts.map((a) => {
  const labels = a.labels ?? {};
  const startsAt = a.startsAt ?? new Date().toISOString();
  return {
    json: {
      status: a.status, // firing | resolved
      alertname: labels.alertname ?? 'unknown',
      severity: labels.severity ?? 'minor',
      error_type: labels.error_type || 'app',
      service: labels.service ?? 'alertlab',
      labels,
      annotations: fillEnv(a.annotations ?? {}),
      startsAt,
      endsAt: a.endsAt,
      fingerprint: a.fingerprint,
      values: a.values ?? {},
      loki: {
        query: lokiQueryFor(labels.alertname, labels.error_type),
        start: new Date(Date.parse(startsAt) - 10 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
    },
  };
});
