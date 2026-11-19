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
// This table PINS the output of the UA-string path (no UA-CH) for a
// representative corpus. Since BL-1071 that path is MDN's: "Mobi" anywhere in
// the UA means mobile, and a minimal chain names the platform. Two rows
// changed when the pattern lists went (BL-1070 pinned them as measured): the
// iPad Safari UA carries "Mobile/" and is now mobile; the SAMSUNG feature-phone
// UA, matched only by the old 4-character prefix list, no longer is.

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
            // changed by BL-1071: "Mobile/15E148" carries "Mobi"
            label: 'iPad Safari',
            uaString: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            mobile: true,
            platform: 'ios',
        },
        {
            label: 'Android Chrome phone',
            uaString: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
            mobile: true,
            platform: 'android',
        },
        {
            // a tablet: no "Mobi" token (MDN: tablets are not mobile)
            label: 'Android tablet without "Mobile" token',
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
            // changed by BL-1071: only the removed 4-character prefix list matched it
            label: 'feature phone without "Mobi" (SAMSUNG-GT-...)',
            uaString: 'SAMSUNG-GT-S5230/S5230XXIF3 SHP/VPP/R5 Jasmine/1.0 Nextreaming SMM',
            mobile: false,
            platform: 'unknown',
        },
        {
            label: 'Chrome OS',
            uaString: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
            mobile: false,
            platform: 'linux',
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

describe('ua — UA-CH and feature detection first (BL-1071)', () => {
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    const set = (prop, value) => Object.defineProperty(navigator, prop, { value, configurable: true });

    afterEach(() => {
        set('userAgent', 'Mozilla/5.0');
        set('userAgentData', undefined);
        set('maxTouchPoints', 0);
    });

    test('userAgentData wins over the UA string', () => {
        set('userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Mobile Safari/537.36');
        set('userAgentData', { mobile: false, platform: 'Android', brands: [] });
        const api = ua.factory();
        expect(api.mobile()).toBe(false);
        expect(api.platform()).toBe('android');
    });

    test.each([
        ['Windows', 'windows'], ['macOS', 'mac'], ['Linux', 'linux'], ['Android', 'android'],
        ['iOS', 'ios'], ['Chrome OS', 'linux'], ['Fuchsia', 'unknown'], ['', 'unknown'],
    ])('userAgentData.platform %p -> %p', (hint, platform) => {
        set('userAgentData', { mobile: true, platform: hint, brands: [] });
        const api = ua.factory();
        expect(api.platform()).toBe(platform);
        expect(api.mobile()).toBe(true);
    });

    test('a Macintosh UA with more than one touch point is iPadOS in desktop mode', () => {
        set('userAgent', MAC);
        set('maxTouchPoints', 5);
        expect(ua.factory().platform()).toBe('ios');
        set('maxTouchPoints', 0);
        expect(ua.factory().platform()).toBe('mac');
    });

    test('string() stays the raw UA even with UA-CH', () => {
        set('userAgent', MAC);
        set('userAgentData', { mobile: false, platform: 'macOS', brands: [] });
        expect(ua.factory().string()).toBe(MAC);
    });

    test('the pattern lists are gone', async () => {
        const src = await Bun.file(new URL('./ua.js', import.meta.url)).text();
        expect(src).not.toContain('blackberry|blazer');
        expect(src).not.toContain('_mobilePrefixRe');
    });
});
