// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Shared Brotli - RFC 9841 (Shared Brotli Compressed Data Format).
 *
 * Companion module to `brotli` that adds the RFC 9841 extensions on top of
 * the RFC 7932 base codec:
 *
 *   - §3.1   Custom static dictionary (multi-dict + context map + ShiftFirst /
 *            ShiftAll transforms)
 *   - §3.2   Shared LZ77 dictionary (virtual output prefix)
 *   - §5     Shared Dictionary Stream container (`parseSharedDictionary`)
 *   - §6     Large window mode (`allowLargeWindow`)
 *   - §8     Framing format is handled by the separate `brotliFrame` module.
 *
 * ## Why a separate module?
 *
 * RFC 7932 (`brotli`) is a complete, stable codec. RFC 9841 is a strict
 * superset that adds features absent from the base spec. Keeping the
 * two concerns in separate modules:
 *
 *   - lets consumers that only need RFC 7932 avoid importing the §5 parser
 *     and the custom-transform helpers (smaller surface, cleaner audits);
 *   - keeps the entry point unambiguous - if you reach for `brotliShared`
 *     you know you're opting into the extension semantics;
 *   - makes the test surface tractable per-spec (the brotli.test.js suite
 *     is RFC 7932 only, brotli_shared.test.js is RFC 9841 only).
 *
 * `brotli_shared` *depends on* `brotli`. It wires RFC 9841 features into
 * brotli's internal extension hooks (`opts._ext`) so that the underlying
 * decoder/encoder loop is shared and not duplicated. The hooks are:
 *
 * | Hook | Purpose |
 * |---|---|
 * | `_ext.allowLargeWindow` | Permit the §6 large-window WBITS prefix |
 * | `_ext.lz77Dict` | Virtual output prefix for §3.2 distance redirection |
 * | `_ext.resolveStaticDictRef` | Override the RFC 7932 dict-ref path (§3.1 custom dicts) |
 * | `_ext.lz77Prefix` | Encoder-side prefix for §3.2 shared LZ77 dict |
 *
 * ## API
 *
 * | Method | Description |
 * |---|---|
 * | `brotliDecompressSync(buf, opts?)` | Like `brotli.brotliDecompressSync` but accepts `opts.allowLargeWindow` and `opts.sharedDictionary` |
 * | `brotliDecompress(buf, opts?)` | Async variant |
 * | `brotliCompressSync(data, opts?)` | Like `brotli.brotliCompressSync` with shared-LZ77-dict support |
 * | `brotliCompress(data, opts?)` | Async variant |
 * | `BrotliCompressStream(opts?, ondata?)` | Streaming compressor with RFC 9841 opts |
 * | `BrotliDecompressStream(opts?, ondata?)` | Streaming decompressor with RFC 9841 opts |
 * | `parseSharedDictionary(buf)` | RFC 9841 §5 - parse a shared-dictionary stream |
 *
 */

import { brotli } from './brotli.js';
import { brotliDict } from './brotli_dict.js';
import { brotliDictWords } from './brotli_dict_words.js';

/**
 * Streaming wrapper instance (RFC 9841-aware).
 * @typedef {object} BrotliSharedStreamInstance
 * @property {(chunk: Uint8Array, final?: boolean) => void} push Push a chunk into the underlying brotli stream.
 */

/**
 * Constructor for a shared-brotli streaming wrapper.
 * @typedef {new (opts?: object, ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => BrotliSharedStreamInstance} BrotliSharedStreamCtor
 */

/**
 * Result of `parseSharedDictionary` (RFC 9841 §5).
 * @typedef {object} BrotliSharedDictionary
 * @property {Uint8Array|null} lz77Dict Shared LZ77 dictionary, or `null`.
 * @property {Array<{ sizeBits: Uint8Array, offsets: Int32Array, words: Uint8Array }>} wordLists Custom word lists.
 * @property {Array<{ stringlets: Uint8Array[], transforms: Array<{ prefixIdx: number, suffixIdx: number, opIdx: number, param: number }> }>} transformLists Custom transform lists.
 * @property {Array<{ wordListIdx: number, transformListIdx: number }>|null} dictionaryMap Dictionary map, or `null`.
 * @property {Uint8Array|null} contextMap 64-entry context map, or `null`.
 * @property {number} bytesConsumed Number of bytes consumed from the input.
 */

