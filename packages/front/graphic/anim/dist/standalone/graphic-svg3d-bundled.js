/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-svg3d-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.svg3d`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-svg3d-bundled
 */

export const graphicSvg3dBundled = {
    name: "graphicSvg3dBundled",
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
    __register({ name: "secPolicy", dependencies: [], factory: function() {
    const URL_ATTRS = new Set([
      "href",
      "src",
      "action",
      "formaction",
      "srcset",
      "xlink:href",
      "data",
      "codebase"
    ]), SCHEME_DANGEROUS_RE = /^(javascript|vbscript|file|jar|data:text|data:application)/, SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "ftp"]), DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico|avif|apng)[;,]/;
    function isSafeUrl(url, schemes, allowDataImage) {
      if (typeof url !== "string")
        return !1;
      const trimmed = url.replace(/[\x00-\x20\x7f]+/g, "").toLowerCase();
      if (trimmed === "")
        return !0;
      if (trimmed[0] === "#" || trimmed[0] === "/" || trimmed[0] === "?" || trimmed[0] === ".")
        return !0;
      if (SCHEME_DANGEROUS_RE.test(trimmed))
        return !1;
      if (trimmed.startsWith("data:")) {
        if (allowDataImage === !1)
          return !1;
        return DATA_IMAGE_RE.test(trimmed);
      }
      const colon = trimmed.indexOf(":");
      if (colon === -1)
        return !0;
      const slash = trimmed.indexOf("/");
      if (slash !== -1 && slash < colon)
        return !0;
      const allowed = Array.isArray(schemes) || schemes instanceof Set ? schemes : SAFE_SCHEMES, scheme = trimmed.slice(0, colon);
      return allowed instanceof Set ? allowed.has(scheme) : allowed.includes(scheme);
    }
    const CLOBBER_ATTRS = new Set(["id", "name"]), CLOBBER_NAMES = new Set([
      "cookie",
      "cookies",
      "domain",
      "location",
      "write",
      "writeln",
      "open",
      "close",
      "body",
      "head",
      "title",
      "URL",
      "referrer",
      "documentElement",
      "documentURI",
      "currentScript",
      "designMode",
      "forms",
      "images",
      "links",
      "scripts",
      "styleSheets",
      "all",
      "embeds",
      "plugins",
      "anchors",
      "applets",
      "parent",
      "top",
      "self",
      "frames",
      "frameElement",
      "opener",
      "elements",
      "submit",
      "reset",
      "method",
      "action"
    ]);
    function isClobberValue(attrName, value) {
      return CLOBBER_ATTRS.has(attrName) && CLOBBER_NAMES.has(String(value));
    }
    const EVENT_ATTR_RE = /^on/i, SAFE_ATTR_NAME_RE = /^[a-zA-Z]/;
    function isEventAttr(name) {
      return typeof name === "string" && EVENT_ATTR_RE.test(name);
    }
    function isSafeAttrName(name) {
      return typeof name === "string" && SAFE_ATTR_NAME_RE.test(name) && !EVENT_ATTR_RE.test(name);
    }
    const BLOCKED_TAGS_RE = /^(script|object|embed|iframe)$/;
    function isBlockedTag(tagName) {
      return typeof tagName === "string" && BLOCKED_TAGS_RE.test(tagName);
    }
    const CSS_DANGEROUS_RE = /expression\(|url\(['"]?(?:javascript|vbscript|data:text|data:application)/, CSS_BLOCKED_PROPS = new Set(["behavior", "-ms-behavior"]);
    function isSafeCss(prop, val) {
      if (typeof prop === "string" && CSS_BLOCKED_PROPS.has(prop.toLowerCase()))
        return !1;
      if (val == null)
        return !0;
      const collapsed = String(val).replace(/[\x00-\x20\x7f]+/g, "").toLowerCase();
      return !CSS_DANGEROUS_RE.test(collapsed);
    }
    return {
      URL_ATTRS,
      SCHEME_DANGEROUS_RE,
      SAFE_SCHEMES,
      DATA_IMAGE_RE,
      isSafeUrl,
      CLOBBER_ATTRS,
      CLOBBER_NAMES,
      isClobberValue,
      EVENT_ATTR_RE,
      SAFE_ATTR_NAME_RE,
      isEventAttr,
      isSafeAttrName,
      BLOCKED_TAGS_RE,
      isBlockedTag,
      CSS_DANGEROUS_RE,
      CSS_BLOCKED_PROPS,
      isSafeCss
    };
  } });
    __register({ name: "dom", dependencies: ["secPolicy"], factory: function(secPolicy) {
    const styleApply = function(element, prop, val) {
      if (!secPolicy.isSafeCss(prop, val))
        return;
      element.style.setProperty(prop, val);
    }, toNodes = function(target) {
      if (Array.isArray(target) || target instanceof NodeList)
        return target;
      return [target];
    };
    return {
      queryAll(node, selector) {
        if ((node instanceof HTMLElement || node instanceof SVGElement) && typeof selector === "string")
          return node.querySelectorAll(selector);
        return [];
      },
      query(node, selector) {
        if ((node instanceof HTMLElement || node instanceof SVGElement) && typeof selector === "string")
          return node.querySelector(selector);
        return null;
      },
      attr(target, name, value) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].setAttribute(name, value);
      },
      attrGet(element, name) {
        if (element instanceof Element)
          return element.getAttribute(name);
        return null;
      },
      attrRemove(target, name) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].removeAttribute(name);
      },
      attrHas(element, name) {
        if (element instanceof Element)
          return element.hasAttribute(name);
        return !1;
      },
      data(target, key, value) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if ("dataset" in nodes[i])
            nodes[i].dataset[key] = value;
      },
      dataGet(element, key) {
        if ("dataset" in element)
          return element.dataset[key] ?? null;
        return null;
      },
      dataRemove(target, key) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if ("dataset" in nodes[i])
            delete nodes[i].dataset[key];
      },
      dataHas(element, key) {
        if ("dataset" in element)
          return key in element.dataset;
        return !1;
      },
      classAdd(target, name) {
        const names = name.trim().split(/\s+/), nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].classList.add(...names);
      },
      classRemove(target, name) {
        const names = name.trim().split(/\s+/), nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].classList.remove(...names);
      },
      classHas(element, name) {
        if (element instanceof Element)
          return element.classList.contains(name);
        return !1;
      },
      classToggle(target, name) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].classList.toggle(name);
      },
      classReplace(target, oldName, newName) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].classList.replace(oldName, newName);
      },
      style(target, prop, val) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          styleApply(nodes[i], prop, val);
      },
      styleGet(element, prop) {
        if (element instanceof Element)
          return getComputedStyle(element).getPropertyValue(prop);
        return null;
      },
      styleGetAll(element) {
        if (element instanceof Element)
          return getComputedStyle(element);
        return null;
      },
      styleRemove(target, prop) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          nodes[i].style.removeProperty(prop);
      },
      hide(target) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          styleApply(nodes[i], "display", "none");
      },
      show(target, displayVal) {
        const val = displayVal !== void 0 ? displayVal : "", nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if (val === "")
            nodes[i].style.removeProperty("display");
          else
            styleApply(nodes[i], "display", val);
      },
      toggleVisibility(target) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if (nodes[i].style.display === "none")
            nodes[i].style.removeProperty("display");
          else
            styleApply(nodes[i], "display", "none");
      },
      rect(element) {
        if (element instanceof Element)
          return element.getBoundingClientRect();
        return null;
      },
      scrollPos(element) {
        if (element instanceof Element)
          return { top: element.scrollTop, left: element.scrollLeft };
        return null;
      },
      scrollTo(target, top, left) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++) {
          if (top !== void 0)
            nodes[i].scrollTop = top;
          if (left !== void 0)
            nodes[i].scrollLeft = left;
        }
      },
      reorder(parent, orderedChildren) {
        if (!(parent instanceof Element))
          return;
        const mover = parent, move = typeof mover.moveBefore === "function" ? (child, ref) => mover.moveBefore(child, ref) : (child, ref) => parent.insertBefore(child, ref);
        let cursor = parent.firstChild;
        for (let i = 0;i < orderedChildren.length; i++) {
          const child = orderedChildren[i];
          if (!(child instanceof Element) || child.parentNode !== parent)
            continue;
          if (child === cursor) {
            cursor = cursor.nextSibling;
            continue;
          }
          move(child, cursor);
        }
      },
      fragment(nodes) {
        const frag = document.createDocumentFragment();
        if (nodes && typeof nodes[Symbol.iterator] === "function") {
          for (const n of nodes)
            if (n instanceof Node)
              frag.appendChild(n);
        }
        return frag;
      },
      bind(name, element, getter, setter, opts) {
        if (!(element instanceof Element))
          throw Error("dom.bind: element must be an Element");
        if (typeof getter !== "function" || typeof setter !== "function")
          throw Error("dom.bind: getter and setter must be functions");
        const ev = opts && opts.event || "input", checked = !!(opts && opts.checked), apply = checked ? () => {
          const v = getter();
          element.checked = !!v;
        } : () => {
          const v = getter();
          element.value = v == null ? "" : String(v);
        };
        apply();
        const handler = () => {
          setter(checked ? element.checked : element.value);
        };
        element.addEventListener(ev, handler);
        let destroyed = !1;
        return {
          refresh: apply,
          destroy() {
            if (destroyed)
              return;
            destroyed = !0;
            element.removeEventListener(ev, handler);
          }
        };
      },
      focus(element) {
        if (element instanceof Element)
          element.focus();
      },
      blur(element) {
        if (element instanceof Element)
          element.blur();
      },
      text(target, value) {
        const nodes = toNodes(target);
        if (Array.isArray(value)) {
          const buildFragments = (doc) => {
            const frag = doc.createDocumentFragment();
            for (const part of value) {
              if (part == null)
                continue;
              const t = String(part.text == null ? "" : part.text);
              if (part.lang) {
                const span = doc.createElement("span");
                span.setAttribute("lang", String(part.lang));
                if (part.dir)
                  span.setAttribute("dir", String(part.dir));
                span.textContent = t;
                frag.appendChild(span);
              } else
                frag.appendChild(doc.createTextNode(t));
            }
            return frag;
          };
          for (let i = 0;i < nodes.length; i++) {
            const n = nodes[i];
            if (!(n instanceof Element))
              continue;
            n.textContent = "";
            n.appendChild(buildFragments(n.ownerDocument || document));
          }
          return;
        }
        const str = value == null ? "" : String(value);
        for (let i = 0;i < nodes.length; i++)
          if (nodes[i] instanceof Node)
            nodes[i].textContent = str;
      },
      textGet(element) {
        if (element instanceof Node)
          return element.textContent;
        return null;
      },
      val(target, value) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if ("value" in nodes[i])
            nodes[i].value = value;
      },
      valGet(element) {
        if (element instanceof Element && "value" in element)
          return element.value;
        return null;
      },
      checked(target, state) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if ("checked" in nodes[i])
            nodes[i].checked = !!state;
      },
      checkedGet(element) {
        if (element instanceof Element && "checked" in element)
          return element.checked;
        return null;
      },
      disabled(target, state) {
        const nodes = toNodes(target);
        for (let i = 0;i < nodes.length; i++)
          if ("disabled" in nodes[i])
            nodes[i].disabled = !!state;
      },
      disabledGet(element) {
        if (element instanceof Element && "disabled" in element)
          return element.disabled;
        return null;
      }
    };
  } });
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
    __register({ name: "clock", dependencies: [], factory: function() {
    let _lastMono = Date.now();
    function now() {
      return Date.now();
    }
    function monotonic() {
      const t = Date.now();
      if (t < _lastMono)
        return _lastMono;
      _lastMono = t;
      return t;
    }
    function since(t0) {
      return Math.max(0, monotonic() - t0);
    }
    function iso() {
      return new Date().toISOString();
    }
    function format(ms) {
      const n = Number(ms);
      if (!Number.isFinite(n))
        return String(ms);
      const abs = Math.abs(n);
      if (abs < 1)
        return n.toFixed(3) + " ms";
      if (abs < 1000)
        return n.toFixed(1) + " ms";
      if (abs < 60000)
        return (n / 1000).toFixed(3) + " s";
      if (abs < 3600000)
        return (n / 60000).toFixed(2) + " min";
      return (n / 3600000).toFixed(2) + " h";
    }
    return { now, monotonic, since, iso, format };
  } });

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "svg3d.vec3", dependencies: [], factory: function() {
    function dot3(ax, ay, az, bx, by, bz) {
      return ax * bx + ay * by + az * bz;
    }
    function cross3(ax, ay, az, bx, by, bz, out) {
      out[0] = ay * bz - az * by;
      out[1] = az * bx - ax * bz;
      out[2] = ax * by - ay * bx;
      return out;
    }
    function length3(x, y, z) {
      return Math.sqrt(x * x + y * y + z * z);
    }
    function rotationMatrix3(rx, ry, rz, out) {
      const m = out || new Float64Array(9), cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      m[0] = cz * cy + sz * sx * sy;
      m[1] = sz * cx;
      m[2] = cz * sy - sz * sx * cy;
      m[3] = -sz * cy + cz * sx * sy;
      m[4] = cz * cx;
      m[5] = -sz * sy - cz * sx * cy;
      m[6] = -cx * sy;
      m[7] = sx;
      m[8] = cx * cy;
      return m;
    }
    function applyMatrix3(m, x, y, z, out) {
      out[0] = m[0] * x + m[1] * y + m[2] * z;
      out[1] = m[3] * x + m[4] * y + m[5] * z;
      out[2] = m[6] * x + m[7] * y + m[8] * z;
      return out;
    }
    return { dot3, cross3, length3, rotationMatrix3, applyMatrix3 };
  } });
    __register({ name: "svg3d.mesh", dependencies: ["svg3d.vec3"], factory: function(vec3) {
    function decodeHeightmap(source) {
      if (source === null || typeof source !== "object")
        throw TypeError("svg3d.mesh: heightmap must be { side, heights } or { data, width, height }");
      if (source.data !== void 0 && source.data !== null) {
        const { width, height } = source;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
          throw TypeError("svg3d.mesh: image heightmap needs integer width/height \u2265 1");
        if (width !== height)
          throw TypeError(`svg3d.mesh: image heightmap must be square (got ${width}\xD7${height})`);
        const n = width * height;
        if (source.data.length < n * 4)
          throw RangeError(`svg3d.mesh: image heightmap needs ${n * 4} bytes, got ${source.data.length}`);
        const heights = new Float64Array(n);
        for (let p = 0;p < n; p += 1)
          heights[p] = source.data[p * 4] / 255;
        return { side: width, heights };
      }
      if (source.heights !== void 0 && source.heights !== null) {
        const side = source.side;
        if (!Number.isInteger(side) || side < 1)
          throw TypeError("svg3d.mesh: sample heightmap needs an integer side \u2265 1");
        const src = source.heights;
        if (src.length !== side * side)
          throw RangeError(`svg3d.mesh: sample heightmap needs ${side * side} values, got ${src.length}`);
        const heights = new Float64Array(side * side);
        for (let p = 0;p < heights.length; p += 1)
          heights[p] = src[p];
        return { side, heights };
      }
      throw TypeError("svg3d.mesh: heightmap must be { side, heights } or { data, width, height }");
    }
    function hex2(c) {
      let v = Math.round(c);
      if (v < 0)
        v = 0;
      if (v > 255)
        v = 255;
      const s = v.toString(16);
      return s.length === 1 ? `0${s}` : s;
    }
    function buildColorLut() {
      const lut = Array(528);
      for (let b = 0;b < 16; b += 1) {
        const h = b / 15, r0 = 129 - h * 127, g0 = 128 + h * 127;
        for (let s = 0;s < 33; s += 1) {
          const amt = Math.round(2.55 * -(s / 32 * 50));
          lut[b * 33 + s] = `#${hex2(r0 + amt)}${hex2(g0 + amt)}${hex2(51 + amt)}`;
        }
      }
      return lut;
    }
    function buildWaterLut() {
      const lut = Array(33);
      for (let s = 0;s < 33; s += 1) {
        const amt = Math.round(2.55 * -(s / 32 * 50));
        lut[s] = `#${hex2(amt)}${hex2(amt)}${hex2(221 + amt)}`;
      }
      return lut;
    }
    function normaliseHeights(heights, side) {
      const n = side * side;
      if (heights === void 0 || heights === null)
        return new Float64Array(n);
      if (typeof heights.length === "number") {
        if (heights.length !== n)
          throw RangeError(`svg3d.mesh: heights needs ${n} values for cells=${side - 1}, got ${heights.length}`);
        const out = new Float64Array(n);
        for (let p = 0;p < n; p += 1)
          out[p] = heights[p];
        return out;
      }
      const decoded = decodeHeightmap(heights);
      if (decoded.side !== side)
        throw RangeError(`svg3d.mesh: heightmap side ${decoded.side} does not match cells=${side - 1} (needs ${side})`);
      return decoded.heights;
    }
    function buildGridMesh(opts) {
      const o = opts || {}, cells = o.cells;
      if (!Number.isInteger(cells) || cells < 1)
        throw TypeError("svg3d.mesh: cells must be an integer \u2265 1");
      const side = cells + 1, spacing = o.spacing === void 0 ? 40 : o.spacing, heightScale = o.heightScale === void 0 ? 220 : o.heightScale, heights = normaliseHeights(o.heights, side), vertexCount = side * side, triangleCount = 2 * cells * cells, positions = new Float64Array(vertexCount * 3), half = cells * spacing / 2;
      for (let j = 0;j < side; j += 1)
        for (let i = 0;i < side; i += 1) {
          const v = j * side + i;
          positions[v * 3] = i * spacing - half;
          positions[v * 3 + 1] = -heights[v] * heightScale;
          positions[v * 3 + 2] = j * spacing - half;
        }
      const indices = new Uint32Array(triangleCount * 3);
      let t = 0;
      for (let j = 0;j < cells; j += 1)
        for (let i = 0;i < cells; i += 1) {
          const v00 = j * side + i, v10 = v00 + 1, v01 = v00 + side, v11 = v01 + 1;
          indices[t * 3] = v00;
          indices[t * 3 + 1] = v11;
          indices[t * 3 + 2] = v10;
          t += 1;
          indices[t * 3] = v00;
          indices[t * 3 + 1] = v01;
          indices[t * 3 + 2] = v11;
          t += 1;
        }
      const normals = new Float64Array(triangleCount * 3), normalLen = new Float64Array(triangleCount), centroids = new Float64Array(triangleCount * 3), baseQ = new Uint8Array(triangleCount), water = new Uint8Array(triangleCount), n = new Float64Array(3);
      for (let f = 0;f < triangleCount; f += 1) {
        const i1 = indices[f * 3] * 3, i2 = indices[f * 3 + 1] * 3, i3 = indices[f * 3 + 2] * 3, p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2], p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2], p3x = positions[i3], p3y = positions[i3 + 1], p3z = positions[i3 + 2];
        vec3.cross3(p1x - p2x, p1y - p2y, p1z - p2z, p3x - p2x, p3y - p2y, p3z - p2z, n);
        normals[f * 3] = n[0];
        normals[f * 3 + 1] = n[1];
        normals[f * 3 + 2] = n[2];
        normalLen[f] = vec3.length3(n[0], n[1], n[2]);
        const cx = (p1x + p2x + p3x) / 3, cy = (p1y + p2y + p3y) / 3, cz = (p1z + p2z + p3z) / 3;
        centroids[f * 3] = cx;
        centroids[f * 3 + 1] = cy;
        centroids[f * 3 + 2] = cz;
        const hNorm = heightScale > 0 ? Math.min(1, Math.max(0, -cy / heightScale)) : 0;
        let q = Math.round(hNorm * 15);
        if (q < 0)
          q = 0;
        if (q > 15)
          q = 15;
        baseQ[f] = q;
        water[f] = heights[indices[f * 3]] === 0 && heights[indices[f * 3 + 1]] === 0 && heights[indices[f * 3 + 2]] === 0 ? 1 : 0;
      }
      return {
        cells,
        side,
        vertexCount,
        triangleCount,
        spacing,
        heightScale,
        positions,
        indices,
        normals,
        normalLen,
        centroids,
        baseQ,
        water,
        baseLevels: 16,
        shadeLevels: 33,
        colorLut: buildColorLut(),
        waterLut: buildWaterLut()
      };
    }
    return {
      BASE_LEVELS: 16,
      SHADE_LEVELS: 33,
      decodeHeightmap,
      buildColorLut,
      buildGridMesh
    };
  } });
    __register({ name: "svg3d.project", dependencies: ["svg3d.vec3"], factory: function(vec3) {
    function createCamera(opts) {
      const o = opts || {}, width = o.width === void 0 ? 1280 : o.width, height = o.height === void 0 ? 800 : o.height;
      return {
        x: o.x === void 0 ? 0 : o.x,
        y: o.y === void 0 ? -900 : o.y,
        z: o.z === void 0 ? 0 : o.z,
        rx: o.rx === void 0 ? 0.55 : o.rx,
        ry: o.ry === void 0 ? 0 : o.ry,
        rz: o.rz === void 0 ? 0 : o.rz,
        depth: o.depth === void 0 ? 900 : o.depth,
        near: o.near === void 0 ? 1 : o.near,
        offsetX: width / 2,
        offsetY: height / 2
      };
    }
    function createFrameBuffers(mesh) {
      return {
        px: new Float64Array(mesh.vertexCount),
        py: new Float64Array(mesh.vertexCount),
        pz: new Float64Array(mesh.vertexCount),
        depth: new Float64Array(mesh.triangleCount),
        shadeQ: new Uint8Array(mesh.triangleCount),
        order: new Uint32Array(mesh.triangleCount),
        scratch: new Uint32Array(mesh.triangleCount),
        m: new Float64Array(9)
      };
    }
    const frameBufferCache = new WeakMap;
    function bufferFor(mesh) {
      let b = frameBufferCache.get(mesh);
      if (b === void 0) {
        b = createFrameBuffers(mesh);
        frameBufferCache.set(mesh, b);
      }
      return b;
    }
    function projectFrame(mesh, camera, buf) {
      const b = buf || bufferFor(mesh), m = vec3.rotationMatrix3(camera.rx, camera.ry, camera.rz, b.m), m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8], pos = mesh.positions, px = b.px, py = b.py, pz = b.pz, camX = camera.x, camY = camera.y, camZ = camera.z, fd = camera.depth, ox = camera.offsetX, oy = camera.offsetY, near = camera.near === void 0 ? 1 : Math.max(camera.near, 0.000000001);
      for (let v = 0, nv = mesh.vertexCount;v < nv; v += 1) {
        const dx = pos[v * 3] - camX, dy = pos[v * 3 + 1] - camY, dz = pos[v * 3 + 2] - camZ, rxv = m0 * dx + m1 * dy + m2 * dz, ryv = m3 * dx + m4 * dy + m5 * dz, rzv = m6 * dx + m7 * dy + m8 * dz, scale = fd / rzv;
        px[v] = scale * rxv + ox;
        py[v] = scale * ryv + oy;
        pz[v] = rzv < near ? 0 : scale;
      }
      const { indices: idx, normals: nrm, normalLen: nlen, centroids: cen } = mesh, depth = b.depth, shadeQ = b.shadeQ, order = b.order, shadeMax = (mesh.shadeLevels > 0 ? mesh.shadeLevels : 33) - 1;
      let count = 0;
      for (let f = 0, tc = mesh.triangleCount;f < tc; f += 1) {
        const a = idx[f * 3], bb = idx[f * 3 + 1], c = idx[f * 3 + 2], za = pz[a], zb = pz[bb], zc = pz[c];
        if (za <= 0 || zb <= 0 || zc <= 0)
          continue;
        const vx = camX - cen[f * 3], vy = camY - cen[f * 3 + 1], vz = camZ - cen[f * 3 + 2], nx = nrm[f * 3], ny = nrm[f * 3 + 1], nz = nrm[f * 3 + 2], dp = nx * vx + ny * vy + nz * vz;
        if (dp <= 0)
          continue;
        const lenCam = Math.sqrt(vx * vx + vy * vy + vz * vz);
        let sq = Math.round((1 - dp / lenCam / nlen[f]) * shadeMax);
        if (sq < 0)
          sq = 0;
        if (sq > shadeMax)
          sq = shadeMax;
        shadeQ[f] = sq;
        depth[f] = (za + zb + zc) / 3;
        order[count] = f;
        count += 1;
      }
      sortByDepth(order, b.scratch, depth, count);
      return count;
    }
    function sortByDepth(order, scratch, depth, count) {
      let src = order, dst = scratch;
      for (let width = 1;width < count; width *= 2) {
        for (let lo = 0;lo < count; lo += width * 2) {
          let mid = lo + width;
          if (mid > count)
            mid = count;
          let hi = lo + width * 2;
          if (hi > count)
            hi = count;
          let i = lo, j = mid, k = lo;
          while (i < mid && j < hi) {
            if (depth[src[j]] < depth[src[i]]) {
              dst[k] = src[j];
              j += 1;
            } else {
              dst[k] = src[i];
              i += 1;
            }
            k += 1;
          }
          while (i < mid) {
            dst[k] = src[i];
            i += 1;
            k += 1;
          }
          while (j < hi) {
            dst[k] = src[j];
            j += 1;
            k += 1;
          }
        }
        const tmp = src;
        src = dst;
        dst = tmp;
      }
      if (src !== order)
        for (let k = 0;k < count; k += 1)
          order[k] = src[k];
    }
    return { SHADE_LEVELS: 33, createCamera, createFrameBuffers, projectFrame };
  } });
    __register({ name: "svg3d.apply", dependencies: [], factory: function() {
    const round1 = (v) => Math.round(v * 10) / 10;
    function createPolygonRig(opts) {
      const { svgBuild, svgApply, mesh } = opts, width = opts.width === void 0 ? 1280 : opts.width, height = opts.height === void 0 ? 800 : opts.height, writeFill = opts.writeFill !== !1, capacity = mesh.triangleCount, children = Array(capacity);
      for (let k = 0;k < capacity; k += 1)
        children[k] = { tag: "polygon", attrs: { points: "", fill: "#000000" } };
      const root = svgBuild.build({
        tag: "svg",
        attrs: { id: "root", width, height, viewBox: `0 0 ${width} ${height}` },
        children: [{ tag: "g", attrs: { id: "faces" }, children }]
      }, { idScope: opts.idScope }), group = root.childNodes[0], els = Array(capacity);
      for (let k = 0;k < capacity; k += 1)
        els[k] = group.childNodes[k];
      const { svgAttr } = svgApply, idx = mesh.indices, baseQ = mesh.baseQ, lut = mesh.colorLut, shadeLevels = mesh.shadeLevels;
      let prevCount = 0;
      function update(buf, count) {
        const { px, py, order, shadeQ } = buf;
        let writes = 0;
        for (let k = 0;k < count; k += 1) {
          const f = order[k], a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2], points = `${round1(px[a])},${round1(py[a])} ${round1(px[b])},${round1(py[b])} ${round1(px[c])},${round1(py[c])}`, el = els[k];
          svgAttr(el, "points", points);
          writes += 1;
          if (writeFill) {
            svgAttr(el, "fill", lut[baseQ[f] * shadeLevels + shadeQ[f]]);
            writes += 1;
          }
        }
        for (let k = count;k < prevCount; k += 1) {
          svgAttr(els[k], "points", "");
          writes += 1;
        }
        prevCount = count;
        return writes;
      }
      return { root, nodeCount: capacity, update };
    }
    function createPathRig(opts) {
      if (opts.faceColors)
        return createClassedPathRig(opts);
      const { svgBuild, svgApply, mesh } = opts, buckets = opts.buckets === void 0 ? 16 : opts.buckets, width = opts.width === void 0 ? 1280 : opts.width, height = opts.height === void 0 ? 800 : opts.height, children = Array(buckets);
      for (let k = 0;k < buckets; k += 1)
        children[k] = { tag: "path", attrs: { d: "", fill: "#000000" } };
      const root = svgBuild.build({
        tag: "svg",
        attrs: { id: "root", width, height, viewBox: `0 0 ${width} ${height}` },
        children: [{ tag: "g", attrs: { id: "faces" }, children }]
      }, { idScope: opts.idScope }), group = root.childNodes[0], paths = Array(buckets);
      for (let k = 0;k < buckets; k += 1)
        paths[k] = group.childNodes[k];
      const { svgAttr } = svgApply, idx = mesh.indices, baseQ = mesh.baseQ, lut = mesh.colorLut, shadeLevels = mesh.shadeLevels;
      function update(buf, count) {
        const { px, py, order, shadeQ } = buf, per = Math.ceil(count / buckets) || 1;
        let writes = 0;
        for (let bkt = 0;bkt < buckets; bkt += 1) {
          const start = bkt * per, end = Math.min(count, start + per);
          let d = "", sumShade = 0, sumBase = 0;
          for (let k = start;k < end; k += 1) {
            const f = order[k], a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
            d += `M${round1(px[a])} ${round1(py[a])}L${round1(px[b])} ${round1(py[b])}L${round1(px[c])} ${round1(py[c])}Z`;
            sumShade += shadeQ[f];
            sumBase += baseQ[f];
          }
          const n = end - start;
          svgAttr(paths[bkt], "d", d);
          writes += 1;
          if (n > 0) {
            const sq = Math.round(sumShade / n), bq = Math.round(sumBase / n);
            svgAttr(paths[bkt], "fill", lut[bq * shadeLevels + sq]);
            writes += 1;
          }
        }
        return writes;
      }
      return { root, nodeCount: buckets, update };
    }
    function createClassedPathRig(opts) {
      const { svgBuild, svgApply, mesh } = opts, fc = typeof opts.faceColors === "object" ? opts.faceColors : {}, buckets = opts.buckets === void 0 ? 16 : opts.buckets, width = opts.width === void 0 ? 1280 : opts.width, height = opts.height === void 0 ? 800 : opts.height, base = fc.base > 0 ? fc.base : 6, shade = fc.shade > 0 ? fc.shade : 6, classes = (base + 1) * shade, baseLevels = mesh.baseLevels, shadeLevels = mesh.shadeLevels, lut = mesh.colorLut, fills = Array(classes);
      for (let b = 0;b <= base; b += 1)
        for (let s = 0;s < shade; s += 1) {
          const sl = Math.round((s + 0.5) / shade * (shadeLevels - 1));
          fills[b * shade + s] = b === base ? mesh.waterLut[sl] : lut[Math.round((b + 0.5) / base * (baseLevels - 1)) * shadeLevels + sl];
        }
      const total = buckets * classes, children = Array(total);
      for (let k = 0;k < total; k += 1) {
        const fill = fills[k % classes];
        children[k] = { tag: "path", attrs: { d: "", fill, stroke: fill, "stroke-width": 1, "stroke-linejoin": "round" } };
      }
      const root = svgBuild.build({
        tag: "svg",
        attrs: { id: "root", width, height, viewBox: `0 0 ${width} ${height}` },
        children: [{ tag: "g", attrs: { id: "faces" }, children }]
      }, { idScope: opts.idScope }), group = root.childNodes[0], paths = Array(total);
      for (let k = 0;k < total; k += 1)
        paths[k] = group.childNodes[k];
      const written = Array(total).fill(""), acc = Array(classes).fill(""), { svgAttr } = svgApply, idx = mesh.indices, baseQ = mesh.baseQ, water = mesh.water;
      function update(buf, count) {
        const { px, py, order, shadeQ } = buf, per = Math.ceil(count / buckets) || 1;
        let writes = 0;
        for (let bkt = 0;bkt < buckets; bkt += 1) {
          const start = bkt * per, end = Math.min(count, start + per);
          for (let c = 0;c < classes; c += 1)
            acc[c] = "";
          for (let k = start;k < end; k += 1) {
            const f = order[k];
            let sc = Math.floor(shadeQ[f] / shadeLevels * shade);
            if (sc > shade - 1)
              sc = shade - 1;
            let bc = base;
            if (!water[f]) {
              bc = Math.floor(baseQ[f] / baseLevels * base);
              if (bc > base - 1)
                bc = base - 1;
            }
            const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
            acc[bc * shade + sc] += `M${round1(px[a])} ${round1(py[a])}L${round1(px[b])} ${round1(py[b])}L${round1(px[c])} ${round1(py[c])}Z`;
          }
          const off = bkt * classes;
          for (let c = 0;c < classes; c += 1) {
            const d = acc[c];
            if (written[off + c] !== d) {
              svgAttr(paths[off + c], "d", d);
              written[off + c] = d;
              writes += 1;
            }
          }
        }
        return writes;
      }
      return { root, nodeCount: total, update };
    }
    return { createPolygonRig, createPathRig };
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
    __register({ name: "graphic.easing", dependencies: ["easing"], factory: function(fwEasing) {
    const table = {};
    for (const name of Object.keys(fwEasing)) {
      const curve = fwEasing[name];
      if (typeof curve === "function")
        table[name] = (t) => curve(t, 0, 1, 1);
    }
    return table;
  } });
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
    __register({ name: "graphic.svg3d", dependencies: ["svg3d.vec3","svg3d.mesh","svg3d.project","svg3d.apply","graphic.svgBuild","graphic.scopedIds","graphic.timeline","graphic.tween","graphic.svgApply","graphic.scheduler"], factory: function(vec3Api, meshApi, projectApi, applyApi, svgBuild, scopedIds, timelineMod, tweenMod, svgApply, schedulerMod) {
    const { Timeline } = timelineMod, { Tween } = tweenMod;
    let _instanceSeq = 0;

    class Svg3d {
      constructor(host, heightmap, opts) {
        const o = opts || {}, decoded = meshApi.decodeHeightmap(heightmap), cells = decoded.side - 1;
        if (!Number.isInteger(cells) || cells < 1)
          throw Error(`graphic.svg3d: heightmap side ${decoded.side} is too small (needs >= 2)`);
        const triangleCount = 2 * cells * cells;
        this.mode = o.mode === "polygons" ? "polygons" : "path";
        if (this.mode === "polygons") {
          if (triangleCount > 2048)
            throw Error(`graphic.svg3d: mode:'polygons' supports at most 2048 triangles, got ${triangleCount} \u2014 use the default path mode instead`);
        } else {
          const ceiling = o.maxTriangles === void 0 ? 8192 : o.maxTriangles;
          if (ceiling > 51200)
            throw Error(`graphic.svg3d: maxTriangles ${ceiling} exceeds the measured hard ceiling 51200 (unmeasured territory)`);
          if (triangleCount > ceiling)
            throw Error(`graphic.svg3d: mesh has ${triangleCount} triangles, exceeds the ${ceiling}-triangle ceiling (path mode; override via maxTriangles up to 51200)`);
        }
        this.mesh = meshApi.buildGridMesh({
          cells,
          heights: decoded.heights,
          spacing: o.spacing,
          heightScale: o.heightScale
        });
        const width = o.width > 0 ? o.width : 1280, height = o.height > 0 ? o.height : 800;
        this.camera = projectApi.createCamera(Object.assign({ width, height }, o.camera));
        this._buf = projectApi.createFrameBuffers(this.mesh);
        this.prefix = o.prefix || `svg3d-${_instanceSeq++}`;
        this._scope = scopedIds.createScope(this.prefix);
        const rigOpts = {
          svgBuild,
          svgApply,
          mesh: this.mesh,
          width,
          height,
          idScope: this._scope
        };
        this._rig = this.mode === "polygons" ? applyApi.createPolygonRig(rigOpts) : applyApi.createPathRig(Object.assign(rigOpts, {
          buckets: o.buckets > 0 ? o.buckets : 16,
          faceColors: o.faceColors || !1
        }));
        this.node = this._rig.root;
        if (host && typeof host.appendChild === "function")
          host.appendChild(this.node);
        this._scheduler = o.scheduler || schedulerMod.scheduler;
        this._duration = o.duration > 0 ? o.duration : 4000;
        this._yawTurns = o.yawTurns === void 0 ? 1 : o.yawTurns;
        this._pitchSpan = o.pitchSpan === void 0 ? 0 : o.pitchSpan;
        this._loop = o.loop !== !1;
        this._timeline = null;
        this._playing = !1;
        this._disposed = !1;
        this._renderTickable = { _step: () => this._render() };
        this._pointerScope = null;
        this._drag = null;
        if (o.events && typeof o.events.scope === "function")
          this._bindPointer(o.events, width, height);
        this._render();
      }
      _bindPointer(events, width, height) {
        const scope = events.scope(`${this.prefix}-look`), half = Math.PI / 2, hit = svgBuild.build({
          tag: "rect",
          attrs: { x: 0, y: 0, width, height, fill: "transparent" }
        });
        this.node.insertBefore(hit, this.node.firstChild);
        scope.on("down", this.node, "pointerdown", (e) => {
          if (this._disposed)
            return;
          this.pause();
          this._drag = { x: e.clientX, y: e.clientY, ry: this.camera.ry, rx: this.camera.rx };
          e.preventDefault();
          try {
            this.node.setPointerCapture(e.pointerId);
          } catch {}
        });
        scope.on("move", this.node, "pointermove", (e) => {
          const d = this._drag;
          if (this._disposed || !d)
            return;
          this.camera.ry = d.ry + (d.x - e.clientX) / width * Math.PI;
          const rx = d.rx - (d.y - e.clientY) / height * half;
          this.camera.rx = rx > half ? half : rx < -half ? -half : rx;
          this._render();
        });
        const end = () => {
          this._drag = null;
        };
        scope.on("up", this.node, "pointerup", end);
        scope.on("cancel", this.node, "pointercancel", end);
        this._pointerScope = scope;
      }
      _render() {
        const count = projectApi.projectFrame(this.mesh, this.camera, this._buf);
        this._rig.update(this._buf, count);
      }
      _startCycle() {
        const startRy = this.camera.ry, startRx = this.camera.rx, tl = new Timeline({
          scheduler: this._scheduler,
          onComplete: () => {
            this._timeline = null;
            if (this._loop && this._playing && !this._disposed)
              this._startCycle();
            else {
              this._playing = !1;
              this._scheduler.remove(this._renderTickable);
            }
          }
        });
        tl.add(new Tween({
          target: this.camera,
          property: "ry",
          from: startRy,
          to: startRy + Math.PI * 2 * this._yawTurns,
          duration: this._duration,
          easing: "linear",
          scheduler: this._scheduler,
          apply: (v, target) => {
            target.ry = Number(v);
          }
        }), 0);
        tl.add(new Tween({
          target: this.camera,
          property: "rx",
          from: startRx,
          to: startRx + this._pitchSpan,
          duration: this._duration,
          easing: "linear",
          scheduler: this._scheduler,
          apply: (v, target) => {
            target.rx = Number(v);
          }
        }), 0);
        this._timeline = tl;
        tl.play();
        this._scheduler.remove(this._renderTickable);
        this._scheduler.add(this._renderTickable);
      }
      play() {
        if (this._disposed || this._playing)
          return this;
        this._playing = !0;
        this._startCycle();
        return this;
      }
      pause() {
        if (this._disposed || !this._playing)
          return this;
        this._playing = !1;
        if (this._timeline) {
          this._scheduler.remove(this._timeline);
          this._timeline = null;
        }
        this._scheduler.remove(this._renderTickable);
        return this;
      }
      seek(ms) {
        if (this._disposed)
          return this;
        if (this._restRy === void 0) {
          this._restRy = this.camera.ry;
          this._restRx = this.camera.rx;
        }
        const duration = this._duration, frac = (ms % duration + duration) % duration / duration;
        this.camera.ry = this._restRy + Math.PI * 2 * this._yawTurns * frac;
        this.camera.rx = this._restRx + this._pitchSpan * frac;
        this._render();
        return this;
      }
      setCamera(partial) {
        if (this._disposed)
          return this;
        Object.assign(this.camera, partial || {});
        this._render();
        return this;
      }
      dispose() {
        if (this._disposed)
          return;
        if (this._pointerScope)
          this._pointerScope.clear();
        this._pointerScope = null;
        this._drag = null;
        if (this._timeline)
          this._scheduler.remove(this._timeline);
        this._scheduler.remove(this._renderTickable);
        this._playing = !1;
        this._disposed = !0;
        if (this.node && this.node.parentNode)
          this.node.parentNode.removeChild(this.node);
      }
    }
    function createTerrain(host, heightmap, opts) {
      return new Svg3d(host, heightmap, opts);
    }
    return { Svg3d, createTerrain };
  } });

    const __core = __resolve("graphic.svg3d");
    return __core;
    }
};
