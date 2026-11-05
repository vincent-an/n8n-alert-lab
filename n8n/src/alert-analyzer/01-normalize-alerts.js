// [Normalize alerts] Grafana 웹훅 payload → 알럿 1건당 1 item
// mode: runOnceForAllItems
const body = $input.first().json.body ?? {};
const alerts = body.alerts ?? [];

const BASE = '{app="alertlab", level="ERROR"}';

// 알럿 종류별로 "원인 로그" 를 찾는 Loki 쿼리를 다르게 잡는다
function lokiQueryFor(alertname, errorType) {
  switch (alertname) {
    case 'DbLockContention':
      return `${BASE} |~ "(?i)deadlock|lock wait timeout"`;
    case 'HikariPending':
      return `${BASE} |~ "Connection is not available"`;
    case 'AppErrorLog':
    case 'AppErrorBurst':
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
