// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { slide } from './slide.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textParagraph } from '../text/paragraph.js';
import { textHeading } from '../text/heading.js';
import { textList } from '../text/list.js';
import { textSection } from '../text/section.js';
import { textContent } from '../text/content.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { tableCell } from '../table/cell.js';
import { tableRow } from '../table/row.js';
import { tableTable } from '../table/table.js';
import { drawImage } from '../draw/image.js';
import { drawFrame } from '../draw/frame.js';

function build() {
    const xml = fwXml.factory();
    const para = textParagraph.factory(xml);
    const head = textHeading.factory(xml, para);
    const list = textList.factory(xml, para);
    const sect = textSection.factory(xml);
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);
    const content = textContent.factory(xml, para, head, list, sect, table);
    const image = drawImage.factory(xml);
    const frame = drawFrame.factory(xml, image);
    return { xml, s: slide.factory(xml, para, content, frame) };
}

describe('slide module', () => {
    test('factory shape', () => {
        expect(slide.name).toBe('slide');
        expect(slide.dependencies).toEqual(['xml', 'textParagraph', 'textContent', 'drawFrame']);
        expect(typeof slide.factory).toBe('function');
    });

    describe('parseSlide', () => {
        test('parses basic attrs', () => {
            const { xml, s } = build();
            const el = xml.parse('<draw:page draw:name="slide1" draw:master-page-name="Default" draw:style-name="dp1" presentation:presentation-page-layout-name="L1"/>');
            const out = s.parseSlide(el);
            expect(out.name).toBe('slide1');
            expect(out.masterPageName).toBe('Default');
            expect(out.styleName).toBe('dp1');
            expect(out.layoutName).toBe('L1');
            expect(out.frames).toEqual([]);
        });

        test('parses frames', () => {
            const { xml, s } = build();
            const el = xml.parse('<draw:page draw:name="s"><draw:frame draw:name="title"/><draw:frame draw:name="content"/></draw:page>');
            const out = s.parseSlide(el);
            expect(out.frames).toHaveLength(2);
            expect(out.frames[0].name).toBe('title');
        });

        test('parses notes', () => {
            const { xml, s } = build();
            const el = xml.parse('<draw:page draw:name="s"><presentation:notes><text:p>speaker note</text:p></presentation:notes></draw:page>');
            const out = s.parseSlide(el);
            expect(out.notes).toBeDefined();
            expect(out.notes.body).toHaveLength(1);
        });

        test('preserves unknown children in _extras', () => {
            const { xml, s } = build();
            const el = xml.parse('<draw:page draw:name="s"><draw:rect/></draw:page>');
            const out = s.parseSlide(el);
            expect(out._extras.children).toHaveLength(1);
        });
    });

    describe('renderSlide', () => {
        test('renders attrs + frames', () => {
            const { xml, s } = build();
            const out = xml.serialize(s.renderSlide({
                type: 'slide', name: 'S', masterPageName: 'M', frames: [
                    { type: 'frame', name: 'title', child: { kind: 'text-box', children: [], attrs: {} } }
                ]
            }));
            expect(out).toContain('draw:name="S"');
            expect(out).toContain('draw:master-page-name="M"');
            expect(out).toContain('<draw:frame');
        });

        test('renders notes', () => {
            const { xml, s } = build();
            const para = xml.el('text:p', {}, [xml.text('hello')]);
            const out = xml.serialize(s.renderSlide({
                type: 'slide', name: 'S', frames: [], notes: { body: [para] }
            }));
            expect(out).toContain('<presentation:notes');
            expect(out).toContain('hello');
        });

        test('roundtrip', () => {
            const { xml, s } = build();
            const orig = {
                type: 'slide', name: 'Slide1', masterPageName: 'Default',
                layoutName: 'AL1',
                frames: [
                    { type: 'frame', name: 'title', child: { kind: 'text-box',
                        children: [xml.el('text:p', {}, [xml.text('Hello')])], attrs: {} } }
                ]
            };
            const back = s.parseSlide(xml.parse(xml.serialize(s.renderSlide(orig))));
            expect(back.name).toBe('Slide1');
            expect(back.masterPageName).toBe('Default');
            expect(back.layoutName).toBe('AL1');
            expect(back.frames).toHaveLength(1);
        });
    });

    describe('slideText', () => {
        const tb = kids => ({ type: 'frame', child: { kind: 'text-box', children: kids, attrs: {} } });
        const p = (xml, t) => xml.el('text:p', {}, [xml.text(t)]);

        test('text-box paragraphs; a placeholder contributes nothing', () => {
            const { xml, s } = build();
            const ph = xml.el('presentation:placeholder', { 'presentation:object': 'title' }, []);
            const m = { type: 'slide', name: 'N', frames: [
                tb([p(xml, 'Welcome'), ph, p(xml, 'Second')])
            ] };
            expect(s.slideText(m)).toBe('Welcome\nSecond');
        });

        test('text:list yields one line per item', () => {
            const { xml, s } = build();
            const list = xml.parse('<text:list><text:list-item><text:p>One</text:p></text:list-item>'
                + '<text:list-item><text:p>Two</text:p></text:list-item></text:list>');
            expect(s.slideText({ type: 'slide', frames: [tb([list])] })).toBe('One\nTwo');
        });

        test('raw children: shape text then table cells, after the frames', () => {
            const { xml, s } = build();
            const el = xml.parse('<draw:page draw:name="s">'
                + '<draw:custom-shape><text:p>Shape text</text:p></draw:custom-shape>'
                + '<draw:g><table:table><table:table-row>'
                + '<table:table-cell><text:p>Cell A</text:p></table:table-cell>'
                + '<table:table-cell><text:p>Cell B</text:p></table:table-cell>'
                + '</table:table-row></table:table></draw:g>'
                + '<draw:frame><draw:text-box><text:p>Frame text</text:p></draw:text-box></draw:frame>'
                + '</draw:page>');
            const m = s.parseSlide(el);
            expect(s.slideText(m)).toBe('Frame text\nShape text\nCell A\nCell B');
        });

        test('a table nested under a raw child contributes its cell texts', () => {
            const { xml, s } = build();
            const tbl = xml.parse('<table:table><table:table-row>'
                + '<table:table-cell><text:p>X</text:p></table:table-cell>'
                + '<table:table-cell><text:p>Y</text:p></table:table-cell>'
                + '</table:table-row></table:table>');
            const m = { type: 'slide', frames: [], _extras: { children: [
                xml.el('draw:g', {}, [tbl])
            ] } };
            expect(s.slideText(m)).toBe('X\nY');
        });

        test('notes are excluded by default, appended last with { notes: true }', () => {
            const { xml, s } = build();
            const m = { type: 'slide', name: 'N',
                frames: [tb([p(xml, 'Body')])],
                notes: { body: [p(xml, 'Speaker note.')] } };
            expect(s.slideText(m)).toBe('Body');
            expect(s.slideText(m, {})).toBe('Body');
            expect(s.slideText(m, { notes: false })).toBe('Body');
            expect(s.slideText(m, { notes: true })).toBe('Body\nSpeaker note.');
        });

        test('empty inputs give the empty string', () => {
            const { xml, s } = build();
            expect(s.slideText({ type: 'slide', frames: [] })).toBe('');
            expect(s.slideText({ type: 'slide', frames: [tb([xml.el('text:p', {}, [])])] })).toBe('');
            expect(s.slideText(undefined)).toBe('');
        });

        test('the slide name is not text', () => {
            const { s } = build();
            expect(s.slideText({ type: 'slide', name: 'Intro', frames: [] })).toBe('');
        });

        test('non-text raw children add nothing and do not throw', () => {
            const { xml, s } = build();
            const m = s.parseSlide(xml.parse('<draw:page><anim:par><anim:seq/></anim:par></draw:page>'));
            expect(m._extras.children).toHaveLength(1);
            expect(s.slideText(m)).toBe('');
        });

        test('non-text-box frame children (image) are skipped', () => {
            const { xml, s } = build();
            const m = { type: 'slide', frames: [
                { type: 'frame', child: { kind: 'image', href: 'a.png' } },
                tb([p(xml, 'Kept')])
            ] };
            expect(s.slideText(m)).toBe('Kept');
        });

        test('dependencies pin is unchanged', () => {
            expect(slide.dependencies).toEqual(['xml', 'textParagraph', 'textContent', 'drawFrame']);
        });

        describe('raw slide tree walk', () => {
            const TABLE = '<table:table><table:table-row>'
                + '<table:table-cell><text:p>CellA</text:p></table:table-cell>'
                + '<table:table-cell><text:p>CellB</text:p></table:table-cell>'
                + '</table:table-row></table:table>';
            const textOf = inner => {
                const { xml, s } = build();
                return s.slideText(s.parseSlide(xml.parse('<draw:page draw:name="s">' + inner + '</draw:page>')));
            };

            test('a table held by a presentation:class=table frame contributes its cells', () => {
                expect(textOf('<draw:frame presentation:class="table">' + TABLE + '</draw:frame>'))
                    .toBe('CellA\nCellB');
            });

            test('a table placed directly on the slide contributes its cells', () => {
                expect(textOf(TABLE)).toBe('CellA\nCellB');
            });

            test('a text box nested in a group contributes its paragraphs', () => {
                expect(textOf('<draw:g><draw:frame><draw:text-box><text:p>GroupBox</text:p></draw:text-box></draw:frame></draw:g>'))
                    .toBe('GroupBox');
            });

            test('control: a plain text-box frame', () => {
                expect(textOf('<draw:frame><draw:text-box><text:p>Box</text:p></draw:text-box></draw:frame>'))
                    .toBe('Box');
            });

            test('alternative text (svg:title / svg:desc) is not visible text', () => {
                expect(textOf('<draw:frame><draw:image xlink:href="a.png"/><svg:title>Alt</svg:title><svg:desc>Desc</svg:desc></draw:frame>'))
                    .toBe('');
                expect(textOf('<draw:g><svg:title>T</svg:title><draw:custom-shape><svg:desc>D</svg:desc><text:p>Shown</text:p></draw:custom-shape></draw:g>'))
                    .toBe('Shown');
            });

            test('control: a custom shape holding a list', () => {
                expect(textOf('<draw:custom-shape><text:list><text:list-item><text:p>LI</text:p></text:list-item></text:list></draw:custom-shape>'))
                    .toBe('LI');
            });

            test('document order: typed text-box frame, frame-held table, raw shape', () => {
                const { xml, s } = build();
                const parsed = s.parseSlide(xml.parse('<draw:page>'
                    + '<draw:frame><draw:text-box><text:p>A</text:p></draw:text-box></draw:frame>'
                    + '<draw:frame presentation:class="table">'
                    + '<table:table><table:table-row>'
                    + '<table:table-cell><text:p>B1</text:p></table:table-cell>'
                    + '<table:table-cell><text:p>B2</text:p></table:table-cell>'
                    + '</table:table-row></table:table></draw:frame>'
                    + '<draw:custom-shape><text:p>C</text:p></draw:custom-shape>'
                    + '</draw:page>'));
                expect(parsed.frames).toHaveLength(2);
                expect(s.slideText(parsed)).toBe('A\nB1\nB2\nC');
            });

            test('a group holding a table: each cell text appears exactly once', () => {
                expect(textOf('<draw:g>' + TABLE + '</draw:g>')).toBe('CellA\nCellB');
            });

            test('a text-box frame that also holds a table in its extras: text-box first, then the table', () => {
                expect(textOf('<draw:frame><draw:text-box><text:p>Head</text:p></draw:text-box>' + TABLE + '</draw:frame>'))
                    .toBe('Head\nCellA\nCellB');
            });

            test('notes inside the raw tree are not visible text, and stay opt-in at the end', () => {
                const { xml, s } = build();
                const m = s.parseSlide(xml.parse('<draw:page>'
                    + '<draw:frame><draw:text-box><text:p>Body</text:p></draw:text-box></draw:frame>'
                    + '<presentation:notes><text:p>Note</text:p></presentation:notes></draw:page>'));
                expect(s.slideText(m)).toBe('Body');
                expect(s.slideText(m, { notes: true })).toBe('Body\nNote');
            });
        });
    });
});
