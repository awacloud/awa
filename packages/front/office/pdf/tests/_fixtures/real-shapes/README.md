# `real-shapes` fixtures

These are minimal, hand-built PDFs for two of the three shapes measured on
2026-09-22 against `references/ANSSI/`. office/BATCH_41 task 01 committed
them as red fixtures that reproduced the failures. Task 03 fixed the read
path, and both now **read**. They stay as the permanent regression
fixtures for those shapes. The third shape (unresolvable-font text runs)
is built inline in `oconv/tests/pdf-text-quality.integration.test.js` and
needs no committed bytes.

**The real ANSSI PDFs are never committed here or anywhere else in this
package.** They are third-party documents with no redistribution ruling.
They are git-ignored and fetched by `tools/references` from
`references/ANSSI/sources.json`. Only the opt-in leg driven by
`tests/_helpers/anssi-corpus.js` reads them, and only when they are present.

| File | Shape | Pre-fix (task 01) | Now | Backlog |
|---|---|---|---|---|
| `xref-stream-update-missing-root.pdf` | Two `/Type /XRef` streams (a base and an incremental update). The update carries `/Size` and `/Prev` but not `/Root`. | `pdf/trailer/missing-root`: the section walk typed every section's trailer on its own. | Reads 1 page. The trailer is the newest-first merge of every section's dict, so `/Root` comes from the base. The real `anssi-fondamentaux-zero-trust-v1.0.pdf` has the reverse shape: it is linearized, its newest (first-page) stream carries `/Root`, and the main stream does not. | BL-1544 |
| `free-object-referenced-by-kids.pdf` | A classical incremental update marks object 4 free, while the Pages `/Kids` still references it. | `pdf/document/free-object`, "object 4 is free". | Reads 2 pages. The object resolves through the older section that still defines it, and a `pdf/document/free-entry-fallback` loss is recorded in `doc.losses`. | BL-1545 |

**BL-1545 on the real document had a different cause.** On
`anssi-guide-mecanismes-crypto-3.00.pdf`, object 1505 is the **catalog**.
It read as "free" only because the file's `/Predictor 12` xref streams were
mis-decoded: `/DecodeParms` did not reach the decoder (BL-1531, fixed by
BATCH_41 task 04). With that fix, the document reads 81 pages and records no
loss. So this fixture guards the free-entry handling itself, which is
hardening rather than the fix for that file.

Both fixtures are read with `bun test packages/front/office/pdf/tests/real-shapes.integration.test.js`.

## `pdfSign.sign()` fixtures (office/BATCH_42 task 01, BL-1565/BL-1566)

Two more minimal PDFs exercise **signing** over an xref-stream /
object-stream base. They reproduce the two failures measured on 2026-09-23
while signing the real ANSSI documents (office/BATCH_41/06). On that date
`sign.js` writes `/Root 1 0 R` into every incremental section, whatever the
base's real catalog is. It takes its next object number from the highest
uncompressed `N 0 obj` header when the base has no `trailer` keyword, and
that header never sees objects compressed inside a `/Type /ObjStm`. Its
LT/LTA path finds the catalog by a literal `1 0 obj` text scan, which a
compressed catalog never matches.

`tests/sign-real-shapes.integration.test.js` asserts the correct behaviour
on both: `sign()` returns bytes, every signature verifies, the signed file
reads with the same page count, the new `/Sig` object number is not a live
base object, and a second `sign()` passes the same checks. Task 01 commits
them red. Task 02 fixes `sign.js` and turns them green. The classical-table
control (F3) is `buildDocument()` from `tests/_helpers/build.js`, so it has
no committed bytes.

| File | Shape | Pins | Pre-fix (task 01, measured) | Backlog |
|---|---|---|---|---|
| `sign-catalog-in-objstm.pdf` (F1, 528 B) | PDF 1.5, xref stream only (no `xref` or `trailer` keyword). Pages=1, Catalog=2 and Page=3 are compressed in ObjStm 5. Content=4 is uncompressed. The xref stream is object 6 and carries `/Root 2 0 R`. | The written `/Root` must be the base's real catalog, and LT/LTA must find a compressed catalog. The next object number (7) does not collide, so this fixture isolates the `/Root` half. | B/T: `readDocument(signed)` throws `pdf/catalog/bad-type`, because `/Root 1 0 R` resolves to the Pages dict. LT/LTA: `sign()` throws `pdf/sign/catalog-not-found`. | BL-1565, BL-1566 |
| `sign-nextobjnum-collision.pdf` (F2, 546 B) | PDF 1.5, xref stream only. Catalog=1, Pages=2, Content=3 and ObjStm=4 are uncompressed. The xref stream is object 5 with `/Size 7`. Page=6 is compressed in ObjStm 4. The highest `N 0 obj` header is 5. | The new `/Sig` number must come from the base's xref (`/Size`), not from the highest uncompressed header. `/Root 1 0 R` is correct here, so this fixture isolates the collision half. | All levels: the `/Sig` is written as object 6, which is the live compressed Page. `readDocument(signed)` throws `pdf/pages/missing-kids`, while `verifyAllSignatures` still reports `verified: true`. | BL-1565 |

