#!/bin/sh
# n8n 기동 래퍼
# - 크리덴셜: 매 기동마다 .env 값으로 다시 import (같은 id 로 덮어씀 → .env 가 항상 기준)
# - 워크플로: 최초 1회만 import + publish (UI 에서 수정한 내용을 덮어쓰지 않기 위해)
#   다시 import 하려면: docker compose exec n8n rm /home/node/.n8n/.alertlab-imported && docker compose restart n8n
set -e

CREDS=/tmp/alertlab-creds.json
cat > "$CREDS" <<EOF
[
  {"id":"mysqlDiagCred001","name":"MySQL diag (read-only)","type":"mySql",
   "data":{"host":"mysql","port":3306,"database":"alertlab","user":"n8n_diag","password":"${DIAG_DB_PASSWORD}"}},
  {"id":"mysqlOpsCred0001","name":"MySQL ops","type":"mySql",
   "data":{"host":"mysql","port":3306,"database":"ops","user":"n8n_ops","password":"${OPS_DB_PASSWORD}"}},
  {"id":"openAiCred000001","name":"OpenAI","type":"openAiApi",
   "data":{"apiKey":"${OPENAI_API_KEY}"}}
]
EOF
echo "[init] importing credentials from environment"
n8n import:credentials --input="$CREDS"
rm -f "$CREDS"

MARK=/home/node/.n8n/.alertlab-imported
if [ ! -f "$MARK" ]; then
  echo "[init] importing workflows"
  n8n import:workflow --separate --input=/workflows
  for f in /workflows/*.json; do
    id=$(node -e "console.log(require('$f').id)")
    n8n publish:workflow --id="$id"
  done
  touch "$MARK"
fi

exec n8n start
