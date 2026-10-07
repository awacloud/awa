// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: strict sandbox linter for active-content PDF
 * features.
 *
 * @module pdf/extra/pdf-sandbox
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';

export const pdfSandbox = {
    name: 'pdfSandbox',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ContractError } = errors;

        const ACTIVE_KINDS = {
            Launch:       { severity: 'error',
                            message: '/Launch action present — external execution '
                                + 'requested by document' },
            JavaScript:   { severity: 'error',
                            message: '/JavaScript action present — script '
                                + 'execution requested by document' },
            ImportData:   { severity: 'error',
                            message: '/ImportData action present — file-system '
                                + 'read requested by document' },
            SubmitForm:   { severity: 'warning',
                            message: '/SubmitForm action present — network '
                                + 'submission requested by document' },
            Rendition:    { severity: 'warning',
                            message: '/Rendition action carries /JS payload' },
            URI:          { severity: 'warning',
                            message: '/URI action present — external navigation '
                                + 'requested by document' }
        };

        function lintAction(rec) {
            if (!rec || typeof rec !== 'object') return null;
            if (rec.kind === 'Rendition' && !rec.sandboxed) return null;
            const profile = ACTIVE_KINDS[rec.kind];
            if (!profile) return null;
            return {
                kind: rec.kind,
                code: 'pdf/sandbox/active-' + rec.kind.toLowerCase(),
                severity: profile.severity,
                message: profile.message,
                context: { sandboxed: rec.sandboxed === true }
            };
        }

        function lintActions(records) {
            if (!records || typeof records[Symbol.iterator] !== 'function') {
                throw new ContractError('pdf/sandbox/bad-input',
                    'lintActions expects an iterable of action records');
            }
            const issues = [];
            let hasErrors = false;
            for (const rec of records) {
                const issue = lintAction(rec);
                if (issue) {
                    issues.push(issue);
                    if (issue.severity === 'error') hasErrors = true;
                }
            }
            return {
                sandboxed: true,
                issues,
                hasActiveContent: issues.length > 0,
                hasErrors
            };
        }

        return {
            lintAction,
            lintActions,
            ACTIVE_KINDS
        };
    }
};

