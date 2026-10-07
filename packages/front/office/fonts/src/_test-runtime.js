// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the full `fonts/` dependency graph (errors + fw binary
 * reader/writer + fontsShared + primitives + sfnt + core tables +
 * glyph + the `fonts` orchestrator itself). Used by sibling tests
 * that need to call `fonts.factory(...deps)` or invoke `read` / `use`.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { fontErrors } from './errors.js';
import { fontsShared } from './_shared/index.js';
import { fontFixed } from './primitives/fixed.js';
import { fontTag } from './primitives/tag.js';
import { fontChecksum } from './primitives/checksum.js';
import { fontEncoding } from './primitives/encoding.js';
import { fontReader } from './primitives/reader.js';
import { fontWriter } from './primitives/writer.js';
import { fontSfnt } from './sfnt/sfnt.js';
import { tableHead } from './table/head.js';
import { tableHhea } from './table/hhea.js';
import { tableMaxp } from './table/maxp.js';
import { tableHmtx } from './table/hmtx.js';
import { tableCmap } from './table/cmap.js';
import { tableName } from './table/name.js';
import { tableOs2 }  from './table/os2.js';
import { tablePost } from './table/post.js';
import { tableLoca } from './table/loca.js';
import { tableGlyf } from './table/glyf.js';
import { tableGvar } from './table/gvar.js';
import { tableCmapFormats } from './table/cmap/formats.js';
import { fontGlyph } from './glyph/glyph.js';
import { fontPath } from './glyph/path.js';
import { fontCompositeResolve } from './glyph/compositeResolve.js';
import { fonts } from './fonts.js';

const _rt = new ModuleRuntime();
_rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
_rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });
for (const m of [
    fontErrors,
    fontsShared,
    fontFixed, fontTag, fontChecksum, fontEncoding, fontReader, fontWriter,
    fontSfnt,
    tableHead, tableHhea, tableMaxp, tableHmtx, tableCmap, tableName,
    tableOs2, tablePost, tableLoca, tableGlyf, tableGvar, tableCmapFormats,
    fontPath, fontGlyph, fontCompositeResolve,
    fonts
]) _rt.register(m);

export const testRuntime = _rt;
