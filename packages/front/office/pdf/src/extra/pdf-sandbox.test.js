// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSandbox } from './pdf-sandbox.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ContractError } = _errors;
const { lintAction, lintActions } = pdfSandbox.factory(_errors);
describe('lintAction', () => {
    test('reports Launch as error', () => {
        const r = lintAction({ kind: 'Launch', sandboxed: true });
        expect(r.kind).toBe('Launch');
        expect(r.severity).toBe('error');
        expect(r.code).toBe('pdf/sandbox/active-launch');
    });

    test('reports JavaScript as error', () => {
        const r = lintAction({ kind: 'JavaScript', sandboxed: true });
        expect(r.severity).toBe('error');
    });

    test('reports ImportData as error', () => {
        const r = lintAction({ kind: 'ImportData', sandboxed: true });
        expect(r.severity).toBe('error');
    });

    test('reports SubmitForm as warning', () => {
        const r = lintAction({ kind: 'SubmitForm', sandboxed: true });
        expect(r.severity).toBe('warning');
    });

    test('reports URI as warning', () => {
        const r = lintAction({ kind: 'URI' });
        expect(r.severity).toBe('warning');
    });

    test('ignores benign actions', () => {
        expect(lintAction({ kind: 'GoTo' })).toBe(null);
        expect(lintAction({ kind: 'Named' })).toBe(null);
    });

    test('skips Rendition without /JS payload', () => {
        expect(lintAction({ kind: 'Rendition', sandboxed: false }))
            .toBe(null);
    });

    test('flags Rendition with /JS payload', () => {
        const r = lintAction({ kind: 'Rendition', sandboxed: true });
        expect(r.severity).toBe('warning');
    });

    test('returns null for non-objects', () => {
        expect(lintAction(null)).toBe(null);
        expect(lintAction('Launch')).toBe(null);
    });
});

describe('lintActions', () => {
    test('aggregates issues over an iterable', () => {
        const list = [
            { kind: 'Launch', sandboxed: true },
            { kind: 'GoTo' },
            { kind: 'URI' }
        ];
        const r = lintActions(list);
        expect(r.sandboxed).toBe(true);
        expect(r.issues.length).toBe(2);
        expect(r.hasActiveContent).toBe(true);
        expect(r.hasErrors).toBe(true);
    });

    test('returns clean report for benign actions', () => {
        const r = lintActions([{ kind: 'GoTo' }, { kind: 'Named' }]);
        expect(r.issues).toEqual([]);
        expect(r.hasActiveContent).toBe(false);
        expect(r.hasErrors).toBe(false);
    });

    test('throws ContractError on non-iterable input', () => {
        expect(() => lintActions(null)).toThrow(ContractError);
        expect(() => lintActions(42)).toThrow(ContractError);
    });

    test('hasErrors is false when only warnings present', () => {
        const r = lintActions([{ kind: 'URI' }, { kind: 'SubmitForm' }]);
        expect(r.hasErrors).toBe(false);
        expect(r.hasActiveContent).toBe(true);
    });
});

describe('pdfSandbox module', () => {
    test('exposes module metadata', () => {
        expect(pdfSandbox.name).toBe('pdfSandbox');
        expect(pdfSandbox.dependencies).toEqual(['pdfErrors']);
        expect(typeof pdfSandbox.factory).toBe('function');
    });

    test('factory returns expected API', () => {
        const api = pdfSandbox.factory(_pdfErrors_TD1);
        expect(typeof api.lintAction).toBe('function');
        expect(typeof api.lintActions).toBe('function');
        expect(typeof api.ACTIVE_KINDS).toBe('object');
    });
});
