// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-ods-fixtures.js
//
// ONE-SHOT generator for the committed `.ods` fixture under
// `tests/_fixtures/corpus/ods/`. Run once, by hand, from the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-ods-fixtures.js
//
// Kept in the repo for PROVENANCE ONLY (mirrors `gen-odt-fixtures.js`'s own
// precedent, BATCH_11 task 06) — a future fidelity harness reads the
// COMMITTED bytes and never re-runs this script. Do not wire this into
// `bun test`.
//
// Builds via `@awacloud/odf`'s PUBLIC `ods.write(doc, opts)` surface only (the
// same composition pattern `oconvOdsToIr`'s own tests use — see
// `src/read/ods-to-ir.test.js`). One fixture:
//
//  - `ods-structured.ods` — two `<table:table>` sheets:
//    - `Data`: a header row (`table:table-header-rows`) + two data rows
//      mixing string/number/boolean/date typed cells, a genuine formula
//      cell (cached value + `table:formula`), and a trailing all-empty
//      row + an all-empty trailing column — exercises the reader's
//      heading/table mapping, `sheet/formula-as-value`, and the shared
//      `sheet-grid.js` trailing-empty trim against a real (if first-party)
//      file, mirroring `odt-structured.odt`'s scope for the text reader.
//    - `Empty`: zero rows — exercises the "empty sheet inside a multi-sheet
//      workbook" case.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/odf';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'corpus', 'ods');

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const ods = runtime.resolve('ods');

const dataTable = {
    type: 'table',
    name: 'Data',
    columns: [],
    headerRows: 1,
    rows: [
        {
            type: 'row',
            cells: [
                ods.cell('Name'), ods.cell('Score'), ods.cell('Active'),
                ods.cell('Joined'), ods.cell('')
            ]
        },
        {
            type: 'row',
            cells: [
                ods.cell('Alice'), ods.cell(85), ods.cell(true),
                ods.cell(new Date('2026-01-15T00:00:00Z')), ods.cell('')
            ]
        },
        {
            type: 'row',
            cells: [
                ods.cell('Bob'),
                ods.cell(42, { formula: 'of:=SUM([.B2];[.B3])' }),
                ods.cell(false),
                ods.cell(new Date('2026-02-20T00:00:00Z')),
                ods.cell('')
            ]
        },
        {
            type: 'row',
            cells: [
                ods.cell(''), ods.cell(''), ods.cell(''), ods.cell(''), ods.cell('')
            ]
        }
    ]
};

const emptyTable = { type: 'table', name: 'Empty', columns: [], rows: [] };

const doc = { spreadsheet: { tables: [dataTable, emptyTable] } };

/** @param {string} name @param {object} d */
function writeFixture(name, d) {
    const bytes = ods.write(d, { meta: { title: name, creator: '@awacloud/oconv fixture generator' } });
    const path = join(OUT_DIR, name);
    writeFileSync(path, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    console.log(`${name}\tbytes=${bytes.byteLength}\tsha256=${sha256}`);
}

writeFixture('ods-structured.ods', doc);
