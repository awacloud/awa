// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * pptx pictures on the default read: a `picture` shape becomes an IR image
 * at its place among the slide's body paragraphs, its bytes in
 * `escapes.pptx`, named `image<k>.<ext>` per distinct picture of the deck.
 */
/* global Bun */
import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

const ASSET_DIR = fileURLToPath(new URL('../../tests/_fixtures/corpus/assets/', import.meta.url));
const PX_PNG = new Uint8Array(readFileSync(`${ASSET_DIR}px.png`));
const PX_JPEG = new Uint8Array(readFileSync(`${ASSET_DIR}px.jpg`));
const FIXED_AT = '2026-10-26T00:00:00Z';

let oconvApi;
let pptxApi;
let pptxToIr;
let irToDocx;
let validate;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    oconvApi = rt.resolve('oconv');
    pptxApi = rt.resolve('pptx');
    ({ pptxToIr } = rt.resolve('oconvPptxToIr'));
    ({ irToDocx } = rt.resolve('oconvIrToDocx'));
    ({ validate } = rt.resolve('oconvIr'));
});

const title = (id, text) => ({ type: 'shape', id, placeholder: { type: 'title' }, txBody: { paragraphs: [{ runs: [{ type: 'text', value: text }] }] } });
const box = (id, text) => ({ type: 'shape', id, name: 'TextBox', txBody: { paragraphs: [{ runs: [{ type: 'text', value: text }] }] } });
const table = () => ({
    type: 'table', id: 9, name: 'Table 1', cx: 1000000, cy: 500000, columns: [{ width: 1000000 }],
    rows: [{ height: 500000, cells: [{ txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'A1' }] }] } }] }]
});

/** Two slides: text, the PNG, text; then the same PNG again and a JPEG, and a table. */
function deck() {
    return pptxApi.write({
        slides: [
            { shapes: [title(2, 'First'), box(3, 'Before'), pptxApi.picture(PX_PNG, { name: 'Logo', description: 'The logo' }), box(5, 'After')] },
            { shapes: [title(2, 'Second'), pptxApi.picture(PX_PNG, { name: 'Logo' }), pptxApi.picture(PX_JPEG, { name: 'Photo' }), table()] }
        ]
    });
}

describe('oconvPptxToIr — pictures on the default read', () => {
    test('a picture is an IR image at its place among the body paragraphs', () => {
        const { ir, losses } = pptxToIr(pptxApi.read(deck()));
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.map((n) => n.kind === 'image' ? `image:${n.name}:${n.alt}` : n.kind)).toEqual([
            'heading', 'paragraph', 'image:image1.png:The logo', 'paragraph',
            'heading', 'image:image1.png:', 'image:image2.jpg:'
        ]);
        const img = ir.children[2];
        expect(img.escapes.pptx.contentType).toBe('image/png');
        expect(Bun.deepEquals(img.escapes.pptx.bytes, PX_PNG)).toBe(true);
        expect(losses).toEqual([{ code: 'slides/media-dropped', detail: 'table' }]);
    });

    test('a picture without bytes is an image without escapes, recorded', () => {
        const { ir, losses } = pptxToIr({ presentation: { slides: [{ shapes: [title(2, 'Linked'), { type: 'picture', name: 'Remote', linkRef: 'rId7' }] }] } });
        expect(ir.children[1]).toMatchObject({ kind: 'image', name: 'Remote', alt: '' });
        expect(ir.children[1].escapes).toBeUndefined();
        expect(losses).toEqual([{ code: 'image/bytes-unavailable', detail: 'Remote' }]);
    });

    test('toMd: one asset per distinct picture, with its bytes', async () => {
        const r = await oconvApi.toMd({ name: 'd.pptx', bytes: deck(), convertedAt: FIXED_AT });
        expect(r.markdown).toContain('![The logo](image1.png)');
        expect(r.markdown).toContain('![](image2.jpg)');
        expect(r.assets.map((a) => a.name)).toEqual(['image1.png', 'image2.jpg']);
        expect(Bun.deepEquals(r.assets[0].bytes, PX_PNG)).toBe(true);
        expect(Bun.deepEquals(r.assets[1].bytes, PX_JPEG)).toBe(true);
    });

    test('the docx writer carries a picture read from a pptx', async () => {
        const { ir } = pptxToIr(pptxApi.read(deck()));
        const docx = irToDocx(ir, {});
        expect(docx.losses.map((l) => l.code)).not.toContain('image/dropped');
        const back = await oconvApi.toMd({ name: 'b.docx', bytes: docx.bytes, convertedAt: FIXED_AT });
        expect(back.assets.some((a) => a.bytes && Bun.deepEquals(a.bytes, PX_JPEG))).toBe(true);
    });
});
