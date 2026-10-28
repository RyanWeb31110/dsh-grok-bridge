# Contributing

Thanks for looking at dsh-grok-bridge. The project is MIT-licensed and maintained by QingShanLab.

## Develop

Node.js 22.19 or newer.

```sh
npm install
npm test
```

`npm test` builds `lib/` and runs the unit tests. The tests mock the harness agent; they do not call a model.

```sh
npm run demo
```

That runs the local loop: HTTP create → simulated dsh turn → signed outbound webhook.

## Pull requests

- Keep the HTTP surface small. A new route needs a reason that the existing task API cannot cover.
- Do not add Tailscale Funnel, social posting, or a second plugin framework.
- Never commit tokens, tailnet auth keys, or a filled-in `.env`.
- Run `npm test` before you open a PR. If you change `src/`, the PR must include the rebuilt `lib/` (the published package loads `lib/`, and a git install does not need a build script).

## Security

The bearer token lets the holder start a dsh agent as the OS user running dsh. Report vulnerabilities privately to the maintainer before filing a public issue, and do not include live tokens in the report.
