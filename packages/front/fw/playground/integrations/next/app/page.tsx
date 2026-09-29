// Server Component — `render.toHTML` is worker-safe (pure data, the parser
// has a DOM-less tokenizer), so the SSR markup is produced right here and
// adopted client-side by the HomeHello island (`uiSession.hydrate`).
// Never resolve DOM modules (uiSession, dom, form…) in a Server Component.
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
import { HELLO_TPL } from '../lib/templates';
import { HomeHello } from '../components/HomeHello';
import { CounterIsland } from '../components/CounterIsland';

export default function Page() {
    const html = runtime.resolve('render').toHTML(
        runtime.resolve('parser').fromHTML(HELLO_TPL),
        {
            title: 'Hydrated island',
            detail: `Markup produced on the server at ${new Date().toISOString()}.`,
        },
        { idPrefix: 'hello' },
    );

    return (
        <>
            <h1>fw × Next</h1>
            <p>
                Multi-page App Router app (static server components) + <code>@awacloud/fw</code>{' '}
                islands. This page shows both flows: server-produced markup that gets{' '}
                <em>hydrated</em>, and an island mounted fresh on the client. The{' '}
                <a href="/form">form page</a> shows the <code>form</code> module.
            </p>

            <h2>Island 1 — SSR markup, hydrated</h2>
            <p>
                The block below ships in the server HTML (view source); on load,{' '}
                <code>uiSession.hydrate</code> adopts the existing nodes and attaches listeners.
            </p>
            <HomeHello html={html} />

            <h2>Island 2 — reactive counter (client mount)</h2>
            <CounterIsland />
        </>
    );
}
