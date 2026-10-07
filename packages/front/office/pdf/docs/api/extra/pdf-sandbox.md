---
module: pdfSandbox
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfSandbox

> Strict sandbox linter for active-content PDF features.

**Module** `pdfSandbox` | **Source** `packages/front/office/pdf/src/extra/pdf-sandbox.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Flags actions that request active/external behaviour when a document is opened in an untrusted context: `/Launch`, `/JavaScript`, `/ImportData` (errors — execution, scripting, or file-system reads); `/SubmitForm`, `/Rendition` (with a `/JS` payload), `/URI` (warnings — network or navigation side effects). Benign actions (`GoTo`, `Named`, …) are ignored. The linter consumes already-typed action records (e.g. from `pdfFormActionsExtended.typeExtendedAction`), it does not parse raw dicts itself.

## Resolve

```js
const ext = runtime.resolve('pdfSandbox');
// Returns: { lintAction, lintActions, ACTIVE_KINDS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `lintAction` | `(rec: { kind, sandboxed? }) => Issue \| null` | `null` for non-objects, benign kinds, or a `Rendition` record with `sandboxed` falsy. |
| `lintActions` | `(records: Iterable<Record>) => { sandboxed: true, issues: Issue[], hasActiveContent: boolean, hasErrors: boolean }` | Aggregates `lintAction` over an iterable. |
| `ACTIVE_KINDS` | frozen catalog | Action kind → `{ severity: 'error' \| 'warning', message }`. |

### Shape `Issue`

```js
{ kind, code: 'pdf/sandbox/active-' + kind.toLowerCase(),
  severity: 'error' | 'warning', message, context: { sandboxed: boolean } }
```

## Examples

### Lint a single action

```js
const ext = runtime.resolve('pdfSandbox');
const issue = ext.lintAction({ kind: 'Launch', sandboxed: true });
issue.severity;  // 'error'
issue.code;      // 'pdf/sandbox/active-launch'
```

### Lint a list of typed actions

```js
const r = ext.lintActions([
    { kind: 'Launch', sandboxed: true },
    { kind: 'GoTo' },
    { kind: 'URI' }
]);
r.issues.length;       // 2
r.hasActiveContent;    // true
r.hasErrors;           // true (Launch is an error-severity kind)
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/sandbox/bad-input` | `ContractError` | `lintActions` argument is not iterable. |

`lintAction` never throws — it returns `null` for any input it cannot classify.

## See also

- [`pdfFormActionsExtended`](./form-actions-extended.md)
- [`pdfAction`](../action/action.md)
- [Extras index](./README.md)
