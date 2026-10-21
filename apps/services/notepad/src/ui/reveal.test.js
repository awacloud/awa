// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Scrolling the text to a range: the scroll rule (keep a
 * visible range, centre one that is not) and the mirror's lifetime. Where
 * a range is DRAWN needs a layout engine: Happy-DOM has none, so the
 * measure itself is checked in a browser (the track's S1 evidence).
 *
 * @module notepad/ui/reveal.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { scrollToShow, measureRange, revealRange } from './reveal.js';

const view = { scrollTop: 0, scrollLeft: 0, clientHeight: 600, clientWidth: 800 };

describe('scrollToShow', () => {
    test('a range already in view keeps the scroll', () => {
        expect(scrollToShow({ top: 100, bottom: 122, left: 10, right: 60 }, view)).toEqual({ scrollTop: 0, scrollLeft: 0 });
        expect(scrollToShow({ top: 1000, bottom: 1022, left: 10, right: 60 }, { ...view, scrollTop: 900 }))
            .toEqual({ scrollTop: 900, scrollLeft: 0 });
    });
    test('a range below or above the view is centred', () => {
        // line 401 of a 22.5 px line height, 12 px of padding: the find case measured in Chrome
        expect(scrollToShow({ top: 9012, bottom: 9034.5, left: 16, right: 70 }, view).scrollTop).toBe(8723);
        expect(scrollToShow({ top: 40, bottom: 62, left: 16, right: 70 }, { ...view, scrollTop: 5000 }).scrollTop).toBe(0);
    });
    test('a range partly cut at the bottom edge moves too', () => {
        expect(scrollToShow({ top: 590, bottom: 612, left: 0, right: 10 }, view).scrollTop).toBeGreaterThan(0);
    });
    test('without wrapping, a range past the right edge brings its column in', () => {
        const next = scrollToShow({ top: 12, bottom: 34, left: 4700, right: 4724 }, view);
        expect(next.scrollTop).toBe(0);
        expect(next.scrollLeft).toBeGreaterThan(4724 - 800);
        expect(next.scrollLeft).toBeLessThan(4700);
    });
    test('never a negative scroll', () => {
        expect(scrollToShow({ top: 0, bottom: 22, left: 0, right: 5 }, { ...view, scrollTop: 300, scrollLeft: 200 }))
            .toEqual({ scrollTop: 0, scrollLeft: 0 });
    });
});

describe('measureRange / revealRange', () => {
    test('the mirror is removed after measuring, and the text is untouched', () => {
        const host = document.createElement('div');
        const text = document.createElement('textarea');
        host.append(text);
        document.body.append(host);
        text.value = 'one\ntwo\nthree';
        const before = host.childNodes.length;
        const box = measureRange(text, 4, 7);
        expect(Object.keys(box).sort()).toEqual(['bottom', 'left', 'right', 'top']);
        expect(host.childNodes.length).toBe(before);
        revealRange(text, 8);
        expect(host.childNodes.length).toBe(before);
        expect(text.value).toBe('one\ntwo\nthree');
        host.remove();
    });
});
