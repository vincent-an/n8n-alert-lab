// [Build Slack message] LLM 분석 결과 + 컨텍스트 → Slack Block Kit
// mode: runOnceForEachItem
const ctx = $('Build prompt').item.json.ctx;
const res = $json;

let ai = null;
let aiError = null;
try {
  ai = JSON.parse(res.choices[0].message.content);
} catch (e) {
  aiError = res?.error?.message ?? 'LLM 응답을 해석하지 못했습니다.';
}

const SEV = {
  critical: { icon: '🔴', label: 'CRITICAL' },
  major: { icon: '🟠', label: 'MAJOR' },
  minor: { icon: '🟡', label: 'MINOR' },
};
const CONF = { high: '🟢 high', medium: '🟡 medium', low: '⚪ low' };
const sev = SEV[ctx.severity] ?? SEV.minor;
const kst = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }); // yyyy-MM-dd HH:mm:ss
const cut = (s, n = 2900) => (s && s.length > n ? s.slice(0, n) + '…' : s);
const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text: cut(text) } });

const blocks = [];
blocks.push({
  type: 'header',
  text: { type: 'plain_text', text: `${sev.icon} [${sev.label}] ${ctx.alertname}`, emoji: true },
});
blocks.push(section(`*${ctx.annotations.summary ?? ''}*`));
blocks.push({
  type: 'section',
  fields: [
    { type: 'mrkdwn', text: `*🕐 에러 시간*\n${ai?.error_time || kst(ctx.log?.time ?? ctx.startsAt)}` },
    { type: 'mrkdwn', text: `*🏷️ 서비스 / 유형*\n${ctx.service} / ${ctx.error_type}` },
    { type: 'mrkdwn', text: `*🌐 요청*\n${ctx.log ? `${ctx.log.method ?? '-'} ${ctx.log.requestURI ?? '-'}` : '-'}` },
    { type: 'mrkdwn', text: `*🔎 traceId*\n\`${ctx.log?.traceId ?? '-'}\`` },
  ],
});
blocks.push({ type: 'divider' });

if (ai) {
  const causes = ai.probable_causes
    .map((c, i) => `${i + 1}. *${c.cause}*  (${CONF[c.confidence] ?? c.confidence})\n      ↳ 근거: ${c.evidence}`)
    .join('\n');
  blocks.push(section(`*🧐 추정 원인*\n${causes}`));
} else {
  blocks.push(section(`*⚠️ AI 분석 실패*\n${aiError}\n원본 로그: ${ctx.log?.message ?? '-'}`));
}

if (ctx.code) {
  const link = `<${ctx.code.permalink}|${ctx.code.path.split('/').pop()}:${ctx.code.line}>`;
  const around = (ctx.code_snippet ?? '')
    .split('\n')
    .filter((l) => {
      const n = Number(l.slice(2, 7));
      return Math.abs(n - ctx.code.line) <= 4;
    })
    .join('\n');
  const explain = ai?.related_code?.explanation ? `\n${ai.related_code.explanation}` : '';
  blocks.push(section(`*💻 관련 코드* ${link} — \`${ctx.code.method}()\`${explain}${around ? `\n\`\`\`${around}\`\`\`` : ''}`));
}

if (ctx.error_type === 'db' && ai?.db_findings) {
  blocks.push(section(`*🗄️ DB 진단*\n${ai.db_findings}`));
}

if (ai) {
  const list = (arr) => (arr.length ? arr.map((s) => `• ${s}`).join('\n') : '• -');
  blocks.push(
    section(
      `*🛠️ 권장 조치*\n*⚡ 즉시*\n${list(ai.recommended_actions.immediate)}\n*🔧 근본*\n${list(ai.recommended_actions.permanent)}`,
    ),
  );
  blocks.push(section(`*📝 분석 요약*\n${ai.summary}`));
}

const buttons = [];
const btn = (text, url) => url && buttons.push({ type: 'button', text: { type: 'plain_text', text, emoji: true }, url });
btn('📊 대시보드', ctx.annotations.dashboard_url);
btn('📜 로그 보기', ctx.annotations.grafana_explore_url);
btn('📘 런북', ctx.annotations.runbook_url);
btn('💻 코드', ctx.code?.permalink);
if (buttons.length) blocks.push({ type: 'actions', elements: buttons });

blocks.push({
  type: 'context',
  elements: [
    {
      type: 'mrkdwn',
      text: `🤖 n8n alert-analyzer · ${$('Build prompt').item.json.llm_request.model} · 코드 출처: ${ctx.code_source ?? '-'} · 로그 ${ctx.log_count}건 조회`,
    },
  ],
});

const mention = ctx.severity === 'critical' ? '<!here> ' : '';
return {
  json: {
    slack: {
      text: `${mention}${sev.icon} [${sev.label}] ${ctx.alertname} — ${ctx.annotations.summary ?? ''}`,
      blocks,
    },
  },
};
