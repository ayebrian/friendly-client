# Security policy

Friendly Client is an independent web client for the Friendly network. It is not
affiliated with the Friendly service operators.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub:
**Security → Report a vulnerability** on this repository. Do not open a public
issue or pull request for an unfixed problem.

Include the affected route or component, steps to reproduce, and the impact you
observed. Only test against your own account and your own deployment.

## Scope

In scope: this client (`src/`), its production headers (`scripts/security-headers.ts`)
and the image proxy Worker (`workers/image-proxy`).

Out of scope: the Friendly API itself (`api.getfriend.ly`), Firebase, Cloudflare,
and third-party dependencies without a demonstrated impact on this client.

The Firebase web configuration used for push is public by design and is not a secret.
Earlier review notes are in [docs/security-review-2026-10-01.md](docs/security-review-2026-10-01.md).
