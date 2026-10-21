// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — docx renderers write their children in ECMA-376 schema order:
 * the typed children and the elements a read preserved in `_extras` are
 * interleaved by the element's `xsd:sequence`, not appended.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';
import * as ooxmlMods from '../main.js';

const rt = new ModuleRuntime();
for (const m of [fwXml, ...ooxmlMods.modules]) rt.register(m);
const xml = rt.resolve('xml');
const props = rt.resolve('docxProperties');
const styles = rt.resolve('docxStyles');
const numbering = rt.resolve('docxNumbering');
const settings = rt.resolve('docxSettings');
const structure = rt.resolve('docxStructure');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const names = (el) => el.children.filter((c) => c.type === 'element').map((c) => c.name);
const rootNames = (text) => names(xml.parse(text));
const el = (name) => xml.el(name, {});

describe('orderBySequence', () => {
    for (const [label, api] of [['ooxmlShared', ooxmlShared.factory()], ['docxProperties', props]]) {
        test(`${label}: stable by sequence index; a group shares a place; unlisted before the trailing Change entry, else last`, () => {
            const seq = api.sequence(['w:a', ['w:b', 'w:c'], 'w:d', 'w:dChange']);
            const kids = ['w:d', 'w:x', 'w:c', 'w:dChange', 'w:b', 'w:a', 'w:c'].map((n, i) => xml.el(n, { i: String(i) }));
            const out = api.orderBySequence(kids, seq);
            expect(out.map((c) => `${c.name}#${c.attrs.i}`)).toEqual(['w:a#5', 'w:c#2', 'w:b#4', 'w:c#6', 'w:d#0', 'w:x#1', 'w:dChange#3']);
            const open = api.sequence(['w:a', 'w:b']);
            expect(api.orderBySequence([el('w:z'), el('w:b'), el('w:a')], open).map((c) => c.name)).toEqual(['w:a', 'w:b', 'w:z']);
            const text = xml.text('t');
            expect(api.orderBySequence([text, el('w:a')], open)).toEqual([el('w:a'), text]);
        });

        test(`${label}: an mc:AlternateContent takes the place of the element its Fallback (else its Choice) holds`, () => {
            const seq = api.sequence(['w:start', 'w:numFmt', 'w:lvlText']);
            const alt = (branches) => xml.el('mc:AlternateContent', {}, branches.map(([b, n]) => xml.el(b, {}, [el(n)])));
            const withFallback = alt([['mc:Choice', 'w:other'], ['mc:Fallback', 'w:numFmt']]);
            expect(api.orderBySequence([el('w:start'), el('w:lvlText'), withFallback], seq).map((c) => c.name))
                .toEqual(['w:start', 'mc:AlternateContent', 'w:lvlText']);
            const choiceOnly = alt([['mc:Choice', 'w:numFmt']]);
            expect(api.orderBySequence([el('w:lvlText'), choiceOnly, el('w:start')], seq).map((c) => c.name))
                .toEqual(['w:start', 'mc:AlternateContent', 'w:lvlText']);
            const empty = xml.el('mc:AlternateContent', {}, []);
            expect(api.orderBySequence([empty, el('w:start')], seq).map((c) => c.name)).toEqual(['w:start', 'mc:AlternateContent']);
        });
    }
});

