// n8n 워크플로 JSON 생성기
// Code 노드의 JS 는 n8n/src/** 에 일반 파일로 두고(리뷰·diff 가 쉬움), 이 스크립트로 import 용 JSON 을 만든다.
//   사용: node n8n/build-workflows.mjs   → n8n/workflows/*.json 갱신
// 주의: 비밀값은 절대 여기 넣지 않는다. URL·키는 $env 또는 n8n Credential 로만 참조.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(root, 'src', p), 'utf8');

const CRED = {
  diag: { mySql: { id: 'mysqlDiagCred001', name: 'MySQL diag (read-only)' } },
  ops: { mySql: { id: 'mysqlOpsCred0001', name: 'MySQL ops' } },
  // OpenAI 호환 API 공통: Authorization: Bearer <LLM_API_KEY>
  llm: { httpHeaderAuth: { id: 'llmApiCred000001', name: 'LLM API (Bearer)' } },
};

let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  name,
  type,
  typeVersion,
  position,
  parameters,
  ...extra,
});

const code = (name, position, file, mode = 'runOnceForEachItem') =>
  node(name, 'n8n-nodes-base.code', 2, position, { mode, jsCode: src(file) });

const ifNode = (name, position, leftValue, rightValue, type = 'string') =>
  node(name, 'n8n-nodes-base.if', 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: `cond-${name}`,
          leftValue,
          rightValue,
          operator: { type, operation: 'equals' },
        },
      ],
      combinator: 'and',
    },
    options: {},
  });

const mysql = (name, position, cred, query, queryReplacement, extra = {}) =>
  node(
    name,
    'n8n-nodes-base.mySql',
    2.4,
    position,
    { operation: 'executeQuery', query, options: queryReplacement ? { queryReplacement } : {} },
    { credentials: cred, ...extra },
  );

const diag = (name, position, query) =>
  mysql(name, position, CRED.diag, query, null, { executeOnce: true, alwaysOutputData: true });

// 연결 정의 헬퍼: [from, to] 또는 [from, to, outputIndex]
const connect = (pairs) => {
  const c = {};
  for (const [from, to, out = 0] of pairs) {
    c[from] ??= { main: [] };
    while (c[from].main.length <= out) c[from].main.push([]);
    c[from].main[out].push({ node: to, type: 'main', index: 0 });
  }
  return c;
};

