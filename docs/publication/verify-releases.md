# Verifying awa releases

This page tells a third party how to check an awa release using the
published repository, the release's assets and standard tools. It says what
each check proves and, just as important, what it does not prove.

Measured with: git `2.45.1.windows.1`, OpenSSH `OpenSSH_9.7p1`
(git-for-windows) and `OpenSSH_for_Windows_9.5p2`, Bun `1.3.13`.

## What is signed, and which half is authoritative

A release is signed by two separate mechanisms, one per object:

- **The release tag** is signed over SSH (`gpg.format=ssh`) by an
  independent ed25519 **tag key**. This signature is **classical-only**.
- **The release digest manifest** (`awa-digest-manifest/1`) lists the SHA-256
  and byte size of every released artifact. It is signed by a detached
  **`awa-envelope/1`** hybrid signature, `COMPSIG-MLDSA65-ECDSA-P256-SHA512`
  (OID `1.3.6.1.5.5.7.6.45`). The hybrid combines ML-DSA-65 and ECDSA P-256,
  and **both must verify**. The signing key belongs to a two-level key chain
  (`awa-key-chain/1`): a long-lived root key (`awa-root-2026`, five-year
  window) attests short-lived signing keys (one-year window).

**The manifest is the authoritative artifact.** The tag signature is the
weaker, classical half: **a verifier who checks only the tag has checked the
weaker half.** The manifest names the commit of the release tag, and that
binds the two halves together.

`awa-envelope/1` is **not** a JWS (RFC 7515). It borrows only the base64url
alphabet and the three-segment shape, its `alg` is not IANA-registered, and
no third-party library verifies it.

## What you need

The commands on this page use only these placeholders:

| Placeholder | Meaning |
|---|---|
| `<release-tag>` | the release tag name, in a clone of the published repository |
| `<assets>` | the directory holding the release's downloaded assets |
| `<file>` | one artifact, as named by an `artifacts[].path` entry of the manifest |
| `<manifest>` | the release's digest manifest file |
| `<manifest>.awa-sig` | the detached `awa-envelope/1` signature of the manifest |
| `chain.json` | the key-chain file shipped as a release asset |
| `<stem>.spdx.json`, `<stem>.cdx.json` | the release's SBOM pair, shipped as release assets: SPDX 2.3 and CycloneDX 1.6. `<stem>` is the npm package name with `@` removed and every `/` replaced by `-`; for `@awacloud/fw` the pair is `awacloud-fw.spdx.json` and `awacloud-fw.cdx.json` (see § The SBOM pair) |
| `<archive>` | a download archive: `<repo>-<version>.tar.gz` or `.zip` of a package, or `awa-public-<commit>.tar.gz` or `.zip` of the public source tree, where `<commit>` is the first 12 characters of the source commit |
| `<tree-manifest>`, `<tree-manifest>.awa-sig` | the public-tree digest manifest and its detached signature, published beside the tree archives |
| `<release>` | the release identifier: the `tag` field of `<tree-manifest>`, also the name of the release's download directory |
| `<clone>` | a clone of the public repository `github.com/awacloud/awa` |
| `<extracted>` | the directory where you extracted a public-tree archive |
| `<tmp>` | an empty scratch directory |
| `allowed_signers` | the tag-key file in this directory: [`allowed_signers`](./allowed_signers) |
| `<path>` | the directory where you saved `allowed_signers` |

Asset file names other than `chain.json`, the SBOM pair and the default
`.awa-sig` suffix are placeholders. The publication gateway fixes the real
names.

**The trust anchor** comes from [`SECURITY.md`](../../SECURITY.md). It is
reproduced here:

```json
{
  "rootKid": "d4525f63b6a9d56371841a267496bb1aec5a55f15bc80fbb7ecf0886860b070b",
  "rootFingerprint": "SHA256:1FJfY7ap1WNxhBomdJa7GuxaVfFbyA-7fs8IhoYLBws"
}
```

Rules for the anchor:

- Compare `SHA256:` values **character for character**. Do not compare only a
  prefix or suffix.
- **`SECURITY.md` is authoritative.** If this page and `SECURITY.md`
  disagree, **stop and trust neither**. Report the mismatch through the
  channel `SECURITY.md` names.

## The keys

