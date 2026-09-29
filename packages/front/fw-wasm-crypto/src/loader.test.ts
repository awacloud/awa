// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * loader.test.ts — unit tests for the fw⇄dist/*.wasm loader seam.
 *
 * Toolchain-free: drives the loader through its injectable `fetchBytes` seam
 * with a pinned hand-assembled wasm fixture (`_fixtures/abi-min.wasm.bin`) and
 * a crafted import-declaring module (inline base64). No clang, no real crypto.
 */
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    loadWasmModule,
    selectVariant,
    supportsSimd,
    resolveDistUrl,
} from './loader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '_fixtures', 'abi-min.wasm.bin');

/** The pinned valid fixture: exports memory/alloc/free/aead_seal, zero imports. */
const ABI_MIN = new Uint8Array(readFileSync(FIXTURE));

/** A crafted module that DECLARES an import (env.host) yet exports the ABI triple. */
const IMPORT_PRESENT = Uint8Array.from(
    atob(
        'AGFzbQEAAAABDQNgAX8Bf2ABfwBgAAACDAEDZW52BGhvc3QAAgMEAwABAAUDAQABByUEBm1lbW9yeQIABWFsbG9jAAEEZnJlZQACCWFlYWRfc2VhbAADCg4DBABBAAsCAAsEACAACw==',
    ),
    (c) => c.charCodeAt(0),
);

/** fetchBytes seam returning fixed bytes regardless of module/variant. */
const give = (bytes: Uint8Array) => async () => bytes;

describe('loadWasmModule', () => {
    it('resolves to a handle exposing the ABI triple + the declared export', async () => {
        const handle = await loadWasmModule('abi-min', ['aead_seal'], {
            variant: 'scalar',
            fetchBytes: give(ABI_MIN),
        });
        expect(handle.memory).toBeInstanceOf(WebAssembly.Memory);
        expect(typeof handle.alloc).toBe('function');
        expect(typeof handle.free).toBe('function');
        expect(typeof handle.exports.aead_seal).toBe('function');
        expect(handle.variant).toBe('scalar');
        expect(handle.instance).toBeInstanceOf(WebAssembly.Instance);
        // stub aead_seal returns its i32 arg
        expect((handle.exports.aead_seal as (n: number) => number)(42)).toBe(42);
    });

    it('throws a descriptive error when a required export is missing', async () => {
        await expect(
            loadWasmModule('abi-min', ['does_not_exist'], {
                variant: 'scalar',
                fetchBytes: give(ABI_MIN),
            }),
        ).rejects.toThrow(/does_not_exist/);
    });

    it('rejects a module that declares any import (zero-import invariant)', async () => {
        await expect(
            loadWasmModule('abi-min', ['aead_seal'], {
                variant: 'scalar',
                fetchBytes: give(IMPORT_PRESENT),
            }),
        ).rejects.toThrow(/zero-import/);
    });
});

describe('selectVariant', () => {
    it('returns the forced variant when opts.variant is given', () => {
        expect(selectVariant({ variant: 'simd' })).toBe('simd');
        expect(selectVariant({ variant: 'scalar' })).toBe('scalar');
    });

    it('falls back to simd/scalar per supportsSimd() when not forced', () => {
        const expected = supportsSimd() ? 'simd' : 'scalar';
        expect(selectVariant()).toBe(expected);
        expect(selectVariant({})).toBe(expected);
    });
});

describe('resolveDistUrl', () => {
    it('returns a URL ending in dist/<module>.<variant>.wasm against the package', () => {
        const url = resolveDistUrl('chacha20poly1305', 'scalar');
        expect(url).toBeInstanceOf(URL);
        expect(url.href.endsWith('dist/chacha20poly1305.scalar.wasm')).toBe(true);
        // resolved relative to the package's src/ (one dir up to dist/)
        expect(url.href).toContain('/dist/');
    });
});

describe('supportsSimd', () => {
    it('returns a boolean and is memoized (stable across calls)', () => {
        const a = supportsSimd();
        const b = supportsSimd();
        expect(typeof a).toBe('boolean');
        expect(a).toBe(b);
    });
});

describe('loader source — banned synchronous WebAssembly constructors', () => {
    it('contains no synchronous new WebAssembly.Instance / new WebAssembly.Module', () => {
        const src = readFileSync(join(HERE, 'loader.js'), 'utf8');
        expect(/new\s+WebAssembly\.Instance\b/.test(src)).toBe(false);
        expect(/new\s+WebAssembly\.Module\b/.test(src)).toBe(false);
        // positive control: the async instantiate IS used
        expect(src.includes('WebAssembly.instantiate')).toBe(true);
    });
});
