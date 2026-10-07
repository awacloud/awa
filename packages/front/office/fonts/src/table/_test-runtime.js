// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `table/` dependency graph (errors + fw binary reader/writer +
 * primitives + every `table/*` descriptor). Used by sibling tests
 * that need to resolve `<tableX>.factory(...)` after shim removal.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { fontErrors } from '../errors.js';
import { fontFixed } from '../primitives/fixed.js';
import { fontTag } from '../primitives/tag.js';
import { fontChecksum } from '../primitives/checksum.js';
import { fontEncoding } from '../primitives/encoding.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

import { tableAvar } from './avar.js';
import { tableBase } from './base.js';
import { tableCbdt } from './cbdt.js';
import { tableCblc } from './cblc.js';
import { tableCff }  from './cff.js';
import { tableCff2 } from './cff2.js';
import { tableCmap } from './cmap.js';
import { tableColr } from './colr.js';
import { tableCpal } from './cpal.js';
import { tableEbdt } from './ebdt.js';
import { tableEblc } from './eblc.js';
import { tableEbsc } from './ebsc.js';
import { tableFvar } from './fvar.js';
import { tableGasp } from './gasp.js';
import { tableGdef } from './gdef.js';
import { tableGlyf } from './glyf.js';
import { tableGpos } from './gpos.js';
import { tableGsub } from './gsub.js';
import { tableGvar } from './gvar.js';
import { tableHdmx } from './hdmx.js';
import { tableHead } from './head.js';
import { tableHhea } from './hhea.js';
import { tableHmtx } from './hmtx.js';
import { tableHvar } from './hvar.js';
import { tableKern } from './kern.js';
import { tableLoca } from './loca.js';
import { tableLtsh } from './ltsh.js';
import { tableMaxp } from './maxp.js';
import { tableMvar } from './mvar.js';
import { tableName } from './name.js';
import { tableOs2 }  from './os2.js';
import { tablePost } from './post.js';
import { tableSbix } from './sbix.js';
import { tableStat } from './stat.js';
import { tableSvg }  from './svg.js';
import { tableVdmx } from './vdmx.js';
import { tableVhea } from './vhea.js';
import { tableVmtx } from './vmtx.js';
import { tableVorg } from './vorg.js';
import { tableColrPaint } from './colr/paint.js';
import { tableCmapFormats } from './cmap/formats.js';
import { tableCffCharstring } from './cff/charstring.js';
import { tableCffDict } from './cff/dict.js';
import { tableCffIndexRecord } from './cff/index-record.js';
import { tableGsubScriptFeatureList } from './gsub/script-feature-list.js';
import { tableGsubTypes14 } from './gsub/types-1-4.js';
import { tableGsubTypes57 } from './gsub/types-5-7.js';
import { tableGposType1 } from './gpos/type1-single.js';
import { tableGposType2 } from './gpos/type2-pair.js';
import { tableGposType3 } from './gpos/type3-cursive.js';
import { tableGposType46 } from './gpos/type4-6-mark.js';
import { tableGposType78 } from './gpos/type7-8-context.js';
import { tableGposType9 } from './gpos/type9-extension.js';
import { tableGposValueRecord } from './gpos/value-record.js';
import { layoutClassDefinitions } from '../layout/classDefinitions.js';

const _rt = new ModuleRuntime();
_rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
_rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });
for (const m of [
    fontErrors,
    fontFixed, fontTag, fontChecksum, fontEncoding, fontReader, fontWriter,
    tableAvar, tableBase, tableCbdt, tableCblc, tableCff, tableCff2,
    tableCmap, tableColr, tableCpal, tableEbdt, tableEblc, tableEbsc,
    tableFvar, tableGasp, tableGdef, tableGlyf, tableGpos, tableGsub,
    tableGvar, tableHdmx, tableHead, tableHhea, tableHmtx, tableHvar,
    tableKern, tableLoca, tableLtsh, tableMaxp, tableMvar, tableName,
    tableOs2, tablePost, tableSbix, tableStat, tableSvg, tableVdmx,
    tableVhea, tableVmtx, tableVorg,
    tableColrPaint, tableCmapFormats,
    tableCffCharstring, tableCffDict, tableCffIndexRecord,
    tableGsubScriptFeatureList, tableGsubTypes14, tableGsubTypes57,
    tableGposType1, tableGposType2, tableGposType3, tableGposType46,
    tableGposType78, tableGposType9, tableGposValueRecord,
    layoutClassDefinitions
]) _rt.register(m);

export const testRuntime = _rt;
