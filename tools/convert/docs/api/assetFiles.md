# `assetFiles`

Splits a [`toMd`](./toMd.md) asset manifest into the files a caller may
write under a directory of its choice and the assets it must not write.
Pure: it writes nothing. The CLI's `--assets-dir` and the MCP `assetsDir`
argument write what it accepts.

```ts
function assetFiles(assets: Asset[]): { files: { name: string; bytes: Uint8Array }[]; skipped: SkippedAsset[] }
```

## Input

| Field | Type | Meaning |
|---|---|---|
| `assets` | [`Asset[]`](./types.md#asset) | The `assets` of a [`ToMdOutput`](./types.md#tomdoutput). |

## Output

| Field | Type | Meaning |
|---|---|---|
| `files` | `{ name, bytes }[]` | The assets to write, in manifest order: each one at `<dir>/<name>`, the relative path the markdown names. |
| `skipped` | [`SkippedAsset[]`](./types.md#skippedasset) | The other assets, each with its `reason`. |

An asset is written when it has `bytes` and a safe name. A name is safe
when it stays inside the directory: its `/`- or `\`-separated segments are
none empty, `.` or `..`, and it holds no `:` (a Windows drive or stream).
`media/image1.png` is safe and lands in a `media` sub-directory;
`../escape.png`, `/abs.png` and `C:x.png` are not.

## Errors

None: the function never throws. An unsafe name is a `skipped` entry with
`reason: 'unsafe name'`, an asset without bytes one with
`reason: 'no bytes'` (a docx picture whose part did not resolve, for
instance).

## Example

`picture.pdf` is a one-page pdf with one JPEG picture.

```ts
import { readFileSync } from 'node:fs';
import { assetFiles, toMd } from '@awacloud/tool-convert';

const bytes = new Uint8Array(readFileSync('picture.pdf'));
const result = await toMd({ name: 'picture.pdf', bytes, convertedAt: '2026-01-01T00:00:00.000Z', pdfInclude: ['images'] });
const { files, skipped } = assetFiles([...result.assets, { kind: 'image', name: '../escape.png', bytes: new Uint8Array(1) }, { kind: 'image', name: 'Grafik 1' }]);
console.log(files.map((f) => [f.name, f.bytes.length]), skipped);
```

Output:

```text
[
  [ "image-7.jpg", 10 ]
] [
  {
    name: "../escape.png",
    reason: "unsafe name",
  }, {
    name: "Grafik 1",
    reason: "no bytes",
  }
]
```

See also: [`to-md --assets-dir`](./cli.md#to-md) (CLI), [`to_md`
`assetsDir`](./mcp.md#to_md) (MCP).
