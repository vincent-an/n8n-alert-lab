// [Build diff] PR 변경 파일 목록 → 리뷰할 diff 텍스트 (제외 규칙 + 줄 수 예산)
// mode: runOnceForAllItems  (앞 HTTP 블록이 파일 배열을 파일 1개 = item 1개로 펼쳐서 넘겨준다)
const ctx = $('Verify & filter').first().json;
const files = $input.all().map((i) => i.json).filter((f) => f && f.filename);

const BUDGET_LINES = 800; // diff 줄 수 예산. 넘는 파일은 통째로 건너뛰고 목록에 남긴다
const PAGE_SIZE = 100; // 파일 목록 조회 1페이지 크기 (이번 버전은 1페이지만 조회)

// 리뷰해도 의미 없는 파일: 잠금 파일, 빌드 산출물, 생성 파일, 바이너리
const EXCLUDES = [
  { re: /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|gradle\.lockfile)$/, why: '잠금 파일' },
  { re: /(^|\/)(build|dist|out|node_modules|\.gradle)\//, why: '빌드 산출물' },
  { re: /(^|\/)gradle\/wrapper\//, why: 'Gradle wrapper' },
  { re: /\.min\.(js|css)$/, why: '압축 파일' },
  { re: /^n8n\/workflows\/.*\.json$/, why: '생성 파일 (n8n/build-workflows.mjs 결과물)' },
  { re: /\.(png|jpe?g|gif|ico|pdf|jar|zip)$/i, why: '바이너리' },
];

const included = [];
const skipped = []; // { file, why }
let used = 0;
const parts = [];

for (const f of files) {
  const rule = EXCLUDES.find((r) => r.re.test(f.filename));
  if (rule) {
    skipped.push({ file: f.filename, why: rule.why });
    continue;
  }
  if (!f.patch) {
    skipped.push({ file: f.filename, why: f.status === 'removed' ? '삭제된 파일' : 'diff 없음 (바이너리 또는 너무 큼)' });
    continue;
  }
  const lines = f.patch.split('\n').length;
  if (used + lines > BUDGET_LINES) {
    skipped.push({ file: f.filename, why: `줄 수 예산(${BUDGET_LINES}줄) 초과` });
    continue;
  }
  used += lines;
  included.push(f.filename);
  parts.push(`### ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n\`\`\`diff\n${f.patch}\n\`\`\``);
}

const truncated = skipped.some((s) => s.why.startsWith('줄 수 예산'));
const moreFilesMaybe = files.length >= PAGE_SIZE;

return [
  {
    json: {
      ...ctx,
      diff: {
        text: parts.join('\n\n'),
        lines: used,
        included,
        skipped,
        truncated,
        more_files_maybe: moreFilesMaybe,
        total_files: files.length,
      },
    },
  },
];
