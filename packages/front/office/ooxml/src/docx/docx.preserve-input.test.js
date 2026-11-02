// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docx.write(document, { preserveInput: true })` leaves the given model and
 * options exactly as they were. Without it the writer changes them by
 * design: the dehydrate pass of a bundle demotes typed fields back into
 * `_extras`, and the writer patches `embedRef`, `docId` and a custom XML
 * item's `storeItemID` onto them. The bytes are the same either way.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const core = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) core.register(m);
const docx = core.resolve('docx');
const opc = core.resolve('opcPackage');
const { ContractError } = core.resolve('ooxmlErrors');
const big = new ModuleRuntime();
big.registerDeep(ooxmlMods.docxLargeBundle);
const large = big.resolve('docxLargeBundle');
const enc = new TextEncoder();
const dec = new TextDecoder();

const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 7]);
const para = (...children) => ({ type: 'paragraph', children });

/**
 * A model the core writer changes: a picture (embedRef, docId) and a custom
 * XML item (its generated storeItemID is patched back). A generated id is
 * random: the byte comparisons pass one (`fixedId`).
 */
function coreModel(fixedId) {
    const item = { xml: '<root><v>1</v></root>' };
    if (fixedId) item.storeItemID = '{8A3C1F00-0000-4000-8000-000000000001}';
    return {
        doc: { type: 'document', body: [para(docx.run('Hi')), para(docx.imageRun(png, { cx: 914400, cy: 914400 }))] },
        opts: { customXml: [item] }
    };
}

/** A file whose run carries `w:position`, which the large bundle types on read and demotes on write. */
function positioned() {
    const p = opc.read(docx.write({ type: 'document', body: [para(docx.run('raised'))] }));
    const s = dec.decode(p.parts['/word/document.xml']).replace('<w:r>', '<w:r><w:rPr><w:position w:val="-4"/></w:rPr>');
    p.parts['/word/document.xml'] = enc.encode(s);
    return opc.write(p);
}

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

describe('docx.write preserveInput', () => {
    test('premise: without the option the core writer patches the model it is given', () => {
        const { doc, opts } = coreModel();
        const before = structuredClone({ doc, opts });
        docx.write(doc, opts);
        expect({ doc, opts }).not.toEqual(before);
    });

    test('with it the model and the options are left as they were; the bytes are the same', () => {
        const a = coreModel(true);
        const bytesWithout = docx.write(a.doc, a.opts);
        const b = coreModel(true);
        const before = structuredClone({ doc: b.doc, opts: b.opts });
        const drawing = b.doc.body[1].children[0];
        const bytesWith = docx.write(b.doc, { ...b.opts, preserveInput: true });
        expect({ doc: b.doc, opts: b.opts }).toEqual(before);
        expect(b.doc.body[1].children[0]).toBe(drawing);
        expect(Array.from(bytesWith)).toEqual(Array.from(bytesWithout));
    });

    test('through the large bundle: a typed run property is not demoted in the given model', () => {
        const r = large.read(positioned());
        const before = structuredClone(r.document);
        large.write(r.document, { preserveInput: true });
        expect(r.document).toEqual(before);
        const again = large.read(positioned());
        large.write(again.document);
        expect(again.document).not.toEqual(before); // the documented default demotes
    });

    test('a picture shared by the model and opts.images stays one media part', () => {
        const make = () => ({
            doc: { type: 'document', body: [para(docx.imageRun(png, { cx: 1, cy: 1 }))] },
            images: { rIdP: { data: png, contentType: 'image/png' } }
        });
        const media = (bytes) => Object.keys(opc.read(bytes).parts).filter((n) => n.startsWith('/word/media/'));
        const a = make(), b = make();
        const without = media(docx.write(a.doc, { images: a.images }));
        expect(without).toHaveLength(1);
        expect(media(docx.write(b.doc, { images: b.images, preserveInput: true }))).toEqual(without);
    });

    test('preserveInput: false is the default; another value throws docx/invalid-preserve-input', () => {
        const a = coreModel(true), b = coreModel(true);
        expect(Array.from(docx.write(a.doc, { ...a.opts, preserveInput: false }))).toEqual(Array.from(docx.write(b.doc, b.opts)));
        for (const v of ['yes', 1, null]) {
            const e = thrown(() => docx.write(coreModel().doc, { preserveInput: v }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('docx/invalid-preserve-input');
        }
    });
});
