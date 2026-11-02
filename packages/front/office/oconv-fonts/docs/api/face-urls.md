---
module: faceUrls
category: office/oconv-fonts
dependencies: []
returns: object
worker-safe: true
status: complete
---

# faceUrls

> The URL of every vendored face — Liberation Sans, Serif and Mono, Carlito
> and Caladea, four styles each — for an application that serves them
> itself. Reads nothing.

**Module** `faceUrls` | **Source**
`packages/front/office/oconv-fonts/src/loader.js` | **Deps** none |
**Worker-safe** yes — it builds `URL` objects only

The vendored families are the metric twins of the fonts office documents
name most: Liberation Sans, Serif and Mono for Arial, Times New Roman and
Courier New; Carlito for Calibri; Caladea for Cambria. A face of the same
metrics keeps a document's line and page breaks where the named font is
missing. This function only says where the files are: it neither fetches
them nor registers anything, and the `oconvDefaultFaces` descriptor (the
[frozen contract](../descriptor.md)) is unchanged — Carlito and Caladea are
not part of its face map.

## Resolve

```js
import { faceUrls } from '@awacloud/oconv-fonts';
```

## Signature

```
faceUrls(opts?: { vendorUrl?: string | URL }) => Readonly<Record<Family, Readonly<{ regular: URL, bold: URL, italic: URL, boldItalic: URL }>>>
```

## Parameters

| Param | Type | Description |
|---|---|---|
| `opts` | `{vendorUrl?: string\|URL}` (optional) | `vendorUrl` — the directory serving this package's `vendor/` tree, for an application that serves it elsewhere (resolved against `src/loader.js`'s own URL, so an absolute or a root-relative value is the expected form; a missing trailing `/` is added). Defaults to `../vendor/` relative to `src/loader.js`. |

## Returns

A frozen map, in this order, of each family to a frozen map of its four
style classes to the `URL` of its file:

| Family | Files under `vendor/` | Licence |
|---|---|---|
| `Liberation Sans` | `liberation/LiberationSans-{Regular,Bold,Italic,BoldItalic}.ttf` | OFL-1.1 |
| `Liberation Serif` | `liberation/LiberationSerif-…` | OFL-1.1 |
| `Liberation Mono` | `liberation/LiberationMono-…` | OFL-1.1 |
| `Carlito` | `carlito/Carlito-…` | OFL-1.1 |
| `Caladea` | `caladea/Caladea-…` | Apache-2.0 |

## Throws

Nothing for a `vendorUrl` the `URL` constructor accepts against the
module's URL; an unparsable value throws the `TypeError` of `new URL`.

## Examples

```js
import { faceUrls } from '@awacloud/oconv-fonts';

// In a browser, served at /assets/fonts/ (a copy of the package's vendor/ tree);
// a root-relative value resolves against the module's own http(s) URL:
const urls = faceUrls({ vendorUrl: '/assets/fonts/' });
urls.Carlito.bold.pathname;   // '/assets/fonts/carlito/Carlito-Bold.ttf'

// One @font-face rule per face, local() first:
const css = Object.entries(urls).flatMap(([family, styles]) =>
    Object.entries(styles).map(([style, url]) => `@font-face { font-family: "${family}"; ` +
        `src: local("${family}"), url("${url.href}") format("truetype"); ` +
        `font-weight: ${style.startsWith('bold') ? 700 : 400}; ` +
        `font-style: ${/italic/i.test(style) ? 'italic' : 'normal'}; }`)).join('\n');
```

## Notes

- Serve the licence and notice files with the faces: `vendor/OFL.txt` and
  `vendor/NOTICE-liberation` (Liberation), `vendor/OFL-carlito.txt` and
  `vendor/NOTICE-carlito` (Carlito), `vendor/LICENSE-apache-2.0.txt` and
  `vendor/NOTICE-caladea` (Caladea) — see the [package
  README](../../README.md#vendored-fonts).
- The faces are whole and unmodified; never pre-subset them (the Reserved
  Font Names of the OFL faces).

## See also

- [`load-default-faces`](./load-default-faces.md) — the byte path of the
  five faces the default route uses.
- [`../descriptor.md`](../descriptor.md) — the frozen `oconvDefaultFaces`
  contract.
- [`./README.md`](./README.md) — the API index.
