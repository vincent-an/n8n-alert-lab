// [Extract error context] Loki 로그 + 앱 커밋 SHA → 분석용 컨텍스트
// mode: runOnceForEachItem
const alert = $('Normalize alerts').item.json;
const loki = $('Query Loki').item.json;
const info = $('Get app info').item.json;

const OWNER = $env.GITHUB_OWNER;
const REPO = $env.GITHUB_REPO;
const PKG = 'com.example.alertlab.';

// ---- 1. 로그 중 스택트레이스가 있는 가장 최근 것 선택
const entries = [];
for (const stream of loki?.data?.result ?? []) {
  for (const [ts, line] of stream.values ?? []) {
    try {
      entries.push({ ts: Number(String(ts).slice(0, 13)), ...JSON.parse(line) });
    } catch (e) {
      // JSON 이 아닌 로그는 무시
    }
  }
}
entries.sort((x, y) => y.ts - x.ts);
const log = entries.find((e) => e.stack_trace) ?? entries[0] ?? null;

// ---- 2. 민감정보 마스킹 (외부 LLM 으로 나가기 전)
const mask = (s) =>
  String(s ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/(Bearer\s+)[\w\-.=]+/gi, '$1<token>')
    .replace(/\b(sk|ghp|gho|github_pat|xox[abp])[-_][\w-]{10,}/g, '<secret>')
    .replace(/(password|passwd|pwd|secret|token)(["']?\s*[:=]\s*["']?)[^\s"',;]+/gi, '$1$2<masked>');

// ---- 3. 스택 축약: 상위 20줄 + 우리 패키지 프레임 + Caused by
const stackLines = String(log?.stack_trace ?? '').split('\n').map((l) => l.replace(/\r$/, ''));
const kept = [];
stackLines.forEach((l, i) => {
  const ours = l.includes(`at ${PKG}`) && !l.includes('$$');
  if (i < 20 || ours || l.startsWith('Caused by')) kept.push(l);
});
const stack = mask(kept.slice(0, 40).join('\n'));

// ---- 4. 우리 코드의 첫 프레임 → 파일 경로·라인
const frameRe = /at (com\.example\.alertlab\.[\w.$]+)\.([\w$<>]+)\(([\w$]+\.java):(\d+)\)/;
let frame = null;
for (const l of stackLines) {
  const m = l.match(frameRe);
  if (m && !m[1].includes('$$')) {
    const outerClass = m[1].split('$')[0];
    frame = {
      className: m[1],
      method: m[2],
      line: Number(m[4]),
      path: `src/main/java/${outerClass.replace(/\./g, '/')}.java`,
    };
    break;
  }
}

// ---- 5. 배포 커밋 SHA 로 고정한 링크 (SHA 가 없으면 main)
const commitId = info?.git?.commit?.id;
const sha = (typeof commitId === 'string' ? commitId : commitId?.full) || 'main';
const code = frame
  ? {
      ...frame,
      sha,
      raw_url: `https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${frame.path}`,
      permalink: `https://github.com/${OWNER}/${REPO}/blob/${sha}/${frame.path}#L${frame.line}`,
    }
  : null;

return {
  json: {
    ...alert,
    // 알럿 라벨에 error_type 이 없거나 부정확할 수 있으므로, 실제 로그에 기록된 값을 우선한다
    error_type: log?.error_type || alert.error_type,
    log: log && {
      time: log['@timestamp'],
      message: mask(log.message),
      logger: log.logger_name,
      traceId: log.traceId ?? null,
      method: log.method ?? null,
      requestURI: log.requestURI ?? null,
      error_type: log.error_type ?? null,
      stack,
    },
    log_count: entries.length,
    code,
  },
};
