// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The viewer's translator: fw `i18n` over the two catalogs,
 * plus the locale negotiation fw leaves to its callers (no detection there).
 *
 * @module viewer/core/i18n
 */
import { en } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';

/** Catalogs by primary language subtag; `en` is the fallback and the reference. */
export const CATALOGS = Object.freeze({ en, fr });

/** The locales the UI can be shown in, in menu order. */
export const LOCALES = Object.freeze(Object.keys(CATALOGS));

/**
 * The first supported locale among the candidates, by primary subtag
 * (`fr-CA` → `fr`); `en` when none matches.
 *
 * @param {...(string|readonly string[]|null|undefined)} candidates
 * @returns {string}
 */
export function negotiateLocale(...candidates) {
    for (const c of candidates.flat()) {
        const primary = String(c || '').trim().toLowerCase().split(/[-_]/)[0];
        if (primary && Object.hasOwn(CATALOGS, primary)) return primary;
    }
    return 'en';
}

/**
 * Build a translator on an fw runtime.
 *
 * @param {{resolve: (name: string) => any}} runtime A runtime with fw `i18n` registered.
 * @param {string} locale A supported locale (see `negotiateLocale`).
 * @returns {{t: (key: string, params?: object) => string,
 *   tn: (key: string, count: number, params?: object) => string,
 *   number: (value: number, opts?: Intl.NumberFormatOptions) => string,
 *   setLocale: (locale: string) => void, readonly locale: string}}
 */
export function createTranslator(runtime, locale) {
    const tr = runtime.resolve('i18n').create({ locale, fallback: 'en', catalogs: CATALOGS });
    return {
        t: (key, params) => tr.t(key, params),
        tn: (key, count, params) => tr.tn(key, count, params),
        number: (value, opts) => tr.format(value, 'number', opts),
        setLocale: (next) => tr.setLocale(next),
        get locale() { return tr.locale; }
    };
}
