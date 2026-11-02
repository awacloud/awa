// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's translator: fw `i18n` over the shell
 * catalogs (page title, language menu, more files, PWA, help, about). The
 * component translates its own strings (`@awacloud/oview`); locale
 * negotiation is the component's, re-exported so the page and the viewer
 * pick the same locale.
 *
 * @module viewer/core/i18n
 */
import { en } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';

export { negotiateLocale, LOCALES } from '@awacloud/oview';

/** Shell catalogs by primary language subtag; `en` is the fallback and the reference. */
export const CATALOGS = Object.freeze({ en, fr });

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
