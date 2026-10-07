---
module: dsigSignatures
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dsigSignatures (P2)

> Opt-in extra : typed parse/render of `<dsig:document-signatures>` and
> child XML-DSig elements (`Signature`, `SignedInfo`, `SignatureValue`,
> `KeyInfo`, `X509Data`, `Object`, …). The DSig subtree is preserved
> verbatim so that signature integrity is unaffected.

**Module** `dsigSignatures` | **Source** `packages/front/office/odf/src/extra/dsig-signatures.js`

## Helpers

`parseSignatures(el)` / `renderSignatures(obj)`,
`manifestEntries()`, `hydrateMetadata(m)` / `dehydrateMetadata(m)`.
