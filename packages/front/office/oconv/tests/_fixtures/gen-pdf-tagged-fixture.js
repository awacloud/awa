// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-pdf-tagged-fixture.js
//
// ONE-SHOT generator for the committed first-party TAGGED pdf fixture
// `tests/_fixtures/corpus/pdf-tagged/tagged-structured.pdf`. Run once, by
// hand, from the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-pdf-tagged-fixture.js
//
// Kept in the repo for PROVENANCE ONLY (mirroring gen-odt-fixtures.js) — the
// pdf-reader tests read the COMMITTED bytes and never re-run this script. Do
// not wire this into `bun test`.
//
// Built entirely through `@awacloud/pdf`'s PUBLIC write surface: the typed-object
// constructors `pdfParser.obj` (`obj.dict`/`obj.name`/`obj.ref`/`obj.int`/
// `obj.array`/`obj.bool`/`obj.stream`) + the ToUnicode CMap builder from
// `@awacloud/fonts` (`cmapToUnicode.buildToUnicode`) + the document writer via the
// `pdf.write({ indirects, root, version })` façade. NO PDF bytes are
// hand-crafted and NO @awacloud/pdf internal is reached (task 05 hard constraint,
// F8) — the serializer produces every byte. This proves `@awacloud/pdf`'s public
// write surface CAN emit a valid `/StructTreeRoot` tagged document, so task
// 05 ships the tagged fast path rather than recording missing-input.
//
// The document is a single tagged page whose logical structure is:
//   H1  "Quarterly Report"            (MCID 0)
//   P   "This report summarizes …"    (MCID 1)
//   H2  "Details"                     (MCID 2)
//   P   "Revenue grew across …"       (MCID 3)
//   Table                              (container, no own content)
//     └ P "Cell one"                  (MCID 4)
//     └ P "Cell two"                  (MCID 5)
// exercising heading-level mapping, paragraph mapping, and the `Table`
// container flatten (`struct/dropped`, descendant text kept). The font is
// standard-14 Helvetica carrying a ToUnicode CMap so the text decodes through
// the ToUnicode path independent of the AGL named-glyph table's vendoring
// state (task 02).

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../../../pdf/src/main.js';

const rt = new ModuleRuntime();
rt.registerAll(fw_require);
rt.registerAll(pkg_require);
rt.registerAll(modules);

const pdf = rt.resolve('pdf');
const obj = rt.resolve('pdfParser').obj;
const cmap = rt.resolve('cmapToUnicode');
const enc = (s) => new TextEncoder().encode(s);

// ToUnicode CMap for printable ASCII (code → same code point).
const uMap = new Map();
for (let c = 0x20; c <= 0x7e; c++) uMap.set(c, String.fromCharCode(c));
const toUnicodeSrc = cmap.buildToUnicode(uMap);

// Object numbers.
const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4, FONT = 5, TOUNI = 6,
    STROOT = 7, H1 = 8, P1 = 9, H2 = 10, P2 = 11, TABLE = 12, C1 = 13, C2 = 14;

const content =
    '/H1 <</MCID 0>> BDC BT /F1 24 Tf 72 720 Td (Quarterly Report) Tj ET EMC\n' +
    '/P <</MCID 1>> BDC BT /F1 12 Tf 72 690 Td (This report summarizes the quarter.) Tj ET EMC\n' +
    '/H2 <</MCID 2>> BDC BT /F1 18 Tf 72 660 Td (Details) Tj ET EMC\n' +
    '/P <</MCID 3>> BDC BT /F1 12 Tf 72 640 Td (Revenue grew across all regions.) Tj ET EMC\n' +
    '/P <</MCID 4>> BDC BT /F1 12 Tf 72 610 Td (Cell one) Tj ET EMC\n' +
    '/P <</MCID 5>> BDC BT /F1 12 Tf 72 590 Td (Cell two) Tj ET EMC\n';

const structElem = (S, Pparent, K) => obj.dict({
    Type: obj.name('StructElem'),
    S: obj.name(S),
    P: obj.ref(Pparent, 0),
    Pg: obj.ref(PAGE, 0),
    K: K
});

const indirects = [
    { num: CATALOG, gen: 0, value: obj.dict({
        Type: obj.name('Catalog'),
        Pages: obj.ref(PAGES, 0),
        MarkInfo: obj.dict({ Marked: obj.bool(true) }),
        StructTreeRoot: obj.ref(STROOT, 0)
    }) },
    { num: PAGES, gen: 0, value: obj.dict({
        Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1)
    }) },
    { num: PAGE, gen: 0, value: obj.dict({
        Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
        MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
        Contents: obj.ref(CONTENT, 0),
        StructParents: obj.int(0),
        Tabs: obj.name('S'),
        Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(FONT, 0) }) })
    }) },
    { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
    { num: FONT, gen: 0, value: obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type1'),
        BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
    }) },
    { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUnicodeSrc.length) }), enc(toUnicodeSrc)) },
    { num: STROOT, gen: 0, value: obj.dict({
        Type: obj.name('StructTreeRoot'),
        K: obj.array([
            obj.ref(H1, 0), obj.ref(P1, 0), obj.ref(H2, 0),
            obj.ref(P2, 0), obj.ref(TABLE, 0)
        ])
    }) },
    { num: H1, gen: 0, value: structElem('H1', STROOT, obj.int(0)) },
    { num: P1, gen: 0, value: structElem('P', STROOT, obj.int(1)) },
    { num: H2, gen: 0, value: structElem('H2', STROOT, obj.int(2)) },
    { num: P2, gen: 0, value: structElem('P', STROOT, obj.int(3)) },
    { num: TABLE, gen: 0, value: obj.dict({
        Type: obj.name('StructElem'), S: obj.name('Table'),
        P: obj.ref(STROOT, 0), Pg: obj.ref(PAGE, 0),
        K: obj.array([obj.ref(C1, 0), obj.ref(C2, 0)])
    }) },
    { num: C1, gen: 0, value: structElem('P', TABLE, obj.int(4)) },
    { num: C2, gen: 0, value: structElem('P', TABLE, obj.int(5)) }
];

const bytes = pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'corpus', 'pdf-tagged');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'tagged-structured.pdf');
writeFileSync(outPath, bytes);

const sha = createHash('sha256').update(bytes).digest('hex');
console.log(`wrote ${outPath}`);
console.log(`bytes: ${bytes.length}`);
console.log(`sha256: ${sha}`);
