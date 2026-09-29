'use client';

import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
import { FwIsland, type FwIslandRender } from './FwIsland';
import { COUNTER_TPL } from '../lib/templates';

// Module-level callback: stable identity (FwIsland keeps it in its effect
// deps), and client-only by construction ('use client' boundary).
const mountCounter: FwIslandRender = (ui) => {
    const sig = runtime.resolve('signal');

    // Reactive state: a source signal + a derived signal.
    const count = sig.create(0);
    const parity = sig.derived([count], (n: number) => (n % 2 === 0 ? 'even' : 'odd'));

    // Render the block, then declarative signal → DOM bindings
    // (applied immediately, then on every set/update).
    ui.add([{ id: 'counter', block: ui.parse(COUNTER_TPL) }]);
    ui.bind(count, 'counter', 'value', 'text', { transform: String });
    ui.bind(parity, 'counter', 'parity', 'text', { transform: (p: string) => `count is ${p}` });

    // Session-managed listeners — released by FwIsland's ui.clear().
    ui.on('counter', 'inc', 'click', () => count.update((n: number) => n + 1));
    ui.on('counter', 'dec', 'click', () => count.update((n: number) => n - 1));
    ui.on('counter', 'zero', 'click', () => count.set(0));
};

export function CounterIsland() {
    return <FwIsland render={mountCounter} />;
}
