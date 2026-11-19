// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The Computer Modern math layouts: the text at each
 * position of cmsy (`OMS`), cmmi (`OML`) and cmex (`OMX`).
 *
 * A font converted from TeX's math fonts may name its glyphs by position
 * and carry no truthful Unicode mapping; this table gives the character a
 * position draws. The layout is the TeXbook's (Appendix F, the font
 * tables of cmsy10, cmmi10 and cmex10). The glyph names at 68 cmsy, 86
 * cmmi and 51 cmex positions were checked against the built-in encodings
 * of pdfTeX CMSY*, CMMI* and CMEX* Type 1 programs embedded in the
 * reference corpus, with no conflict; the other positions follow the
 * TeXbook.
 *
 * A position with no character of its own is `null`: the assembly pieces
 * of large delimiters, radicals and braces (top, bottom, extension,
 * middle, brace tips), the wide accents, the overlays (`negationslash`,
 * `mapsto`, the hook pieces) and the empty slots. The calligraphic and
 * italic letters and cmmi's old-style digits read as their letters and
 * digits.
 *
 * Strict factory-only.
 *
 * @module fonts/encodings/texMath
 */

export const encodingTexMath = {
    name: 'encodingTexMath',
    dependencies: [],
    factory() {
        /**
         * A frozen 128-position layout from `map` (code → text), the
         * letters and digits of `ranges` ([first code, first character,
         * count]) at their codes.
         *
         * @param {Record<number, string>} map
         * @param {Array<[number, number, number]>} ranges
         * @returns {ReadonlyArray<string|null>}
         */
        function layout(map, ranges) {
            const a = new Array(128).fill(null);
            for (const [first, ch, n] of ranges) {
                for (let i = 0; i < n; i++) a[first + i] = String.fromCharCode(ch + i);
            }
            for (const k in map) a[k | 0] = map[k];
            return Object.freeze(a);
        }

        // cmsy10 — math symbols.
        const OMS = layout({
            0x00: '−', 0x01: '·', 0x02: '×', 0x03: '∗',
            0x04: '÷', 0x05: '⋄', 0x06: '±', 0x07: '∓',
            0x08: '⊕', 0x09: '⊖', 0x0A: '⊗', 0x0B: '⊘',
            0x0C: '⊙', 0x0D: '◯', 0x0E: '∘', 0x0F: '∙',
            0x10: '≍', 0x11: '≡', 0x12: '⊆', 0x13: '⊇',
            0x14: '≤', 0x15: '≥', 0x16: '⪯', 0x17: '⪰',
            0x18: '∼', 0x19: '≈', 0x1A: '⊂', 0x1B: '⊃',
            0x1C: '≪', 0x1D: '≫', 0x1E: '≺', 0x1F: '≻',
            0x20: '←', 0x21: '→', 0x22: '↑', 0x23: '↓',
            0x24: '↔', 0x25: '↗', 0x26: '↘', 0x27: '≃',
            0x28: '⇐', 0x29: '⇒', 0x2A: '⇑', 0x2B: '⇓',
            0x2C: '⇔', 0x2D: '↖', 0x2E: '↙', 0x2F: '∝',
            0x30: '′', 0x31: '∞', 0x32: '∈', 0x33: '∋',
            0x34: '△', 0x35: '▽',
            // 0x36 negationslash and 0x37 mapsto are overlays: null.
            0x38: '∀', 0x39: '∃', 0x3A: '¬', 0x3B: '∅',
            0x3C: 'ℜ', 0x3D: 'ℑ', 0x3E: '⊤', 0x3F: '⊥',
            0x40: 'ℵ',
            0x5B: '∪', 0x5C: '∩', 0x5D: '⊎', 0x5E: '∧',
            0x5F: '∨', 0x60: '⊢', 0x61: '⊣', 0x62: '⌊',
            0x63: '⌋', 0x64: '⌈', 0x65: '⌉', 0x66: '{',
            0x67: '}', 0x68: '⟨', 0x69: '⟩', 0x6A: '|',
            0x6B: '∥', 0x6C: '↕', 0x6D: '⇕', 0x6E: '\\',
            0x6F: '≀', 0x70: '√', 0x71: '⨿', 0x72: '∇',
            0x73: '∫', 0x74: '⊔', 0x75: '⊓', 0x76: '⊑',
            0x77: '⊒', 0x78: '§', 0x79: '†', 0x7A: '‡',
            0x7B: '¶', 0x7C: '♣', 0x7D: '♢', 0x7E: '♡',
            0x7F: '♠'
        }, [[0x41, 0x41, 26]]);

        // cmmi10 — math italic.
        const OML = layout({
            0x00: 'Γ', 0x01: 'Δ', 0x02: 'Θ', 0x03: 'Λ',
            0x04: 'Ξ', 0x05: 'Π', 0x06: 'Σ', 0x07: 'Υ',
            0x08: 'Φ', 0x09: 'Ψ', 0x0A: 'Ω', 0x0B: 'α',
            0x0C: 'β', 0x0D: 'γ', 0x0E: 'δ', 0x0F: 'ϵ',
            0x10: 'ζ', 0x11: 'η', 0x12: 'θ', 0x13: 'ι',
            0x14: 'κ', 0x15: 'λ', 0x16: 'μ', 0x17: 'ν',
            0x18: 'ξ', 0x19: 'π', 0x1A: 'ρ', 0x1B: 'σ',
            0x1C: 'τ', 0x1D: 'υ', 0x1E: 'ϕ', 0x1F: 'χ',
            0x20: 'ψ', 0x21: 'ω', 0x22: 'ε', 0x23: 'ϑ',
            0x24: 'ϖ', 0x25: 'ϱ', 0x26: 'ς', 0x27: 'φ',
            0x28: '↼', 0x29: '↽', 0x2A: '⇀', 0x2B: '⇁',
            // 0x2C and 0x2D, the hook pieces: null.
            0x2E: '▹', 0x2F: '◃',
            0x3A: '.', 0x3B: ',', 0x3C: '<', 0x3D: '/', 0x3E: '>', 0x3F: '⋆',
            0x40: '∂',
            0x5B: '♭', 0x5C: '♮', 0x5D: '♯', 0x5E: '⌣',
            0x5F: '⌢', 0x60: 'ℓ',
            0x7B: 'ı', 0x7C: 'ȷ', 0x7D: '℘'
            // 0x7E the vector accent and 0x7F the tie: null.
        }, [[0x30, 0x30, 10], [0x41, 0x41, 26], [0x61, 0x61, 26]]);

        // cmex10 — math extension: the sized delimiters and the large
        // operators; every assembly piece and wide accent is null.
        const OMX = layout({
            // big
            0x00: '(', 0x01: ')', 0x02: '[', 0x03: ']', 0x04: '⌊', 0x05: '⌋',
            0x06: '⌈', 0x07: '⌉', 0x08: '{', 0x09: '}', 0x0A: '⟨', 0x0B: '⟩',
            0x0E: '/', 0x0F: '\\',
            // Big, bigg
            0x10: '(', 0x11: ')', 0x12: '(', 0x13: ')', 0x14: '[', 0x15: ']',
            0x16: '⌊', 0x17: '⌋', 0x18: '⌈', 0x19: '⌉', 0x1A: '{', 0x1B: '}',
            0x1C: '⟨', 0x1D: '⟩', 0x1E: '/', 0x1F: '\\',
            // Bigg
            0x20: '(', 0x21: ')', 0x22: '[', 0x23: ']', 0x24: '⌊', 0x25: '⌋',
            0x26: '⌈', 0x27: '⌉', 0x28: '{', 0x29: '}', 0x2A: '⟨', 0x2B: '⟩',
            0x2C: '/', 0x2D: '\\', 0x2E: '/', 0x2F: '\\',
            0x44: '⟨', 0x45: '⟩',
            // large operators, text and display sizes
            0x46: '⨆', 0x47: '⨆', 0x48: '∮', 0x49: '∮',
            0x4A: '⨀', 0x4B: '⨀', 0x4C: '⨁', 0x4D: '⨁',
            0x4E: '⨂', 0x4F: '⨂',
            0x50: '∑', 0x51: '∏', 0x52: '∫', 0x53: '⋃',
            0x54: '⋂', 0x55: '⨄', 0x56: '⋀', 0x57: '⋁',
            0x58: '∑', 0x59: '∏', 0x5A: '∫', 0x5B: '⋃',
            0x5C: '⋂', 0x5D: '⨄', 0x5E: '⋀', 0x5F: '⋁',
            0x60: '∐', 0x61: '∐',
            // Big brackets, floors, ceilings, braces; the radicals
            0x68: '[', 0x69: ']', 0x6A: '⌊', 0x6B: '⌋', 0x6C: '⌈',
            0x6D: '⌉', 0x6E: '{', 0x6F: '}',
            0x70: '√', 0x71: '√', 0x72: '√', 0x73: '√'
        }, []);

        const LAYOUTS = Object.freeze({ OMS, OML, OMX });

        /**
         * The text at `code` in `layout` (`'OMS'`, `'OML'`, `'OMX'`), or
         * `null`: no character of its own, a code past 127, or another
         * layout name.
         *
         * @param {string} name
         * @param {number} code
         * @returns {string|null}
         */
        function text(name, code) {
            const t = Object.hasOwn(LAYOUTS, name) ? LAYOUTS[name] : null;
            if (!t || !Number.isInteger(code) || code < 0 || code >= t.length) return null;
            return t[code];
        }

        return { OMS, OML, OMX, text };
    }
};
