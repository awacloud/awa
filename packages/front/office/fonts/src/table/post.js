// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `post` — PostScript Information (OT §6.4.9).
 *
 * Versions:
 *  - 1.0  — fixed header (32 bytes), glyph names are the Mac standard 258.
 *  - 2.0  — header + numGlyphs glyphNameIndex[] + pascal strings.
 *  - 2.5  — deprecated, offset table form (unsupported here).
 *  - 3.0  — header only, no glyph names.
 *  - 4.0  — header + uint16[numGlyphs] character codes (Apple TT legacy).
 *
 * @module fonts/table/post
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tablePost = {
    name: 'tablePost',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        /** Mac standard 258 glyph names (per Apple TT Manual / OT spec §post v1.0). */
        const MAC_GLYPH_NAMES = [
            '.notdef','.null','nonmarkingreturn','space','exclam','quotedbl','numbersign','dollar',
            'percent','ampersand','quotesingle','parenleft','parenright','asterisk','plus','comma',
            'hyphen','period','slash','zero','one','two','three','four',
            'five','six','seven','eight','nine','colon','semicolon','less',
            'equal','greater','question','at','A','B','C','D',
            'E','F','G','H','I','J','K','L',
            'M','N','O','P','Q','R','S','T',
            'U','V','W','X','Y','Z','bracketleft','backslash',
            'bracketright','asciicircum','underscore','grave','a','b','c','d',
            'e','f','g','h','i','j','k','l',
            'm','n','o','p','q','r','s','t',
            'u','v','w','x','y','z','braceleft','bar',
            'braceright','asciitilde','Adieresis','Aring','Ccedilla','Eacute','Ntilde','Odieresis',
            'Udieresis','aacute','agrave','acircumflex','adieresis','atilde','aring','ccedilla',
            'eacute','egrave','ecircumflex','edieresis','iacute','igrave','icircumflex','idieresis',
            'ntilde','oacute','ograve','ocircumflex','odieresis','otilde','uacute','ugrave',
            'ucircumflex','udieresis','dagger','degree','cent','sterling','section','bullet',
            'paragraph','germandbls','registered','copyright','trademark','acute','dieresis','notequal',
            'AE','Oslash','infinity','plusminus','lessequal','greaterequal','yen','mu',
            'partialdiff','summation','product','pi','integral','ordfeminine','ordmasculine','Omega',
            'ae','oslash','questiondown','exclamdown','logicalnot','radical','florin','approxequal',
            'Delta','guillemotleft','guillemotright','ellipsis','nonbreakingspace','Agrave','Atilde','Otilde',
            'OE','oe','endash','emdash','quotedblleft','quotedblright','quoteleft','quoteright',
            'divide','lozenge','ydieresis','Ydieresis','fraction','currency','guilsinglleft','guilsinglright',
            'fi','fl','daggerdbl','periodcentered','quotesinglbase','quotedblbase','perthousand','Acircumflex',
            'Ecircumflex','Aacute','Edieresis','Egrave','Iacute','Icircumflex','Idieresis',
            'Igrave','Oacute','Ocircumflex','apple','Ograve','Uacute','Ucircumflex','Ugrave',
            'dotlessi','circumflex','tilde','macron','breve','dotaccent','ring','cedilla',
            'hungarumlaut','ogonek','caron','Lslash','lslash','Scaron','scaron','Zcaron',
            'zcaron','brokenbar','Eth','eth','Yacute','yacute','Thorn','thorn',
            'minus','multiply','onesuperior','twosuperior','threesuperior','onehalf','onequarter','threequarters',
            'franc','Gbreve','gbreve','Idotaccent','Scedilla','scedilla','Cacute','cacute',
            'Ccaron','ccaron','dcroat'
        ];

        /**
         * @param {Uint8Array} bytes
         * @param {number} [numGlyphs]  — required for v2.0 / v4.0
         */
        function parsePost(bytes, numGlyphs) {
            if (bytes.length < 32)
                throw new ParseError('fonts/post-short', 'post table must be ≥ 32 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const versionRaw = r.readUint32();
            const version = ((versionRaw >>> 16) & 0xFFFF) + ((versionRaw & 0xFFFF) / 0x10000);
            const out = {
                version,
                italicAngle:        r.readInt32() / 65536,
                underlinePosition:  r.readInt16(),
                underlineThickness: r.readInt16(),
                isFixedPitch:       r.readUint32(),
                minMemType42:       r.readUint32(),
                maxMemType42:       r.readUint32(),
                minMemType1:        r.readUint32(),
                maxMemType1:        r.readUint32()
            };
            if (version === 2.0) {
                if (numGlyphs == null)
                    throw new ParseError('fonts/post-need-numGlyphs', 'post v2.0 requires numGlyphs', {});
                const ng = r.readUint16();
                if (ng !== numGlyphs)
                    throw new ParseError('fonts/post-num-mismatch',
                        `post v2.0 numberOfGlyphs (${ng}) ≠ maxp.numGlyphs (${numGlyphs})`,
                        { context: { post: ng, maxp: numGlyphs } });
                const indices = new Array(numGlyphs);
                let maxIdx = 257;
                for (let i = 0; i < numGlyphs; i++) {
                    const idx = r.readUint16();
                    indices[i] = idx;
                    if (idx > maxIdx) maxIdx = idx;
                }
                // pascal strings for indices >= 258
                const extra = [];
                const customCount = maxIdx - 257;
                for (let i = 0; i < customCount; i++) {
                    const len = r.readUint8();
                    const sb = r.readBytesCopy(len);
                    let s = '';
                    for (let k = 0; k < len; k++) s += String.fromCharCode(sb[k]);
                    extra.push(s);
                }
                out.glyphNames = indices.map(idx =>
                    idx < 258 ? MAC_GLYPH_NAMES[idx] : extra[idx - 258] || `glyph${idx}`);
            } else if (version === 3.0) {
                // no glyph names
            } else if (version === 1.0) {
                if (numGlyphs != null) {
                    out.glyphNames = new Array(numGlyphs);
                    for (let i = 0; i < numGlyphs; i++)
                        out.glyphNames[i] = i < 258 ? MAC_GLYPH_NAMES[i] : `glyph${i}`;
                }
            } else if (version === 2.5) {
                throw new ParseError('fonts/post-v2-5-unsupported', 'post v2.5 is deprecated and unsupported');
            }
            return out;
        }

        /**
         * Encode the post header (v3.0). Glyph names are never emitted: only
         * the 32-byte header is written, whatever `post.version`.
         */
        function encodePost(post) {
            const w = new BinaryWriter(32);
            const ver = post.version || 3.0;
            w.writeUint32(((ver | 0) << 16) | Math.round((ver - (ver | 0)) * 0x10000));
            w.writeInt32(Math.round((post.italicAngle ?? 0) * 65536));
            w.writeInt16(post.underlinePosition ?? -75);
            w.writeInt16(post.underlineThickness ?? 50);
            w.writeUint32(post.isFixedPitch ?? 0);
            w.writeUint32(post.minMemType42 ?? 0);
            w.writeUint32(post.maxMemType42 ?? 0);
            w.writeUint32(post.minMemType1 ?? 0);
            w.writeUint32(post.maxMemType1 ?? 0);
            return w.finalize();
        }

        return { parsePost, encodePost, MAC_GLYPH_NAMES };
    }
};
