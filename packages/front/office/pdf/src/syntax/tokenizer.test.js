// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTokenizer } from './tokenizer.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfShared } from '../_shared/index.js';
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const { tokenize, lastIndexOfBytes } = pdfTokenizer.factory(_errors, pdfShared.factory());
const te = new TextEncoder();
const td = new TextDecoder('latin1');

function tk(src) {
    const t = tokenize(typeof src === 'string' ? te.encode(src) : src);
    const out = [];
    for (;;) {
        const x = t.next();
        if (!x) break;
        out.push(x);
    }
    return out;
}

describe('pdfTokenizer module', () => {
    test('exposes module shape', () => {
        expect(pdfTokenizer.name).toBe('pdfTokenizer');
        expect(pdfTokenizer.dependencies).toEqual(['pdfErrors', 'pdfShared']);
        const m = pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory());
        expect(typeof m.tokenize).toBe('function');
        expect(typeof m.lastIndexOfBytes).toBe('function');
    });

    test('factory.toString() is worker-transportable', () => {
        expect(pdfTokenizer.factory.toString()).toContain('function');
    });
});

describe('whitespace + comments', () => {
    test('skips whitespace runs by default', () => {
        expect(tk('   \r\n  \t  ').length).toBe(0);
    });

    test('emits ws tokens when keepWhitespace is set', () => {
        const t = tokenize(te.encode('  \t  '), { keepWhitespace: true });
        const x = t.next();
        expect(x.kind).toBe('ws');
        expect(x.offset).toBe(0);
        expect(x.end).toBe(5);
    });

    test('drops regular comments', () => {
        expect(tk('% this is a comment\n42').map(t => t.kind))
            .toEqual(['int']);
    });

    test('emits %%EOF as eof_marker', () => {
        const t = tk('startxref\n0\n%%EOF');
        expect(t[t.length - 1].kind).toBe('eof_marker');
    });
});

describe('names', () => {
    test('basic name', () => {
        const [t] = tk('/Type');
        expect(t).toMatchObject({ kind: 'name', value: 'Type' });
    });

    test('hex escapes', () => {
        const [t] = tk('/A#20B');
        expect(t.value).toBe('A B');
    });

    test('UTF-8 name', () => {
        const [t] = tk('/Caf#C3#A9');
        expect(t.value).toBe('Café');
    });

    test('rejects truncated hex escape', () => {
        expect(() => tk('/A#2')).toThrow(ParseError);
    });

    test('rejects invalid hex digit', () => {
        expect(() => tk('/A#XY')).toThrow(ParseError);
    });

    test('empty name is allowed (`/`)', () => {
        const [t] = tk('/ ');
        expect(t.value).toBe('');
    });
});

describe('numbers', () => {
    test.each([
        ['0',     'int',  0],
        ['+17',   'int',  17],
        ['-98',   'int', -98],
        ['1.0',   'real', 1],
        ['-.5',   'real', -0.5],
        ['3.14',  'real', 3.14],
        ['+0.0',  'real', 0],
    ])('%s', (src, kind, v) => {
        const [t] = tk(src);
        expect(t.kind).toBe(kind);
        expect(t.value).toBe(v);
    });

    test('rejects lone sign', () => {
        expect(() => tk('+')).toThrow(ParseError);
    });
});

describe('literal strings', () => {
    test('plain', () => {
        const [t] = tk('(hello)');
        expect(t.kind).toBe('string');
        expect(td.decode(t.value)).toBe('hello');
    });

    test('balanced parens', () => {
        const [t] = tk('(a(b)c)');
        expect(td.decode(t.value)).toBe('a(b)c');
    });

    test('escape sequences', () => {
        const [t] = tk('(a\\nb\\tc\\(d\\\\e)');
        expect(td.decode(t.value)).toBe('a\nb\tc(d\\e');
    });

    test('octal escape', () => {
        const [t] = tk('(\\101\\102\\103)'); // ABC
        expect(td.decode(t.value)).toBe('ABC');
    });

    test('line continuation', () => {
        const [t] = tk('(line1\\\nline2)');
        expect(td.decode(t.value)).toBe('line1line2');
    });

    test('CRLF inside string normalizes to LF', () => {
        const [t] = tk('(a\r\nb)');
        expect(td.decode(t.value)).toBe('a\nb');
    });

    test('unterminated string throws', () => {
        expect(() => tk('(no-close')).toThrow(ParseError);
    });
});

describe('hex strings', () => {
    test('basic', () => {
        const [t] = tk('<48656c6c6f>');
        expect(t.kind).toBe('hex');
        expect(td.decode(t.value)).toBe('Hello');
    });

    test('odd nibbles implicit trailing 0', () => {
        const [t] = tk('<F>');
        expect(Array.from(t.value)).toEqual([0xF0]);
    });

    test('whitespace inside hex string is allowed', () => {
        const [t] = tk('<48 65 6c\n6c 6f>');
        expect(td.decode(t.value)).toBe('Hello');
    });

    test('non-hex byte throws', () => {
        expect(() => tk('<XX>')).toThrow(ParseError);
    });
});

