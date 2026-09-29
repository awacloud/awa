// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Descriptive statistics - mean, median, quantile, variance, histogram, normalize.
 *
 * Validation: every public entry point checks that the input array is non-empty
 * and contains only finite numbers (NaN is rejected). Higher-level functions
 * call lower-level ones, so an input is typically scanned more than once;
 * variance for example is a two-pass algorithm (mean, then sum of squared
 * deviations).
 */

/**
 * Object returned by `stats.factory()`.
 * @typedef {object} StatsAPI
 * @property {(arr: ArrayLike<number>) => number} mean
 * @property {(arr: ArrayLike<number>) => number} median
 * @property {(arr: ArrayLike<number>) => number} mode
 * @property {(arr: ArrayLike<number>) => number} geomean
 * @property {(arr: ArrayLike<number>) => number} harmean
 * @property {(arr: ArrayLike<number>, sample?: boolean) => number} variance
 * @property {(arr: ArrayLike<number>, sample?: boolean) => number} stddev
 * @property {(arr: ArrayLike<number>) => number} range
 * @property {(arr: ArrayLike<number>) => number} iqr
 * @property {(arr: ArrayLike<number>) => number} mad
 * @property {(arr: ArrayLike<number>) => number} min
 * @property {(arr: ArrayLike<number>) => number} max
 * @property {(arr: ArrayLike<number>) => number} sum
 * @property {(arr: ArrayLike<number>) => number} product
 * @property {(arr: ArrayLike<number>, q: number) => number} quantile
 * @property {(arr: ArrayLike<number>, p: number) => number} percentile
 * @property {(arr: ArrayLike<number>, bins: number|number[]) => { edges: number[], counts: number[] }} histogram
 * @property {(value: number, arr: ArrayLike<number>) => number} zscore
 * @property {(arr: ArrayLike<number>, opts?: { min?: number, max?: number }) => number[]} normalize
 * @property {(arr: ArrayLike<number>) => number[]} standardize
 */

