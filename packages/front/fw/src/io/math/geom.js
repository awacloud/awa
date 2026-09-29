// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * 2D geometry primitives - Point, Rect, Circle, Line, Polygon. Hit-testing, intersection.
 * Depends on linalg for transform helper.
 */
import { linalg } from './linalg.js';

/**
 * 2D point.
 * @typedef {{x:number,y:number}} Pt
 */

/**
 * Axis-aligned rectangle (top-left origin).
 * @typedef {{x:number,y:number,w:number,h:number}} RectShape
 */

/**
 * Circle.
 * @typedef {{cx:number,cy:number,r:number}} CircleShape
 */

/**
 * Line segment.
 * @typedef {{x1:number,y1:number,x2:number,y2:number}} LineShape
 */

/**
 * Polygon (open ring).
 * @typedef {{points:Pt[]}} PolygonShape
 */

/**
 * Point namespace.
 * @typedef {object} PointAPI
 * @property {(x: number, y: number) => Pt} create
 * @property {(a: Pt, b: Pt) => number} distance
 * @property {(a: Pt, b: Pt) => Pt} midpoint
 * @property {(a: Pt, b: Pt, eps?: number) => boolean} equals
 */

/**
 * Rect namespace.
 * @typedef {object} RectAPI
 * @property {(x: number, y: number, w: number, h: number) => RectShape} create
 * @property {(r: RectShape, p: Pt) => boolean} contains
 * @property {(a: RectShape, b: RectShape) => boolean} intersects
 * @property {(a: RectShape, b: RectShape) => RectShape|null} intersection
 * @property {(a: RectShape, b: RectShape) => RectShape} union
 * @property {(r: RectShape) => number} area
 * @property {(r: RectShape) => Pt} center
 * @property {(r: RectShape) => RectShape} normalize
 */

/**
 * Circle namespace.
 * @typedef {object} CircleAPI
 * @property {(cx: number, cy: number, r: number) => CircleShape} create
 * @property {(c: CircleShape, p: Pt) => boolean} contains
 * @property {(a: CircleShape, b: CircleShape) => boolean} intersectsCircle
 * @property {(c: CircleShape, r: RectShape) => boolean} intersectsRect
 */

/**
 * Line namespace.
 * @typedef {object} LineAPI
 * @property {(x1: number, y1: number, x2: number, y2: number) => LineShape} create
 * @property {(l: LineShape) => number} length
 * @property {(a: LineShape, b: LineShape) => boolean} intersects
 * @property {(a: LineShape, b: LineShape) => Pt|null} intersection
 * @property {(l: LineShape, p: Pt) => number} distanceToPoint
 * @property {(l: LineShape, p: Pt) => Pt} closestPoint
 */

/**
 * Polygon namespace.
 * @typedef {object} PolygonAPI
 * @property {(points: Pt[]) => PolygonShape} create
 * @property {(poly: PolygonShape) => number} area
 * @property {(poly: PolygonShape) => boolean} isCcw
 * @property {(poly: PolygonShape) => RectShape} bbox
 * @property {(poly: PolygonShape, p: Pt) => boolean} contains
 * @property {(poly: PolygonShape, tolerance: number) => PolygonShape} simplify
 */

/**
 * Object returned by `geom.factory()`.
 * @typedef {object} GeomAPI
 * @property {PointAPI} Point
 * @property {RectAPI} Rect
 * @property {CircleAPI} Circle
 * @property {LineAPI} Line
 * @property {PolygonAPI} Polygon
 * @property {(shape: object, point: Pt) => boolean} hitTest
 * @property {(point: Pt, mat3: ArrayLike<number>) => Pt} transform
 */

