// [Build code snippet] GitHub 에서 받은 소스(실패 시 로컬 마운트 소스)에서 ±15줄 추출
// mode: runOnceForEachItem
const fs = require('fs');

const ctx = $('Extract error context').item.json;
const res = $json; // Fetch source 의 fullResponse (responseFormat=text): { statusCode, headers, data }
const RADIUS = 15;

if (!ctx.code) {
  return { json: { ...ctx, code_snippet: null } };
}

let source = null;
let from = null;
const body = typeof res?.data === 'string' ? res.data : res?.body;
if (res?.statusCode === 200 && typeof body === 'string') {
  source = body;
  from = 'github';
} else {
  // 아직 push 전이거나 SHA 가 GitHub 에 없을 때: compose 가 마운트한 로컬 src 사용
  try {
    source = fs.readFileSync(`/repo-src/${ctx.code.path.replace(/^src\//, '')}`, 'utf8');
    from = 'local';
  } catch (e) {
    source = null;
  }
}

let snippet = null;
if (source) {
  const lines = source.split('\n');
  const start = Math.max(1, ctx.code.line - RADIUS);
  const end = Math.min(lines.length, ctx.code.line + RADIUS);
  snippet = [];
  for (let n = start; n <= end; n++) {
    const marker = n === ctx.code.line ? '>>' : '  ';
    snippet.push(`${marker} ${String(n).padStart(4)} | ${lines[n - 1].replace(/\r$/, '')}`);
  }
  snippet = snippet.join('\n');
}

return { json: { ...ctx, code_snippet: snippet, code_source: from } };
