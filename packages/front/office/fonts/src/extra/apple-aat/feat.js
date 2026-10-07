// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `feat` — Feature Names (Apple TT RM06).
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/feat
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const aatFeat = {
    name: 'aatFeat',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const HEADER_SIZE       = 12;
        const FEATURE_REC_SIZE  = 12;
        const SETTING_REC_SIZE  = 4;

        /** Bits in `featureFlags`. */
        const FEAT_FLAGS_CONST = Object.freeze({
            EXCLUSIVE:        0x8000,
            DYNAMIC_DEFAULT:  0x4000,
            DEFAULT_MASK:     0x00FF
        });

        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseFeat(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/feat-input', 'parseFeat expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_SIZE)
                throw new ParseError('fonts/feat-short', 'feat table too short',
                    { context: { actual: bytes.length, needed: HEADER_SIZE } });

            const r = new BinaryReader(bytes);
            const version          = r.readFixed();
            const featureNameCount = r.readUint16();
            r.readUint16();
            r.readUint32();

            if (version !== 1)
                throw new ParseError('fonts/feat-version', `unsupported feat version ${version}`,
                    { context: { version } });
            if (HEADER_SIZE + featureNameCount * FEATURE_REC_SIZE > bytes.length)
                throw new ParseError('fonts/feat-count', 'feat featureNameCount overflows buffer',
                    { context: { featureNameCount, length: bytes.length } });

            const features = new Array(featureNameCount);
            for (let i = 0; i < featureNameCount; i++) {
                const feature            = r.readUint16();
                const nSettings          = r.readUint16();
                const settingTableOffset = r.readUint32();
                const featureFlags       = r.readUint16();
                const nameIndex          = r.readInt16();
                const exclusive          = !!(featureFlags & FEAT_FLAGS_CONST.EXCLUSIVE);
                const defaultSetting     = (featureFlags & FEAT_FLAGS_CONST.DYNAMIC_DEFAULT)
                    ? (featureFlags & FEAT_FLAGS_CONST.DEFAULT_MASK)
                    : 0;
                features[i] = {
                    feature, nSettings, settingTableOffset, featureFlags,
                    exclusive, defaultSetting, nameIndex, settings: []
                };
            }

            for (const f of features) {
                if (f.nSettings === 0) continue;
                const end = f.settingTableOffset + f.nSettings * SETTING_REC_SIZE;
                if (f.settingTableOffset < 0 || end > bytes.length)
                    throw new ParseError('fonts/feat-settings-range',
                        `feat settings array for feature ${f.feature} out of bounds`,
                        { context: { feature: f.feature, settingTableOffset: f.settingTableOffset, nSettings: f.nSettings } });
                const sr = new BinaryReader(bytes, f.settingTableOffset, f.nSettings * SETTING_REC_SIZE);
                for (let i = 0; i < f.nSettings; i++) {
                    f.settings.push({ setting: sr.readUint16(), nameIndex: sr.readInt16() });
                }
            }

            return { version, featureNameCount, features };
        }

        return { parseFeat, FEAT_FLAGS: FEAT_FLAGS_CONST };
    }
};

