---
module: pdfSigPades
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfSigPades

> PAdES profile detection (ETSI EN 319 142-1), `/Reference` array, DSS, DocMDP and B-LTA chain validation — ISO 32000-2 §12.8.4.3.

**Module** `pdfSigPades` | **Source** `packages/front/office/pdf/src/extra/sig-pades.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

PAdES profiles by `/SubFilter`: `ETSI.CAdES.detached` (B-B/B-T), `ETSI.RFC3161` (Document Timestamp), `adbe.pkcs7.detached` (non-PAdES). Inferred levels: B-B (signature only), B-T (+timestamp), B-LT (+DSS), B-LTA (+DocTimeStamp over DSS). Does NOT verify the cryptography.

## Resolve

```js
const ext = runtime.resolve('pdfSigPades');
// Returns: { detectPadesProfile, typeReferenceArray, typeDSS,
//   typeVRIEntry, validateDocMdp, validateBLtaChain, typeSeedValue, SEED_VALUE_KEYS,
//   typeBuildData, typeBuildProperties, BUILD_DATA_KEYS,
//   SIG_SUBFILTERS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `detectPadesProfile` | `(sigDict, ctx?) => { subFilter, isPades, level, hasTimestamp }` | `level` is `B-B`/`B-T`/`B-LT`/`B-LTA` or `null` when not PAdES. |
| `typeReferenceArray` | `(array) => Reference[]` | Records for `/Reference` items: `{ transformMethod, transformParams, data, digestMethod, digestValue, digestLocation, raw }` (`digestValue` the string's bytes, `digestLocation` the array as read, `null` when absent). |
| `typeDSS` | `(dict) => DSS` | `{ certs, ocsps, crls, vri, raw, _extras }`. |
| `typeVRIEntry` | `(dict) => { type?, cert?, crl?, ocsp?, tu?, ts?, raw, _extras }` | One entry of the DSS's `/VRI` (ISO 32000-2 §12.8.4.4): `type` a name by value, `cert`, `crl`, `ocsp` arrays as read, `tu` the string's bytes, `ts` the stream as read (a reference as read, `null` for a value of another type), present only when the key is. |
| `validateDocMdp` | `(reference) => { valid, level, issues }` | Validates a DocMDP `/Reference` entry (`/TransformMethod /DocMDP`). |
| `validateBLtaChain` | `(steps) => { chainLevel, trace }` | Walks a chronological list of `{ sigDict, hasDss, hasDocTimestamp, hasSignatureTimestamp }` steps and reports the resulting PAdES level at each step. |
| `typeSeedValue` | `(dict, kind) => SeedValue` | A seed value dictionary, `kind` `field` (a signature field's `/SV`), `cert` (its `/Cert`), `mdp` (its `/MDP`: `P`) or `timeStamp` (its `/TimeStamp`: `URL`, `Ff`): one field per key of its list, named after the key in lower case (`AddRevInfo` → `addrevinfo`, `SignaturePolicyOID` → `signaturepolicyoid`), present only when the key is — a name, a string (its bytes), an integer (the `Ff` bit mask included) or a boolean by its value, an array or a dictionary as read (a reference as read), `null` for a value of another type — plus `raw` and `_extras` (the other keys). |
| `SEED_VALUE_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeBuildData` | `(dict, kind) => BuildData` | A signature build data dictionary, `kind` `data` (a `Filter` or `PubSec` entry), `app` or `sigQ`: one field per key of its list, named after the key in lower case (`PreRelease` → `prerelease`, `NonEFontNoWarn` → `nonefontnowarn`, `REx` → `rex`), present only when the key is — a name, a text string (its bytes), a number or a boolean by its value, an array or a reference as read, `null` for another value — plus `raw` and `_extras`. |
| `typeBuildProperties` | `(dict) => { filter?, pubSec?, app?, sigQ?, raw, _extras }` | A signature's `/Prop_Build`: each entry typed by `typeBuildData` (a reference as read, `null` for a non-dictionary), present only when the key is. |
| `BUILD_DATA_KEYS` | frozen object | Kind → its keys. |
| `SIG_SUBFILTERS` | frozen catalog | SubFilter name → `{ pades, kind }`. |

## Examples

### PAdES detection

```js
const ext = runtime.resolve('pdfSigPades');
const p = ext.detectPadesProfile(sigDict, { dss: {}, hasDocTimestampOverDss: false });
p.level;   // 'B-LT'
```

### DSS

```js
const dss = ext.typeDSS(dssDict);
dss.certs.length;  // 3
dss.vri;           // { 'C1D2E3...': { cert, crl, ocsp, tu, ts } }
```

### DocMDP reference

```js
const v = ext.validateDocMdp(referenceRecord);
v.valid;   // true | false
v.level;   // 1 | 2 | 3 | null
```

### B-LTA chain

```js
const chain = ext.validateBLtaChain([
    { sigDict: firstSig, hasDss: false },
    { sigDict: secondSig, hasDss: true, hasDocTimestamp: true }
]);
chain.chainLevel;  // 'B-LTA'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/pades/not-dict` | `ParseError` | sigDict is not a dict. |
| `pdf/extra/pades/seed/not-dict` | `ParseError` | `typeSeedValue`: not a dict. |
| `pdf/extra/pades/seed/kind` | `ContractError` | `typeSeedValue`: `kind` not `field`, `cert`, `mdp` or `timeStamp`. |
| `pdf/extra/pades/vri/not-dict` | `ParseError` | `typeVRIEntry`: not a dict. |
| `pdf/extra/pades/build/not-dict` | `ParseError` | `typeBuildData` / `typeBuildProperties`: not a dict. |
| `pdf/extra/pades/build/kind` | `ContractError` | `typeBuildData`: `kind` not `data`, `app` or `sigQ`. |
| `pdf/extra/pades/bad-reference` | `ParseError` | `/Reference` is not an array. |
| `pdf/extra/pades/bad-reference-item` | `ParseError` | An item is not a dict. |
| `pdf/extra/pades/bad-reference-type` | `ParseError` | `/Type` is not `/SigRef`. |
| `pdf/extra/pades/dss-not-dict` | `ParseError` | DSS is not a dict. |
| `pdf/extra/pades/dss-bad-type` | `ParseError` | `/Type` is not `/DSS`. |
| `pdf/extra/pades/dss-bad-array` | `ParseError` | `/Certs`/`/OCSPs`/`/CRLs` is not an array. |
| `pdf/extra/pades/chain/bad-input` | `ParseError` | `validateBLtaChain` argument is not an array. |
| `pdf/extra/pades/chain/missing-sig` | `ParseError` | A step is missing `sigDict`. |

### DocMDP validation issues (non-throwing, returned in `issues`)

| Code | When |
|------|------|
| `pdf/extra/pades/mdp/wrong-transform` | Reference is not a DocMDP transform. |
| `pdf/extra/pades/mdp/missing-params` | `/TransformParams` dict missing. |
| `pdf/extra/pades/mdp/bad-p-type` | `/P` is not an integer. |
| `pdf/extra/pades/mdp/bad-p-value` | `/P` is not 1, 2, or 3. |
| `pdf/extra/pades/mdp/bad-version` | Unknown DocMDP `/V`. |
| `pdf/extra/pades/mdp/missing-digest` | `/DigestMethod` absent on the reference. |

## See also

- [`pdfSignature`](../sig/signature.md)
- [`pdfTimestamp`](../sig/timestamp.md)
- [`pdfSigAesGcm`](./sig-aes-gcm.md)
- [Extras index](./README.md)
