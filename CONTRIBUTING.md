# Contributing to awa

## Before you start

Security reports never go through issues or pull requests: see
[`SECURITY.md`](SECURITY.md).

## Which rule applies to your contribution

Each package declares its licence in the `license` field of its
`package.json`. That field decides which of the rules below applies.

### Apache-2.0 packages — no CLA

Contributions to a package licensed Apache-2.0 are accepted under that
same licence, as section 5 of the Apache License 2.0 provides. No
contributor licence agreement is required.

### AGPL-3.0-only packages (dual-licensed) — CLA required

These packages are also offered under a commercial licence. Contributions
to them require a signed Contributor License Agreement granting AwaCloud
SAS (the title holder) the right to license the contribution, including
commercially. You keep ownership of your contribution.

The CLA is not open for signature yet. Until it is, contributions to
AGPL-3.0-only packages cannot be merged.

### Internal contributors — the same CLA

The CLA applies to internal contributors too, founders included: every
contribution to a dual-licensed package, from inside or outside the
project, is covered by the same agreement.

## Pull requests

- One logical change per pull request.
- Tests alongside code.
- Commit message format: `<type>(<scope>): imperative summary ≤ 72 chars`,
  with types `feat, fix, refactor, docs, test, chore, perf, build, revert`.
- The owner's commits are signed off:
  `Signed-off-by: Matthieu Bouilloux <owner email>`. In the owner's
  repository a `prepare-commit-msg` hook adds that trailer to every commit,
  merges included, from one repository source (`awf.config.json` `signoff`),
  never from the committer's git config; `git commit -s` stays harmless and
  is never duplicated. A commit co-authored by an AI agent carries the
  agent's `Co-Authored-By:` trailer and the owner's `Signed-off-by:`, in that
  order; an agent is never a signatory and never adds a `Signed-off-by` in
  its own name.