/**
 * Public surface of `brotliShared.factory(...)`.
 * @typedef {object} BrotliSharedAPI
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} brotliCompressSync RFC 9841-aware sync compression.
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} brotliDecompressSync RFC 9841-aware sync decompression.
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} brotliCompress Async compression.
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} brotliDecompress Async decompression.
 * @property {BrotliSharedStreamCtor} BrotliCompressStream Streaming compressor.
 * @property {BrotliSharedStreamCtor} BrotliDecompressStream Streaming decompressor.
 * @property {(buf: Uint8Array) => BrotliSharedDictionary} parseSharedDictionary Parse a §5 shared-dictionary stream.
 * @property {object} _internal Internal helpers exposed for tests.
 */

export const brotliShared = {
    name: 'brotliShared',
    version: '1.2.0',
    type: 'fw.io.compress',
    dependencies: ['brotli', 'brotliDict', 'brotliDictWords'],
    deps: [brotli, brotliDict, brotliDictWords],

    /** @returns {BrotliSharedAPI} */
    factory(brotli, brotliDict, brotliDictWords) {

        const u8 = Uint8Array;

        function _err(code, msg, bitPos) {
            const e = new Error(
                'brotliShared: ' + msg + (bitPos != null ? ' @ bit ' + bitPos : '')
            );
            // @ts-ignore - Error.code/context is a non-standard but widely-used extension
            e.code = code;
            throw e;
        }

        // --- RFC 9841 §4 - base-128 varint -----------------------------
        // LSB-first per byte, MSB continuation flag; max 9 bytes / 63 bits.
        function _readSharedVarint(buf, p) {
            let v = 0;
            let shift = 0;
            let count = 0;
            while (count < 9) {
                if (p >= buf.length) _err('EBADSTREAM', 'shared dict: varint truncated');
                const b = buf[p++];
                v += (b & 0x7F) * Math.pow(2, shift);
                count++;
                if ((b & 0x80) === 0) break;
                shift += 7;
                if (count === 9) _err('EBADSTREAM', 'shared dict: varint too long');
            }
            return { v, p };
        }

        // --- RFC 9841 §5 - Shared Dictionary Stream parser ------------
        //
        // Decodes the standalone "shared dictionary" file format that
        // pairs an LZ77 dictionary with custom static word/transform
        // lists. Returns a structured object that callers can pass to
        // `brotliDecompressSync(stream, { sharedDictionary: parsed })`.
        function parseSharedDictionary(buf) {
            if (!(buf instanceof u8)) _err('EBADARG', 'parseSharedDictionary: expected Uint8Array');
            if (buf.length < 4) _err('EBADSTREAM', 'shared dict: too short for header');

            let p = 0;

            // File signature: 0x91, 0x00
            if (buf[p++] !== 0x91 || buf[p++] !== 0x00) {
                _err('EBADSTREAM', 'shared dict: invalid signature (expected 91 00)');
            }

            // LZ77 dictionary
            const lz = _readSharedVarint(buf, p);
            p = lz.p;
            const lz77Len = lz.v;
            if (lz77Len > buf.length - p) _err('EBADSTREAM', 'shared dict: LZ77 length exceeds buffer');
            let lz77Dict = null;
            if (lz77Len > 0) {
                lz77Dict = new u8(buf.subarray(p, p + lz77Len));
                p += lz77Len;
            }

            // Custom word lists
            if (p >= buf.length) _err('EBADSTREAM', 'shared dict: truncated at NUM_CUSTOM_WORD_LISTS');
            const numWordLists = buf[p++];
            if (numWordLists > 64) _err('EBADSTREAM', 'shared dict: NUM_CUSTOM_WORD_LISTS > 64');
            const wordLists = [];
            for (let i = 0; i < numWordLists; ++i) {
                if (p + 28 > buf.length) _err('EBADSTREAM', 'shared dict: truncated at SIZE_BITS_BY_LENGTH');
                const sizeBits = new u8(buf.subarray(p, p + 28));
                p += 28;
                let totalBytes = 0;
                const offsets = new Int32Array(28);
                for (let k = 0; k < 28; ++k) {
                    offsets[k] = totalBytes;
                    const sb = sizeBits[k];
                    if (sb > 15) _err('EBADSTREAM', 'shared dict: SIZE_BITS_BY_LENGTH[' + k + '] > 15');
                    if (sb > 0) totalBytes += (k + 4) << sb;
                }
                if (p + totalBytes > buf.length) {
                    _err('EBADSTREAM', 'shared dict: word list payload exceeds buffer');
                }
                const words = new u8(buf.subarray(p, p + totalBytes));
                p += totalBytes;
                wordLists.push({ sizeBits, offsets, words });
            }

            // Custom transform lists
            if (p >= buf.length) _err('EBADSTREAM', 'shared dict: truncated at NUM_CUSTOM_TRANSFORM_LISTS');
            const numTransformLists = buf[p++];
            if (numTransformLists > 64) _err('EBADSTREAM', 'shared dict: NUM_CUSTOM_TRANSFORM_LISTS > 64');
            const transformLists = [];
            for (let i = 0; i < numTransformLists; ++i) {
                if (p + 2 > buf.length) _err('EBADSTREAM', 'shared dict: truncated at PREFIX_SUFFIX_LENGTH');
                const psLen = buf[p] | (buf[p + 1] << 8);
                p += 2;
                if (psLen < 1) _err('EBADSTREAM', 'shared dict: PREFIX_SUFFIX_LENGTH must be ≥ 1');
                if (p + psLen > buf.length) _err('EBADSTREAM', 'shared dict: prefix/suffix data exceeds buffer');
                const psEnd = p + psLen;
                const stringlets = [];
                let sawTerminator = false;
                while (p < psEnd) {
                    const slen = buf[p++];
                    if (slen === 0) {
                        sawTerminator = true;
                        if (p !== psEnd) {
                            _err('EBADSTREAM', 'shared dict: 0-length stringlet must be the last entry');
                        }
                        break;
                    }
                    if (slen > 255) _err('EBADSTREAM', 'shared dict: STRING_LENGTH > 255');
                    if (p + slen > psEnd) _err('EBADSTREAM', 'shared dict: stringlet payload exceeds list');
                    stringlets.push(new u8(buf.subarray(p, p + slen)));
                    p += slen;
                }
                if (!sawTerminator) _err('EBADSTREAM', 'shared dict: missing 0-length terminator');
                if (stringlets.length < 1 || stringlets.length > 255) {
                    _err('EBADSTREAM', 'shared dict: NUM_PREFIX_SUFFIX out of range');
                }

                if (p >= buf.length) _err('EBADSTREAM', 'shared dict: truncated at NTRANSFORMS');
                const ntransforms = buf[p++];
                if (ntransforms < 1) _err('EBADSTREAM', 'shared dict: NTRANSFORMS must be ≥ 1');
                const transforms = [];
                let hasShift = false;
                for (let t = 0; t < ntransforms; ++t) {
                    if (p + 3 > buf.length) _err('EBADSTREAM', 'shared dict: truncated at transform triplet');
                    const prefixIdx = buf[p++];
                    const suffixIdx = buf[p++];
                    const opIdx = buf[p++];
                    if (prefixIdx >= stringlets.length || suffixIdx >= stringlets.length) {
                        _err('EBADSTREAM', 'shared dict: prefix/suffix index out of range');
                    }
                    if (opIdx > 22) _err('EBADSTREAM', 'shared dict: invalid op index ' + opIdx);
                    transforms.push({ prefixIdx, suffixIdx, opIdx, param: 0 });
                    if (opIdx === 21 || opIdx === 22) hasShift = true;
                }
                if (hasShift) {
                    for (let t = 0; t < ntransforms; ++t) {
                        if (p + 2 > buf.length) _err('EBADSTREAM', 'shared dict: truncated at transform params');
                        const op = transforms[t].opIdx;
                        const param = buf[p] | (buf[p + 1] << 8);
                        p += 2;
                        if (op !== 21 && op !== 22 && param !== 0) {
                            _err('EBADSTREAM', 'shared dict: non-zero param for non-shift transform');
                        }
                        transforms[t].param = param;
                    }
                }
                transformLists.push({ stringlets, transforms });
            }

            // Dictionary map + optional context map
            let dictionaryMap = null;
            let contextMap = null;
            if (numWordLists > 0 || numTransformLists > 0) {
                if (p >= buf.length) _err('EBADSTREAM', 'shared dict: truncated at NUM_DICTIONARIES');
                const numDicts = buf[p++];
                if (numDicts < 1 || numDicts > 64) _err('EBADSTREAM', 'shared dict: NUM_DICTIONARIES out of [1, 64]');
                dictionaryMap = new Array(numDicts);
                for (let i = 0; i < numDicts; ++i) {
                    if (p + 2 > buf.length) _err('EBADSTREAM', 'shared dict: truncated at DICTIONARY_MAP entry');
                    const wordListIdx = buf[p++];
                    const transformListIdx = buf[p++];
                    if (wordListIdx > numWordLists) {
                        _err('EBADSTREAM', 'shared dict: word list index ' + wordListIdx + ' > ' + numWordLists);
                    }
                    if (transformListIdx > numTransformLists) {
                        _err('EBADSTREAM', 'shared dict: transform list index ' + transformListIdx + ' > ' + numTransformLists);
                    }
                    dictionaryMap[i] = { wordListIdx, transformListIdx };
                }
                if (p >= buf.length) _err('EBADSTREAM', 'shared dict: truncated at CONTEXT_ENABLED');
                const contextEnabled = buf[p++];
                if (contextEnabled === 1) {
                    if (p + 64 > buf.length) _err('EBADSTREAM', 'shared dict: truncated at CONTEXT_MAP');
                    contextMap = new u8(buf.subarray(p, p + 64));
                    for (let i = 0; i < 64; ++i) {
                        if (contextMap[i] >= dictionaryMap.length) {
                            _err('EBADSTREAM', 'shared dict: CONTEXT_MAP[' + i + '] references missing dictionary');
                        }
                    }
                    p += 64;
                } else if (contextEnabled !== 0) {
                    _err('EBADSTREAM', 'shared dict: CONTEXT_ENABLED must be 0 or 1');
                }
            }

            return {
                lz77Dict,
                wordLists,
                transformLists,
                dictionaryMap,
                contextMap,
                bytesConsumed: p,
            };
        }

        // --- RFC 7932 §8 / RFC 9841 §3.1.1 Ferment helper -------------
        function _ferment(word, pos, len) {
            const b = word[pos];
            if (b < 192) {
                if (b >= 97 && b <= 122) word[pos] = b ^ 32;
                return 1;
            }
            if (b < 224) {
                if (pos + 1 < len) word[pos + 1] ^= 32;
                return 2;
            }
            if (pos + 2 < len) word[pos + 2] ^= 5;
            return 3;
        }

        // --- RFC 9841 §3.1.1 ShiftAll / ShiftFirst - SCALAR shift -----
        function _shiftStep(word, pos, len, addend) {
            const b = word[pos];
            let n;
            if (b < 0x80) {
                const scalar = b & 0x7F;
                const shifted = (scalar + addend) & 0x7F;
                word[pos] = shifted;
                return 1;
            }
            if (b >= 0xC0 && b < 0xE0) n = 2;
            else if (b >= 0xE0 && b < 0xF0) n = 3;
            else if (b >= 0xF0 && b < 0xF8) n = 4;
            else return 1;

            if (pos + n > len) return 0;

            let scalar;
            let mask;
            if (n === 2)      { scalar = ((b & 0x1F) << 6) | (word[pos + 1] & 0x3F);                                                                     mask = 0x7FF; }
            else if (n === 3) { scalar = ((b & 0x0F) << 12) | ((word[pos + 1] & 0x3F) << 6) | (word[pos + 2] & 0x3F);                                    mask = 0xFFFF; }
            else /* n=4 */    { scalar = ((b & 0x07) << 18) | ((word[pos + 1] & 0x3F) << 12) | ((word[pos + 2] & 0x3F) << 6) | (word[pos + 3] & 0x3F);   mask = 0x1FFFFF; }

            const shifted = (scalar + addend) & mask;

            if (n === 2) {
                word[pos]     = (b & 0xE0) | ((shifted >> 6) & 0x1F);
                word[pos + 1] = (word[pos + 1] & 0xC0) | (shifted & 0x3F);
            } else if (n === 3) {
                word[pos]     = (b & 0xF0) | ((shifted >> 12) & 0x0F);
                word[pos + 1] = (word[pos + 1] & 0xC0) | ((shifted >> 6) & 0x3F);
                word[pos + 2] = (word[pos + 2] & 0xC0) | (shifted & 0x3F);
            } else {
                word[pos]     = (b & 0xF8) | ((shifted >> 18) & 0x07);
                word[pos + 1] = (word[pos + 1] & 0xC0) | ((shifted >> 12) & 0x3F);
                word[pos + 2] = (word[pos + 2] & 0xC0) | ((shifted >> 6) & 0x3F);
                word[pos + 3] = (word[pos + 3] & 0xC0) | (shifted & 0x3F);
            }
            return n;
        }

        function _shiftAddend(param) {
            return param < 0x8000 ? param : param - 0x10000;
        }

        function _shiftFirst(word, len, param) {
            if (len === 0) return;
            _shiftStep(word, 0, len, _shiftAddend(param));
        }

        function _shiftAll(word, len, param) {
            const addend = _shiftAddend(param);
            let i = 0;
            while (i < len) {
                const n = _shiftStep(word, i, len, addend);
                if (n === 0) return;
                i += n;
            }
        }

        // Apply a CUSTOM transform list entry (RFC 9841 §3.1.1) to a base
        // word. Returns the transformed bytes.
        function _applyCustomTransform(transformList, transformId, baseWord, r) {
            if (transformId < 0 || transformId >= transformList.transforms.length) {
                _err('EBADSTREAM', 'custom dict: transform id ' + transformId + ' out of range', r ? r.p : 0);
            }
            const t = transformList.transforms[transformId];
            const prefix = transformList.stringlets[t.prefixIdx];
            const suffix = transformList.stringlets[t.suffixIdx];

            let body;
            if (t.opIdx === 0) {
                body = new u8(baseWord);
            } else if (t.opIdx >= 1 && t.opIdx <= 9) {
                const k = t.opIdx;
                body = baseWord.length < k ? new u8(0) : new u8(baseWord.subarray(0, baseWord.length - k));
            } else if (t.opIdx === 10) {
                body = new u8(baseWord);
                if (body.length > 0) _ferment(body, 0, body.length);
            } else if (t.opIdx === 11) {
                body = new u8(baseWord);
                let i = 0;
                while (i < body.length) i += _ferment(body, i, body.length);
            } else if (t.opIdx >= 12 && t.opIdx <= 20) {
                const k = t.opIdx - 11;
                body = baseWord.length < k ? new u8(0) : new u8(baseWord.subarray(k));
            } else if (t.opIdx === 21) {
                body = new u8(baseWord);
                _shiftFirst(body, body.length, t.param);
            } else if (t.opIdx === 22) {
                body = new u8(baseWord);
                _shiftAll(body, body.length, t.param);
            } else {
                _err('EBADSTREAM', 'custom dict: invalid op index ' + t.opIdx, r ? r.p : 0);
            }

            const out = new u8(prefix.length + body.length + suffix.length);
            out.set(prefix, 0);
            out.set(body, prefix.length);
            out.set(suffix, prefix.length + body.length);
            return out;
        }

        // Look up a base word in a CUSTOM word list (RFC 9841 §3.1).
        function _customLookupWord(wordList, length, index, r) {
            if (length < 4 || length > 31) {
                _err('EBADSTREAM', 'custom dict: word length ' + length + ' out of [4, 31]', r ? r.p : 0);
            }
            const sb = wordList.sizeBits[length - 4];
            if (sb === 0) _err('EBADSTREAM', 'custom dict: no words of length ' + length, r ? r.p : 0);
            const nwords = 1 << sb;
            if (index < 0 || index >= nwords) {
                _err('EBADSTREAM', 'custom dict: index ' + index + ' >= NWORDS(' + length + ')=' + nwords, r ? r.p : 0);
            }
            const off = wordList.offsets[length - 4] + length * index;
            return wordList.words.subarray(off, off + length);
        }

        // Ensure brotliDict is loaded before falling back to the built-in
        // RFC 7932 dict in a custom-dict slot.
        function _ensureDictLoaded(r) {
            if (brotliDict.hasWords()) return;
            if (brotliDictWords.isLoaded) {
                brotliDict.setWords(brotliDictWords.blob);
                return;
            }
            _err('ENEEDDICT',
                'brotli static dictionary required for this stream - load it via ' +
                'brotliDictWords.setBlob(bytes) or .load(url), then the decoder ' +
                'will auto-wire on the next dict-ref',
                r ? r.p : 0);
        }

        // Build a `findCustomDictMatch` closure for the encoder side
        // (RFC 9841 §3.1). Scans the first custom dict in `customDict`
        // for the longest match against input bytes at position `pos`,
        // applying each Identity-op (opIdx=0) transform of the custom
        // transform list. Returns `{ outputLen, dictLen, wordId } | null`.
        //
        // Currently encoder-side support is limited to:
        //   - NUM_DICTIONARIES = 1 (multi-dict encoder is future)
        //   - Identity transforms only (FermentFirst/All + Shift skipped
        //     since they'd require hashing fermented variants of the input)
        //
        // Scan complexity per position is O(N_transforms × Σ NWORDS[len]).
        // For typical web-bundle shared dicts (≤ 100 words, ≤ 20 transforms)
        // this is ~ a few thousand ops/position - acceptable on small to
        // medium inputs.
        function _makeCustomDictMatchFinder(customDict) {
            if (!customDict || !customDict.dicts || customDict.dicts.length === 0) return null;
            const dict = customDict.dicts[0];
            const wordList = dict.wordList;
            const transformList = dict.transformList;
            if (!wordList) return null;  // single-dict encoder; built-in dict path stays

            // Pre-compute the Identity transforms (op=0) we'll scan.
            const identityTransforms = [];
            if (transformList) {
                for (let id = 0; id < transformList.transforms.length; ++id) {
                    const t = transformList.transforms[id];
                    if (t.opIdx !== 0) continue;
                    identityTransforms.push({
                        id,
                        prefix: transformList.stringlets[t.prefixIdx],
                        suffix: transformList.stringlets[t.suffixIdx],
                    });
                }
            } else {
                // No custom transforms → only RFC 7932 Identity (id=0,
                // empty prefix + suffix). The other 120 RFC 7932 transforms
                // operate on the built-in dict, not the custom one.
                identityTransforms.push({ id: 0, prefix: new u8(0), suffix: new u8(0) });
            }
            if (identityTransforms.length === 0) return null;

            return function findCustomDictMatch(data, pos, end, minLen) {
                let bestOutLen = 0, bestDictLen = 0, bestIdx = 0, bestTransformId = 0;

                for (let ti = 0; ti < identityTransforms.length; ++ti) {
                    const t = identityTransforms[ti];
                    const pre = t.prefix;
                    const suf = t.suffix;
                    const preLen = pre.length;
                    const sufLen = suf.length;
                    if (pos + preLen > end) continue;
                    // Verify prefix bytes match.
                    let pm = 0;
                    while (pm < preLen && data[pos + pm] === pre[pm]) ++pm;
                    if (pm !== preLen) continue;

                    const wordStart = pos + preLen;
                    for (let len = 4; len <= 31; ++len) {
                        const sb = wordList.sizeBits[len - 4];
                        if (sb === 0) continue;
                        const nw = 1 << sb;
                        if (wordStart + len > end) break;
                        const baseOff = wordList.offsets[len - 4];

                        for (let idx = 0; idx < nw; ++idx) {
                            const wordOff = baseOff + len * idx;
                            let wm = 0;
                            while (wm < len && data[wordStart + wm] === wordList.words[wordOff + wm]) ++wm;
                            if (wm !== len) continue;
                            // Word matched - check suffix.
                            if (wordStart + len + sufLen > end) continue;
                            let sm = 0;
                            while (sm < sufLen && data[wordStart + len + sm] === suf[sm]) ++sm;
                            if (sm !== sufLen) continue;

                            const outLen = preLen + len + sufLen;
                            if (outLen > bestOutLen) {
                                bestOutLen = outLen;
                                bestDictLen = len;
                                bestIdx = idx;
                                bestTransformId = t.id;
                            }
                        }
                    }
                }
                if (bestOutLen < minLen) return null;
                const nw = 1 << wordList.sizeBits[bestDictLen - 4];
                const wordId = bestTransformId * nw + bestIdx;
                return { outputLen: bestOutLen, dictLen: bestDictLen, wordId };
            };
        }

        // Build a `resolveStaticDictRef` closure over a custom-dict
        // configuration (parsed shared dictionary). This is the callback
        // brotli.js calls when `state.resolveStaticDictRef` is set and a
        // static-dict reference is encountered.
        //
        // Signature: (state, wordId, clen, contextIdL, reader) → Uint8Array
        function _makeResolveStaticDictRef(customDict) {
            const cd = customDict;
            return function resolveStaticDictRef(state, wordId, clen, contextIdL, r) {
                if (clen < 4 || clen > 31) {
                    _err('EBADSTREAM', 'static dict ref length ' + clen + ' not in [4, 31]', r ? r.p : 0);
                }

                let order;
                if (cd.contextMap) {
                    const first = cd.contextMap[contextIdL];
                    order = [first];
                    for (let i = 0; i < cd.dicts.length; ++i) {
                        if (i !== first) order.push(i);
                    }
                } else {
                    order = cd.dicts.map((_, i) => i);
                }

                let wid = wordId;
                for (const di of order) {
                    const dict = cd.dicts[di];
                    let nw;
                    if (dict.wordList) {
                        const sb = dict.wordList.sizeBits[clen - 4];
                        if (sb === 0) continue;
                        nw = 1 << sb;
                    } else {
                        _ensureDictLoaded(r);
                        nw = brotliDict.NWORDS(clen);
                    }
                    const transformCount = dict.transformList
                        ? dict.transformList.transforms.length
                        : 121;
                    const capacity = nw * transformCount;
                    if (wid < capacity) {
                        const index = wid % nw;
                        const transformId = (wid - index) / nw;
                        const baseWord = dict.wordList
                            ? _customLookupWord(dict.wordList, clen, index, r)
                            : brotliDict.lookupWord(clen, index);
                        return dict.transformList
                            ? _applyCustomTransform(dict.transformList, transformId, baseWord, r)
                            : brotliDict.applyTransform(transformId, baseWord);
                    }
                    wid -= capacity;
                }
                _err('EBADSTREAM', 'custom dict: word_id exceeds total capacity across dicts', r ? r.p : 0);
            };
        }

        // Translate user-facing RFC 9841 opts into brotli's internal
        // `_ext` extension protocol. Returns a fresh opts object with
        // `_ext` populated and the user-facing keys preserved as-is for
        // anything brotli.js itself consumes (e.g. quality, lazyMatch).
        function _buildExt(opts) {
            if (!opts) return opts;
            const ext = opts._ext ? { ...opts._ext } : {};

            if (opts.allowLargeWindow) ext.allowLargeWindow = true;

            // Encoder-side RFC 9841 §6 large window opt-in. Public API
            // accepts a single `windowBits` (10..62) ; if > 24 we also
            // tag `largeWindow` so brotli.js emits the 14-bit prefix.
            if (opts.windowBits != null) {
                const wb = opts.windowBits | 0;
                if (wb !== opts.windowBits || wb < 10 || wb > 62) {
                    _err('EBADARG', 'windowBits must be an integer in [10, 62]');
                }
                ext.windowBits = wb;
                if (wb > 24) ext.largeWindow = true;
            }

            if (opts.sharedDictionary) {
                const sd = opts.sharedDictionary;
                if (sd.lz77 != null) {
                    if (!(sd.lz77 instanceof u8)) {
                        _err('EBADARG', 'sharedDictionary.lz77 must be Uint8Array');
                    }
                    ext.lz77Dict = sd.lz77;
                    ext.lz77Prefix = sd.lz77;
                } else if (sd.lz77Dict != null) {
                    if (!(sd.lz77Dict instanceof u8)) {
                        _err('EBADARG', 'sharedDictionary.lz77Dict must be Uint8Array');
                    }
                    ext.lz77Dict = sd.lz77Dict;
                    ext.lz77Prefix = sd.lz77Dict;
                }
                if (sd.dictionaryMap && sd.dictionaryMap.length >= 1) {
                    const dicts = sd.dictionaryMap.map(entry => {
                        const useBuiltinWords = entry.wordListIdx === sd.wordLists.length;
                        const useBuiltinTransforms = entry.transformListIdx === sd.transformLists.length;
                        return {
                            wordList: useBuiltinWords ? null : sd.wordLists[entry.wordListIdx],
                            transformList: useBuiltinTransforms ? null : sd.transformLists[entry.transformListIdx],
                        };
                    });
                    const customDict = { dicts, contextMap: sd.contextMap || null };
                    ext.resolveStaticDictRef = _makeResolveStaticDictRef(customDict);
                    // Encoder-side custom-dict scan (RFC 9841 §3.1).
                    // Returns `null` if no custom wordList present in the
                    // first dict slot - encoder then keeps the RFC 7932
                    // built-in dict scan path.
                    const customFinder = _makeCustomDictMatchFinder(customDict);
                    if (customFinder) ext.findCustomDictMatch = customFinder;
                }
            }

            return { ...opts, _ext: ext };
        }

        // --- Public API - RFC 9841-aware codec wrappers ----------------
        //
        // Each public method calls `_buildExt(opts)` to translate
        // `allowLargeWindow` / `sharedDictionary` into the internal
        // `_ext` channel that brotli.js consumes, then delegates.

        function brotliDecompressSync(data, opts) {
            return brotli.brotliDecompressSync(data, _buildExt(opts));
        }

        function brotliDecompress(data, opts) {
            return brotli.brotliDecompress(data, _buildExt(opts));
        }

        function brotliCompressSync(data, opts) {
            return brotli.brotliCompressSync(data, _buildExt(opts));
        }

        function brotliCompress(data, opts) {
            return brotli.brotliCompress(data, _buildExt(opts));
        }

        // Streaming wrappers - translate opts up front, then use the
        // underlying brotli stream class verbatim.
        class BrotliCompressStream {
            constructor(opts, ondata) {
                this._inner = new brotli.BrotliCompressStream(_buildExt(opts), ondata);
            }
            push(chunk, final) { return this._inner.push(chunk, final); }
        }
        class BrotliDecompressStream {
            constructor(opts, ondata) {
                this._inner = new brotli.BrotliDecompressStream(_buildExt(opts), ondata);
            }
            push(chunk, final) { return this._inner.push(chunk, final); }
        }

        return {
            brotliCompressSync,
            brotliDecompressSync,
            brotliCompress,
            brotliDecompress,
            BrotliCompressStream,
            BrotliDecompressStream,
            parseSharedDictionary,
            // Internal helpers exposed for tests and potential companion
            // modules. Same `_internal` convention as the rest of fw.
            _internal: {
                ferment: _ferment,
                shiftStep: _shiftStep,
                shiftAddend: _shiftAddend,
                shiftFirst: _shiftFirst,
                shiftAll: _shiftAll,
                applyCustomTransform: _applyCustomTransform,
                customLookupWord: _customLookupWord,
                makeResolveStaticDictRef: _makeResolveStaticDictRef,
                buildExt: _buildExt,
            },
        };
    }
};
