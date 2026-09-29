'use client';

// Sanity layer is client-only: the community layer is SSR-safe and
// framework-friendly — it leaves history.pushState intact so Next <Link>
// client navigation works. `withFw` forces `sanity: false`, so we import it
// here, in a client root component, before the rest.
import '@awacloud/fw/sanity/community';

export function Sanity() {
    return null;
}
