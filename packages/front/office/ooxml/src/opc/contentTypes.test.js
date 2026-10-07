// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcContentTypes } from './contentTypes.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
const _errors = _ooxmlErrors.factory();

describe('opcContentTypes', () => {
    const ct = opcContentTypes.factory(_errors, ooxmlXml.factory());

    test('parse defaults and overrides', () => {
        const xml = '<?xml version="1.0"?>'
            + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            + '</Types>';
        const parsed = ct.parse(xml);
        expect(parsed.defaults.rels).toContain('relationships');
        expect(parsed.overrides['/word/document.xml']).toContain('wordprocessingml');
    });

    test('serialize roundtrips', () => {
        const types = {
            defaults: { xml: 'application/xml' },
            overrides: { '/word/document.xml': 'app/x' }
        };
        const out = ct.serialize(types);
        const back = ct.parse(out);
        expect(back).toEqual(types);
    });

    test('lookup prefers overrides over defaults', () => {
        const types = {
            defaults: { xml: 'application/xml' },
            overrides: { '/word/document.xml': 'override/x' }
        };
        expect(ct.lookup(types, '/word/document.xml')).toBe('override/x');
        expect(ct.lookup(types, '/word/styles.xml')).toBe('application/xml');
        expect(ct.lookup(types, '/missing')).toBeNull();
    });
});