| Key | Kind | Identity | Validity window | Signs |
|---|---|---|---|---|
| `awa-tag-2026` (tag key) | ed25519, OpenSSH | fingerprint `SHA256:UTwOcNgvlIYp7WCz2tcMSZdK6hMsUs8mWbb/1GAGROA`, principal `security@awacloud.com` | — | release tags only (namespace `git`) |
| `awa-root-2026` (root) | `COMPSIG-MLDSA65-ECDSA-P256-SHA512` | kid `d4525f63b6a9d56371841a267496bb1aec5a55f15bc80fbb7ecf0886860b070b`, fingerprint `SHA256:1FJfY7ap1WNxhBomdJa7GuxaVfFbyA-7fs8IhoYLBws` | `2026-09-14T16:34:37Z` to `2031-09-14T16:34:37Z` | attestations only (purpose `attest`) |
| `awa-sign-2026` (signing key) | `COMPSIG-MLDSA65-ECDSA-P256-SHA512` | kid `257c6a43bfc1567e6928cb48de21b727c435b77ad67f9bbb250ca68530254071` | `2026-09-14T16:37:23Z` to `2027-09-14T16:37:23Z` | digest manifests — the release manifests and the public-tree manifest (purpose `envelope`) |

> **Not a release key: the `security@` channel key is a DIFFERENT key.**
> It is a classical OpenPGP key used to encrypt and sign
> vulnerability-report correspondence. It signs nothing in the release
> chain. It shares the address `security@awacloud.com` with the tag key's
> principal, but it is a different key and **must never be used to verify a
> release**. Its fingerprint is published in [`SECURITY.md`](../../SECURITY.md)
> and is not repeated here.

## Lane 1 — verify the release tag (git + OpenSSH)

### Step A — compare the fingerprint

```sh
cut -d' ' -f3- <path>/allowed_signers | ssh-keygen -lf -
```

Expected: exit `0`, and this output:

```
256 SHA256:UTwOcNgvlIYp7WCz2tcMSZdK6hMsUs8mWbb/1GAGROA no comment (ED25519)
```

The fingerprint must equal the tag-key fingerprint in § The keys, character
for character. Do not run `ssh-keygen -lf` on the whole file: it fails with
`<path> is not a public key file.` (exit `255`), because `allowed_signers`
starts with a principal and options, not a key.

### Step B — verify the tag signature

Run this in a clone of the published repository that has the tag:

```sh
git -c gpg.ssh.allowedSignersFile=<path>/allowed_signers verify-tag <release-tag>
```

Expected: exit `0`, and a line of this form (shown here as measured with a
throwaway test key, so its principal and fingerprint are not the release
values):

```
Good "git" signature for security@example.invalid with ED25519 key SHA256:Stg0+5fOMfEbs7i++yS9XYq1LeeuU1EIYAUyWoizruM
```

For a release, the `SHA256:` fingerprint on that line must be
`SHA256:UTwOcNgvlIYp7WCz2tcMSZdK6hMsUs8mWbb/1GAGROA`.

> **Warning — git trusts the key, not the name.** `git verify-tag` accepts a
> signature when the signing key is listed in `allowed_signers`. It does not
> check that the principal name beside the key is the one you expect. This
> was measured with throwaway keys, on both the git-for-windows and the
> Windows OpenSSH `ssh-keygen`:
>
> | `allowed_signers` differs from the correct file by | `git verify-tag` exit | decisive output |
> |---|---|---|
> | the principal name only (same key) | `0` | `Good "git" signature for someone-else@example.invalid with ED25519 key SHA256:…` (same fingerprint as the correct file) |
> | the key (a different key) | `1` | `No principal matched.` |
> | the namespace (not `git`) | `1` | `key is not permitted for use in signature namespace "git"` |
>
> A file whose only change is the principal still verifies. **Compare the
> fingerprint, never the principal alone.** These cases are pinned by the
> key-tool tag-principal integration test,
> `tools/key-tool/tests/tag-principal.integration.test.ts`, in the awa source
> repository. `key-tool` carries no distribution entry, so that path is in
> neither the published packages nor this repository.

**Windows note.** On the measured Windows host, `git verify-tag` succeeded
without any `gpg.ssh.program` setting. It printed the same line, with the
same exit code, when `-c gpg.ssh.program=` pointed at the git-for-windows
`ssh-keygen` or at the Windows OpenSSH `ssh-keygen`. On that host the
setting was not required. This is a measurement on one host.

**What Lane 1 proves:** the tag object was signed by the tag key. Nothing
more. It says nothing about the released artifacts, and nothing
post-quantum.

## Lane 2 — artifact digests and the tag binding (standard tools)

The manifest is a JSON file with these fields:

```json
{
  "type": "awa-digest-manifest/1",
  "commit": "<commit id of the release>",
  "tag": "<release-tag>",
  "generated": "<ISO-8601 instant>",
  "artifacts": [
    { "path": "<file>", "sha256": "<lowercase hex SHA-256>", "bytes": "<size in bytes, a number>" }
  ]
}
```

