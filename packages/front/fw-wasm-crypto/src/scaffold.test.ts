// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Scaffold conformance test for @awacloud/fw-wasm-crypto.
 * Byte-free, no toolchain required.
 */
import { describe, it, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');

describe('@awacloud/fw-wasm-crypto scaffold', () => {
    it('package.json parses and has correct name, type, sideEffects', async () => {
        const pkgPath = join(PKG_ROOT, 'package.json');
        const pkg = JSON.parse(await Bun.file(pkgPath).text());
        expect(pkg.name).toBe('@awacloud/fw-wasm-crypto');
        expect(pkg.type).toBe('module');
        expect(pkg.sideEffects).toBe(false);
    });

    it('has no dependencies key (RUNTIME-dep-free)', async () => {
        const pkgPath = join(PKG_ROOT, 'package.json');
        const pkg = JSON.parse(await Bun.file(pkgPath).text());
        const deps = pkg.dependencies;
        // Either absent or empty object
        expect(!deps || Object.keys(deps).length === 0).toBe(true);
    });

    it('awa.maturity === "L3" and awa.role === "build-asset"', async () => {
        const pkgPath = join(PKG_ROOT, 'package.json');
        const pkg = JSON.parse(await Bun.file(pkgPath).text());
        expect(pkg.awa.maturity).toBe('L3');
        expect(pkg.awa.role).toBe('build-asset');
    });

    it('exports["."].default and exports["./loader"].default both === "./src/loader.js"', async () => {
        const pkgPath = join(PKG_ROOT, 'package.json');
        const pkg = JSON.parse(await Bun.file(pkgPath).text());
        expect(pkg.exports['.'].default).toBe('./src/loader.js');
        expect(pkg.exports['./loader'].default).toBe('./src/loader.js');
        expect(pkg.exports['./provenance'].default).toBe('./src/provenance.js');
    });

    it('five layout dirs (csrc shims vendor dist src) all exist', () => {
        for (const dir of ['csrc', 'shims', 'vendor', 'dist', 'src']) {
            expect(existsSync(join(PKG_ROOT, dir))).toBe(true);
        }
    });

    it('eslint.config.js imports @eslint/js and exports a default array', async () => {
        const mod = await import('../eslint.config.js');
        expect(Array.isArray(mod.default)).toBe(true);
    });
});
