// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Post-pass that backfills `sourcepos` on inline nodes
 * left without one after the main inline parse.
 *
 * Exposed both as a factory descriptor (`mdInlineSourcepos`) and as a
 * direct named export (`backfillSourcepos`).
 *
 * @module md/inline/sourcepos
 */

export const mdInlineSourcepos = {
    name: 'mdInlineSourcepos',
    dependencies: [],
    factory() {
        /**
         * Backfill `sourcepos` on every descendant of `root` that lacks one.
         * Idempotent.
         */
        function backfillSourcepos(root) {
            function visit(n) {
                let c = n.firstChild;
                while (c) { visit(c); c = c.next; }
                if (!n.sourcepos && n.firstChild) {
                    const first = n.firstChild;
                    let last = n.lastChild;
                    while (last && !last.sourcepos) last = last.prev;
                    if (first.sourcepos && last && last.sourcepos) {
                        n.sourcepos = [first.sourcepos[0].slice(), last.sourcepos[1].slice()];
                    }
                }
                if (!n.sourcepos && n.parent && n.parent.sourcepos) {
                    n.sourcepos = [n.parent.sourcepos[0].slice(), n.parent.sourcepos[1].slice()];
                }
            }
            let c = root.firstChild;
            while (c) { visit(c); c = c.next; }
        }

        return { backfillSourcepos };
    }
};
