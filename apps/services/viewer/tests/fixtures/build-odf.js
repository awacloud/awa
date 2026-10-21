// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Builds the viewer's OpenDocument test fixtures
 * (`rich.odt`, `rich.ods`, `rich.odp`) with fw `zip`: hand-written XML in the
 * shape LibreOffice writes — named and automatic styles, lists, a table with
 * merged and shaded cells, an image, a page break, a master-page footer.
 * The repository's ODF corpus carries no styles at all; these exercise the
 * painters' style cascade.
 *
 * Run: `bun apps/services/viewer/tests/fixtures/build-odf.js` (rewrites the
 * three files next to this script; the output is committed).
 *
 * @module viewer/tests/fixtures/build-odf
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zip as zipModule } from '@awacloud/fw/io/compress/zip.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ODT, ODS, ODP, PNG_BASE64 } from './odf-sources.js';

const rt = new ModuleRuntime();
rt.registerDeep(zipModule);
const zip = rt.resolve('zip');
const enc = (s) => new TextEncoder().encode(s);

/**
 * @param {string} mime
 * @param {{content: string, styles: string, meta: string}} parts
 */
function pack(mime, parts) {
    const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="Pictures/img.png" manifest:media-type="image/png"/></manifest:manifest>`;
    // `mimetype` first and stored: the ODF signature (detect.js reads it).
    return zip.zipSync({
        mimetype: [enc(mime), { level: 0 }],
        'content.xml': enc(parts.content),
        'styles.xml': enc(parts.styles),
        'meta.xml': enc(parts.meta),
        'META-INF/manifest.xml': enc(manifest),
        'Pictures/img.png': [Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0)), { level: 0 }]
    });
}

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
writeFileSync(here('rich.odt'), pack('application/vnd.oasis.opendocument.text', ODT));
writeFileSync(here('rich.ods'), pack('application/vnd.oasis.opendocument.spreadsheet', ODS));
writeFileSync(here('rich.odp'), pack('application/vnd.oasis.opendocument.presentation', ODP));
