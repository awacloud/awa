// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Synthetic descriptor : a per-call inline parser builder.
 *
 * `mdMod` depends on this so `createMd(opts)` can bind opts
 * (extendedAutolinks, sourcepos, smart) on the inline parser instance it
 * builds. Strict factory-only : declares every inline sub-module as a
 * dependency and forwards them to `inlineParser.factory(...)` together
 * with the caller-supplied options.
 *
 * The builder closes over the `inlineParser` descriptor module so each
 * call constructs a fresh, options-bound inline parser instance.
 *
 * @module md/inline/parser-builder
 */

import { inlineParser } from './parser.js';
import { mdErrors } from '../errors.js';
import { mdCommon } from '../common.js';
import { mdInlineRegex } from './regex.js';
import { mdInlineHelpers } from './helpers.js';
import { mdInlineEscapes } from './escapes.js';
import { mdInlineCodeSpan } from './code-span.js';
import { mdInlineAutolink } from './autolink.js';
import { mdInlineAutolinkExt } from './autolink-ext.js';
import { mdInlineDelimiterStack } from './delimiter-stack.js';
import { mdInlineLink } from './link.js';
import { mdInlineLineBreak } from './line-break.js';
import { mdInlineSourcepos } from './sourcepos.js';

export const inlineParserBuilder = {
    name: 'inlineParserBuilder',
    dependencies: [
        'mdErrors',
        'mdCommon',
        'mdInlineRegex',
        'mdInlineHelpers',
        'mdInlineEscapes',
        'mdInlineCodeSpan',
        'mdInlineAutolink',
        'mdInlineAutolinkExt',
        'mdInlineDelimiterStack',
        'mdInlineLink',
        'mdInlineLineBreak',
        'mdInlineSourcepos'
    ],
    deps: [mdErrors, mdCommon, mdInlineRegex, mdInlineHelpers, mdInlineEscapes, mdInlineCodeSpan, mdInlineAutolink, mdInlineAutolinkExt, mdInlineDelimiterStack, mdInlineLink, mdInlineLineBreak, mdInlineSourcepos],
    factory: function (errors, common, regex, helpers, escapes, codeSpan,
                       autolink, autolinkExt, delimiterStack, link,
                       lineBreak, sourcepos) {
        return function (opts) {
            // Scoped disable of the factory-capture rule, ratified for this
            // one case. This builder returns a per-call closure
            // that must re-invoke the sibling `inlineParser` module's own
            // `factory(...)` with the caller's opts, so it references the
            // DESCRIPTOR itself (not a resolved instance) — a plain factory
            // dependency-injection (an instance) cannot express "call this
            // other descriptor's factory again per call". A DI redesign
            // (graphic's `pageflip.fold`/`pageflip.compose` pattern: expose
            // the kernel as its own non-namespaced descriptor and
            // `registerDeep`-inject it) is a possible follow-up, not done
            // here.
            // eslint-disable-next-line fw/no-factory-capture
            return inlineParser.factory(
                errors, common, regex, helpers, escapes, codeSpan,
                autolink, autolinkExt, delimiterStack, link,
                lineBreak, sourcepos, opts || {});
        };
    }
};
