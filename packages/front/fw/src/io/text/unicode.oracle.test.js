// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The runtime as the oracle (D21: no vendored Unicode test files):
// String.prototype.normalize for the four forms, Intl.Segmenter for grapheme
// clusters. Without Intl.Segmenter, graphemes() splits by code point, as its
// documentation says; that fallback is pinned here.

import { describe, test, expect } from 'bun:test';
import { unicode } from './unicode.js';

const t = unicode.factory();
const TEXT = [
    'é', 'é', 'Å', 'Å', 'ﬁ', '①', 'ẛ̣', 'café naïve', '水Ａ',
    '\u{1F468}‍\u{1F469}‍\u{1F467}', '\u{1F1EB}\u{1F1F7}', 'क्ष', 'a\r\nb', '\u{1F44D}\u{1F3FD}', '각',
];

describe('unicode against the runtime', () => {
    test('normalize equals String.prototype.normalize for NFC, NFD, NFKC, NFKD', () => {
        for (const form of ['NFC', 'NFD', 'NFKC', 'NFKD']) {
            for (const s of TEXT) expect(t.normalize(s, form), `${form} ${JSON.stringify(s)}`).toBe(s.normalize(form));
        }
    });

    test('graphemes equals Intl.Segmenter', () => {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        for (const s of TEXT) {
            expect([...t.graphemes(s)], JSON.stringify(s)).toEqual([...seg.segment(s)].map((x) => x.segment));
        }
    });

    test('without Intl.Segmenter, graphemes splits by code point (the documented fallback)', () => {
        const saved = Intl.Segmenter;
        let got;
        try {
            delete Intl.Segmenter;
            got = TEXT.map((s) => [...t.graphemes(s)]);
        } finally {
            Intl.Segmenter = saved;
        }
        TEXT.forEach((s, i) => expect(got[i]).toEqual([...s]));
    });
});