describe('docx renderers write schema order', () => {
    test('rPr: typed highlight before u; preserved elements between the typed ones', () => {
        const typed = props.renderRunProperties({ bold: true, underline: 'single', highlight: 'yellow', size: 24 });
        expect(names(typed)).toEqual(['w:b', 'w:sz', 'w:highlight', 'w:u']);
        const rPr = props.parseRunProperties(xml.parse(`<w:rPr ${W}><w:rFonts w:ascii="A"/><w:b/><w:bCs/><w:i/><w:iCs/><w:kern w:val="2"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR"/></w:rPr>`));
        expect(names(props.renderRunProperties(rPr))).toEqual(['w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:kern', 'w:sz', 'w:szCs', 'w:lang']);
    });

    test('pPr: keepNext, pBdr, tabs before spacing and ind; rPr then sectPr last', () => {
        const pPr = props.parseParagraphProperties(xml.parse(`<w:pPr ${W}><w:pStyle w:val="H"/><w:keepNext/><w:keepLines/><w:numPr><w:numId w:val="1"/></w:numPr><w:pBdr/><w:tabs/><w:spacing w:before="1"/><w:ind w:left="2"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/><w:rPr><w:b/></w:rPr></w:pPr>`));
        expect(names(props.renderParagraphProperties(pPr))).toEqual(['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:numPr', 'w:pBdr', 'w:tabs', 'w:spacing', 'w:ind', 'w:jc', 'w:outlineLvl', 'w:rPr']);
    });

    test('tblPr: band sizes before tblW, jc and tblInd before tblBorders, tblLook after tblCellMar', () => {
        const tblPr = props.parseTableProperties(xml.parse(`<w:tblPr ${W}><w:tblStyle w:val="T"/><w:tblStyleRowBandSize w:val="1"/><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblInd w:w="5" w:type="dxa"/><w:tblBorders><w:top w:val="single"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="1" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr>`));
        expect(names(props.renderTableProperties(tblPr))).toEqual(['w:tblStyle', 'w:tblStyleRowBandSize', 'w:tblW', 'w:jc', 'w:tblInd', 'w:tblBorders', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook']);
    });

    test('styles: docDefaults, latentStyles, then styles; a style keeps CT_Style order', () => {
        const parsed = styles.parse(`<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:b/></w:rPr></w:rPrDefault></w:docDefaults><w:latentStyles w:count="1"/>`
            + '<w:style w:type="paragraph" w:styleId="H"><w:name w:val="h"/><w:basedOn w:val="N"/><w:next w:val="N"/><w:link w:val="HChar"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>');
        const text = styles.serialize(parsed);
        expect(rootNames(text)).toEqual(['w:docDefaults', 'w:latentStyles', 'w:style']);
        const style = xml.parse(text).children.find((c) => c.name === 'w:style');
        expect(names(style)).toEqual(['w:name', 'w:basedOn', 'w:next', 'w:link', 'w:uiPriority', 'w:qFormat', 'w:pPr', 'w:rPr']);
    });

    test('numbering: numPicBullet first, nsid first in an abstractNum, CT_Lvl order inside a level', () => {
        const parsed = numbering.parse(`<w:numbering ${W}><w:numPicBullet w:numPicBulletId="0"/><w:abstractNum w:abstractNumId="0"><w:nsid w:val="1"/><w:multiLevelType w:val="hybridMultilevel"/><w:tmpl w:val="2"/>`
            + '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:rFonts w:ascii="S"/></w:rPr></w:lvl>'
            + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>');
        const text = numbering.serialize(parsed);
        expect(rootNames(text)).toEqual(['w:numPicBullet', 'w:abstractNum', 'w:num']);
        const abs = xml.parse(text).children.find((c) => c.name === 'w:abstractNum');
        expect(names(abs)).toEqual(['w:nsid', 'w:multiLevelType', 'w:tmpl', 'w:lvl']);
        expect(names(abs.children.find((c) => c.name === 'w:lvl'))).toEqual(['w:start', 'w:numFmt', 'w:lvlText', 'w:lvlJc', 'w:pPr', 'w:rPr']);
        // A level whose numFmt only an _extras could carry still lands after start.
        const lvl = numbering.parse(`<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:suff w:val="space"/><w:lvlText w:val="%1"/></w:lvl></w:abstractNum></w:numbering>`);
        const lvlEl = xml.parse(numbering.serialize(lvl)).children[0].children[0];
        expect(names(lvlEl)).toEqual(['w:start', 'w:suff', 'w:lvlText']);
    });

    test('settings: zoom first, defaultTabStop in its place, extension elements last', () => {
        const parsed = settings.parse(`<w:settings ${W} xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:zoom w:percent="100"/><w:proofState w:spelling="clean"/><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat/><w:rsids/><w:themeFontLang w:val="fr-FR"/><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/><w14:docId w14:val="1"/></w:settings>`);
        expect(rootNames(settings.serialize(parsed))).toEqual(['w:zoom', 'w:proofState', 'w:defaultTabStop', 'w:characterSpacingControl', 'w:compat', 'w:rsids', 'w:themeFontLang', 'w:decimalSymbol', 'w:listSeparator', 'w14:docId']);
    });

    test('sectPr: cols after pgMar, titlePg after it, docGrid last', () => {
        const sect = structure.parseSection(xml.parse(`<w:sectPr ${W}><w:headerReference w:type="default"/><w:pgSz w:w="1" w:h="2"/><w:pgMar w:top="1"/><w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>`));
        expect(names(structure.renderSection(sect))).toEqual(['w:headerReference', 'w:pgSz', 'w:pgMar', 'w:cols', 'w:titlePg', 'w:docGrid']);
    });

    test('a table row writes tblPrEx and trPr before its cells', () => {
        const row = structure.parseRow(xml.parse(`<w:tr ${W}><w:tblPrEx/><w:trPr><w:cantSplit/></w:trPr><w:tc><w:p/></w:tc><w:bookmarkEnd w:id="1"/></w:tr>`));
        expect(names(structure.renderRow(row))).toEqual(['w:tblPrEx', 'w:trPr', 'w:tc', 'w:bookmarkEnd']);
    });
});
