// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview OpenType `Tag` — 4-char ASCII identifier packed into a
 * 32-bit big-endian unsigned integer.
 *
 * Tags such as `'head'`, `'glyf'`, `'OS/2'`, `'cvt '` (note the
 * trailing space) appear in the SFNT table directory, GSUB / GPOS
 * feature & script lists, fvar axes, …
 *
 * `tag('head')` → `0x68656164`
 * `untag(0x68656164)` → `'head'`
 *
 * Strict factory body — top-level shims removed. Resolve `fontTag`
 * through your runtime.
 *
 * @module fonts/primitives/tag
 */

import { fontErrors } from '../errors.js';

export const fontTag = {
    name: 'fontTag',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        // Strict factory body — fully self-contained, no top-level closures.
        const { ContractError } = errors;
        function tag(s) {
            if (typeof s !== 'string' || s.length !== 4)
                throw new ContractError('fonts/bad-tag', 'tag must be a 4-char string', { context: { value: s } });
            return ((s.charCodeAt(0) & 0xFF) << 24
                |   (s.charCodeAt(1) & 0xFF) << 16
                |   (s.charCodeAt(2) & 0xFF) << 8
                |   (s.charCodeAt(3) & 0xFF)) >>> 0;
        }
        function untag(u32) {
            return String.fromCharCode(
                (u32 >>> 24) & 0xFF,
                (u32 >>> 16) & 0xFF,
                (u32 >>>  8) & 0xFF,
                u32 & 0xFF
            );
        }
        function tagEquals(a, b) {
            const ta = typeof a === 'string' ? tag(a) : a >>> 0;
            const tb = typeof b === 'string' ? tag(b) : b >>> 0;
            return ta === tb;
        }
        return { tag, untag, tagEquals };
    }
};
