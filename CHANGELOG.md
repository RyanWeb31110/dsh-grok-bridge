# Changelog

## 0.1.0 — 2026-10-28

Initial public release.

- Inbound HTTP API on the dsh machine: `POST /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/tasks/:id/steer`, `GET /healthz`, bearer auth.
- Disk-backed task ↔ session map that survives a dsh restart, with lazy resume of non-terminal tasks.
- Outbound webhooks for `task.completed`, `task.failed`, `task.needs_approval`, and an optional heartbeat, signed with HMAC-SHA256 and/or a bearer token.
- Tailscale-first docs (`tailscale serve`, direct 100.x bind, ACL sketch) and a local demo loop.
