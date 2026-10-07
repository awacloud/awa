// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `extra/` dependency graph (errors + shared + primitives +
 * sfnt + fw binary reader/writer + brotli + every `extra/*` and
 * `extra/apple-aat/*` descriptor). Used by sibling tests that need to
 * resolve `<descriptor>.factory(...deps)` after shim removal.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32 }   from '@awacloud/fw/io/calc/adler32.js';
import { zlib }      from '@awacloud/fw/io/compress/zlib.js';
import { brotli }    from '@awacloud/fw/io/compress/brotli.js';
import { brotliDict }      from '@awacloud/fw/io/compress/brotli_dict.js';
import { brotliDictWords } from '@awacloud/fw/io/compress/brotli_dict_words.js';
import { fontErrors } from '../errors.js';
import { fontsShared } from '../_shared/index.js';
import { fontFixed } from '../primitives/fixed.js';
import { fontTag } from '../primitives/tag.js';
import { fontChecksum } from '../primitives/checksum.js';
import { fontEncoding } from '../primitives/encoding.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { fontSfnt } from '../sfnt/sfnt.js';
import { fontWoff2 } from '../sfnt/woff2.js';
import { extraDsig } from './dsig.js';
import { extraJstf } from './jstf.js';
import { extraMath } from './math.js';
import { extraShaperArabic } from './shaper-arabic.js';
import { extraShaperCjk } from './shaper-cjk.js';
import { extraShaperIndic } from './shaper-indic.js';
import { extraTtHinting } from './tt-hinting.js';
import { ttHintingGs } from './tt-hinting/gs.js';
import { ttHintingOpCatalog } from './tt-hinting/opcodes-catalog.js';
import { ttHintingOpPush } from './tt-hinting/opcodes-push.js';
import { ttHintingOpStack } from './tt-hinting/opcodes-stack.js';
import { ttHintingOpMath } from './tt-hinting/opcodes-math.js';
import { ttHintingOpControl } from './tt-hinting/opcodes-control.js';
import { ttHintingOpGs } from './tt-hinting/opcodes-gs.js';
import { ttHintingOpOutline } from './tt-hinting/opcodes-outline.js';
import { ttHintingOpCvt } from './tt-hinting/opcodes-cvt.js';
import { extraWoff2Write } from './woff2-write.js';
import { aatAnkr } from './apple-aat/ankr.js';
import { aatFeat } from './apple-aat/feat.js';
import { aatKerx } from './apple-aat/kerx.js';
import { aatLcar } from './apple-aat/lcar.js';
import { aatMorx } from './apple-aat/morx.js';
import { aatProp } from './apple-aat/prop.js';

const _rt = new ModuleRuntime();

// Adapter modules that wrap fw modules expected by name.
_rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
_rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });

// fw compression chain — registered by name so brotli-consuming modules resolve.
const _bs = bitstream.factory();
const _hu = huffman.factory(_bs);
const _lz = lz77.factory();
const _deflate = deflate.factory(_bs, _hu, _lz);
const _adler = adler32.factory();
const _zlib = zlib.factory(_deflate, _adler);
// Fully wired brotli: the compressor needs lz77 for any non-trivial input;
// the static-dictionary pair stays inert until a blob is loaded (none here).
const _brotli = brotli.factory(_bs, _hu, _lz, brotliDict.factory(), brotliDictWords.factory());
_rt.register({ name: 'zlib',   dependencies: [], factory: () => _zlib });
_rt.register({ name: 'brotli', dependencies: [], factory: () => _brotli });

_rt.register(fontErrors);
_rt.register(fontsShared);
_rt.register(fontFixed);
_rt.register(fontTag);
_rt.register(fontChecksum);
_rt.register(fontEncoding);
_rt.register(fontReader);
_rt.register(fontWriter);
_rt.register(fontSfnt);
_rt.register(fontWoff2);
_rt.register(extraDsig);
_rt.register(extraJstf);
_rt.register(extraMath);
_rt.register(extraShaperArabic);
_rt.register(extraShaperCjk);
_rt.register(extraShaperIndic);
_rt.register(ttHintingGs);
_rt.register(ttHintingOpCatalog);
_rt.register(ttHintingOpPush);
_rt.register(ttHintingOpStack);
_rt.register(ttHintingOpMath);
_rt.register(ttHintingOpControl);
_rt.register(ttHintingOpGs);
_rt.register(ttHintingOpOutline);
_rt.register(ttHintingOpCvt);
_rt.register(extraTtHinting);
_rt.register(extraWoff2Write);
_rt.register(aatAnkr);
_rt.register(aatFeat);
_rt.register(aatKerx);
_rt.register(aatLcar);
_rt.register(aatMorx);
_rt.register(aatProp);

export const testRuntime = _rt;