export const stats = {
    name: 'stats',
    version: '1.0.0',
    type: 'fw.io.math',
    dependencies: [],

    /** @returns {StatsAPI} */
    factory() {
        function _validate(arr) {
            if (!arr || arr.length === 0) throw new Error('stats: empty array');
            for (let i = 0; i < arr.length; i++) {
                if (typeof arr[i] !== 'number' || Number.isNaN(arr[i])) throw new Error('stats: NaN in input');
            }
        }

        /**
         * Sum of all values.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function sum(arr) {
            _validate(arr);
            let s = 0;
            for (let i = 0; i < arr.length; i++) s += arr[i];
            return s;
        }

        /**
         * Product of all values.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function product(arr) {
            _validate(arr);
            let p = 1;
            for (let i = 0; i < arr.length; i++) p *= arr[i];
            return p;
        }

        /**
         * Arithmetic mean (single-pass; does not delegate to `sum`).
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function mean(arr) {
            _validate(arr);
            let s = 0;
            for (let i = 0; i < arr.length; i++) s += arr[i];
            return s / arr.length;
        }

        /**
         * Minimum value.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function min(arr) {
            _validate(arr);
            let m = arr[0];
            for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
            return m;
        }

        /**
         * Maximum value.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function max(arr) {
            _validate(arr);
            let m = arr[0];
            for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
            return m;
        }

        /**
         * Difference between max and min.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function range(arr) {
            return max(arr) - min(arr);
        }

        function _sorted(arr) {
            return [...arr].sort((a, b) => a - b);
        }

        /**
         * Median (50th percentile). For even-length arrays returns the
         * average of the two middle values.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function median(arr) {
            _validate(arr);
            const s = _sorted(arr);
            const n = s.length;
            const mid = Math.floor(n / 2);
            return n % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
        }

        /**
         * Most frequent value. Ties are broken by first occurrence in the
         * Map iteration order (insertion order).
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function mode(arr) {
            _validate(arr);
            const freq = new Map();
            // @ts-ignore - ArrayLike<number> lacks Symbol.iterator; actual arrays at runtime do iterate
            for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
            let best = arr[0], bestCount = 0;
            for (const [v, c] of freq) if (c > bestCount) { best = v; bestCount = c; }
            return best;
        }

        /**
         * Geometric mean (`exp(mean(log(arr)))`). All values must be > 0
         * for a finite result.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function geomean(arr) {
            _validate(arr);
            let logSum = 0;
            // @ts-ignore - ArrayLike<number> lacks Symbol.iterator; actual arrays at runtime do iterate
            for (const v of arr) logSum += Math.log(v);
            return Math.exp(logSum / arr.length);
        }

        /**
         * Harmonic mean. Returns `Infinity` if any value is 0.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function harmean(arr) {
            _validate(arr);
            let invSum = 0;
            // @ts-ignore - ArrayLike<number> lacks Symbol.iterator; actual arrays at runtime do iterate
            for (const v of arr) invSum += 1 / v;
            return arr.length / invSum;
        }

        /**
         * Variance. Two-pass algorithm (mean then sum of squared deviations).
         * @param {ArrayLike<number>} arr non-empty
         * @param {boolean} [sample=false] when true uses Bessel correction (n-1)
         * @returns {number}
         */
        function variance(arr, sample = false) {
            _validate(arr);
            const m = mean(arr);
            let sq = 0;
            // @ts-ignore - ArrayLike<number> lacks Symbol.iterator; actual arrays at runtime do iterate
            for (const v of arr) sq += (v - m) ** 2;
            return sq / (sample ? arr.length - 1 : arr.length);
        }

        /**
         * Standard deviation = sqrt(variance).
         * @param {ArrayLike<number>} arr non-empty
         * @param {boolean} [sample=false]
         * @returns {number}
         */
        function stddev(arr, sample = false) {
            return Math.sqrt(variance(arr, sample));
        }

        /**
         * Quantile using Type-7 interpolation (R default, Excel PERCENTILE).
         * @param {ArrayLike<number>} arr non-empty
         * @param {number} q in [0, 1]
         * @returns {number}
         */
        function quantile(arr, q) {
            _validate(arr);
            if (q < 0 || q > 1) throw new Error('stats: q must be in [0, 1]');
            const s = _sorted(arr);
            const n = s.length;
            if (n === 1) return s[0];
            const idx = q * (n - 1);
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            if (lo === hi) return s[lo];
            return s[lo] + (idx - lo) * (s[hi] - s[lo]);
        }

        /**
         * Percentile = quantile(arr, p / 100).
         * @param {ArrayLike<number>} arr non-empty
         * @param {number} p in [0, 100]
         * @returns {number}
         */
        function percentile(arr, p) {
            return quantile(arr, p / 100);
        }

        /**
         * Inter-quartile range (Q3 − Q1).
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function iqr(arr) {
            return quantile(arr, 0.75) - quantile(arr, 0.25);
        }

        /**
         * Median absolute deviation from the median.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function mad(arr) {
            _validate(arr);
            const m = median(arr);
            // @ts-ignore - ArrayLike<number> lacks .map; actual arrays at runtime do have .map
            const devs = arr.map(v => Math.abs(v - m));
            return median(devs);
        }

        /**
         * Build a histogram. `bins` may be a positive integer (number of
         * uniform-width bins between min and max) or an explicit array of
         * edges (length n+1 for n bins).
         * @param {ArrayLike<number>} arr non-empty
         * @param {number|number[]} bins
         * @returns {{ edges: number[], counts: number[] }}
         */
        function histogram(arr, bins) {
            _validate(arr);
            const lo = min(arr), hi = max(arr);
            let edges;
            if (Array.isArray(bins)) {
                edges = bins;
            } else {
                const n = typeof bins === 'number' ? bins : 10;
                const step = (hi - lo) / n;
                edges = [];
                for (let i = 0; i <= n; i++) edges.push(lo + i * step);
            }
            const counts = new Array(edges.length - 1).fill(0);
            // @ts-ignore - ArrayLike<number> lacks Symbol.iterator; actual arrays at runtime do iterate
            for (const v of arr) {
                for (let i = 0; i < edges.length - 1; i++) {
                    if (v >= edges[i] && (v < edges[i + 1] || (i === edges.length - 2 && v <= edges[i + 1]))) {
                        counts[i]++;
                        break;
                    }
                }
            }
            return { edges, counts };
        }

        /**
         * Z-score of `value` against the distribution `arr`. Returns 0 when
         * `stddev(arr)` is 0.
         * @param {number} value
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number}
         */
        function zscore(value, arr) {
            const m = mean(arr);
            const sd = stddev(arr);
            if (sd === 0) return 0;
            return (value - m) / sd;
        }

        /**
         * Min-max normalize arr into a target range. When all values are
         * equal, every output equals `outMin`.
         * @param {ArrayLike<number>} arr non-empty
         * @param {{ min?: number, max?: number }} [opts]
         * @returns {number[]}
         */
        function normalize(arr, { min: outMin = 0, max: outMax = 1 } = {}) {
            _validate(arr);
            const lo = min(arr), hi = max(arr);
            const r = hi - lo;
            if (r === 0) return Array.from(arr, () => outMin);
            return Array.from(arr, v => outMin + ((v - lo) / r) * (outMax - outMin));
        }

        /**
         * Standardize arr to zero mean, unit variance. Returns all-zeros
         * when stddev is 0.
         * @param {ArrayLike<number>} arr non-empty
         * @returns {number[]}
         */
        function standardize(arr) {
            const m = mean(arr);
            const sd = stddev(arr);
            if (sd === 0) return Array.from(arr, () => 0);
            return Array.from(arr, v => (v - m) / sd);
        }

        return { mean, median, mode, geomean, harmean, variance, stddev, range, iqr, mad, min, max, sum, product, quantile, percentile, histogram, zscore, normalize, standardize };
    },
};
