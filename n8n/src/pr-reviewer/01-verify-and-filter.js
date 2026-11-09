// [Verify & filter] GitHub 웹훅 서명 검증 + 리뷰 대상 판별 → 응답 코드와 리뷰 여부 결정
// mode: runOnceForAllItems
// 웹훅 블록은 raw body 옵션이 켜져 있어야 한다 (서명은 "받은 그대로의 바이트" 로 계산되기 때문)
const crypto = require('crypto');

const ACTIONS = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
const allowed = ($env.REVIEW_ALLOWED_ASSOCIATIONS || 'OWNER')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const headers = $input.first().json.headers ?? {};
const event = headers['x-github-event'];
const delivery = headers['x-github-delivery'];
const signature = String(headers['x-hub-signature-256'] ?? '');

const result = (status, reason, extra = {}) => [
  { json: { respond: { status, body: { ok: status < 300, reason, delivery } }, review: false, event, delivery, reason, ...extra } },
];

// ---- 1. 서명 검증 (HMAC-SHA256, 상수 시간 비교)
const secret = $env.GITHUB_WEBHOOK_SECRET;
if (!secret) return result(500, 'GITHUB_WEBHOOK_SECRET is not configured');

const raw = await this.helpers.getBinaryDataBuffer(0, 'data');
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
// 글자 수가 아니라 "바이트 수" 를 비교해야 한다. 서명 헤더에 멀티바이트 문자가 섞이면 글자 수는 같아도
// 바이트 수가 달라져서 timingSafeEqual 이 예외를 던지고, 401 대신 500 이 된다.
const received = Buffer.from(signature, 'utf8');
const wanted = Buffer.from(expected, 'utf8');
const valid = received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
if (!valid) return result(401, 'invalid signature');

// ---- 2. 이벤트 종류 (App 은 구독하지 않은 installation 이벤트도 받는다)
if (event === 'ping') return result(200, 'pong');
if (event !== 'pull_request') return result(202, `ignored event: ${event}`);

// ---- 3. 리뷰 대상 필터
const payload = JSON.parse(raw.toString('utf8'));
const pr = payload.pull_request;
if (!ACTIONS.includes(payload.action)) return result(202, `ignored action: ${payload.action}`);
if (pr.draft) return result(202, 'draft PR');
if (pr.head?.repo?.full_name !== pr.base?.repo?.full_name) return result(202, 'fork PR');
if (!allowed.includes(pr.author_association)) {
  return result(202, `author_association ${pr.author_association} is not allowed`);
}

return [
  {
    json: {
      respond: { status: 202, body: { ok: true, reason: 'review scheduled', delivery } },
      review: true,
      event,
      delivery,
      action: payload.action,
      repo: payload.repository.full_name,
      installation_id: payload.installation?.id,
      pr: {
        number: pr.number,
        title: pr.title,
        body: String(pr.body ?? '').slice(0, 2000),
        html_url: pr.html_url,
        author: pr.user?.login,
        head_sha: pr.head.sha,
        head_ref: pr.head.ref,
        base_ref: pr.base.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
      },
    },
  },
];
