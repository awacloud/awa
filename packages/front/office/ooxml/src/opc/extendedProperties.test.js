// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// `opcExtendedProperties.read(pkg)`: the extended-properties part
// (`docProps/app.xml`) a read package's root relationship names, typed.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const app = runtime.resolve('opcExtendedProperties');
const { ParseError } = runtime.resolve('ooxmlErrors');

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties';
const STRICT = 'http://purl.oclc.org/ooxml/officeDocument/relationships/extendedProperties';
const APP = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"'
    + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + '<Template>Normal.dotm</Template><TotalTime>12</TotalTime><Pages>3</Pages><Words>812</Words>'
    + '<Characters>4630</Characters><Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity>'
    + '<Lines>38</Lines><Paragraphs>10</Paragraphs><ScaleCrop>false</ScaleCrop>'
    + '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Title</vt:lpstr></vt:variant>'
    + '<vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>'
    + '<Company>Acme &amp; Co</Company><Manager>Bo</Manager><LinksUpToDate>0</LinksUpToDate>'
    + '<CharactersWithSpaces>5432</CharactersWithSpaces><SharedDoc>1</SharedDoc><HyperlinkBase>https://x.test/</HyperlinkBase>'
    + '<HyperlinksChanged>true</HyperlinksChanged><AppVersion>16.0000</AppVersion><Slides>7</Slides><Notes>2</Notes>'
    + '<HiddenSlides>1</HiddenSlides><MMClips>0</MMClips><PresentationFormat>On-screen Show (4:3)</PresentationFormat>'
    + '</Properties>';
const pkgWith = (xml, type = REL, target = 'docProps/app.xml') => ({
    contentTypes: {},
    parts: { ['/' + target.replace(/^\//, '')]: new TextEncoder().encode(xml) },
    rels: { '/': [{ Id: 'rId3', Type: type, Target: target }] }
});

describe('opcExtendedProperties.read', () => {
    test('the counts as integers, the flags as booleans, the strings as text; the vectors untyped', () => {
        expect(app.read(pkgWith(APP))).toEqual({
            template: 'Normal.dotm', totalTime: 12, pages: 3, words: 812, characters: 4630,
            application: 'Microsoft Office Word', docSecurity: 0, lines: 38, paragraphs: 10, scaleCrop: false,
            company: 'Acme & Co', manager: 'Bo', linksUpToDate: false, charactersWithSpaces: 5432, sharedDoc: true,
            hyperlinkBase: 'https://x.test/', hyperlinksChanged: true, appVersion: '16.0000', slides: 7, notes: 2,
            hiddenSlides: 1, mmClips: 0, presentationFormat: 'On-screen Show (4:3)'
        });
    });

    test('a count or a flag that is not one is left out; the strict relationship type is followed', () => {
        const xml = APP.replace('<Pages>3</Pages>', '<Pages>3.5</Pages>').replace('<Words>812</Words>', '<Words>-1</Words>')
            .replace('<ScaleCrop>false</ScaleCrop>', '<ScaleCrop>maybe</ScaleCrop>');
        const r = app.read(pkgWith(xml, STRICT));
        expect(['pages' in r, 'words' in r, 'scaleCrop' in r]).toEqual([false, false, false]);
        expect(r.characters).toBe(4630);
    });

    test('no relationship, or no part: null', () => {
        expect(app.read({ contentTypes: {}, parts: {}, rels: { '/': [] } })).toBe(null);
        expect(app.read({ contentTypes: {}, parts: {}, rels: { '/': [{ Id: 'r', Type: REL, Target: 'docProps/app.xml' }] } })).toBe(null);
    });

    test('a part that is not extended properties throws opc/extended-properties-invalid', () => {
        for (const xml of ['<not-xml', '<?xml version="1.0"?><cp:coreProperties xmlns:cp="x"/>']) {
            let err;
            try { app.read(pkgWith(xml)); } catch (e) { err = e; }
            expect(err instanceof ParseError).toBe(true);
            expect(err.code).toBe('opc/extended-properties-invalid');
        }
    });
});
