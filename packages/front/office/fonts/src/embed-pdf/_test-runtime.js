// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `embed-pdf/` dependency graph. Used by sibling tests that
 * need to resolve `<descriptor>.factory(...)` results without relying
 * on top-level shims.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { fontErrors } from '../errors.js';
import { fontsShared } from '../_shared/index.js';
import { fontFixed } from '../primitives/fixed.js';
import { fontTag } from '../primitives/tag.js';
import { fontChecksum } from '../primitives/checksum.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { fontSfnt } from '../sfnt/sfnt.js';
import { tableHead } from '../table/head.js';
import { tableHhea } from '../table/hhea.js';
import { tableMaxp } from '../table/maxp.js';
import { tableHmtx } from '../table/hmtx.js';
import { tableLoca } from '../table/loca.js';
import { cmapToUnicode } from '../cmap/toUnicode.js';
import { embedFontDescriptor } from './fontDescriptor.js';
import { embedCidSystemInfo } from './cidSystemInfo.js';
import { embedToUnicodeBuilder } from './toUnicodeBuilder.js';
import { embedClosure } from './subsetForPdf/closure.js';
import { embedCmapBuilder } from './subsetForPdf/cmap-builder.js';
import { embedGlyphRewriter } from './subsetForPdf/glyph-rewriter.js';
import { embedHash } from './subsetForPdf/hash.js';
import { embedSubsetForPdf } from './subsetForPdf.js';

const _rt = new ModuleRuntime();
_rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
_rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });
for (const m of [
    fontErrors,
    fontsShared,
    fontFixed, fontTag, fontChecksum, fontReader, fontWriter,
    fontSfnt,
    tableHead, tableHhea, tableMaxp, tableHmtx, tableLoca,
    cmapToUnicode,
    embedFontDescriptor,
    embedCidSystemInfo,
    embedToUnicodeBuilder,
    embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash,
    embedSubsetForPdf
]) _rt.register(m);

export const testRuntime = _rt;
