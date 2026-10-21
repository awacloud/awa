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
 * @module viewer/i18n/en
 */

export const en = Object.freeze({
    app: {
        name: 'viewer',
        title: 'AWA Viewer',
        tagline: 'Open a document and read it on your device.',
        privacy: 'Your file stays on this device.',
        region: 'Document viewer',
        regionWith: 'Document viewer: {name}',
        language: 'Language'
    },
    intake: {
        samples: 'No document at hand? Try a sample:',
        title: 'Open a document',
        drop: 'Drop a document here, or',
        choose: 'choose a file',
        formats: 'PDF, Word, Excel, PowerPoint, OpenDocument, Markdown and text files.',
        dropping: 'Release to open the document.',
        onlyFirst: { one: '{name} is open; {count} other file was not opened.', other: '{name} is open; {count} other files were not opened.' }
    },
    more: {
        waiting: { one: 'One more file is waiting: {name}.', other: '{count} more files are waiting. Next: {name}.' },
        open: 'Open {name} in a new window',
        dismiss: 'Dismiss'
    },
    toolbar: {
        help: 'Help',
        label: 'Document tools',
        open: 'Open a document',
        close: 'Close the document',
        prev: 'Previous page',
        next: 'Next page',
        page: 'Page number',
        of: 'of {count}',
        zoomOut: 'Zoom out',
        zoomIn: 'Zoom in',
        zoom: 'Zoom level',
        fitWidth: 'Fit to width',
        fullscreen: 'Full screen',
        exitFullscreen: 'Exit full screen',
        download: 'Download the original',
        info: 'Document details'
    },
    status: {
        opening: 'Opening {name}…',
        rendering: 'Drawing the document…',
        opened: '{name} is open.',
        closed: 'The document is closed.',
        page: 'Page {page} of {count}.',
        zoom: 'Zoom {zoom}.'
    },
    count: {
        pages: { one: '{count} page', other: '{count} pages' },
        slides: { one: '{count} slide', other: '{count} slides' },
        sheets: { one: '{count} sheet', other: '{count} sheets' }
    },
    view: {
        content: 'Document content',
        page: 'Page {page} of {count}',
        slide: 'Slide {page} of {count}',
        sheets: 'Sheets',
        sheetN: 'Sheet {n}',
        noteBack: 'Back to the text',
        emptySheet: 'This sheet is empty.',
        emptyDocument: 'This document has no content to show.',
        image: 'Image',
        imageNamed: 'Image: {name}',
        unavailable: 'Not shown: {what}'
    },
    info: {
        sample: 'Sample provided by AwaCloud',
        title: 'Document details',
        file: 'File',
        format: 'Format',
        size: 'Size',
        length: 'Length',
        docTitle: 'Title',
        author: 'Author',
        omissions: 'What this view leaves out',
        noOmission: 'No omission recorded for this view.',
        omissionCount: { one: '{label} ({count} time)', other: '{label} ({count} times)' }
    },
    format: {
        pdf: 'PDF document',
        docx: 'Word document',
        xlsx: 'Excel workbook',
        pptx: 'PowerPoint presentation',
        odt: 'OpenDocument text',
        ods: 'OpenDocument spreadsheet',
        odp: 'OpenDocument presentation',
        md: 'Markdown text',
        text: 'Plain text',
        'legacy-doc': 'Word 97–2003 document',
        'legacy-xls': 'Excel 97–2003 workbook',
        'legacy-ppt': 'PowerPoint 97–2003 presentation',
        legacy: 'Microsoft Office 97–2003 file',
        encrypted: 'Password-protected file',
        unknown: 'Unknown file type'
    },
    error: {
        pageFailed: 'This page could not be drawn.',
        unsupported: 'This file type is not supported. Open a PDF, an Office or OpenDocument file, Markdown or text.',
        legacy: 'This is an older Microsoft Office file. The viewer cannot open it yet. Save it as .docx, .xlsx or .pptx, then open it again.',
        encrypted: 'This document is protected by a password. The viewer cannot open it.',
        encryptedUnsupported: 'This document is encrypted in a way the viewer cannot read yet.',
        read: 'This file could not be read. It may be damaged, or not a real {format}.',
        fileUnreadable: 'This file could not be read from your device. Check that it is still there, then try again.',
        tooLarge: 'This document is too large or too complex for the viewer: opening it would take too much memory or time.',
        empty: 'This file is empty.',
        source: 'This document could not be loaded.',
        tryAnother: 'Try another file'
    },
    omission: {
        'page/failed': 'pages that could not be drawn',
        'text/truncated': 'the end of a very long text (the first 5 million characters are shown)',
        'md/remote-image': 'images (a Markdown file only points to them; not loaded, for your privacy)',
        'md/too-complex': 'Markdown formatting (nested too deeply: shown as plain text)',
        'pdf/shading': 'colour gradients',
        'pdf/soft-mask': 'transparency masks',
        'pdf/pattern': 'patterned fills',
        'pdf/image-jpx': 'JPEG 2000 images',
        'pdf/image-undecodable': 'images in an unsupported encoding',
        'pdf/colorspace': 'special colour spaces (shown as an approximation)',
        'pdf/font-substituted': 'embedded fonts (text drawn with a similar font)',
        'pdf/text-undecodable': 'characters with no known text',
        'pdf/form-depth': 'deeply nested drawings',
        'pdf/too-complex': 'the end of over-complex pages',
        'pdf/operator': 'damaged drawing instructions',
        'pdf/annotation': 'annotations and form fields',
        'pdf/content-undecodable': 'damaged page content',
        'doc/chart': 'charts',
        'doc/shape': 'drawn shapes',
        'doc/math': 'equations',
        'doc/header-footer': 'headers and footers',
        'doc/footnote': 'footnotes',
        'doc/comment': 'comments',
        'doc/image-missing': 'missing images',
        'image/format': 'pictures in a format the browser cannot show (EMF, WMF, TIFF)',
        'sheet/truncated': 'rows and columns past the first 2,000 rows, 200 columns or 100,000 cells of a sheet',
        'sheet/chart': 'charts',
        'sheet/image': 'images placed over cells',
        'sheet/formula': 'formulas (the last saved values are shown)',
        'slide/chart': 'charts',
        'slide/table': 'tables',
        'slide/effect': 'shadows and effects',
        'slide/gradient': 'gradient fills (shown as a solid colour)',
        'slide/geometry': 'shape outlines (shown as boxes)',
        'slide/notes': 'speaker notes',
        'slide/media': 'audio and video'
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
