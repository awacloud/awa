// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/io/text/ansi.test.js
import { describe, test, expect, beforeEach } from 'bun:test';
import { ansi } from './ansi.js';

describe('ansi module', () => {

    // ── 1. Metadata ───────────────────────────────────────────────────────
    test('should have correct module metadata', () => {
        expect(ansi.name).toBe('ansi');
        expect(ansi.version).toBe('1.0.0');
        expect(ansi.type).toBe('fw.io.text');
        expect(ansi.dependencies).toEqual([]);
        expect(typeof ansi.factory).toBe('function');
    });

    // ── 2. Factory API ────────────────────────────────────────────────────
    describe('factory', () => {
        test('should return expected API surface', () => {
            const inst = ansi.factory();
            expect(typeof inst.parser).toBe('function');
            expect(typeof inst.sgr).toBe('function');
            expect(typeof inst.cursor).toBe('object');
            expect(typeof inst.cursor.move).toBe('function');
            expect(typeof inst.cursor.up).toBe('function');
            expect(typeof inst.cursor.down).toBe('function');
            expect(typeof inst.cursor.left).toBe('function');
            expect(typeof inst.cursor.right).toBe('function');
            expect(typeof inst.cursor.save).toBe('function');
            expect(typeof inst.cursor.restore).toBe('function');
            expect(typeof inst.clear).toBe('object');
            expect(typeof inst.clear.line).toBe('function');
            expect(typeof inst.clear.screen).toBe('function');
            expect(typeof inst.osc).toBe('object');
            expect(typeof inst.osc.title).toBe('function');
        });

        test('parser() should return expected API surface', () => {
            const { parser } = ansi.factory();
            const p = parser();
            expect(typeof p.on).toBe('function');
            expect(typeof p.feed).toBe('function');
            expect(typeof p.reset).toBe('function');
        });
    });

    // ── 3. Parser ─────────────────────────────────────────────────────────
    describe('parser', () => {
        let inst, p;
        beforeEach(() => {
            inst = ansi.factory();
            p    = inst.parser();
        });

        // Plan test #2
        test('plain text: feed("hello") emits one text event with "hello"', () => {
            const events = [];
            p.on('text', s => events.push(s));
            p.feed('hello');
            expect(events).toEqual(['hello']);
        });

        // Plan test #3
        test('SGR red: ESC[31m emits sgr [31] then text "hi"', () => {
            const sgrEvts  = [];
            const textEvts = [];
            p.on('sgr',  ps => sgrEvts.push(ps));
            p.on('text', s  => textEvts.push(s));
            p.feed('\x1b[31mhi');
            expect(sgrEvts).toEqual([[31]]);
            expect(textEvts).toEqual(['hi']);
        });

        // Plan test #4
        test('cursor move: ESC[10;20H emits cursor "pos" {row:10, col:20}', () => {
            const evts = [];
            p.on('cursor', (op, args) => evts.push({ op, args }));
            p.feed('\x1b[10;20H');
            expect(evts).toEqual([{ op: 'pos', args: { row: 10, col: 20 } }]);
        });

        // Plan test #5
        test('clear screen: ESC[2J emits csi [2] "J"', () => {
            const evts = [];
            p.on('csi', (params, inter, fb) => evts.push({ params, inter, fb }));
            p.feed('\x1b[2J');
            expect(evts).toEqual([{ params: [2], inter: '', fb: 'J' }]);
        });

        // Plan test #6
        test('OSC title: ESC]0;FooBEL emits osc {cmd:0, payload:"Foo"}', () => {
            const evts = [];
            p.on('osc', (cmd, payload) => evts.push({ cmd, payload }));
            p.feed('\x1b]0;Foo\x07');
            expect(evts).toEqual([{ cmd: 0, payload: 'Foo' }]);
        });

        // Plan test #7
        test('multi-chunks: split sequence over two feed() calls', () => {
            const sgrEvts = [];
            p.on('sgr', ps => sgrEvts.push(ps));
            // Arbitrary split within ESC[1;32m
            p.feed('\x1b[1;');
            p.feed('32m');
            expect(sgrEvts).toEqual([[1, 32]]);
        });

        // Plan test #10
        test('reset: after partial sequence, reset then new feed works cleanly', () => {
            const sgrEvts  = [];
            const textEvts = [];
            p.on('sgr',  ps => sgrEvts.push(ps));
            p.on('text', s  => textEvts.push(s));
            // Incomplete sequence
            p.feed('\x1b[');
            // Reset and clean new feed
            p.reset();
            p.feed('clean');
            expect(sgrEvts).toEqual([]);
            expect(textEvts).toEqual(['clean']);
        });

        // Cursor up/down/left/right
        test('cursor up: ESC[3A emits cursor "up" {n:3}', () => {
            const evts = [];
            p.on('cursor', (op, args) => evts.push({ op, args }));
            p.feed('\x1b[3A');
            expect(evts).toEqual([{ op: 'up', args: { n: 3 } }]);
        });

        test('cursor down: ESC[2B emits cursor "down" {n:2}', () => {
            const evts = [];
            p.on('cursor', (op, args) => evts.push({ op, args }));
            p.feed('\x1b[2B');
            expect(evts).toEqual([{ op: 'down', args: { n: 2 } }]);
        });

        test('cursor right: ESC[5C emits cursor "right" {n:5}', () => {
            const evts = [];
            p.on('cursor', (op, args) => evts.push({ op, args }));
            p.feed('\x1b[5C');
            expect(evts).toEqual([{ op: 'right', args: { n: 5 } }]);
        });

        test('cursor left: ESC[4D emits cursor "left" {n:4}', () => {
            const evts = [];
            p.on('cursor', (op, args) => evts.push({ op, args }));
            p.feed('\x1b[4D');
            expect(evts).toEqual([{ op: 'left', args: { n: 4 } }]);
        });

        // ESC 7 / ESC 8
        test('ESC 7 emits cursor "save"', () => {
            const evts = [];
            p.on('cursor', op => evts.push(op));
            p.feed('\x1b7');
            expect(evts).toEqual(['save']);
        });

        test('ESC 8 emits cursor "restore"', () => {
            const evts = [];
            p.on('cursor', op => evts.push(op));
            p.feed('\x1b8');
            expect(evts).toEqual(['restore']);
        });

        // Mode SET / RESET
        test('mode set: ESC[?1049h emits mode(true, 1049)', () => {
            const evts = [];
            p.on('mode', (set, code) => evts.push({ set, code }));
            p.feed('\x1b[?1049h');
            expect(evts).toEqual([{ set: true, code: 1049 }]);
        });

        test('mode reset: ESC[?1049l emits mode(false, 1049)', () => {
            const evts = [];
            p.on('mode', (set, code) => evts.push({ set, code }));
            p.feed('\x1b[?1049l');
            expect(evts).toEqual([{ set: false, code: 1049 }]);
        });

        // Uint8Array input
        test('accepts Uint8Array input', () => {
            const textEvts = [];
            p.on('text', s => textEvts.push(s));
            const enc = new TextEncoder();
            p.feed(enc.encode('world'));
            expect(textEvts).toEqual(['world']);
        });

        // Multiple chained sequences
        test('multiple sequences in a single feed', () => {
            const sgrEvts  = [];
            const textEvts = [];
            p.on('sgr',  ps => sgrEvts.push(ps));
            p.on('text', s  => textEvts.push(s));
            p.feed('\x1b[1mA\x1b[0mB');
            expect(sgrEvts).toEqual([[1], [0]]);
            expect(textEvts).toEqual(['A', 'B']);
        });

        // OSC via ST (ESC \)
        test('OSC terminated by ST (ESC backslash)', () => {
            const evts = [];
            p.on('osc', (cmd, payload) => evts.push({ cmd, payload }));
            p.feed('\x1b]2;My Title\x1b\\');
            expect(evts).toEqual([{ cmd: 2, payload: 'My Title' }]);
        });

        // Plan test #11 - Real xterm vectors
        describe('xterm vectors', () => {
            // 1. DECTCEM show cursor: ESC[?25h
            test('xterm: ESC[?25h (show cursor) emits mode(true, 25)', () => {
                const evts = [];
                p.on('mode', (set, code) => evts.push({ set, code }));
                p.feed('\x1b[?25h');
                expect(evts).toEqual([{ set: true, code: 25 }]);
            });

            // 2. DECTCEM hide cursor: ESC[?25l
            test('xterm: ESC[?25l (hide cursor) emits mode(false, 25)', () => {
                const evts = [];
                p.on('mode', (set, code) => evts.push({ set, code }));
                p.feed('\x1b[?25l');
                expect(evts).toEqual([{ set: false, code: 25 }]);
            });

            // 3. Erase in display ED ESC[1J (before)
            test('xterm: ESC[1J (erase above) emits csi [1] "J"', () => {
                const evts = [];
                p.on('csi', (params, inter, fb) => evts.push({ params, fb }));
                p.feed('\x1b[1J');
                expect(evts).toEqual([{ params: [1], fb: 'J' }]);
            });

            // 4. Erase in line EL ESC[0K (after)
            test('xterm: ESC[0K (erase to right) emits csi [0] "K"', () => {
                const evts = [];
                p.on('csi', (params, inter, fb) => evts.push({ params, fb }));
                p.feed('\x1b[0K');
                expect(evts).toEqual([{ params: [0], fb: 'K' }]);
            });

            // 5. SGR bold+underline: ESC[1;4m
            test('xterm: ESC[1;4m (bold + underline) emits sgr [1, 4]', () => {
                const evts = [];
                p.on('sgr', ps => evts.push(ps));
                p.feed('\x1b[1;4m');
                expect(evts).toEqual([[1, 4]]);
            });

            // 6. Set scrolling region: ESC[5;20r
            test('xterm: ESC[5;20r (DECSTBM) emits csi [5,20] "r"', () => {
                const evts = [];
                p.on('csi', (params, inter, fb) => evts.push({ params, fb }));
                p.feed('\x1b[5;20r');
                expect(evts).toEqual([{ params: [5, 20], fb: 'r' }]);
            });
        });
    });

    // ── 4. sgr serializer ────────────────────────────────────────────────
    describe('sgr', () => {
        let inst;
        beforeEach(() => { inst = ansi.factory(); });

        test('reset produces ESC[0m', () => {
            expect(inst.sgr({ reset: true })).toBe('\x1b[0m');
        });

        test('bold produces ESC[1m', () => {
            expect(inst.sgr({ bold: true })).toBe('\x1b[1m');
        });

        test('italic produces ESC[3m', () => {
            expect(inst.sgr({ italic: true })).toBe('\x1b[3m');
        });

        test('underline produces ESC[4m', () => {
            expect(inst.sgr({ underline: true })).toBe('\x1b[4m');
        });

        test('fg red produces ESC[31m', () => {
            expect(inst.sgr({ fg: 'red' })).toBe('\x1b[31m');
        });

        test('bg blue produces ESC[44m', () => {
            expect(inst.sgr({ bg: 'blue' })).toBe('\x1b[44m');
        });

        test('bold + fg red produces ESC[1;31m', () => {
            expect(inst.sgr({ bold: true, fg: 'red' })).toBe('\x1b[1;31m');
        });

        // Plan test #9 - Truecolor
        test('truecolor fg {r:255,g:128,b:0} produces ESC[38;2;255;128;0m', () => {
            expect(inst.sgr({ fg: { r: 255, g: 128, b: 0 } })).toBe('\x1b[38;2;255;128;0m');
        });

        test('truecolor bg via #hex produces ESC[48;2;r;g;bm', () => {
            expect(inst.sgr({ bg: '#ff8000' })).toBe('\x1b[48;2;255;128;0m');
        });

        test('no opts produces ESC[0m (default reset)', () => {
            expect(inst.sgr()).toBe('\x1b[0m');
            expect(inst.sgr({})).toBe('\x1b[0m');
        });

        test('brightCyan fg', () => {
            expect(inst.sgr({ fg: 'brightCyan' })).toBe('\x1b[96m');
        });

        // Plan test #8 - Round-trip
        test('round-trip: sgr({fg:"red", bold:true}) → parser re-emits sgr [1,31]', () => {
            const seq = inst.sgr({ fg: 'red', bold: true });
            const p = inst.parser();
            const sgrEvts = [];
            p.on('sgr', ps => sgrEvts.push(ps));
            p.feed(seq);
            expect(sgrEvts).toEqual([[1, 31]]);
        });
    });

    // ── 5. cursor serializer ─────────────────────────────────────────────
    describe('cursor', () => {
        let cursor;
        beforeEach(() => { cursor = ansi.factory().cursor; });

        test('move({row:10, col:20}) → ESC[10;20H', () => {
            expect(cursor.move({ row: 10, col: 20 })).toBe('\x1b[10;20H');
        });

        test('up(3) → ESC[3A', () => {
            expect(cursor.up(3)).toBe('\x1b[3A');
        });

        test('down(1) → ESC[1B', () => {
            expect(cursor.down()).toBe('\x1b[1B');
        });

        test('right(5) → ESC[5C', () => {
            expect(cursor.right(5)).toBe('\x1b[5C');
        });

        test('left(2) → ESC[2D', () => {
            expect(cursor.left(2)).toBe('\x1b[2D');
        });

        test('save() → ESC 7', () => {
            expect(cursor.save()).toBe('\x1b7');
        });

        test('restore() → ESC 8', () => {
            expect(cursor.restore()).toBe('\x1b8');
        });
    });

    // ── 6. clear serializer ──────────────────────────────────────────────
    describe('clear', () => {
        let clear;
        beforeEach(() => { clear = ansi.factory().clear; });

        test('line("all") → ESC[2K', () => {
            expect(clear.line('all')).toBe('\x1b[2K');
        });

        test('line("before") → ESC[1K', () => {
            expect(clear.line('before')).toBe('\x1b[1K');
        });

        test('line("after") → ESC[0K', () => {
            expect(clear.line('after')).toBe('\x1b[0K');
        });

        test('line() default "all" → ESC[2K', () => {
            expect(clear.line()).toBe('\x1b[2K');
        });

        test('screen("all") → ESC[2J', () => {
            expect(clear.screen('all')).toBe('\x1b[2J');
        });

        test('screen("before") → ESC[1J', () => {
            expect(clear.screen('before')).toBe('\x1b[1J');
        });

        test('screen("after") → ESC[0J', () => {
            expect(clear.screen('after')).toBe('\x1b[0J');
        });
    });

    // ── 7. osc serializer ────────────────────────────────────────────────
    describe('osc', () => {
        let osc;
        beforeEach(() => { osc = ansi.factory().osc; });

        test('title("Foo") → ESC]0;FooBEL', () => {
            expect(osc.title('Foo')).toBe('\x1b]0;Foo\x07');
        });

        test('title("") → ESC]0;BEL', () => {
            expect(osc.title('')).toBe('\x1b]0;\x07');
        });
    });

});
