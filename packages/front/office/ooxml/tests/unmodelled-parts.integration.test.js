// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — `read().unmodelledParts`, the loss record of the three
 * facades.
 *
 * Each facade's `read()` lists every package part it never consumed (the
 * parts its model does not carry). The oracle is NOT the field's own code:
 * a model is written, extra parts are injected through `opcPackage`, the
 * file is read, then the model is written back and the set difference
 * `source parts − rewritten parts` must equal the listed names.
 *
 * @module ooxml/tests/unmodelled-parts.integration
 */
import { describe, test, expect } from 'bun:test';
import { types } from 'node:util';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../src/main.js';

const enc = new TextEncoder();

const CT_THEME = 'application/vnd.openxmlformats-officedocument.theme+xml';
const CT_CORE = 'application/vnd.openxmlformats-package.core-properties+xml';
const CT_APP = 'application/vnd.openxmlformats-officedocument.extended-properties+xml';
const CT_NOTES = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml';
const CT_PRES_PROPS = 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const REL_THEME = REL + 'theme';
const REL_NOTES = REL + 'notesSlide';
const REL_PRES_PROPS = REL + 'presProps';
const REL_APP = REL + 'extended-properties';
const REL_CORE = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';

const THEME_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Injected"/>';
const CORE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Injected</dc:title></cp:coreProperties>';
const APP_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
    + '<Application>Injected</Application></Properties>';
const NOTES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree/></p:cSld></p:notes>';
const PRES_PROPS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>';

/** Core runtime: the package's own `fw_require` + `modules` manifest. */
function coreRuntime() {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...modules]) rt.register(m);
    return rt;
}

/** Bundle runtime: the full manifest, so the `*-full` bundles resolve. */
function bundleRuntime() {
    const rt = new ModuleRuntime();
    for (const m of [...fw_require, ...modules, ...extras, ...bundle]) rt.register(m);
    return rt;
}

/** Add a part (content type override) and optionally a relationship to it. */
function inject(pkg, partName, text, contentType, rel) {
    pkg.parts[partName] = enc.encode(text);
    if (contentType) pkg.contentTypes.overrides[partName] = contentType;
    if (rel) {
        const list = pkg.rels[rel.source] || (pkg.rels[rel.source] = []);
        list.push({ Id: rel.id, Type: rel.type, Target: rel.target });
    }
}

function partNames(opc, bytes) {
    return new Set(Object.keys(opc.read(bytes).parts));
}

function names(list) {
    return list.map(p => p.partName);
}

/** `a − b` as a sorted array. */
function minus(a, b) {
    return [...a].filter(n => !b.has(n)).sort();
}

// --- model builders ----------------------------------------------------

function docxModel(d) {
    const doc = {
        type: 'document',
        body: [
            d.paragraph('Title', { rPr: { bold: true } }),
            d.listParagraph('First item', 1, 0),
            {
                type: 'paragraph',
                children: [
                    d.run('See '),
                    { type: 'run', children: [{ type: 'footnoteReference', id: '1' }] }
                ]
            }
        ],
        sectPr: {
            pageSize: { w: 12240, h: 15840 },
            headerReferences: [{ type: 'default', rId: 'rIdH1' }]
        }
    };
    const opts = {
        numbering: {
            abstractNums: [{
                abstractNumId: 0, multiLevelType: 'singleLevel',
                levels: [{ ilvl: 0, start: 1, numFmt: 'decimal',
                           lvlText: '%1.', lvlJc: 'left' }]
            }],
            nums: [{ numId: 1, abstractNumId: 0 }]
        },
        settings: { defaultTabStop: 720 },
        footnotes: { notes: [{ id: 1, body: [d.paragraph('Cited source.')] }] },
        headers: { rIdH1: { type: 'header', body: [d.paragraph('Confidential')] } }
    };
    return { doc, opts };
}

/** docx: write the read model back with every write option the envelope provides. */
function docxWriteBack(d, r) {
    return d.write(r.document, {
        styles: r.styles,
        numbering: r.numbering,
        settings: r.settings,
        comments: r.comments,
        footnotes: r.footnotes,
        endnotes: r.endnotes,
        headers: r.headers,
        footers: r.footers,
        hyperlinks: r.hyperlinks,
        customXml: r.customXml
    });
}

