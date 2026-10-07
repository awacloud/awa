// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard 14 dispatcher — `lookupStandard14(name)` →
 * metrics record. Names accepted: 'Helvetica', 'Helvetica-Bold',
 * 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Times-Roman',
 * 'Times-Bold', 'Times-Italic', 'Times-BoldItalic', 'Courier',
 * 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique', 'Symbol',
 * 'ZapfDingbats'.
 *
 * Strict factory-only.
 *
 * @module fonts/standard14/lookup
 */

import { fontErrors } from '../errors.js';
import { standard14Helvetica } from './helvetica.js';
import { standard14Times } from './times.js';
import { standard14Courier } from './courier.js';
import { standard14Symbol } from './symbol.js';
import { standard14ZapfDingbats } from './zapfDingbats.js';

export const standard14Lookup = {
    name: 'standard14Lookup',
    dependencies: ['fontErrors', 'standard14Helvetica', 'standard14Times',
                   'standard14Courier', 'standard14Symbol', 'standard14ZapfDingbats'],
    deps: [fontErrors, standard14Helvetica, standard14Times, standard14Courier, standard14Symbol, standard14ZapfDingbats],
    factory(errors, helv, times, courier, symbol, zapf) {
        const { ContractError } = errors;
        const ALL = Object.freeze({
            'Helvetica':              helv.helveticaRegular,
            'Helvetica-Bold':         helv.helveticaBold,
            'Helvetica-Oblique':      helv.helveticaOblique,
            'Helvetica-BoldOblique':  helv.helveticaBoldOblique,
            'Times-Roman':            times.timesRoman,
            'Times-Bold':             times.timesBold,
            'Times-Italic':           times.timesItalic,
            'Times-BoldItalic':       times.timesBoldItalic,
            'Courier':                courier.courier,
            'Courier-Bold':           courier.courierBold,
            'Courier-Oblique':        courier.courierOblique,
            'Courier-BoldOblique':    courier.courierBoldOblique,
            'Symbol':                 symbol.symbolFont,
            'ZapfDingbats':           zapf.zapfDingbatsFont
        });
        const STANDARD_14_NAMES = Object.freeze(Object.keys(ALL));
        function lookupStandard14(name) {
            const m = ALL[name];
            if (!m)
                throw new ContractError('fonts/unknown-standard14',
                    `unknown Standard 14 font '${name}' — expected one of: ${STANDARD_14_NAMES.join(', ')}`,
                    { context: { name } });
            return m;
        }
        function isStandard14(name) { return !!ALL[name]; }
        return { lookupStandard14, isStandard14, STANDARD_14_NAMES };
    }
};
