# Security

dsh-grok-bridge lets a token holder start a DeepSeek Harness agent as the operating-system user that is running `dsh`. Treat `DSH_GROK_TOKEN` like a password.

The supported deployment is a Tailscale ACL that allows only the Grok Bot node to reach the bridge, plus the bearer token on every `/v1` request. Either control alone is weaker than both. The bridge does not grant tool approvals; those stay on the dsh UI.

Do not commit `.env` files, Tailscale auth keys, or webhook sender keys. Prefer `tailscale serve` or a 100.x bind. Tailscale Funnel publishes the port to the public internet and is not the v0.1 path.

Report vulnerabilities privately to the maintainer. Do not include live tokens in a public issue. The design notes in the README are the operational guide.
