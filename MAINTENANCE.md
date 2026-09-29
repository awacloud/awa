# Versioning & Maintenance Policy

This document is a commitment, not a wish. It exists so that anyone
building on awa — individual, vendor, or public administration — can
answer "what happens over time?" without asking us.

## Versioning

awa packages follow **semantic versioning** (MAJOR.MINOR.PATCH):

- **PATCH**: fixes only. Always safe to update.
- **MINOR**: backward-compatible additions. API additions are documented
  in the changelog; nothing existing changes behavior.
- **MAJOR**: may contain breaking changes. Every breaking change ships
  with a written migration note. We do not do "big bang" majors: a major
  release bundles accumulated, documented breaks, not a rewrite.

Packages in the monorepo version independently but are released from a
single repository state; the changelog records the repository tag for
every package release.

## Support windows

| Version | What it receives | For how long |
|---|---|---|
| **Current major** | Fixes, security patches, additions | Continuously |
| **Previous major** | Security patches and critical fixes | **24 months** after the next major ships |
| Older majors | Nothing (community/AGPL: as-is; commercial: see below) | — |

**Perpetual commercial licenses**: your acquired major receives security
patches for as long as a maintenance subscription is active, regardless
of the windows above — and your right to *use* never expires either way.

**Pre-1.0 packages**: every awa package is pre-1.0 today. Until a package
reaches 1.0.0, fixes land on its latest 0.x release only — the support
windows above start applying once a package reaches 1.0.

## Deprecation and end of support

- A feature is never removed without being **deprecated for at least one
  full minor release** with a documented replacement.
- End of support of a major version is announced **12 months in
  advance** in the changelog and on the website.
- License terms never change on an existing major version. New terms can
  only apply to future majors.

## Release discipline

- Every release is tagged, gets a changelog entry, and passes the
  repository's own test and gate suite — including the ACVP crypto
  validation harness where applicable — before tagging.
- **No silent changes**: if it's not in the changelog, it didn't happen.
- No telemetry, no phone-home, no remote kill switch — an awa version
  you have is an awa version you keep, functioning, forever.

## Continuity beyond us

We are a small team and we plan for our own absence rather than deny it:

- The full repository — code, tests, and build tooling — is what you (or
  your escrow agent) hold. It has zero npm runtime dependencies and a
  pinned, documented build toolchain (Bun; the WASI SDK for the
  WebAssembly crypto package).
- Open source tiers (Apache-2.0 / AGPL-3.0) are irrevocable on published
  versions.
- Commercial continuity mechanisms (transferable perpetual licenses,
  escrow with release conditions) are contractual terms of your
  agreement.

## What we do not promise

Honesty clause: we do not publish multi-year feature roadmaps, and we do
not commit to dates we cannot control. When a date is written here or in
a contract, it is one we intend to keep — which is why you will see few
of them.

*Policy version: 1.0-draft — changes to this policy itself are announced
like a MINOR release and never reduce an existing commitment
retroactively.*
