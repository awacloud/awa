// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { geom } from './geom.js';
import { linalg } from './linalg.js';

describe('geom module', () => {
    test('should have correct module metadata', () => {
        expect(geom.name).toBe('geom');
        expect(geom.dependencies).toEqual(['linalg']);
        expect(typeof geom.factory).toBe('function');
    });

    describe('factory', () => {
        const { Point, Rect, Circle, Line, Polygon, hitTest, transform } = geom.factory(linalg.factory());

        describe('Point', () => {
            test('distance 3-4-5', () => {
                expect(Point.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
            });
            test('midpoint', () => {
                const m = Point.midpoint({ x: 0, y: 0 }, { x: 4, y: 2 });
                expect(m).toEqual({ x: 2, y: 1 });
            });
            test('equals', () => {
                expect(Point.equals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
                expect(Point.equals({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
            });
        });

        describe('Rect', () => {
            const r = Rect.create(0, 0, 10, 10);
            test('contains inside', () => expect(Rect.contains(r, { x: 5, y: 5 })).toBe(true));
            test('contains left edge (inclusive)', () => expect(Rect.contains(r, { x: 0, y: 5 })).toBe(true));
            test('contains right edge (exclusive)', () => expect(Rect.contains(r, { x: 10, y: 5 })).toBe(false));
            test('contains outside', () => expect(Rect.contains(r, { x: 15, y: 5 })).toBe(false));

            test('intersects overlapping', () => {
                expect(Rect.intersects(Rect.create(0, 0, 5, 5), Rect.create(3, 3, 5, 5))).toBe(true);
            });
            test('intersects disjoint', () => {
                expect(Rect.intersects(Rect.create(0, 0, 5, 5), Rect.create(10, 10, 5, 5))).toBe(false);
            });
            test('intersects touching edge is disjoint', () => {
                expect(Rect.intersects(Rect.create(0, 0, 5, 5), Rect.create(5, 0, 5, 5))).toBe(false);
            });

            test('intersection returns overlap', () => {
                const i = Rect.intersection(Rect.create(0, 0, 10, 10), Rect.create(5, 5, 10, 10));
                expect(i).toEqual({ x: 5, y: 5, w: 5, h: 5 });
            });
            test('intersection null when no overlap', () => {
                expect(Rect.intersection(Rect.create(0, 0, 5, 5), Rect.create(10, 10, 5, 5))).toBeNull();
            });

            test('union covers both', () => {
                const u = Rect.union(Rect.create(0, 0, 5, 5), Rect.create(3, 3, 10, 10));
                expect(u).toEqual({ x: 0, y: 0, w: 13, h: 13 });
            });

            test('area', () => expect(Rect.area(r)).toBe(100));
            test('center', () => expect(Rect.center(r)).toEqual({ x: 5, y: 5 }));
            test('normalize flips negative w/h', () => {
                const n = Rect.normalize({ x: 5, y: 5, w: -5, h: -3 });
                expect(n.w).toBe(5); expect(n.h).toBe(3);
                expect(n.x).toBe(0); expect(n.y).toBe(2);
            });
        });

        describe('Circle', () => {
            const c = Circle.create(0, 0, 5);
            test('contains inside', () => expect(Circle.contains(c, { x: 3, y: 4 })).toBe(true));
            test('contains on boundary', () => expect(Circle.contains(c, { x: 5, y: 0 })).toBe(true));
            test('contains outside', () => expect(Circle.contains(c, { x: 4, y: 4 })).toBe(false));

            test('intersectsCircle overlapping', () => {
                expect(Circle.intersectsCircle(Circle.create(0, 0, 3), Circle.create(5, 0, 3))).toBe(true);
            });
            test('intersectsCircle disjoint', () => {
                expect(Circle.intersectsCircle(Circle.create(0, 0, 1), Circle.create(10, 0, 1))).toBe(false);
            });

            test('intersectsRect inside', () => {
                expect(Circle.intersectsRect(Circle.create(5, 5, 2), Rect.create(0, 0, 10, 10))).toBe(true);
            });
            test('intersectsRect outside', () => {
                expect(Circle.intersectsRect(Circle.create(20, 20, 1), Rect.create(0, 0, 10, 10))).toBe(false);
            });
        });

        describe('Line', () => {
            test('length', () => {
                expect(Line.length(Line.create(0, 0, 3, 4))).toBe(5);
            });

            test('intersects crossing', () => {
                expect(Line.intersects(Line.create(0, 0, 2, 2), Line.create(0, 2, 2, 0))).toBe(true);
            });
            test('intersects parallel', () => {
                expect(Line.intersects(Line.create(0, 0, 2, 0), Line.create(0, 1, 2, 1))).toBe(false);
            });
            test('intersects non-crossing', () => {
                expect(Line.intersects(Line.create(0, 0, 1, 1), Line.create(2, 0, 3, 1))).toBe(false);
            });

            test('intersection point', () => {
                const p = Line.intersection(Line.create(0, 0, 2, 2), Line.create(0, 2, 2, 0));
                expect(Math.abs(p.x - 1) < 1e-5 && Math.abs(p.y - 1) < 1e-5).toBe(true);
            });
            test('intersection null for non-crossing', () => {
                expect(Line.intersection(Line.create(0, 0, 1, 0), Line.create(0, 1, 1, 1))).toBeNull();
            });

            test('distanceToPoint', () => {
                expect(Line.distanceToPoint(Line.create(0, 0, 10, 0), { x: 5, y: 3 })).toBeCloseTo(3);
            });

            test('closestPoint on line', () => {
                const p = Line.closestPoint(Line.create(0, 0, 10, 0), { x: 5, y: 3 });
                expect(Math.abs(p.x - 5) < 1e-5 && Math.abs(p.y) < 1e-5).toBe(true);
            });
        });

        describe('Polygon', () => {
            const square = Polygon.create([
                { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }
            ]);

            test('area of square', () => expect(Math.abs(Polygon.area(square))).toBe(100));
            test('contains inside', () => expect(Polygon.contains(square, { x: 5, y: 5 })).toBe(true));
            test('contains outside', () => expect(Polygon.contains(square, { x: 15, y: 5 })).toBe(false));

            test('bbox', () => {
                const bb = Polygon.bbox(square);
                expect(bb).toEqual({ x: 0, y: 0, w: 10, h: 10 });
            });

            test('simplify reduces points', () => {
                const zigzag = Polygon.create([
                    {x:0,y:0},{x:1,y:0.1},{x:2,y:0},{x:3,y:0.1},{x:4,y:0},{x:5,y:0}
                ]);
                const simplified = Polygon.simplify(zigzag, 0.5);
                expect(simplified.points.length).toBeLessThan(zigzag.points.length);
            });

            test('isCcw', () => {
                const ccw = Polygon.create([{x:0,y:0},{x:1,y:0},{x:0.5,y:1}]);
                const cw = Polygon.create([{x:0,y:0},{x:0.5,y:1},{x:1,y:0}]);
                expect(Polygon.isCcw(ccw)).toBe(true);
                expect(Polygon.isCcw(cw)).toBe(false);
            });
        });

        describe('hitTest', () => {
            test('Rect', () => expect(hitTest(Rect.create(0, 0, 5, 5), { x: 2, y: 2 })).toBe(true));
            test('Circle', () => expect(hitTest(Circle.create(0, 0, 5), { x: 3, y: 4 })).toBe(true));
        });

        describe('transform', () => {
            test('identity transform', () => {
                const { mat3 } = linalg.factory();
                const m = mat3.create();
                const p = transform({ x: 3, y: 4 }, m);
                expect(Math.abs(p.x - 3) < 1e-5 && Math.abs(p.y - 4) < 1e-5).toBe(true);
            });
        });
    });
});