// =====================================================================
// 1단계: alert-analyzer
// =====================================================================
const D = 'alert-analyzer/';
const alertNodes = [
  node('Grafana Alert Webhook', 'n8n-nodes-base.webhook', 2.1, [0, 300], {
    httpMethod: 'POST',
    path: 'grafana-alert',
    responseMode: 'onReceived',
    options: {},
  }, { webhookId: 'grafana-alert' }),

  code('Normalize alerts', [220, 300], D + '01-normalize-alerts.js', 'runOnceForAllItems'),
  ifNode('Firing?', [440, 300], '={{ $json.status }}', 'firing'),
  code('Build resolved message', [660, 520], D + '02-build-resolved-message.js'),

  mysql('Check dedup', [660, 200], CRED.ops,
    'SELECT COUNT(*) AS recent FROM alert_dedup WHERE fingerprint = $1 AND last_analyzed_at > NOW() - INTERVAL 10 MINUTE',
    '={{ $json.fingerprint }}'),
  ifNode('Not analyzed in 10m?', [880, 200], '={{ Number($json.recent) }}', 0, 'number'),
  mysql('Mark analyzed', [1100, 200], CRED.ops,
    'INSERT INTO alert_dedup (fingerprint, alertname, last_analyzed_at) VALUES ($1, $2, NOW()) ' +
      'ON DUPLICATE KEY UPDATE alertname = VALUES(alertname), last_analyzed_at = NOW()',
    "={{ $('Normalize alerts').item.json.fingerprint }},{{ $('Normalize alerts').item.json.alertname }}"),

  node('Query Loki', 'n8n-nodes-base.httpRequest', 4.2, [1320, 200], {
    url: 'http://loki:3100/loki/api/v1/query_range',
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: 'query', value: "={{ $('Normalize alerts').item.json.loki.query }}" },
        { name: 'start', value: "={{ $('Normalize alerts').item.json.loki.start }}" },
        { name: 'end', value: "={{ $('Normalize alerts').item.json.loki.end }}" },
        { name: 'limit', value: '20' },
        { name: 'direction', value: 'backward' },
      ],
    },
    options: { timeout: 10000 },
  }),
  node('Get app info', 'n8n-nodes-base.httpRequest', 4.2, [1540, 200], {
    url: 'http://app:8080/actuator/info',
    options: { timeout: 3000 },
  }, { onError: 'continueRegularOutput' }),

  code('Extract error context', [1760, 200], D + '03-extract-error-context.js'),
  node('Fetch source (GitHub)', 'n8n-nodes-base.httpRequest', 4.2, [1980, 200], {
    url: "={{ $json.code ? $json.code.raw_url : 'https://raw.githubusercontent.com/' + $env.GITHUB_OWNER + '/' + $env.GITHUB_REPO + '/HEAD/README.md' }}",
    options: {
      timeout: 5000,
      response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } },
    },
  }, { onError: 'continueRegularOutput' }),
  code('Build code snippet', [2200, 200], D + '04-build-code-snippet.js'),
  ifNode('DB error?', [2420, 200], '={{ $json.error_type }}', 'db'),

  diag('Diag: processlist', [2640, 0],
    "SELECT ID, USER, DB, COMMAND, TIME, STATE, LEFT(INFO, 300) AS INFO FROM information_schema.PROCESSLIST " +
      "WHERE COMMAND <> 'Sleep' AND USER NOT IN ('n8n_diag', 'event_scheduler') ORDER BY TIME DESC LIMIT 20"),
  diag('Diag: innodb trx', [2860, 0],
    'SELECT trx_id, trx_state, trx_started, TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_sec, ' +
      'trx_rows_locked, trx_tables_locked, LEFT(trx_query, 300) AS trx_query ' +
      'FROM information_schema.innodb_trx ORDER BY trx_started LIMIT 20'),
  diag('Diag: lock waits', [3080, 0],
    'SELECT w.REQUESTING_ENGINE_TRANSACTION_ID AS waiting_trx, w.BLOCKING_ENGINE_TRANSACTION_ID AS blocking_trx, ' +
      'l.OBJECT_SCHEMA, l.OBJECT_NAME, l.INDEX_NAME, l.LOCK_MODE, l.LOCK_DATA ' +
      'FROM performance_schema.data_lock_waits w ' +
      'JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.BLOCKING_ENGINE_LOCK_ID LIMIT 20'),
  diag('Diag: indexes', [3300, 0],
    "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns " +
      "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'alertlab' GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE"),
  diag('Diag: innodb status', [3520, 0], 'SHOW ENGINE INNODB STATUS'),
  code('Summarize DB diagnostics', [3740, 0], D + '05-summarize-db-diagnostics.js', 'runOnceForAllItems'),

  code('Build prompt', [3960, 200], D + '06-build-prompt.js'),
  // OpenAI 호환 Chat Completions — 제공자는 LLM_BASE_URL / LLM_MODEL 환경변수로 교체
  node('LLM analyze', 'n8n-nodes-base.httpRequest', 4.2, [4180, 200], {
    method: 'POST',
    url: '={{ $env.LLM_BASE_URL }}/chat/completions',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.llm_request) }}',
    options: { timeout: 90000 },
  }, {
    credentials: CRED.llm,
    // 무료 등급은 일시적 혼잡(503)·한도 초과(429)가 잦으므로 재시도
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
  }),
  code('Build Slack message', [4400, 200], D + '07-build-slack-message.js'),

  node('Send to Slack', 'n8n-nodes-base.httpRequest', 4.2, [4620, 400], {
    method: 'POST',
    url: '={{ $env.SLACK_WEBHOOK_URL }}',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.slack) }}',
    options: { timeout: 10000 },
  }),
];

const alertWorkflow = {
  id: 'alertAnalyzer001',
  name: 'alert-analyzer (Grafana → LLM 분석 → Slack)',
  active: false,
  nodes: alertNodes,
  connections: connect([
    ['Grafana Alert Webhook', 'Normalize alerts'],
    ['Normalize alerts', 'Firing?'],
    ['Firing?', 'Check dedup', 0],
    ['Firing?', 'Build resolved message', 1],
    ['Build resolved message', 'Send to Slack'],
    ['Check dedup', 'Not analyzed in 10m?'],
    ['Not analyzed in 10m?', 'Mark analyzed', 0],
    ['Mark analyzed', 'Query Loki'],
    ['Query Loki', 'Get app info'],
    ['Get app info', 'Extract error context'],
    ['Extract error context', 'Fetch source (GitHub)'],
    ['Fetch source (GitHub)', 'Build code snippet'],
    ['Build code snippet', 'DB error?'],
    ['DB error?', 'Diag: processlist', 0],
    ['DB error?', 'Build prompt', 1],
    ['Diag: processlist', 'Diag: innodb trx'],
    ['Diag: innodb trx', 'Diag: lock waits'],
    ['Diag: lock waits', 'Diag: indexes'],
    ['Diag: indexes', 'Diag: innodb status'],
    ['Diag: innodb status', 'Summarize DB diagnostics'],
    ['Summarize DB diagnostics', 'Build prompt'],
    ['Build prompt', 'LLM analyze'],
    ['LLM analyze', 'Build Slack message'],
    ['Build Slack message', 'Send to Slack'],
  ]),
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
  pinData: {},
};

mkdirSync(join(root, 'workflows'), { recursive: true });
writeFileSync(join(root, 'workflows', 'alert-analyzer.json'), JSON.stringify(alertWorkflow, null, 2) + '\n');
console.log('written: n8n/workflows/alert-analyzer.json');
