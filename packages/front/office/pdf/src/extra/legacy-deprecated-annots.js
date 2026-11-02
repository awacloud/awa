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
 * and the dictionaries those annotations and the rendition actions point
 * at (`typeMediaDict`): renditions, media clips, play and screen
 * parameters, media criteria, offsets, players, software identifiers
 * (ISO 32000-2 §13.2), and the movie and movie-activation dictionaries.
 *
 * @module pdf/extra/legacy-deprecated-annots
 */

import { pdfErrors } from '../errors.js';

export const pdfLegacyDeprecatedAnnots = {
    name: 'pdfLegacyDeprecatedAnnots',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError, ContractError } = errors;
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
            // The stream entries (Table 5), each only when present: a
            // number or a name by its value, an array or a dictionary as read.
            if (isName(e.Type)) out.type = e.Type.value;
            if (isNum(e.Length)) out.length = e.Length.value;
            if (isName(e.Filter)) out.filter = e.Filter.value;
            else if (e.Filter && e.Filter.type === 'array') out.filter = e.Filter;
            if (isDict(e.DecodeParms) || (e.DecodeParms && e.DecodeParms.type === 'array')) {
                out.decodeParms = e.DecodeParms;
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

        // The multimedia dictionaries (ISO 32000-2 § 13.2)
        // and the deprecated movie ones (ISO 32000-1 § 13.4): per kind, each
        // key → [field, how the value is read]. `name`, `text`, `int`,
        // `num` and `bool` keep the value of that type (else `null`);
        // `raw` keeps a dictionary, array, stream or reference as read.
        // The MH and BE dictionaries of one object share a kind.
        const TYPE = ['type', 'name'], SUB = ['subtype', 'name'];
        const MH = ['mustHonor', 'raw'], BE = ['bestEffort', 'raw'];
        const MEDIA_KINDS = Object.freeze({
            Rendition: { Type: TYPE, S: SUB, N: ['name', 'text'], MH, BE, C: ['clip', 'raw'],
                P: ['playParameters', 'raw'], SP: ['screenParameters', 'raw'], R: ['renditions', 'raw'] },
            RenditionMHBE: { C: ['criteria', 'raw'] },
            MediaClipData: { Type: TYPE, S: SUB, N: ['name', 'text'], D: ['data', 'raw'], CT: ['contentType', 'text'],
                P: ['permissions', 'raw'], Alt: ['alt', 'raw'], PL: ['players', 'raw'], MH, BE },
            MediaClipDataMHBE: { BU: ['baseUrl', 'text'] },
            MediaClipSection: { Type: TYPE, S: SUB, N: ['name', 'text'], D: ['clip', 'raw'], Alt: ['alt', 'raw'], MH, BE },
            MediaClipSectionMHBE: { B: ['begin', 'raw'], E: ['end', 'raw'] },
            MediaCriteria: { Type: TYPE, A: ['audioDescriptions', 'bool'], C: ['captions', 'bool'], O: ['overdubs', 'bool'],
                S: ['subtitles', 'bool'], R: ['bitrate', 'int'], D: ['bitDepth', 'raw'], Z: ['screenSize', 'raw'],
                V: ['viewers', 'raw'], P: ['pdfVersions', 'raw'], L: ['languages', 'raw'] },
            MediaDuration: { Type: TYPE, S: SUB, T: ['timespan', 'raw'] },
            MediaOffset: { Type: TYPE, S: SUB, T: ['timespan', 'raw'], F: ['frame', 'int'], M: ['marker', 'text'] },
            MediaPermissions: { Type: TYPE, TF: ['tempFile', 'text'] },
            MediaPlayParameters: { Type: TYPE, PL: ['players', 'raw'], MH, BE },
            MediaPlayParametersMHBE: { V: ['volume', 'int'], C: ['showControls', 'bool'], F: ['fit', 'int'],
                D: ['duration', 'raw'], A: ['autoPlay', 'bool'], RC: ['repeatCount', 'num'] },
            MediaPlayerInfo: { Type: TYPE, PID: ['softwareIdentifier', 'raw'], MH, BE },
            MediaPlayers: { Type: TYPE, MU: ['mustUse', 'raw'], A: ['available', 'raw'], NU: ['notUsed', 'raw'] },
            MediaScreenParameters: { Type: TYPE, MH, BE },
            MediaScreenParametersMHBE: { W: ['windowType', 'int'], B: ['background', 'raw'], O: ['opacity', 'num'],
                M: ['monitor', 'int'], F: ['floatingWindow', 'raw'] },
            MinimumScreenSize: { Type: TYPE, V: ['size', 'raw'], M: ['monitor', 'int'] },
            SoftwareIdentifier: { Type: TYPE, U: ['uri', 'text'], L: ['lowVersion', 'raw'], LI: ['lowInclusive', 'bool'],
                H: ['highVersion', 'raw'], HI: ['highInclusive', 'bool'], OS: ['os', 'raw'] },
            Movie: { F: ['file', 'raw'], Aspect: ['aspect', 'raw'], Rotate: ['rotate', 'int'], Poster: ['poster', 'raw'] },
            MovieActivation: { Start: ['start', 'raw'], Duration: ['duration', 'raw'], Rate: ['rate', 'num'],
                Volume: ['volume', 'num'], ShowControls: ['showControls', 'bool'], Mode: ['mode', 'name'],
                Synchronous: ['synchronous', 'bool'], FWScale: ['fwScale', 'raw'], FWPosition: ['fwPosition', 'raw'] }
        });
        const READ = {
            name: (v) => (isName(v) ? v.value : null),
            text: (v) => (isStr(v) ? v.value : null),
            int: (v) => (v && v.type === 'int' ? v.value : null),
            num: (v) => (isNum(v) ? v.value : null),
            bool: (v) => (isBool(v) ? v.value : null),
            raw: (v) => v
        };

        /**
         * Type one multimedia dictionary of the given kind (a key of
         * `MEDIA_KINDS`): one field per key of its table, present only
         * when the key is; `_extras` the other keys, `raw` the dictionary.
         */
        function typeMediaDict(dict, kind) {
            const table = Object.prototype.hasOwnProperty.call(MEDIA_KINDS, kind) ? MEDIA_KINDS[kind] : null;
            if (!table) {
                throw new ContractError('pdf/legacy-annot/media-kind',
                    'typeMediaDict: unknown kind', { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/legacy-annot/media-not-dict',
                    'a multimedia object must be a dictionary', { context: { kind, type: dict && dict.type } });
            }
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                const spec = table[k];
                if (spec) out[spec[0]] = READ[spec[1]](v);
                else out._extras[k] = v;
            }
            return out;
        }

        return {
            typeSoundAnnot,
            typeSoundStream,
            typeMediaDict,
            MEDIA_KINDS,
            typeMovieAnnot,
            typeScreenAnnot,
            SOUND_MODES,
            MOVIE_OP_MODES
        };
    }
};
