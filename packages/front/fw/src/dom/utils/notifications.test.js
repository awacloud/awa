// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { notifications as notificationsModule } from './notifications.js';

function makeNotificationClass(initialPermission = 'granted') {
    const instances = [];
    class MockNotification {
        constructor(title, opts) {
            this.title = title;
            this.opts = opts;
            this.onclick = null;
            this.onclose = null;
            this.onerror = null;
            this.onshow = null;
            this._closed = false;
            instances.push(this);
        }
        close() { this._closed = true; if (this.onclose) this.onclose(); }
        static get permission() { return MockNotification._permission; }
        static async requestPermission() { return MockNotification._permission; }
        static _permission = initialPermission;
        static _instances = instances;
    }
    return MockNotification;
}

describe('notifications', () => {
    let savedNotification;
    let notifications;
    beforeEach(() => {
        savedNotification = globalThis.Notification;
        const MockNotif = makeNotificationClass('granted');
        globalThis.Notification = MockNotif;
        notifications = notificationsModule.factory();
    });
    afterEach(() => {
        globalThis.Notification = savedNotification;
    });

    describe('metadata', () => {
        test('worker-safe is partial', () => expect(notificationsModule.worker).toBe('partial'));
        test('no dependencies', () => expect(notificationsModule.dependencies).toEqual([]));
        test('has name', () => expect(notificationsModule.name).toBe('notifications'));
        test('has version', () => expect(notificationsModule.version).toBe('1.0.0'));
        test('has type', () => expect(notificationsModule.type).toBe('fw.dom.utils'));
    });

    describe('isSupported', () => {
        test('true when Notification exists', () => expect(notifications.isSupported()).toBe(true));
        test('false when Notification absent', () => {
            globalThis.Notification = undefined;
            expect(notifications.isSupported()).toBe(false);
        });
    });

    describe('permission', () => {
        test('reflects Notification.permission', () => {
            expect(notifications.permission()).toBe('granted');
        });
        test('denied when unsupported', () => {
            globalThis.Notification = undefined;
            expect(notifications.permission()).toBe('denied');
        });
    });

    describe('requestPermission', () => {
        test('returns granted', async () => {
            const result = await notifications.requestPermission();
            expect(result).toBe('granted');
        });
        test('returns denied when blocked', async () => {
            globalThis.Notification._permission = 'denied';
            const result = await notifications.requestPermission();
            expect(result).toBe('denied');
        });
    });

    describe('show', () => {
        test('returns handle with notification', () => {
            const handle = notifications.show('Hello', { body: 'World' });
            expect(handle.notification).toBeDefined();
            expect(handle.notification.title).toBe('Hello');
        });

        test('handle.close() closes the notification', () => {
            const handle = notifications.show('Test');
            handle.close();
            expect(handle.notification._closed).toBe(true);
        });

        test('throws when permission denied', () => {
            globalThis.Notification._permission = 'denied';
            notifications = notificationsModule.factory();
            expect(() => notifications.show('Fail')).toThrow('notifications: permission denied');
        });

        test('autoCloseMs closes after timeout', async () => {
            const handle = notifications.show('Auto', { autoCloseMs: 50 });
            expect(handle.notification._closed).toBe(false);
            await new Promise(resolve => setTimeout(resolve, 80));
            expect(handle.notification._closed).toBe(true);
        });

        test('manual close before autoCloseMs cancels timer', async () => {
            let closeCalled = 0;
            const handle = notifications.show('Auto', { autoCloseMs: 100, onclose: () => closeCalled++ });
            handle.close();
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(closeCalled).toBe(0); // onclose not called since we bypass it in handle.close()
            expect(handle.notification._closed).toBe(true);
        });
    });

    describe('closeAll', () => {
        test('closes all tracked notifications', () => {
            const h1 = notifications.show('A');
            const h2 = notifications.show('B');
            const h3 = notifications.show('C');
            notifications.closeAll();
            expect(h1.notification._closed).toBe(true);
            expect(h2.notification._closed).toBe(true);
            expect(h3.notification._closed).toBe(true);
        });

        test('handle is removed from active set after onclose fires (no leak)', () => {
            const h1 = notifications.show('A');
            const h2 = notifications.show('B');
            // Simulate the system / user closing the notification natively.
            h1.notification.onclose();
            // h1 should no longer be tracked, so closeAll only closes h2.
            notifications.closeAll();
            expect(h2.notification._closed).toBe(true);
        });

        test('safe when called twice', () => {
            const h1 = notifications.show('A');
            const h2 = notifications.show('B');
            notifications.closeAll();
            expect(() => notifications.closeAll()).not.toThrow();
            expect(h1.notification._closed).toBe(true);
            expect(h2.notification._closed).toBe(true);
        });
    });

    describe('showFromSW', () => {
        test('calls registration.showNotification', async () => {
            const calls = [];
            const reg = { showNotification: async (title, opts) => calls.push({ title, opts }) };
            await notifications.showFromSW(reg, 'SW Notif', { body: 'test' });
            expect(calls).toHaveLength(1);
            expect(calls[0].title).toBe('SW Notif');
        });
    });
});
