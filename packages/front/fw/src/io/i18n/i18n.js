// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Minimal i18n system: translation catalogs, dot-path key lookup,
 * `{param}` interpolation, `Intl.PluralRules`-based pluralization, and
 * locale-aware formatting (numbers, currencies, dates, relative time).
 */

/**
 * An i18n instance returned by `create(...)`.
 * @typedef {object} I18nInstance
 * @property {(key: string, params?: Record<string,any>) => string} t Translate `key`, interpolating `params`.
 * @property {(key: string, count: number, params?: Record<string,any>) => string} tn Plural-aware translation.
 * @property {(key: string) => boolean} has True if `key` exists in the active locale catalog.
 * @property {(loc: string) => void} setLocale Change the active locale.
 * @property {(loc: string, dict: Record<string,any>) => void} addCatalog Register or merge a catalog for `loc`.
 * @property {(value: number|Date, type: ('number'|'currency'|'date'|'relative'), options?: Record<string,any>) => string} format Locale-aware formatter.
 * @property {string} locale Active locale (read-only accessor).
 * @property {string} fallback Fallback locale (read-only accessor).
 */

/**
 * Public shape returned by `i18n.factory()`.
 * @typedef {object} I18nAPI
 * @property {(opts?: { locale?: string, fallback?: string, catalogs?: Record<string, Record<string, any>> }) => I18nInstance} create Create an i18n instance.
 */

