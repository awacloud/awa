// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The error classes survive the fw sanity layer (BL-2443).
 *
 * `applyBase()` (`@awacloud/fw/sanity/base.js`) freezes `Error.prototype`, so
 * an inherited-property assignment such as `this.name = …` throws a
 * TypeError in strict code and the typed error (code, context) is lost. The
 * probe runs in a child process — applying the sanity layer freezes the
 * realm's built-in prototypes for good — under happy-dom, then builds every
 * error class and reports what came out.
 */

import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

const ERRORS_URL = JSON.stringify(new URL('../src/errors.js', import.meta.url).href);
const BASE_URL = JSON.stringify(new URL('../../../fw/src/sanity/base.js', import.meta.url).href);
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url));

const PROBE = `
const write = process.stdout.write.bind(process.stdout);
const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
GlobalRegistrator.register({ url: 'https://office.test/' });
const { applyBase } = await import(${BASE_URL});
const report = applyBase();
const { mdErrors } = await import(${ERRORS_URL});
const api = mdErrors.factory();
const classes = {};
for (const [key, C] of Object.entries(api)) {
    if (typeof C !== 'function' || !(C === api.MdError || C.prototype instanceof api.MdError)) continue;
    try {
        const cause = new Error('inner');
        const e = new C('md/test/code', 'boom', { context: { n: 1 }, cause });
        classes[key] = { name: e.name, code: e.code, context: e.context,
            cause: e.cause === cause, message: e.message,
            isBase: api.isMdError(e), isError: e instanceof Error,
            keys: Object.keys(e) };
    } catch (err) {
        classes[key] = { threw: String(err && err.name) + ': ' + String(err && err.message) };
    }
}
write(JSON.stringify({ applied: report.applied, frozen: Object.isFrozen(Error.prototype), classes }) + '\\n');
process.exit(0);
`;

function runProbe() {
    const proc = Bun.spawnSync(['bun', '-e', PROBE], { cwd: PKG_DIR, stdout: 'pipe', stderr: 'pipe' });
    const stdout = proc.stdout.toString().trim();
    const last = stdout.split('\n').pop();
    if (proc.exitCode !== 0 || !last) {
        throw new Error('sanity probe failed (exit ' + proc.exitCode + '): ' + proc.stderr.toString());
    }
    return JSON.parse(last);
}

describe('md errors under the fw sanity layer (BL-2443)', () => {
    const r = runProbe();

    test('the probe ran with Error.prototype frozen by applyBase()', () => {
        expect(r.applied).toBe(true);
        expect(r.frozen).toBe(true);
    });

    test('every error class constructs and keeps its name, code, context and cause', () => {
        const names = ['MdError', 'ParseError', 'RenderError', 'ContractError'];
        expect(Object.keys(r.classes).sort()).toEqual([...names].sort());
        for (const name of names) {
            expect(r.classes[name]).toEqual({
                name, code: 'md/test/code', context: { n: 1 }, cause: true,
                message: 'boom', isBase: true, isError: true,
                keys: ['name', 'code', 'context', 'cause'],
            });
        }
    });
});
