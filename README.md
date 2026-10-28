# dsh-grok-bridge

Tailscale bridge between a DeepSeek Harness (`dsh`) on your machine and a Grok Bot on another tailnet node.

**中文摘要：** 这是 DeepSeek Harness 的 Tailscale 插件。作者 [@QingShanLab](https://github.com/QingShanLab)，仓库 [RyanWeb31110/dsh-grok-bridge](https://github.com/RyanWeb31110/dsh-grok-bridge)。桌面版把令牌和出站地址写成 `~/.dsh/profiles/desktop/cordis.patch.yml` 里的字面量，不要靠 shell 环境变量或 `launchctl setenv`。Grok 经 `https://<你的Mac>.ts.net` 下发任务；本机跑完后，用 Bearer 和 HMAC 把 `task.completed` 推到机器人节点的 `http://100.x:8792/dsh-events`。`provider` 和 `model` 留空则跟随桌面默认模型；单次任务也可以在 POST 正文里成对指定。默认不走公网 Funnel，仓库里没有密钥。

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

## Desktop quickstart

DeepSeek Harness desktop is an Electron app. `open -a` does not inherit your shell, so the working setup writes **literals** into the desktop profile patch. Do not use `launchctl setenv` for this. The desktop profile is owned by the app; `dsh --profile desktop --dump-config` is not a reliable check.

Requires Node.js 22.19+ and DeepSeek Harness 0.2.x. The published tree includes `lib/`, so a git install does not need a build script. The profile must include session persistence (desktop and `web` do; `sdk-minimal` does not). A one-shot `dsh` command exits and takes the bridge with it.

1. Install into the desktop profile:

```sh
dsh plugin --profile desktop add github:RyanWeb31110/dsh-grok-bridge
```

2. Generate two secrets on the Mac (`openssl rand -hex 32` twice). Put them in `~/.dsh/profiles/desktop/cordis.patch.yml`. A row with this id **replaces the whole config**, so restate every key. `name` must stay `dsh-grok-bridge`. Leave `provider` and `model` as empty strings so sessions follow the profile's `agent-default-model` (the same route as a new chat). Full copy: [examples/cordis.patch.yml](examples/cordis.patch.yml).

```yaml
- id: dsh-grok-bridge
  name: dsh-grok-bridge
  config:
    host: 127.0.0.1
    port: 8791
    token: 'replace-with-inbound-bearer'
    storePath: ''
    cwd: ''
    cwdAllowlist: ''
    provider: ''
    model: ''
    outboundWebhookUrl: 'http://100.x.x.x:8792/dsh-events'
    outboundToken: 'replace-with-outbound-bearer'
    outboundHmacSecret: 'replace-with-hmac-secret'
    heartbeatMs: 0
    webhookCompleted: ''
    webhookFailed: ''
    webhookNeedsApproval: ''
    webhookHeartbeat: ''
    maxBodyBytes: 1048576
    maxTasks: 500
```

`outboundWebhookUrl` is the bot node. `scripts/tailnet-receiver.mjs` listens there, checks the bearer and HMAC, and appends the JSON. `100.x.x.x` is that node's Tailscale address.

3. Quit and reopen the desktop app so it reloads the patch.

4. Keep the bridge on loopback and publish it on the tailnet:

```sh
sudo tailscale serve --bg 8791
tailscale serve status
```

5. On the Mac:

```sh
curl -sS http://127.0.0.1:8791/healthz
```

Expect `{"ok":true,"name":"dsh-grok-bridge",...}`.

6. From the Grok Bot node (or any tailnet peer allowed by your ACL):

```sh
curl -sS -X POST "https://<mac>.ts.net/v1/tasks" \
  -H "Authorization: Bearer <inbound-bearer>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Reply with exactly: bridge-ok","title":"desktop smoke"}'
```

When the turn ends, the bot node log grows a signed `task.completed`. The desktop session list shows the new chat. Omit `provider` and `model` in that JSON to keep the profile default. To pin one session, send both fields; see [Create](#create).

Remove the plugin with `dsh plugin --profile desktop remove dsh-grok-bridge`.

`launchctl setenv` can push variables into GUI apps, but it is a last resort, it is easy to forget after reboot, and it is unnecessary when the patch holds literals.

## CLI (`dsh web`)

Same package, different profile. Shell environment works here because you start the process yourself. The shipped bundle reads `DSH_GROK_*` (see `.env.example`). Do not put those variables in `~/.dsh/.env`; some dsh versions treat unknown `DSH_*` keys there as fatal.

```sh
dsh plugin --profile web add github:RyanWeb31110/dsh-grok-bridge
export DSH_GROK_TOKEN="$(openssl rand -hex 32)"
export DSH_GROK_BIND=127.0.0.1
export DSH_GROK_PORT=8791
export DSH_GROK_OUTBOUND_WEBHOOK_URL="http://100.x.x.x:8792/dsh-events"
export DSH_GROK_OUTBOUND_TOKEN="$(openssl rand -hex 32)"
export DSH_GROK_OUTBOUND_HMAC_SECRET="$(openssl rand -hex 32)"
dsh web
```

`dsh --profile web --dump-config` should show a `dsh-grok-bridge` row. An env-shaped patch is in [examples/cordis.patch.env.yml](examples/cordis.patch.env.yml). From a local checkout, `dsh plugin --profile web add /absolute/path/to/dsh-grok-bridge` (use `desktop` instead of `web` for the app).

Targeted against `@deepseek-ai/dsh` 0.2.x (`engines.dsh`: `>=0.2.0 <0.3.0`): `ctx.agents.create` / `resume`, `agent.model.select`, `followup` / `steer`, `session/event`, `agent/status`, `agent/error`, and the `approval/request` waterfall.

## Configure

| Key | Desktop patch | Env (CLI only) | Role |
|---|---|---|---|
| `token` | literal | `DSH_GROK_TOKEN` | Inbound bearer. Empty rejects every `/v1` call. |
| `host` / `port` | `127.0.0.1` / `8791` | `DSH_GROK_BIND` / `DSH_GROK_PORT` | Loopback, then `tailscale serve`. |
| `storePath` | `''` | `DSH_GROK_STORE` | Empty uses `$DSH_HOME/dsh-grok-bridge/tasks.json`. |
| `cwd` | `''` | `DSH_GROK_CWD` | Default working directory. Per-request `cwd` overrides it. |
| `cwdAllowlist` | `''` | `DSH_GROK_CWD_ALLOWLIST` | Optional comma-separated absolute prefixes. |
| `provider` / `model` | `''` / `''` | `DSH_GROK_PROVIDER` / `DSH_GROK_MODEL` | Leave empty to follow `agent-default-model`. Set both only to override every task. |
| `outboundWebhookUrl` | `http://100.x.x.x:8792/dsh-events` | `DSH_GROK_OUTBOUND_WEBHOOK_URL` | Bot-node receiver. |
| `outboundToken` | literal | `DSH_GROK_OUTBOUND_TOKEN` | `Authorization: Bearer` and `X-Automation-Key`. |
| `outboundHmacSecret` | literal | `DSH_GROK_OUTBOUND_HMAC_SECRET` | HMAC key for `X-Dsh-Signature`. |
| `webhookCompleted` and the Failed / NeedsApproval / Heartbeat twins | `''` | `DSH_GROK_WEBHOOK_*` | Optional per-event URL overrides. |
| `heartbeatMs` | `0` | `DSH_GROK_HEARTBEAT_MS` | `0` off. Any other value is at least 60000. |

Empty `provider` and `model` copy `ctx.agentDefaultModel.currentSelection()` into the session, which is the desktop `agent-default-model` row. Do not paste that pair into the bridge config. Setting only one of the two is ignored. An empty outbound token **and** an empty HMAC secret means events are not sent, even if a URL is set.

## API

`GET /healthz` has no auth and returns only `{ "ok": true, "name": "dsh-grok-bridge", "version" }`. Everything else requires `Authorization: Bearer` plus the inbound token (the desktop patch `token`, or `DSH_GROK_TOKEN` when you started `dsh web`).

### Create

`POST /v1/tasks` → `202`

```sh
curl -sS -X POST "http://127.0.0.1:8791/v1/tasks" \
  -H "Authorization: Bearer $DSH_GROK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deploy-2026-10-28" \
  -d '{"prompt":"Summarize git status","cwd":"/Users/me/project","title":"git status"}'
```

Omit `provider` and `model` to use the profile default. To pin a different model on this session only, send both. The bridge passes them as `agentOptions` and records a `model/selection`, which is what the desktop model picker reads:

```json
{"prompt":"Reply with exactly: opus-ok","title":"e2e opus 5.5","provider":"magpie-anthropic","model":"rootflowai-2/claude-opus-5-5"}
```

One of the two fields without the other is `invalid_model_route`. A body route wins over `DSH_GROK_PROVIDER` / `DSH_GROK_MODEL`. The chosen pair is stored on the task and reused on resume.

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

`{ "ok": false, "error": "<code>" }` with `unauthorized`, `not_found`, `invalid_json`, `invalid_body`, `empty_prompt`, `prompt_too_large`, `payload_too_large`, `cwd_not_allowed`, `agent_failed`, `invalid_model_route`, `invalid_idempotency_key`, `invalid_metadata`, `metadata_too_large`, `invalid_limit`, `method_not_allowed`.

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

Desktop: the patch already sets `host: 127.0.0.1` and `port: 8791`. Then:

```sh
sudo tailscale serve --bg 8791
tailscale serve status
```

Grok calls `https://<mac>.ts.net/v1/tasks`. MagicDNS must be on. The certificate stays inside the tailnet. This is the preferred inbound path. For `dsh web`, the same ports can come from `DSH_GROK_BIND` and `DSH_GROK_PORT`.

### Direct bind on the Tailscale address

Set `host` in the desktop patch to the Mac's `100.x` address (or export `DSH_GROK_BIND="$(tailscale ip -4)"` for `dsh web`) and keep port `8791`. Grok calls `http://100.d.e.f:8791/v1/tasks`. Use the ACL above. `0.0.0.0` also works if the ACL, and nothing else, can reach the port. The process logs a warning when it binds all interfaces or a non-tailnet address.

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
