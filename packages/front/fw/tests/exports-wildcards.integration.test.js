// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The fw `exports` map, beyond the `./core/*` twins of
 * `exports-map.integration.test.js`: the area wildcards, the assets they
 * carry, the private test paths, the `.js` twins of `./typed` and
 * `./sanity/*`, and the `./eslint` rule.
 *
 * Two gates: (1) the DECLARED map through Node's own subpath rules — an
 * exact key wins, else the `*` key with the longest prefix, then the longer
 * key (`PATTERN_KEY_COMPARE`); (2) a real `node` subprocess whose
 * `import.meta.resolve` URL must name a file that exists. Bun's resolver
 * falls back permissively (it adds extensions, it ignores unmatched keys),
 * so it is never the evidence here.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const EXPORTS = pkg.exports;

/** Node's PACKAGE_EXPORTS_RESOLVE over the declared map: the target string, `null`, or `undefined` (no key). */
function resolveDeclared(subpath, condition = 'default') {
    let target;
    if (Object.prototype.hasOwnProperty.call(EXPORTS, subpath)) {
        target = EXPORTS[subpath];
        return pick(target, condition, null);
    }
    let bestKey = null;
    for (const key of Object.keys(EXPORTS)) {
        const star = key.indexOf('*');
        if (star === -1) continue;
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix) || subpath.length < key.length) continue;
        if (bestKey === null) { bestKey = key; continue; }
        const bp = bestKey.indexOf('*');
        if (star > bp || (star === bp && key.length > bestKey.length)) bestKey = key;
    }
    if (bestKey === null) return undefined;
    const star = bestKey.indexOf('*');
    const match = subpath.slice(star, subpath.length - (bestKey.length - star - 1));
    return pick(EXPORTS[bestKey], condition, match);
}

function pick(target, condition, match) {
    if (target === null) return null;
    let t = typeof target === 'string' ? target : (target[condition] ?? target.default);
    if (t === undefined) return undefined;
    if (match !== null) t = t.split('*').join(match);
    return t;
}

const NODE_OK = spawnSync('node', ['--version'], { encoding: 'utf8' }).status === 0;

