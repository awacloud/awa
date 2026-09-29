'use client';

import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
import { FwIsland, type FwIslandRender } from './FwIsland';
import { FORM_TPL, ENTRY_TPL } from '../lib/templates';

const mountSignup: FwIslandRender = (ui) => {
    const form = runtime.resolve('form');

    // Form shell + keyed list plugged on the `${rows}` slot.
    ui.add([{ id: 'signup', block: ui.parse(FORM_TPL) }]);
    const entries = ui.list('signup', 'rows', {
        keyFn: (e: { key: string }) => e.key,
        block: ui.parse(ENTRY_TPL),
        eqFn: 'shallow',
    });
    let nextKey = 0;

    // Form controller: per-field sync validation + async submit.
    const controller = form.create({
        fields: {
            name: {
                type: 'string',
                required: true,
                validate: (v: string) => (v.trim().length >= 2 ? null : 'At least 2 characters'),
            },
            email: {
                type: 'string',
                required: true,
                validate: (v: string) =>
                    (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Invalid email address'),
            },
        },
        onSubmit: async (values: { name: string; email: string }) => {
            await new Promise((r) => setTimeout(r, 250)); // fake API call
            entries.push({ key: `entry-${++nextKey}`, name: values.name, email: values.email });
        },
    });

    // Two-way field ↔ state binding (+ blur → touched).
    controller.attach('name', ui.get('signup', 'name'));
    controller.attach('email', ui.get('signup', 'email'));

    // A single subscription drives every error/status surface.
    controller.subscribe((snap: any) => {
        ui.text('signup', 'nameError', snap.touched.name && snap.errors.name ? snap.errors.name : '');
        ui.text('signup', 'emailError', snap.touched.email && snap.errors.email ? snap.errors.email : '');
        ui.attr('signup', 'send', 'disabled', snap.submitting ? 'disabled' : false);
    });

    ui.on('signup', 'root', 'submit', (e: Event) => {
        e.preventDefault();
        controller.submit().then((ok: boolean) => {
            ui.text('signup', 'state', ok ? 'Welcome aboard!' : 'Please fix the errors above.');
            if (ok) controller.reset();
        });
    });

    // The form module's own DOM bindings are registered through `events`
    // directly (not session-managed) — detach them on React unmount.
    return { destroy: () => controller.detach() };
};

export function SignupIsland() {
    return <FwIsland render={mountSignup} />;
}
