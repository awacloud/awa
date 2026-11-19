// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/scene/main.js
//
// `scene` demo — a small JSON scene spec (`scene.json`, content-as-data)
// built to SVG via the aggregate's `graphic.scene` surface, wired to three
// named events fired from click listeners on the built lamps.
//
// Data delivery choice: the
// spec is loaded via a JSON module import ATTRIBUTE
// (`with { type: 'json' }`), not `fetch`. `fetch()` of a same-directory
// `file://` URL is rejected under the happy-dom test environment (its global
// `fetch` polyfill throws `URL scheme "file" is not supported`), which would
// fail the dynamic smoke test outright. The import attribute is native ESM,
// resolved by the host's own module loader (Bun at test time; the browser's
// module graph when served over http(s)) — no bundler involved either way.
//
// Id-prefix collision caveat: `graphic.scene` defaults `prefix` to the literal `'scene'` when a
// spec omits it, so building the SAME spec twice in one document collides on
// every minted id. `scene.json` deliberately has NO `prefix` key; this module
// is the caller responsible for minting a fresh one per instance — see
// `nextPrefix()` below, exercised on every `run()` call (the smoke test boots
// this demo once per variant, into the same module realm).

import sceneSpec from './scene.json' with { type: 'json' };

let instanceCounter = 0;

/** Mint a fresh, per-instance-unique scene id prefix (never the '`scene`' default). */
function nextPrefix() {
    return `scene-demo-${instanceCounter++}`;
}

/**
 * Demo entry — frozen contract (`demos/_boot.js`).
 *
 * @param {{ mount: SVGElement, anim: object, variant: 'standalone'|'fw' }} ctx
 * @returns {Promise<{ dispose(): void }>}
 */
export async function run({ mount, anim }) {
    const scene = anim.scene.createScene({
        ...sceneSpec,
        prefix: nextPrefix(),
    });

    mount.appendChild(scene.root);

    // Bind targets BY REFERENCE once, from the built subtree — no per-click
    // `document.getElementById`/`querySelector` lookups.
    const red = scene.el('red');
    const yellow = scene.el('yellow');
    const green = scene.el('green');

    const onWarn = () => scene.fire('warn');
    const onGo = () => scene.fire('go');
    const onStop = () => scene.fire('stop');

    yellow.style.cursor = 'pointer';
    green.style.cursor = 'pointer';
    red.style.cursor = 'pointer';
    yellow.addEventListener('click', onWarn);
    green.addEventListener('click', onGo);
    red.addEventListener('click', onStop);

    return {
        dispose() {
            yellow.removeEventListener('click', onWarn);
            green.removeEventListener('click', onGo);
            red.removeEventListener('click', onStop);
            if (scene.root.parentNode === mount) {
                mount.removeChild(scene.root);
            }
        },
    };
}
