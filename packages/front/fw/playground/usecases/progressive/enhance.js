// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Enhances pages that already work as plain HTML: nothing here renders
// content, it only adds behaviour on top of the markup.
import { runtime, domReady } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';

runtime.registerAll(modules);

const dom = runtime.resolve('dom');
const form = runtime.resolve('form');

domReady.loaded(() => {
    markCurrentLink();
    const note = dom.query(document.body, '#js-note');
    if (note) dom.attrRemove(note, 'hidden');
    enhanceContactForm();
});

function markCurrentLink() {
    const page = location.pathname.split('/').pop() || 'index.html';
    for (const link of dom.queryAll(document.body, '#site-nav a')) {
        if ((dom.attrGet(link, 'href') || '') === page) dom.attr(link, 'aria-current', 'page');
    }
}

function enhanceContactForm() {
    const el = dom.query(document.body, '#contact');
    if (!el) return;
    const result = dom.query(document.body, '#result');
    const contact = form.create({
        fields: {
            name: { required: true, requiredMessage: 'Name is required', validate: (v) => (v.trim().length >= 2 ? null : 'Name: at least 2 characters') },
            email: { required: true, requiredMessage: 'Email is required', validate: (v) => (/^[^@\s]+@[^@\s]+$/.test(v) ? null : 'Email: not an address') },
        },
        onSubmit: ({ name }) => {
            result.textContent = `Thanks, ${name}: checked in the page, nothing was sent.`;
            result.className = 'ok';
        },
    });
    contact.attach('name', dom.query(el, '#name'));
    contact.attach('email', dom.query(el, '#email'));
    el.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ok = await contact.submit();
        if (!ok) {
            result.textContent = Object.values(contact.errors).filter(Boolean).join(' · ');
            result.className = 'ko';
        }
    });
}
