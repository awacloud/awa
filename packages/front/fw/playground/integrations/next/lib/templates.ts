// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// lib/templates.ts
// fw templates shared between the server (SSR via `render.toHTML`) and the
// client islands. Notation: `#{var}` = data binding, `${slot}` = list slot
// (uiSession.list), `id` = logical id addressable through the session
// (ui.text / ui.on / ui.bind). Whitespace-only text nodes are skipped by the
// parser — indentation is free.

// Island 1 (home) — markup produced server-side by `render.toHTML`, adopted
// client-side by `uiSession.hydrate` (same ids, same idPrefix).
export const HELLO_TPL = `<section id="panel" class="island hello">
    <h3 id="heading">#{title}</h3>
    <p id="detail">#{detail}</p>
    <p id="state">Server-rendered — not hydrated yet.</p>
    <button id="bump">hydration check: 0 clicks</button>
</section>`;

// Fallback data used when hydration falls back to a client render
// (`onMismatch: 'rebuild'` — e.g. React StrictMode's dev double-mount).
export const HELLO_DATA = {
    title: 'Hydrated island',
    detail: 'Markup re-rendered client-side (rebuild fallback).',
};

// Island 2 (home) — reactive counter, mounted fresh on the client.
export const COUNTER_TPL = `<section id="root" class="island counter">
    <h3 id="heading">Reactive counter — signal + uiSession.bind</h3>
    <p id="value" class="big">0</p>
    <div id="controls">
        <button id="dec">-1</button>
        <button id="inc">+1</button>
        <button id="zero">reset</button>
    </div>
    <p id="parity">…</p>
</section>`;

// Island 3 (form page) — `form` module + keyed list (uiSession.list).
export const FORM_TPL = `<form id="root" class="island signup" novalidate="novalidate">
    <h3 id="heading">Signup — form module</h3>
    <label id="nameLabel">Name</label>
    <input id="name" autocomplete="off">
    <p id="nameError" class="error"></p>
    <label id="emailLabel">Email</label>
    <input id="email" autocomplete="off">
    <p id="emailError" class="error"></p>
    <button id="send" type="submit">Join</button>
    <p id="state"></p>
    <ul id="entries">\${rows}</ul>
</form>`;

export const ENTRY_TPL = `<li id="row"><strong id="who">#{name}</strong><span id="mail">#{email}</span></li>`;
