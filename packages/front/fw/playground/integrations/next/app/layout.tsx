import type { ReactNode } from 'react';
import Link from 'next/link';
import { Sanity } from '../components/Sanity';
import './globals.css';

export const metadata = {
    title: 'fw × Next playground',
    description: 'Multi-page Next.js App Router app using @awacloud/fw via Webpack.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                {/* Client-only sanity layer, mounted before the rest. */}
                <Sanity />
                <nav>
                    <strong>fw × Next</strong>
                    {/* community leaves history.pushState intact — <Link> client navigation works. */}
                    <Link href="/">Home</Link>
                    <Link href="/form">Form</Link>
                    <Link href="/about">About</Link>
                </nav>
                <main>{children}</main>
                <footer>
                    <small>
                        @awacloud/fw playground — <code>@awacloud/fw/next</code> integration
                    </small>
                </footer>
            </body>
        </html>
    );
}
