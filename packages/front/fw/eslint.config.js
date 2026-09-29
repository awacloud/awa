// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/eslint.config.js
//
// PROTOTYPE — minimal flat config. Dev-only (not shipped in `files`).
//
// Intent : layer edit-time guards on top of what tsc/checkJs + the bespoke
// validators (validate-deps, audit-types) already cover. The headline feature
// is `no-restricted-globals` / `no-restricted-properties` DERIVED from the
// sanity layer (`src/sanity/base.js`) — so "blocked at runtime" and "flagged
// at edit time" share a single source of truth and can't drift.
//
// Run :  bun run lint        (or: bunx eslint .)
// Needs (devDependencies) :  eslint  @eslint/js  typescript-eslint  globals
//
// Note : running this will surface REAL findings (e.g. a module touching
// `performance.now` or `Reflect`) — that's the point: those break under
// sanity. Sanction a legitimate wrapper with a scoped override or an inline
// `// eslint-disable-next-line` carrying a justification.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import fw from './integrations/eslint/no-factory-capture.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Derive the banned-API lists from the sanity layer (single source of truth) ──
function sanityBlocklist() {
    const src = readFileSync(resolve(HERE, 'src/sanity/base.js'), 'utf8');
    const arr = (name) => {
        const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
        return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
    };
    return {
        windowApis: arr('BLOCKED_WINDOW_APIS'),
        documentApis: arr('BLOCKED_DOCUMENT_APIS'),
        historyApis: arr('BLOCKED_HISTORY_APIS'),
        cryptoApis: arr('BLOCKED_CRYPTO_APIS'),
        perfApis: arr('BLOCKED_PERF_APIS'),
    };
}

const B = sanityBlocklist();
const SEE = 'blocked by src/sanity/base.js — see docs/guide/security.md';

// Bare-identifier globals (window-level). `import` is syntax, not a global → drop.
const restrictedGlobals = B.windowApis
    .filter((n) => n !== 'import')
    .map((name) => ({ name, message: `\`${name}\` is ${SEE}.` }));

// object.member forms.
const prop = (object, property, hint) => ({
    object, property, message: `\`${object}.${property}\` is ${SEE}.${hint ? ' ' + hint : ''}`,
});
const restrictedProperties = [
    prop('Math', 'random', 'Use crypto.getRandomValues or the `random` module.'),
    ...B.cryptoApis.map((p) => prop('crypto', p, 'Use the `uuid` module.')),
    ...B.perfApis.map((p) => prop('performance', p)),
    ...B.documentApis.map((p) => prop('document', p)),
    ...B.historyApis.map((p) => prop('history', p, 'Use the `route` module.')),
];

