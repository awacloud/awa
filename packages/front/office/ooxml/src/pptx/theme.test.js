// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { pptxTheme } from './theme.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const theme = pptxTheme.factory(_errors, xml, _shared);

describe('pptxTheme', () => {
    test('defaults() produces a parseable Office theme', () => {
        const obj = theme.defaults();
        const back = theme.parse(theme.serialize(obj));
        expect(back.name).toBe('Office Theme');
        expect(back.clrScheme.colors.dk1.sysClr.val).toBe('windowText');
        expect(back.clrScheme.colors.accent1.srgb).toBe('4472C4');
        expect(back.fontScheme.minorFont.latin).toBe('Calibri');
        expect(back.fmtScheme).toBeDefined();
    });

    test('clrScheme srgbClr roundtrip', () => {
        const obj = {
            name: 'Custom',
            clrScheme: {
                name: 'Custom',
                colors: {
                    dk1: { srgb: '111111' },
                    lt1: { srgb: 'FFFFFF' },
                    accent1: { srgb: 'AABBCC' }
                }
            },
            fontScheme: {
                name: 'Custom',
                majorFont: { latin: 'Georgia' },
                minorFont: { latin: 'Verdana' }
            },
            fmtScheme: theme.defaults().fmtScheme
        };
        const back = theme.parse(theme.serialize(obj));
        expect(back.clrScheme.colors.dk1.srgb).toBe('111111');
        expect(back.clrScheme.colors.accent1.srgb).toBe('AABBCC');
        expect(back.fontScheme.majorFont.latin).toBe('Georgia');
    });

    test('preserves objectDefaults + extraClrSchemeLst verbatim', () => {
        const obj = theme.defaults();
        const back = theme.parse(theme.serialize(obj));
        // Should always emit even if not in input.
        expect(theme.serialize(back)).toContain('<a:objectDefaults');
        expect(theme.serialize(back)).toContain('<a:extraClrSchemeLst');
    });
});
