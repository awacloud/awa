/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-easing-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.easing`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-easing-bundled
 */

export const graphicEasingBundled = {
    name: "graphicEasingBundled",
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
    __register({ name: "easing", dependencies: [], factory: function() {
    const ease = {};
    ease.linear = function(t, b, c, d) {
      return c * t / d + b;
    };
    ease.easeInQuad = function(t, b, c, d) {
      return c * (t /= d) * t + b;
    };
    ease.easeOutQuad = function(t, b, c, d) {
      return -c * (t /= d) * (t - 2) + b;
    };
    ease.easeInOutQuad = function(t, b, c, d) {
      if ((t /= d / 2) < 1)
        return c / 2 * t * t + b;
      return -c / 2 * (--t * (t - 2) - 1) + b;
    };
    ease.easeInCubic = function(t, b, c, d) {
      return c * (t /= d) * t * t + b;
    };
    ease.easeOutCubic = function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * t + 1) + b;
    };
    ease.easeInOutCubic = function(t, b, c, d) {
      if ((t /= d / 2) < 1)
        return c / 2 * t * t * t + b;
      return c / 2 * ((t -= 2) * t * t + 2) + b;
    };
    ease.easeInQuart = function(t, b, c, d) {
      return c * (t /= d) * t * t * t + b;
    };
    ease.easeOutQuart = function(t, b, c, d) {
      return -c * ((t = t / d - 1) * t * t * t - 1) + b;
    };
    ease.easeInOutQuart = function(t, b, c, d) {
      if ((t /= d / 2) < 1)
        return c / 2 * t * t * t * t + b;
      return -c / 2 * ((t -= 2) * t * t * t - 2) + b;
    };
    ease.easeInQuint = function(t, b, c, d) {
      return c * (t /= d) * t * t * t * t + b;
    };
    ease.easeOutQuint = function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
    };
    ease.easeInOutQuint = function(t, b, c, d) {
      if ((t /= d / 2) < 1)
        return c / 2 * t * t * t * t * t + b;
      return c / 2 * ((t -= 2) * t * t * t * t + 2) + b;
    };
    ease.easeInSine = function(t, b, c, d) {
      return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
    };
    ease.easeOutSine = function(t, b, c, d) {
      return c * Math.sin(t / d * (Math.PI / 2)) + b;
    };
    ease.easeInOutSine = function(t, b, c, d) {
      return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
    };
    ease.easeInExpo = function(t, b, c, d) {
      return t === 0 ? b : c * Math.pow(2, 10 * (t / d - 1)) + b;
    };
    ease.easeOutExpo = function(t, b, c, d) {
      return t === d ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
    };
    ease.easeInOutExpo = function(t, b, c, d) {
      if (t === 0)
        return b;
      if (t === d)
        return b + c;
      if ((t /= d / 2) < 1)
        return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
      return c / 2 * (-Math.pow(2, -10 * (t - 1)) + 2) + b;
    };
    ease.easeInCirc = function(t, b, c, d) {
      return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
    };
    ease.easeOutCirc = function(t, b, c, d) {
      return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
    };
    ease.easeInOutCirc = function(t, b, c, d) {
      if ((t /= d / 2) < 1)
        return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
      return c / 2 * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
    };
    ease.easeInElastic = function(t, b, c, d) {
      let s, p = 0, a = c;
      if (t === 0)
        return b;
      if ((t /= d) === 1)
        return b + c;
      if (!p)
        p = d * 0.3;
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else
        s = p / (2 * Math.PI) * Math.asin(c / a);
      return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
    };
    ease.easeOutElastic = function(t, b, c, d) {
      let s, p = 0, a = c;
      if (t === 0)
        return b;
      if ((t /= d) === 1)
        return b + c;
      if (!p)
        p = d * 0.3;
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else
        s = p / (2 * Math.PI) * Math.asin(c / a);
      return a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p) + c + b;
    };
    ease.easeInOutElastic = function(t, b, c, d) {
      let s, p = 0, a = c;
      if (t === 0)
        return b;
      if ((t /= d / 2) === 2)
        return b + c;
      if (!p)
        p = d * 0.44999999999999996;
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else
        s = p / (2 * Math.PI) * Math.asin(c / a);
      if (t < 1)
        return -0.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
      return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p) * 0.5 + c + b;
    };
    ease.easeInBack = function(t, b, c, d) {
      return c * (t /= d) * t * (2.70158 * t - 1.70158) + b;
    };
    ease.easeOutBack = function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * (2.70158 * t + 1.70158) + 1) + b;
    };
    ease.easeInOutBack = function(t, b, c, d) {
      let s = 1.70158;
      if ((t /= d / 2) < 1)
        return c / 2 * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
      return c / 2 * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
    };
    ease.easeInBounce = function(t, b, c, d) {
      return c - ease.easeOutBounce(d - t, 0, c, d) + b;
    };
    ease.easeOutBounce = function(t, b, c, d) {
      if ((t /= d) < 0.36363636363636365)
        return c * (7.5625 * t * t) + b;
      else if (t < 0.7272727272727273)
        return c * (7.5625 * (t -= 0.5454545454545454) * t + 0.75) + b;
      else if (t < 0.9090909090909091)
        return c * (7.5625 * (t -= 0.8181818181818182) * t + 0.9375) + b;
      else
        return c * (7.5625 * (t -= 0.9545454545454546) * t + 0.984375) + b;
    };
    ease.easeInOutBounce = function(t, b, c, d) {
      if (t < d / 2)
        return ease.easeInBounce(t * 2, 0, c, d) * 0.5 + b;
      return ease.easeOutBounce(t * 2 - d, 0, c, d) * 0.5 + c * 0.5 + b;
    };
    return ease;
  } });

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "graphic.easing", dependencies: ["easing"], factory: function(fwEasing) {
    const table = {};
    for (const name of Object.keys(fwEasing)) {
      const curve = fwEasing[name];
      if (typeof curve === "function")
        table[name] = (t) => curve(t, 0, 1, 1);
    }
    return table;
  } });

    const __core = __resolve("graphic.easing");
    return __core;
    }
};
