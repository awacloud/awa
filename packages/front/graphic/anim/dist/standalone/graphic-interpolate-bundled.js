/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-interpolate-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.interpolate`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-interpolate-bundled
 */

export const graphicInterpolateBundled = {
    name: "graphicInterpolateBundled",
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
    __register({ name: "graphic.units", dependencies: [], factory: function() {
    return {
      split(input) {
        if (typeof input === "number")
          return { value: input, unit: "" };
        if (typeof input !== "string")
          throw Error("units.split: expected string|number");
        const m = input.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
        if (!m)
          throw Error(`units.split: cannot parse "${input}"`);
        return { value: parseFloat(m[1]), unit: m[2] || "" };
      },
      format(value, unit) {
        return `${Math.round(value * 1e6) / 1e6}${unit || ""}`;
      }
    };
  } });
    __register({ name: "graphic.matrix", dependencies: ["graphic.lerp"], factory: function(lerp) {
    const DEG_PER_RAD = 180 / Math.PI, RAD_PER_DEG = Math.PI / 180;

    class Matrix {
      constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
      }
      static identity() {
        return new Matrix;
      }
      static fromDecomposition(d) {
        const tx = d.translateX || 0, ty = d.translateY || 0, sx = d.scaleX == null ? 1 : d.scaleX, sy = d.scaleY == null ? 1 : d.scaleY, rot = (d.rotate || 0) * RAD_PER_DEG, cos = Math.cos(rot), sin = Math.sin(rot), shear = Math.tan((d.skewX || 0) * RAD_PER_DEG);
        return new Matrix(sx * cos, sx * sin, sy * (shear * cos - sin), sy * (shear * sin + cos), tx, ty);
      }
      multiply(o) {
        return new Matrix(this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b, this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d, this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f);
      }
      decompose() {
        const { a, b, c, d, e, f } = this;
        let m11 = a, m12 = b, m21 = c, m22 = d;
        const det = m11 * m22 - m12 * m21;
        let signX = 1;
        if (det < 0) {
          signX = -1;
          m11 = -m11;
          m12 = -m12;
        }
        let scaleX = Math.hypot(m11, m12);
        if (scaleX !== 0) {
          m11 /= scaleX;
          m12 /= scaleX;
        }
        let shear = m11 * m21 + m12 * m22;
        m21 -= m11 * shear;
        m22 -= m12 * shear;
        let scaleY = Math.hypot(m21, m22);
        if (scaleY !== 0)
          shear /= scaleY;
        const rotate = Math.atan2(m12, m11) * DEG_PER_RAD, skewX = Math.atan(shear) * DEG_PER_RAD;
        return {
          translateX: e,
          translateY: f,
          rotate,
          scaleX: signX * scaleX,
          scaleY,
          skewX,
          skewY: 0
        };
      }
      toString() {
        const r = (n) => Math.abs(n) < 0.0000000001 ? 0 : Math.round(n * 1e6) / 1e6;
        return `matrix(${r(this.a)},${r(this.b)},${r(this.c)},${r(this.d)},${r(this.e)},${r(this.f)})`;
      }
    }
    function lerpDecomposition(from, to, t) {
      return {
        translateX: lerp(from.translateX, to.translateX, t),
        translateY: lerp(from.translateY, to.translateY, t),
        rotate: lerp(from.rotate, to.rotate, t),
        scaleX: lerp(from.scaleX, to.scaleX, t),
        scaleY: lerp(from.scaleY, to.scaleY, t),
        skewX: lerp(from.skewX, to.skewX, t),
        skewY: lerp(from.skewY, to.skewY, t)
      };
    }
    return { Matrix, lerpDecomposition };
  } });
    __register({ name: "graphic.color", dependencies: ["graphic.lerp"], factory: function(lerp) {
    function hslToRgba(h, s, l, a) {
      h = (h % 360 + 360) % 360;
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = l - c / 2, sector = Math.floor(h / 60);
      let r1, g1, b1;
      if (sector === 0) {
        r1 = c;
        g1 = x;
        b1 = 0;
      } else if (sector === 1) {
        r1 = x;
        g1 = c;
        b1 = 0;
      } else if (sector === 2) {
        r1 = 0;
        g1 = c;
        b1 = x;
      } else if (sector === 3) {
        r1 = 0;
        g1 = x;
        b1 = c;
      } else if (sector === 4) {
        r1 = x;
        g1 = 0;
        b1 = c;
      } else {
        r1 = c;
        g1 = 0;
        b1 = x;
      }
      return {
        r: (r1 + m) * 255,
        g: (g1 + m) * 255,
        b: (b1 + m) * 255,
        a
      };
    }
    const CSS_NAMED_COLORS = Object.freeze({
      aliceblue: "#f0f8ff",
      antiquewhite: "#faebd7",
      aqua: "#00ffff",
      aquamarine: "#7fffd4",
      azure: "#f0ffff",
      beige: "#f5f5dc",
      bisque: "#ffe4c4",
      black: "#000000",
      blanchedalmond: "#ffebcd",
      blue: "#0000ff",
      blueviolet: "#8a2be2",
      brown: "#a52a2a",
      burlywood: "#deb887",
      cadetblue: "#5f9ea0",
      chartreuse: "#7fff00",
      chocolate: "#d2691e",
      coral: "#ff7f50",
      cornflowerblue: "#6495ed",
      cornsilk: "#fff8dc",
      crimson: "#dc143c",
      cyan: "#00ffff",
      darkblue: "#00008b",
      darkcyan: "#008b8b",
      darkgoldenrod: "#b8860b",
      darkgray: "#a9a9a9",
      darkgreen: "#006400",
      darkgrey: "#a9a9a9",
      darkkhaki: "#bdb76b",
      darkmagenta: "#8b008b",
      darkolivegreen: "#556b2f",
      darkorange: "#ff8c00",
      darkorchid: "#9932cc",
      darkred: "#8b0000",
      darksalmon: "#e9967a",
      darkseagreen: "#8fbc8f",
      darkslateblue: "#483d8b",
      darkslategray: "#2f4f4f",
      darkslategrey: "#2f4f4f",
      darkturquoise: "#00ced1",
      darkviolet: "#9400d3",
      deeppink: "#ff1493",
      deepskyblue: "#00bfff",
      dimgray: "#696969",
      dimgrey: "#696969",
      dodgerblue: "#1e90ff",
      firebrick: "#b22222",
      floralwhite: "#fffaf0",
      forestgreen: "#228b22",
      fuchsia: "#ff00ff",
      gainsboro: "#dcdcdc",
      ghostwhite: "#f8f8ff",
      gold: "#ffd700",
      goldenrod: "#daa520",
      gray: "#808080",
      green: "#008000",
      greenyellow: "#adff2f",
      grey: "#808080",
      honeydew: "#f0fff0",
      hotpink: "#ff69b4",
      indianred: "#cd5c5c",
      indigo: "#4b0082",
      ivory: "#fffff0",
      khaki: "#f0e68c",
      lavender: "#e6e6fa",
      lavenderblush: "#fff0f5",
      lawngreen: "#7cfc00",
      lemonchiffon: "#fffacd",
      lightblue: "#add8e6",
      lightcoral: "#f08080",
      lightcyan: "#e0ffff",
      lightgoldenrodyellow: "#fafad2",
      lightgray: "#d3d3d3",
      lightgreen: "#90ee90",
      lightgrey: "#d3d3d3",
      lightpink: "#ffb6c1",
      lightsalmon: "#ffa07a",
      lightseagreen: "#20b2aa",
      lightskyblue: "#87cefa",
      lightslategray: "#778899",
      lightslategrey: "#778899",
      lightsteelblue: "#b0c4de",
      lightyellow: "#ffffe0",
      lime: "#00ff00",
      limegreen: "#32cd32",
      linen: "#faf0e6",
      magenta: "#ff00ff",
      maroon: "#800000",
      mediumaquamarine: "#66cdaa",
      mediumblue: "#0000cd",
      mediumorchid: "#ba55d3",
      mediumpurple: "#9370db",
      mediumseagreen: "#3cb371",
      mediumslateblue: "#7b68ee",
      mediumspringgreen: "#00fa9a",
      mediumturquoise: "#48d1cc",
      mediumvioletred: "#c71585",
      midnightblue: "#191970",
      mintcream: "#f5fffa",
      mistyrose: "#ffe4e1",
      moccasin: "#ffe4b5",
      navajowhite: "#ffdead",
      navy: "#000080",
      oldlace: "#fdf5e6",
      olive: "#808000",
      olivedrab: "#6b8e23",
      orange: "#ffa500",
      orangered: "#ff4500",
      orchid: "#da70d6",
      palegoldenrod: "#eee8aa",
      palegreen: "#98fb98",
      paleturquoise: "#afeeee",
      palevioletred: "#db7093",
      papayawhip: "#ffefd5",
      peachpuff: "#ffdab9",
      peru: "#cd853f",
      pink: "#ffc0cb",
      plum: "#dda0dd",
      powderblue: "#b0e0e6",
      purple: "#800080",
      rebeccapurple: "#663399",
      red: "#ff0000",
      rosybrown: "#bc8f8f",
      royalblue: "#4169e1",
      saddlebrown: "#8b4513",
      salmon: "#fa8072",
      sandybrown: "#f4a460",
      seagreen: "#2e8b57",
      seashell: "#fff5ee",
      sienna: "#a0522d",
      silver: "#c0c0c0",
      skyblue: "#87ceeb",
      slateblue: "#6a5acd",
      slategray: "#708090",
      slategrey: "#708090",
      snow: "#fffafa",
      springgreen: "#00ff7f",
      steelblue: "#4682b4",
      tan: "#d2b48c",
      teal: "#008080",
      thistle: "#d8bfd8",
      tomato: "#ff6347",
      transparent: "#00000000",
      turquoise: "#40e0d0",
      violet: "#ee82ee",
      wheat: "#f5deb3",
      white: "#ffffff",
      whitesmoke: "#f5f5f5",
      yellow: "#ffff00",
      yellowgreen: "#9acd32"
    });
    function parse(input) {
      if (typeof input !== "string")
        throw Error("color.parse: expected a string");
      const s = input.trim();
      if (s[0] === "#") {
        let hex = s.slice(1).toLowerCase();
        if (hex.length === 3 || hex.length === 4)
          hex = hex.split("").map((ch) => ch + ch).join("");
        if (hex.length === 6)
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 1
          };
        if (hex.length === 8)
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: parseInt(hex.slice(6, 8), 16) / 255
          };
        throw Error(`color.parse: bad hex "${input}"`);
      }
      const lower = s.toLowerCase(), hslMatch = lower.match(/^hsla?\(([^)]+)\)$/);
      if (hslMatch) {
        const parts = hslMatch[1].split(",").map((p) => p.trim());
        if (parts.length < 3)
          throw Error(`color.parse: bad hsl "${input}"`);
        const h = parseFloat(parts[0]), s2 = parseFloat(parts[1]) / 100, l2 = parseFloat(parts[2]) / 100, a = parts.length > 3 ? parseFloat(parts[3]) : 1;
        if (!isFinite(h) || !isFinite(s2) || !isFinite(l2) || !isFinite(a))
          throw Error(`color.parse: bad hsl "${input}"`);
        return hslToRgba(h, s2, l2, a);
      }
      const rgbMatch = lower.match(/^rgba?\(([^)]+)\)$/);
      if (rgbMatch) {
        const parts = rgbMatch[1].split(",").map((p) => parseFloat(p.trim()));
        if (parts.length < 3)
          throw Error(`color.parse: bad rgb "${input}"`);
        return {
          r: parts[0],
          g: parts[1],
          b: parts[2],
          a: parts.length > 3 ? parts[3] : 1
        };
      }
      const named = CSS_NAMED_COLORS[lower];
      if (named !== void 0)
        return parse(named);
      throw Error(`color.parse: unrecognised colour "${input}"`);
    }
    function colorLerp(from, to, t) {
      const a = parse(from), b = parse(to);
      return format({
        r: lerp(a.r, b.r, t),
        g: lerp(a.g, b.g, t),
        b: lerp(a.b, b.b, t),
        a: lerp(a.a, b.a, t)
      });
    }
    function format(c) {
      const ch = (n) => Math.round(Math.max(0, Math.min(255, n))), al = Math.round(Math.max(0, Math.min(1, c.a)) * 1000) / 1000;
      if (al >= 1)
        return `rgb(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)})`;
      return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${al})`;
    }
    return { parse, lerp: colorLerp, format, CSS_NAMED_COLORS };
  } });
    __register({ name: "graphic.interpolate", dependencies: ["graphic.lerp","graphic.units","graphic.matrix","graphic.color"], factory: function(lerp, units, matrix, color) {
    const { Matrix, lerpDecomposition } = matrix, { CSS_NAMED_COLORS } = color, RAD_PER_DEG = Math.PI / 180, PATH_RE = /^[Mm]\s*[-+\d.]/, TRANSFORM_RE = /(matrix|translate|scale|rotate|skew[xy]?)\s*\(/i, COLOR_RE = /^(#|rgba?\(|hsla?\()/i, FN_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
    function parseArgs(raw) {
      return raw.split(/[\s,]+/).filter(Boolean).map(parseFloat);
    }
    function parseTransform(str) {
      let m = Matrix.identity();
      FN_RE.lastIndex = 0;
      let match;
      while ((match = FN_RE.exec(str)) !== null) {
        const fn = match[1].toLowerCase(), args = parseArgs(match[2]);
        let next;
        if (fn === "translate")
          next = new Matrix(1, 0, 0, 1, args[0] || 0, args[1] || 0);
        else if (fn === "scale") {
          const sx = args[0] == null ? 1 : args[0], sy = args[1] == null ? sx : args[1];
          next = new Matrix(sx, 0, 0, sy, 0, 0);
        } else if (fn === "rotate") {
          const r = (args[0] || 0) * RAD_PER_DEG, cos = Math.cos(r), sin = Math.sin(r);
          next = new Matrix(cos, sin, -sin, cos, 0, 0);
        } else if (fn === "skewx")
          next = new Matrix(1, 0, Math.tan((args[0] || 0) * RAD_PER_DEG), 1, 0, 0);
        else if (fn === "skewy")
          next = new Matrix(1, Math.tan((args[0] || 0) * RAD_PER_DEG), 0, 1, 0, 0);
        else
          next = new Matrix(args[0] == null ? 1 : args[0], args[1] || 0, args[2] || 0, args[3] == null ? 1 : args[3], args[4] || 0, args[5] || 0);
        m = m.multiply(next);
      }
      return m;
    }
    const FN_NAME = { translate: "translate", scale: "scale", rotate: "rotate", skewx: "skewX", skewy: "skewY", matrix: "matrix" };
    function parseTransformList(str) {
      const out = [];
      FN_RE.lastIndex = 0;
      let match;
      while ((match = FN_RE.exec(str)) !== null) {
        const fn = FN_NAME[match[1].toLowerCase()], a = parseArgs(match[2]);
        let args;
        if (fn === "translate")
          args = [a[0] || 0, a[1] || 0];
        else if (fn === "scale")
          args = [a[0] == null ? 1 : a[0], a[1] == null ? a[0] == null ? 1 : a[0] : a[1]];
        else if (fn === "rotate")
          args = [a[0] || 0, a[1] || 0, a[2] || 0];
        else if (fn === "matrix")
          args = [a[0] == null ? 1 : a[0], a[1] || 0, a[2] || 0, a[3] == null ? 1 : a[3], a[4] || 0, a[5] || 0];
        else
          args = [a[0] || 0];
        out.push({ fn, args, centred: fn === "rotate" && a.length >= 3 });
      }
      return out;
    }
    function round6(n) {
      return Math.abs(n) < 0.0000000001 ? 0 : Math.round(n * 1e6) / 1e6;
    }
    function perFunctionInterpolator(from, to) {
      const la = parseTransformList(from), lb = parseTransformList(to);
      if (la.length === 0 || la.length !== lb.length)
        return null;
      for (let i = 0;i < la.length; i += 1)
        if (la[i].fn !== lb[i].fn)
          return null;
      const parts = la.map((fa, i) => {
        const fb = lb[i];
        if (fa.fn === "matrix") {
          const da = new Matrix(...fa.args).decompose(), db = new Matrix(...fb.args).decompose();
          return (t) => Matrix.fromDecomposition(lerpDecomposition(da, db, t)).toString();
        }
        const n = fa.fn === "rotate" && !fa.centred && !fb.centred ? 1 : fa.args.length;
        return (t) => {
          const v = [];
          for (let k = 0;k < n; k += 1)
            v.push(round6(lerp(fa.args[k], fb.args[k], t)));
          return `${fa.fn}(${v.join(",")})`;
        };
      });
      return (t) => parts.map((p) => p(t)).join(" ");
    }
    const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
    function tokenize(d) {
      return d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    }
    function arcToCubics(x0, y0, rx, ry, xAngleDeg, largeArc, sweep, x, y) {
      if (rx === 0 || ry === 0)
        return [[x0, y0, x, y, x, y]];
      rx = Math.abs(rx);
      ry = Math.abs(ry);
      const phi = xAngleDeg % 360 * Math.PI / 180, cosPhi = Math.cos(phi), sinPhi = Math.sin(phi), dx = (x0 - x) / 2, dy = (y0 - y) / 2, x1p = cosPhi * dx + sinPhi * dy, y1p = -sinPhi * dx + cosPhi * dy, lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
      if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
      }
      const rx2 = rx * rx, ry2 = ry * ry, x1p2 = x1p * x1p, y1p2 = y1p * y1p;
      let num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
      if (num < 0)
        num = 0;
      const den = rx2 * y1p2 + ry2 * x1p2;
      let coef = den === 0 ? 0 : Math.sqrt(num / den);
      if (largeArc === sweep)
        coef = -coef;
      const cxp = coef * (rx * y1p) / ry, cyp = coef * -(ry * x1p) / rx, cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2, cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2, ang = (ux, uy, vx, vy) => {
        const dot = ux * vx + uy * vy, len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
        if (ux * vy - uy * vx < 0)
          a = -a;
        return a;
      }, theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!sweep && dTheta > 0)
        dTheta -= 2 * Math.PI;
      else if (sweep && dTheta < 0)
        dTheta += 2 * Math.PI;
      const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2))), delta = dTheta / segCount, k = 1.3333333333333333 * Math.tan(delta / 4), cubics = [];
      let theta = theta1, px = x0, py = y0;
      for (let i = 0;i < segCount; i++) {
        const t2 = theta + delta, cosT1 = Math.cos(theta), sinT1 = Math.sin(theta), cosT2 = Math.cos(t2), sinT2 = Math.sin(t2), ex = cosPhi * rx * cosT2 - sinPhi * ry * sinT2 + cx, ey = sinPhi * rx * cosT2 + cosPhi * ry * sinT2 + cy, d1x = -rx * sinT1, d1y = ry * cosT1, d2x = -rx * sinT2, d2y = ry * cosT2, c1x = px + k * (cosPhi * d1x - sinPhi * d1y), c1y = py + k * (sinPhi * d1x + cosPhi * d1y), c2x = ex - k * (cosPhi * d2x - sinPhi * d2y), c2y = ey - k * (sinPhi * d2x + cosPhi * d2y);
        cubics.push([c1x, c1y, c2x, c2y, ex, ey]);
        theta = t2;
        px = ex;
        py = ey;
      }
      return cubics;
    }
    function quadToCubic(x0, y0, qx, qy, x1, y1) {
      return [
        x0 + 0.6666666666666666 * (qx - x0),
        y0 + 0.6666666666666666 * (qy - y0),
        x1 + 0.6666666666666666 * (qx - x1),
        y1 + 0.6666666666666666 * (qy - y1),
        x1,
        y1
      ];
    }
    function parsePath(d) {
      if (typeof d !== "string" || d.trim() === "")
        throw Error("parsePath: empty path data");
      const tokens = tokenize(d);
      if (tokens.length === 0 || !/[a-zA-Z]/.test(tokens[0]))
        throw Error("parsePath: path must start with a command");
      const out = [];
      let i = 0, cx = 0, cy = 0, startX = 0, startY = 0, prevCubicCtrlX = null, prevQuadCtrlX = null, prevQuadCtrlY = null, prevCubicCtrlY = null, prevCmd = "";
      const num = () => {
        if (i >= tokens.length || /[a-zA-Z]/.test(tokens[i]))
          throw Error("parsePath: missing coordinate");
        return parseFloat(tokens[i++]);
      };
      while (i < tokens.length) {
        let cmd = tokens[i++];
        if (!/[a-zA-Z]/.test(cmd)) {
          i--;
          cmd = prevCmd;
          if (!cmd)
            throw Error("parsePath: expected a command");
        }
        const rel = cmd === cmd.toLowerCase(), up = cmd.toUpperCase();
        if (!(up in ARITY))
          throw Error(`parsePath: unsupported command "${cmd}"`);
        if (up === "Z") {
          out.push({ cmd: "Z", coords: [] });
          cx = startX;
          cy = startY;
          prevCubicCtrlX = prevCubicCtrlY = null;
          prevQuadCtrlX = prevQuadCtrlY = null;
          prevCmd = up;
          continue;
        }
        if (up === "M") {
          let nx = num(), ny = num();
          if (rel) {
            nx += cx;
            ny += cy;
          }
          cx = nx;
          cy = ny;
          startX = cx;
          startY = cy;
          out.push({ cmd: "M", coords: [cx, cy] });
          prevCubicCtrlX = prevCubicCtrlY = null;
          prevQuadCtrlX = prevQuadCtrlY = null;
          while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) {
            let lx = num(), ly = num();
            if (rel) {
              lx += cx;
              ly += cy;
            }
            out.push({ cmd: "C", coords: [cx, cy, lx, ly, lx, ly] });
            cx = lx;
            cy = ly;
          }
          prevCmd = up;
          continue;
        }
        do {
          if (up === "L") {
            let nx = num(), ny = num();
            if (rel) {
              nx += cx;
              ny += cy;
            }
            out.push({ cmd: "C", coords: [cx, cy, nx, ny, nx, ny] });
            cx = nx;
            cy = ny;
          } else if (up === "H") {
            let nx = num();
            if (rel)
              nx += cx;
            out.push({ cmd: "C", coords: [cx, cy, nx, cy, nx, cy] });
            cx = nx;
          } else if (up === "V") {
            let ny = num();
            if (rel)
              ny += cy;
            out.push({ cmd: "C", coords: [cx, cy, cx, ny, cx, ny] });
            cy = ny;
          } else if (up === "C") {
            let x1 = num(), y1 = num(), x2 = num(), y2 = num(), ex = num(), ey = num();
            if (rel) {
              x1 += cx;
              y1 += cy;
              x2 += cx;
              y2 += cy;
              ex += cx;
              ey += cy;
            }
            out.push({ cmd: "C", coords: [x1, y1, x2, y2, ex, ey] });
            prevCubicCtrlX = x2;
            prevCubicCtrlY = y2;
            prevQuadCtrlX = prevQuadCtrlY = null;
            cx = ex;
            cy = ey;
          } else if (up === "S") {
            let x2 = num(), y2 = num(), ex = num(), ey = num();
            if (rel) {
              x2 += cx;
              y2 += cy;
              ex += cx;
              ey += cy;
            }
            let x1 = cx, y1 = cy;
            if (prevCubicCtrlX != null) {
              x1 = 2 * cx - prevCubicCtrlX;
              y1 = 2 * cy - prevCubicCtrlY;
            }
            out.push({ cmd: "C", coords: [x1, y1, x2, y2, ex, ey] });
            prevCubicCtrlX = x2;
            prevCubicCtrlY = y2;
            prevQuadCtrlX = prevQuadCtrlY = null;
            cx = ex;
            cy = ey;
          } else if (up === "Q") {
            let qx = num(), qy = num(), ex = num(), ey = num();
            if (rel) {
              qx += cx;
              qy += cy;
              ex += cx;
              ey += cy;
            }
            out.push({ cmd: "C", coords: quadToCubic(cx, cy, qx, qy, ex, ey) });
            prevQuadCtrlX = qx;
            prevQuadCtrlY = qy;
            prevCubicCtrlX = prevCubicCtrlY = null;
            cx = ex;
            cy = ey;
          } else if (up === "T") {
            let ex = num(), ey = num();
            if (rel) {
              ex += cx;
              ey += cy;
            }
            let qx = cx, qy = cy;
            if (prevQuadCtrlX != null) {
              qx = 2 * cx - prevQuadCtrlX;
              qy = 2 * cy - prevQuadCtrlY;
            }
            out.push({ cmd: "C", coords: quadToCubic(cx, cy, qx, qy, ex, ey) });
            prevQuadCtrlX = qx;
            prevQuadCtrlY = qy;
            prevCubicCtrlX = prevCubicCtrlY = null;
            cx = ex;
            cy = ey;
          } else if (up === "A") {
            const rx = num(), ry = num(), rot = num(), large = num(), swp = num();
            let ex = num(), ey = num();
            if (rel) {
              ex += cx;
              ey += cy;
            }
            const cubics = arcToCubics(cx, cy, rx, ry, rot, large, swp, ex, ey);
            for (const c of cubics)
              out.push({ cmd: "C", coords: c });
            prevCubicCtrlX = prevCubicCtrlY = null;
            prevQuadCtrlX = prevQuadCtrlY = null;
            cx = ex;
            cy = ey;
          }
          prevCmd = up;
        } while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]));
      }
      return out;
    }
    function isCompatible(a, b) {
      if (a.length !== b.length)
        return !1;
      for (let i = 0;i < a.length; i++)
        if (a[i].cmd !== b[i].cmd)
          return !1;
      return !0;
    }
    function expand(segs) {
      const move = segs[0] && segs[0].cmd === "M" ? segs[0] : { cmd: "M", coords: [0, 0] }, curves = segs.filter((s) => s.cmd === "C"), close = segs.some((s) => s.cmd === "Z");
      return { move, curves, close };
    }
    function padCurves(e, n) {
      const curves = e.curves.slice();
      if (curves.length === 0) {
        const [mx, my] = e.move.coords;
        while (curves.length < n)
          curves.push({ cmd: "C", coords: [mx, my, mx, my, mx, my] });
      } else
        while (curves.length < n) {
          const last = curves[curves.length - 1], ex = last.coords[4], ey = last.coords[5];
          curves.push({ cmd: "C", coords: [ex, ey, ex, ey, ex, ey] });
        }
      const segs = [e.move, ...curves];
      if (e.close)
        segs.push({ cmd: "Z", coords: [] });
      return segs;
    }
    function normalize(a, b) {
      if (isCompatible(a, b))
        return [a, b];
      const ea = expand(a), eb = expand(b), n = Math.max(ea.curves.length, eb.curves.length), ca = padCurves(ea, n), cb = padCurves(eb, n);
      return [ca, cb];
    }
    function formatPath(segs) {
      return segs.map((s) => {
        const c = s.coords.map((n) => Math.round(n * 1000) / 1000);
        return s.cmd + (c.length ? " " + c.join(" ") : "");
      }).join(" ");
    }
    function detect(value) {
      if (typeof value === "number")
        return "number";
      if (typeof value !== "string")
        throw Error(`detect: unsupported value type ${typeof value}`);
      const s = value.trim();
      if (PATH_RE.test(s))
        return "path";
      if (TRANSFORM_RE.test(s))
        return "transform";
      if (COLOR_RE.test(s) || CSS_NAMED_COLORS[s.toLowerCase()] !== void 0)
        return "color";
      return "unit";
    }
    function interpolator(from, to) {
      const kind = detect(from), toKind = detect(to);
      if (kind !== toKind)
        throw Error(`interpolator: kind mismatch ${kind} \u2192 ${toKind}`);
      switch (kind) {
        case "number":
          return (t) => lerp(from, to, t);
        case "unit": {
          const a = units.split(from), b = units.split(to);
          if (a.unit && b.unit && a.unit !== b.unit)
            throw Error(`interpolator: unit mismatch "${a.unit}" vs "${b.unit}"`);
          const unit = a.unit || b.unit;
          return (t) => units.format(lerp(a.value, b.value, t), unit);
        }
        case "color":
          return (t) => color.lerp(from, to, t);
        case "transform": {
          const perFn = perFunctionInterpolator(from, to);
          if (perFn)
            return perFn;
          const da = parseTransform(from).decompose(), db = parseTransform(to).decompose();
          return (t) => Matrix.fromDecomposition(lerpDecomposition(da, db, t)).toString();
        }
        case "path": {
          const [sa, sb] = normalize(parsePath(from), parsePath(to));
          return (t) => formatPath(sa.map((seg, i) => ({
            cmd: seg.cmd,
            coords: seg.coords.map((v, k) => lerp(v, sb[i].coords[k], t))
          })));
        }
        default:
          throw Error(`interpolator: unhandled kind ${kind}`);
      }
    }
    return { detect, interpolator, parseTransform, parsePath };
  } });

    const __core = __resolve("graphic.interpolate");
    return __core;
    }
};
