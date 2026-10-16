# Security Policy

Browser security issues can put users, accounts, and files at risk. Please do not publish exploit details for an unpatched vulnerability in a public issue.

## Reporting

Use GitHub's private vulnerability reporting feature for this repository when available. If unavailable, contact the maintainer privately through a verified GitHub contact channel and include minimal reproduction steps. Do not include real user data, credentials, cookies, access tokens, or private browsing profiles.

Please include the affected version or commit, operating system, impact, and a minimal reproduction. Redact secrets and personal information from logs and screenshots.

## Scope

Relevant issues include renderer-to-main privilege escalation, sandbox bypasses, unsafe IPC, navigation and protocol flaws, download/path vulnerabilities, permission bypasses, profile data leakage, insecure password handling, and dependency vulnerabilities affecting Browser C. Reports about third-party websites or Electron/Chromium should explain how the issue affects Browser C or its users.

## Response expectations

This is an early-stage project without a staffed security response team, so no fixed response SLA is promised. Reports will be assessed for impact and reproducibility. Please allow reasonable time for investigation and remediation before public disclosure. The project may not be able to provide a bounty or compensation.

## Principles

- Prefer secure defaults and least privilege.
- Keep Electron/Chromium dependencies updated.
- Do not expose Node.js or broad privileged APIs to remote content.
- Treat downloads and navigation input as untrusted.
- Document known limitations honestly.

## Disclosure

Please coordinate public disclosure with the maintainer after a fix or mitigation is available. This policy is not a guarantee of a particular response time or resolution.
