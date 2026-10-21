// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The catalogs mirror each other key for key, every key the
 * sources read exists, locale negotiation picks by primary subtag, and the
 * French catalog follows French typography.
 *
 * @module notepad/core/i18n.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { i18n } from '@awacloud/fw/io/i18n/i18n.js';
import { CATALOGS, LOCALES, createTranslator, negotiateLocale } from './i18n.js';
import { ENCODINGS, EOLS } from './text.js';

/** Dotted key paths of a catalog (plural objects are leaves). */
function keys(obj, prefix = '') {
    return Object.entries(obj).flatMap(([k, v]) => {
        const p = prefix ? `${prefix}.${k}` : k;
        const plural = v && typeof v === 'object' && 'other' in v;
        return v && typeof v === 'object' && !plural ? keys(v, p) : [p];
    });
}

describe('catalogs', () => {
    test('fr mirrors en exactly', () => {
        expect(keys(CATALOGS.fr).sort()).toEqual(keys(CATALOGS.en).sort());
    });
    test('no catalog value is empty', () => {
        for (const locale of LOCALES) {
            for (const key of keys(CATALOGS[locale])) {
                const v = key.split('.').reduce((o, k) => o[k], CATALOGS[locale]);
                const values = typeof v === 'object' ? Object.values(v) : [v];
                for (const s of values) expect(String(s).length).toBeGreaterThan(0);
            }
        }
    });
    test('every literal t() / tn() key in the sources exists in en', () => {
        const src = fileURLToPath(new URL('..', import.meta.url));
        const files = [];
        const walk = (dir) => {
            for (const f of readdirSync(dir)) {
                const p = join(dir, f);
                if (statSync(p).isDirectory()) walk(p);
                else if (p.endsWith('.js') && !p.endsWith('.test.js')) files.push(p);
            }
        };
        walk(src);
        const known = new Set(keys(CATALOGS.en));
        const missing = [];
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(/\btn?\(\s*'([a-z]+\.[A-Za-z.]+)'/g)) {
                if (!known.has(m[1])) missing.push(`${file}: ${m[1]}`);
            }
        }
        expect(missing).toEqual([]);
    });
    test('every encoding, line ending and toolbar action has a label', () => {
        for (const e of ENCODINGS) expect(CATALOGS.en.encoding[e]).toBeString();
        for (const e of EOLS) expect(CATALOGS.en.eol[e]).toBeString();
        for (const a of ['new', 'open', 'save', 'saveAs', 'find', 'replace', 'goto', 'wrap', 'zoomOut', 'zoomIn']) {
            expect(CATALOGS.en.toolbar[a]).toBeString();
        }
    });
});

describe('negotiateLocale', () => {
    test('primary subtag, first supported wins, English fallback', () => {
        expect(negotiateLocale('fr-CA')).toBe('fr');
        expect(negotiateLocale(null, '', ['de-DE', 'fr-FR'])).toBe('fr');
        expect(negotiateLocale('de', 'es')).toBe('en');
        expect(negotiateLocale()).toBe('en');
    });
});

describe('createTranslator', () => {
    const rt = new ModuleRuntime();
    rt.registerDeep(i18n);
    test('translates, interpolates, pluralises, switches locale', () => {
        const tr = createTranslator(rt, 'fr');
        expect(tr.t('status.position', { line: 3, col: 7 })).toBe('Ln 3, Col 7');
        expect(tr.tn('status.chars', 1)).toBe('1 caractère');
        expect(tr.tn('find.replaced', 2)).toBe('2 occurrences remplacées.');
        tr.setLocale('en');
        expect(tr.t('toolbar.save')).toBe('Save (Ctrl+S)');
        expect(tr.locale).toBe('en');
    });
});

describe('French typography', () => {
    /** Every string of a catalog, flattened. */
    const strings = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : strings(v)));
    test('a narrow no-break space before ; ! ? and :, none plain; no straight quotes', () => {
        for (const s of strings(CATALOGS.fr)) {
            expect(s).not.toMatch(/[^\u202f\u00a0](?=[;!?])|[^\u202f\u00a0](?=:(?!\/\/))/);
            expect(s).not.toMatch(/\d \d{3}\b/);
            expect(s).not.toMatch(/[A-Za-z]'[A-Za-z]/);
            expect(s).not.toMatch(/\.\.\./);
        }
    });
});
