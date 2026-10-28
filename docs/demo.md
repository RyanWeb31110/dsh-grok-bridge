# Demo loop

A minute, end to end, once both machines are on the same tailnet. The script in `scripts/demo.sh` runs the same loop on localhost in a few seconds, with a simulator in place of dsh.

## What you are watching

1. The Grok Bot node POSTs a prompt to the Mac.
2. dsh creates a session, runs the prompt, and writes the task row to disk.
3. When the turn ends, the bridge POSTs `task.completed` back. The bot routine wakes.

```text
Grok Bot node              dsh-grok-bridge           dsh agent            receiver
     |  POST /v1/tasks           |                      |                    |
     |-------------------------->| persist task         |                    |
     |  202 {id, sessionId}      | create + followup    |                    |
     |<--------------------------|--------------------->|                    |
     |                           |                      | turn/end completed |
     |                           |<---------------------|                    |
     |                           | POST task.completed + HMAC                |
     |                           |------------------------------------------>|
```

## Local simulator (no dsh, no model)

```sh
npm install
npm run demo
```

That builds `lib/`, starts `scripts/tailnet-receiver.mjs` on `127.0.0.1:18792`, starts `lib/cli.js` on `127.0.0.1:18791`, POSTs a prompt, polls until `completed`, and checks that the receiver stored a signed `task.completed`. The tokens in the script are obvious placeholders.

`lib/cli.js` is not the plugin. It only finishes the prompt locally so you can see the HTTP contract. The real agent is the Cordis plugin loaded by `dsh`.

## On two tailnet machines

Terminal A, the Mac, after [install](../README.md#install):

```sh
export DSH_GROK_TOKEN="$(openssl rand -hex 32)"
export DSH_GROK_BIND=127.0.0.1
export DSH_GROK_PORT=8791
export DSH_GROK_OUTBOUND_WEBHOOK_URL='http://100.B.B.B:8792/dsh-events'
export DSH_GROK_OUTBOUND_TOKEN="$(openssl rand -hex 32)"
export DSH_GROK_OUTBOUND_HMAC_SECRET="$(openssl rand -hex 32)"
sudo tailscale serve --bg 8791
dsh web
```

Terminal B, the Grok Bot node:

```sh
export RECEIVER_BIND=100.B.B.B
export RECEIVER_PORT=8792
export RECEIVER_TOKEN="$DSH_GROK_OUTBOUND_TOKEN"
export RECEIVER_HMAC_SECRET="$DSH_GROK_OUTBOUND_HMAC_SECRET"
export RECEIVER_LOG="$HOME/dsh-grok-events.jsonl"
node scripts/tailnet-receiver.mjs
```

From B, about ten seconds in:

```sh
curl -sS -X POST "https://<mac>.ts.net/v1/tasks" \
  -H "Authorization: Bearer $DSH_GROK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Summarize git status in one sentence","cwd":"/Users/me/project"}'
```

About twenty seconds later, `GET /v1/tasks/<id>` shows `running`. When the model finishes, the receiver log grows a `task.completed` line and, if you forwarded it, the Grok Bot routine runs. A real model call is the part that takes the rest of the minute; the bridge itself does not wait on a timer.

Steer the same session:

```sh
curl -sS -X POST "https://<mac>.ts.net/v1/tasks/<id>/steer" \
  -H "Authorization: Bearer $DSH_GROK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Focus on untracked files."}'
```

Direct `100.x` URLs work when the bridge is bound to the Tailscale address instead of `tailscale serve`. See the README.
