'use client';

import { FwIsland, type FwIslandRender } from './FwIsland';
import { HELLO_TPL, HELLO_DATA } from '../lib/templates';

// Adopt the server-rendered markup (same template + idPrefix as the server),
// then wire interactivity on the SAME DOM nodes — no client re-render.
//
// `onMismatch: 'rebuild'` also covers React StrictMode's dev double-mount:
// the first cleanup removes the SSR nodes, so the second mount falls back to
// a client render using HELLO_DATA.
const hydrateHello: FwIslandRender = (ui) => {
    ui.hydrate(
        [{ id: 'hello', block: ui.parse(HELLO_TPL), data: HELLO_DATA }],
        { idPrefix: 'hello', onMismatch: 'rebuild' },
    );

    let clicks = 0;
    ui.text('hello', 'state', 'Hydrated — same DOM nodes, now interactive.');
    ui.on('hello', 'bump', 'click', () => {
        clicks += 1;
        ui.text('hello', 'bump', `hydration check: ${clicks} click${clicks > 1 ? 's' : ''}`);
    });
};

export function HomeHello({ html }: { html: string }) {
    return <FwIsland hydrate html={html} render={hydrateHello} />;
}
