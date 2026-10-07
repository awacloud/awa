// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `fvar` — Font Variations (OT §10.6.2).
 *
 * Defines variation axes (wght, wdth, opsz, slnt, ital, + custom)
 * and named instances of the variable font.
 *
 * Layout :
 *
 * ```
 *   majorVersion uint16 (= 1)
 *   minorVersion uint16 (= 0)
 *   axesArrayOffset uint16
 *   reserved uint16
 *   axisCount uint16
 *   axisSize uint16 (= 20)
 *   instanceCount uint16
 *   instanceSize uint16
 *   axes[axisCount] :
 *       axisTag Tag, minValue Fixed, defaultValue Fixed, maxValue Fixed,
 *       flags uint16, axisNameID uint16
 *   instances[instanceCount] :
 *       subfamilyNameID uint16, flags uint16,
 *       coordinates[axisCount] Fixed,
 *       [postScriptNameID uint16]  (when instanceSize > 4 + 4*axisCount)
 * ```
 *
 * @module fonts/table/fvar
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';

export const tableFvar = {
    name: 'tableFvar',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tagMod) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tagMod;

        /**
         * Hard caps on `axisCount` / `instanceCount`. Real variable fonts
         * declare a handful of axes (rarely more than a dozen) and at most a
         * few dozen named instances. Capping prevents an allocation DoS
         * (`new Array(N)`) on a malicious fvar declaring the uint16 maximum.
         */
        const AXIS_COUNT_MAX     = 64;
        const INSTANCE_COUNT_MAX = 256;

        function parseFvar(bytes) {
            if (bytes.length < 16)
                throw new ParseError('fonts/fvar-short', 'fvar header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/fvar-version',
                    `unsupported fvar major version ${major}`, { context: { major, minor } });
            const axesArrayOffset = r.readUint16();
            r.readUint16();   // reserved
            const axisCount    = r.readUint16();
            r.readUint16();   // axisSize (fixed = 20 by spec), unused — advance the reader only
            const instanceCount = r.readUint16();
            const instanceSize  = r.readUint16();

            if (axisCount > AXIS_COUNT_MAX)
                throw new ParseError('fonts/fvar-axis-count-cap',
                    `fvar declares ${axisCount} axes (cap ${AXIS_COUNT_MAX})`,
                    { context: { axisCount, cap: AXIS_COUNT_MAX } });
            if (instanceCount > INSTANCE_COUNT_MAX)
                throw new ParseError('fonts/fvar-instance-count-cap',
                    `fvar declares ${instanceCount} instances (cap ${INSTANCE_COUNT_MAX})`,
                    { context: { instanceCount, cap: INSTANCE_COUNT_MAX } });

            r.seek(axesArrayOffset);
            const axes = new Array(axisCount);
            for (let i = 0; i < axisCount; i++) {
                const tag = untag(r.readUint32());
                const min = r.readFixed();
                const def = r.readFixed();
                const max = r.readFixed();
                const flags = r.readUint16();
                const axisNameID = r.readUint16();
                axes[i] = { tag, minValue: min, defaultValue: def, maxValue: max, flags, axisNameID };
            }
            // Instances
            const instances = new Array(instanceCount);
            const hasPostScriptNameID = instanceSize > 4 + 4 * axisCount;
            for (let i = 0; i < instanceCount; i++) {
                const subfamilyNameID = r.readUint16();
                const flags = r.readUint16();
                const coordinates = new Array(axisCount);
                for (let k = 0; k < axisCount; k++) coordinates[k] = r.readFixed();
                let postScriptNameID;
                if (hasPostScriptNameID) postScriptNameID = r.readUint16();
                instances[i] = { subfamilyNameID, flags, coordinates, postScriptNameID };
            }
            return { majorVersion: major, minorVersion: minor, axes, instances };
        }

        return { parseFvar };
    }
};
