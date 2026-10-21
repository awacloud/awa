// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The catalogs mirror each other key for key, every key the
 * sources read exists, and locale negotiation picks by primary subtag.
 *
 * @module viewer/core/i18n.test
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { i18n } from '@awacloud/fw/io/i18n/i18n.js';
import { CATALOGS, LOCALES, createTranslator, negotiateLocale } from './i18n.js';

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
        expect(tr.t('toolbar.of', { count: 3 })).toBe('sur 3');
        expect(tr.tn('count.pages', 1)).toBe('1 page');
        expect(tr.tn('count.slides', 2)).toBe('2 diapositives');
        tr.setLocale('en');
        expect(tr.t('toolbar.open')).toBe('Open a document');
        expect(tr.locale).toBe('en');
    });
});

describe('French typography', () => {
    /** Every string of a catalog, flattened. */
    const strings = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : strings(v)));
    test('a narrow no-break space before ; ! ? and :, none plain; no straight quotes', () => {
        for (const s of strings(CATALOGS.fr)) {
            expect(s).not.toMatch(/[^\u202f\u00a0](?=[;!?])|[^\u202f\u00a0](?=:(?!\/\/))/);
            expect(s).not.toMatch(/\d \d{3}\b/);       // thousands: a narrow no-break space
            expect(s).not.toMatch(/[A-Za-z]'[A-Za-z]/); // typographic apostrophe
            expect(s).not.toMatch(/\.\.\./);
        }
    });
});