export const i18n = {
    name: 'i18n',
    version: '1.0.0',
    type: 'fw.io.i18n',
    dependencies: [],

    /** @returns {I18nAPI} */
    factory() {
        /**
         * Recursively merge `source` into a copy of `target`. Plain objects
         * are merged deeply; arrays and primitives overwrite.
         * @param {Record<string,any>} target
         * @param {Record<string,any>} source
         * @returns {Record<string,any>}
         */
        function _deepMerge(target, source) {
            const result = Object.assign({}, target);
            for (const key of Object.keys(source)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
                    && result[key] && typeof result[key] === 'object') {
                    result[key] = _deepMerge(result[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            }
            return result;
        }

        /**
         * Deep-clone a JSON-compatible value. Used to isolate caller-supplied
         * catalogs so later mutations do not leak into the instance.
         * @template T
         * @param {T} value
         * @returns {T}
         */
        function _deepClone(value) {
            if (value === null || typeof value !== 'object') return value;
            if (Array.isArray(value)) return /** @type {any} */ (value.map(_deepClone));
            const out = {};
            for (const k of Object.keys(value)) out[k] = _deepClone(value[k]);
            return /** @type {any} */ (out);
        }

        /**
         * Resolve a dot-separated `key` against a nested catalog object.
         * @param {Record<string,any>|undefined} catalog
         * @param {string} key
         * @returns {any}
         */
        function _getKey(catalog, key) {
            if (!catalog) return undefined;
            const parts = key.split('.');
            let node = catalog;
            for (const part of parts) {
                if (node == null || typeof node !== 'object') return undefined;
                node = node[part];
            }
            return node;
        }

        /**
         * Replace `{name}` placeholders in `str` with values from `params`.
         * Missing keys are left unchanged.
         * @param {string} str
         * @param {Record<string,any>} [params]
         * @returns {string}
         */
        function _interpolate(str, params) {
            if (!params) return str;
            return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
        }

        /**
         * Create an i18n instance.
         *
         * @param {object} [opts]
         * @param {string} [opts.locale='en'] - Active locale.
         * @param {string} [opts.fallback='en'] - Fallback locale used when a key is missing in the active locale.
         * @param {Record<string, Record<string, any>>} [opts.catalogs] - Map of locale → catalog. Catalogs are deep-cloned on entry so later mutations by the caller do not affect the instance.
         * @returns {object} The i18n instance.
         */
        function create({ locale = 'en', fallback = 'en', catalogs = {} } = {}) {
            let _locale = locale;
            let _fallback = fallback;
            const _catalogs = {};
            // Deep-clone each catalog so callers cannot mutate registered data
            // by holding onto the original reference.
            for (const [loc, dict] of Object.entries(catalogs)) {
                _catalogs[loc] = _deepClone(dict);
            }

            function _resolve(key) {
                return _getKey(_catalogs[_locale], key)
                    ?? _getKey(_catalogs[_fallback], key)
                    ?? undefined;
            }

            /**
             * Translate `key`, interpolating `params`. Returns the raw key
             * when no translation is found.
             * @param {string} key
             * @param {Record<string,any>} [params]
             * @returns {string}
             */
            function t(key, params) {
                const raw = _resolve(key);
                if (raw === undefined) return key;
                if (typeof raw !== 'string') return key;
                return _interpolate(raw, params);
            }

            /**
             * Plural-aware translation. The resolved entry must be an object
             * keyed by CLDR plural forms (`one`, `other`, …); the `count` is
             * injected into the interpolation params. Falls back to `other`
             * when the form-specific entry is missing, and to the raw `key`
             * when neither exists.
             * @param {string} key
             * @param {number} count
             * @param {Record<string,any>} [params]
             * @returns {string}
             */
            function tn(key, count, params) {
                const obj = _resolve(key);
                if (!obj || typeof obj !== 'object') return key;
                const rules = new Intl.PluralRules(_locale);
                const form = rules.select(count);
                const template = obj[form] ?? obj.other ?? key;
                if (typeof template !== 'string') return key;
                return _interpolate(template, { count, ...params });
            }

            /**
             * Return true if `key` exists in the active locale catalog.
             * @param {string} key
             * @returns {boolean}
             */
            function has(key) {
                return _getKey(_catalogs[_locale], key) !== undefined;
            }

            /**
             * Change the active locale.
             * @param {string} loc
             */
            function setLocale(loc) {
                _locale = loc;
            }

            /**
             * Register or merge a catalog for `loc`. The provided `dict` is
             * deep-cloned before being merged so later mutations by the
             * caller cannot leak into the instance.
             * @param {string} loc
             * @param {Record<string,any>} dict
             */
            function addCatalog(loc, dict) {
                const cloned = _deepClone(dict);
                _catalogs[loc] = _catalogs[loc] ? _deepMerge(_catalogs[loc], cloned) : cloned;
            }

            /**
             * Locale-aware formatter for numbers, currencies, dates, and
             * relative time.
             *
             * For `type === 'relative'`, `value` is the numeric delta (e.g. `-3`)
             * and `options.unit` selects the unit (`'day'` by default). The
             * legacy `options.value` override is accepted for backward
             * compatibility but `value` (the first argument) is preferred.
             *
             * @param {number|Date} value
             * @param {'number'|'currency'|'date'|'relative'} type
             * @param {Record<string,any>} [options]
             * @returns {string}
             */
            function format(value, type, options = {}) {
                switch (type) {
                    case 'number':
                        // @ts-ignore - value is number in this branch; type union includes Date for date branch
                        return new Intl.NumberFormat(_locale, options).format(value);
                    case 'currency': {
                        const { currency = 'USD', ...rest } = options;
                        // @ts-ignore - value is number in this branch; type union includes Date for date branch
                        return new Intl.NumberFormat(_locale, { style: 'currency', currency, ...rest }).format(value);
                    }
                    case 'date':
                        return new Intl.DateTimeFormat(_locale, options).format(value);
                    case 'relative': {
                        const { value: relVal = value, unit = 'day', ...rest } = options;
                        return new Intl.RelativeTimeFormat(_locale, { numeric: 'auto', ...rest }).format(relVal, unit);
                    }
                    default:
                        throw new Error(`i18n.format: unknown type "${type}"`);
                }
            }

            return {
                t, tn, has, setLocale, addCatalog, format,
                get locale() { return _locale; },
                get fallback() { return _fallback; },
            };
        }

        return { create };
    },
};
