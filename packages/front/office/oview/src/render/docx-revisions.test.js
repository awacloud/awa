// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tracked changes in the docx painter: the accepted view.
 * Inserted and moved-to text is painted, deleted and moved-from text is
 * not (a move source carries `w:t`, not `w:delText`, so painting it would
 * show the moved text twice). The document is written by `@awacloud/ooxml`
 * itself, through the viewer's own engine.
 *
 * @module oview/render/docx-revisions.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { renderContext } from '../../tests/context.js';
import { renderDocx } from './docx.js';

const text = (value) => ({ type: 'run', children: [{ type: 'text', value }] });

describe('docx tracked changes', () => {
    test('inserted and moved-to text is painted, deleted and moved-from text is not', async () => {
        const ctx = renderContext();
        const { docx } = await ctx.engine('docx');
        const bytes = docx.write({
            body: [{
                type: 'paragraph',
                children: [
                    text('Keep'),
                    { type: 'moveFrom', id: '1', author: 'Ann', children: [text(' MOVEDFROM')] },
                    { type: 'ins', id: '2', author: 'Ann', children: [docx.hyperlink(' new link', 'https://example.test/ins', { rId: 'rIdIns' })] },
                    { type: 'del', id: '3', author: 'Ann', children: [{ type: 'run', children: [{ type: 'delText', value: ' DELETED' }] }] },
                    { type: 'moveTo', id: '4', author: 'Ann', children: [text(' moved')] }
                ]
            }]
        });
        const view = await renderDocx(bytes, ctx);
        const el = /** @type {HTMLElement} */ (view.element);
        expect(el.textContent).toContain('Keep new link moved');
        expect(el.textContent).not.toContain('MOVEDFROM');
        expect(el.textContent).not.toContain('DELETED');
        expect(el.querySelector('a')?.getAttribute('href')).toBe('https://example.test/ins');
    });

    test('inside a hyperlink: the inserted text is painted in the link, the deleted text is not (T31 c6)', async () => {
        const ctx = renderContext();
        const { docx } = await ctx.engine('docx');
        const link = docx.hyperlink('see ', 'https://example.test/toc', { rId: 'rIdToc' });
        link.children.push(
            { type: 'del', id: '1', author: 'Ann', children: [{ type: 'run', children: [{ type: 'delText', value: 'DELETED' }] }] },
            { type: 'ins', id: '2', author: 'Ann', children: [text('page 3')] }
        );
        const view = await renderDocx(docx.write({ body: [{ type: 'paragraph', children: [link] }] }), ctx);
        const a = /** @type {HTMLElement} */ (view.element).querySelector('a');
        expect(a?.textContent).toBe('see page 3');
        expect(a?.getAttribute('href')).toBe('https://example.test/toc');
    });
});
