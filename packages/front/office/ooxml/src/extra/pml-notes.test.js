// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { pmlNotes } from './pml-notes.js';

const xml = ooxmlXml.factory();
const ext = pmlNotes.factory(xml);

describe('extra/pml-notes', () => {
    test('builds and parses an empty notes slide', () => {
        const text = ext.buildEmptyNotesSlide();
        expect(text).toContain('<p:notes');
        expect(text).toContain('<p:cSld');
        const parsed = ext.parseNotesSlide(text);
        expect(parsed.kind).toBe('notes');
        expect(parsed.clrMapOvr.masterClrMapping).toBe(true);
    });

    test('parses notes with hf', () => {
        const text = `<p:notes xmlns:p="x" xmlns:a="a" xmlns:r="r">
          <p:cSld><p:spTree/></p:cSld>
          <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
          <p:hf sldNum="0" hdr="1" ftr="1" dt="1"/>
        </p:notes>`;
        const n = ext.parseNotes(xml.parse(text));
        expect(n.hf.attrs.hdr).toBe('1');
        expect(n.clrMapOvr.masterClrMapping).toBe(true);
    });

    test('roundtrips notesMaster (cSld + clrMap + hf + notesStyle)', () => {
        const text = `<p:notesMaster xmlns:p="x" xmlns:a="a" xmlns:r="r">
          <p:cSld><p:spTree/></p:cSld>
          <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"
                    accent2="accent2" accent3="accent3" accent4="accent4"
                    accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
          <p:hf hdr="0"/>
          <p:notesStyle/>
        </p:notesMaster>`;
        const nm = ext.parseNotesMaster(xml.parse(text));
        expect(nm.clrMap.bg1).toBe('lt1');
        expect(nm.hf.attrs.hdr).toBe('0');
        const out = ext.renderNotesMaster(nm);
        expect(out.name).toBe('p:notesMaster');
    });

    test('roundtrips handoutMaster', () => {
        const text = `<p:handoutMaster xmlns:p="x" xmlns:a="a" xmlns:r="r">
          <p:cSld><p:spTree/></p:cSld>
          <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="a1"
                    accent2="a2" accent3="a3" accent4="a4" accent5="a5"
                    accent6="a6" hlink="h" folHlink="f"/>
          <p:hf/>
        </p:handoutMaster>`;
        const hm = ext.parseHandoutMaster(xml.parse(text));
        expect(hm.kind).toBe('handoutMaster');
        const back = ext.parseHandoutMaster(ext.renderHandoutMaster(hm));
        expect(back.clrMap.bg1).toBe('lt1');
    });

    test('parses notesSz', () => {
        const sz = ext.parseNotesSz(xml.parse('<p:notesSz xmlns:p="x" cx="6858000" cy="9144000"/>'));
        expect(sz.cx).toBe('6858000');
        const out = ext.renderNotesSz({ cx: 6858000, cy: 9144000 });
        expect(out.attrs.cy).toBe('9144000');
    });

    test('parses view-props elements', () => {
        const nvp = ext.parseNotesViewPr(xml.parse('<p:notesViewPr xmlns:p="x" showOutlineIcons="1"/>'));
        expect(nvp.attrs.showOutlineIcons).toBe('1');
        expect(ext.renderNotesViewPr(nvp).name).toBe('p:notesViewPr');

        const ntvp = ext.parseNotesTextViewPr(xml.parse('<p:notesTextViewPr xmlns:p="x"/>'));
        expect(ext.renderNotesTextViewPr(ntvp).name).toBe('p:notesTextViewPr');

        const ovp = ext.parseOutlineViewPr(xml.parse('<p:outlineViewPr xmlns:p="x"/>'));
        expect(ext.renderOutlineViewPr(ovp).name).toBe('p:outlineViewPr');

        const ssvp = ext.parseSlideSorterViewPr(xml.parse('<p:slideSorterViewPr xmlns:p="x" showFormatting="1"/>'));
        expect(ext.renderSlideSorterViewPr(ssvp).attrs.showFormatting).toBe('1');
    });
});
