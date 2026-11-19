// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// A small single-page app: hash routes, data loaded with ajax, a filtered
// keyed list, a detail view, and a validated contact form.
import { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';

runtime.registerAll(modules);

const template  = runtime.resolve('template');
const uiSession = runtime.resolve('uiSession');
const signal    = runtime.resolve('signal');
const route     = runtime.resolve('route');
const ajax      = runtime.resolve('ajax');
const form      = runtime.resolve('form');

const LIST_VIEW = `
    <section id="root">
        <h1>Packages</h1>
        <nav id="filter">
            <button id="all" type="button">All</button>
            <button id="io" type="button">io</button>
            <button id="dom" type="button">dom</button>
        </nav>
        <p id="status">Loading…</p>
        <ul id="list">\${rows}</ul>
    </section>`;
const ROW = `<li id="row"><a id="link" href="#{href}">#{title}</a><span id="kind" class="kind">#{kind}</span></li>`;
const DETAIL_VIEW = `
    <section id="root">
        <p><a id="back" href="#/">Back to the list</a></p>
        <h1 id="title">#{title}</h1>
        <p class="kind">#{kind}</p>
        <p id="blurb">#{blurb}</p>
    </section>`;
const CONTACT_VIEW = `
    <section id="root">
        <h1>Contact</h1>
        <form id="contact">
            <label id="nameLabel">Name <input id="name" name="name"></label>
            <label id="emailLabel">Email <input id="email" name="email"></label>
            <button id="send" type="submit">Send</button>
        </form>
        <p id="result" role="status">#{result}</p>
    </section>`;
const FILTERS = ['all', 'io', 'dom'];

const packages = signal.create([]);
const filter = signal.create('all');
const visible = signal.derived([packages, filter], (rows, kind) =>
    kind === 'all' ? rows : rows.filter((p) => p.kind === kind));

template.init('app', { to: document.getElementById('app'), main: true });
const session = uiSession('app');

// ajax needs an absolute base: the directory of this page.
ajax(new URL('.', location.href).href).get('data.json', { type: 'json' })
    .then((rows) => packages.set(rows))
    .catch((err) => console.warn('data.json did not load:', err.message));

let stops = [];
function show(view, data) {
    for (const stop of stops) stop();
    stops = [];
    session.clear();
    session.add([{ id: 'panel', block: session.parse(view), data }]);
}

function listView() {
    show(LIST_VIEW);
    const list = session.list('panel', 'rows', { keyFn: (p) => p.id, block: session.parse(ROW), eqFn: 'shallow' });
    stops.push(signal.effect(() => {
        const rows = visible.get().map((p) => ({ ...p, href: '#/pkg/' + p.id }));
        list.sync(rows);
        const total = packages.get().length;
        session.text('panel', 'status', total ? `${rows.length} shown of ${total}` : 'Loading…');
    }));
    for (const kind of FILTERS) session.on('panel', kind, 'click', () => filter.set(kind));
    stops.push(signal.effect(() => {
        for (const kind of FILTERS) session.attr('panel', kind, 'aria-pressed', String(filter.get() === kind));
    }));
}

function detailView(id) {
    const pkg = packages.peek().find((p) => p.id === id) || { title: id, kind: '?', blurb: 'Unknown package.' };
    show(DETAIL_VIEW, pkg);
}

function contactView() {
    show(CONTACT_VIEW, { result: '' });
    const contact = form.create({
        fields: {
            name: { type: 'string', required: true, requiredMessage: 'Name is required', validate: (v) => (v.trim().length >= 2 ? null : 'Name: at least 2 characters') },
            email: { type: 'string', required: true, requiredMessage: 'Email is required', validate: (v) => (/^[^@\s]+@[^@\s]+$/.test(v) ? null : 'Email: not an address') },
        },
        onSubmit: ({ name }) => session.text('panel', 'result', `Thanks, ${name}: message queued (nothing is sent).`),
    });
    contact.attach('name', session.get('panel', 'name'));
    contact.attach('email', session.get('panel', 'email'));
    session.on('panel', 'contact', 'submit', (e) => {
        e.preventDefault();
        contact.submit().then(() => {
            const errors = Object.values(contact.errors || {}).filter(Boolean);
            if (errors.length) session.text('panel', 'result', errors.join(' · '));
        });
    });
}

route.on('list', '/', listView);
route.on('detail', '/pkg/:id', ({ id }) => detailView(id));
route.on('contact', '/contact', contactView);
route.start();
