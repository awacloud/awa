// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { ModuleRuntime, runtimeSource } from './runtime.js';
// Real module, used by the leaf-swap test to exercise the never-swap rationale
// against the actual per-factory-instance tracking rather than a stand-in.
import { signal } from '../io/utils/signal.js';

const mod = (name, version, deps = [], factory = function() { return { name, version }; }, type) => ({
    name,
    ...(version !== undefined ? { version } : {}),
    ...(type !== undefined ? { type } : {}),
    dependencies: deps,
    factory
});

describe('ModuleRuntime', () => {
    let rt;
    beforeEach(() => { rt = new ModuleRuntime(); });

    describe('register - validation', () => {
        test('throws when name is missing', () => {
            expect(() => rt.register({ factory: () => 1 })).toThrow('Invalid module definition');
        });

        test('throws when factory is missing', () => {
            expect(() => rt.register({ name: 'foo' })).toThrow('Invalid module definition');
        });

        test('throws when module is null/undefined', () => {
            expect(() => rt.register(null)).toThrow();
            expect(() => rt.register(undefined)).toThrow();
        });

        test('accepts module without version (defaults to 0.0.0)', () => {
            rt.register({ name: 'foo', factory: () => 1, dependencies: [] });
            expect(rt.has('foo')).toBe(true);
            expect(rt.has('foo', '0.0.0')).toBe(true);
        });

        test('throws on invalid semver version', () => {
            const cases = ['1.0', 'v1.0.0', '1.x.0', '1.0.0.0', 'abc', '01.0.0'];
            for (const v of cases) {
                expect(() => rt.register(mod('foo', v))).toThrow(/Invalid version/);
            }
        });

        test('accepts valid semver versions including pre-release/build', () => {
            const cases = ['0.0.0', '1.0.0', '1.2.3', '10.20.30', '1.0.0-beta', '1.0.0-beta.1', '1.0.0+build.1', '1.0.0-rc.1+exp.sha.5114f85'];
            for (const v of cases) {
                expect(() => rt.register(mod('m_' + v.replace(/\W/g, '_'), v))).not.toThrow();
            }
        });

        test('throws on invalid type', () => {
            const cases = ['app', 'fw', 'foo.bar', 'FW.io', 'fw.', 'fw.IO'];
            for (const t of cases) {
                expect(() => rt.register(mod('m', '1.0.0', [], () => 1, t))).toThrow(/Invalid type/);
            }
        });

        test('accepts valid types', () => {
            const cases = [
                'fw.io.codec', 'fw.dom.query',
                'sd.lib', 'sd.core',                    // shared SDE/SDC
                'sde.core', 'sde.ui', 'sde.auth',
                'sdc.core', 'sdc.lib', 'sdc.sys',
                'lib.video_codec'
            ];
            for (const t of cases) {
                expect(() => rt.register(mod('m_' + t.replace(/\W/g, '_'), '1.0.0', [], () => 1, t))).not.toThrow();
            }
        });

        test('accepts module without type', () => {
            expect(() => rt.register(mod('foo', '1.0.0'))).not.toThrow();
        });

        test('returns this for chaining', () => {
            const r = rt.register(mod('a', '1.0.0'));
            expect(r).toBe(rt);
        });
    });

    describe('registerAll', () => {
        test('registers an array of modules', () => {
            const r = rt.registerAll([
                mod('a', '1.0.0', [], () => 'A'),
                mod('b', '1.0.0', [], () => 'B'),
                mod('c', '1.0.0', [], () => 'C'),
            ]);
            expect(rt.has('a')).toBe(true);
            expect(rt.has('b')).toBe(true);
            expect(rt.has('c')).toBe(true);
            expect(rt.resolve('a')).toBe('A');
            expect(r).toBe(rt);
        });

        test('accepts empty array (no-op, chainable)', () => {
            const r = rt.registerAll([]);
            expect(r).toBe(rt);
            expect(rt.modules.size).toBe(0);
        });

        test('chainable with register()', () => {
            const r = rt
                .registerAll([mod('a', '1.0.0', [], () => 'A')])
                .register(mod('b', '1.0.0', [], () => 'B'))
                .registerAll([mod('c', '1.0.0', [], () => 'C')]);
            expect(r).toBe(rt);
            expect(rt.has('a')).toBe(true);
            expect(rt.has('b')).toBe(true);
            expect(rt.has('c')).toBe(true);
        });
    });

    describe('multi-version', () => {
        test('two versions of same name coexist', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            expect(rt.has('foo', '1.0.0')).toBe(true);
            expect(rt.has('foo', '2.0.0')).toBe(true);
        });

        test('resolve(name) returns highest version', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            expect(rt.resolve('foo')).toBe('v2');
        });

        test('resolve(name, {version}) returns exact version', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            expect(rt.resolve('foo', { version: '1.0.0' })).toBe('v1');
            expect(rt.resolve('foo', { version: '2.0.0' })).toBe('v2');
        });

        test('resolve("name@version") returns exact version', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            expect(rt.resolve('foo@1.0.0')).toBe('v1');
            expect(rt.resolve('foo@2.0.0')).toBe('v2');
        });

        test('latest tracking is stable when registering older versions', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            rt.register(mod('foo', '1.5.0', [], () => 'v15'));
            expect(rt.resolve('foo')).toBe('v2');
        });

        test('latest tracking handles 1.10 > 1.2 (numeric)', () => {
            rt.register(mod('foo', '1.2.0', [], () => 'v12'));
            rt.register(mod('foo', '1.10.0', [], () => 'v110'));
            expect(rt.resolve('foo')).toBe('v110');
        });

        test('pre-release sorts below release', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '1.0.0-beta', [], () => 'beta'));
            expect(rt.resolve('foo')).toBe('v1');
        });

        test('pre-release alphabetical ordering', () => {
            rt.register(mod('foo', '1.0.0-alpha', [], () => 'alpha'));
            rt.register(mod('foo', '1.0.0-beta', [], () => 'beta'));
            expect(rt.resolve('foo')).toBe('beta');
        });

        test('overwriting same (name, version) replaces def', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'old'));
            rt.register(mod('foo', '1.0.0', [], () => 'new'));
            expect(rt.resolve('foo@1.0.0')).toBe('new');
        });

        test('throws when resolving unknown version', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            expect(() => rt.resolve('foo@9.9.9')).toThrow(/Module not found: foo@9\.9\.9/);
        });

        test('throws when resolving unknown name', () => {
            expect(() => rt.resolve('bar')).toThrow(/Module not found: bar/);
        });
    });

    describe('singleton vs isolation', () => {
        test('singleton cache by (name, version)', () => {
            let c = 0;
            rt.register(mod('foo', '1.0.0', [], () => ({ id: ++c })));
            const a = rt.resolve('foo');
            const b = rt.resolve('foo');
            expect(a).toBe(b);
            expect(c).toBe(1);
        });

        test('two versions get two distinct singletons', () => {
            rt.register(mod('foo', '1.0.0', [], () => ({ v: 1 })));
            rt.register(mod('foo', '2.0.0', [], () => ({ v: 2 })));
            const v1 = rt.resolve('foo@1.0.0');
            const v2 = rt.resolve('foo@2.0.0');
            expect(v1).not.toBe(v2);
            expect(rt.resolve('foo@1.0.0')).toBe(v1);
            expect(rt.resolve('foo@2.0.0')).toBe(v2);
        });

        test('isolation creates fresh instance every call', () => {
            let c = 0;
            rt.register(mod('foo', '1.0.0', [], () => ({ id: ++c })));
            const a = rt.resolve('foo', { isolation: true });
            const b = rt.resolve('foo', { isolation: true });
            expect(a).not.toBe(b);
            expect(c).toBe(2);
        });

        test('isolation does not pollute the global cache', () => {
            let c = 0;
            rt.register(mod('foo', '1.0.0', [], () => ({ id: ++c })));
            rt.resolve('foo', { isolation: true });
            const cached = rt.resolve('foo');
            expect(cached.id).toBe(2);
            expect(rt.resolve('foo')).toBe(cached);
        });

        test('custom instances Map keys by canonical name@version', () => {
            rt.register(mod('foo', '1.0.0', [], () => ({ tag: 'A' })));
            const m = new Map();
            const a = rt.resolve('foo', { instances: m });
            const b = rt.resolve('foo', { instances: m });
            expect(a).toBe(b);
            expect(m.has('foo@1.0.0')).toBe(true);
        });

        test('separate custom maps yield separate instances', () => {
            rt.register(mod('foo', '1.0.0', [], () => ({})));
            const a = rt.resolve('foo', { instances: new Map() });
            const b = rt.resolve('foo', { instances: new Map() });
            expect(a).not.toBe(b);
        });
    });

    describe('dependencies', () => {
        test('resolves dependencies bareback (latest)', () => {
            rt.register(mod('a', '1.0.0', [], () => 'A'));
            rt.register(mod('b', '1.0.0', ['a'], (a) => 'B-of-' + a));
            expect(rt.resolve('b')).toBe('B-of-A');
        });

        test('dependencies referencing exact name@version', () => {
            rt.register(mod('a', '1.0.0', [], () => 'A1'));
            rt.register(mod('a', '2.0.0', [], () => 'A2'));
            rt.register(mod('b', '1.0.0', ['a@1.0.0'], (a) => 'B+' + a));
            expect(rt.resolve('b')).toBe('B+A1');
        });

        test('dependencies bareback resolve to latest of that name', () => {
            rt.register(mod('a', '1.0.0', [], () => 'A1'));
            rt.register(mod('a', '2.0.0', [], () => 'A2'));
            rt.register(mod('b', '1.0.0', ['a'], (a) => 'B+' + a));
            expect(rt.resolve('b')).toBe('B+A2');
        });

        test('mixed dependencies', () => {
            rt.register(mod('a', '1.0.0', [], () => 'A1'));
            rt.register(mod('a', '2.0.0', [], () => 'A2'));
            rt.register(mod('c', '1.0.0', [], () => 'C'));
            rt.register(mod('b', '1.0.0', ['a@1.0.0', 'c'], (a, c) => `${a}|${c}`));
            expect(rt.resolve('b')).toBe('A1|C');
        });

        test('factory args are in dependencies order', () => {
            rt.register(mod('x', '1.0.0', [], () => 'X'));
            rt.register(mod('y', '1.0.0', [], () => 'Y'));
            rt.register(mod('z', '1.0.0', ['y', 'x'], (y, x) => y + x));
            expect(rt.resolve('z')).toBe('YX');
        });
    });

    describe('list', () => {
        beforeEach(() => {
            rt.register(mod('hex', '1.0.0', [], () => 1, 'fw.io.codec'));
            rt.register(mod('hex', '2.0.0', [], () => 1, 'fw.io.codec'));
            rt.register(mod('utf8', '1.0.0', [], () => 1, 'fw.io.codec'));
            rt.register(mod('dom', '1.0.0', [], () => 1, 'fw.dom.query'));
            rt.register(mod('window', '1.0.0', [], () => 1, 'sde.ui'));
            rt.register(mod('manifest', '1.0.0', [], () => 1, 'sd.lib'));
            rt.register(mod('container', '1.0.0', [], () => 1, 'sdc.core'));
            rt.register(mod('untyped', '1.0.0', [], () => 1));
        });

        test('no filter returns all defs (including all versions)', () => {
            const all = rt.list();
            expect(all.length).toBe(8);
        });

        test('filter by name', () => {
            const r = rt.list({ name: 'hex' });
            expect(r.length).toBe(2);
            expect(r.every(d => d.name === 'hex')).toBe(true);
        });

        test('filter by version', () => {
            const r = rt.list({ version: '1.0.0' });
            expect(r.length).toBe(7);
            expect(r.every(d => (d.version || '0.0.0') === '1.0.0')).toBe(true);
        });

        test('filter by exact type', () => {
            const r = rt.list({ type: 'fw.io.codec' });
            expect(r.length).toBe(3);
            expect(r.every(d => d.type === 'fw.io.codec')).toBe(true);
        });

        test('filter by type prefix (trailing dot)', () => {
            const r = rt.list({ type: 'fw.' });
            expect(r.length).toBe(4); // hex×2 + utf8 + dom
            expect(r.every(d => d.type.startsWith('fw.'))).toBe(true);
        });

        test('filter by sde. prefix', () => {
            const r = rt.list({ type: 'sde.' });
            expect(r.length).toBe(1);
            expect(r[0].name).toBe('window');
        });

        test('filter by sd. prefix (shared)', () => {
            const r = rt.list({ type: 'sd.' });
            expect(r.length).toBe(1);
            expect(r[0].name).toBe('manifest');
        });

        test('filter by sdc. prefix', () => {
            const r = rt.list({ type: 'sdc.' });
            expect(r.length).toBe(1);
            expect(r[0].name).toBe('container');
        });

        test('combined filters', () => {
            const r = rt.list({ name: 'hex', version: '2.0.0' });
            expect(r.length).toBe(1);
            expect(r[0].version).toBe('2.0.0');
        });

        test('untyped modules excluded by type filter', () => {
            const r = rt.list({ type: 'fw.' });
            expect(r.find(d => d.name === 'untyped')).toBeUndefined();
        });
    });

    describe('snapshot (read-only registry view)', () => {
        // Byte-comparable fingerprint of the instance cache: name → versions
        // present. Used to prove `snapshot()` writes nothing into it.
        const cacheFingerprint = (r) => JSON.stringify(
            [...r.instances.entries()].map(([n, m]) => [n, [...m.keys()]])
        );

        beforeEach(() => {
            rt.register(mod('hex', '1.0.0', [], () => 1, 'fw.io.codec'));
            rt.register(mod('hex', '2.0.0', [], () => 1, 'fw.io.codec'));
            rt.register(mod('utf8', '1.0.0', ['hex'], () => 1, 'fw.io.codec'));
            rt.register(mod('dom', '1.0.0', [], () => 1, 'fw.dom.query'));
            rt.register(mod('untyped', undefined, [], () => 1));
        });

        test('enumerates every registered module, all versions', () => {
            const snap = rt.snapshot();
            expect(snap.length).toBe(5);
            expect(snap.map(e => `${e.name}@${e.version}`).sort()).toEqual([
                'dom@1.0.0', 'hex@1.0.0', 'hex@2.0.0', 'untyped@0.0.0', 'utf8@1.0.0',
            ]);
        });

        test('a newly registered module appears in the next snapshot', () => {
            expect(rt.snapshot().find(e => e.name === 'b64')).toBeUndefined();
            rt.register(mod('b64', '1.0.0', ['utf8'], () => 1, 'fw.io.codec'));
            const after = rt.snapshot();
            expect(after.length).toBe(6);
            const row = after.find(e => e.name === 'b64');
            expect(row.version).toBe('1.0.0');
            expect(row.dependencies).toEqual(['utf8']);
        });

        test('rows expose the declared dependency list', () => {
            const row = rt.snapshot({ name: 'utf8' })[0];
            expect(row.dependencies).toEqual(['hex']);
            expect(rt.snapshot({ name: 'dom' })[0].dependencies).toEqual([]);
        });

        test('version defaults to 0.0.0 and type is null when undeclared', () => {
            const row = rt.snapshot({ name: 'untyped' })[0];
            expect(row.version).toBe('0.0.0');
            expect(row.type).toBeNull();
        });

        test('latest flags exactly the version a version-less resolve would pick', () => {
            const hex = rt.snapshot({ name: 'hex' });
            expect(hex.length).toBe(2);
            expect(hex.filter(e => e.latest).map(e => e.version)).toEqual(['2.0.0']);
        });

        // --- instantiates nothing -------------------------------------------

        test('instantiates nothing: instance cache byte-identical before and after', () => {
            const before = cacheFingerprint(rt);
            expect(before).toBe('[]');
            rt.snapshot();
            rt.snapshot({ name: 'hex' });
            rt.snapshot({ type: 'fw.' });
            expect(cacheFingerprint(rt)).toBe(before);
            expect(rt.instances.size).toBe(0);
        });

        test('instantiates nothing: no factory is invoked', () => {
            let calls = 0;
            const r = new ModuleRuntime();
            r.register(mod('counted', '1.0.0', [], () => { calls++; return {}; }, 'fw.io.codec'));
            r.snapshot();
            expect(calls).toBe(0);
            // Control: the factory IS reachable — proves the 0 above is not vacuous.
            r.resolve('counted');
            expect(calls).toBe(1);
        });

        test('instantiated flag observes the cache without writing to it', () => {
            expect(rt.snapshot({ name: 'hex' }).every(e => e.instantiated === false)).toBe(true);
            expect(rt.instances.size).toBe(0);

            rt.resolve('hex@1.0.0');
            const after = cacheFingerprint(rt);
            const rows = rt.snapshot({ name: 'hex' });
            expect(rows.find(e => e.version === '1.0.0').instantiated).toBe(true);
            expect(rows.find(e => e.version === '2.0.0').instantiated).toBe(false);
            expect(cacheFingerprint(rt)).toBe(after);
        });

        // --- read-only ------------------------------------------------------

        test('the returned array and every row are frozen', () => {
            const snap = rt.snapshot();
            expect(Object.isFrozen(snap)).toBe(true);
            expect(snap.every(e => Object.isFrozen(e))).toBe(true);
            expect(snap.every(e => Object.isFrozen(e.dependencies))).toBe(true);
        });

        test('dependencies is a defensive copy, not the live registry array', () => {
            const live = rt.modules.get('utf8').versions.get('1.0.0').dependencies;
            const row = rt.snapshot({ name: 'utf8' })[0];
            expect(row.dependencies).toEqual(live);
            expect(row.dependencies).not.toBe(live);
        });

        test('mutating the returned structure cannot reach registry state', () => {
            const snap = rt.snapshot();
            const row = snap.find(e => e.name === 'utf8');

            expect(() => { snap.push({ name: 'injected' }); }).toThrow();
            expect(() => { row.name = 'hijacked'; }).toThrow();
            expect(() => { row.dependencies.push('evil'); }).toThrow();
            expect(() => { row.factory = () => 'pwned'; }).toThrow();

            // Assert on the REGISTRY afterwards, never on the copy.
            expect(rt.list().length).toBe(5);
            expect(rt.has('injected')).toBe(false);
            expect(rt.has('hijacked')).toBe(false);
            expect(rt.modules.get('utf8').versions.get('1.0.0').dependencies).toEqual(['hex']);
            expect(rt.resolve('utf8')).toBe(1);
            expect(rt.snapshot({ name: 'utf8' })[0].dependencies).toEqual(['hex']);
        });

        test('rows carry metadata only — no factory, deps or instance handle', () => {
            const row = rt.snapshot({ name: 'utf8' })[0];
            expect(Object.keys(row).sort()).toEqual([
                'dependencies', 'instantiated', 'latest', 'name', 'type', 'version',
            ]);
            expect(row.factory).toBeUndefined();
            expect(row.deps).toBeUndefined();
        });

        // --- filters (same contract as list) ---------------------------------

        test('filter by name / version / exact type / type prefix', () => {
            expect(rt.snapshot({ name: 'hex' }).length).toBe(2);
            expect(rt.snapshot({ version: '1.0.0' }).length).toBe(3);
            expect(rt.snapshot({ type: 'fw.io.codec' }).length).toBe(3);
            expect(rt.snapshot({ type: 'fw.' }).length).toBe(4);
            expect(rt.snapshot({ name: 'hex', version: '2.0.0' }).length).toBe(1);
        });

        test('untyped modules are excluded by a type filter', () => {
            expect(rt.snapshot({ type: 'fw.' }).find(e => e.name === 'untyped')).toBeUndefined();
        });

        test('empty registry yields a frozen empty array', () => {
            const empty = new ModuleRuntime().snapshot();
            expect(empty).toEqual([]);
            expect(Object.isFrozen(empty)).toBe(true);
        });
    });

    describe('invalidate (hot-swap instance eviction)', () => {

        // Instance-cache probe: reads `runtime.instances` DIRECTLY rather than
        // going through resolve(), which would re-instantiate whatever it finds
        // missing and destroy the very evidence under test.
        const cached = (runtime, name, version = '0.0.0') => {
            const versions = runtime.instances.get(name);
            return versions ? versions.get(version) : undefined;
        };

        describe('never-swap set', () => {
            test('is a frozen array pinned on the class, containing signal', () => {
                expect(Array.isArray(ModuleRuntime.NEVER_SWAP)).toBe(true);
                expect(ModuleRuntime.NEVER_SWAP).toContain('signal');
                expect(Object.isFrozen(ModuleRuntime.NEVER_SWAP)).toBe(true);
            });

            test('refuses a direct invalidate of a never-swap module', () => {
                rt.register(mod('signal', '1.0.0', [], () => ({ kind: 'signal' })));
                rt.resolve('signal');
                expect(() => rt.invalidate('signal'))
                    .toThrow(/"signal" is in the never-swap set/);
                // Refusal is atomic: the instance is still cached.
                expect(cached(rt, 'signal', '1.0.0')).toEqual({ kind: 'signal' });
            });

            test('refuses a pinned-version spec too', () => {
                rt.register(mod('signal', '1.0.0'));
                expect(() => rt.invalidate('signal@1.0.0')).toThrow(/never-swap set/);
            });

            test('refuses when a CASCADE reaches a never-swap module, and drops nothing', () => {
                // `signal` here declares a dependency, so the cascade from
                // `store` reaches it — a shape the real `signal` (dependencies:
                // []) can never take, kept as the guard for any future entry.
                rt.register(mod('store', '1.0.0', [], () => ({ kind: 'store' })));
                rt.register(mod('signal', '1.0.0', ['store'], () => ({ kind: 'signal' })));
                rt.resolve('store');
                rt.resolve('signal');

                expect(() => rt.invalidate('store', { cascade: true }))
                    .toThrow(/"signal" is in the never-swap set/);

                // Nothing was evicted — not even the target itself.
                expect(cached(rt, 'store', '1.0.0')).toEqual({ kind: 'store' });
                expect(cached(rt, 'signal', '1.0.0')).toEqual({ kind: 'signal' });
            });

            test('the same cascade WITHOUT the never-swap name succeeds (non-vacuity control)', () => {
                rt.register(mod('store', '1.0.0', [], () => ({ kind: 'store' })));
                rt.register(mod('notSignal', '1.0.0', ['store'], () => ({ kind: 'view' })));
                rt.resolve('store');
                rt.resolve('notSignal');

                const res = rt.invalidate('store', { cascade: true });
                expect([...res.invalidated].sort()).toEqual(['notSignal@1.0.0', 'store@1.0.0']);
            });
        });

        describe('errors', () => {
            test('throws on an unknown module name', () => {
                expect(() => rt.invalidate('ghost')).toThrow('Module not found: ghost');
            });

            test('throws on a known name with an unknown version', () => {
                rt.register(mod('foo', '1.0.0'));
                expect(() => rt.invalidate('foo@9.9.9')).toThrow('Module not found: foo@9.9.9');
            });
        });

        describe('without cascade', () => {
            test('drops only the target, leaving dependents and dependencies cached', () => {
                rt.register(mod('base', '1.0.0', [], () => ({ kind: 'base' })));
                rt.register(mod('leaf', '1.0.0', ['base'], () => ({ kind: 'leaf' })));
                rt.register(mod('other', '1.0.0', [], () => ({ kind: 'other' })));
                rt.resolve('leaf');
                rt.resolve('other');

                const res = rt.invalidate('leaf');

                expect(res.invalidated).toEqual(['leaf@1.0.0']);
                expect(cached(rt, 'leaf', '1.0.0')).toBeUndefined();
                expect(cached(rt, 'base', '1.0.0')).toEqual({ kind: 'base' });
                expect(cached(rt, 'other', '1.0.0')).toEqual({ kind: 'other' });
            });

            test('a version-less spec drops every registered version', () => {
                rt.register(mod('foo', '1.0.0', [], () => 'v1'));
                rt.register(mod('foo', '2.0.0', [], () => 'v2'));
                rt.resolve('foo@1.0.0');
                rt.resolve('foo@2.0.0');

                const res = rt.invalidate('foo');

                expect([...res.invalidated].sort()).toEqual(['foo@1.0.0', 'foo@2.0.0']);
                expect(rt.instances.has('foo')).toBe(false);
            });

            test('a pinned spec drops only that version', () => {
                rt.register(mod('foo', '1.0.0', [], () => 'v1'));
                rt.register(mod('foo', '2.0.0', [], () => 'v2'));
                rt.resolve('foo@1.0.0');
                rt.resolve('foo@2.0.0');

                expect(rt.invalidate('foo@1.0.0').invalidated).toEqual(['foo@1.0.0']);
                expect(cached(rt, 'foo', '1.0.0')).toBeUndefined();
                expect(cached(rt, 'foo', '2.0.0')).toBe('v2');
            });

            test('an uninstantiated target invalidates nothing (and does not throw)', () => {
                rt.register(mod('foo', '1.0.0'));
                expect(rt.invalidate('foo').invalidated).toEqual([]);
            });

            test('leaves the module registry untouched', () => {
                rt.register(mod('foo', '1.0.0', [], () => 'v1'));
                rt.resolve('foo');
                rt.invalidate('foo');
                expect(rt.has('foo', '1.0.0')).toBe(true);
                expect(rt.list({ name: 'foo' })).toHaveLength(1);
            });

            test('the result is frozen', () => {
                rt.register(mod('foo', '1.0.0', [], () => 'v1'));
                rt.resolve('foo');
                const res = rt.invalidate('foo');
                expect(Object.isFrozen(res)).toBe(true);
                expect(Object.isFrozen(res.invalidated)).toBe(true);
                expect(Object.isFrozen(res.state)).toBe(true);
            });
        });

        describe('with cascade', () => {
            test('transitively drops dependents, not dependencies', () => {
                rt.register(mod('store', '1.0.0', [], () => ({ kind: 'store' })));
                rt.register(mod('base', '1.0.0', ['store'], () => ({ kind: 'base' })));
                rt.register(mod('mid', '1.0.0', ['base'], () => ({ kind: 'mid' })));
                rt.register(mod('top', '1.0.0', ['mid'], () => ({ kind: 'top' })));
                rt.register(mod('sibling', '1.0.0', [], () => ({ kind: 'sibling' })));
                rt.resolve('top');
                rt.resolve('sibling');

                const res = rt.invalidate('base', { cascade: true });

                expect([...res.invalidated].sort())
                    .toEqual(['base@1.0.0', 'mid@1.0.0', 'top@1.0.0']);
                // Dependency and unrelated module keep their instances.
                expect(cached(rt, 'store', '1.0.0')).toEqual({ kind: 'store' });
                expect(cached(rt, 'sibling', '1.0.0')).toEqual({ kind: 'sibling' });
            });

            test('the same graph WITHOUT cascade drops only the target (control)', () => {
                rt.register(mod('base', '1.0.0', [], () => ({ kind: 'base' })));
                rt.register(mod('mid', '1.0.0', ['base'], () => ({ kind: 'mid' })));
                rt.register(mod('top', '1.0.0', ['mid'], () => ({ kind: 'top' })));
                rt.resolve('top');

                expect(rt.invalidate('base').invalidated).toEqual(['base@1.0.0']);
                expect(cached(rt, 'mid', '1.0.0')).toEqual({ kind: 'mid' });
                expect(cached(rt, 'top', '1.0.0')).toEqual({ kind: 'top' });
            });

            test('a pinned dependency spec cascades only for that exact version', () => {
                rt.register(mod('dep', '1.0.0', [], () => 'dep1'));
                rt.register(mod('dep', '2.0.0', [], () => 'dep2'));
                rt.register(mod('pinsV1', '1.0.0', ['dep@1.0.0'], () => 'pins1'));
                rt.register(mod('pinsV2', '1.0.0', ['dep@2.0.0'], () => 'pins2'));
                rt.resolve('pinsV1');
                rt.resolve('pinsV2');

                const res = rt.invalidate('dep@1.0.0', { cascade: true });

                expect([...res.invalidated].sort()).toEqual(['dep@1.0.0', 'pinsV1@1.0.0']);
                expect(cached(rt, 'pinsV2', '1.0.0')).toBe('pins2');
            });

            test('a version-less dependency cascades only when latest is invalidated', () => {
                rt.register(mod('dep', '1.0.0', [], () => 'dep1'));
                rt.register(mod('dep', '2.0.0', [], () => 'dep2'));
                rt.register(mod('user', '1.0.0', ['dep'], () => 'user'));
                rt.resolve('user');

                // 1.0.0 is not `latest` — `resolve('dep')` never returned it.
                expect(rt.invalidate('dep@1.0.0', { cascade: true }).invalidated).toEqual([]);
                expect(cached(rt, 'user', '1.0.0')).toBe('user');

                // 2.0.0 IS latest — the dependent goes with it.
                const res = rt.invalidate('dep@2.0.0', { cascade: true });
                expect([...res.invalidated].sort()).toEqual(['dep@2.0.0', 'user@1.0.0']);
            });

            test('terminates on a dependency cycle', () => {
                rt.register(mod('a', '1.0.0', ['b'], () => 'A'));
                rt.register(mod('b', '1.0.0', ['a'], () => 'B'));
                // Never resolved (resolve would recurse forever) — the cascade
                // walk is over descriptors, so it must still reach a fixpoint.
                expect(rt.invalidate('a', { cascade: true }).invalidated).toEqual([]);
            });
        });

        describe('re-registration round trip', () => {
            test('register + invalidate + resolve returns the NEW factory output', () => {
                rt.register(mod('view', '1.0.0', [], () => 'old'));
                expect(rt.resolve('view')).toBe('old');

                rt.register(mod('view', '1.0.0', [], () => 'new'));
                // Documented pre-existing behaviour: register alone is
                // descriptor-only, so the cached instance survives.
                expect(rt.resolve('view')).toBe('old');

                rt.invalidate('view');
                expect(rt.resolve('view')).toBe('new');
            });

            test('a dependent re-resolves against the NEW dependency only under cascade', () => {
                rt.register(mod('dep', '1.0.0', [], () => ({ tag: 'v1' })));
                rt.register(mod('user', '1.0.0', ['dep'], (dep) => ({ saw: dep.tag })));
                expect(rt.resolve('user')).toEqual({ saw: 'v1' });

                rt.register(mod('dep', '1.0.0', [], () => ({ tag: 'v2' })));

                rt.invalidate('dep');                                // no cascade
                expect(rt.resolve('user')).toEqual({ saw: 'v1' });   // stale dependent

                rt.invalidate('dep', { cascade: true });
                expect(rt.resolve('user')).toEqual({ saw: 'v2' });
            });
        });

        describe('documented limits', () => {
            test('LIMIT: a handle already handed out is never upgraded', () => {
                rt.register(mod('view', '1.0.0', [], () => ({ label: 'old' })));
                const handle = rt.resolve('view');

                rt.register(mod('view', '1.0.0', [], () => ({ label: 'new' })));
                rt.invalidate('view');

                expect(rt.resolve('view')).toEqual({ label: 'new' });
                // The previously handed-out object is untouched, by design.
                expect(handle).toEqual({ label: 'old' });
            });

            test('LIMIT: factory-closure state is LOST — invalidating re-runs the factory', () => {
                rt.register(mod('counter', '1.0.0', [], function () {
                    let count = 0;                       // factory-closure state
                    return { bump: () => ++count, read: () => count };
                }));

                const first = rt.resolve('counter');
                first.bump();
                first.bump();
                expect(first.read()).toBe(2);

                rt.invalidate('counter');
                const second = rt.resolve('counter');

                // Not a bug: re-running the factory IS what clears the closure.
                // Documented in docs/guide/hmr.md; the dehydrate()/hydrate()
                // convention below is the opt-in answer.
                expect(second).not.toBe(first);
                expect(second.read()).toBe(0);
            });

            test('LIMIT: {isolation:true} instances are uncacheable, so unreachable', () => {
                rt.register(mod('iso', '1.0.0', [], () => ({})));
                const a = rt.resolve('iso', { isolation: true });
                expect(rt.instances.has('iso')).toBe(false);

                expect(rt.invalidate('iso').invalidated).toEqual([]);
                // Still isolated, still fresh every time — invalidate changed
                // nothing because there was nothing cached to change.
                expect(rt.resolve('iso', { isolation: true })).not.toBe(a);
            });

            test('LIMIT: a caller-supplied instances map is not touched', () => {
                rt.register(mod('foo', '1.0.0', [], () => ({ kind: 'foo' })));
                const custom = new Map();
                rt.resolve('foo', { instances: custom });
                expect(custom.has('foo@1.0.0')).toBe(true);

                expect(rt.invalidate('foo').invalidated).toEqual([]);
                expect(custom.has('foo@1.0.0')).toBe(true);
            });
        });

        describe('dehydrate() / hydrate() convention', () => {
            test('carries the outgoing state out, keyed by canonical name', () => {
                rt.register(mod('editor', '1.0.0', [], function () {
                    let draft = '';
                    return {
                        type: (s) => { draft = s; },
                        read: () => draft,
                        dehydrate: () => ({ draft }),
                        hydrate: (s) => { draft = s.draft; },
                    };
                }));

                const before = rt.resolve('editor');
                before.type('hello');

                const { invalidated, state } = rt.invalidate('editor');
                expect(invalidated).toEqual(['editor@1.0.0']);
                expect(state['editor@1.0.0']).toEqual({ draft: 'hello' });

                // The caller closes the loop — resolve() is unchanged and knows
                // nothing about the convention.
                const after = rt.resolve('editor');
                expect(after.read()).toBe('');           // fresh factory
                after.hydrate(state['editor@1.0.0']);
                expect(after.read()).toBe('hello');      // state carried across
            });

            test('modules that do not opt in contribute no state key', () => {
                rt.register(mod('plain', '1.0.0', [], () => ({ ok: true })));
                rt.resolve('plain');
                const { state } = rt.invalidate('plain');
                expect(Object.keys(state)).toEqual([]);
            });

            test('a throwing dehydrate() aborts BEFORE any eviction (atomic)', () => {
                rt.register(mod('good', '1.0.0', [], () => ({ kind: 'good' })));
                rt.register(mod('bad', '1.0.0', ['good'], () => ({
                    kind: 'bad',
                    dehydrate: () => { throw new Error('nope'); },
                })));
                rt.resolve('bad');

                expect(() => rt.invalidate('good', { cascade: true })).toThrow('nope');

                expect(cached(rt, 'good', '1.0.0')).toEqual({ kind: 'good' });
                expect(cached(rt, 'bad', '1.0.0')).toBeTruthy();
            });
        });

        describe('leaf-module scope (W1 bar (b) positive case)', () => {
            test('a leaf swap preserves signals held in an unswapped store module', () => {
                // The real `signal` module — the never-swap entry, deliberately
                // left out of the swap. `store` holds the signal; `leafView`
                // reads it and is the only thing replaced.
                rt.register(signal);
                rt.register({
                    name: 'store', version: '1.0.0', dependencies: ['signal'],
                    factory: function (sig) {
                        const count = sig.create(0);
                        return { count };
                    },
                });
                rt.register({
                    name: 'leafView', version: '1.0.0', dependencies: ['store'],
                    factory: function (store) {
                        return { render: () => `v1:${store.count.get()}` };
                    },
                });

                const seen = [];
                const sigApi = rt.resolve('signal');
                const store = rt.resolve('store');
                const stop = sigApi.effect(() => { seen.push(store.count.get()); });

                expect(rt.resolve('leafView').render()).toBe('v1:0');
                store.count.set(1);
                expect(seen).toEqual([0, 1]);

                // Swap the leaf only.
                rt.register({
                    name: 'leafView', version: '1.0.0', dependencies: ['store'],
                    factory: function (store) {
                        return { render: () => `v2:${store.count.get()}` };
                    },
                });
                const res = rt.invalidate('leafView', { cascade: true });
                expect(res.invalidated).toEqual(['leafView@1.0.0']);

                // New code, same live state, effects still firing.
                expect(rt.resolve('leafView').render()).toBe('v2:1');
                expect(rt.resolve('store')).toBe(store);
                store.count.set(2);
                expect(seen).toEqual([0, 1, 2]);
                expect(rt.resolve('leafView').render()).toBe('v2:2');
                stop();
            });
        });
    });

    describe('serialize', () => {
        test('emits canonical names in list', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }));
            const s = rt.serialize(['a']);
            expect(s.list).toBe(`['a@1.0.0']`);
        });

        test('emits version and type in content', () => {
            rt.register(mod('a', '1.5.0', [], function () { return 'A'; }, 'fw.io.codec'));
            const s = rt.serialize(['a']);
            expect(s.content).toContain(`name:'a'`);
            expect(s.content).toContain(`version:'1.5.0'`);
            expect(s.content).toContain(`type:'fw.io.codec'`);
        });

        test('omits type field when absent', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }));
            const s = rt.serialize(['a']);
            expect(s.content).not.toContain(`type:`);
        });

        test('rewrites bareback dependencies to canonical', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }));
            rt.register(mod('b', '1.0.0', ['a'], function (a) { return 'B+' + a; }));
            const s = rt.serialize(['b']);
            expect(s.content).toContain(`dependencies:['a@1.0.0']`);
        });

        test('preserves explicit name@version in dependencies', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }));
            rt.register(mod('a', '2.0.0', [], function () { return 'A2'; }));
            rt.register(mod('b', '1.0.0', ['a@1.0.0'], function (a) { return 'B+' + a; }));
            const s = rt.serialize(['b']);
            expect(s.content).toContain(`dependencies:['a@1.0.0']`);
        });

        test('default selects latest', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A1'; }));
            rt.register(mod('a', '2.0.0', [], function () { return 'A2'; }));
            const s = rt.serialize(['a']);
            expect(s.list).toContain('a@2.0.0');
            expect(s.list).not.toContain('a@1.0.0');
        });

        test('topological order - deps before dependents', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }));
            rt.register(mod('b', '1.0.0', ['a'], function (a) { return 'B' + a; }));
            const s = rt.serialize(['b']);
            const idxA = s.list.indexOf('a@1.0.0');
            const idxB = s.list.indexOf('b@1.0.0');
            expect(idxA).toBeGreaterThan(-1);
            expect(idxB).toBeGreaterThan(idxA);
        });

        test('deduplicates shared transitive deps', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }));
            rt.register(mod('b', '1.0.0', ['a'], function (a) { return 'B'; }));
            rt.register(mod('c', '1.0.0', ['a', 'b'], function (a, b) { return 'C'; }));
            const s = rt.serialize(['c']);
            const matches = s.list.match(/a@1\.0\.0/g) || [];
            expect(matches.length).toBe(1);
        });

        test('throws when serializing unknown module', () => {
            expect(() => rt.serialize(['ghost'])).toThrow(/Module not found/);
        });

        test('round-trip - eval produces a usable runtime', () => {
            rt.register(mod('a', '1.0.0', [], function () { return 'A'; }, 'fw.io.codec'));
            rt.register(mod('b', '1.0.0', ['a'], function (a) { return 'B+' + a; }));
            const s = rt.serialize(['b']);

            // Simulate worker side : create a fresh runtime and register all serialized modules.
            const rt2 = new ModuleRuntime();
            const defs = eval(s.content); // serialized.content is a JS array literal of defs
            defs.forEach(d => rt2.register(d));

            // The bootstrap uses canonical names from list.
            const names = eval(s.list); // e.g. ['a@1.0.0', 'b@1.0.0']
            expect(names).toContain('a@1.0.0');
            expect(names).toContain('b@1.0.0');
            expect(rt2.resolve('b')).toBe('B+A');
            expect(rt2.resolve('b@1.0.0')).toBe('B+A');
        });
    });

    describe('unregister', () => {
        test('returns false on unknown name', () => {
            expect(rt.unregister('ghost')).toBe(false);
        });

        test('returns false on known name + unknown version', () => {
            rt.register(mod('foo', '1.0.0'));
            expect(rt.unregister('foo', '9.9.9')).toBe(false);
            expect(rt.unregister('foo@9.9.9')).toBe(false);
        });

        test('without version removes all versions of name', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            rt.register(mod('bar', '1.0.0'));
            expect(rt.unregister('foo')).toBe(true);
            expect(rt.has('foo')).toBe(false);
            expect(rt.has('foo', '1.0.0')).toBe(false);
            expect(rt.has('foo', '2.0.0')).toBe(false);
            expect(rt.has('bar')).toBe(true);
        });

        test('with explicit version removes only that version', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            expect(rt.unregister('foo', '1.0.0')).toBe(true);
            expect(rt.has('foo', '1.0.0')).toBe(false);
            expect(rt.has('foo', '2.0.0')).toBe(true);
        });

        test('canonical spec form name@version removes only that version', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            expect(rt.unregister('foo@2.0.0')).toBe(true);
            expect(rt.has('foo', '2.0.0')).toBe(false);
            expect(rt.has('foo', '1.0.0')).toBe(true);
        });

        test('removes the whole entry when last version unregistered', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            expect(rt.unregister('foo@1.0.0')).toBe(true);
            expect(rt.has('foo')).toBe(false);
        });

        test('recomputes latest when the removed version was latest', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            rt.register(mod('foo', '1.5.0', [], () => 'v15'));
            // latest is 2.0.0
            rt.unregister('foo@2.0.0');
            expect(rt.resolve('foo')).toBe('v15'); // 1.5.0 is now the highest
        });

        test('latest is unchanged when a non-latest version is removed', () => {
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            rt.register(mod('foo', '2.0.0', [], () => 'v2'));
            rt.unregister('foo@1.0.0');
            expect(rt.resolve('foo')).toBe('v2'); // still 2.0.0
        });

        test('does not touch instance cache - already-resolved refs survive', () => {
            rt.register(mod('foo', '1.0.0', [], () => ({ tag: 'cached' })));
            const inst = rt.resolve('foo');
            // Instance is referenced by the caller - that ref is never invalidated.
            expect(inst.tag).toBe('cached');

            rt.unregister('foo');

            // The held reference is unchanged (caller-side, not runtime-side).
            expect(inst.tag).toBe('cached');
            // Subsequent resolve fails because the def is gone.
            expect(() => rt.resolve('foo')).toThrow(/Module not found/);
        });

        test('cache survives partial unregister (other version still resolvable)', () => {
            rt.register(mod('foo', '1.0.0', [], () => ({ v: 1 })));
            rt.register(mod('foo', '2.0.0', [], () => ({ v: 2 })));
            const v1 = rt.resolve('foo@1.0.0');
            const v2 = rt.resolve('foo@2.0.0');

            rt.unregister('foo@1.0.0');

            // v1 ref unchanged, v2 still resolvable from cache.
            expect(v1.v).toBe(1);
            expect(rt.resolve('foo@2.0.0')).toBe(v2);
            // v1 no longer resolvable.
            expect(() => rt.resolve('foo@1.0.0')).toThrow(/Module not found: foo@1\.0\.0/);
        });

        test('re-register after unregister works (and reuses cache slot if present)', () => {
            rt.register(mod('foo', '1.0.0', [], () => ({ build: 'first' })));
            const first = rt.resolve('foo');
            rt.unregister('foo');

            // Re-register a fresh def with the same (name, version).
            rt.register(mod('foo', '1.0.0', [], () => ({ build: 'second' })));

            // Cache untouched → resolve returns the previously cached instance,
            // not a new one (semver-aligned with the documented "instances cache
            // is keyed by (name, version)" rule).
            expect(rt.resolve('foo')).toBe(first);

            // Isolation forces a fresh factory call → new build.
            expect(rt.resolve('foo', { isolation: true }).build).toBe('second');
        });
    });

    describe('backward compatibility', () => {
        test('legacy module without version coexists with versioned ones', () => {
            rt.register({ name: 'foo', factory: () => 'legacy', dependencies: [] });
            rt.register(mod('foo', '1.0.0', [], () => 'v1'));
            // Legacy default 0.0.0 < 1.0.0 → v1 wins as latest
            expect(rt.resolve('foo')).toBe('v1');
            expect(rt.resolve('foo@0.0.0')).toBe('legacy');
            expect(rt.resolve('foo@1.0.0')).toBe('v1');
        });

        test('has(name) without version still works', () => {
            rt.register(mod('foo', '1.0.0'));
            expect(rt.has('foo')).toBe(true);
            expect(rt.has('foo', '1.0.0')).toBe(true);
            expect(rt.has('foo', '9.9.9')).toBe(false);
            expect(rt.has('bar')).toBe(false);
        });

        test('resolveAll returns object keyed by spec', () => {
            rt.register(mod('a', '1.0.0', [], () => 'A1'));
            rt.register(mod('a', '2.0.0', [], () => 'A2'));
            rt.register(mod('b', '1.0.0', [], () => 'B'));
            const all = rt.resolveAll(['a', 'a@1.0.0', 'b']);
            expect(all['a']).toBe('A2');
            expect(all['a@1.0.0']).toBe('A1');
            expect(all['b']).toBe('B');
        });
    });

    describe('runtimeSource (worker self-containment)', () => {
        // Replicates a Worker context: a new scope where we evaluate
        // `runtimeSource` then use `ModuleRuntime`. If the string
        // doesn't include all helpers/constants, methods that depend on them
        // (register, resolve, unregister) throw ReferenceError.
        const evalInIsolation = (body) => {
            // `new Function` creates a scope isolated from the current module. The
            // helpers (semverCompare, parseSpec, canonical) and constants
            // (SEMVER_RE, TYPE_RE, DEFAULT_VERSION) are available only
            // if they are included in `runtimeSource`.
            const fn = new Function(`
                ${runtimeSource}
                ${body}
            `);
            return fn();
        };

        test('register + resolve work with isolated source', () => {
            const result = evalInIsolation(`
                const rt = new ModuleRuntime();
                rt.register({
                    name: 'isolated', version: '1.2.3',
                    dependencies: [], factory: () => ({ tag: 'v1' })
                });
                rt.register({
                    name: 'isolated', version: '2.0.0',
                    dependencies: [], factory: () => ({ tag: 'v2' })
                });
                return {
                    latest: rt.resolve('isolated').tag,
                    pinned: rt.resolve('isolated@1.2.3').tag
                };
            `);
            expect(result.latest).toBe('v2');
            expect(result.pinned).toBe('v1');
        });

        test('register without version uses DEFAULT_VERSION (constant included)', () => {
            const result = evalInIsolation(`
                const rt = new ModuleRuntime();
                rt.register({
                    name: 'noversion',
                    dependencies: [],
                    factory: () => 'OK'
                });
                // If DEFAULT_VERSION were not included, register would throw
                // (SEMVER_RE validation on 'undefined') or store under
                // an invalid key. Verify canonical resolution.
                return {
                    has: rt.has('noversion', '0.0.0'),
                    resolved: rt.resolve('noversion@0.0.0')
                };
            `);
            expect(result.has).toBe(true);
            expect(result.resolved).toBe('OK');
        });

        test('unregister by spec works (parseSpec included)', () => {
            const result = evalInIsolation(`
                const rt = new ModuleRuntime();
                rt.register({ name: 'm', version: '1.0.0', dependencies: [], factory: () => 'a' });
                rt.register({ name: 'm', version: '2.0.0', dependencies: [], factory: () => 'b' });
                rt.unregister('m@1.0.0');
                return { has1: rt.has('m', '1.0.0'), has2: rt.has('m', '2.0.0') };
            `);
            expect(result.has1).toBe(false);
            expect(result.has2).toBe(true);
        });

        test('invalidate works with isolated source (static NEVER_SWAP included)', () => {
            // The never-swap set lives as a STATIC CLASS FIELD, not a
            // module-scope const, precisely so `ModuleRuntime.toString()`
            // carries it into the worker. A module-scope const would pass every
            // main-thread test and throw ReferenceError only here.
            const result = evalInIsolation(`
                const rt = new ModuleRuntime();
                rt.register({ name: 'dep', dependencies: [], factory: () => 'v1' });
                rt.register({ name: 'user', dependencies: ['dep'], factory: (d) => 'uses-' + d });
                rt.resolve('user');
                rt.register({ name: 'dep', dependencies: [], factory: () => 'v2' });
                const res = rt.invalidate('dep', { cascade: true });
                let refused = null;
                rt.register({ name: 'signal', dependencies: [], factory: () => ({}) });
                try { rt.invalidate('signal'); } catch (e) { refused = e.message; }
                return {
                    invalidated: res.invalidated.slice().sort(),
                    reresolved: rt.resolve('user'),
                    neverSwap: ModuleRuntime.NEVER_SWAP.slice(),
                    refused
                };
            `);
            expect(result.invalidated).toEqual(['dep@0.0.0', 'user@0.0.0']);
            expect(result.reresolved).toBe('uses-v2');
            expect(result.neverSwap).toEqual(['signal']);
            expect(result.refused).toMatch(/never-swap set/);
        });

        test('register with valid type (TYPE_RE included)', () => {
            const result = evalInIsolation(`
                const rt = new ModuleRuntime();
                rt.register({
                    name: 'typed', version: '1.0.0', type: 'fw.io.codec',
                    dependencies: [], factory: () => 'OK'
                });
                return rt.list({ type: 'fw.' }).length;
            `);
            expect(result).toBe(1);
        });

        test('register with invalid version throws (SEMVER_RE included)', () => {
            expect(() => evalInIsolation(`
                const rt = new ModuleRuntime();
                rt.register({
                    name: 'bad', version: 'not-semver',
                    dependencies: [], factory: () => null
                });
            `)).toThrow();
        });

        // Replicates the exact context that worker-helper builds: the worker
        // registers the full serialized graph then calls resolveAll with
        // the ORIGINAL user specs. Guarantees that `libs[<spec>]` matches
        // the `dependencies` entry as passed by the app, without automatic
        // canonical suffix.
        test('worker exposure: libs keyed by user specs, not canonical', () => {
            // Setup main-thread side
            const main = new ModuleRuntime();
            main.register({
                name: 'hex', version: '0.0.0',
                dependencies: [], factory: () => ({ kind: 'hex' })
            });
            main.register({
                name: 'utf8', version: '1.0.0',
                dependencies: [], factory: () => ({ kind: 'utf8' })
            });

            const userDependencies = ['hex', 'utf8@1.0.0'];
            const serialized = main.serialize(userDependencies);

            // Replicates code injected by worker-helper.js:
            // 1. registers the entire serialized graph
            // 2. exposes to framework the ORIGINAL specs (not serialized.list)
            const result = evalInIsolation(`
                const rt = new ModuleRuntime();
                ${serialized.content}.forEach(m => rt.register(m));
                return rt.resolveAll(${JSON.stringify(userDependencies)});
            `);

            // Keys must match user specs, not canonical ones.
            expect(Object.keys(result).sort()).toEqual(['hex', 'utf8@1.0.0']);
            expect(result['hex']).toEqual({ kind: 'hex' });
            expect(result['utf8@1.0.0']).toEqual({ kind: 'utf8' });
            expect(result['hex@0.0.0']).toBeUndefined(); // ← the regression
        });
    });
});
