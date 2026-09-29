// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ua } from './ua.js';

describe('ua module', () => {

    test('has correct module metadata', () => {
        expect(ua.name).toBe('ua');
        expect(ua.dependencies).toEqual([]);
        expect(typeof ua.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = ua.factory();
        });

        test('returns an object with all expected methods', () => {
            expect(typeof api.string).toBe('function');
            expect(typeof api.mobile).toBe('function');
            expect(typeof api.touch).toBe('function');
            expect(typeof api.platform).toBe('function');
        });

        // ── string ────────────────────────────────────────────────────────────────

        describe('string', () => {
            test('returns a string', () => {
                expect(typeof api.string()).toBe('string');
            });

            test('matches navigator.userAgent', () => {
                expect(api.string()).toBe(navigator.userAgent);
            });
        });

        // ── mobile ────────────────────────────────────────────────────────────────

        describe('mobile', () => {
            test('returns a boolean', () => {
                expect(typeof api.mobile()).toBe('boolean');
            });

            test('returns false for the desktop UA provided by happy-dom', () => {
                // happy-dom uses a Chrome-like desktop UA - should not match mobile
                expect(api.mobile()).toBe(false);
            });

            test('returns true for a known mobile UA string', () => {
                // Patch navigator.userAgent temporarily to a mobile UA
                const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
                Object.defineProperty(navigator, 'userAgent', { value: mobileUA, configurable: true });
                const mobileApi = ua.factory();
                expect(mobileApi.mobile()).toBe(true);
                // Restore
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });

            test('returns true for an Android UA', () => {
                const androidUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
                Object.defineProperty(navigator, 'userAgent', { value: androidUA, configurable: true });
                const androidApi = ua.factory();
                expect(androidApi.mobile()).toBe(true);
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });
        });

        // ── touch ─────────────────────────────────────────────────────────────────

        describe('touch', () => {
            test('returns a boolean', () => {
                expect(typeof api.touch()).toBe('boolean');
            });

            test('returns true when maxTouchPoints > 0', () => {
                Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
                expect(api.touch()).toBe(true);
                Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
            });

            test('returns false when maxTouchPoints is 0 and ontouchstart absent', () => {
                Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
                if ('ontouchstart' in window) delete window.ontouchstart;
                expect(api.touch()).toBe(false);
            });
        });

        // ── platform ──────────────────────────────────────────────────────────────

        describe('platform', () => {
            const valid = ['ios', 'android', 'windows', 'mac', 'linux', 'unknown'];

            test('returns one of the expected values', () => {
                expect(valid).toContain(api.platform());
            });

            test('detects iOS UA', () => {
                Object.defineProperty(navigator, 'userAgent', {
                    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
                    configurable: true,
                });
                expect(ua.factory().platform()).toBe('ios');
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });

            test('detects Android UA', () => {
                Object.defineProperty(navigator, 'userAgent', {
                    value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
                    configurable: true,
                });
                expect(ua.factory().platform()).toBe('android');
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });

            test('detects Windows UA', () => {
                Object.defineProperty(navigator, 'userAgent', {
                    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    configurable: true,
                });
                expect(ua.factory().platform()).toBe('windows');
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });

            test('detects macOS UA', () => {
                Object.defineProperty(navigator, 'userAgent', {
                    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
                    configurable: true,
                });
                expect(ua.factory().platform()).toBe('mac');
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });

            test('returns unknown for unrecognised UA', () => {
                Object.defineProperty(navigator, 'userAgent', {
                    value: 'SomeObscureBot/1.0',
                    configurable: true,
                });
                expect(ua.factory().platform()).toBe('unknown');
                Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
            });
        });
    });
});

// ── pinned detection table ───────────────────────────────────────────────────
//
// BL-1070: this table PINS the CURRENT, measured output of `_mobileRe` /
// `_mobilePrefixRe` / the platform chain for a representative UA corpus. It
// does not assert desired behaviour — rows marked "measured" below record
// whatever the module actually returns today (e.g. an iPad UA without the
// literal "iphone"/"ipod" substrings is NOT matched by `_mobileRe`, so
// `mobile()` is `false` there even though an iPad is a mobile device; an
// Android tablet UA lacking the "Mobile" token is likewise not matched).
// The table exists to make any future change to the two pattern lists
// (BL-1071, next program) visible as a diff against this pin.

describe('ua — pinned detection table', () => {
    const ORIGINAL_UA = 'Mozilla/5.0';

    afterEach(() => {
        Object.defineProperty(navigator, 'userAgent', { value: ORIGINAL_UA, configurable: true });
    });

    /** @type {Array<{ label: string, uaString: string, mobile: boolean, platform: string }>} */
    const TABLE = [
        {
            label: 'iPhone Safari',
            uaString: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            mobile: true,
            platform: 'ios',
        },
        {
            // Measured: no literal "iphone"/"ipod" substring, so _mobileRe does
            // not match — pins current behaviour, not desired behaviour.
            label: 'iPad Safari (measured)',
            uaString: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            mobile: false,
            platform: 'ios',
        },
        {
            label: 'Android Chrome phone',
            uaString: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
            mobile: true,
            platform: 'android',
        },
        {
            // Measured: no "Mobile" token paired with android/bb/meego, so
            // _mobileRe does not match — pins current behaviour.
            label: 'Android tablet without "Mobile" token (measured)',
            uaString: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
            mobile: false,
            platform: 'android',
        },
        {
            label: 'Windows 10 desktop Chrome',
            uaString: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
            mobile: false,
            platform: 'windows',
        },
        {
            label: 'macOS Safari',
            uaString: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            mobile: false,
            platform: 'mac',
        },
        {
            label: 'Linux Firefox',
            uaString: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
            mobile: false,
            platform: 'linux',
        },
        {
            label: 'Windows Phone (IE Mobile)',
            uaString: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.1; Trident/6.0; IEMobile/10.0; ARM; Touch; NOKIA; Lumia 630)',
            mobile: true,
            platform: 'windows',
        },
        {
            label: 'BlackBerry',
            uaString: 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.1.0.346 Mobile Safari/534.11+',
            mobile: true,
            platform: 'unknown',
        },
        {
            // 4-character-prefix-only hit: matched via `_mobilePrefixRe` on
            // `_ua.substring(0, 4)` ("SAMS"), not via `_mobileRe`.
            label: '4-char-prefix-only hit (SAMSUNG-GT-...)',
            uaString: 'SAMSUNG-GT-S5230/S5230XXIF3 SHP/VPP/R5 Jasmine/1.0 Nextreaming SMM',
            mobile: true,
            platform: 'unknown',
        },
        {
            label: 'Kindle',
            uaString: 'Mozilla/5.0 (Linux; U; en-us; KindleFire Build/GINGERBREAD) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
            mobile: true,
            platform: 'linux',
        },
        {
            label: 'Unrecognised bot UA',
            uaString: 'SomeObscureBot/1.0',
            mobile: false,
            platform: 'unknown',
        },
    ];

    test.each(TABLE)('$label -> mobile=$mobile platform=$platform', ({ uaString, mobile, platform }) => {
        Object.defineProperty(navigator, 'userAgent', { value: uaString, configurable: true });
        const api = ua.factory();
        expect(api.mobile()).toBe(mobile);
        expect(api.platform()).toBe(platform);
    });
});
