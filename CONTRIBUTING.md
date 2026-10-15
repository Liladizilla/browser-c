# Contributing to Browser C

Thanks for helping make Browser C reliable and secure.

## Before contributing

- Read [Architecture](docs/ARCHITECTURE.md) and [Roadmap](docs/ROADMAP.md).
- Keep changes focused and include tests for behavior changes.
- Never commit credentials, browser profiles, cookies, private browsing data, or unreviewed binaries.
- Treat web content and downloaded files as untrusted.
- Do not weaken sandboxing or permission policy to make a test pass without a reviewed security rationale.

## Development checks

Run `npm test` and `npm run validate` before submitting changes. Lint, typecheck, build, and end-to-end commands will be added with the application scaffold.

## Pull requests

Describe the user-visible change, security impact, tests run, and platforms verified. Mark unverified behavior clearly. CI passing does not replace manual verification for GPU, media, signing, or OS integration.