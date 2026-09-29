export const metadata = { title: 'fw × Next — about' };

// 100% static server component — no fw imports, no island.
export default function AboutPage() {
    return (
        <>
            <h1>About this example</h1>
            <p>
                Demo of the official <code>@awacloud/fw/next</code> integration:{' '}
                <code>withFw(nextConfig, fwOptions)</code> plugs the <code>@awacloud/fw/webpack</code>{' '}
                plugin into the Next build, exposing the <code>virtual:@awacloud/fw/preset/*</code>{' '}
                modules to every compilation (server and client).
            </p>
            <h2>Boundaries</h2>
            <ul>
                <li>
                    <strong>Server Components</strong>: worker-safe modules only
                    (<code>render.toHTML</code>, <code>parser</code>, codecs, <code>valid</code>…).
                    Never resolve a DOM module server-side.
                </li>
                <li>
                    <strong>Client islands</strong> (<code>&apos;use client&apos;</code>): the whole
                    preset (<code>uiSession</code>, <code>form</code>, <code>signal</code>,{' '}
                    <code>dom</code>, <code>events</code>…), mounted in <code>useEffect</code>.
                </li>
                <li>
                    <strong>Sanity layer</strong>: client-only by design (it freezes{' '}
                    <code>window</code>/<code>document</code>) — <code>withFw</code> forces it off
                    in the build; <code>components/Sanity.tsx</code> imports it in a root client
                    component instead.
                </li>
            </ul>
            <p>This page has no island: it renders as plain static HTML.</p>
        </>
    );
}