Never re-serialise the manifest. A verifier hashes file bytes, and the
signature covers the manifest file exactly as downloaded.

For each entry of `artifacts[]`:

```sh
sha256sum <assets>/<file>
```

Expected: exit `0`, and the first field of the output equals that entry's
`sha256`; the comparison is the check.

A changed file gives a different digest. In the measurement, flipping one
byte of a throwaway artifact changed its digest to
`f720bc63856899503311efaa75a4bc21e4f592983736c4ff3674da18c4b16926`.

```sh
wc -c < <assets>/<file>
```

Expected: exit `0`, and the printed number equals that entry's `bytes`.

Then check the binding to the tag, in the clone used for Lane 1:

```sh
git rev-parse "<release-tag>^{commit}"
```

Expected: exit `0`, and the printed commit id equals the manifest's `commit`.
Also check that the manifest's `tag`
field equals `<release-tag>`.

**What Lane 2 proves without Lane 3:** only that the files match a manifest
that someone wrote. The manifest is **not yet authenticated**. Lanes 1 and 2
together show that the tag is genuine and that the files match an
unauthenticated manifest naming that tag's commit.

### The SBOM pair

Each release ships its package's SBOM as two release assets,
`<stem>.spdx.json` (SPDX 2.3) and `<stem>.cdx.json` (CycloneDX 1.6).

- The SBOM files are **not signed**. Signing them is planned.
- Their SHA-256 and size are listed in the release's digest manifest, as two
  `artifacts[]` entries whose `path` is the file name. Check them exactly like
  any other artifact, with the Lane 2 commands above:
  `sha256sum <assets>/<file>` and `wc -c < <assets>/<file>`.
- The digest manifest is the signed artifact. A manifest verified through
  Lane 3 therefore covers the SBOM files' integrity: a file whose digest and
  size match its entry is the file the manifest listed when it was signed.
  Without Lane 3, the match is against an unauthenticated manifest, as for
  every other artifact.

The manifest covers the bytes of the SBOM files. It says nothing about
whether their content is complete or correct.

### Download archives

An archive is never signed on its own. It is covered by being listed:

- A package's archives, `<repo>-<version>.tar.gz` and
  `<repo>-<version>.zip`, are two `artifacts[]` entries of that package's
  release manifest, whose `path` is the file name.
- The public-tree archives, `awa-public-<commit>.tar.gz` and
  `awa-public-<commit>.zip`, are two `artifacts[]` entries of
  `<tree-manifest>`. That manifest's `commit` is the source commit, and its
  `tag` is the release identifier `<release>`.

The check is the Lane 2 pair, unchanged: `sha256sum <assets>/<archive>` and
`wc -c < <assets>/<archive>`, compared with the archive's entry (`sha256`,
then `bytes`).

`<tree-manifest>` also lists every file of the source tree, by its path
inside the archive's top directory, `awa-public-<commit>/`. After extracting
the archive (`tar -xzf <archive>` or `unzip <archive>`), each such file can
be checked with the same two commands, run from inside that directory:
`sha256sum <file>` and `wc -c < <file>`, where `<file>` is the entry's
`path`. A shell loop over `artifacts[]` is yours to write; this page
prescribes none.

`commit` names the publisher's source commit. The public repository's
history does not carry that commit. It carries one commit per release
instead, tagged `awa-public@<release>`, and that tag is signed by the tag
key like every release tag: check it with Lane 1, Step B, with
`awa-public@<release>` as `<release-tag>`.

The tagged tree is the public source tree of the archives. To check it,
extract the tagged tree beside the archive's content and compare the two
directories:

```sh
git -C <clone> -c core.autocrlf=false archive --prefix=awa-public-<commit>/ awa-public@<release> | tar -x -C <tmp>
diff -r <tmp>/awa-public-<commit> <extracted>/awa-public-<commit>
```

Expected: exit `0` and no output. `core.autocrlf=false` keeps git from
rewriting line endings on the way out. Measured before the first release,
with `core.autocrlf=true` instead: `diff -r` exits `1` and reports most
files as different.

`<tree-manifest>` is verified in Lane 3 exactly like a release manifest:
the `verify` command there takes `--manifest <tree-manifest>` and
`--sig <tree-manifest>.awa-sig` in place of the release manifest and its
signature.

The manifest covers the bytes of the archive. It says nothing about what
the archive should contain beyond the listed files, and it does not make
the archive a substitute for the published package: the npm registry
serves its own tarball.

Two builds of the same source commit give identical archive bytes on the
publisher's toolchain; this page does not claim you can rebuild them.

## Lane 3 — the hybrid signatures (chain replay + envelope)