export const geom = {
    name: 'geom',
    version: '1.0.0',
    type: 'fw.io.math',
    dependencies: ['linalg'],
    deps: [linalg],

    /** @returns {GeomAPI} */
    factory(linalg) {
        /**
         * 2D point `{x, y}`.
         * @namespace Point
         */
        const Point = {
            /** @param {number} x @param {number} y @returns {{x:number,y:number}} */
            create: (x, y) => ({ x, y }),
            /** Euclidean distance. @param {{x:number,y:number}} a @param {{x:number,y:number}} b @returns {number} */
            distance: (a, b) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2),
            /** @param {{x:number,y:number}} a @param {{x:number,y:number}} b @returns {{x:number,y:number}} */
            midpoint: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
            /** @param {{x:number,y:number}} a @param {{x:number,y:number}} b @param {number} [eps=1e-6] @returns {boolean} */
            equals: (a, b, eps = 1e-6) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps,
        };

        /**
         * Axis-aligned rectangle `{x, y, w, h}`. `(x, y)` is the top-left
         * corner; width/height grow to the right/down.
         * @namespace Rect
         */
        const Rect = {
            /** @param {number} x @param {number} y @param {number} w @param {number} h @returns {{x:number,y:number,w:number,h:number}} */
            create: (x, y, w, h) => ({ x, y, w, h }),
            /** Half-open hit-test: left/top inclusive, right/bottom exclusive. @returns {boolean} */
            contains: (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h,
            /** @returns {boolean} */
            intersects: (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y),
            /** Intersection rect, or null if disjoint. @returns {{x:number,y:number,w:number,h:number}|null} */
            intersection: (a, b) => {
                const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
                const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
                if (x2 <= x || y2 <= y) return null;
                return { x, y, w: x2 - x, h: y2 - y };
            },
            /** Bounding rect that contains both a and b. @returns {{x:number,y:number,w:number,h:number}} */
            union: (a, b) => {
                const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
                const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
                return { x, y, w: x2 - x, h: y2 - y };
            },
            /** @returns {number} */
            area: (r) => r.w * r.h,
            /** @returns {{x:number,y:number}} */
            center: (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 }),
            /** Re-orient so width and height are non-negative. @returns {{x:number,y:number,w:number,h:number}} */
            normalize: (r) => ({
                x: r.w < 0 ? r.x + r.w : r.x,
                y: r.h < 0 ? r.y + r.h : r.y,
                w: Math.abs(r.w),
                h: Math.abs(r.h),
            }),
        };

        /**
         * Circle `{cx, cy, r}`.
         * @namespace Circle
         */
        const Circle = {
            /** @param {number} cx @param {number} cy @param {number} r @returns {{cx:number,cy:number,r:number}} */
            create: (cx, cy, r) => ({ cx, cy, r }),
            /** @returns {boolean} */
            contains: (c, p) => (p.x - c.cx) ** 2 + (p.y - c.cy) ** 2 <= c.r * c.r,
            /** @returns {boolean} */
            intersectsCircle: (a, b) => {
                const d = (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
                return d <= (a.r + b.r) ** 2;
            },
            /** @returns {boolean} */
            intersectsRect: (c, r) => {
                const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
                const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
                return (c.cx - nx) ** 2 + (c.cy - ny) ** 2 <= c.r * c.r;
            },
        };

        /**
         * Line segment `{x1, y1, x2, y2}`.
         * @namespace Line
         */
        const Line = {
            /** @returns {{x1:number,y1:number,x2:number,y2:number}} */
            create: (x1, y1, x2, y2) => ({ x1, y1, x2, y2 }),
            /** @returns {number} */
            length: (l) => Math.sqrt((l.x2 - l.x1) ** 2 + (l.y2 - l.y1) ** 2),
            /**
             * Segment-segment intersection test.
             * Parallel (including collinear, even when they overlap) is
             * reported as `false` - only properly crossing segments return
             * `true`.
             * @returns {boolean}
             */
            intersects: (a, b) => {
                const d1x = a.x2 - a.x1, d1y = a.y2 - a.y1;
                const d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
                const denom = d1x * d2y - d1y * d2x;
                if (Math.abs(denom) < 1e-10) return false; // parallel or collinear: not detected
                const dx = b.x1 - a.x1, dy = b.y1 - a.y1;
                const t = (dx * d2y - dy * d2x) / denom;
                const u = (dx * d1y - dy * d1x) / denom;
                return t >= 0 && t <= 1 && u >= 0 && u <= 1;
            },
            /** Intersection point or null (also returns null for parallel/collinear lines). @returns {{x:number,y:number}|null} */
            intersection: (a, b) => {
                const d1x = a.x2 - a.x1, d1y = a.y2 - a.y1;
                const d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
                const denom = d1x * d2y - d1y * d2x;
                if (Math.abs(denom) < 1e-10) return null;
                const dx = b.x1 - a.x1, dy = b.y1 - a.y1;
                const t = (dx * d2y - dy * d2x) / denom;
                const u = (dx * d1y - dy * d1x) / denom;
                if (t < 0 || t > 1 || u < 0 || u > 1) return null;
                return { x: a.x1 + t * d1x, y: a.y1 + t * d1y };
            },
            /** Shortest distance from p to the segment. @returns {number} */
            distanceToPoint: (l, p) => {
                const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
                const lenSq = dx * dx + dy * dy;
                if (lenSq === 0) return Point.distance({ x: l.x1, y: l.y1 }, p);
                const t = Math.max(0, Math.min(1, ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / lenSq));
                return Point.distance({ x: l.x1 + t * dx, y: l.y1 + t * dy }, p);
            },
            /** Closest point on the segment to p. @returns {{x:number,y:number}} */
            closestPoint: (l, p) => {
                const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
                const lenSq = dx * dx + dy * dy;
                if (lenSq === 0) return { x: l.x1, y: l.y1 };
                const t = Math.max(0, Math.min(1, ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / lenSq));
                return { x: l.x1 + t * dx, y: l.y1 + t * dy };
            },
        };

        /**
         * Polygon `{ points: Point[] }` (open ring; the last vertex implicitly
         * connects back to the first).
         * @namespace Polygon
         */
        const Polygon = {
            /** @param {Array<{x:number,y:number}>} points @returns {{points:Array<{x:number,y:number}>}} */
            create: (points) => ({ points }),
            /** Signed area (positive for counter-clockwise rings). @returns {number} */
            area: (poly) => {
                const pts = poly.points;
                let area = 0;
                const n = pts.length;
                for (let i = 0; i < n; i++) {
                    const j = (i + 1) % n;
                    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
                }
                return area / 2;
            },
            /** True when the ring is counter-clockwise. @returns {boolean} */
            isCcw: (poly) => Polygon.area(poly) > 0,
            /** Axis-aligned bounding box. @returns {{x:number,y:number,w:number,h:number}} */
            bbox: (poly) => {
                const pts = poly.points;
                let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
                for (const p of pts) {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                }
                return Rect.create(minX, minY, maxX - minX, maxY - minY);
            },
            /**
             * Ray-casting point-in-polygon test.
             * Behavior is undefined for points lying exactly on an edge
             * (typical for ray-casting implementations).
             * @returns {boolean}
             */
            contains: (poly, p) => {
                const pts = poly.points;
                const n = pts.length;
                let inside = false;
                for (let i = 0, j = n - 1; i < n; j = i++) {
                    const xi = pts[i].x, yi = pts[i].y;
                    const xj = pts[j].x, yj = pts[j].y;
                    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            },
            /**
             * Ramer-Douglas-Peucker polyline simplification. Recursive;
             * may exceed stack for extremely long inputs.
             * @param {{points:Array<{x:number,y:number}>}} poly
             * @param {number} tolerance
             * @returns {{points:Array<{x:number,y:number}>}}
             */
            simplify: (poly, tolerance) => {
                const pts = poly.points;
                if (pts.length <= 2) return poly;
                // Ramer-Douglas-Peucker
                function rdp(points, eps) {
                    if (points.length <= 2) return points;
                    const first = points[0], last = points[points.length - 1];
                    const seg = Line.create(first.x, first.y, last.x, last.y);
                    let maxDist = 0, maxIdx = 0;
                    for (let i = 1; i < points.length - 1; i++) {
                        const d = Line.distanceToPoint(seg, points[i]);
                        if (d > maxDist) { maxDist = d; maxIdx = i; }
                    }
                    if (maxDist <= eps) return [first, last];
                    return [...rdp(points.slice(0, maxIdx + 1), eps).slice(0, -1), ...rdp(points.slice(maxIdx), eps)];
                }
                return { points: rdp(pts, tolerance) };
            },
        };

        /**
         * Generic shape hit-test. Detects Rect (`w`/`h`), Circle (`r`/`cx`),
         * or Polygon (`points`) by structural shape.
         * @param {object} shape
         * @param {{x:number,y:number}} point
         * @returns {boolean}
         */
        function hitTest(shape, point) {
            if ('w' in shape && 'h' in shape) return Rect.contains(shape, point);
            if ('r' in shape && 'cx' in shape) return Circle.contains(shape, point);
            if ('points' in shape) return Polygon.contains(shape, point);
            return false;
        }

        /**
         * Apply a 2D affine transform (3×3 matrix) to a point. Allocates two
         * vec2 per call; for hot paths use linalg.mat3.transform directly
         * with pre-allocated buffers.
         * @param {{x:number,y:number}} point
         * @param {ArrayLike<number>} mat3
         * @returns {{x:number,y:number}}
         */
        function transform(point, mat3) {
            const out = linalg.vec2.create();
            linalg.mat3.transform(out, mat3, linalg.vec2.create([point.x, point.y]));
            return { x: out[0], y: out[1] };
        }

        return { Point, Rect, Circle, Line, Polygon, hitTest, transform };
    },
};
