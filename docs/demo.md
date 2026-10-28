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

Desktop app on the Mac, after the [desktop quickstart](../README.md#desktop-quickstart):

- Plugin installed with `dsh plugin --profile desktop add github:RyanWeb31110/dsh-grok-bridge`.
- `~/.dsh/profiles/desktop/cordis.patch.yml` holds literals: `host: 127.0.0.1`, `port: 8791`, the inbound `token`, empty `provider` and `model`, and outbound URL `http://100.B.B.B:8792/dsh-events` plus `outboundToken` and `outboundHmacSecret`.
- The app was quit and reopened. Do not rely on shell `export` or `launchctl setenv`; the Electron app will not see them.
- `sudo tailscale serve --bg 8791` is running.

`dsh web` can use the environment instead. See [CLI](../README.md#cli-dsh-web) and [examples/cordis.patch.env.yml](../examples/cordis.patch.env.yml).

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

Direct `100.x` URLs work when the desktop patch sets `host` to the Mac's Tailscale address instead of using `tailscale serve`. See the README.

A per-task model is a pair on the POST body. Omit both to follow `agent-default-model`:

```json
{"prompt":"Reply with exactly: opus-ok","title":"e2e opus 5.5","provider":"magpie-anthropic","model":"rootflowai-2/claude-opus-5-5"}
```
