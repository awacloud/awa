# Security Policy

## Our commitment

awa is built so that its security can be **verified, not trusted**: the
entire stack lives in one repository with zero npm runtime dependencies in
the front packages. This policy explains how to report vulnerabilities and
what you can expect from us.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

- Email: **security@awacloud.com**
- Reporting-channel key (OpenPGP, classical): fingerprint
  `8188 3C85 4B96 9B4F D698 5E5F 665D 620D 3F09 CA89` — armored public key:
  [`docs/publication/keys/publickey.security@awacloud.com-81883c854b969b4fd6985e5f665d620d3f09ca89.asc`](docs/publication/keys/publickey.security@awacloud.com-81883c854b969b4fd6985e5f665d620d3f09ca89.asc).
- This key protects the reporting channel only. It is a classical key,
  deliberately outside the post-quantum release chain, so that any
  reporter's OpenPGP tooling can use it.
- Please include: affected package(s) and version/commit, reproduction
  steps or proof of concept, and impact assessment if you have one.

You will receive an acknowledgment within **2 business days**.

## What happens next

| Step | Target |
|---|---|
| Acknowledgment | ≤ 2 business days |
| Triage & severity assessment (shared with you) | ≤ 5 business days |
| Fix or documented mitigation for critical/high issues | target ≤ 30 days |
| Coordinated disclosure | **90 days** after report, or earlier once a fix ships — negotiable if exploitation is observed in the wild |

These timings are disclosure-process targets, not a service level of the
commercial licence. We credit reporters in the release notes (unless you
prefer anonymity). We do not run a paid bounty program at this time; we
say so here rather than let you discover it after the work.

## Scope

In scope: all packages of this repository, including vendored code under
`vendor/` (we treat vulnerabilities in vendored code as ours to fix or
patch, coordinating upstream where relevant).

Out of scope: vulnerabilities in your integration of awa, in browsers,
or in third-party services. Findings in the cryptographic *design* of
standardized algorithms should go to the relevant standards bodies —
but implementation flaws in our code are exactly what we want to hear
about.

## Safe harbor

We will not pursue legal action for good-faith security research that
respects this policy: no data exfiltration beyond proof of concept, no
service disruption, no access to third-party data, report without undue
delay. Public awa deployments you do not own are out of scope of this
authorization.

## Supported versions

Support windows and the pre-1.0 rule are documented in full in
[MAINTENANCE.md](MAINTENANCE.md); commercial-licensee terms are those of
the CGL and its Support Annex.

## Release integrity

Releases are published from a physically verified copy of our
development repository: what reaches the public git host and npm is
checked file by file and commit by commit (the gateway procedure) on the
source host, before that copy leaves for signing and publication. For the
first releases the source host is not itself isolated; running this
procedure in a dedicated isolated environment is a target, not yet in
place. No always-connected CI pushes or publishes anything.

The first signed release was published on 2026-09-29 (lot 1: five
packages at version 0.1.0); it carries the files named below, as does
every later release.

Two mechanisms, split by object: release **tags** are signed over SSH
with a dedicated ed25519 tag key (classical); the **per-file digest
manifest** of each release is signed by a detached hybrid envelope
(ML-DSA-65 + ECDSA P-256, both signatures must verify). The manifest is
authoritative: a verifier who checks only the tag has checked the weaker
half.

Key chain: a long-lived root key attests signing keys valid one year; a
verifier replays the chain from the trust anchor below.

## Release keys

| Key | Purpose | Algorithm | Identifier |
|---|---|---|---|
| `security@` channel key | reporting channel only (above) | OpenPGP, classical | fingerprint `8188 3C85 4B96 9B4F D698 5E5F 665D 620D 3F09 CA89` |
| `awa-tag-2026` | release tag signatures | SSH ed25519, classical | `SHA256:UTwOcNgvlIYp7WCz2tcMSZdK6hMsUs8mWbb/1GAGROA`, principal `security@awacloud.com` |
| `awa-root-2026` (trust anchor) | attests the manifest signing keys | hybrid ML-DSA-65 + ECDSA P-256 | see the anchor block |

The channel key and the tag key share the address security@awacloud.com;
they are two distinct keys and must never be substituted for one another.
When you verify a tag, compare the tag key's SHA256 fingerprint above with
the key in your `allowed_signers` file — never the principal name alone:
git accepts a signature from any listed key whatever principal name sits
beside it.

```json
{
  "rootKid": "d4525f63b6a9d56371841a267496bb1aec5a55f15bc80fbb7ecf0886860b070b",
  "rootFingerprint": "SHA256:1FJfY7ap1WNxhBomdJa7GuxaVfFbyA-7fs8IhoYLBws"
}
```

Step-by-step verification instructions:
[`docs/publication/verify-releases.md`](docs/publication/verify-releases.md).

## Verification, not promises

- The cryptographic primitives compiled to WebAssembly are tested against
  official NIST ACVP and RFC test vectors in this repository's test
  suites.
- The dependency surface you need to audit is this repository. All of it,
  and nothing else. That is the security model.
