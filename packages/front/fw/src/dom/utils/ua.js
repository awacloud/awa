// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview User-Agent and environment detection factory.
 *
 * Follows MDN's "Browser detection using the user agent": feature detection
 * and User-Agent Client Hints first, a minimal reading of the UA string only
 * where they say nothing. `navigator.userAgentData` (UA-CH, Chromium-based
 * browsers) gives `mobile` and `platform` directly; elsewhere `mobile()` looks
 * for "Mobi" anywhere in the UA and `platform()` reads a few tokens. Values are
 * computed once at factory initialisation; `touch()` is read at call time.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `string()` | Raw `navigator.userAgent` string |
 * | `mobile()` | `true` on a phone-class device (UA-CH `mobile`, else "Mobi" in the UA) |
 * | `touch()` | `true` when the device reports touch capability |
 * | `platform()` | `'ios'` \| `'android'` \| `'windows'` \| `'mac'` \| `'linux'` \| `'unknown'` |
 *
 */

/**
 * Public surface returned by `ua.factory()`.
 * @typedef {object} UaAPI
 * @property {() => string} string Raw `navigator.userAgent` string (empty outside the browser).
 * @property {() => boolean} mobile `true` on a phone-class device: UA-CH `mobile` when available, else "Mobi" in the UA.
 * @property {() => boolean} touch `true` when the device reports touch capability.
 * @property {() => ('ios'|'android'|'windows'|'mac'|'linux'|'unknown')} platform
 *   Normalised platform: UA-CH `platform` when available, else a minimal UA reading.
 */

export const ua = {
    name: 'ua',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: [],

    /** @returns {UaAPI} */
    factory() {

        const _nav = typeof navigator !== 'undefined' ? navigator : null;
        const _ua = _nav ? (_nav.userAgent || _nav.vendor || '') : '';

        // UA-CH low-entropy hints: synchronous, no permission, Chromium-based browsers only.
        // @ts-ignore - userAgentData is not in every lib.dom version
        const _hints = _nav && _nav.userAgentData && typeof _nav.userAgentData === 'object' ? _nav.userAgentData : null;

        // MDN: "we recommend looking for the string 'Mobi' anywhere in the User Agent".
        const _isMobile = _hints && typeof _hints.mobile === 'boolean' ? _hints.mobile : /Mobi/i.test(_ua);

        const HINT_PLATFORMS = { 'windows': 'windows', 'macos': 'mac', 'linux': 'linux', 'android': 'android', 'ios': 'ios', 'chrome os': 'linux' };

        /** @returns {'ios'|'android'|'windows'|'mac'|'linux'|'unknown'} */
        function _fromUa() {
            const u = _ua.toLowerCase();
            if (/iphone|ipad|ipod/.test(u)) return 'ios';
            if (/android/.test(u)) return 'android';
            if (/windows/.test(u)) return 'windows';
            if (/macintosh|mac os x/.test(u)) {
                // iPadOS asks for desktop sites with a Mac UA; a Mac has no multi-touch screen
                return _nav && _nav.maxTouchPoints > 1 ? 'ios' : 'mac';
            }
            if (/linux|cros/.test(u)) return 'linux';
            return 'unknown';
        }

        /** @type {'ios'|'android'|'windows'|'mac'|'linux'|'unknown'} */
        const _platform = _hints && typeof _hints.platform === 'string' && _hints.platform
            ? (HINT_PLATFORMS[_hints.platform.toLowerCase()] || 'unknown')
            : _fromUa();

        return {

            /**
             * Return the raw user-agent string (`navigator.userAgent`).
             * Returns an empty string in non-browser environments.
             *
             * @returns {string}
             */
            string() {
                return _ua;
            },

            /**
             * Return `true` on a phone-class device: UA-CH `mobile` when the
             * browser offers it, else "Mobi" anywhere in the UA (computed once
             * at factory initialisation). Tablets are not mobile.
             *
             * @returns {boolean}
             */
            mobile() {
                return _isMobile;
            },

            /**
             * Return `true` when the device reports touch capability via
             * `'ontouchstart' in window` or `navigator.maxTouchPoints > 0`.
             * Evaluated at call time (the value can change on hybrid devices).
             *
             * @returns {boolean}
             */
            touch() {
                return (typeof window !== 'undefined' && 'ontouchstart' in window)
                    || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
            },

            /**
             * Return a normalised platform identifier: UA-CH `platform` when
             * the browser offers it, else a minimal reading of the UA string
             * (computed once at factory initialisation).
             *
             * @returns {'ios'|'android'|'windows'|'mac'|'linux'|'unknown'}
             */
            platform() {
                return _platform;
            }
        };
    }
};
