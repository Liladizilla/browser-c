# Contributing to Browser C

Thanks for helping make Browser C reliable and secure.

## Before contributing

- Read [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), and the [Security model](docs/SECURITY_MODEL.md).
- Keep changes focused and include tests for behavior changes.
- Never commit credentials, browser profiles, cookies, private browsing data, or unreviewed binaries.
- Treat web content and downloaded files as untrusted.
- Do not weaken sandboxing or permission policy to make a test pass without a reviewed security rationale.
- Read the [Privacy notice](PRIVACY.md) and [Terms of use](TERMS.md) when changing data handling or distribution behavior.

## Development checks

Use Node.js 24 for CI parity. Install the committed dependency graph and run:

```sh
npm ci
npm test
npm run validate
npm run check
npm start
```

For packaging and release verification, follow [Release engineering](docs/RELEASES.md). CI passing does not replace manual verification for GPU, media, signing, upgrades, uninstall, or OS integration.

## Pull requests

Describe the user-visible change, security impact, tests run, and platforms verified. Mark unverified behavior clearly. Include screenshots for meaningful UI changes when practical. Never include private profile data, cookies, passwords, or tokens in screenshots or logs.

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md). Do not publish exploit details for an unpatched vulnerability in a public issue.