function xlsxModel() {
    return {
        type: 'workbook',
        sheets: [{
            name: 'Data',
            rows: [['a', 1], ['b', 2]]
        }]
    };
}

function pptxModel() {
    return { slides: [{ title: 'Hello', body: ['World'] }, { title: 'Second' }] };
}

// --- injections ---------------------------------------------------------

function injectDocx(opc, bytes) {
    const pkg = opc.read(bytes);
    inject(pkg, '/word/theme/theme1.xml', THEME_XML, CT_THEME,
        { source: '/word/document.xml', id: 'rIdTheme', type: REL_THEME, target: 'theme/theme1.xml' });
    inject(pkg, '/docProps/core.xml', CORE_XML, CT_CORE,
        { source: '/', id: 'rIdCore', type: REL_CORE, target: 'docProps/core.xml' });
    return opc.write(pkg);
}

function injectXlsx(opc, bytes) {
    const pkg = opc.read(bytes);
    inject(pkg, '/xl/theme/theme1.xml', THEME_XML, CT_THEME,
        { source: '/xl/workbook.xml', id: 'rIdTheme', type: REL_THEME, target: 'theme/theme1.xml' });
    inject(pkg, '/docProps/app.xml', APP_XML, CT_APP,
        { source: '/', id: 'rIdApp', type: REL_APP, target: 'docProps/app.xml' });
    return opc.write(pkg);
}

function injectPptx(opc, bytes) {
    const pkg = opc.read(bytes);
    const slide = Object.keys(pkg.parts).filter(n => /^\/ppt\/slides\/slide\d+\.xml$/.test(n)).sort()[0];
    inject(pkg, '/ppt/notesSlides/notesSlide1.xml', NOTES_XML, CT_NOTES,
        { source: slide, id: 'rIdNotes', type: REL_NOTES, target: '../notesSlides/notesSlide1.xml' });
    inject(pkg, '/ppt/presProps.xml', PRES_PROPS_XML, CT_PRES_PROPS,
        { source: '/ppt/presentation.xml', id: 'rIdPresProps', type: REL_PRES_PROPS, target: 'presProps.xml' });
    return opc.write(pkg);
}

// --- tests --------------------------------------------------------------

describe('read().unmodelledParts — set oracle per facade', () => {
    test('docx: injected theme + core properties are listed and are exactly what a write-back drops', () => {
        const rt = coreRuntime();
        const d = rt.resolve('docx');
        const opc = rt.resolve('opcPackage');
        const { doc, opts } = docxModel(d);
        const source = injectDocx(opc, d.write(doc, opts));

        const r = d.read(source);
        expect(names(r.unmodelledParts)).toEqual(['/docProps/core.xml', '/word/theme/theme1.xml']);

        const rewritten = docxWriteBack(d, r);
        expect(minus(partNames(opc, source), partNames(opc, rewritten)))
            .toEqual(names(r.unmodelledParts));
    });

    test('xlsx: injected theme + app properties are listed and are exactly what a write-back drops', () => {
        const rt = coreRuntime();
        const x = rt.resolve('xlsx');
        const opc = rt.resolve('opcPackage');
        const source = injectXlsx(opc, x.write(xlsxModel()));

        const r = x.read(source);
        expect(names(r.unmodelledParts)).toEqual(['/docProps/app.xml', '/xl/theme/theme1.xml']);

        const rewritten = x.write(r.workbook);
        expect(minus(partNames(opc, source), partNames(opc, rewritten)))
            .toEqual(names(r.unmodelledParts));
    });

    test('pptx: injected notes slide + presentation properties are listed and are exactly what a write-back drops', () => {
        const rt = coreRuntime();
        const p = rt.resolve('pptx');
        const opc = rt.resolve('opcPackage');
        const source = injectPptx(opc, p.write(pptxModel()));

        const r = p.read(source);
        expect(names(r.unmodelledParts)).toEqual(['/ppt/notesSlides/notesSlide1.xml', '/ppt/presProps.xml']);

        const rewritten = p.write(r.presentation);
        expect(minus(partNames(opc, source), partNames(opc, rewritten)))
            .toEqual(names(r.unmodelledParts));
    });
});

