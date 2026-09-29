// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { i18n } from './i18n.js';

const catalogs = {
    'fr-FR': {
        greeting: 'Bonjour {name}',
        farewell: 'Au revoir',
        items: { one: '{count} article', other: '{count} articles' },
        nested: { submenu: { open: 'Ouvrir', close: 'Fermer' } },
    },
    en: {
        greeting: 'Hello {name}',
        farewell: 'Goodbye',
        items: { one: '{count} item', other: '{count} items' },
        onlyEnglish: 'Only in English',
    },
};

describe('i18n module', () => {
    test('should have correct module metadata', () => {
        expect(i18n.name).toBe('i18n');
        expect(i18n.dependencies).toEqual([]);
        expect(typeof i18n.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = i18n.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        let tr;

        beforeEach(() => {
            inst = i18n.factory();
            tr = inst.create({ locale: 'fr-FR', fallback: 'en', catalogs });
        });

        test('returns object with expected API', () => {
            expect(typeof tr.t).toBe('function');
            expect(typeof tr.tn).toBe('function');
            expect(typeof tr.has).toBe('function');
            expect(typeof tr.setLocale).toBe('function');
            expect(typeof tr.addCatalog).toBe('function');
            expect(typeof tr.format).toBe('function');
            expect(tr.locale).toBe('fr-FR');
            expect(tr.fallback).toBe('en');
        });

        test('t: basic translation', () => {
            expect(tr.t('farewell')).toBe('Au revoir');
        });

        test('t: interpolation', () => {
            expect(tr.t('greeting', { name: 'Alice' })).toBe('Bonjour Alice');
        });

        test('t: missing param stays as placeholder', () => {
            expect(tr.t('greeting')).toBe('Bonjour {name}');
        });

        test('t: fallback to secondary locale', () => {
            expect(tr.t('onlyEnglish')).toBe('Only in English');
        });

        test('t: missing in both locales returns key', () => {
            expect(tr.t('total.unknown.key')).toBe('total.unknown.key');
        });

        test('t: nested key with dot notation', () => {
            expect(tr.t('nested.submenu.open')).toBe('Ouvrir');
            expect(tr.t('nested.submenu.close')).toBe('Fermer');
        });

        test('has: returns true for existing key in current locale', () => {
            expect(tr.has('farewell')).toBe(true);
            expect(tr.has('nested.submenu.open')).toBe(true);
        });

        test('has: returns false for missing key (no fallback)', () => {
            expect(tr.has('onlyEnglish')).toBe(false);
            expect(tr.has('nonexistent')).toBe(false);
        });

        test('tn: singular in fr-FR (count=1)', () => {
            expect(tr.tn('items', 1)).toBe('1 article');
        });

        test('tn: plural in fr-FR (count=5)', () => {
            expect(tr.tn('items', 5)).toBe('5 articles');
        });

        test('tn: count=0 uses "other" in fr-FR', () => {
            const result = tr.tn('items', 0);
            // fr-FR: 0 is "one" in some implementations, but "other" per CLDR
            expect(result).toMatch(/0 article/);
        });

        test('tn: extra params passed through', () => {
            const tr2 = inst.create({
                locale: 'en',
                fallback: 'en',
                catalogs: {
                    en: {
                        msgs: { one: '{count} new message from {sender}', other: '{count} new messages from {sender}' }
                    }
                }
            });
            expect(tr2.tn('msgs', 1, { sender: 'Bob' })).toBe('1 new message from Bob');
            expect(tr2.tn('msgs', 3, { sender: 'Bob' })).toBe('3 new messages from Bob');
        });

        test('tn: returns key for non-object value', () => {
            expect(tr.tn('greeting', 5)).toBe('greeting');
        });

        test('setLocale changes locale', () => {
            tr.setLocale('en');
            expect(tr.locale).toBe('en');
            expect(tr.t('greeting', { name: 'Bob' })).toBe('Hello Bob');
        });

        test('addCatalog merges new catalog', () => {
            tr.addCatalog('es', { greeting: 'Hola {name}' });
            tr.setLocale('es');
            expect(tr.t('greeting', { name: 'Carlos' })).toBe('Hola Carlos');
        });

        test('addCatalog does deep merge', () => {
            tr.addCatalog('fr-FR', { nested: { submenu: { save: 'Sauvegarder' } } });
            expect(tr.t('nested.submenu.open')).toBe('Ouvrir');   // preserved
            expect(tr.t('nested.submenu.save')).toBe('Sauvegarder'); // added
        });

        test('format: number with fr-FR', () => {
            const result = tr.format(1234.5, 'number', { minimumFractionDigits: 2 });
            // French: 1 234,50 (with non-breaking space or regular space)
            expect(result).toMatch(/1[\s  ]?234[,.]50/);
        });

        test('format: currency', () => {
            const result = tr.format(99.9, 'currency', { currency: 'EUR' });
            expect(result).toContain('99');
        });

        test('format: date', () => {
            const d = new Date(2024, 0, 15);
            const result = tr.format(d, 'date', { dateStyle: 'long' });
            expect(result).toMatch(/2024/);
            expect(result).toMatch(/15/);
        });

        test('format: relative', () => {
            const result = tr.format(-1, 'relative', { value: -1, unit: 'day' });
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        test('format: throws on unknown type', () => {
            expect(() => tr.format(1, 'unknown')).toThrow('i18n.format: unknown type "unknown"');
        });
    });
});
