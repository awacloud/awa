// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview English catalog of the standalone page — the reference:
 * every key the shell reads is declared here first, and `fr.js` mirrors
 * this shape key for key (pinned by `src/core/i18n.test.js`). The
 * component's own strings are `@awacloud/oview`'s catalogs; the two share
 * no top-level group.
 *
 * Copy rules (awaforge family): second person, one idea per sentence, verb +
 * object on buttons, no exclamation marks, British spelling.
 *
 * @module viewer/i18n/en
 */

export const en = Object.freeze({
    app: {
        name: 'viewer',
        title: 'AWA Viewer',
        tagline: 'Open a document and read it on your device.',
        language: 'Language'
    },
    more: {
        waiting: { one: 'One more file is waiting: {name}.', other: '{count} more files are waiting. Next: {name}.' },
        open: 'Open {name} in a new window',
        dismiss: 'Dismiss'
    },
    pwa: {
        install: 'Install the viewer',
        offline: 'Works offline once visited.',
        updateReady: 'A new version of the viewer is ready.',
        update: 'Update now',
        later: 'Later'
    },
    help: {
        title: 'AWA Viewer — Help',
        close: 'Close (Escape)',
        unavailable: 'The help could not be loaded. Reconnect once, then it stays available offline.'
    },
    about: {
        open: 'About',
        title: 'About AWA Viewer',
        licence: 'Free software under the GNU Affero General Public License, version 3 only (AGPL-3.0-only), also available under a commercial licence. It comes with no warranty. You may share and modify it under the terms of that licence.',
        licenceText: 'Licence text (AGPL-3.0)',
        notice: 'Notices and additional terms',
        check: 'Check for updates',
        checking: 'Checking…',
        current: 'You have the latest version.',
        ready: 'A new version is ready.',
        offline: 'Could not check for updates: you seem to be offline.',
        unavailable: 'This browser cannot check for updates.',
        build: 'build {version}',
        dev: 'development version',
        promo: 'Made by AwaCloud — privacy-first software that runs on your device.',
        promoLink: 'Discover awacloud.com',
        close: 'Close'
    }
});