// ── Frozen-prototype guard (all built-ins frozen by sanity) ──
// sanity's freezePrototypes() freezes Object/Array/Function/String/Number/
// Boolean/Date/RegExp/Error prototypes. Inside a class extending one of them,
// `this.<p> = …` where `<p>` is an inherited prototype property throws in strict
// mode (the frozen prop is non-writable). The fix is Object.defineProperty,
// which creates an OWN property and bypasses the frozen prototype.
//
// We honour `no-restricted-syntax` but build one entry per frozen built-in by
// INTROSPECTING its prototype at config-load time (Node) — so the flagged prop
// set is exact (no false positives) and auto-tracks the runtime. The built-in
// list is derived from sanity/base.js (single source of truth).
function sanityFrozenBuiltins() {
    const src = readFileSync(resolve(HERE, 'src/sanity/base.js'), 'utf8');
    const m = src.match(/freezePrototypes[\s\S]*?prototypes\s*=\s*\[([\s\S]*?)\]/);
    if (!m) return [];
    return [...m[1].matchAll(/([A-Za-z_$][\w$]*)\.prototype/g)].map((x) => x[1]);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const restrictedSyntax = sanityFrozenBuiltins().flatMap((name) => {
    const ctor = globalThis[name];
    if (!ctor || !ctor.prototype) return [];
    // Own DATA properties of the prototype (methods + value props). After freeze
    // each is non-writable, so assigning the same name on an instance throws.
    // Accessors (e.g. __proto__) and `constructor` are excluded.
    const props = Object.getOwnPropertyNames(ctor.prototype).filter((p) => {
        if (p === 'constructor') return false;
        const d = Object.getOwnPropertyDescriptor(ctor.prototype, p);
        return d && 'value' in d;
    });
    if (!props.length) return [];
    const alt = props.map(escapeRe).join('|');
    return [{
        selector:
            `:matches(ClassDeclaration, ClassExpression)[superClass.name='${name}'] ` +
            "AssignmentExpression[operator='='][left.object.type='ThisExpression']" +
            `[left.property.name=/^(${alt})$/]`,
        message:
            `Assigning \`this.<prop>\` in a class extending ${name} breaks under sanity's frozen ` +
            `${name}.prototype (non-writable inherited prop → TypeError). Use ` +
            "Object.defineProperty(this, '<prop>', { value, writable: true, configurable: true }).",
    }];
});

export default [
    // Stale eslint-disable directives become a first-class error, consistent
    // with the --max-warnings 0 gate: any lingering unused suppression fails lint.
    {
        linterOptions: { reportUnusedDisableDirectives: 'error' },
    },

    {
        ignores: [
            'dist/**',
            'tmp/**',
            'node_modules/**',
            'docs/api-generated/**',
            // BL-948: flat-config 'dist/**' is config-dir-relative — playground provisioning output (gitignored) must be listed explicitly
            'playground/integrations/*/dist/**',
            // BL-948: flat-config 'dist/**' is config-dir-relative — playground provisioning output (gitignored) must be listed explicitly
            '**/.next/**',
            // BL-948: flat-config 'dist/**' is config-dir-relative — playground provisioning output (gitignored) must be listed explicitly
            '**/.astro/**',
            '**/_fixtures/**',
            '**/*.kat.js',
            'types/registry.generated.d.ts',
            // Self-contained ESLint-integration demo (own package.json/bun.lock/
            // eslint.config.js, see its README): playground/integrations/eslint/
            // ships its OWN flat config that registers fw/no-factory-capture on
            // `*.js` in that directory — bad-module.js is DELIBERATELY-bad demo
            // material (the teaching point is that the rule catches it) and
            // good-module.js is its passing counterpart. Because ESLint's flat
            // config resolves the NEAREST eslint.config.js per linted file
            // (confirmed via `--debug`: "Using config file .../playground/
            // integrations/eslint/eslint.config.js"), this nested config governs
            // those files ENTIRELY once reached — this root config (including any
            // rule scoping to `src/**`) is never even consulted for them, and an
            // ignore entry for the exact file path here is a no-op (still fires)
            // where a directory-glob is not (verified empirically). Ignoring the
            // directory here excludes it from the package-wide `--max-warnings 0`
            // gate while leaving `cd` + `npx eslint bad-module.js`/`good-module.js`
            // (the README-documented standalone usage) fully intact — an ignore
            // scoped INSIDE the nested config instead would silently defeat that
            // demo (confirmed empirically too), which a directory-level exclusion
            // here does not.
            'playground/integrations/eslint/**',
        ],
    },

    // Core recommended (applies to every linted file).
    js.configs.recommended,

    // typescript-eslint recommended — scoped to .ts only. No .ts sources today,
    // but the parser/ruleset is wired and ready for incremental migration.
    ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),

    // Unused-vars : tuned for this codebase. `args: 'none'` because factory
    // params are positional dependencies (often all used) and several functions
    // rely on `arguments` — checking args produces only false positives here.
    // Real value is unused *locals / imports*, which stay checked.
    {
        rules: {
            'no-unused-vars': ['warn', {
                args: 'none',
                caughtErrors: 'none',
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
            // Empty catch blocks are a deliberate best-effort idiom across the
            // codebase (sanity, loaders, cleanup). Other empty blocks still warn.
            'no-empty': ['warn', { allowEmptyCatch: true }],
            // Only flag irregular whitespace in CODE — string/template/regex/comment
            // occurrences are intentional (unicode test vectors, ANSI sequences…).
            'no-irregular-whitespace': ['error', {
                skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true,
            }],
        },
    },

    // ── Framework source : browser/worker runtime + sanity-derived guards ──
    {
        files: ['src/**/*.js'],
        ignores: ['src/sanity/**'],
        plugins: { fw },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.worker },
        },
        rules: {
            eqeqeq: ['warn', 'smart'],
            'no-var': 'error',
            'no-eval': 'error',
            'no-restricted-globals': ['error', ...restrictedGlobals],
            'no-restricted-properties': ['error', ...restrictedProperties],
            'no-restricted-syntax': ['error', ...restrictedSyntax],
            'fw/no-factory-capture': 'error',
            // The framework legitimately matches control characters in regexes
            // (sanitizers strip \x00…, ANSI/VT100 parser, binary codecs).
            'no-control-regex': 'off',
        },
    },

    // The sanity files themselves DEFINE the lockdown — exempt (they name
    // blocked APIs by design: eval/Function/WebAssembly are named in order to
    // be removed).
    //
    // sourceType is 'module' for the WHOLE area: every tier is now an
    // explicit-call ES module (base.js → applyBase(), community.js →
    // applyCommunity(), lockdown.js → lockdown()/harden()). The classic
    // <script> variants are BUILT artifacts generated from these sources, not
    // the sources themselves — so no sanity source is a classic script any
    // more and no per-file carve-out is needed. They run in browser + worker
    // realms.
    {
        files: ['src/sanity/**'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.worker },
        },
        rules: {
            'no-restricted-globals': 'off',
            'no-restricted-properties': 'off',
            'no-eval': 'off',
        },
    },

    // ── Tools / integrations / this config : Node + Bun build context ──
    {
        files: ['tools/**/*.js', 'integrations/**/*.js', 'integrations/**/*.mjs', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node, Bun: 'readonly' },
        },
        rules: {
            eqeqeq: ['warn', 'smart'],
            'no-var': 'error',
        },
    },

    // Tests run under Bun — and exercise the very APIs sanity blocks (eval,
    // Function, Math.random for fixtures). They are not shipped and never run
    // under sanity, so the runtime guards don't apply.
    {
        files: ['**/*.test.js', '**/*.integration.test.js'],
        // sourceType: tests are ESM. Set it explicitly so test files co-located
        // under a `sourceType: 'script'` area (e.g. src/sanity/**) are still
        // parsed as modules; a no-op elsewhere (src/**/*.js already => module).
        languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser, Bun: 'readonly' } },
        rules: {
            'no-unused-vars': 'off',
            'no-restricted-globals': 'off',
            'no-restricted-properties': 'off',
            'no-restricted-syntax': 'off',
            'no-eval': 'off',
            'fw/no-factory-capture': 'off',
        },
    },

    // Playground : browser demo scripts (with .html siblings), `.js` and `.mjs`
    // alike. Not shipped. Lint loosely — they exist to illustrate, not to ship.
    {
        files: ['playground/**/*.js', 'playground/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser },
        },
        rules: {
            'no-unused-vars': 'off',
            'no-console': 'off',
        },
    },

    // Playground : Node-context scripts — CLI tools (`_tools/**`, run directly
    // via `node`/`bun`) and standalone build scripts, as opposed to the browser
    // demo pages above. Layered after the browser block so `console`/`process`/
    // `__dirname` resolve as Node globals for this narrower file class.
    {
        files: [
            'playground/_tools/**/*.mjs',
            'playground/integrations/esbuild/build.mjs',
            'playground/integrations/nodejs/app.mjs',
        ],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': 'off',
            'no-console': 'off',
        },
    },

    // Playground : CommonJS build config. `webpack.config.js` is Node's
    // `require()`-loaded CJS entry point (see its own header comment) — carve
    // it out of the ESM playground block above with `sourceType: 'commonjs'`
    // and Node globals (`require`, `module`, `__dirname`).
    {
        files: ['playground/**/webpack.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': 'off',
            'no-console': 'off',
        },
    },

    // Playground : ambient `.d.ts` declaration files (astro/next integration
    // demos) legitimately use `/// <reference path=... />` — that is the
    // framework-mandated way to pull in generated types, not an import-style
    // violation.
    {
        files: ['playground/**/*.d.ts'],
        rules: { '@typescript-eslint/triple-slash-reference': 'off' },
    },

    // Declaration files : hand-authored / generated type surfaces legitimately
    // use `any` in generic utilities — don't lint them as TS source.
    {
        files: ['**/*.d.ts'],
        rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
];
