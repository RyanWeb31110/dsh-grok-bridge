# dsh-grok-bridge

Tailscale bridge between a DeepSeek Harness (`dsh`) on your machine and a Grok Bot on another tailnet node.

**中文摘要：** 这是一个 DeepSeek Harness 插件。它在你的电脑上提供只走 Tailscale（`100.x`）的 HTTP 接口，让远端 Grok Bot 用共享令牌下发任务、查询状态、中途补充指令；dsh 完成、失败或需要批准时，再把事件用 HMAC 签回 Grok Bot。默认不走公网 Funnel，仓库里没有任何密钥。作者 [QingShanLab](https://github.com/QingShanLab)。

The bridge is a Cordis plugin. It runs inside `dsh`, binds an HTTP API, and keeps a task ↔ session map on disk. Grok creates work with `POST /v1/tasks`. dsh runs it. Terminal events go back out as signed webhooks. v0.1 does not grant tool approvals and does not post anywhere public.

## Architecture

```text
 Grok Bot node (100.a.b.c)                    your Mac (100.d.e.f)
 +---------------------------+                +-------------------------------+
 | Grok Bot                  |  POST /v1/tasks| dsh                           |
 |  or a script on that host | -------------> |   dsh-grok-bridge :8791       |
 |                           |  Bearer token  |     create / resume session   |
 | tailnet receiver :8792    |                |     followup / steer          |
 |                           |  task.* + HMAC |     ~/.dsh/dsh-grok-bridge/   |
 |                           | <------------- |                               |
 +---------------------------+                +-------------------------------+
        Tailscale ACL: only these two nodes, on these ports
```

```text
Grok                bridge                 dsh agent              Grok routine
 | POST /v1/tasks      |                      |                       |
 |-------------------->| persist task.json    |                       |
 | 202 {id,sessionId}  | agents.create        |                       |
 |<--------------------| followup(prompt) --->|                       |
 |                     |                      | turn/end completed    |
 |                     |<---------------------|                       |
 |                     | POST task.completed  |                       |
 |                     |--------------------------------------------->|
 |                     | Authorization + X-Dsh-Signature              |
```

Session logs stay in dsh's own persistence. This plugin's file only remembers which task id belongs to which session id, plus the last status the bridge observed. A restart reloads that file and resumes non-terminal sessions.

## Install

Requires Node.js 22.19+ and a DeepSeek Harness 0.2.x profile that stays running. `dsh web` is the usual one. A one-shot `dsh` invocation exits and takes the bridge with it. The profile must include session persistence (the stock `web` and `headless` templates do; `sdk-minimal` does not).

The published tree includes `lib/`, so a git install does not need a build script.

```sh
dsh plugin --profile web add github:QingShanLab/dsh-grok-bridge
```

From a local checkout:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-grok-bridge
```

Restart dsh. Confirm the layer:

```sh
dsh --profile web --dump-config
```

You should see a `dsh-grok-bridge` row. Remove it with:

```sh
dsh plugin --profile web remove dsh-grok-bridge
```

Targeted against the public plugin contract for `@deepseek-ai/dsh` 0.2.x (`engines.dsh`: `>=0.2.0 <0.3.0`): `ctx.agents.create` / `resume`, `followup` / `steer`, `session/event` (`assistant/message`, `turn/end`), `agent/status`, `agent/error`, and the `approval/request` waterfall. Re-check after a harness major bump.

## Configure

Copy `.env.example` to a file you source in the shell that launches dsh. The bundle patch reads `process.env`. Do not put these variables in `~/.dsh/.env`; some dsh versions treat unknown `DSH_*` keys there as fatal.

```sh
export DSH_GROK_TOKEN="$(openssl rand -hex 32)"
export DSH_GROK_BIND=127.0.0.1
export DSH_GROK_PORT=8791
export DSH_GROK_OUTBOUND_WEBHOOK_URL="http://100.x.x.x:8792/dsh-events"
export DSH_GROK_OUTBOUND_TOKEN="$(openssl rand -hex 32)"
export DSH_GROK_OUTBOUND_HMAC_SECRET="$(openssl rand -hex 32)"
```

| Variable | Role |
|---|---|
| `DSH_GROK_TOKEN` | Inbound bearer. Empty means every `/v1` call returns 401. |
| `DSH_GROK_BIND` / `DSH_GROK_PORT` | Default `127.0.0.1:8791`. |
| `DSH_GROK_STORE` | Task JSON. Default `$DSH_HOME/dsh-grok-bridge/tasks.json`. |
| `DSH_GROK_CWD` | Default working directory. Per-request `cwd` overrides it. |
| `DSH_GROK_CWD_ALLOWLIST` | Optional comma-separated absolute prefixes. |
| `DSH_GROK_PROVIDER` / `DSH_GROK_MODEL` | Set both, or neither to keep the profile's model route. |
| `DSH_GROK_OUTBOUND_WEBHOOK_URL` | Where events go. Prefer a `100.x` or `*.ts.net` URL. |
| `DSH_GROK_OUTBOUND_TOKEN` | Sent as `Authorization: Bearer` and `X-Automation-Key`. |
| `DSH_GROK_OUTBOUND_HMAC_SECRET` | HMAC key for `X-Dsh-Signature`. |
| `DSH_GROK_WEBHOOK_COMPLETED` and the `_FAILED`, `_NEEDS_APPROVAL`, `_HEARTBEAT` twins | Optional per-event URL overrides. |
| `DSH_GROK_HEARTBEAT_MS` | `0` off. Any other value is at least 60000. |

A profile `cordis.patch.yml` that targets id `dsh-grok-bridge` **replaces the whole config**. Restate every key. `examples/cordis.patch.yml` is a full copy. `name` must stay `dsh-grok-bridge`.

An empty outbound token **and** an empty HMAC secret means events are not sent, even if a URL is set.

## API

`GET /healthz` has no auth and returns only `{ "ok": true, "name": "dsh-grok-bridge", "version" }`. Everything else requires `Authorization: Bearer <DSH_GROK_TOKEN>`.

### Create

`POST /v1/tasks` → `202`

```sh
curl -sS -X POST "http://127.0.0.1:8791/v1/tasks" \
  -H "Authorization: Bearer $DSH_GROK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deploy-2026-10-28" \
  -d '{"prompt":"Summarize git status","cwd":"/Users/me/project","title":"git status"}'
```

```json
{ "ok": true, "task": { "id": "task_…", "sessionId": "…", "status": "queued" } }
```

The same idempotency key returns `200` and the original task. The key is remembered until that row is pruned.

### Read

`GET /v1/tasks/:id` → `200` with the task.

`GET /v1/tasks?limit=50` → newest updates first. `limit` is 1–200, default 50.

### Steer

`POST /v1/tasks/:id/steer` → `202`

```json
{ "text": "Focus on untracked files." }
```

`prompt` is accepted as an alias of `text`. Steer queues a next-step message on the same session. It does **not** approve a pending tool call.

### Status values

`queued`, `running`, `needs_approval`, `completed`, `failed`, `canceled`.

`turn/end` with reason `completed` or `max-tokens` becomes `completed`. `error`, `interrupted`, and `blocked` become `failed`. `aborted` becomes `canceled` and is still delivered as an outbound `task.failed` so the bot wakes up; `task.status` is `canceled`.

### Errors

`{ "ok": false, "error": "<code>" }` with `unauthorized`, `not_found`, `invalid_json`, `invalid_body`, `empty_prompt`, `prompt_too_large`, `payload_too_large`, `cwd_not_allowed`, `agent_failed`, `invalid_idempotency_key`, `invalid_metadata`, `metadata_too_large`, `invalid_limit`, `method_not_allowed`.

## Outbound events

| `type` | When |
|---|---|
| `task.completed` | The turn ended `completed` or `max-tokens`. |
| `task.failed` | Start failed, the turn ended in error, the session was interrupted, or it was aborted (`task.status` `canceled`). |
| `task.needs_approval` | A tool is waiting. The bridge only observes; it always calls `next()`. |
| `heartbeat` | Optional. Counts only, no prompts. |

Headers:

- `Content-Type: application/json`
- `Authorization: Bearer <outbound token>` when the token is set
- `X-Automation-Key: <same token>` so a Grok Bot routine sender key works
- `X-Dsh-Event: task.completed`
- `X-Dsh-Timestamp: <unix seconds>`
- `X-Dsh-Signature: sha256=<hmac>` over `` `${timestamp}.${rawBody}` `` when the HMAC secret is set

One try, eight-second timeout, no retry. A webhook failure is logged and does not fail the agent turn. Wire `resultText` is capped at 16,000 characters.

How a Grok Bot routine receives this, including a copy-paste instruction and the tailnet forwarder, is in [docs/grok-routine.md](docs/grok-routine.md).

Verify a signature:

```js
import { createHmac, timingSafeEqual } from 'node:crypto'
const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
const provided = header.slice('sha256='.length)
timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
```

Reject timestamps more than five minutes from now. `scripts/tailnet-receiver.mjs` does that.

## Tailscale

Install Tailscale on both machines. `tailscale up` prints a login URL; approve it in the browser. This repo does not contain an auth key.

```sh
# macOS
brew install tailscale
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
```

### ACL

In the Tailscale admin console, Access controls. This HuJSON allows the bot node to call the bridge, and the Mac to call the receiver. It does not grant the rest of the tailnet.

```jsonc
{
  "tagOwners": {
    "tag:grok-bot": ["autogroup:admin"],
    "tag:dsh-mac": ["autogroup:admin"]
  },
  "acls": [
    { "action": "accept", "src": ["tag:grok-bot"], "dst": ["tag:dsh-mac:443", "tag:dsh-mac:8791"] },
    { "action": "accept", "src": ["tag:dsh-mac"], "dst": ["tag:grok-bot:8792"] }
  ]
}
```

Tag the Mac `tag:dsh-mac` and the bot host `tag:grok-bot`. Port 443 is for `tailscale serve`. Port 8791 is for a direct bind. Drop the port you do not use.

### `tailscale serve` (bridge stays on loopback)

```sh
export DSH_GROK_BIND=127.0.0.1
export DSH_GROK_PORT=8791
sudo tailscale serve --bg 8791
tailscale serve status
```

Grok then calls `https://<mac>.ts.net/v1/tasks`. MagicDNS must be on. The certificate stays inside the tailnet. This is the preferred bind.

### Direct bind on the Tailscale address

```sh
export DSH_GROK_BIND="$(tailscale ip -4)"
export DSH_GROK_PORT=8791
```

Grok calls `http://100.d.e.f:8791/v1/tasks`. Use the ACL above. `0.0.0.0` also works if the ACL, and nothing else, can reach the port. The process logs a warning when it binds all interfaces or a non-tailnet address.

### Receiver on the bot node

```sh
export RECEIVER_BIND="$(tailscale ip -4)"
export RECEIVER_PORT=8792
export RECEIVER_TOKEN="$DSH_GROK_OUTBOUND_TOKEN"
export RECEIVER_HMAC_SECRET="$DSH_GROK_OUTBOUND_HMAC_SECRET"
export RECEIVER_LOG="$HOME/dsh-grok-events.jsonl"
node scripts/tailnet-receiver.mjs
```

Or `tailscale serve --bg 8792` on that node and set `RECEIVER_BIND=127.0.0.1`. Point `DSH_GROK_OUTBOUND_WEBHOOK_URL` at `http://100.a.b.c:8792/dsh-events` or `https://<bot>.ts.net/dsh-events`.

A cloud Grok routine cannot open a `100.x` socket unless that runner is itself on the tailnet. Keep task creation on a tailnet node. Outbound delivery to `api2.cursor.sh` is optional and leaves the tailnet; the receiver can forward there with `FORWARD_URL` and `FORWARD_TOKEN`. Details: [docs/grok-routine.md](docs/grok-routine.md).

## Security

- The bearer token is the ability to start an agent as the OS user running dsh, in any directory that user can use (or under `DSH_GROK_CWD_ALLOWLIST` when set).
- Pair it with a Tailscale ACL. A token on `0.0.0.0` without an ACL is a public agent. An ACL without a token trusts every process on the allowed node.
- Approvals are notify-only. The listener always delegates with `next()`. Decide the tool call in the dsh UI.
- Task JSON is mode `0600`. It contains prompts and model output. Do not commit it.
- Logs omit tokens and prompts. They include short error strings.
- Inbound bodies are capped (default 1 MiB). Outbound calls allow only `http:` and `https:`.

## Demo

[docs/demo.md](docs/demo.md) is the sixty-second tailnet walkthrough. Locally:

```sh
npm install
npm test
npm run demo
```

`npm test` builds `lib/` and runs mocked tests for auth, the on-disk session map, the HTTP API, approval delegation, and the signed webhook. `npm run demo` runs the simulator loop against the receiver. Neither test calls a model.

## Development

```sh
npm install
npm test
```

Edit `src/`, then `npm run build` and commit `lib/` with the source. Git installs load `lib/` and do not run a `prepare` script, which keeps `dsh plugin add` to one command on pnpm 10 (no `allowBuilds` entry). `prepublishOnly` rebuilds on `npm publish`.

Layout: `src/index.ts` is the plugin (`apply`, `inject`, schemastery `Config`, `cordis.patch.yml`). HTTP, the task store, HMAC, and the agent port are separate modules so tests do not boot dsh. The agent port calls `ctx.agents` and builds user messages with `id`, `role: 'user'`, `content`, and `source`. It does not import `@deepseek-ai/dsh-llm`, so the host keeps a single copy of that package. A message without `role` is persisted and then rejected by the provider on later turns.

Prior art, not a fork: [dsh-webhook-bridge](https://github.com/ben7am1n/dsh-webhook-bridge) (in-process inbound HTTP), [dsh-message-gateway](https://github.com/a792883583/dsh-message-gateway) (outbound push), [dsh-notification](https://github.com/nishit130/dsh-notification) (`agent/status`, `agent/error`, `approval/request`). This package adds a durable task id, steer, HMAC, and a tailnet-only operations story.

## Non-goals in v0.1

- Tailscale Funnel as the way in. See the appendix.
- Posting to X or any other social network.
- Embedding Tailscale auth keys, routine keys, or bearer tokens.
- Approving tool calls from the remote bot.
- A multi-platform chat gateway.

## Appendix: Funnel

`tailscale funnel` publishes a port on the public internet. v0.1 does not use it. If you enable it anyway, the bearer token is the only application check, which is much weaker than a tailnet ACL. Prefer `tailscale serve`.

## License

MIT. Copyright 2026 QingShanLab. See [LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md).
