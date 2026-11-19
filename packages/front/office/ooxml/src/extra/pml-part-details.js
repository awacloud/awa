// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed part-level elements of slides, layouts and
 * masters the pptx core leaves in `_extras` — the slide transition
 * (`pmlTransitions`), the animation timing (`pmlAnimations`) and the
 * header / footer flags (`pmlNotes`). A pptx walker extension registered by
 * `pptxFullBundle`: every element is typed only when it is written back as
 * read (`docxProperties.hydrateLossless`), under this module's field
 * names; any other stays in `_extras`.
 *
 * @module ooxml/extra/pml-part-details
 */

import { docxProperties } from '../docx/properties.js';
import { pmlTransitions } from './pml-transitions.js';
import { pmlAnimations } from './pml-animations.js';
import { pmlNotes } from './pml-notes.js';

export const pmlPartDetails = {
    name: 'pmlPartDetails',
    dependencies: ['docxProperties', 'pmlTransitions', 'pmlAnimations', 'pmlNotes'],
    deps: [docxProperties, pmlTransitions, pmlAnimations, pmlNotes],

    factory(props, transitions, animations, notes) {
        const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

        // Element name → its field and codec, in the schema's order.
        const SPEC = [
            ['p:transition', 'transition', transitions.parseTransition, transitions.renderTransition],
            ['p:timing', 'timing', animations.parseTiming, animations.renderTiming],
            ['p:hf', 'hf', notes.parseHf, notes.renderHf]
        ];
        const byName = new Map(SPEC.map(([name, field, parse, render]) => [name, { field, parse, render }]));

        function type(bag) {
            if (!bag || !Array.isArray(bag._extras)) return bag;
            const remaining = [];
            for (const c of bag._extras) {
                const s = c && c.type === 'element' ? byName.get(c.name) : undefined;
                const v = s ? s.parse(c) : undefined;
                if (v === undefined || v === null) { remaining.push(c); continue; }
                bag[s.field] = v;
            }
            if (remaining.length) bag._extras = remaining; else delete bag._extras;
            return bag;
        }
        // The typed fields go back before the part's other `_extras`; the
        // core's writer places each where the schema does.
        function untype(bag) {
            if (!isPlain(bag)) return bag;
            const out = { ...bag };
            const typed = [];
            for (const [, s] of byName) {
                if (out[s.field] === undefined) continue;
                const el = isPlain(out[s.field]) ? s.render(out[s.field]) : null;
                if (el) typed.push(el);
                delete out[s.field];
            }
            const extras = typed.concat(Array.isArray(out._extras) ? out._extras : []);
            if (extras.length) out._extras = extras; else delete out._extras;
            return out;
        }

        return {
            hydrateSlidePart: (part) => (isPlain(part) ? props.hydrateLossless(part, type, untype) : part),
            dehydrateSlidePart: untype
        };
    }
};
