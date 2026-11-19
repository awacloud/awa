/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-color-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.color`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-color-bundled
 */

export const graphicColorBundled = {
    name: "graphicColorBundled",
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

    const __core = __resolve("graphic.color");
    return __core;
    }
};
