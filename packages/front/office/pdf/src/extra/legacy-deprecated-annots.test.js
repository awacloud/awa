// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfLegacyDeprecatedAnnots } from './legacy-deprecated-annots.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfLegacyDeprecatedAnnots.factory(_pdfErrors_TD1);

describe('extra/legacy-deprecated-annots — Sound', () => {
    test('typed sound annot with icon name', () => {
        const r = m.typeSoundAnnot(obj.dict({
            Subtype: obj.name('Sound'),
            Sound: obj.stream(obj.dict({}), u8('wav-bytes')),
            Name: obj.name('Speaker')
        }));
        expect(r.subtype).toBe('Sound');
        expect(r.iconName).toBe('Speaker');
    });

    test('sound stream payload typing', () => {
        const r = m.typeSoundStream(obj.stream(obj.dict({
            R: obj.int(44100), C: obj.int(2), B: obj.int(16),
            E: obj.name('Signed'), Mode: obj.name('Stereo')
        }), u8('pcm')));
        expect(r.samplingRate).toBe(44100);
        expect(r.channels).toBe(2);
        expect(r.encoding).toBe('Signed');
        expect(r.mode).toBe('Stereo');
    });

    test('rejects bad subtype', () => {
        expect(() => m.typeSoundAnnot(obj.dict({ Subtype: obj.name('Movie') }))).toThrow(ParseError);
    });

    test('rejects missing /Sound', () => {
        expect(() => m.typeSoundAnnot(obj.dict({ Subtype: obj.name('Sound') }))).toThrow(ParseError);
    });

    test('rejects bad sound mode', () => {
        expect(() => m.typeSoundStream(obj.stream(obj.dict({ Mode: obj.name('Quad') }), u8('x')))).toThrow(ParseError);
    });
});

describe('extra/legacy-deprecated-annots — Movie', () => {
    test('movie annot with activation dict', () => {
        const r = m.typeMovieAnnot(obj.dict({
            Subtype: obj.name('Movie'),
            Movie: obj.dict({ F: obj.string(u8('clip.mov')) }),
            T: obj.string(u8('Intro')),
            A: obj.dict({ Mode: obj.name('Repeat') })
        }));
        expect(r.title).toBeInstanceOf(Uint8Array);
        expect(r.activation.mode).toBe('Repeat');
    });

    test('movie annot with bool /A', () => {
        const r = m.typeMovieAnnot(obj.dict({
            Subtype: obj.name('Movie'),
            Movie: obj.dict({}),
            A: obj.bool(true)
        }));
        expect(r.activation.auto).toBe(true);
    });

    test('rejects missing /Movie', () => {
        expect(() => m.typeMovieAnnot(obj.dict({ Subtype: obj.name('Movie') }))).toThrow(ParseError);
    });

    test('rejects bad mode', () => {
        expect(() => m.typeMovieAnnot(obj.dict({
            Subtype: obj.name('Movie'),
            Movie: obj.dict({}),
            A: obj.dict({ Mode: obj.name('Spin') })
        }))).toThrow(ParseError);
    });
});

describe('extra/legacy-deprecated-annots — Screen', () => {
    test('screen annot with /A and /AA', () => {
        const r = m.typeScreenAnnot(obj.dict({
            Subtype: obj.name('Screen'),
            T: obj.string(u8('Player')),
            MK: obj.dict({}),
            A: obj.dict({ S: obj.name('Rendition') }),
            AA: obj.dict({ PO: obj.dict({}) })
        }));
        expect(r.subtype).toBe('Screen');
        expect(r.title).toBeInstanceOf(Uint8Array);
        expect(r.action).toBeDefined();
        expect(r.additionalActions).toBeDefined();
    });

    test('preserves _extras', () => {
        const r = m.typeScreenAnnot(obj.dict({
            Subtype: obj.name('Screen'), F: obj.int(4)
        }));
        expect(r._extras.F.value).toBe(4);
    });

    test('rejects bad /MK', () => {
        expect(() => m.typeScreenAnnot(obj.dict({
            Subtype: obj.name('Screen'), MK: obj.int(1)
        }))).toThrow(ParseError);
    });
});

describe('extra/legacy-deprecated-annots — factory', () => {
    test('factory shape', () => {
        expect(pdfLegacyDeprecatedAnnots.name).toBe('pdfLegacyDeprecatedAnnots');
        expect(pdfLegacyDeprecatedAnnots.dependencies).toEqual(['pdfErrors']);
        expect(pdfLegacyDeprecatedAnnots.factory.toString()).toContain('function');
    });
});

const codeOfAnn = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('extra/legacy-deprecated-annots — malformed input', () => {
    test('every typer rejects a non-dictionary annotation', () => {
        for (const fn of [m.typeSoundAnnot, m.typeMovieAnnot, m.typeScreenAnnot]) {
            expect(codeOfAnn(() => fn(obj.array([])))).toBe('pdf/legacy-annot/not-dict');
        }
    });

    test('/Sound must be a stream or a ref, and /Name a name', () => {
        expect(codeOfAnn(() => m.typeSoundAnnot(obj.dict({
            Subtype: obj.name('Sound'), Sound: obj.int(1)
        })))).toBe('pdf/legacy-annot/sound-bad-stream');
        // A ref is accepted — the sound payload is usually indirect.
        expect(m.typeSoundAnnot(obj.dict({
            Subtype: obj.name('Sound'), Sound: obj.ref(4, 0)
        })).sound.type).toBe('ref');
        expect(codeOfAnn(() => m.typeSoundAnnot(obj.dict({
            Subtype: obj.name('Sound'), Sound: obj.ref(4, 0), Name: obj.string(u8('Speaker'))
        })))).toBe('pdf/legacy-annot/sound-bad-name');
    });

    test('typeSoundStream requires an actual stream', () => {
        expect(codeOfAnn(() => m.typeSoundStream(obj.dict({}))))
            .toBe('pdf/legacy-annot/sound-stream');
    });

    test('/Movie must be a dict; /T a text string; /A a bool or dict', () => {
        const movie = (extra) => obj.dict({
            Subtype: obj.name('Movie'), Movie: obj.dict({}), ...extra
        });
        expect(codeOfAnn(() => m.typeMovieAnnot(obj.dict({
            Subtype: obj.name('Movie'), Movie: obj.array([])
        })))).toBe('pdf/legacy-annot/movie-bad');
        expect(codeOfAnn(() => m.typeMovieAnnot(movie({ T: obj.name('title') }))))
            .toBe('pdf/legacy-annot/movie-bad-T');
        expect(codeOfAnn(() => m.typeMovieAnnot(movie({ A: obj.int(1) }))))
            .toBe('pdf/legacy-annot/movie-bad-A');
        expect(m.typeMovieAnnot(movie({ A: obj.bool(true) })).activation)
            .toEqual({ auto: true });
    });

    test('/P on a Screen annot must be a page ref or dict', () => {
        const screen = (extra) => obj.dict({ Subtype: obj.name('Screen'), ...extra });
        expect(codeOfAnn(() => m.typeScreenAnnot(screen({ P: obj.int(2) }))))
            .toBe('pdf/legacy-annot/screen-bad-P');
        expect(m.typeScreenAnnot(screen({ P: obj.ref(2, 0) })).page.type).toBe('ref');
        expect(m.typeScreenAnnot(screen({ P: obj.dict({}) })).page.type).toBe('dict');
    });
});