/** specifier → absolute path, or the thrown error code, in one node subprocess. */
function nodeResolve(specifiers) {
    const script = `
        import { fileURLToPath } from 'node:url';
        const out = {};
        for (const s of ${JSON.stringify(specifiers)}) {
            try { out[s] = fileURLToPath(import.meta.resolve(s)); }
            catch (e) { out[s] = 'ERR:' + (e.code || 'THROW'); }
        }
        console.log(JSON.stringify(out));
    `;
    const res = spawnSync('node', ['--input-type=module', '-e', script], { cwd: PKG, encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`node exited ${res.status}: ${res.stderr}`);
    return JSON.parse(res.stdout.trim().split('\n').pop());
}

const AREA_MODULES = {
    '@awacloud/fw/io/codec/hex': 'src/io/codec/hex.js',
    '@awacloud/fw/io/compress/zlib': 'src/io/compress/zlib.js',
    '@awacloud/fw/dom/rendering/sanitize': 'src/dom/rendering/sanitize.js',
    '@awacloud/fw/crypto/utils/asn1': 'src/crypto/utils/asn1.js',
    '@awacloud/fw/crypto/pkc/hybridKem': 'src/crypto/pkc/hybridKem.js',
    '@awacloud/fw/process/rpc': 'src/process/rpc.js',
};
const ASSETS = {
    '@awacloud/fw/io/compress/brotli_dict.bin': 'src/io/compress/brotli_dict.bin',
};
const PRIVATE = [
    '@awacloud/fw/io/codec/hex.test.js', '@awacloud/fw/io/codec/hex.test',
    '@awacloud/fw/dom/rendering/template.test.js', '@awacloud/fw/process/rpc.test',
    '@awacloud/fw/crypto/pkc/ml_dsa.kat.js', '@awacloud/fw/crypto/pkc/ml_dsa.kat',
    '@awacloud/fw/crypto/hash/sha256.test.js', '@awacloud/fw/crypto/NIST_CONFORMANCE.md',
    '@awacloud/fw/crypto/hash/sha256.reference.js', '@awacloud/fw/crypto/hash/sha256.reference',
];
const TWINS = {
    './typed': './typed.js',
    './sanity/base': './sanity/base.js',
    './sanity/community': './sanity/community.js',
    './sanity/lockdown': './sanity/lockdown.js',
    './sanity/lockdown.apply': './sanity/lockdown-apply.js',
};

describe('area wildcards target the .js file, both spellings', () => {
    for (const [spec, file] of Object.entries(AREA_MODULES)) {
        test(spec, () => {
            const sub = '.' + spec.slice('@awacloud/fw'.length);
            expect(resolveDeclared(sub)).toBe('./' + file);
            expect(resolveDeclared(sub + '.js')).toBe('./' + file);
            expect(existsSync(join(PKG, file))).toBe(true);
            const types = resolveDeclared(sub, 'types');
            expect(types).toBe('./dist/types/' + file.slice('src/'.length).replace(/\.js$/, '.d.ts'));
        });
    }

    test('the assets keep their own door', () => {
        for (const [spec, file] of Object.entries(ASSETS)) {
            expect(resolveDeclared('.' + spec.slice('@awacloud/fw'.length))).toBe('./' + file);
            expect(existsSync(join(PKG, file))).toBe(true);
        }
        expect(resolveDeclared('./crypto/wasm/sha256.scalar.wasm')).toBe('./src/crypto/wasm/sha256.scalar.wasm');
    });

    test('test, KAT and markdown sources are private', () => {
        for (const spec of PRIVATE) {
            const sub = '.' + spec.slice('@awacloud/fw'.length);
            const t = resolveDeclared(sub);
            expect(t === null || t === undefined, `${spec} → ${t}`).toBe(true);
        }
    });

    test('the *.reference null keys exist for the four areas', () => {
        for (const area of ['io', 'dom', 'crypto', 'process']) {
            expect(EXPORTS[`./${area}/*.reference.js`], area).toBeNull();
            expect(EXPORTS[`./${area}/*.reference`], area).toBeNull();
        }
    });

    test.if(NODE_OK)('real node: modules and assets resolve to existing files; private paths are not exported', () => {
        const r = nodeResolve([...Object.keys(AREA_MODULES), ...Object.keys(AREA_MODULES).map((s) => s + '.js'), ...Object.keys(ASSETS), ...PRIVATE]);
        for (const [spec, file] of Object.entries({ ...AREA_MODULES, ...ASSETS })) {
            expect(r[spec], spec).toBe(join(PKG, file));
            expect(existsSync(r[spec]), spec).toBe(true);
        }
        for (const spec of Object.keys(AREA_MODULES)) expect(r[spec + '.js']).toBe(r[spec]);
        for (const spec of PRIVATE) expect(r[spec], spec).toBe('ERR:ERR_PACKAGE_PATH_NOT_EXPORTED');
    });
});

describe('.js twins and types of ./typed and ./sanity/*', () => {
    for (const [key, twin] of Object.entries(TWINS)) {
        test(`${twin} targets what ${key} targets, with types`, () => {
            expect(EXPORTS[twin]).toEqual(EXPORTS[key]);
            expect(typeof EXPORTS[key].types).toBe('string');
            expect(existsSync(join(PKG, EXPORTS[key].default))).toBe(true);
        });
    }

    test.if(NODE_OK)('real node resolves every twin to its sibling', () => {
        const specs = Object.entries(TWINS).flatMap(([k, t]) => ['@awacloud/fw' + k.slice(1), '@awacloud/fw' + t.slice(1)]);
        const r = nodeResolve(specs);
        for (const [k, t] of Object.entries(TWINS)) {
            expect(r['@awacloud/fw' + t.slice(1)]).toBe(r['@awacloud/fw' + k.slice(1)]);
            expect(existsSync(r['@awacloud/fw' + k.slice(1)])).toBe(true);
        }
    });
});

describe('./eslint', () => {
    test('exports the fw/no-factory-capture rule, usable as a flat-config plugin', async () => {
        expect(EXPORTS['./eslint']).toEqual({ default: './integrations/eslint/no-factory-capture.js' });
        const fw = (await import(join(PKG, 'integrations', 'eslint', 'no-factory-capture.js'))).default;
        const { Linter } = await import('eslint');
        const linter = new Linter({ configType: 'flat' });
        const config = [{
            languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
            plugins: { fw },
            rules: { 'fw/no-factory-capture': 'error' },
        }];
        const capturing = "const SECRET = 1;\nexport const m = { name: 'm', dependencies: [], factory() { return SECRET; } };\n";
        const clean = "export const m = { name: 'm', dependencies: [], factory() { const SECRET = 1; return SECRET; } };\n";
        const bad = linter.verify(capturing, config);
        expect(bad.map((x) => x.ruleId)).toEqual(['fw/no-factory-capture']);
        expect(linter.verify(clean, config)).toEqual([]);
    });
});

describe('every declared target exists (build outputs named)', () => {
    const BUILD = (t) => t.startsWith('./dist/');
    test('non-wildcard keys', () => {
        const missing = [];
        for (const [key, v] of Object.entries(EXPORTS)) {
            if (key.includes('*') || v === null) continue;
            for (const t of typeof v === 'string' ? [v] : Object.values(v)) {
                if (!BUILD(t) && !existsSync(join(PKG, t))) missing.push(`${key} → ${t}`);
            }
        }
        expect(missing).toEqual([]);
    });
});
