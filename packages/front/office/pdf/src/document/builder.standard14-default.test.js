// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfBuilder.addFont` writes the Standard 14 metrics PDF
 * 2.0 requires of every simple font (ISO 32000-2 Table 109) by default
 * (T30 (g2), D53): `FirstChar`, `LastChar`, `Widths` and a
 * `FontDescriptor`; `standard14: false` writes the legacy dictionary.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules) rt.register(m);
const { builder } = rt.resolve('pdfBuilder');

const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const written = (spec) => latin1(builder().addPage().addFont({ name: 'F1', ...spec }).addContent('BT /F1 12 Tf 72 700 Td (x) Tj ET').build());

describe('pdfBuilder — the Standard 14 metrics by default (T30 g2)', () => {
    test('a Standard 14 face with no option carries its metrics', () => {
        const out = written({ baseFont: 'Helvetica', encoding: 'WinAnsiEncoding' });
        expect(out).toContain('/FirstChar 32 /LastChar 255 /Widths [');
        expect(out).toContain('/Type /FontDescriptor /FontName /Helvetica');
        const times = written({ baseFont: 'Times-Roman' });
        expect(times).toContain('/Widths [');
        expect(times).toContain('/FontName /Times-Roman');
    });

    test('standard14: false writes the legacy dictionary; another base font is unchanged', () => {
        expect(written({ baseFont: 'Courier', standard14: false })).toContain('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
        const arial = written({ baseFont: 'Arial' });
        expect(arial).toContain('<< /Type /Font /Subtype /Type1 /BaseFont /Arial >>');
        expect(arial).not.toContain('/FontDescriptor');
    });

    test('a symbolic face with an /Encoding keeps its legacy dictionary; without one it carries its metrics', () => {
        expect(written({ baseFont: 'Symbol', encoding: 'WinAnsiEncoding' })).not.toContain('/FontDescriptor');
        expect(written({ baseFont: 'Symbol' })).toContain('/FontName /Symbol');
    });
});
