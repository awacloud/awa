// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { ModuleRuntime } from '../../../../src/core/runtime.js';
import modules from '../../../../src/core/modules.js';

const violations = [];
document.addEventListener('securitypolicyviolation', (e) => { violations.push(e.violatedDirective); });

const root = document.documentElement;
const mode = new URLSearchParams(location.search).get('mode');

/** Wait for `n` animation frames. */
function frames(n) {
    return new Promise((resolve) => {
        const step = (left) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(n);
    });
}

try {
    const rt = new ModuleRuntime();
    rt.registerAll(modules);
    rt.resolve('styleSheet').mode(mode);

    const host = document.getElementById('host');
    rt.resolve('template').init('csp', { to: host, main: true });
    const ui = rt.resolve('uiSession')('csp');
    const Card = rt.resolve('component').define({
        template: ui.parse('<div id="root">csp</div>'),
        css: '& { color: rgb(1, 2, 3); }',
    });
    const card = Card({ ui, id: 'card' });
    rt.resolve('themeTokens').create({ prefix: 't-' }).define({ c: 'rgb(4, 5, 6)' });

    await frames(2);

    root.dataset.result = JSON.stringify({
        mode,
        color: getComputedStyle(card.get()).color,
        token: getComputedStyle(root).getPropertyValue('--t-c').trim(),
        styleElements: document.querySelectorAll('style').length,
        adopted: document.adoptedStyleSheets.length,
        violations,
    });
} catch (e) {
    root.dataset.result = JSON.stringify({ error: String(e) });
}
root.dataset.done = '1';
