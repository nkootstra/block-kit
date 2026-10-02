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

## What counts

Block Kit JSON often comes from somewhere the app doesn't control, so the package treats it as
untrusted. In scope, for example:

- Block Kit JSON or mrkdwn that runs script, injects HTML, or renders a link or image whose URL
  isn't `http:` or `https:`.
- The signing secret given to `createInteractionRelay` reaching the browser, a response or a log.
- A relay that forwards a request it should refuse, or signs anything other than the interaction
  the page sent.
- A published version without a provenance attestation (see below).

Out of scope: Slack's own services and APIs (report those to Slack), and what an app does with the
interactions the relay forwards to it.

## How releases are published

Releases are published from the `Release` workflow through npm trusted publishing: no npm token
exists, and every version carries a provenance attestation linking it to the commit and workflow
run that built it. Verify a release with `npm audit signatures` after installing it.
