// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview English catalog — the reference: every key the UI reads is
 * declared here first, and `fr.js` mirrors this shape key for key (pinned by
 * `src/core/i18n.test.js`).
 *
 * Copy rules (awaforge family): second person, one idea per sentence, verb +
 * object on buttons, no exclamation marks, British spelling.
 *
 * @module notepad/i18n/en
 */

export const en = Object.freeze({
    app: {
        title: 'AWA Notepad',
        tagline: 'Write and edit text files on your device.',
        region: 'Text editor',
        regionWith: 'Text editor: {name}',
        language: 'Language'
    },
    doc: {
        untitled: 'Untitled',
        nameField: 'File name',
        modified: '(modified)',
        text: 'Text'
    },
    toolbar: {
        help: 'Help',
        label: 'Editor tools',
        new: 'New (Ctrl+N)',
        rename: 'Rename “{name}”',
        download: 'Download a copy (Ctrl+S)',
        downloadAs: 'Download a copy under another name (Ctrl+Shift+S)',
        open: 'Open a file (Ctrl+O)',
        save: 'Save (Ctrl+S)',
        saveAs: 'Save as (Ctrl+Shift+S)',
        find: 'Find (Ctrl+F)',
        replace: 'Replace (Ctrl+H)',
        goto: 'Go to line (Ctrl+G)',
        wrap: 'Word wrap',
        zoomOut: 'Smaller text',
        zoomIn: 'Larger text'
    },
    find: {
        label: 'Find and replace',
        find: 'Find',
        replace: 'Replace with',
        matchCase: 'Match case',
        prev: 'Find previous (Shift+F3)',
        next: 'Find next (F3)',
        replaceOne: 'Replace',
        replaceAll: 'Replace all',
        close: 'Close (Escape)',
        count: 'Match {index} of {count}',
        notFound: 'Cannot find “{query}”.',
        replaced: { one: '{count} match replaced.', other: '{count} matches replaced.' }
    },
    goto: {
        label: 'Go to line',
        line: 'Line number',
        go: 'Go to',
        close: 'Close (Escape)',
        beyond: 'The line number is beyond the total number of lines ({count}).'
    },
    status: {
        label: 'Document status',
        position: 'Ln {line}, Col {col}',
        chars: { one: '{count} character', other: '{count} characters' },
        zoom: 'Text size {zoom}',
        eol: 'Line endings',
        encoding: 'Encoding',
        opened: '{name} is open.',
        opening: 'Opening {name}… {percent}',
        cancel: 'Cancel',
        openCancelled: 'Opening {name} was cancelled.',
        largeFile: 'Large file: typing may be slow.',
        renamed: 'The file is now named {name}.',
        renamedNext: 'The next save is named {name}.',
        downloadNote: 'Saved as a copy in your downloads: this browser cannot write to the file itself.',
        saved: '{name} is saved.',
        downloaded: '{name} is downloaded.',
        newDoc: 'New document.',
        restored: 'Unsaved text restored.'
    },
    eol: {
        crlf: 'Windows (CRLF)',
        lf: 'Unix (LF)',
        cr: 'Macintosh (CR)'
    },
    encoding: {
        'utf-8': 'UTF-8',
        'utf-8-bom': 'UTF-8 with BOM',
        'utf-16le': 'UTF-16 LE',
        'utf-16be': 'UTF-16 BE',
        'windows-1252': 'Windows-1252 (ANSI)'
    },
    ask: {
        title: 'AWA Notepad',
        unsaved: 'Do you want to save the changes to {name}?',
        save: 'Save',
        discard: 'Don’t save',
        cancel: 'Cancel',
        ok: 'OK',
        lossy: { one: '{count} character cannot be written in {encoding}: it would be saved as “?”.', other: '{count} characters cannot be written in {encoding}: they would be saved as “?”.' },
        lossyUtf8: 'Save as UTF-8',
        lossyKeep: 'Save anyway'
    },
    error: {
        binary: '{name} is not a text file. Opening it here could damage it.',
        tooLarge: '{name} is too large to edit here (over {size}).',
        read: '{name} could not be read.',
        write: '{name} could not be saved. Check that you may write to it, then try again.',
        rename: '{name} could not be renamed {next}. Use Save as to save it under the new name.'
    },
    more: {
        notOpened: { one: '{count} other file was not opened.', other: '{count} other files were not opened.' },
        waiting: { one: 'One more file is waiting: {name}.', other: '{count} more files are waiting. Next: {name}.' },
        open: 'Open {name} in a new window',
        dismiss: 'Dismiss'
    },
    pwa: {
        install: 'Install the notepad',
        offline: 'Works offline once visited.',
        updateReady: 'A new version of the notepad is ready. Updating reloads it; unsaved text comes back as a draft.',
        update: 'Update now',
        later: 'Later'
    },
    help: {
        title: 'AWA Notepad — Help',
        close: 'Close (Escape)',
        unavailable: 'The help could not be loaded. Reconnect once, then it stays available offline.'
    },
    about: {
        open: 'About',
        title: 'About AWA Notepad',
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
