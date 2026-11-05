// [Build prompt] 시스템 프롬프트(파일) + 런북(파일) + 컨텍스트 → OpenAI 요청
// mode: runOnceForEachItem
const fs = require('fs');
const ctx = $json;

const read = (path) => {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (e) {
    return null;
  }
};

const systemPrompt = (read('/prompts/alert-analysis.md') ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
const runbook = read(`/runbooks/${ctx.alertname}.md`);
const kst = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }); // yyyy-MM-dd HH:mm:ss

const user = [
  '## 알럿',
  `- 알럿명: ${ctx.alertname}`,
  `- severity: ${ctx.severity}`,
  `- error_type: ${ctx.error_type}`,
  `- 발생 시각(KST): ${kst(ctx.startsAt)}`,
  `- summary: ${ctx.annotations.summary ?? ''}`,
  `- description: ${ctx.annotations.description ?? ''}`,
  '',
  '## 에러 로그',
  ctx.log
    ? [
        `- 로그 시각: ${ctx.log.time}`,
        `- 요청: ${ctx.log.method ?? '-'} ${ctx.log.requestURI ?? '-'} (traceId=${ctx.log.traceId ?? '-'})`,
        `- 메시지: ${ctx.log.message}`,
        '- 스택트레이스(축약):',
        '```',
        ctx.log.stack,
        '```',
      ].join('\n')
    : '(알럿 시간대에 해당 에러 로그를 찾지 못함)',
  '',
  '## 관련 코드',
  ctx.code_snippet
    ? `${ctx.code.path}:${ctx.code.line} (${ctx.code.className}.${ctx.code.method})\n\`\`\`java\n${ctx.code_snippet}\n\`\`\``
    : '(없음)',
  '',
  '## DB 진단 결과',
  ctx.db_diagnostics ?? '(DB 관련 알럿이 아니어서 조회하지 않음)',
  '',
  '## 런북',
  runbook ?? '(없음)',
].join('\n');

// 출력 구조를 강제하는 JSON 스키마 (Structured Outputs)
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['error_time', 'probable_causes', 'related_code', 'db_findings', 'recommended_actions', 'summary'],
  properties: {
    error_time: { type: 'string', description: 'KST, yyyy-MM-dd HH:mm:ss' },
    probable_causes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cause', 'confidence', 'evidence'],
        properties: {
          cause: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string' },
        },
      },
    },
    related_code: {
      type: 'object',
      additionalProperties: false,
      required: ['file', 'line', 'explanation'],
      properties: {
        file: { type: 'string' },
        line: { type: 'integer' },
        explanation: { type: 'string' },
      },
    },
    db_findings: { type: 'string' },
    recommended_actions: {
      type: 'object',
      additionalProperties: false,
      required: ['immediate', 'permanent'],
      properties: {
        immediate: { type: 'array', items: { type: 'string' } },
        permanent: { type: 'array', items: { type: 'string' } },
      },
    },
    summary: { type: 'string' },
  },
};

return {
  json: {
    ctx,
    openai_request: {
      model: $env.OPENAI_MODEL || 'gpt-4.1-mini',
      max_completion_tokens: 1500,
      response_format: { type: 'json_schema', json_schema: { name: 'alert_analysis', strict: true, schema } },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: user },
      ],
    },
  },
};
