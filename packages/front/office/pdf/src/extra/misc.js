// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: miscellaneous tail typing.
 *
 * Covers the long tail of Catalog-level entries that don't warrant
 * their own L1 module:
 *
 *   - /SpiderInfo      — Web-Capture provenance (ISO 32000-2 §14.10.2).
 *   - /Threads         — array of article-thread dicts (§12.4.3).
 *   - /Legal           — legal-attestation dict (§12.8.5).
 *   - /Requirements    — array of requirement dicts (§12.10).
 *   - /Perms           — extra permission flavours beyond /UR3, notably
 *                        /DocMDP transformation parameters (§12.8.2.2).
 *   - /NeedsRendering  — boolean indicator for XFA-bearing forms.
 *   - /ViewerPreferences — viewer and print preferences (§12.2), with
 *                        the Table 147 defaults.
 *   - the measurement dictionaries — rectilinear and geospatial measures,
 *                        number formats, viewports, point data
 *                        (`typeMeasurement`).
 *   - the XObject entries the core `pdfImages` typers leave out
 *                        (`typeXObjectEntries`, a companion typer).
 *   - the Web Capture page sets, image sets, commands and command
 *                        settings (`typeWebCapture`).
 *   - a signature field's lock and the FieldMDP transform parameters
 *                        (`typeFieldLock`).
 *
 * @module pdf/extra/misc
 */

import { pdfErrors } from '../errors.js';

