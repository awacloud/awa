// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture sanity base — minimal explicit-call ES module (classical-bundle
// dual-delivery test fixture). Mirrors the shape of the real
// packages/front/fw/src/sanity/base.js: importing this module does nothing;
// only calling applyBase() has an effect. LOG_ATTEMPTS stays at module scope,
// declared exactly once, so the bundler's --no-sanity-log patch has a single
// anchored target to find.

const LOG_ATTEMPTS = true;

let _applied = false;

function logAttempt(msg) {
    if (LOG_ATTEMPTS) {
        console.warn('[SECURITY] ' + msg);
    }
}

export function applyBase() {
    if (_applied) return { applied: false, reason: 'already-applied', steps: [] };
    _applied = true;
    logAttempt('base applied');
    if (typeof globalThis !== 'undefined') {
        globalThis.__miniFwSanity = 'base';
    }
    return { applied: true, steps: ['base'] };
}
