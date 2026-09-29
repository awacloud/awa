// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/io/text/ansi.js
/**
 * @description
 * Parser and serializer for ANSI / VT100 / xterm escape sequences.
 *
 * Covers: plain text, CSI sequences (ESC [ ... finalByte), OSC sequences
 * (ESC ] ... BEL/ST), cursor moves, modes (set/reset), SGR (colors and
 * attributes).
 *
 * State machine modelled on the Paul Williams VT500 design:
 * ground → escape → csi-entry → csi-param → csi-intermediate → osc-string → osc-string-esc.
 *
 * References: ECMA-48, xterm ctlseqs, VT100 User Guide.
 *
 * Out of scope for the MVP: Sixel, Kitty image protocol, full mouse tracking.
 *
 * Worker-safe: no DOM dependency, fully pure.
 *
 * @example
 * const ansi = runtime.resolve('ansi');
 *
 * // Parser
 * const p = ansi.parser();
 * p.on('text', s => console.log('text:', s));
 * p.on('sgr',  params => console.log('sgr:', params));
 * p.feed('\x1b[1;31mHello\x1b[0m');
 *
 * // Serializer
 * ansi.sgr({ fg: 'red', bold: true });   // '\x1b[1;31m'
 * ansi.cursor.move({ row: 1, col: 1 });  // '\x1b[1;1H'
 */

/**
 * Stateful parser instance returned by `ansi.parser()`.
 * @typedef {object} AnsiParser
 * @property {(event: string, fn: Function) => void} on Subscribe a handler to an event (`text`, `csi`, `osc`, `cursor`, `mode`, `sgr`, `warning`).
 * @property {(chunk: string|Uint8Array) => void} feed Feed a chunk of data through the state machine.
 * @property {() => void} reset Reset internal state to ground.
 */

/**
 * Cursor movement serializer namespace.
 * @typedef {object} AnsiCursor
 * @property {(pos: { row: number, col: number }) => string} move Absolute cursor position (1-indexed).
 * @property {(n?: number) => string} up Move `n` lines up.
 * @property {(n?: number) => string} down Move `n` lines down.
 * @property {(n?: number) => string} right Move `n` columns right.
 * @property {(n?: number) => string} left Move `n` columns left.
 * @property {() => string} save Save the cursor position (ESC 7).
 * @property {() => string} restore Restore the cursor position (ESC 8).
 */

/**
 * Screen/line clearing serializer namespace.
 * @typedef {object} AnsiClear
 * @property {(mode?: 'all'|'before'|'after') => string} line Clear the current line.
 * @property {(mode?: 'all'|'before'|'after') => string} screen Clear the screen.
 */

/**
 * OSC serializer namespace.
 * @typedef {object} AnsiOsc
 * @property {(s: string) => string} title Set the window title (`OSC 0 ; <s> BEL`).
 */

/**
 * Public API returned by `ansi.factory()`.
 * @typedef {object} AnsiAPI
 * @property {() => AnsiParser} parser Create a new stateful ANSI/VT100 sequence parser.
 * @property {(opts?: { fg?, bg?, bold?, italic?, underline?, reverse?, dim?, blink?, strikethrough?, reset? }) => string} sgr Build an SGR sequence.
 * @property {AnsiCursor} cursor Cursor movement serializers.
 * @property {AnsiClear} clear Screen/line clearing serializers.
 * @property {AnsiOsc} osc OSC serializers.
 */