export const pdfMisc = {
    name: 'pdfMisc',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError, ContractError } = errors;
        // The requirement types of ISO 32000-2 (the Arlington model's).
        const REQUIREMENT_S_VALUES = new Set([
            '3DMarkup', 'AcroFormInteract', 'Action', 'Attachment', 'AttachmentEditing', 'Collection',
            'CollectionEditing', 'DPartInteract', 'DigSig', 'DigSigMDP', 'DigSigValidation',
            'EnableJavaScripts', 'Encryption', 'Geospatial2D', 'Geospatial3D', 'Markup', 'Multimedia',
            'Navigation', 'OCAutoStates', 'OCInteract', 'PRC', 'RichMedia', 'STEP', 'SeparationSimulation',
            'Transitions', 'U3D', 'glTF'
        ]);

        function isDict(v) { return v && v.type === 'dict'; }
        function isName(v) { return v && v.type === 'name'; }
        function isArr(v) { return v && v.type === 'array'; }
        function isBool(v) { return v && v.type === 'bool'; }
        function isInt(v) { return v && v.type === 'int'; }
        function isRef(v) { return v && v.type === 'ref'; }

        function typeSpiderInfo(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/spider-not-dict',
                    '/SpiderInfo must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.V) {
                if (!isInt(e.V) && !(e.V && e.V.type === 'real')) {
                    throw new ParseError('pdf/misc/spider-bad-V',
                        '/SpiderInfo /V must be numeric');
                }
                out.version = e.V.value;
            }
            if (e.C) {
                if (!isArr(e.C)) {
                    throw new ParseError('pdf/misc/spider-bad-C',
                        '/SpiderInfo /C must be an array');
                }
                out.commands = e.C.items;
            }
            const KNOWN = new Set(['V', 'C']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeThreads(arr) {
            if (!isArr(arr)) {
                throw new ParseError('pdf/misc/threads-not-array',
                    '/Threads must be an array');
            }
            const out = [];
            for (let i = 0; i < arr.items.length; i++) {
                const it = arr.items[i];
                if (it.type !== 'ref' && !isDict(it)) {
                    throw new ParseError('pdf/misc/thread-bad-entry',
                        '/Threads entry must be a dict or ref',
                        { context: { index: i } });
                }
                out.push(it);
            }
            return out;
        }

        function typeLegal(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/legal-not-dict',
                    '/Legal must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, flags: {}, _extras: {} };
            const KNOWN_FLAGS = new Set([
                'JavaScriptActions', 'LaunchActions', 'URIActions',
                'MovieActions', 'SoundActions', 'HiddenAnnotations',
                'NonEmbeddedFonts', 'DevDepGS_OP', 'DevDepGS_HT',
                'DevDepGS_TR', 'DevDepGS_UCR', 'DevDepGS_FL', 'DevDepGS_BG',
                'Annotations', 'ExternalRefXobjects', 'ExternalOPIdicts',
                'ExternalStreams', 'TrueTypeFonts', 'AlternateImages'
            ]);
            for (const [k, v] of Object.entries(e)) {
                if (KNOWN_FLAGS.has(k)) {
                    if (!isInt(v)) {
                        throw new ParseError('pdf/misc/legal-bad-flag',
                            `/Legal /${k} must be an integer count`,
                            { context: { key: k } });
                    }
                    out.flags[k] = v.value;
                } else if (k === 'Attestation') {
                    if (v.type !== 'string') {
                        throw new ParseError('pdf/misc/legal-bad-attestation',
                            '/Attestation must be a string');
                    }
                    out.attestation = v.value;
                } else if ((k === 'HideAnnotationActions' || k === 'GoToRemoteActions') && isInt(v)) {
                    // the standard's spellings, read without a new throw:
                    // a value of another type stays in _extras
                    out.flags[k] = v.value;
                } else if (k === 'OptionalContent' && isBool(v)) {
                    out.optionalContent = v.value;
                } else {
                    out._extras[k] = v;
                }
            }
            return out;
        }

        function typeRequirements(arr) {
            if (!isArr(arr)) {
                throw new ParseError('pdf/misc/req-not-array',
                    '/Requirements must be an array');
            }
            const out = [];
            for (let i = 0; i < arr.items.length; i++) {
                const it = arr.items[i];
                if (!isDict(it)) {
                    throw new ParseError('pdf/misc/req-bad-entry',
                        '/Requirements entry must be a dict',
                        { context: { index: i } });
                }
                const e = it.entries;
                if (!e.S || !isName(e.S)) {
                    throw new ParseError('pdf/misc/req-missing-S',
                        '/Requirements entry needs /S name',
                        { context: { index: i } });
                }
                const entry = {
                    raw: it,
                    s: e.S.value,
                    standard: REQUIREMENT_S_VALUES.has(e.S.value),
                    rh: e.RH
                };
                // ISO 32000-2's keys, present only when the key is.
                if (e.Type) entry.type = isName(e.Type) ? e.Type.value : null;
                if (e.V) entry.v = isName(e.V) ? e.V.value : (isDict(e.V) || isRef(e.V) ? e.V : null);
                if (e.Penalty) entry.penalty = isInt(e.Penalty) ? e.Penalty.value : null;
                if (e.DigSig) entry.digSig = isDict(e.DigSig) || isRef(e.DigSig) ? e.DigSig : null;
                if (e.Encrypt) entry.encrypt = isDict(e.Encrypt) || isRef(e.Encrypt) ? e.Encrypt : null;
                out.push(entry);
            }
            return out;
        }

        /**
         * Type a requirement handler (a requirement's `/RH` entry):
         * `{ type, s, script, raw, _extras }`.
         */
        function typeRequirementHandler(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/req-handler-not-dict',
                    'a requirement handler must be a dictionary');
            }
            const e = dict.entries;
            const out = {
                type: isName(e.Type) ? e.Type.value : null,
                s: isName(e.S) ? e.S.value : null,
                script: e.Script && e.Script.type === 'string' ? e.Script.value : null,
                raw: dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (k !== 'Type' && k !== 'S' && k !== 'Script') out._extras[k] = e[k];
            }
            return out;
        }

        function typeDocMdpParams(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/docmdp-not-dict',
                    '/DocMDP transform params must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.P) {
                if (!isInt(e.P) || e.P.value < 1 || e.P.value > 3) {
                    throw new ParseError('pdf/misc/docmdp-bad-P',
                        '/DocMDP /P must be 1, 2, or 3');
                }
                out.permission = e.P.value;
            }
            if (e.V) {
                if (!isName(e.V)) {
                    throw new ParseError('pdf/misc/docmdp-bad-V',
                        '/DocMDP /V must be a name');
                }
                out.version = e.V.value;
            }
            if (isName(e.Type)) out.type = e.Type.value;
            const KNOWN = new Set(['Type', 'P', 'V']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typePerms(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/perms-not-dict',
                    '/Perms must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.DocMDP) out.docMDP = e.DocMDP;
            if (e.UR3)    out.ur3    = e.UR3;
            if (e.UR)     out.ur     = e.UR;
            const KNOWN = new Set(['DocMDP', 'UR3', 'UR']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeNeedsRendering(v) {
            if (!isBool(v)) {
                throw new ParseError('pdf/misc/needsrendering-bad',
                    '/NeedsRendering must be boolean');
            }
            return v.value;
        }

        // Viewer preferences (§12.2, Table 147): key → [field, kind, default].
        const VIEWER_PREFS = [
            ['HideToolbar', 'hideToolbar', 'bool', false],
            ['HideMenubar', 'hideMenubar', 'bool', false],
            ['HideWindowUI', 'hideWindowUI', 'bool', false],
            ['FitWindow', 'fitWindow', 'bool', false],
            ['CenterWindow', 'centerWindow', 'bool', false],
            ['DisplayDocTitle', 'displayDocTitle', 'bool', false],
            ['NonFullScreenPageMode', 'nonFullScreenPageMode', 'name', 'UseNone'],
            ['Direction', 'direction', 'name', 'L2R'],
            ['ViewArea', 'viewArea', 'name', 'CropBox'],
            ['ViewClip', 'viewClip', 'name', 'CropBox'],
            ['PrintArea', 'printArea', 'name', 'CropBox'],
            ['PrintClip', 'printClip', 'name', 'CropBox'],
            ['PrintScaling', 'printScaling', 'name', 'AppDefault'],
            ['Duplex', 'duplex', 'name', null],
            ['PickTrayByPDFSize', 'pickTrayByPDFSize', 'bool', false]
        ];
        const VIEWER_PREFS_KNOWN = new Set([
            ...VIEWER_PREFS.map((p) => p[0]), 'PrintPageRange', 'NumCopies', 'Enforce'
        ]);

        function typeViewerPreferences(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/viewer-prefs-not-dict',
                    '/ViewerPreferences must be a dict');
            }
            const e = dict.entries;
            const out = {};
            for (const [key, field, kind, dflt] of VIEWER_PREFS) {
                const v = e[key];
                out[field] = (kind === 'bool' ? isBool(v) : isName(v)) ? v.value : dflt;
            }
            // [first last first last ...] page-number pairs (1-based).
            const range = e.PrintPageRange;
            out.printPageRange = isArr(range) && range.items.length % 2 === 0 && range.items.every(isInt)
                ? range.items.reduce((acc, it, i) => {
                    if (i % 2 === 0) acc.push([it.value]);
                    else acc[acc.length - 1].push(it.value);
                    return acc;
                }, [])
                : null;
            out.numCopies = isInt(e.NumCopies) && e.NumCopies.value > 0 ? e.NumCopies.value : null;
            out.enforce = isArr(e.Enforce) && e.Enforce.items.every(isName)
                ? e.Enforce.items.map((it) => it.value) : null;
            out.raw = dict;
            out._extras = {};
            for (const k of Object.keys(e)) {
                if (!VIEWER_PREFS_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        // The measurement dictionaries: per kind of object, its keys and
        // their types (the Arlington PDF Model's), as `Key:type` pairs
        // apart by a space.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const MEASUREMENT_TYPES = Object.freeze({
            rectilinear: keyTypes('Type:name Subtype:name R:text X:array Y:array D:array A:array T:array S:array O:array CYX:number'),
            geospatial: keyTypes('Type:name Subtype:name Bounds:array GCS:dict DCS:dict PDU:array GPTS:array LPTS:array PCSM:array'),
            numberFormat: keyTypes('Type:name U:text C:number F:name D:int FD:bool RT:text RD:text PS:text SS:text O:name'),
            viewport: keyTypes('Type:name BBox:array Name:text Measure:dict PtData:dict'),
            pointData: keyTypes('Type:name Subtype:name Names:array XPTS:array'),
            geographicCS: keyTypes('Type:name EPSG:int WKT:text'),
            projectedCS: keyTypes('Type:name EPSG:int WKT:text'),
            markupGeo: keyTypes('Type:name Subtype:name')
        });
        const MEASUREMENT_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(MEASUREMENT_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
        const MEASUREMENT_READ = Object.freeze({
            name: (v) => (isName(v) ? v.value : null),
            text: (v) => (v && v.type === 'string' ? v.value : null),
            number: (v) => (v && (v.type === 'int' || v.type === 'real') ? v.value : null),
            int: (v) => (isInt(v) ? v.value : null),
            bool: (v) => (isBool(v) ? v.value : null),
            array: (v) => (isArr(v) || isRef(v) ? v : null),
            dict: (v) => (isDict(v) || isRef(v) ? v : null),
            stream: (v) => (v && (v.type === 'stream' || v.type === 'ref') ? v : null),
            // A key that takes any object: its value as read.
            any: (v) => (v === undefined ? null : v)
        });
        // A key's value by its type (of several, `a|b`, the first that
        // fits); a reference, whatever the type, as read.
        function readKey(type, v) {
            if (isRef(v)) return v;
            for (const t of type.split('|')) {
                const r = MEASUREMENT_READ[t](v);
                if (r !== null) return r;
            }
            return null;
        }

        /**
         * Type a measurement dictionary of the given kind (a key of
         * `MEASUREMENT_KEYS`: `rectilinear`, `geospatial`, `numberFormat`,
         * `viewport`, `pointData`, the coordinate systems `geographicCS` and
         * `projectedCS`, `markupGeo` (a geospatial markup's external
         * data)): one field per key of its list, named
         * after the key in lower case (`CYX` → `cyx`), present only when
         * the key is; the other keys in `_extras`.
         */
        function typeMeasurement(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(MEASUREMENT_TYPES, kind)) {
                throw new ContractError('pdf/misc/measurement/kind',
                    `kind must be one of ${Object.keys(MEASUREMENT_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/measurement/not-dict',
                    'a measurement dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = MEASUREMENT_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The XObject entries the core typers leave out: per kind of
        // XObject, the keys and their types (the Arlington PDF Model's).
        const FORM_COMMON = 'Type:name FormType:int Ref:dict PieceInfo:dict LastModified:text OPI:dict OC:dict '
            + 'Name:name AF:array Measure:dict PtData:dict';
        const IMAGE_COMMON = 'Alternates:array SMaskInData:int Name:name StructParent:int ID:text OPI:dict OC:dict '
            + 'AF:array Measure:dict PtData:dict';
        const XOBJECT_ENTRY_TYPES = Object.freeze({
            image: keyTypes(`Type:name ${IMAGE_COMMON}`),
            imageMask: keyTypes(`Type:name ImageMask:bool ${IMAGE_COMMON}`),
            softMask: keyTypes('Type:name Name:name Matte:array AF:array'),
            form: keyTypes(`${FORM_COMMON} XUID:array`),
            printerMark: keyTypes(`${FORM_COMMON} MarkStyle:text Colorants:dict`),
            trapNet: keyTypes(`${FORM_COMMON} PCM:name SeparationColorNames:array TrapRegions:array TrapStyles:text`),
            ps: keyTypes('Level1:stream'),
            psPassthrough: keyTypes('Subtype2:name Level1:stream PS:stream FormType:int BBox:array Matrix:array')
        });
        const XOBJECT_ENTRY_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(XOBJECT_ENTRY_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * The companion of the core XObject typers: the keys of an XObject
         * of the given kind (a key of `XOBJECT_ENTRY_KEYS`) that they leave
         * out, one field each, named after the key in lower case
         * (`SMaskInData` → `smaskindata`), present only when the key is;
         * no `_extras` (the other keys are the core typers' part).
         */
        function typeXObjectEntries(value, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(XOBJECT_ENTRY_TYPES, kind)) {
                throw new ContractError('pdf/misc/xobject/kind',
                    `kind must be one of ${Object.keys(XOBJECT_ENTRY_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            const dict = value && value.type === 'stream' ? value.dict : value;
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/xobject/not-dict',
                    'an XObject must be a stream or a dictionary',
                    { context: { type: value && value.type } });
            }
            const types = XOBJECT_ENTRY_TYPES[kind];
            const out = { kind, raw: value };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
            }
            return out;
        }

        // The Web Capture dictionaries: per kind, the keys and their types.
        const WEB_CAPTURE_TYPES = Object.freeze({
            pageSet: keyTypes('Type:name S:name ID:text O:array SI:array|dict CT:text TS:text T:text TID:text'),
            imageSet: keyTypes('Type:name S:name ID:text O:array SI:array|dict CT:text TS:text R:array|int'),
            command: keyTypes('URL:text L:int F:int P:stream|text CT:text H:text S:dict'),
            commandSettings: keyTypes('G:dict C:dict')
        });
        const WEB_CAPTURE_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(WEB_CAPTURE_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type a Web Capture page set, image set, command or command
         * settings dictionary (`kind` a key of `WEB_CAPTURE_KEYS`): one
         * field per key of its list, named after the key in lower case
         * (`TID` → `tid`), present only when the key is; the other keys in
         * `_extras`.
         */
        function typeWebCapture(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(WEB_CAPTURE_TYPES, kind)) {
                throw new ContractError('pdf/misc/web-capture/kind',
                    `kind must be one of ${Object.keys(WEB_CAPTURE_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/web-capture/not-dict',
                    'a Web Capture dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = WEB_CAPTURE_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // A signature field's /Lock, the FieldMDP and the UR transform
        // parameters.
        const FIELD_LOCK_TYPES = Object.freeze({
            lock: keyTypes('Type:name Action:name Fields:array P:number'),
            fieldMdp: keyTypes('Type:name Action:name Fields:array V:name'),
            urTransform: keyTypes('Type:name Document:array Msg:text V:name Annots:array Form:array Signature:array EF:array P:bool')
        });

        /**
         * Type a signature field's lock (`kind` `lock`), FieldMDP
         * transform parameters (`fieldMdp`: `type`, `action`, `fields`,
         * and `p` or `v`) or UR transform parameters (`urTransform`:
         * `type`, `document`, `msg`, `v`, `annots`, `form`, `signature`,
         * `ef`, `p`), each present only when the key is; the other keys in
         * `_extras`.
         */
        function typeFieldLock(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(FIELD_LOCK_TYPES, kind)) {
                throw new ContractError('pdf/misc/field-lock/kind',
                    'kind must be lock, fieldMdp or urTransform',
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/field-lock/not-dict',
                    'a field lock must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = FIELD_LOCK_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The presentation and navigation dictionaries: per kind, the
        // keys and their types (the Arlington PDF Model's).
        const PRESENTATION_TYPES = Object.freeze({
            floatingWindow: keyTypes('Type:name D:array RT:int P:int O:int T:bool UC:bool R:int TT:array'),
            transition: keyTypes('Type:name S:name D:number Dm:name M:name Di:int|name SS:number B:bool'),
            navNode: keyTypes('Type:name NA:dict PA:dict Next:dict Prev:dict Dur:number'),
            bead: keyTypes('Type:name T:dict N:dict V:dict P:dict R:array'),
            thread: keyTypes('Type:name F:dict I:dict Metadata:stream'),
            slideShow: keyTypes('Type:name Subtype:name Resources:dict StartResource:text'),
            pageLabel: keyTypes('Type:name S:name P:text St:int'),
            viewParams: keyTypes('Instance:dict Data:stream|text'),
            outlines: keyTypes('Type:name First:dict Last:dict Count:int')
        });
        const PRESENTATION_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(PRESENTATION_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type a presentation or navigation dictionary, `kind`
         * `floatingWindow`, `transition`, `navNode`, `bead`, `thread`,
         * `slideShow`, `pageLabel`, `viewParams` or `outlines` (the outline
         * root): one field per key of its list, named after the key in lower
         * case, present only when the key is; the other keys in `_extras`.
         */
        function typePresentation(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(PRESENTATION_TYPES, kind)) {
                throw new ContractError('pdf/misc/presentation/kind',
                    'kind must be a key of PRESENTATION_KEYS',
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/presentation/not-dict',
                    'a presentation dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = PRESENTATION_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The catalog's name, extensions and URI dictionaries: per kind,
        // the keys and their types (the Arlington PDF Model's).
        const CATALOG_PART_TYPES = Object.freeze({
            names: keyTypes('Dests:dict AP:dict JavaScript:dict Pages:dict Templates:dict IDS:dict URLS:dict '
                + 'EmbeddedFiles:dict AlternatePresentations:dict Renditions:dict'),
            extensions: keyTypes('Type:name ISO_:array|dict'),
            devExtensions: keyTypes('Type:name BaseVersion:name ExtensionLevel:int URL:text ExtensionRevision:text'),
            uri: keyTypes('Base:text')
        });
        const CATALOG_PART_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(CATALOG_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type the catalog's name dictionary (`kind` `names`, each tree's
         * root as read), its extensions dictionary (`extensions`), a
         * developer extensions dictionary (`devExtensions`) or its URI
         * dictionary (`uri`): one field per key of its list, named after the
         * key in lower case, present only when the key is; the other keys
         * in `_extras`.
         */
        function typeCatalogPart(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(CATALOG_PART_TYPES, kind)) {
                throw new ContractError('pdf/misc/catalog-part/kind',
                    'kind must be a key of CATALOG_PART_KEYS',
                    { context: { kind } });
            }
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/catalog-part/not-dict',
                    'a catalog dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = CATALOG_PART_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The keys the core typers read without putting them in their
        // record (a CMap's, a thumbnail's, a page tree node's …): per kind,
        // the keys and their types (the Arlington PDF Model's).
        const OBJECT_ENTRY_TYPES = Object.freeze({
            thumbnail: keyTypes('Type:name Subtype:name Width:int Height:int ColorSpace:name|array BitsPerComponent:int Decode:array'),
            cmap: keyTypes('Type:name CMapName:name CIDSystemInfo:dict WMode:int UseCMap:name|stream'),
            iccProfile: keyTypes('N:int Alternate:name|array Range:array Metadata:stream'),
            pageTree: keyTypes('Type:name Parent:dict MediaBox:array CropBox:array Rotate:int'),
            resource: keyTypes('Properties:dict Encoding:dict'),
            encoding: keyTypes('Type:name'),
            trailer: keyTypes('XRefStm:int'),
            objectStream: keyTypes('Extends:stream')
        });
        const OBJECT_ENTRY_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(OBJECT_ENTRY_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * The companion of the core typers that read these keys without
         * putting them in their record: a thumbnail (`kind` `thumbnail`), a
         * CMap or ToUnicode stream (`cmap`), an ICC profile (`iccProfile`), a
         * page tree node (`pageTree`), a resource dictionary (`resource`), an
         * encoding (`encoding`), the trailer (`trailer`), an object stream
         * (`objectStream`). Accepts a stream or a dictionary: one field per
         * key of its list, named after the key in lower case, present only
         * when the key is; the other keys in `_extras`.
         */
        function typeObjectEntries(value, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(OBJECT_ENTRY_TYPES, kind)) {
                throw new ContractError('pdf/misc/object-entries/kind',
                    'kind must be a key of OBJECT_ENTRY_KEYS',
                    { context: { kind } });
            }
            const dict = value && value.type === 'stream' ? value.dict : value;
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/object-entries/not-dict',
                    'neither a stream nor a dictionary',
                    { context: { type: value && value.type } });
            }
            const types = OBJECT_ENTRY_TYPES[kind];
            const out = { raw: value, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // Small objects no other typer is bound to (the Arlington PDF
        // Model's; ISO 32000-2 unless noted): per kind, the keys and their
        // types. A date is its string; `any` copies the value as read.
        const SMALL_OBJECT_TYPES = Object.freeze({
            alternateImage: keyTypes('Image:stream DefaultForPrinting:bool OC:dict'),
            data: keyTypes('LastModified:text Private:any'),
            destDict: keyTypes('D:array SD:array'),
            fixedPrint: keyTypes('Type:name Matrix:array H:number V:number'),
            markInfo: keyTypes('Marked:bool UserProperties:bool Suspects:bool'),
            markedContentReference: keyTypes('Type:name Pg:dict Stm:stream StmOwn:array|dict|stream MCID:int'),
            minimumBitDepth: keyTypes('Type:name V:int M:int'),
            namespace: keyTypes('Type:name NS:text Schema:dict|text RoleMapNS:dict'),
            objectReference: keyTypes('Type:name Pg:dict Obj:array|dict|stream'),
            reference: keyTypes('F:dict|text Page:int|text ID:array'),
            sourceInformation: keyTypes('AU:dict|text TS:text E:text S:int C:dict'),
            timespan: keyTypes('Type:name S:name V:number'),
            urlAlias: keyTypes('U:text C:array'),
            userProperty: keyTypes('N:text V:any F:text H:bool'),
            winLaunch: keyTypes('F:text D:text O:text P:text')
        });
        const SMALL_OBJECT_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(SMALL_OBJECT_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type a small object of the given kind (a key of
         * `SMALL_OBJECT_KEYS`): an alternate image, a page-piece data
         * dictionary, a structure destination's dictionary, a fixed-print
         * dictionary, the mark information, a marked-content or an object
         * reference, a minimum bit depth, a namespace, a reference
         * XObject's reference, a web capture's source information, a
         * timespan, a URL alias, a user property, the Windows launch
         * parameters (`winLaunch`). Accepts a stream or a dictionary: one
         * field per key of its list, named after the key in lower case,
         * present only when the key is; the other keys in `_extras`.
         */
        function typeSmallObject(value, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(SMALL_OBJECT_TYPES, kind)) {
                throw new ContractError('pdf/misc/small-object/kind',
                    'kind must be a key of SMALL_OBJECT_KEYS',
                    { context: { kind } });
            }
            const dict = value && value.type === 'stream' ? value.dict : value;
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/small-object/not-dict',
                    'neither a stream nor a dictionary',
                    { context: { type: value && value.type } });
            }
            const types = SMALL_OBJECT_TYPES[kind];
            const out = { raw: value, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = readKey(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        return {
            typeSmallObject,
            SMALL_OBJECT_KEYS,
            typeSpiderInfo,
            typeViewerPreferences,
            typeThreads,
            typeLegal,
            typeRequirements,
            typeRequirementHandler,
            typeDocMdpParams,
            typePerms,
            typeNeedsRendering,
            typeMeasurement,
            MEASUREMENT_KEYS,
            typeXObjectEntries,
            XOBJECT_ENTRY_KEYS,
            typeWebCapture,
            WEB_CAPTURE_KEYS,
            typeFieldLock,
            typePresentation,
            PRESENTATION_KEYS,
            typeCatalogPart,
            CATALOG_PART_KEYS,
            typeObjectEntries,
            OBJECT_ENTRY_KEYS,
            REQUIREMENT_S_VALUES
        };
    }
};