The bytes are deterministic. This script regenerates them exactly
(`bun gen-sign-fixtures.js <out-dir>`, then compare with `cmp`):

```js
// Regenerates sign-catalog-in-objstm.pdf (F1) and sign-nextobjnum-collision.pdf (F2).
// Usage: bun gen-sign-fixtures.js <out-dir>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const CONTENT = 'BT /F1 12 Tf 72 700 Td (sign real shape) Tj ET';
const stream = (dict, data) => `<< ${dict} >>\nstream\n${data}\nendstream`;

/** An uncompressed /Type /ObjStm body: "num off ..." header, one member per line. */
function objStm(members) {
    let header = '', body = '';
    for (const [num, text] of members) {
        header += `${header ? ' ' : ''}${num} ${body.length}`;
        body += text + '\n';
    }
    header += '\n';
    const data = header + body + '\n';
    return stream(`/Type /ObjStm /N ${members.length} /First ${header.length} /Length ${data.length}`, data.slice(0, -1));
}

/** xref-STREAM-only PDF 1.5: no `xref` keyword, no `trailer` keyword. */
function build({ plain, compressed, xrefNum, size, root }) {
    let s = '%PDF-1.5\n%\xE2\xE3\xCF\xD3\n';
    const off = {};
    for (const [num, text] of plain) { off[num] = s.length; s += `${num} 0 obj\n${text}\nendobj\n`; }
    off[xrefNum] = s.length;
    let bin = '';
    for (let n = 0; n < size; n++) {
        const [t, f2, f3] = n === 0 ? [0, 0, 0xffff]
            : compressed[n] ? [2, compressed[n][0], compressed[n][1]]
            : [1, off[n], 0];
        bin += String.fromCharCode(t, (f2 >>> 24) & 255, (f2 >>> 16) & 255, (f2 >>> 8) & 255, f2 & 255,
            (f3 >>> 8) & 255, f3 & 255);
    }
    s += `${xrefNum} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Index [0 ${size}] /Root ${root} 0 R`
        + ` /Length ${bin.length} >>\nstream\n${bin}\nendstream\nendobj\n`
        + `startxref\n${off[xrefNum]}\n%%EOF\n`;
    return latin1(s);
}

// F1 — Pages=1, Catalog=2, Page=3 compressed in ObjStm 5; Content=4; xref stream=6; /Root 2 0 R.
const f1 = build({
    plain: [
        [4, stream(`/Length ${CONTENT.length}`, CONTENT)],
        [5, objStm([
            [1, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
            [2, '<< /Type /Catalog /Pages 1 0 R >>'],
            [3, '<< /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>']
        ])]
    ],
    compressed: { 1: [5, 0], 2: [5, 1], 3: [5, 2] }, xrefNum: 6, size: 7, root: 2
});

// F2 — Catalog=1, Pages=2, Content=3, ObjStm=4 uncompressed; xref stream=5; Page=6 compressed in ObjStm 4.
const f2 = build({
    plain: [
        [1, '<< /Type /Catalog /Pages 2 0 R >>'],
        [2, '<< /Type /Pages /Kids [6 0 R] /Count 1 >>'],
        [3, stream(`/Length ${CONTENT.length}`, CONTENT)],
        [4, objStm([[6, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 3 0 R >>']])]
    ],
    compressed: { 6: [4, 0] }, xrefNum: 5, size: 7, root: 1
});

const out = process.argv[2] || '.';
writeFileSync(join(out, 'sign-catalog-in-objstm.pdf'), f1);
writeFileSync(join(out, 'sign-nextobjnum-collision.pdf'), f2);
```

SHA-256: `sign-catalog-in-objstm.pdf`
`1565f3b79316446e934e1c05bccbfbcb1489fde39c3033f51d5178e65f4d27af`,
`sign-nextobjnum-collision.pdf`
`1ef11613e6d1982090ee528ca990b10a7e8e56773f75b7a63f612266d6e39d7b`.

Signed with `bun test packages/front/office/pdf/tests/sign-real-shapes.integration.test.js`.