Lane 3 authenticates the manifest. The anchor values below come from
`SECURITY.md` (see § What you need).

Replay the key chain against the anchor:

```sh
bun cli.ts key-tool chain verify --chain chain.json \
  --root-kid d4525f63b6a9d56371841a267496bb1aec5a55f15bc80fbb7ecf0886860b070b \
  --root-fingerprint "SHA256:1FJfY7ap1WNxhBomdJa7GuxaVfFbyA-7fs8IhoYLBws" --json
```

Expected: exit `0`, with the decisive line `"ok": true,`. `verified` lists
two keys: the root (serial `1`, purpose `["attest"]`) and the signing key
(serial `2`, purpose `["envelope"]`), with the kids and windows of § The
keys.

Verify the manifest's envelope signature:

```sh
bun cli.ts key-tool verify --manifest <manifest> --sig <manifest>.awa-sig --chain chain.json \
  --root-kid d4525f63b6a9d56371841a267496bb1aec5a55f15bc80fbb7ecf0886860b070b \
  --root-fingerprint "SHA256:1FJfY7ap1WNxhBomdJa7GuxaVfFbyA-7fs8IhoYLBws" --json
```

Expected: exit `0`, with the decisive field `"verdict": "accepted"`. `verify`
runs three gates in order: the chain replay against the anchor, the envelope
signature check, then the acceptance rules of § Validity, expiry and the
annual re-sign.

Exit codes of both commands:

| Code | Meaning |
|---|---|
| `0` | ok — the chain replays (`chain verify`), or the verdict is `accepted` (`verify`) |
| `1` | rejection — a VOID chain, an envelope rejection or any non-`accepted` verdict (also an unknown verb or a bad flag) |
| `2` | configuration error — for example an unreadable or malformed chain file |

> **Limitation — Lane 3 is not yet runnable from the published repository.**
> `key-tool` is the reference verifier, and it is **not published**: it has
> no distribution entry. The commands above run only from a checkout of the
> awa source repository, with Bun (after `bun install`, from the checkout's
> root). **There is currently no independently published verifier for the
> composite signature.** A verifier who holds only the published repository
> can perform Lanes 1 and 2, and **cannot yet perform Lane 3**.
>
> **Lanes 1 and 2 alone do not establish the post-quantum guarantee.** The
> tag signature is classical, and without Lane 3 the manifest is
> unauthenticated.

## Reading a failure

`verify` reports exactly one verdict. The first two come from its first two
gates (`tools/key-tool/src/cmd/verify.ts`); the rest are the acceptance
verdicts (`Verdict` in `tools/key-tool/src/policy.ts`):

| Verdict | Meaning |
|---|---|
| `accepted` | every gate passed |
| `chain-void` | the chain does not replay against the anchor (see the rule table below) |
| `envelope-reject` | the envelope check failed; `envelope.step` and `envelope.reason` say where |
| `unknown` | the signature's kid is not in the verified set |
| `malformed-instant` | an instant is not `YYYY-MM-DDTHH:MM:SSZ` |
| `iat-after-at` | the declared signing instant is after the verification instant |
| `revoked` | the key was revoked at or before the declared signing instant |
| `not-yet-valid` | the verification instant is before the key's `notBefore` |
| `expired` | the verification instant is after the key's `notAfter` |
| `iat-before-window` | the declared signing instant is before the key's `notBefore` |
| `purpose` | the object type is not in the key's attested purpose |

Measured examples, on throwaway keys: a manifest with one changed byte gave
`envelope-reject` at step 3, `header.payload.sha256 does not match the
supplied payload` (exit `1`). Verifying one day after the signing key's
`notAfter` gave `expired` (exit `1`).

When the chain does not replay, `chain verify` prints `ok: false` and one or
more `errors[]` entries `{ index, rule, detail }`. `index` is the position in
`chain.entries`; **`index -1` is the root entry**. Rejection is total:
**`verified` is empty whenever `ok` is false.** For example, with the last
character of the root fingerprint changed, the measured result was exit `1`
and:

```
chain error: [-1] R1.fingerprint: root fingerprint != anchor.rootFingerprint
```

The `errors[].rule` names:

