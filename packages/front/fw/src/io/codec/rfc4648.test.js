// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// RFC 4648 § 10 test vectors (base64, base32, base16), encode and decode.
// fw has no base32hex alphabet, so that table is not here.

import { describe, test, expect } from 'bun:test';
import { b64 } from './b64.js';
import { base32 } from './base32.js';
import { hex } from './hex.js';

const te = (s) => new TextEncoder().encode(s);
const td = (b) => new TextDecoder().decode(b);
const INPUTS = ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'];

const TABLES = {
    BASE64: { codec: b64.factory(), out: ['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy'] },
    BASE32: { codec: base32.factory(), out: ['', 'MY======', 'MZXQ====', 'MZXW6===', 'MZXW6YQ=', 'MZXW6YTB', 'MZXW6YTBOI======'] },
    BASE16: { codec: hex.factory(), out: ['', '66', '666F', '666F6F', '666F6F62', '666F6F6261', '666F6F626172'] },
};

describe('RFC 4648 § 10', () => {
    for (const [name, { codec, out }] of Object.entries(TABLES)) {
        test(`${name}: encode`, () => {
            const got = INPUTS.map((s) => codec.fromBytes(te(s)));
            // fw's hex encoder writes lowercase; RFC 4648 lists BASE16 uppercase
            expect(name === 'BASE16' ? got.map((x) => x.toUpperCase()) : got).toEqual(out);
        });

        test(`${name}: decode`, () => {
            expect(out.map((x) => td(codec.toBytes(x)))).toEqual(INPUTS);
            if (name === 'BASE16') expect(out.map((x) => td(codec.toBytes(x.toLowerCase())))).toEqual(INPUTS);
        });
    }
});
