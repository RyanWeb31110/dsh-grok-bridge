#!/usr/bin/env bash
# Local loop: POST a task, watch the simulator finish, assert the signed webhook.
# This does not start dsh. See docs/demo.md for the tailnet version.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f lib/cli.js || ! -f lib/auth.js ]]; then
  npm run build
fi

TOKEN="demo-token-not-a-secret-0123456789"
HMAC="demo-hmac-not-a-secret-0123456789"
OUTBOUND="outbound-token-not-a-secret-01"
BRIDGE_PORT="${BRIDGE_PORT:-18791}"
RECEIVER_PORT="${RECEIVER_PORT:-18792}"
TMP="$(mktemp -d)"
LOG="$TMP/events.jsonl"

cleanup() {
  if [[ -n "${BRIDGE_PID:-}" ]]; then kill "$BRIDGE_PID" 2>/dev/null || true; fi
  if [[ -n "${RECEIVER_PID:-}" ]]; then kill "$RECEIVER_PID" 2>/dev/null || true; fi
  wait "${BRIDGE_PID:-}" 2>/dev/null || true
  wait "${RECEIVER_PID:-}" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

RECEIVER_BIND=127.0.0.1 \
RECEIVER_PORT="$RECEIVER_PORT" \
RECEIVER_TOKEN="$OUTBOUND" \
RECEIVER_HMAC_SECRET="$HMAC" \
RECEIVER_LOG="$LOG" \
node scripts/tailnet-receiver.mjs &
RECEIVER_PID=$!

DSH_GROK_BIND=127.0.0.1 \
DSH_GROK_PORT="$BRIDGE_PORT" \
DSH_GROK_TOKEN="$TOKEN" \
DSH_GROK_STORE="$TMP/tasks.json" \
DSH_GROK_CWD="$ROOT" \
DSH_GROK_OUTBOUND_WEBHOOK_URL="http://127.0.0.1:${RECEIVER_PORT}/dsh-events" \
DSH_GROK_OUTBOUND_TOKEN="$OUTBOUND" \
DSH_GROK_OUTBOUND_HMAC_SECRET="$HMAC" \
DSH_GROK_DEMO_DELAY_MS=150 \
DSH_GROK_HEARTBEAT_MS=0 \
node lib/cli.js &
BRIDGE_PID=$!

ready=0
for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${BRIDGE_PORT}/healthz" >/dev/null \
    && curl -sf "http://127.0.0.1:${RECEIVER_PORT}/healthz" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.1
done
[[ "$ready" == "1" ]]

echo "1/3  POST /v1/tasks"
CREATE="$(curl -sf -X POST "http://127.0.0.1:${BRIDGE_PORT}/v1/tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Say hello from the demo"}')"
printf '%s' "$CREATE" > "$TMP/create.json"
ID="$(CREATE_JSON="$TMP/create.json" node --input-type=module -e 'import { readFileSync } from "node:fs"; const task = JSON.parse(readFileSync(process.env.CREATE_JSON, "utf8")).task; process.stdout.write(task.id)')"
echo "     accepted ${ID}"

echo "2/3  simulator finishes the turn"
STATUS=""
for _ in $(seq 1 50); do
  BODY="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${BRIDGE_PORT}/v1/tasks/${ID}")"
  printf '%s' "$BODY" > "$TMP/task.json"
  STATUS="$(TASK_JSON="$TMP/task.json" node --input-type=module -e 'import { readFileSync } from "node:fs"; process.stdout.write(JSON.parse(readFileSync(process.env.TASK_JSON, "utf8")).task.status)')"
  if [[ "$STATUS" == "completed" ]]; then
    break
  fi
  sleep 0.1
done
echo "     status ${STATUS}"
[[ "$STATUS" == "completed" ]]

echo "3/3  outbound webhook accepted"
found=0
for _ in $(seq 1 50); do
  if [[ -f "$LOG" ]] && grep -q 'task.completed' "$LOG"; then
    found=1
    break
  fi
  sleep 0.1
done
[[ "$found" == "1" ]]
echo "     task.completed signed and stored"
echo "demo ok"
