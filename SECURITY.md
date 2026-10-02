# Security policy

## Supported versions

Only the latest release of `@nkootstra/block-kit` gets security fixes. While the version is 0.x,
upgrade to the newest minor release to receive them.

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/nkootstra/block-kit/security/advisories/new),
not in a public issue. Include the affected version, what an attacker can do, and the steps or
Block Kit JSON that reproduce it.

You'll get a reply within a week. Once a fix is released, the advisory is published with credit to
you unless you'd rather stay anonymous.

## How releases are published

Releases are published from the `Release` workflow through npm trusted publishing: no npm token
exists, and every version carries a provenance attestation linking it to the commit and workflow
run that built it. Verify a release with `npm audit signatures` after installing it.
