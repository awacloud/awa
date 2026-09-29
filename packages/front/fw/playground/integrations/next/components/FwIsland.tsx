'use client';

import { useEffect, useRef } from 'react';
// Provided by the `@awacloud/fw/webpack` plugin that `withFw` wires into the Next build.
// Only available under Webpack (`next dev` / `next build`), not Turbopack.
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

/** What a `render` callback may return for cleanup on React unmount. */
export type FwIslandController = void | (() => void) | { destroy?: () => void };

/**
 * `render(ui, el)` receives a fresh `UISession` bound to the island's
 * container `el`. It decides between mounting fresh (`ui.add(...)`) and
 * adopting SSR markup (`ui.hydrate(...)`) — see the pages for both flavours.
 */
export type FwIslandRender = (ui: any, el: HTMLElement) => FwIslandController;

// `template.init` throws on duplicate context names and React StrictMode
// mounts effects twice in dev — give each mount a unique context name.
// (A module counter, not Math.random: the sanity layer blocks it.)
let seq = 0;

export function FwIsland({
    hydrate = false,
    html = '',
    render,
}: {
    /** Adopt SSR markup (`html`) instead of mounting into an empty div. */
    hydrate?: boolean;
    /** Server-produced markup (`render.toHTML` with data-fw-id markers). */
    html?: string;
    render: FwIslandRender;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof render !== 'function') return undefined;

        // One render context per mount, bound to the React-owned container.
        const ctx = `fw-island-${++seq}`;
        const tpl = runtime.resolve('template');
        tpl.init(ctx, { to: el, main: true });
        const ui = runtime.resolve('uiSession')(ctx);

        // hydrate an existing SSR markup, OR mount fresh — `render` decides.
        const controller = render(ui, el);

        return () => {
            // cleanup on React unmount
            if (typeof controller === 'function') controller();
            else if (controller && typeof controller.destroy === 'function') controller.destroy();
            // `clear()` fires the unmount hooks (managed listeners, signal
            // binds, adopted resources) and removes every fw-rendered node.
            // NOTE: template.clearContext is NOT called — it would remove
            // `el` itself, which React owns; context names being unique per
            // mount, re-init never collides.
            ui.clear();
        };
    }, [hydrate, html, render]);

    return hydrate && html
        ? <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
        : <div ref={ref} />;
}
