// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/password.test.ts — unit tests for the password-file rule
 * (`./password.ts`) shared by the CLI `--password-file` flag and the MCP
 * `pdfPasswordPath` argument.
 */

import { describe, expect, test } from 'bun:test';
import { passwordFromFile } from './password.ts';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('passwordFromFile', () => {
    test('drops one trailing \\n or \\r\\n', () => {
        expect(text(passwordFromFile(bytes('user\n')))).toBe('user');
        expect(text(passwordFromFile(bytes('user\r\n')))).toBe('user');
    });

    test('keeps everything else: no break, a second break, a lone \\r, spaces', () => {
        expect(text(passwordFromFile(bytes('user')))).toBe('user');
        expect(text(passwordFromFile(bytes('user\n\n')))).toBe('user\n');
        expect(text(passwordFromFile(bytes('user\r')))).toBe('user\r');
        expect(text(passwordFromFile(bytes(' us er ')))).toBe(' us er ');
        expect(passwordFromFile(bytes('\n')).length).toBe(0);
        expect(passwordFromFile(new Uint8Array(0)).length).toBe(0);
    });
});
