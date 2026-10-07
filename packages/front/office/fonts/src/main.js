// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/fonts/src/main.js
//
// Entry point — declarative manifest of every @awacloud/fonts module factory.
//
// Exports: four manifest arrays, plus every module descriptor of `modules`
// and `bundle` re-exported by its binding name (see the re-export block at
// the end of this file):
//
//   fw_require — fw factory descriptors injected at bundle wiring time
//                (binaryReader, binaryWriter, bitstream, huffman, lz77,
//                deflate, adler32, zlib, brotliDict, brotliDictWords,
//                brotli — dependency-closed).
//   modules    — core local factories, topologically ordered (deps
//                before consumers).
//   extras     — opt-in extras (each wired via `fonts.use(...)`).
//   bundle     — bundle descriptors layering core + extras for
//                `runtime.resolve('fontsLargeBundle' | 'fontsFullBundle'
//                | 'fontsAppleAatBundle')`.
//
// No runtime bootstrap, no re-export of resolved instances, no import
// of generated bundles. Tests materialise via the per-area
// `_test-runtime.js` helpers, and production consumers use the generated
// single-factory bundles under `dist/standalone/` (framework-free).

// --- fw_require — external @awacloud/fw modules consumed by `fwModules` factories.
//
// Every provider's OWN transitive deps must be registered here too, not
// just the provider itself: `zlib` deps `deflate`,`adler32`; `brotli` deps
// `lz77`,`brotliDict`,`brotliDictWords` — without them a runtime built from this
// package's own manifest resolved `fontWoff`/`fontWoff2` but threw
// `Module not found` the first time `brotli`'s (or `zlib`'s) own factory
// actually ran.

import { binaryReader }    from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter }    from '@awacloud/fw/io/binary/writer.js';
import { bitstream }       from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }         from '@awacloud/fw/io/compress/huffman.js';
import { lz77 }            from '@awacloud/fw/io/compress/lz77.js';
import { deflate }         from '@awacloud/fw/io/compress/deflate.js';
import { adler32 }         from '@awacloud/fw/io/calc/adler32.js';
import { zlib }            from '@awacloud/fw/io/compress/zlib.js';
import { brotliDict }      from '@awacloud/fw/io/compress/brotli_dict.js';
import { brotliDictWords } from '@awacloud/fw/io/compress/brotli_dict_words.js';
import { brotli }          from '@awacloud/fw/io/compress/brotli.js';

export const fw_require = [
    binaryReader, binaryWriter,
    bitstream, huffman, lz77, deflate, adler32, zlib,
    brotliDict, brotliDictWords, brotli
];

// --- modules — core local factories, topologically ordered.

import { fontErrors }   from './errors.js';
import { fontsShared }  from './_shared/index.js';
import { fontFixed }    from './primitives/fixed.js';
import { fontTag }      from './primitives/tag.js';
import { fontChecksum } from './primitives/checksum.js';
import { fontEncoding } from './primitives/encoding.js';
import { fontReader }   from './primitives/reader.js';
import { fontWriter }   from './primitives/writer.js';

import { fontSfnt }  from './sfnt/sfnt.js';
import { fontTtc }   from './sfnt/ttc.js';
import { fontWoff }  from './sfnt/woff.js';
import { fontWoff2 } from './sfnt/woff2.js';

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
import { tableCff }  from './table/cff.js';
import { tableKern } from './table/kern.js';
import { tableGasp } from './table/gasp.js';
import { tableHdmx } from './table/hdmx.js';
import { tableVdmx } from './table/vdmx.js';
import { tableLtsh } from './table/ltsh.js';
import { tableGdef } from './table/gdef.js';
import { tableGsub } from './table/gsub.js';
import { tableGpos } from './table/gpos.js';
import { tableFvar } from './table/fvar.js';
import { tableAvar } from './table/avar.js';
import { tableStat } from './table/stat.js';
import { tableGvar } from './table/gvar.js';
import { tableHvar } from './table/hvar.js';
import { tableMvar } from './table/mvar.js';
import { tableBase } from './table/base.js';
import { tableCpal } from './table/cpal.js';
import { tableColr } from './table/colr.js';
import { tableSbix } from './table/sbix.js';
import { tableSvg }  from './table/svg.js';
import { tableCbdt } from './table/cbdt.js';
import { tableCblc } from './table/cblc.js';
import { tableCff2 } from './table/cff2.js';
import { tableVhea } from './table/vhea.js';
import { tableVmtx } from './table/vmtx.js';
import { tableVorg } from './table/vorg.js';
import { tableEbdt } from './table/ebdt.js';
import { tableEblc } from './table/eblc.js';
import { tableEbsc } from './table/ebsc.js';
import { tableCmapFormats } from './table/cmap/formats.js';
import { tableColrPaint } from './table/colr/paint.js';
import { tableCffCharstring } from './table/cff/charstring.js';
import { tableCffDict } from './table/cff/dict.js';
import { tableCffIndexRecord } from './table/cff/index-record.js';
import { tableGsubScriptFeatureList } from './table/gsub/script-feature-list.js';
import { tableGsubTypes14 } from './table/gsub/types-1-4.js';
import { tableGsubTypes57 } from './table/gsub/types-5-7.js';
import { tableGposType1 } from './table/gpos/type1-single.js';
import { tableGposType2 } from './table/gpos/type2-pair.js';
import { tableGposType3 } from './table/gpos/type3-cursive.js';
import { tableGposType46 } from './table/gpos/type4-6-mark.js';
import { tableGposType78 } from './table/gpos/type7-8-context.js';
import { tableGposType9 } from './table/gpos/type9-extension.js';
import { tableGposValueRecord } from './table/gpos/value-record.js';

