// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { easing } from './easing.js';

describe('easing module', () => {
    test('should have correct module metadata', () => {
        expect(easing.name).toBe('easing');
        expect(easing.dependencies).toEqual([]);
        expect(typeof easing.factory).toBe('function');
    });

    describe('factory', () => {
        let ease;

        test('should create easing functions object', () => {
            ease = easing.factory();
            expect(ease).toBeDefined();
            expect(typeof ease).toBe('object');
        });

        describe('linear', () => {
            test('should interpolate linearly', () => {
                ease = easing.factory();
                expect(ease.linear(0, 0, 100, 100)).toBe(0);
                expect(ease.linear(50, 0, 100, 100)).toBe(50);
                expect(ease.linear(100, 0, 100, 100)).toBe(100);
            });

            test('should work with different start values', () => {
                ease = easing.factory();
                expect(ease.linear(50, 10, 80, 100)).toBe(50);
            });
        });

        describe('quadratic easing', () => {
            test('easeInQuad should accelerate', () => {
                ease = easing.factory();
                const quarter = ease.easeInQuad(25, 0, 100, 100);
                const half = ease.easeInQuad(50, 0, 100, 100);
                expect(quarter).toBeLessThan(25);
                expect(half).toBeLessThan(50);
            });

            test('easeOutQuad should decelerate', () => {
                ease = easing.factory();
                const quarter = ease.easeOutQuad(25, 0, 100, 100);
                const half = ease.easeOutQuad(50, 0, 100, 100);
                expect(quarter).toBeGreaterThan(25);
                expect(half).toBeGreaterThan(50);
            });

            test('easeInOutQuad should accelerate then decelerate', () => {
                ease = easing.factory();
                const quarter = ease.easeInOutQuad(25, 0, 100, 100);
                const half = ease.easeInOutQuad(50, 0, 100, 100);
                const threeQuarter = ease.easeInOutQuad(75, 0, 100, 100);
                expect(quarter).toBeLessThan(25);
                expect(half).toBe(50);
                expect(threeQuarter).toBeGreaterThan(75);
            });
        });

        describe('cubic easing', () => {
            test('easeInCubic should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInCubic(50, 0, 100, 100);
                expect(typeof result).toBe('number');
                expect(result).toBeGreaterThan(0);
                expect(result).toBeLessThan(100);
            });

            test('easeOutCubic should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutCubic(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutCubic should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutCubic(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('quartic easing', () => {
            test('easeInQuart should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInQuart(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutQuart should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutQuart(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutQuart should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutQuart(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('quintic easing', () => {
            test('easeInQuint should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInQuint(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutQuint should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutQuint(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutQuint should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutQuint(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('sinusoidal easing', () => {
            test('easeInSine should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInSine(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutSine should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutSine(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutSine should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutSine(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('exponential easing', () => {
            test('easeInExpo should handle t=0', () => {
                ease = easing.factory();
                expect(ease.easeInExpo(0, 0, 100, 100)).toBe(0);
            });

            test('easeInExpo should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInExpo(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutExpo should handle t=d', () => {
                ease = easing.factory();
                expect(ease.easeOutExpo(100, 0, 100, 100)).toBe(100);
            });

            test('easeOutExpo should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutExpo(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutExpo should handle edge cases', () => {
                ease = easing.factory();
                expect(ease.easeInOutExpo(0, 0, 100, 100)).toBe(0);
                expect(ease.easeInOutExpo(100, 0, 100, 100)).toBe(100);
            });

            test('easeInOutExpo should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutExpo(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('circular easing', () => {
            test('easeInCirc should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInCirc(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutCirc should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutCirc(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutCirc should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutCirc(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('elastic easing', () => {
            test('easeInElastic should handle t=0', () => {
                ease = easing.factory();
                expect(ease.easeInElastic(0, 0, 100, 100)).toBe(0);
            });

            test('easeInElastic should handle t=d', () => {
                ease = easing.factory();
                expect(ease.easeInElastic(100, 0, 100, 100)).toBe(100);
            });

            test('easeInElastic should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInElastic(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutElastic should handle t=0', () => {
                ease = easing.factory();
                expect(ease.easeOutElastic(0, 0, 100, 100)).toBe(0);
            });

            test('easeOutElastic should handle t=d', () => {
                ease = easing.factory();
                expect(ease.easeOutElastic(100, 0, 100, 100)).toBe(100);
            });

            test('easeOutElastic should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutElastic(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutElastic should handle t=0', () => {
                ease = easing.factory();
                expect(ease.easeInOutElastic(0, 0, 100, 100)).toBe(0);
            });

            test('easeInOutElastic should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutElastic(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('back easing', () => {
            test('easeInBack should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInBack(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutBack should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutBack(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutBack should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutBack(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });
        });

        describe('bounce easing', () => {
            test('easeInBounce should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInBounce(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutBounce should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeOutBounce(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeOutBounce should handle different time ranges', () => {
                ease = easing.factory();
                const early = ease.easeOutBounce(10, 0, 100, 100);
                const mid = ease.easeOutBounce(50, 0, 100, 100);
                const late = ease.easeOutBounce(90, 0, 100, 100);
                expect(typeof early).toBe('number');
                expect(typeof mid).toBe('number');
                expect(typeof late).toBe('number');
            });

            test('easeInOutBounce should exist and return number', () => {
                ease = easing.factory();
                const result = ease.easeInOutBounce(50, 0, 100, 100);
                expect(typeof result).toBe('number');
            });

            test('easeInOutBounce should handle both halves', () => {
                ease = easing.factory();
                const firstHalf = ease.easeInOutBounce(25, 0, 100, 100);
                const secondHalf = ease.easeInOutBounce(75, 0, 100, 100);
                expect(typeof firstHalf).toBe('number');
                expect(typeof secondHalf).toBe('number');
            });
        });

        describe('all easing functions boundaries', () => {
            test('all functions should start at begin value when t=0', () => {
                ease = easing.factory();
                const b = 10;
                const c = 80;
                const d = 100;

                expect(ease.linear(0, b, c, d)).toBe(b);
                expect(ease.easeInQuad(0, b, c, d)).toBe(b);
                expect(ease.easeOutQuad(0, b, c, d)).toBe(b);
                expect(ease.easeInOutQuad(0, b, c, d)).toBe(b);
                expect(ease.easeInCubic(0, b, c, d)).toBe(b);
                expect(ease.easeOutCubic(0, b, c, d)).toBe(b);
                expect(ease.easeInSine(0, b, c, d)).toBeCloseTo(b, 5);
                expect(ease.easeOutSine(0, b, c, d)).toBe(b);
            });

            test('all functions should end at begin + change when t=d', () => {
                ease = easing.factory();
                const b = 10;
                const c = 80;
                const d = 100;
                const expected = b + c;

                expect(ease.linear(d, b, c, d)).toBe(expected);
                expect(ease.easeInQuad(d, b, c, d)).toBeCloseTo(expected, 5);
                expect(ease.easeOutQuad(d, b, c, d)).toBeCloseTo(expected, 5);
                expect(ease.easeInOutQuad(d, b, c, d)).toBeCloseTo(expected, 5);
                expect(ease.easeInCubic(d, b, c, d)).toBeCloseTo(expected, 5);
                expect(ease.easeOutCubic(d, b, c, d)).toBe(expected);
                expect(ease.easeInSine(d, b, c, d)).toBeCloseTo(expected, 5);
                expect(ease.easeOutSine(d, b, c, d)).toBeCloseTo(expected, 5);
            });
        });

        describe('factory isolation', () => {
            test('multiple factory calls should return independent instances', () => {
                const ease1 = easing.factory();
                const ease2 = easing.factory();

                expect(ease1).not.toBe(ease2);
                expect(ease1.linear).toBeDefined();
                expect(ease2.linear).toBeDefined();
            });
        });
    });
});
