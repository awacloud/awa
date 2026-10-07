// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-docx-fr-styles-fixture.js
//
// ONE-SHOT generator for the committed `.docx` fixture
// `tests/_fixtures/corpus/docx/docx-fr-styles.docx`. Run once, by hand, from
// the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-docx-fr-styles-fixture.js
//
// Kept in the repo for PROVENANCE ONLY — the tests read the COMMITTED bytes
// and never re-run this script. Do not wire this into `bun test`. A re-run is
// NOT byte-identical (the zip writer stamps a wall-clock DOS date/time), so
// the size and SHA-256 recorded in `corpus/PROVENANCE.md` § 1 must be
// refreshed whenever the fixture is re-cut.
//
// The fixture carries French-LOCALIZED paragraph style IDs (`Titre`,
// `Sous-titre`, `Titre1`..`Titre3`) whose `w:name` values in `styles.xml` are
// the language-invariant built-in names (`Title`, `Subtitle`, `heading 1`..
// `heading 3`) — the shape a French Word installation writes. It proves the
// docx reader resolves heading levels by built-in style NAME, not by ID.
//
// Builds via `@awacloud/ooxml`'s PUBLIC `docx.write(doc, opts)` surface only.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/ooxml';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'corpus', 'docx', 'docx-fr-styles.docx');

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const docxApi = runtime.resolve('docx');

const styles = {
    styles: [
        { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
        { type: 'paragraph', styleId: 'Titre', name: 'Title' },
        { type: 'paragraph', styleId: 'Sous-titre', name: 'Subtitle' },
        { type: 'paragraph', styleId: 'Titre1', name: 'heading 1' },
        { type: 'paragraph', styleId: 'Titre2', name: 'heading 2' },
        { type: 'paragraph', styleId: 'Titre3', name: 'heading 3' }
    ]
};

/** One single-run paragraph, optionally carrying a paragraph style ID. */
function p(text, pStyle) {
    return pStyle
        ? docxApi.paragraph(text, { pPr: { pStyle } })
        : docxApi.paragraph(text);
}

const body = [
    p('Rapport annuel', 'Titre'),
    p('Exercice 2026', 'Sous-titre'),
    p('Introduction', 'Titre1'),
    p('Résumé des activités de l\'année.'),
    p('Contexte', 'Titre2'),
    p('Détails', 'Titre3'),
    p('Fin.')
];

const bytes = docxApi.write({ body }, { styles });
writeFileSync(OUT, bytes);
const sha256 = createHash('sha256').update(bytes).digest('hex');
console.log(`docx-fr-styles.docx\tbytes=${bytes.byteLength}\tsha256=${sha256}`);