describe('delimiters & dict markers', () => {
    test('array brackets', () => {
        const t = tk('[1 2 3]');
        expect(t.map(x => x.kind))
            .toEqual(['open_arr', 'int', 'int', 'int', 'close_arr']);
    });

    test('dict markers', () => {
        const t = tk('<< /A 1 >>');
        expect(t.map(x => x.kind))
            .toEqual(['open_dict', 'name', 'int', 'close_dict']);
    });

    test('lone > throws', () => {
        expect(() => tk('1 > 2')).toThrow(ParseError);
    });
});

describe('keywords', () => {
    test('common keywords', () => {
        const t = tk('true false null obj endobj R stream endstream xref trailer startxref n f');
        expect(t.every(x => x.kind === 'kw')).toBe(true);
        expect(t.map(x => x.value)).toEqual([
            'true', 'false', 'null', 'obj', 'endobj', 'R',
            'stream', 'endstream', 'xref', 'trailer', 'startxref', 'n', 'f'
        ]);
    });
});

describe('pos / seek', () => {
    test('seek + pos round-trips', () => {
        const t = tokenize(te.encode('/A /B /C'));
        t.next();
        const at = t.pos();
        t.next();
        t.seek(at);
        expect(t.next().value).toBe('B');
    });

    test('seek out of range throws', () => {
        const t = tokenize(te.encode('/A'));
        expect(() => t.seek(-1)).toThrow(ParseError);
        expect(() => t.seek(1e9)).toThrow(ParseError);
    });

    test('peek does not advance', () => {
        const t = tokenize(te.encode('/A /B'));
        const p1 = t.peek();
        const p2 = t.peek();
        expect(p1).toBe(p2);
        const n  = t.next();
        expect(n).toBe(p1);
    });
});

describe('rejects non-Uint8Array input', () => {
    test('string input', () => {
        expect(() => tokenize('not bytes')).toThrow(ParseError);
    });
});

const codeOfTok = (src) => {
    try { tk(src); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('number tokens — malformed', () => {
    test('a sign-and-dot token is not a number', () => {
        expect(codeOfTok('+.')).toBe('pdf/tokenizer/bad-number');
        expect(codeOfTok('-.')).toBe('pdf/tokenizer/bad-number');
    });

    test('a magnitude that overflows to Infinity is rejected', () => {
        expect(codeOfTok('9'.repeat(400))).toBe('pdf/tokenizer/bad-number');
    });

    test('a second dot terminates the token rather than corrupting it', () => {
        // `1.2.3` tokenizes as real 1.2 followed by real .3 — the second dot
        // starts a new token, it does not make the first one malformed.
        const toks = tk('1.2 .3');
        expect(toks.map((t) => t.kind)).toEqual(['real', 'real']);
        expect(toks[0].value).toBeCloseTo(1.2, 10);
    });
});

describe('keyword tokens — malformed', () => {
    test('a stray closing parenthesis is not a keyword', () => {
        // `)` is a delimiter, so readKeyword consumes nothing and must
        // reject rather than return a zero-length keyword token.
        expect(codeOfTok(')')).toBe('pdf/tokenizer/empty-keyword');
        expect(codeOfTok('{')).toBe('pdf/tokenizer/empty-keyword');
    });
});

describe('literal-string escapes', () => {
    const str = (src) => td.decode(tk(src)[0].value);

    test('a backslash before CR or CRLF is a line continuation', () => {
        expect(str('(a\\\rb)')).toBe('ab');
        expect(str('(a\\\r\nb)')).toBe('ab');
        expect(str('(a\\\nb)')).toBe('ab');
    });

    test('a backslash before an unknown character drops the backslash', () => {
        // ISO 32000-2 §7.3.4.2: a REVERSE SOLIDUS before a character not in
        // the escape table is ignored.
        expect(str('(a\\q)')).toBe('aq');
        expect(str('(a\\8)')).toBe('a8');   // 8 is not an octal digit
    });

    test('the documented escape table is honoured', () => {
        expect(Array.from(tk('(\\n\\r\\t\\b\\f\\(\\)\\\\)')[0].value))
            .toEqual([0x0A, 0x0D, 0x09, 0x08, 0x0C, 0x28, 0x29, 0x5C]);
        expect(Array.from(tk('(\\101\\7)')[0].value)).toEqual([0x41, 0x07]);
    });

    test('a trailing backslash with no following byte is rejected', () => {
        const e = (() => {
            try { tk(te.encode('(abc\\')); } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/tokenizer/bad-string');
    });
});

describe('lastIndexOfBytes', () => {
    test('finds last occurrence', () => {
        const b = te.encode('aaa needle bbb needle ccc');
        const idx = lastIndexOfBytes(b, te.encode('needle'));
        expect(idx).toBe(15);
    });

    test('returns -1 when absent', () => {
        const b = te.encode('aaa bbb');
        expect(lastIndexOfBytes(b, te.encode('zzz'))).toBe(-1);
    });

    test('respects from upper bound', () => {
        const b = te.encode('xx yy xx');
        expect(lastIndexOfBytes(b, te.encode('xx'), 3)).toBe(0);
    });
});