import { varCoordsConvert } from './variable/coordsConvert.js';
import { varInstance }      from './variable/instance.js';

import { embedClosure }          from './embed-pdf/subsetForPdf/closure.js';
import { embedCmapBuilder }      from './embed-pdf/subsetForPdf/cmap-builder.js';
import { embedGlyphRewriter }    from './embed-pdf/subsetForPdf/glyph-rewriter.js';
import { embedHash }             from './embed-pdf/subsetForPdf/hash.js';
import { embedSubsetForPdf }     from './embed-pdf/subsetForPdf.js';
import { embedFontDescriptor }   from './embed-pdf/fontDescriptor.js';
import { embedCidSystemInfo }    from './embed-pdf/cidSystemInfo.js';
import { embedToUnicodeBuilder } from './embed-pdf/toUnicodeBuilder.js';

import { layoutClassDefinitions } from './layout/classDefinitions.js';
import { cmapToUnicode }          from './cmap/toUnicode.js';

import { standard14Helvetica }    from './standard14/helvetica.js';
import { standard14Times }        from './standard14/times.js';
import { standard14Courier }      from './standard14/courier.js';
import { standard14Symbol }       from './standard14/symbol.js';
import { standard14ZapfDingbats } from './standard14/zapfDingbats.js';
import { standard14Lookup }       from './standard14/lookup.js';

import { encodingWinAnsi }      from './encodings/winAnsi.js';
import { encodingMacRoman }     from './encodings/macRoman.js';
import { encodingMacExpert }    from './encodings/macExpert.js';
import { encodingStandard }     from './encodings/standard.js';
import { encodingSymbol }       from './encodings/symbol.js';
import { encodingZapfDingbats } from './encodings/zapfDingbats.js';
import { encodingLookup }       from './encodings/lookup.js';
import { encodingAglTable }     from './encodings/aglTable.js';
import { encodingAgl }          from './encodings/agl.js';

import { fontPath }             from './glyph/path.js';
import { fontGlyph }            from './glyph/glyph.js';
import { fontCompositeResolve } from './glyph/compositeResolve.js';

import { fonts } from './fonts.js';

/**
 * All @awacloud/fonts core module factories, in a registration-friendly order
 * (dependencies before their dependents).
 */
export const modules = [
    fontErrors,
    fontsShared,
    fontFixed, fontTag, fontChecksum, fontEncoding,
    fontReader, fontWriter,
    fontSfnt, fontTtc, fontWoff, fontWoff2,
    tableHead, tableHhea, tableMaxp, tableHmtx, tableCmap,
    tableName, tableOs2, tablePost, tableLoca, tableGlyf,
    tableCff, tableKern, tableGasp, tableHdmx, tableVdmx, tableLtsh,
    tableGdef, tableGsub, tableGpos, tableFvar, tableAvar, tableStat,
    tableGvar, tableHvar, tableMvar, tableBase,
    tableCpal, tableColr, tableSbix, tableSvg, tableCbdt, tableCblc,
    tableCff2, tableVhea, tableVmtx, tableVorg, tableEbdt, tableEblc, tableEbsc,
    tableCmapFormats, tableColrPaint,
    tableCffCharstring, tableCffDict, tableCffIndexRecord,
    tableGsubScriptFeatureList, tableGsubTypes14, tableGsubTypes57,
    tableGposType1, tableGposType2, tableGposType3, tableGposType46,
    tableGposType78, tableGposType9, tableGposValueRecord,
    varCoordsConvert, varInstance,
    embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash,
    embedSubsetForPdf, embedFontDescriptor, embedCidSystemInfo, embedToUnicodeBuilder,
    layoutClassDefinitions, cmapToUnicode,
    standard14Helvetica, standard14Times, standard14Courier,
    standard14Symbol, standard14ZapfDingbats, standard14Lookup,
    encodingWinAnsi, encodingMacRoman, encodingMacExpert,
    encodingStandard, encodingSymbol, encodingZapfDingbats, encodingLookup,
    encodingAglTable, encodingAgl,
    fontPath, fontGlyph, fontCompositeResolve,
    fonts
];

