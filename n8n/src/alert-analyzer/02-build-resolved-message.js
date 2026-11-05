// [Build resolved message] resolved 알럿은 LLM 분석 없이 짧은 해제 메시지만
// mode: runOnceForEachItem
const a = $json;
const kst = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }); // yyyy-MM-dd HH:mm:ss

const text = `✅ *[RESOLVED] ${a.alertname}* (${a.severity}) — ${a.annotations.summary ?? ''}`;
return {
  json: {
    slack: {
      text,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text } },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `🕐 발생 ${kst(a.startsAt)} → 해제 ${kst(a.endsAt)}` }],
        },
      ],
    },
  },
};
