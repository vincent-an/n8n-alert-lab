// [Render comment] LLM 리뷰 JSON → PR 코멘트 마크다운 + Slack 요약
// mode: runOnceForEachItem
const { ctx, llm_request } = $('Build review prompt').first().json;
const res = $json;

let review = null;
let failure = null;
try {
  review = JSON.parse(res.choices[0].message.content);
} catch (e) {
  failure = res?.error?.message ?? 'LLM 응답을 해석하지 못했습니다.';
}

const sha7 = ctx.pr.head_sha.slice(0, 7);
const ORDER = ['치명적', '권장', '사소함'];
const ICON = { 치명적: '🔴', 권장: '🟠', 사소함: '🟡' };
const lineLink = (f) =>
  f.line > 0
    ? `[\`${f.file}:${f.line}\`](https://github.com/${ctx.repo}/blob/${ctx.pr.head_sha}/${f.file}#L${f.line})`
    : `\`${f.file}\``;

const out = [];
out.push(`## 🤖 셀프 리뷰 봇`);
out.push(
  `> 커밋 \`${sha7}\` · 리뷰한 파일 ${ctx.diff.included.length}/${ctx.diff.total_files}개 (${ctx.diff.lines}줄) · ${llm_request.model}`,
);
out.push('');

let criticalCount = 0;

if (!review) {
  out.push(`⚠️ **리뷰를 생성하지 못했어요.** ${failure}`);
  out.push('');
  out.push('새 커밋을 push하면 다시 시도해요.');
} else {
  const counts = Object.fromEntries(ORDER.map((s) => [s, review.findings.filter((f) => f.severity === s).length]));
  criticalCount = counts['치명적'];

  out.push('### 요약');
  out.push(review.summary);
  out.push('');
  out.push(`**결과**: ${ORDER.map((s) => `${ICON[s]} ${s} ${counts[s]}`).join(' · ')}`);

  for (const sev of ORDER) {
    const list = review.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push('');
    out.push(`### ${ICON[sev]} ${sev}`);
    for (const f of list) {
      out.push('');
      out.push(`**[${sev}] ${f.title}**`);
      out.push(`- 위치: ${lineLink(f)} · 분류: ${f.category}`);
      out.push(`- 이유: ${f.reason}`);
      out.push(`- 개선 방향: ${f.suggestion}`);
    }
  }
  if (!review.findings.length) {
    out.push('');
    out.push('지적할 문제를 찾지 못했어요. ✅');
  }
}

if (ctx.diff.truncated || ctx.diff.more_files_maybe) {
  out.push('');
  out.push(
    `> ⚠️ **일부만 리뷰했어요.** ${ctx.diff.truncated ? '줄 수 예산을 넘는 파일은 건너뛰었어요. ' : ''}${ctx.diff.more_files_maybe ? '변경 파일이 100개 이상이라 나머지는 조회하지 않았어요.' : ''}`,
  );
}
if (ctx.diff.skipped.length) {
  out.push('');
  out.push(`<details><summary>리뷰에서 제외한 파일 ${ctx.diff.skipped.length}개</summary>`);
  out.push('');
  for (const s of ctx.diff.skipped) out.push(`- \`${s.file}\` — ${s.why}`);
  out.push('');
  out.push('</details>');
}

out.push('');
out.push('---');
out.push('<sub>자동 생성된 리뷰예요. 판단과 결정은 사람이 해요. 기준: <code>docs/review-guide.md</code></sub>');

return {
  json: {
    comment_body: out.join('\n'),
    critical_count: criticalCount,
    slack: {
      text: `🔴 PR 셀프 리뷰: 치명적 이슈 ${criticalCount}건 — <${ctx.pr.html_url}|#${ctx.pr.number} ${ctx.pr.title}> (\`${sha7}\`)`,
    },
  },
};
