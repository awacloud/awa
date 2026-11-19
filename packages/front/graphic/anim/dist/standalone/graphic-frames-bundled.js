/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-frames-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.frames`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-frames-bundled
 */

export const graphicFramesBundled = {
    name: "graphicFramesBundled",
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
    __register({ name: "graphic.svgApply", dependencies: ["dom"], factory: function(dom) {
    return { SVG_NS: "http://www.w3.org/2000/svg", svgAttr: (target, name, value) => {
      if (target && typeof target.setAttribute === "function")
        dom.attr(target, name, String(value));
    } };
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

    const __core = __resolve("graphic.frames");
    return __core;
    }
};