export const ansi = {
    name: 'ansi',
    version: '1.0.0',
    type: 'fw.io.text',
    dependencies: [],

    /** @returns {AnsiAPI} */
    factory() {

        // ─── SGR constants ───────────────────────────────────────────────────

        /** @type {Record<string, number>} Color names → FG code (add +10 for BG). */
        const COLOR_NAMES = {
            black:         30,
            red:           31,
            green:         32,
            yellow:        33,
            blue:          34,
            magenta:       35,
            cyan:          36,
            white:         37,
            brightBlack:   90,
            brightRed:     91,
            brightGreen:   92,
            brightYellow:  93,
            brightBlue:    94,
            brightMagenta: 95,
            brightCyan:    96,
            brightWhite:   97,
        };

        // ─── Serializer helpers ──────────────────────────────────────────────

        /**
         * Encode `ESC [ <params> <finalByte>`.
         * @param {(number|string)[]} params
         * @param {string} finalByte
         * @returns {string}
         */
        function _csi(params, finalByte) {
            return '\x1b[' + params.join(';') + finalByte;
        }

        /**
         * Resolve a color value (name, `#RRGGBB`, `{r,g,b}`) to a sequence of
         * SGR parameters for the given layer.
         * @param {string|{r:number,g:number,b:number}} color
         * @param {'fg'|'bg'} layer
         * @returns {number[]}
         */
        function _colorParams(color, layer) {
            const base = layer === 'fg' ? 0 : 10;
            if (typeof color === 'string') {
                // Named color
                if (COLOR_NAMES[color] !== undefined) {
                    return [COLOR_NAMES[color] + base];
                }
                // #RRGGBB
                const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(color);
                if (m) {
                    const r = parseInt(m[1], 16);
                    const g = parseInt(m[2], 16);
                    const b = parseInt(m[3], 16);
                    return [38 + base, 2, r, g, b];
                }
            }
            // {r, g, b}
            if (color && typeof color === 'object') {
                return [38 + base, 2, color.r | 0, color.g | 0, color.b | 0];
            }
            return [];
        }

        // ─── Serializer API ──────────────────────────────────────────────────

        /**
         * Build an SGR sequence `ESC[<params>m`.
         * @param {{fg?, bg?, bold?, italic?, underline?, reverse?, dim?,
         *          blink?, strikethrough?, reset?}} opts
         * @returns {string}
         */
        function sgr(opts = {}) {
            const params = [];
            if (opts.reset)         params.push(0);
            if (opts.bold)          params.push(1);
            if (opts.dim)           params.push(2);
            if (opts.italic)        params.push(3);
            if (opts.underline)     params.push(4);
            if (opts.blink)         params.push(5);
            if (opts.reverse)       params.push(7);
            if (opts.strikethrough) params.push(9);
            if (opts.fg != null)    params.push(..._colorParams(opts.fg, 'fg'));
            if (opts.bg != null)    params.push(..._colorParams(opts.bg, 'bg'));
            if (params.length === 0) params.push(0);
            return _csi(params, 'm');
        }

        /** @namespace cursor */
        const cursor = {
            /**
             * Move the cursor to an absolute position (1-indexed, VT100).
             * @param {{row: number, col: number}} pos
             * @returns {string}
             */
            move({ row, col }) {
                return _csi([row, col], 'H');
            },
            /**
             * Move the cursor `n` lines up.
             * @param {number} [n=1]
             * @returns {string}
             */
            up(n = 1)    { return _csi([n], 'A'); },
            /**
             * Move the cursor `n` lines down.
             * @param {number} [n=1]
             * @returns {string}
             */
            down(n = 1)  { return _csi([n], 'B'); },
            /**
             * Move the cursor `n` columns right.
             * @param {number} [n=1]
             * @returns {string}
             */
            right(n = 1) { return _csi([n], 'C'); },
            /**
             * Move the cursor `n` columns left.
             * @param {number} [n=1]
             * @returns {string}
             */
            left(n = 1)  { return _csi([n], 'D'); },
            /** Save the cursor position (ESC 7). @returns {string} */
            save()    { return '\x1b7'; },
            /** Restore the cursor position (ESC 8). @returns {string} */
            restore() { return '\x1b8'; },
        };

        /** @namespace clear */
        const clear = {
            /**
             * Clear the current line.
             * @param {'all'|'before'|'after'} [mode='all']
             * @returns {string}
             */
            line(mode = 'all') {
                const p = mode === 'before' ? 1 : mode === 'after' ? 0 : 2;
                return _csi([p], 'K');
            },
            /**
             * Clear the screen.
             * @param {'all'|'before'|'after'} [mode='all']
             * @returns {string}
             */
            screen(mode = 'all') {
                const p = mode === 'before' ? 1 : mode === 'after' ? 0 : 2;
                return _csi([p], 'J');
            },
        };

        /** @namespace osc */
        const osc = {
            /**
             * Set the window title (`OSC 0 ; <s> BEL`).
             * @param {string} s
             * @returns {string}
             */
            title(s) { return '\x1b]0;' + s + '\x07'; },
        };

        // ─── Parser - state machine ──────────────────────────────────────────

        /**
         * Create a new ANSI/VT100/xterm sequence parser.
         * Minimal event-emitter API: `on` / `emit`.
         *
         * States: ground | escape | csi-entry | csi-param |
         *         csi-intermediate | osc-string | osc-string-esc
         *
         * Emitted events:
         *  - 'text'    (string)                         - plain text
         *  - 'csi'     (params:number[], intermediates:string, finalByte:string)
         *  - 'osc'     (cmd:number, payload:string)
         *  - 'cursor'  (op:string, args?:object)
         *  - 'mode'    (set:boolean, code:number)
         *  - 'sgr'     (params:number[])
         *  - 'warning' (msg:string)                     - e.g. osc-overflow
         *
         * @note A parser instance is stateful and is **not** designed to
         *   process interleaved streams from multiple sources - feed it from
         *   a single source or `reset()` between sources.
         *
         * @returns {AnsiParser}
         */
        function parser() {
            // ── Handler registry ─────────────────────────────────────────────
            /** @type {Map<string, Function[]>} */
            const _handlers = new Map();

            /**
             * Subscribe a handler to an event.
             * @param {string} event
             * @param {Function} fn
             */
            function on(event, fn) {
                if (!_handlers.has(event)) _handlers.set(event, []);
                _handlers.get(event).push(fn);
            }

            /**
             * Emit an event to subscribed handlers.
             * @param {string} event
             * @param {...any} args
             */
            function _emit(event, ...args) {
                const fns = _handlers.get(event);
                if (fns) for (const fn of fns) fn(...args);
            }

            // ── Machine state ────────────────────────────────────────────────
            const OSC_MAX = 4096;

            let _state = 'ground';
            let _params = '';        // CSI parameter accumulator
            let _inter  = '';        // CSI intermediates accumulator
            let _oscBuf = '';        // OSC accumulator
            let _textBuf = '';       // plain-text accumulator (flushed before each sequence)
            const _decoder = new TextDecoder('utf-8');

            /** Flush the plain-text buffer. */
            function _flushText() {
                if (_textBuf.length > 0) {
                    _emit('text', _textBuf);
                    _textBuf = '';
                }
            }

            /** Parse CSI parameters (`;`-separated) into a number array.
             *  Leading DEC-private markers (`?`, `<`, `=`, `>`) are accepted and stripped. */
            function _parseParams(s) {
                if (s === '') return [];
                // Strip the leading DEC-private mode marker (?, <, =, >).
                const clean = s.replace(/^[?<=>\s]+/, '');
                if (clean === '') return [];
                return clean.split(';').map(p => p === '' ? 0 : parseInt(p, 10));
            }

            /**
             * Dispatch a complete CSI sequence.
             * Recognises: cursor (A/B/C/D/H/s/u/f), mode (h/l), SGR (m).
             * Anything else is emitted as `'csi'`.
             */
            function _dispatchCSI(intermediates, finalByte) {
                const params = _parseParams(_params);

                if (finalByte === 'm') {
                    // SGR
                    _emit('sgr', params);
                } else if (finalByte === 'h' || finalByte === 'l') {
                    // SET / RESET mode
                    const set = finalByte === 'h';
                    for (const code of (params.length ? params : [0])) {
                        _emit('mode', set, code);
                    }
                } else if (finalByte === 'H' || finalByte === 'f') {
                    // Cursor position (CUP / HVP)
                    const row = (params[0] || 1);
                    const col = (params[1] || 1);
                    _emit('cursor', 'pos', { row, col });
                } else if (finalByte === 'A') {
                    _emit('cursor', 'up',    { n: params[0] || 1 });
                } else if (finalByte === 'B') {
                    _emit('cursor', 'down',  { n: params[0] || 1 });
                } else if (finalByte === 'C') {
                    _emit('cursor', 'right', { n: params[0] || 1 });
                } else if (finalByte === 'D') {
                    _emit('cursor', 'left',  { n: params[0] || 1 });
                } else if (finalByte === 's') {
                    _emit('cursor', 'save');
                } else if (finalByte === 'u') {
                    _emit('cursor', 'restore');
                } else {
                    // Generic CSI sequence
                    _emit('csi', params, intermediates, finalByte);
                }
            }

            /**
             * Dispatch a complete OSC sequence.
             * Format: `<cmd>;<payload>`.
             */
            function _dispatchOSC(raw) {
                const semi = raw.indexOf(';');
                let cmd, payload;
                if (semi === -1) {
                    cmd     = parseInt(raw, 10) || 0;
                    payload = '';
                } else {
                    cmd     = parseInt(raw.slice(0, semi), 10) || 0;
                    payload = raw.slice(semi + 1);
                }
                _emit('osc', cmd, payload);
            }

            /**
             * Process a single character through the state machine.
             * @param {string} ch - Single character.
             */
            function _processChar(ch) {
                const code = ch.charCodeAt(0);

                switch (_state) {
                    case 'ground':
                        if (code === 0x1b) {              // ESC
                            _flushText();
                            _state = 'escape';
                        } else {
                            _textBuf += ch;
                        }
                        break;

                    case 'escape':
                        if (ch === '[') {
                            // Start of a CSI sequence
                            _params = '';
                            _inter  = '';
                            _state  = 'csi-entry';
                        } else if (ch === ']') {
                            // Start of an OSC sequence
                            _oscBuf = '';
                            _state  = 'osc-string';
                        } else if (ch === '7') {
                            // ESC 7 - Save cursor (DEC)
                            _emit('cursor', 'save');
                            _state = 'ground';
                        } else if (ch === '8') {
                            // ESC 8 - Restore cursor (DEC)
                            _emit('cursor', 'restore');
                            _state = 'ground';
                        } else if (ch === 'c') {
                            // ESC c - Full Reset (RIS)
                            _emit('csi', [], '', 'c');
                            _state = 'ground';
                        } else {
                            // Unknown ESC sequence - return to ground
                            _state = 'ground';
                        }
                        break;

                    case 'csi-entry':
                    case 'csi-param':
                        if (code >= 0x30 && code <= 0x3f) {
                            // Parameter byte (0–9, ;, :, <, =, >, ?)
                            _params += ch;
                            _state   = 'csi-param';
                        } else if (code >= 0x20 && code <= 0x2f) {
                            // Intermediate byte
                            _inter += ch;
                            _state  = 'csi-intermediate';
                        } else if (code >= 0x40 && code <= 0x7e) {
                            // Final byte
                            _dispatchCSI(_inter, ch);
                            _state = 'ground';
                        } else if (code === 0x1b) {
                            // ESC mid-sequence → reset
                            _state = 'escape';
                        } else {
                            // Unexpected control character → ground
                            _state = 'ground';
                        }
                        break;

                    case 'csi-intermediate':
                        if (code >= 0x20 && code <= 0x2f) {
                            _inter += ch;
                        } else if (code >= 0x40 && code <= 0x7e) {
                            _dispatchCSI(_inter, ch);
                            _state = 'ground';
                        } else if (code === 0x1b) {
                            _state = 'escape';
                        } else {
                            _state = 'ground';
                        }
                        break;

                    case 'osc-string':
                        if (code === 0x07) {
                            // BEL - OSC terminator
                            _dispatchOSC(_oscBuf);
                            _state = 'ground';
                        } else if (code === 0x1b) {
                            // ESC (start of ST = ESC \)
                            _state = 'osc-string-esc';
                        } else {
                            if (_oscBuf.length < OSC_MAX) {
                                _oscBuf += ch;
                            } else {
                                _emit('warning', 'osc-overflow');
                                _dispatchOSC(_oscBuf);
                                _state = 'ground';
                            }
                        }
                        break;

                    case 'osc-string-esc':
                        if (ch === '\\') {
                            // Complete ST (ESC \)
                            _dispatchOSC(_oscBuf);
                            _state = 'ground';
                        } else {
                            // Not an ST - treat the preceding ESC as a new sequence
                            _state = 'escape';
                            _processChar(ch); // re-process the current character
                        }
                        break;
                }
            }

            /**
             * Feed the parser a chunk of data.
             * @param {string|Uint8Array} chunk
             */
            function feed(chunk) {
                let str;
                if (chunk instanceof Uint8Array) {
                    str = _decoder.decode(chunk, { stream: true });
                } else {
                    str = String(chunk);
                }
                for (let i = 0; i < str.length; i++) {
                    _processChar(str[i]);
                }
                // Flush residual plain text if we are in ground state.
                if (_state === 'ground' && _textBuf.length > 0) {
                    _flushText();
                }
            }

            /**
             * Reset the parser's internal state.
             * After `reset()`, the next `feed()` starts cleanly from the
             * ground state.
             */
            function reset() {
                _state   = 'ground';
                _params  = '';
                _inter   = '';
                _oscBuf  = '';
                _textBuf = '';
            }

            return { on, feed, reset };
        }

        // ─── Exports ─────────────────────────────────────────────────────────
        return { parser, sgr, cursor, clear, osc };
    },
};
