// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `oconvDefaultFaces` descriptor — the frozen default-face
 * surface (the contract is `docs/descriptor.md`).
 *
 * `@awacloud/oconv` reaches this descriptor by its NAME only (an ordinary fw
 * dependency on `oconvDefaultFaces`, satisfied by a name-only stand-in until
 * this descriptor is registered), never by importing this package. The
 * descriptor carries no fw dependency:
 * its payload is five whole, unmodified font programs as `Uint8Array`s, keyed
 * exactly like `oconv`'s `FONT_OPT_KEY` values.
 *
 * The descriptor object is produced by a function (the bytes are loaded
 * asynchronously by `./loader.js`); this module reads no byte and performs no
 * I/O at import time.
 */

/** The frozen key set of the face map — the `FONT_OPT_KEY` spelling. */
const FACE_KEYS = Object.freeze(['regular', 'bold', 'italic', 'boldItalic', 'mono']);

/**
 * @typedef {Object} OconvDefaultFaceMap
 * @property {Uint8Array} regular    LiberationSans-Regular.
 * @property {Uint8Array} bold       LiberationSans-Bold.
 * @property {Uint8Array} italic     LiberationSans-Italic.
 * @property {Uint8Array} boldItalic LiberationSans-BoldItalic.
 * @property {Uint8Array} mono       LiberationMono-Regular.
 */

/**
 * Validate a face map against the frozen key set and return a frozen copy
 * holding the same `Uint8Array` values (the caller's object is left untouched).
 *
 * @param {*} faces
 * @returns {Readonly<OconvDefaultFaceMap>}
 * @throws {Error} `oconv-fonts: bad faces <key>` on an unknown key, a missing
 *   key or a non-`Uint8Array` value. A non-object input reports the first
 *   required key (`regular`).
 */
function freezeFaces(faces) {
    if (faces === null || typeof faces !== 'object') {
        throw new Error(`oconv-fonts: bad faces ${FACE_KEYS[0]}`);
    }
    for (const key of Object.keys(faces)) {
        if (!FACE_KEYS.includes(key)) throw new Error(`oconv-fonts: bad faces ${key}`);
    }
    const map = {};
    for (const key of FACE_KEYS) {
        if (!(faces[key] instanceof Uint8Array)) throw new Error(`oconv-fonts: bad faces ${key}`);
        map[key] = faces[key];
    }
    return Object.freeze(map);
}

/**
 * Build the `oconvDefaultFaces` fw module descriptor around a face map.
 *
 * The resolved API is `{ defaultFaces, family: 'Liberation', release: '2.1.5' }`,
 * where `defaultFaces()` returns the frozen face map.
 *
 * @param {OconvDefaultFaceMap} faces Five whole font programs, keyed
 *   `regular | bold | italic | boldItalic | mono`.
 * @returns {{name: 'oconvDefaultFaces', version: string, dependencies: [], deps: [], factory: Function}}
 * @throws {Error} `oconv-fonts: bad faces <key>` — see {@link freezeFaces}.
 */
export function createOconvDefaultFaces(faces) {
    const frozenFaces = freezeFaces(faces);
    return {
        name: 'oconvDefaultFaces',
        version: '1.0.0',
        dependencies: [],
        deps: [],
        factory() {
            return {
                // eslint-disable-next-line fw/no-factory-capture -- runtime-built data descriptor: the face bytes cannot be a dependency (dependencies: [] is frozen), so the factory closes over them; not serializable by design, the payload crosses workers by structured clone (docs/descriptor.md Worker Usage)
                defaultFaces: () => frozenFaces,
                family: 'Liberation',
                release: '2.1.5'
            };
        }
    };
}
