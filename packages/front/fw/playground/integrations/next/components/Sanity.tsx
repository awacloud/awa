'use client';

// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Sanity layer is client-only: the community layer is SSR-safe and
// framework-friendly — it leaves history.pushState intact so Next <Link>
// client navigation works. `withFw` forces `sanity: false`, so it is applied
// here, in a client root component, before the rest. The module is
// explicit-call: a bare import hardens nothing, `applyCommunity()` does (it
// is a no-op during the server render, where there is no window).
import { applyCommunity } from '@awacloud/fw/sanity/community';

applyCommunity();

export function Sanity() {
    return null;
}
