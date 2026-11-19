/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-anim-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 5 fw modules as dependencies and inlines every
 * graphic-local factory transitively reachable from `graphic.anim` .
 *
 * @module graphic/bundles/prebuilt/graphic-anim-package
 */

export const graphicAnimPackage = {
    name: "graphicAnimPackage",
    dependencies: ["secPolicy","dom","interp","easing","clock"],
    factory(secPolicy, dom, interp, easing, clock) {
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

    // fw modules — injected by DI.
    __cache["secPolicy"] = secPolicy;
    __cache["dom"] = dom;
    __cache["interp"] = interp;
    __cache["easing"] = easing;
    __cache["clock"] = clock;

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "graphic.lerp", dependencies: ["interp"], factory: function(interpApi) {
    return interpApi.linear;
  } });
    __register({ name: "graphic.easing", dependencies: ["easing"], factory: function(fwEasing) {
    const table = {};
    for (const name of Object.keys(fwEasing)) {
      const curve = fwEasing[name];
      if (typeof curve === "function")
        table[name] = (t) => curve(t, 0, 1, 1);
    }
    return table;
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
    __register({ name: "graphic.scopedIds", dependencies: [], factory: function() {
    let _defaultPrefixSeq = 0;
    const HREF_ATTRS = new Set(["href", "xlink:href"]);
    function createScope(rawPrefix) {
      const prefix = rawPrefix === void 0 ? `g-${_defaultPrefixSeq++}` : rawPrefix;
      let _seq = 0;
      const nextSeq = () => _seq++, minted = new Map;
      function id(rawId) {
        if (rawId === void 0 || rawId === null || rawId === "")
          return `${prefix}-${nextSeq()}`;
        const key = String(rawId), existing = minted.get(key);
        if (existing !== void 0)
          return existing;
        const scoped = `${prefix}-${key}-${nextSeq()}`;
        minted.set(key, scoped);
        return scoped;
      }
      function ref(value, attrName) {
        if (typeof value !== "string")
          return value;
        const urlMatch = value.match(/^url\(\s*#([^\s)]+)\s*\)$/);
        if (urlMatch)
          return `url(#${id(urlMatch[1])})`;
        if (attrName !== void 0 && HREF_ATTRS.has(attrName)) {
          const hashMatch = value.match(/^#([^\s]+)$/);
          if (hashMatch)
            return `#${id(hashMatch[1])}`;
        }
        return value;
      }
      return {
        id,
        ref,
        prefix,
        seq() {
          return _seq;
        }
      };
    }
    return { createScope };
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
    __register({ name: "graphic.svgApply", dependencies: ["dom"], factory: function(dom) {
    return { SVG_NS: "http://www.w3.org/2000/svg", svgAttr: (target, name, value) => {
      if (target && typeof target.setAttribute === "function")
        dom.attr(target, name, String(value));
    } };
  } });
    __register({ name: "graphic.svgBuild", dependencies: ["dom","graphic.svgApply"], factory: function(dom, svgApply) {
    const { SVG_NS, svgAttr } = svgApply, SVG_TAGS = new Set([
      "svg",
      "g",
      "defs",
      "symbol",
      "use",
      "path",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "text",
      "tspan",
      "image",
      "clipPath",
      "mask",
      "linearGradient",
      "radialGradient",
      "stop",
      "filter",
      "feGaussianBlur",
      "feOffset",
      "feBlend",
      "feColorMatrix",
      "feMerge",
      "feMergeNode",
      "feFlood",
      "feComposite",
      "marker",
      "pattern"
    ]), isRef = (value) => typeof value === "string" && (value.startsWith("#") || value.startsWith("url(#")), scopeValue = (name, value, scope) => {
      if (!scope)
        return value;
      if (name === "id" && typeof scope.id === "function")
        return scope.id(String(value));
      if (typeof scope.ref === "function" && isRef(value))
        return scope.ref(String(value));
      return value;
    };
    function build(node, opts) {
      const tag = node && node.tag;
      if (!SVG_TAGS.has(tag))
        throw Error(`svgBuild: unsupported tag "${tag}"`);
      const scope = opts && opts.idScope, el = document.createElementNS(SVG_NS, tag);
      if (node.attrs)
        for (const name of Object.keys(node.attrs)) {
          const value = scopeValue(name, node.attrs[name], scope);
          svgAttr(el, name, value);
        }
      if (node.children)
        for (const child of node.children)
          if (typeof child === "string")
            el.appendChild(document.createTextNode(child));
          else
            el.appendChild(build(child, opts));
      if (node.text !== void 0)
        el.textContent = String(node.text);
      return el;
    }
    return { build, SVG_TAGS };
  } });
    __register({ name: "graphic.scheduler", dependencies: ["clock"], factory: function(clockApi) {

    class Scheduler {
      constructor(clock) {
        this.active = new Set;
        this._raf = 0;
        this._running = !1;
        const g = globalThis;
        this._now = clock && clock.now || clockApi.monotonic;
        this._schedule = clock && clock.schedule || ((cb) => g.requestAnimationFrame(cb));
        this._cancel = clock && clock.cancel || ((id) => {
          if (g.cancelAnimationFrame)
            g.cancelAnimationFrame(id);
        });
      }
      now() {
        return this._now();
      }
      add(tween) {
        this.active.add(tween);
        if (!this._running)
          this._start();
      }
      remove(tween) {
        this.active.delete(tween);
      }
      _start() {
        this._running = !0;
        const loop = (ts) => {
          this.tick(ts);
          if (this.active.size > 0)
            this._raf = this._schedule(loop);
          else
            this._running = !1;
        };
        this._raf = this._schedule(loop);
      }
      tick(ts) {
        const t = ts == null ? this._now() : ts;
        for (const tween of [...this.active])
          tween._step(t);
      }
      stop() {
        if (this._raf)
          this._cancel(this._raf);
        this._raf = 0;
        this._running = !1;
        this.active.clear();
      }
    }
    const scheduler = new Scheduler;
    return { Scheduler, scheduler };
  } });
    __register({ name: "graphic.tween", dependencies: ["graphic.scheduler","graphic.easing","graphic.interpolate","graphic.svgApply"], factory: function(scheduler, easing, interpolate, svgApply) {
    function cubicBezier(x1, y1, x2, y2) {
      const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by, sampleX = (s) => ((ax * s + bx) * s + cx) * s, slopeX = (s) => (3 * ax * s + 2 * bx) * s + cx, solve = (t) => {
        let s = t;
        for (let i = 0;i < 8; i += 1) {
          const err = sampleX(s) - t;
          if (Math.abs(err) < 0.0000000001)
            return s;
          const d = slopeX(s);
          if (Math.abs(d) < 0.0000001)
            break;
          s -= err / d;
        }
        let lo = 0, hi = 1;
        s = t;
        for (let i = 0;i < 60; i += 1) {
          const x = sampleX(s);
          if (Math.abs(x - t) < 0.0000000001)
            return s;
          if (x < t)
            lo = s;
          else
            hi = s;
          s = (lo + hi) / 2;
        }
        return s;
      };
      return (t) => {
        if (t <= 0)
          return 0;
        if (t >= 1)
          return 1;
        const s = solve(t);
        return ((ay * s + by) * s + cy) * s;
      };
    }
    function steps(n, position) {
      const jumps = position === "jump-none" ? n - 1 : position === "jump-both" ? n + 1 : n, lead = position === "jump-start" || position === "jump-both" ? 1 : 0;
      return (t) => {
        let k = Math.floor(t * n) + lead;
        if (k < 0)
          k = 0;
        if (k > jumps)
          k = jumps;
        return k / jumps;
      };
    }
    const CSS_BEZIERS = {
      ease: [0.25, 0.1, 0.25, 1],
      "ease-in": [0.42, 0, 1, 1],
      "ease-out": [0, 0, 0.58, 1],
      "ease-in-out": [0.42, 0, 0.58, 1]
    }, STEP_POSITIONS = {
      start: "jump-start",
      end: "jump-end",
      "jump-start": "jump-start",
      "jump-end": "jump-end",
      "jump-none": "jump-none",
      "jump-both": "jump-both"
    };
    function resolveEasing(spec) {
      if (typeof spec === "function")
        return spec;
      if (spec === void 0 || spec === null)
        return easing.linear;
      const name = String(spec).trim();
      if (Object.prototype.hasOwnProperty.call(easing, name) && typeof easing[name] === "function")
        return easing[name];
      if (CSS_BEZIERS[name])
        return cubicBezier(...CSS_BEZIERS[name]);
      if (name === "step-start")
        return steps(1, "jump-start");
      if (name === "step-end")
        return steps(1, "jump-end");
      const unknown = () => Error(`Tween: unknown easing "${spec}"`), bez = /^cubic-bezier\(([^,()]+),([^,()]+),([^,()]+),([^,()]+)\)$/.exec(name.replace(/\s+/g, ""));
      if (bez) {
        const p = bez.slice(1).map(Number);
        if (!p.every(Number.isFinite))
          throw unknown();
        if (p[0] < 0 || p[0] > 1 || p[2] < 0 || p[2] > 1)
          throw Error("Tween: cubic-bezier x1 and x2 must be in [0, 1]");
        return cubicBezier(p[0], p[1], p[2], p[3]);
      }
      const st = /^steps\(([^,()]+)(?:,([a-z-]+))?\)$/.exec(name.replace(/\s+/g, ""));
      if (st) {
        const position = st[2] === void 0 ? "jump-end" : STEP_POSITIONS[st[2]];
        if (!position)
          throw unknown();
        const n = Number(st[1]);
        if (!Number.isInteger(n) || n < 1)
          throw Error(`Tween: steps() needs a positive integer count, got "${st[1]}"`);
        if (position === "jump-none" && n < 2)
          throw Error("Tween: steps() with jump-none needs at least 2 steps");
        return steps(n, position);
      }
      throw unknown();
    }

    class Tween {
      constructor(opts) {
        if (!opts || !opts.target)
          throw Error("Tween: target is required");
        this.target = opts.target;
        this.property = opts.property;
        this.duration = opts.duration > 0 ? opts.duration : 1;
        this.ease = resolveEasing(opts.easing);
        this._interp = interpolate.interpolator(opts.from, opts.to);
        this._apply = opts.apply || ((v, target) => svgApply.svgAttr(target, this.property, v));
        this._onUpdate = opts.onUpdate || null;
        this._onComplete = opts.onComplete || null;
        this._scheduler = opts.scheduler || scheduler.scheduler;
        this._startTs = 0;
        this._started = !1;
        this.done = !1;
        this.value = opts.from;
      }
      play() {
        this._started = !1;
        this.done = !1;
        this._scheduler.add(this);
        return this;
      }
      _step(ts) {
        if (this.done)
          return;
        if (!this._started) {
          this._startTs = ts;
          this._started = !0;
        }
        if (this._renderAt(ts - this._startTs) >= 1) {
          this.done = !0;
          this._scheduler.remove(this);
          if (this._onComplete)
            this._onComplete();
        }
      }
      _renderAt(elapsed) {
        let raw = elapsed / this.duration;
        if (raw < 0)
          raw = 0;
        if (raw > 1)
          raw = 1;
        const eased = this.ease(raw), v = this._interp(eased);
        this.value = v;
        this._apply(v, this.target);
        if (this._onUpdate)
          this._onUpdate(v);
        return raw;
      }
    }
    function tween(opts) {
      return new Tween(opts).play();
    }
    return { Tween, tween, resolveEasing };
  } });
    __register({ name: "graphic.timeline", dependencies: ["graphic.scheduler","graphic.tween"], factory: function(scheduler, tweenMod) {
    const { Tween } = tweenMod;

    class Timeline {
      constructor(opts) {
        const o = opts || {};
        this._scheduler = o.scheduler || scheduler.scheduler;
        this._children = [];
        this._onComplete = o.onComplete || null;
        this._onSettle = o.onSettle || null;
        this._startTs = 0;
        this._started = !1;
        this._live = !1;
        this.done = !1;
        this._time = 0;
        this._base = 0;
        this._anchorTs = null;
        this._lastTs = 0;
        this._scale = 1;
        this._paused = !1;
      }
      get time() {
        return this._time;
      }
      get duration() {
        let end = 0;
        for (const c of this._children)
          end = Math.max(end, c.offset + c.tween.duration);
        return end;
      }
      get paused() {
        return this._paused;
      }
      get timeScale() {
        return this._scale;
      }
      set timeScale(v) {
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
          throw Error("Timeline: timeScale must be a finite number >= 0");
        if (this._anchorTs !== null) {
          this._base = this._time;
          this._anchorTs = this._lastTs;
        }
        this._scale = v;
      }
      seek(ms) {
        if (typeof ms !== "number" || !Number.isFinite(ms))
          throw Error("Timeline: seek needs a finite time in ms");
        const t = Math.min(Math.max(ms, 0), this.duration), pending = [], opened = [];
        this._children.forEach((c, i) => {
          const end = c.offset + c.tween.duration;
          if (t < c.offset) {
            pending.push({ c, i });
            c.tween._started = !1;
            c.tween.done = !1;
          } else {
            opened.push({ c, i, last: Math.min(t, end) });
            c.tween._started = !0;
            c.tween._startTs = c.offset;
            c.tween.done = t >= end;
          }
        });
        pending.sort((a, b) => b.c.offset - a.c.offset || b.i - a.i);
        opened.sort((a, b) => a.last - b.last || a.i - b.i);
        for (const p of pending)
          p.c.tween._renderAt(0);
        for (const o of opened)
          o.c.tween._renderAt(t - o.c.offset);
        this._time = t;
        this._base = t;
        this._anchorTs = null;
        return this;
      }
      pause() {
        if (!this._live || this._paused)
          return this;
        this._scheduler.remove(this);
        this._paused = !0;
        this._base = this._time;
        this._anchorTs = null;
        return this;
      }
      resume() {
        if (this._live && !this._paused)
          return this;
        if (!this._live) {
          this._live = !0;
          this.done = !1;
          this._started = !0;
        }
        this._paused = !1;
        this._base = this._time;
        this._anchorTs = null;
        this._scheduler.add(this);
        return this;
      }
      _settle() {
        if (!this._live)
          return !1;
        this._live = !1;
        if (this._onSettle)
          this._onSettle();
        return !0;
      }
      _toTween(item) {
        const t = item instanceof Tween ? item : new Tween({ ...item, scheduler: this._scheduler });
        t._scheduler = this._scheduler;
        return t;
      }
      add(tweenOrOptions, atMs) {
        this._children.push({
          tween: this._toTween(tweenOrOptions),
          offset: atMs > 0 ? atMs : 0
        });
        return this;
      }
      sequence(items) {
        let cursor = 0;
        for (const item of items) {
          const t = this._toTween(item);
          this._children.push({ tween: t, offset: cursor });
          cursor += t.duration;
        }
        return this;
      }
      parallel(items) {
        for (const item of items)
          this._children.push({ tween: this._toTween(item), offset: 0 });
        return this;
      }
      stagger(items, stepMs) {
        if (stepMs === null || typeof stepMs !== "object") {
          const step = stepMs > 0 ? stepMs : 0;
          items.forEach((item, i) => {
            this._children.push({ tween: this._toTween(item), offset: i * step });
          });
          return this;
        }
        const o = stepMs, each = o.each > 0 ? o.each : 0, at = o.at > 0 ? o.at : 0, n = items.length, from = o.from === void 0 ? "start" : o.from, mid = (n - 1) / 2;
        let dist;
        if (from === "start")
          dist = (i) => i;
        else if (from === "end")
          dist = (i) => n - 1 - i;
        else if (from === "center")
          dist = (i) => Math.abs(i - mid);
        else if (from === "edges")
          dist = (i) => mid - Math.abs(i - mid);
        else if (Number.isInteger(from) && from >= 0 && from < n)
          dist = (i) => Math.abs(i - from);
        else
          throw Error(`Timeline: stagger from must be 'start', 'end', 'center', 'edges' or an index in [0, ${n}), got ${JSON.stringify(from)}`);
        let maxD = 0;
        for (let i = 0;i < n; i += 1)
          maxD = Math.max(maxD, dist(i));
        const ease = o.ease === void 0 || o.ease === null ? null : typeof o.ease === "function" ? o.ease : tweenMod.resolveEasing(o.ease);
        items.forEach((item, i) => {
          const d = dist(i), span = ease && maxD > 0 ? ease(d / maxD) * maxD : d;
          this._children.push({ tween: this._toTween(item), offset: at + span * each });
        });
        return this;
      }
      play() {
        this._started = !1;
        this.done = !1;
        this._live = !0;
        this._paused = !1;
        this._time = 0;
        this._base = 0;
        this._anchorTs = null;
        for (const c of this._children) {
          c.tween._started = !1;
          c.tween.done = !1;
        }
        this._scheduler.add(this);
        return this;
      }
      stop() {
        this._scheduler.remove(this);
        this._paused = !1;
        this._anchorTs = null;
        this._settle();
        return this;
      }
      _step(ts) {
        if (this.done)
          return;
        if (!this._started) {
          this._startTs = ts;
          this._started = !0;
        }
        if (this._anchorTs === null)
          this._anchorTs = ts;
        this._lastTs = ts;
        const elapsed = this._base + (ts - this._anchorTs) * this._scale;
        this._time = elapsed;
        let allDone = !0;
        for (const c of this._children) {
          if (c.tween.done)
            continue;
          if (elapsed >= c.offset) {
            if (!c.tween._started) {
              c.tween._startTs = c.offset;
              c.tween._started = !0;
            }
            c.tween._step(elapsed);
          }
          if (!c.tween.done)
            allDone = !1;
        }
        if (allDone && this._children.length > 0) {
          this.done = !0;
          this._scheduler.remove(this);
          this._settle();
          if (this._onComplete)
            this._onComplete();
        }
      }
    }
    return { Timeline };
  } });
    __register({ name: "graphic.scene", dependencies: ["graphic.svgBuild","graphic.scopedIds","graphic.timeline","graphic.tween","graphic.scheduler"], factory: function(svgBuild, scopedIds, timelineMod, tweenMod, scheduler) {
    const { Timeline } = timelineMod;
    let _instanceSeq = 0;

    class Scene {
      constructor(spec) {
        const s = spec || {};
        this._spec = s;
        this._scope = scopedIds.createScope(s.prefix !== void 0 ? s.prefix : `scene-${_instanceSeq++}`);
        this.root = svgBuild.build(s.template, { idScope: this._scope });
        this._refs = s.refs || {};
        this._elements = new Map;
        for (const name of Object.keys(this._refs)) {
          const scopedId = this._scope.id(this._refs[name]), el = this.root.querySelector ? this.root.getAttribute && this.root.getAttribute("id") === scopedId ? this.root : this.root.querySelector(`#${scopedId}`) : null;
          this._elements.set(name, el || null);
        }
        this._events = s.events || {};
        this._fired = new Map;
        this._halted = new Set;
        this._disposed = !1;
      }
      el(name) {
        if (!this._elements.has(name) || !this._elements.get(name))
          throw Error(`scene: unknown ref "${name}"`);
        return this._elements.get(name);
      }
      _resolveTarget(anim, eventSpec) {
        return this.el(anim.target || eventSpec.at);
      }
      _toTweenOptions(anim, eventSpec) {
        return {
          target: this._resolveTarget(anim, eventSpec),
          property: anim.property,
          from: anim.from,
          to: anim.to,
          duration: anim.duration,
          easing: anim.easing
        };
      }
      on(eventName) {
        return this._compile(eventName, null);
      }
      _compile(eventName, onSettle) {
        if (this._disposed)
          throw Error("scene: disposed");
        const eventSpec = this._events[eventName];
        if (!eventSpec)
          throw Error(`scene: unknown event "${eventName}"`);
        const items = eventSpec.animations.map((anim) => this._toTweenOptions(anim, eventSpec)), opts = {};
        if (eventSpec.loop)
          opts.onComplete = () => {
            if (!this._disposed && !this._halted.has(eventName))
              this.fire(eventName);
          };
        if (onSettle)
          opts.onSettle = onSettle;
        const tl = new Timeline(opts), mode = eventSpec.mode || "parallel";
        if (mode === "sequence")
          tl.sequence(items);
        else if (mode === "stagger")
          tl.stagger(items, eventSpec.stepMs);
        else
          tl.parallel(items);
        return tl;
      }
      fire(eventName) {
        if (this._disposed)
          throw Error("scene: disposed");
        this._halted.delete(eventName);
        let set = this._fired.get(eventName);
        if (!set) {
          set = new Set;
          this._fired.set(eventName, set);
        }
        const live = set;
        let tl = null;
        tl = this._compile(eventName, () => live.delete(tl));
        live.add(tl);
        return tl.play();
      }
      stop(eventName) {
        const names = eventName === void 0 ? Object.keys(this._events) : [eventName];
        for (const name of names) {
          this._halted.add(name);
          const set = this._fired.get(name);
          if (!set)
            continue;
          for (const tl of [...set])
            tl.stop();
          set.clear();
        }
      }
      dispose() {
        if (this._disposed)
          return;
        this.stop();
        this._disposed = !0;
        if (this.root && this.root.parentNode)
          this.root.parentNode.removeChild(this.root);
      }
    }
    function createScene(spec) {
      return new Scene(spec);
    }
    return { createScene };
  } });
    __register({ name: "graphic.frames", dependencies: ["graphic.scheduler","graphic.svgApply"], factory: function(scheduler, svgApply) {
    function frameIndexOf(raw, frameCount, loop, pingPong) {
      if (frameCount <= 1)
        return 0;
      if (raw < 0)
        raw = 0;
      if (pingPong) {
        const period = 2 * (frameCount - 1), pos = loop ? raw % period : Math.min(raw, period);
        return pos < frameCount ? pos : period - pos;
      }
      if (loop)
        return raw % frameCount;
      return raw < frameCount ? raw : frameCount - 1;
    }
    function isFinished(raw, frameCount, pingPong) {
      if (frameCount <= 1)
        return raw >= 0;
      const last = pingPong ? 2 * (frameCount - 1) : frameCount - 1;
      return raw >= last;
    }

    class Frames {
      constructor(opts) {
        if (!opts || !opts.frames && !opts.sprite)
          throw Error("Frames: frames or sprite is required");
        if (opts.frames && opts.sprite)
          throw Error("Frames: frames and sprite are mutually exclusive");
        this._frames = opts.frames || null;
        this._sprite = opts.sprite || null;
        if (this._frames && this._frames.length === 0)
          throw Error("Frames: frames must not be empty");
        this.frameCount = this._frames ? this._frames.length : this._sprite.cols * this._sprite.rows;
        this.fps = opts.fps > 0 ? opts.fps : 12;
        this.loop = opts.loop !== void 0 ? !!opts.loop : !0;
        this.pingPong = !!opts.pingPong;
        this._onFrame = opts.onFrame || null;
        this._onComplete = opts.onComplete || null;
        this._apply = opts.apply || ((index, api) => {
          if (api.frames)
            for (let i = 0;i < api.frames.length; i += 1)
              api.svgApply.svgAttr(api.frames[i], "display", i === index ? "inline" : "none");
          else
            api.svgApply.svgAttr(api.sprite.target, "viewBox", api.window(index));
        });
        this._scheduler = opts.scheduler || scheduler.scheduler;
        this._startTs = 0;
        this._started = !1;
        this.playing = !1;
        this.done = !1;
        this.frame = 0;
        this._lastIndex = -1;
      }
      _window(i) {
        const s = this._sprite, col = i % s.cols, row = Math.floor(i / s.cols);
        return `${col * s.frameW} ${row * s.frameH} ${s.frameW} ${s.frameH}`;
      }
      _render(index) {
        this._apply(index, {
          frames: this._frames || void 0,
          sprite: this._sprite || void 0,
          svgApply,
          window: (i) => this._window(i)
        });
      }
      play() {
        this._started = !1;
        this.done = !1;
        this.playing = !0;
        this._scheduler.add(this);
        return this;
      }
      pause() {
        this.playing = !1;
        this._scheduler.remove(this);
        return this;
      }
      seek(index) {
        let i = Math.floor(index);
        if (i < 0)
          i = 0;
        if (i > this.frameCount - 1)
          i = this.frameCount - 1;
        this.frame = i;
        this._lastIndex = i;
        this._render(i);
        if (this._onFrame)
          this._onFrame(i);
        return this;
      }
      _step(ts) {
        if (this.done)
          return;
        if (!this._started) {
          this._startTs = ts;
          this._started = !0;
        }
        const elapsed = ts - this._startTs, raw = Math.floor((elapsed > 0 ? elapsed : 0) * this.fps / 1000), index = frameIndexOf(raw, this.frameCount, this.loop, this.pingPong);
        if (index !== this._lastIndex) {
          this._lastIndex = index;
          this.frame = index;
          this._render(index);
          if (this._onFrame)
            this._onFrame(index);
        }
        if (!this.loop && isFinished(raw, this.frameCount, this.pingPong)) {
          this.done = !0;
          this.playing = !1;
          this._scheduler.remove(this);
          if (this._onComplete)
            this._onComplete();
        }
      }
    }
    function frames(opts) {
      return new Frames(opts);
    }
    return { Frames, frames };
  } });
    __register({ name: "graphic.anim", dependencies: ["graphic.lerp","graphic.easing","graphic.units","graphic.matrix","graphic.color","graphic.scopedIds","graphic.interpolate","graphic.svgApply","graphic.svgBuild","graphic.scheduler","graphic.tween","graphic.timeline","graphic.scene","graphic.frames"], factory: function(lerp, easing, units, matrix, color, scopedIds, interpolate, svgApply, svgBuild, scheduler, tween, timeline, scene, frames) {
    return {
      lerp,
      easing,
      units,
      matrix,
      color,
      scopedIds,
      interpolate,
      svgApply,
      svgBuild,
      scheduler,
      tween,
      timeline,
      scene,
      frames
    };
  } });

    const __core = __resolve("graphic.anim");
    return __core;
    }
};
