// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The details panel: what the file is, and what the view
 * leaves out (the omission ledger, honest-reporting rule — an empty ledger
 * says "no omission recorded", never "nothing lost").
 *
 * @module viewer/ui/info
 */
import { h } from '../render/dom.js';

/**
 * Human file size in the active locale (`12.4 kB`, `3.1 MB`).
 * @param {number} bytes
 * @param {(v: number, o?: Intl.NumberFormatOptions) => string} number
 */
export function fileSize(bytes, number) {
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];
    let v = bytes;
    let u = 0;
    while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
    return number(v, { style: 'unit', unit: units[u], unitDisplay: 'short', maximumFractionDigits: u ? 1 : 0 });
}

/**
 * @param {{id: string, t: (k: string, p?: object) => string,
 *   tn: (k: string, n: number, p?: object) => string,
 *   number: (v: number, o?: Intl.NumberFormatOptions) => string}} opts
 */
export function createInfo({ id, t, tn, number }) {
    const title = h('h2', { class: 'awv-info-title', id: `${id}-info-title` });
    const body = h('div', { class: 'awv-info-body' });
    const element = h('aside', {
        class: 'awv-info', id: `${id}-info`, 'aria-labelledby': title.id, hidden: true
    }, [title, body]);

    /** @type {{name: string, size: number, format: string, view: import('../render/view.js').View, sample?: boolean}|null} */
    let last = null;

    function render() {
        title.textContent = t('info.title');
        if (!last) { body.replaceChildren(); return; }
        const { name, size, format, view } = last;
        const rows = [
            ['info.file', name],
            ['info.format', t(`format.${format}`)],
            ['info.size', fileSize(size, number)]
        ];
        if (view.kind === 'paged') {
            rows.push(['info.length', tn(view.pageLabel === 'slide' ? 'count.slides' : 'count.pages', view.pages?.length || 0)]);
        } else if (view.kind === 'sheets') {
            rows.push(['info.length', tn('count.sheets', view.sheets?.length || 0)]);
        }
        if (view.meta?.title) rows.push(['info.docTitle', view.meta.title]);
        if (view.meta?.author) rows.push(['info.author', view.meta.author]);

        const omissionsTitle = h('h3', { class: 'awv-info-subtitle', text: t('info.omissions') });
        const omissions = view.omissions.length
            ? h('ul', { class: 'awv-info-list' }, view.omissions.map(({ code, count }) => {
                const key = `omission.${code}`;
                const label = t(key) === key ? code : t(key);
                return h('li', { text: tn('info.omissionCount', count, { label }) });
            }))
            : h('p', { class: 'awv-note', text: t('info.noOmission') });

        body.replaceChildren(
            h('dl', { class: 'awv-kv' }, rows.flatMap(([k, v]) => [h('dt', { text: t(k) }), h('dd', { text: v })])),
            ...(last.sample ? [h('p', { class: 'awv-note', text: t('info.sample') })] : []),
            omissionsTitle,
            omissions
        );
    }

    return {
        element,
        get open() { return !element.hidden; },
        /** @param {boolean} open */
        toggle(open) {
            element.hidden = !open;
            // Paged views count omissions as pages draw: refresh on open.
            if (open) render();
        },
        /** @param {typeof last} next */
        set(next) { last = next; render(); },
        label: render
    };
}
