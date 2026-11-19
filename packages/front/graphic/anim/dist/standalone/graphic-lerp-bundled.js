/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-lerp-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.lerp`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-lerp-bundled
 */

export const graphicLerpBundled = {
    name: "graphicLerpBundled",
    dependencies: [],
    factory() {
    const __reg = Object.create(null);
    const __cache = Object.create(null);
    function __register(m) { __reg[m.name] = m; }
    function __resolve(name) {
        if (name in __cache) return __cache[name];
        const def = __reg[name];
        if (!def) throw new Error('prebuilt: unknown module ' + name);
        const args = def.dependencies.map(__resolve);
        return (__cache[name] = def.factory.apply({}, args));
    }

    // fw modules — inlined (bundled variant).
    __register({ name: "interp", dependencies: [], factory: function() {
    function linear(a, b, t) {
      return a + t * (b - a);
    }
    function smoothstep(edge0, edge1, x) {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    }
    function smootherstep(edge0, edge1, x) {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * t * (t * (t * 6 - 15) + 10);
    }
    function cubicHermite(p0, p1, m0, m1, t) {
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
    }
    function catmullRom(p0, p1, p2, p3, t, alpha = 0.5) {
      function dist(a, b) {
        return Math.abs(b - a);
      }
      function tj(tj0, p_j, p_j1) {
        return tj0 + Math.pow(dist(p_j, p_j1) || 0.0000000001, alpha);
      }
      const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3), tt = linear(t1, t2, t), A1 = linear(p0, p1, (tt - t0) / (t1 - t0 || 0.0000000001)), A2 = linear(p1, p2, (tt - t1) / (t2 - t1 || 0.0000000001)), A3 = linear(p2, p3, (tt - t2) / (t3 - t2 || 0.0000000001)), B1 = linear(A1, A2, (tt - t0) / (t2 - t0 || 0.0000000001)), B2 = linear(A2, A3, (tt - t1) / (t3 - t1 || 0.0000000001));
      return linear(B1, B2, (tt - t1) / (t2 - t1 || 0.0000000001));
    }
    function bezier2(p0, p1, p2, t) {
      const u = 1 - t;
      return u * u * p0 + 2 * u * t * p1 + t * t * p2;
    }
    function bezier3(p0, p1, p2, p3, t) {
      const u = 1 - t, u2 = u * u, t2 = t * t;
      return u2 * u * p0 + 3 * u2 * t * p1 + 3 * u * t2 * p2 + t2 * t * p3;
    }
    function bilinear(q11, q21, q12, q22, x, y) {
      return q11 * (1 - x) * (1 - y) + q21 * x * (1 - y) + q12 * (1 - x) * y + q22 * x * y;
    }
    function bicubic(s4x4, x, y) {
      const rows = [0, 1, 2, 3].map((r) => {
        const row = s4x4[r];
        return catmullRom(row[0], row[1], row[2], row[3], x);
      });
      return catmullRom(rows[0], rows[1], rows[2], rows[3], y);
    }
    function vec(out, a, b, t) {
      if (out.length !== a.length || out.length !== b.length)
        throw Error("interp: vec dimension mismatch");
      for (let i = 0;i < out.length; i++)
        out[i] = a[i] + t * (b[i] - a[i]);
      return out;
    }
    function barycentric(p, a, b, c) {
      const v0x = b.x - a.x, v0y = b.y - a.y, v1x = c.x - a.x, v1y = c.y - a.y, v2x = p.x - a.x, v2y = p.y - a.y, d00 = v0x * v0x + v0y * v0y, d01 = v0x * v1x + v0y * v1y, d11 = v1x * v1x + v1y * v1y, d20 = v2x * v0x + v2y * v0y, d21 = v2x * v1x + v2y * v1y, denom = d00 * d11 - d01 * d01;
      if (Math.abs(denom) < 0.000000000001)
        throw Error("interp.barycentric: degenerate triangle (collinear or coincident vertices)");
      const v = (d11 * d20 - d01 * d21) / denom, w = (d00 * d21 - d01 * d20) / denom;
      return { u: 1 - v - w, v, w };
    }
    function sample(samples, t) {
      const n = samples.length;
      if (n === 1)
        return samples[0];
      const idx = t * (n - 1), lo = Math.max(0, Math.min(n - 2, Math.floor(idx)));
      return linear(samples[lo], samples[lo + 1], idx - lo);
    }
    function sample2D(samples, w, h, x, y) {
      const xi = x * (w - 1), yi = y * (h - 1), x0 = Math.max(0, Math.min(w - 2, Math.floor(xi))), y0 = Math.max(0, Math.min(h - 2, Math.floor(yi))), tx = xi - x0, ty = yi - y0, q11 = samples[y0 * w + x0], q21 = samples[y0 * w + x0 + 1], q12 = samples[(y0 + 1) * w + x0], q22 = samples[(y0 + 1) * w + x0 + 1];
      return bilinear(q11, q21, q12, q22, tx, ty);
    }
    return { linear, smoothstep, smootherstep, cubicHermite, catmullRom, bezier2, bezier3, bilinear, bicubic, vec, barycentric, sample, sample2D };
  } });

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "graphic.lerp", dependencies: ["interp"], factory: function(interpApi) {
    return interpApi.linear;
  } });

    const __core = __resolve("graphic.lerp");
    return __core;
    }
};
