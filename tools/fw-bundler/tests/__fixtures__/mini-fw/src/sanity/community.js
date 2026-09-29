// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture sanity community — minimal explicit-call ES module (classical-
// bundle dual-delivery test fixture). Mirrors the shape of the real
// packages/front/fw/src/sanity/community.js: importing this module does
// nothing; only calling applyCommunity() has an effect. LOG_ATTEMPTS stays at
// module scope, declared exactly once.

const LOG_ATTEMPTS = true;

let _applied = false;

function logAttempt(msg) {
    if (LOG_ATTEMPTS) {
        console.warn('[SECURITY] ' + msg);
    }
}

export function applyCommunity() {
    if (_applied) return { applied: false, reason: 'already-applied', steps: [] };
    _applied = true;
    logAttempt('community applied');
    if (typeof globalThis !== 'undefined') {
        globalThis.__miniFwSanity = 'community';
    }
    return { applied: true, steps: ['community'] };
}