describe('read().unmodelledParts — always present', () => {
    test('a freshly written file lists nothing, for each facade', () => {
        const rt = coreRuntime();
        const d = rt.resolve('docx');
        const x = rt.resolve('xlsx');
        const p = rt.resolve('pptx');
        const { doc, opts } = docxModel(d);
        expect(d.read(d.write(doc, opts)).unmodelledParts).toEqual([]);
        expect(d.read(d.write(d.fromText(['x']))).unmodelledParts).toEqual([]);
        expect(x.read(x.write(xlsxModel())).unmodelledParts).toEqual([]);
        expect(p.read(p.write(pptxModel())).unmodelledParts).toEqual([]);
    });
});

describe('read().unmodelledParts — contentType', () => {
    test('override, extension default, and null when undeclared', () => {
        const rt = coreRuntime();
        const d = rt.resolve('docx');
        const opc = rt.resolve('opcPackage');
        const pkg = opc.read(d.write(d.fromText(['x'])));
        // Override.
        inject(pkg, '/word/theme/theme1.xml', THEME_XML, CT_THEME);
        // Extension default.
        pkg.contentTypes.defaults.png = 'image/png';
        pkg.parts['/word/media/orphan.png'] = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        // Undeclared: no override, no default for the extension.
        pkg.parts['/custom/blob.bin'] = new Uint8Array([1, 2, 3]);

        const r = d.read(opc.write(pkg));
        expect(r.unmodelledParts).toEqual([
            { partName: '/custom/blob.bin', contentType: null },
            { partName: '/word/media/orphan.png', contentType: 'image/png' },
            { partName: '/word/theme/theme1.xml', contentType: CT_THEME }
        ]);
    });
});

describe('read().package — the plain package object', () => {
    test('neither the package nor its parts map is a Proxy, for each facade', () => {
        const rt = coreRuntime();
        const d = rt.resolve('docx');
        const x = rt.resolve('xlsx');
        const p = rt.resolve('pptx');
        const opc = rt.resolve('opcPackage');
        const { doc, opts } = docxModel(d);
        const results = [
            d.read(injectDocx(opc, d.write(doc, opts))),
            x.read(injectXlsx(opc, x.write(xlsxModel()))),
            p.read(injectPptx(opc, p.write(pptxModel())))
        ];
        for (const r of results) {
            expect(types.isProxy(r.package)).toBe(false);
            expect(types.isProxy(r.package.parts)).toBe(false);
            expect(types.isProxy(r.package.rels)).toBe(false);
            expect(types.isProxy(r.package.contentTypes)).toBe(false);
        }
    });
});

describe('read().unmodelledParts — under a bundle', () => {
    // No registered extra consumes a whole package part on read: the
    // hydrate hooks receive typed model nodes (run / paragraph / table /
    // row / cell properties, settings, workbook, sheet), never the
    // package. A bundle therefore lists the same parts as the core.
    test('docxFullBundle lists the same set as the core docx', () => {
        const core = coreRuntime();
        const full = bundleRuntime();
        const d = core.resolve('docx');
        const opc = core.resolve('opcPackage');
        const { doc, opts } = docxModel(d);
        const source = injectDocx(opc, d.write(doc, opts));
        const fromCore = d.read(source).unmodelledParts;
        const fromBundle = full.resolve('docxFullBundle').read(source).unmodelledParts;
        expect(fromBundle).toEqual(fromCore);
        expect(names(fromBundle)).toEqual(['/docProps/core.xml', '/word/theme/theme1.xml']);
    });

    test('xlsxFullBundle lists the same set as the core xlsx', () => {
        const core = coreRuntime();
        const full = bundleRuntime();
        const x = core.resolve('xlsx');
        const opc = core.resolve('opcPackage');
        const source = injectXlsx(opc, x.write(xlsxModel()));
        const fromCore = x.read(source).unmodelledParts;
        const fromBundle = full.resolve('xlsxFullBundle').read(source).unmodelledParts;
        expect(fromBundle).toEqual(fromCore);
        expect(names(fromBundle)).toEqual(['/docProps/app.xml', '/xl/theme/theme1.xml']);
    });
});