// --- extras — opt-in. Tree-shaken when unused.

import { extraMath }         from './extra/math.js';
import { extraJstf }         from './extra/jstf.js';
import { extraDsig }         from './extra/dsig.js';
import { extraTtHinting }    from './extra/tt-hinting.js';
import { ttHintingGs }         from './extra/tt-hinting/gs.js';
import { ttHintingOpCatalog }  from './extra/tt-hinting/opcodes-catalog.js';
import { ttHintingOpPush }     from './extra/tt-hinting/opcodes-push.js';
import { ttHintingOpStack }    from './extra/tt-hinting/opcodes-stack.js';
import { ttHintingOpMath }     from './extra/tt-hinting/opcodes-math.js';
import { ttHintingOpControl }  from './extra/tt-hinting/opcodes-control.js';
import { ttHintingOpGs }       from './extra/tt-hinting/opcodes-gs.js';
import { ttHintingOpOutline }  from './extra/tt-hinting/opcodes-outline.js';
import { ttHintingOpCvt }      from './extra/tt-hinting/opcodes-cvt.js';
import { extraShaperArabic } from './extra/shaper-arabic.js';
import { extraShaperIndic }  from './extra/shaper-indic.js';
import { extraShaperCjk }    from './extra/shaper-cjk.js';
import { extraWoff2Write }   from './extra/woff2-write.js';

import { aatMorx } from './extra/apple-aat/morx.js';
import { aatKerx } from './extra/apple-aat/kerx.js';
import { aatAnkr } from './extra/apple-aat/ankr.js';
import { aatProp } from './extra/apple-aat/prop.js';
import { aatLcar } from './extra/apple-aat/lcar.js';
import { aatFeat } from './extra/apple-aat/feat.js';

export const extras = [
    extraMath, extraJstf, extraDsig,
    ttHintingGs, ttHintingOpCatalog,
    ttHintingOpPush, ttHintingOpStack, ttHintingOpMath,
    ttHintingOpControl, ttHintingOpGs, ttHintingOpOutline, ttHintingOpCvt,
    extraTtHinting,
    extraShaperArabic, extraShaperIndic, extraShaperCjk,
    extraWoff2Write,
    aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat
];

// --- bundle — pure fw factory descriptors layering core + extras.

import { fontsLargeBundle }    from './bundles/fonts-large.js';
import { fontsFullBundle }     from './bundles/fonts-full.js';
import { fontsAppleAatBundle } from './bundles/fonts-apple-aat.js';

export const bundle = [fontsLargeBundle, fontsFullBundle, fontsAppleAatBundle];

// --- Additive named descriptor re-exports (clause vi) ----------------------
//
// Every module descriptor already imported above (the `modules` array, plus
// the three bundle descriptors from `bundle`) is re-exported by its binding
// name, so sibling composers can import them via the bare `@awacloud/fonts`
// specifier. Purely additive: these re-exports change none of the four arrays
// above. The generated `dist/build/index.js` barrel re-exports this whole namespace.
export {
    fontErrors,
    fontsShared,
    fontFixed, fontTag, fontChecksum, fontEncoding,
    fontReader, fontWriter,
    fontSfnt, fontTtc, fontWoff, fontWoff2,
    tableHead, tableHhea, tableMaxp, tableHmtx, tableCmap,
    tableName, tableOs2, tablePost, tableLoca, tableGlyf,
    tableCff, tableKern, tableGasp, tableHdmx, tableVdmx, tableLtsh,
    tableGdef, tableGsub, tableGpos, tableFvar, tableAvar, tableStat,
    tableGvar, tableHvar, tableMvar, tableBase,
    tableCpal, tableColr, tableSbix, tableSvg, tableCbdt, tableCblc,
    tableCff2, tableVhea, tableVmtx, tableVorg, tableEbdt, tableEblc, tableEbsc,
    tableCmapFormats, tableColrPaint,
    tableCffCharstring, tableCffDict, tableCffIndexRecord,
    tableGsubScriptFeatureList, tableGsubTypes14, tableGsubTypes57,
    tableGposType1, tableGposType2, tableGposType3, tableGposType46,
    tableGposType78, tableGposType9, tableGposValueRecord,
    varCoordsConvert, varInstance,
    embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash,
    embedSubsetForPdf, embedFontDescriptor, embedCidSystemInfo, embedToUnicodeBuilder,
    layoutClassDefinitions, cmapToUnicode,
    standard14Helvetica, standard14Times, standard14Courier,
    standard14Symbol, standard14ZapfDingbats, standard14Lookup,
    encodingWinAnsi, encodingMacRoman, encodingMacExpert,
    encodingStandard, encodingSymbol, encodingZapfDingbats, encodingLookup,
    encodingAglTable, encodingAgl,
    fontPath, fontGlyph, fontCompositeResolve,
    fonts,
    fontsLargeBundle, fontsFullBundle, fontsAppleAatBundle
};
