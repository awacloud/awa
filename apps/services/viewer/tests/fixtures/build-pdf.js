// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Builds encrypted copies of the corpus's tagged PDF with
 * `@awacloud/pdf`'s own `pdfEncryptedWriter`:
 * - `owner-only-aes256.pdf` — V5 R6 AES-256, empty user password (opens);
 * - `owner-only-rc4.pdf` — V4 R4 RC4-128, empty user password (opens);
 * - `user-password.pdf` — V5 R6 with a user password (must be refused).
 * Deterministic randomness: the outputs are stable and committed.
 *
 * Run: `bun apps/services/viewer/tests/fixtures/build-pdf.js`
 *
 * @module viewer/tests/fixtures/build-pdf
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pdf, pdfEncryptedWriter, pdfWriter } from '@awacloud/pdf';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rt = new ModuleRuntime();
rt.registerAllDeep([pdf, pdfEncryptedWriter, pdfWriter]);
const source = new Uint8Array(readFileSync(new URL('../../../../../packages/front/office/oconv/tests/_fixtures/corpus/pdf-tagged/tagged-structured.pdf', import.meta.url)));
const doc = rt.resolve('pdf').read(source);
// Every object of the source, as the writer's ordered list.
const indirects = rt.resolve('pdfWriter').assembleIndirects(doc);

/** A deterministic byte source (test fixtures only — never for real keys). */
function seeded(seed) {
    let x = seed >>> 0;
    return (n) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) { x = (x * 1664525 + 1013904223) >>> 0; out[i] = x >>> 24; }
        return out;
    };
}

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const write = (file, encrypt) => {
    const out = rt.resolve('pdfEncryptedWriter').writeEncryptedDocument({
        indirects, root: doc.trailer.root, encrypt: { permissions: -3904, ...encrypt }
    });
    writeFileSync(here(file), out.bytes);
};
write('owner-only-aes256.pdf', { version: 5, revision: 6, ownerPassword: 'owner', userPassword: '', randomBytes: seeded(1) });
write('owner-only-rc4.pdf', { version: 4, revision: 4, method: 'V2', ownerPassword: 'owner', userPassword: '', randomBytes: seeded(2) });
write('user-password.pdf', { version: 5, revision: 6, ownerPassword: 'owner', userPassword: 'secret', randomBytes: seeded(3) });
