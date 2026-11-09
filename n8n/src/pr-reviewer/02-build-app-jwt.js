// [Build App JWT] GitHub App 개인키로 JWT(RS256) 서명 → 다음 블록이 설치 토큰(1시간)으로 교환한다
// mode: runOnceForEachItem
// JWT 는 10분 이내만 유효하고, 시계 오차 대비로 iat 를 60초 앞당긴다
const crypto = require('crypto');
const fs = require('fs');

// 실행 1번 = PR 1건이므로 .first() 로 참조한다 (중간의 "전체 item 모드" 블록을 지나도 안전)
const ctx = $('Verify & filter').first().json;
const pem = fs.readFileSync('/secrets/github-app.pem', 'utf8');
const appId = $env.GITHUB_APP_ID;
if (!appId) throw new Error('GITHUB_APP_ID is not configured');
if (!ctx.installation_id) throw new Error('installation id is missing in the webhook payload');

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iat: now - 60, exp: now + 540, iss: appId })}`;
const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(pem, 'base64url');

return { json: { installation_id: ctx.installation_id, jwt: `${unsigned}.${signature}` } };
