// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pkgMimetype } from './mimetype.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

const _errors = odfErrors.factory();
const _shared = odfShared.factory(_errors, fwXml.factory());
const { ParseError, ContractError } = _errors;
const mt = pkgMimetype.factory(_errors, _shared);

describe('pkgMimetype module', () => {
    test('has the expected factory shape', () => {
        expect(pkgMimetype.name).toBe('pkgMimetype');
        expect(pkgMimetype.dependencies).toEqual(['odfErrors', 'odfShared']);
        expect(typeof pkgMimetype.factory).toBe('function');
    });

    test('exposes ODT/ODS/ODP constants', () => {
        expect(mt.CT_ODT).toBe('application/vnd.oasis.opendocument.text');
        expect(mt.CT_ODS).toBe('application/vnd.oasis.opendocument.spreadsheet');
        expect(mt.CT_ODP).toBe('application/vnd.oasis.opendocument.presentation');
    });

    describe('parse', () => {
        test('decodes bytes to trimmed string', () => {
            const bytes = new TextEncoder().encode('application/vnd.oasis.opendocument.text');
            expect(mt.parse(bytes)).toBe(mt.CT_ODT);
        });

        test('throws on empty bytes', () => {
            expect(() => mt.parse(new Uint8Array(0))).toThrow(ParseError);
        });

        test('throws ContractError on non-Uint8Array input', () => {
            expect(() => mt.parse('foo')).toThrow(ContractError);
        });
    });

    describe('render', () => {
        test('encodes string to UTF-8 bytes', () => {
            const bytes = mt.render(mt.CT_ODT);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(mt.parse(bytes)).toBe(mt.CT_ODT);
        });

        test('throws ContractError on empty string', () => {
            expect(() => mt.render('')).toThrow(ContractError);
        });
    });

    test('isKnown identifies the three core types', () => {
        expect(mt.isKnown(mt.CT_ODT)).toBe(true);
        expect(mt.isKnown(mt.CT_ODS)).toBe(true);
        expect(mt.isKnown(mt.CT_ODP)).toBe(true);
        expect(mt.isKnown('foo/bar')).toBe(false);
    });

    test('roundtrip', () => {
        for (const ct of [mt.CT_ODT, mt.CT_ODS, mt.CT_ODP]) {
            expect(mt.parse(mt.render(ct))).toBe(ct);
        }
    });
});
