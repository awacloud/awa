// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: LEGACY deprecated multimedia annotations.
 *
 * Surfaces typed payloads for the multimedia annotation subtypes that
 * PDF 2.0 deprecates in favour of /RichMedia and the /Screen +
 * /Rendition pattern:
 *
 *   - /Subtype /Sound  (ISO 32000-1 §12.5.6.16): /Sound stream, /Name
 *     icon, /Repeat, /Mode flag.
 *   - /Subtype /Movie  (ISO 32000-1 §12.5.6.17): /Movie dict, /A
 *     activation flag/dict, /T title.
 *   - /Subtype /Screen (ISO 32000-1 §12.5.6.18): /MK appearance, /A
 *     rendition action, /AA additional actions for media playback.
 *
 * @module pdf/extra/legacy-deprecated-annots
 */

import { pdfErrors } from '../errors.js';

export const pdfLegacyDeprecatedAnnots = {
    name: 'pdfLegacyDeprecatedAnnots',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const SOUND_MODES = new Set(['Mono', 'Stereo']);
        const MOVIE_OP_MODES = new Set(['Once', 'Open', 'Repeat', 'Palindrome']);

        function isDict(v) { return v && v.type === 'dict'; }
        function isName(v) { return v && v.type === 'name'; }
        function isStr(v) { return v && v.type === 'string'; }
        function isStream(v) { return v && v.type === 'stream'; }
        function isBool(v) { return v && v.type === 'bool'; }
        function isNum(v) { return v && (v.type === 'int' || v.type === 'real'); }

        function expectSubtype(dict, expected) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/legacy-annot/not-dict',
                    'annotation must be a dictionary',
                    { context: { expected } });
            }
            const st = dict.entries.Subtype;
            if (!isName(st) || st.value !== expected) {
                throw new ParseError('pdf/legacy-annot/bad-subtype',
                    `/Subtype must be /${expected}`,
                    { context: { actual: st && st.value, expected } });
            }
        }

        function typeSoundAnnot(dict) {
            expectSubtype(dict, 'Sound');
            const e = dict.entries;
            const out = { subtype: 'Sound', raw: dict, _extras: {} };
            if (!e.Sound) {
                throw new ParseError('pdf/legacy-annot/sound-missing',
                    'Sound annot requires /Sound stream');
            }
            if (!isStream(e.Sound) && !(e.Sound.type === 'ref')) {
                throw new ParseError('pdf/legacy-annot/sound-bad-stream',
                    '/Sound must be a stream or ref',
                    { context: { type: e.Sound.type } });
            }
            out.sound = e.Sound;
            if (e.Name) {
                if (!isName(e.Name)) {
                    throw new ParseError('pdf/legacy-annot/sound-bad-name',
                        '/Name must be a name');
                }
                out.iconName = e.Name.value;
            }
            const KNOWN = new Set(['Type','Subtype','Sound','Name']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeSoundStream(stream) {
            if (!isStream(stream)) {
                throw new ParseError('pdf/legacy-annot/sound-stream',
                    'sound payload must be a stream');
            }
            const e = stream.dict ? stream.dict.entries : {};
            const out = { raw: stream, _extras: {} };
            if (e.R) { if (!isNum(e.R)) throw new ParseError('pdf/legacy-annot/sound-bad-R', '/R must be numeric'); out.samplingRate = e.R.value; }
            if (e.C) { if (!isNum(e.C)) throw new ParseError('pdf/legacy-annot/sound-bad-C', '/C must be numeric'); out.channels = e.C.value; }
            if (e.B) { if (!isNum(e.B)) throw new ParseError('pdf/legacy-annot/sound-bad-B', '/B must be numeric'); out.bitsPerSample = e.B.value; }
            if (e.E) { if (!isName(e.E)) throw new ParseError('pdf/legacy-annot/sound-bad-E', '/E must be a name'); out.encoding = e.E.value; }
            if (e.CO) { if (!isName(e.CO)) throw new ParseError('pdf/legacy-annot/sound-bad-CO', '/CO must be a name'); out.compression = e.CO.value; }
            if (e.Mode) {
                if (!isName(e.Mode) || !SOUND_MODES.has(e.Mode.value)) {
                    throw new ParseError('pdf/legacy-annot/sound-bad-mode',
                        '/Mode must be Mono or Stereo');
                }
                out.mode = e.Mode.value;
            }
            const KNOWN = new Set(['Type','R','C','B','E','CO','Mode','Length','Filter','DecodeParms']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeMovieAnnot(dict) {
            expectSubtype(dict, 'Movie');
            const e = dict.entries;
            const out = { subtype: 'Movie', raw: dict, _extras: {} };
            if (!e.Movie) {
                throw new ParseError('pdf/legacy-annot/movie-missing',
                    'Movie annot requires /Movie dict');
            }
            if (!isDict(e.Movie)) {
                throw new ParseError('pdf/legacy-annot/movie-bad',
                    '/Movie must be a dict');
            }
            out.movie = e.Movie;
            if (e.T) {
                if (!isStr(e.T)) {
                    throw new ParseError('pdf/legacy-annot/movie-bad-T',
                        '/T must be a text string');
                }
                out.title = e.T.value;
            }
            if (e.A) {
                if (!isBool(e.A) && !isDict(e.A)) {
                    throw new ParseError('pdf/legacy-annot/movie-bad-A',
                        '/A must be bool or dict');
                }
                if (isBool(e.A)) out.activation = { auto: e.A.value };
                else {
                    const ae = e.A.entries;
                    const act = { raw: e.A };
                    if (ae.Mode && isName(ae.Mode)) {
                        if (!MOVIE_OP_MODES.has(ae.Mode.value)) {
                            throw new ParseError('pdf/legacy-annot/movie-bad-mode',
                                '/Mode must be Once, Open, Repeat or Palindrome');
                        }
                        act.mode = ae.Mode.value;
                    }
                    out.activation = act;
                }
            }
            const KNOWN = new Set(['Type','Subtype','Movie','T','A']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeScreenAnnot(dict) {
            expectSubtype(dict, 'Screen');
            const e = dict.entries;
            const out = { subtype: 'Screen', raw: dict, _extras: {} };
            if (e.T) {
                if (!isStr(e.T)) throw new ParseError('pdf/legacy-annot/screen-bad-T', '/T must be a string');
                out.title = e.T.value;
            }
            if (e.MK) {
                if (!isDict(e.MK)) throw new ParseError('pdf/legacy-annot/screen-bad-MK', '/MK must be a dict');
                out.mk = e.MK;
            }
            if (e.A) {
                if (!isDict(e.A)) throw new ParseError('pdf/legacy-annot/screen-bad-A', '/A must be an action dict');
                out.action = e.A;
            }
            if (e.AA) {
                if (!isDict(e.AA)) throw new ParseError('pdf/legacy-annot/screen-bad-AA', '/AA must be a dict');
                out.additionalActions = e.AA;
            }
            if (e.P) {
                if (e.P.type !== 'ref' && !isDict(e.P)) {
                    throw new ParseError('pdf/legacy-annot/screen-bad-P', '/P must be a page ref or dict');
                }
                out.page = e.P;
            }
            const KNOWN = new Set(['Type','Subtype','T','MK','A','AA','P','Rect','Contents']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return {
            typeSoundAnnot,
            typeSoundStream,
            typeMovieAnnot,
            typeScreenAnnot,
            SOUND_MODES,
            MOVIE_OP_MODES
        };
    }
};