| Rule | Fires when |
|---|---|
| `R1.chainType`, `R1.chainShape` | `type` is not `awa-key-chain/1`; `root`/`entries[]` missing |
| `R1.json` | root `body` is not base64url-encoded UTF-8 JSON |
| `R1.type`, `R1.role` | root body is not an attestation; `role != "root"` |
| `R1.alg` | root declares an `alg`/`oid` pair other than this tool's composite (enforced) |
| `R1.issuer` | `entry.issuer != body.issuer.kid` |
| `R1.selfIssued` | `issuer.kid != subject.kid` (the root is not self-attested) |
| `R1.anchorKid` | `subject.kid != anchor.rootKid` |
| `R1.publicKey`, `R1.kid` | `publicKey` is not base64url; declared kid ≠ `sha256(publicKey)` |
| `R1.fingerprint` | `"SHA256:"+b64url(sha256(pk)) != anchor.rootFingerprint` |
| `R1.sigEncoding`, `R1.sig` | `sig` is not base64url; the root self-signature does not verify |
| `R1.serial`, `R1.window` | root serial not an integer ≥ 1; `!(notBefore < notAfter)` — an absent or unparseable window fires too |
| `R2.json`, `R2.type` | entry body undecodable; body type is neither attestation nor revocation |
| `R2.serial` | `serial` not an integer strictly greater than the previous serial |
| `R2.issuer` | `entry.issuer != body.issuer.kid`, or the issuer is not the anchored root |
| `R2.sigEncoding`, `R2.sig` | `sig` not base64url; signature does not verify under the ROOT key |
| `R2.role` | attestation `role != "signing"` |
| `R2.alg` | entry declares an `alg`/`oid` pair other than this tool's composite (enforced) |
| `R2.publicKey`, `R2.kid` | `publicKey` not base64url; declared kid ≠ `sha256(publicKey)` |
| `R2.window` | `notBefore >= notAfter` |
| `R2.rootLifetime` | `notAfter > root.validity.notAfter` (enforced) |
| `R2.reissue` | a second attestation for a kid already in the verified set |
| `R2.revokeUnknown` | revocation whose subject is not (yet) in the verified set |
| `R2.revokedAt` | `revokedAt` is not a parseable ISO-8601 instant |

## Validity, expiry and the annual re-sign

The acceptance rule, quoted from the verifier's source:

> A signature by key K with declared signing instant `iat`, verified at
> instant `at`, is accepted iff K is not revoked as of `iat`, K's window
> contains `at`, `iat` is not after `at` nor before K's `notBefore`, and the
> object type is in K's attested purpose. Consequences: a signature made
> before a revocation stays verifiable until K's `notAfter` (revocation is
> dated, not retroactive); every signature stops verifying once K's window
> ends, whatever its `iat` (re-signing is periodic — **annual** under the
> 1-year signing window); `iat` is declared by the signer and is not
> attested, so a back-dated `iat` from a stolen key evades revocation only
> until `notAfter` — the window bounds the exposure.

What this means for a verifier:

- `awa-sign-2026` expires at `2027-09-14T16:37:23Z`. After that instant,
  **every signature made by it reads `expired`**, whenever it was made.
- Before then, the owner issues a new signing key under `awa-root-2026`,
  re-signs the manifests of the supported releases and republishes
  `chain.json`. The new attestation is appended to the chain; the earlier
  entries stay.
- Use the **newest `chain.json`**, the one published with the latest
  release.
- A signing key can never outlive the root (rule `R2.rootLifetime`). The root
  window ends at `2031-09-14T16:34:37Z`.

This re-sign was rehearsed with throwaway keys: at an instant after the first
signing key's `notAfter`, the old signature read `expired` and a signature of
the same manifest by a newly issued key read `accepted`.

The owner's command sequence for the re-sign is documented in the key-tool
package README, `tools/key-tool/README.md`, in the awa source repository.
`key-tool` carries no distribution entry, so that path is in neither the
published packages nor this repository. This page does not reproduce owner commands, and the
business calendar of the re-sign is out of its scope.

## Revocation and re-rooting

**Revocation** is dated against the declared signing instant (`iat`) and is
**not retroactive**. A signature made before a revocation stays verifiable
until the key's `notAfter`. The `iat` is declared by the signer and is not
attested, so the key's validity window is what bounds the exposure (see the
quoted rule above).

**Re-rooting.** **No chain-internal re-root exists.** The chain has no entry
that links an old root to a new one. If the root has to be replaced:

- the new anchor is published through the **same out-of-band channel** as
  the original: `SECURITY.md`, plus a dated publication event;
- every signature made before the re-root is re-verified **only against the
  old anchor's frozen chain**, never against the new anchor.

## Scope of this page

Covered: release tags, digest manifests (release and public-tree), the
envelope key chain, and through the digest manifests the integrity of the
SBOM pair and of the download archives.

Not covered:

- verification of the `security@` channel key itself (see `SECURITY.md`);
- deployment keys and SSH host keys. This project does not publish them at
  this time;
- a signature per archive — none exists; an archive's completeness.
