# Security Policy

Browser security issues can put users, accounts, and files at risk. Please do not publish exploit details for an unpatched vulnerability in a public issue.

## Reporting

Use GitHub's private vulnerability reporting feature for this repository when available. If unavailable, contact the maintainer privately through a verified GitHub contact channel and include minimal reproduction steps. Do not include real user data, credentials, cookies, or private browsing profiles.

## Scope

Relevant issues include renderer-to-main privilege escalation, sandbox bypasses, unsafe IPC, navigation and protocol flaws, download/path vulnerabilities, permission bypasses, profile data leakage, and dependency vulnerabilities affecting Browser C.

## Response expectations

This is an early-stage project without a staffed security response team, so no fixed response SLA is promised. Reports will be assessed for impact and reproducibility. Please allow reasonable time for investigation and remediation before public disclosure.

## Principles

- Prefer secure defaults and least privilege.
- Keep Electron/Chromium dependencies updated.
- Do not expose Node.js or broad privileged APIs to remote content.
- Treat downloads and navigation input as untrusted.
- Document known limitations honestly.