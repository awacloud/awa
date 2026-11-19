/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-pageflip-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 5 fw modules as dependencies and inlines every
 * graphic-local factory transitively reachable from `graphic.pageflip` .
 *
 * Sibling modules DECLARED (not inlined), DI-injected: graphic.scopedIds, graphic.svgApply, graphic.svgBuild, graphic.tween, graphic.timeline.
 *
 * @module graphic/bundles/prebuilt/graphic-pageflip-package
 */

export const graphicPageflipPackage = {
    name: "graphicPageflipPackage",
    dependencies: ["secPolicy","dom","interp","easing","clock","graphic.scopedIds","graphic.svgApply","graphic.svgBuild","graphic.tween","graphic.timeline"],
    factory(secPolicy, dom, interp, easing, clock, __ext_graphic_scopedIds, __ext_graphic_svgApply, __ext_graphic_svgBuild, __ext_graphic_tween, __ext_graphic_timeline) {
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

    // sibling package modules — injected by DI (declared, not inlined).
    __cache["graphic.scopedIds"] = __ext_graphic_scopedIds;
    __cache["graphic.svgApply"] = __ext_graphic_svgApply;
    __cache["graphic.svgBuild"] = __ext_graphic_svgBuild;
    __cache["graphic.tween"] = __ext_graphic_tween;
    __cache["graphic.timeline"] = __ext_graphic_timeline;

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "pageflip.fold", dependencies: [], factory: function() {
    const DEG = 180 / Math.PI, EDGE_CASES = Object.freeze({
      OBTUSE: "angle>0",
      FLAT: "angle==0",
      SHALLOW: "-45<angle<0",
      DIAGONAL: "angle==-45",
      STEEP: "angle<-45"
    });
    function rotatePoint(px, py, ox, oy, deg) {
      const a = deg / DEG, c = Math.cos(a), s = Math.sin(a);
      return {
        x: c * (px - ox) - s * (py - oy) + ox,
        y: s * (px - ox) + c * (py - oy) + oy
      };
    }
    function lineIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
      const denom = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
      if (denom === 0)
        return null;
      const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denom;
      return { x: ax + ua * (bx - ax), y: ay + ua * (by - ay) };
    }
    function margin(w, h) {
      return Math.sqrt(w * w + h * h) - h;
    }
    function clampCorner(rx, ry, width, height, marg, marginPercent = 1) {
      let x = rx, y = ry;
      if (y > 0) {
        const adx = Math.abs(x);
        let alpha = Math.atan(adx / y) * DEG;
        if (x > 0)
          alpha = -alpha;
        const max = rotatePoint(0, width, 0, 0, alpha);
        if (x > 0) {
          if (x > max.x)
            x = max.x;
        } else if (x < max.x)
          x = max.x;
        if (y > max.y)
          y = max.y;
      } else {
        const bdx = Math.abs(x), bdy = height - y;
        let alpha = Math.atan(bdx / bdy) * DEG;
        if (x < 0)
          alpha = -alpha;
        const max = rotatePoint(0, -marg / marginPercent, 0, height, alpha);
        if (x > 0) {
          if (x > max.x)
            x = max.x;
          if (x > width)
            x = width;
        } else {
          if (x < max.x)
            x = max.x;
          if (x < -width)
            x = -width;
        }
        if (y < max.y)
          y = max.y;
        if (y > 0)
          y = 0;
      }
      return { x, y };
    }
    function rectCorners(width, height, dx, dy) {
      return [
        { x: width - dx, y: dy },
        { x: width - dx, y: -width + dy },
        { x: width + height - dx, y: -width + dy },
        { x: width + height - dx, y: dy }
      ];
    }
    function fold(corner, page) {
      const { width, height } = page, marginPercent = page.marginPercent || 1, ratio = page.ratio || 1, marg = margin(width, height), clamped = clampCorner(corner.x, corner.y, width, height, marg, marginPercent);
      if (width - clamped.x < width * 0.01 && Math.abs(clamped.y) < height * 0.01) {
        const zero = { x: 0, y: 0 };
        return {
          corner: clamped,
          turn: [zero, { ...zero }, { ...zero }, { ...zero }],
          under: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: width, y: 0 },
            { x: width, y: height },
            { x: 0, y: height }
          ],
          pattern: { x: 0, y: 0, rotate: 0 },
          angle: -45,
          edgeCase: EDGE_CASES.DIAGONAL,
          degenerate: !0
        };
      }
      const { x: cx, y: cy } = clamped, dx = width - cx, dy = cy, angle = Math.atan(dy / dx) * DEG - 45, rotate = -2 * angle, turn = rectCorners(width, height, dx, dy).map((p) => rotatePoint(p.x, p.y, cx, cy, rotate)), tp = [
        { x: cx, y: cy },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ];
      let edgeCase;
      if (angle > 0) {
        edgeCase = EDGE_CASES.OBTUSE;
        const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
        tp[1] = { x: i0.x, y: i0.y };
        let i1 = lineIntersection(width, 0, width, height, cx, cy, turn[3].x, turn[3].y);
        tp[2] = { x: i1.x, y: i1.y };
        tp[3] = { x: i1.x, y: i1.y };
        if (i1.y > height) {
          i1 = lineIntersection(0, height, width, height, turn[2].x, turn[2].y, turn[3].x, turn[3].y);
          tp[2] = { x: i1.x, y: i1.y };
          tp[3] = { x: turn[3].x, y: turn[3].y };
        }
      } else if (angle === 0) {
        edgeCase = EDGE_CASES.FLAT;
        const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
        tp[1] = { x: i0.x, y: i0.y };
        const i1 = lineIntersection(width, 0, width, height, cx, cy, turn[3].x, turn[3].y);
        tp[2] = { x: i1.x, y: i1.y };
        tp[3] = { x: i1.x, y: i1.y };
      } else if (angle < 0 && angle > -45) {
        edgeCase = EDGE_CASES.SHALLOW;
        const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
        tp[1] = { x: i0.x, y: i0.y };
        if (turn[3].x > width) {
          const i1 = lineIntersection(width, 0, width, height, cx, cy, turn[3].x, turn[3].y);
          tp[2] = { x: i1.x, y: i1.y };
          tp[3] = { x: i1.x, y: i1.y };
        } else {
          const i1 = lineIntersection(0, height, width, height, turn[2].x, turn[2].y, turn[3].x, turn[3].y);
          tp[2] = { x: i1.x, y: i1.y };
          tp[3] = { x: turn[3].x, y: turn[3].y };
        }
      } else if (angle === -45) {
        edgeCase = EDGE_CASES.DIAGONAL;
        const midX = turn[0].x + (width - turn[0].x) / 2;
        tp[1] = { x: midX, y: turn[1].y };
        tp[2] = { x: midX, y: turn[2].y };
        tp[3] = { x: turn[3].x, y: turn[3].y };
      } else {
        edgeCase = EDGE_CASES.STEEP;
        const i0 = lineIntersection(0, 0, width, 0, cx, cy, turn[1].x, turn[1].y);
        tp[1] = { x: i0.x, y: i0.y };
        const i1 = lineIntersection(0, height, width, height, turn[2].x, turn[2].y, turn[3].x, turn[3].y);
        tp[2] = { x: i1.x, y: i1.y };
        tp[3] = { x: turn[3].x, y: turn[3].y };
      }
      const pattern = {
        x: cx / ratio,
        y: cy / ratio,
        rotate: -2 * (angle + 45)
      }, under = [
        { x: 0, y: 0 },
        { x: tp[1].x, y: 0 },
        { x: tp[2].x, y: tp[2].y },
        tp[2].y === height ? { x: tp[2].x, y: tp[2].y } : { x: width, y: height },
        { x: 0, y: height }
      ];
      return {
        corner: clamped,
        turn: [{ x: cx, y: cy }, tp[1], tp[2], tp[3]],
        under,
        pattern,
        angle,
        edgeCase,
        degenerate: !1
      };
    }
    return { fold, clampCorner, rotatePoint, lineIntersection, rectCorners, margin, EDGE_CASES, MARGIN_EPS: 0.01 };
  } });
    __register({ name: "pageflip.compose", dependencies: [], factory: function() {
    const round = (n) => Math.round(n * 1000) / 1000;
    function compose(vertices) {
      if (!Array.isArray(vertices) || vertices.length === 0)
        return "";
      const parts = Array(vertices.length);
      for (let i = 0;i < vertices.length; i += 1) {
        const p = vertices[i];
        parts[i] = `${i === 0 ? "M" : "L"} ${round(p.x)} ${round(p.y)}`;
      }
      parts.push("Z");
      return parts.join(" ");
    }
    return { compose };
  } });
    __register({ name: "graphic.pageflip", dependencies: ["graphic.svgBuild","graphic.scopedIds","graphic.timeline","graphic.tween","graphic.svgApply","pageflip.fold","pageflip.compose"], factory: function(svgBuild, scopedIds, timelineMod, tweenMod, svgApply, foldApi, composeApi) {
    const { Timeline } = timelineMod, { Tween } = tweenMod, { fold } = foldApi, { compose } = composeApi;
    let _instanceSeq = 0;
    function pageContent(pg, w, h) {
      if (pg.template)
        return pg.template;
      const paper = { tag: "rect", attrs: { x: 0, y: 0, width: w, height: h, fill: "#ffffff" } };
      if (!pg.src)
        return paper;
      return {
        tag: "g",
        children: [paper, {
          tag: "image",
          attrs: { id: `img-${pg.id}`, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "xMidYMid slice" }
        }]
      };
    }
    function defaultLoadImage(src) {
      const Img = globalThis.Image;
      if (typeof Img !== "function")
        return Promise.resolve();
      const img = new Img;
      if (typeof img.decode === "function") {
        img.src = src;
        return img.decode();
      }
      return new Promise((resolve, reject) => {
        img.addEventListener("load", () => resolve(), { once: !0 });
        img.addEventListener("error", () => reject(Error(`pageflip: image failed: ${src}`)), { once: !0 });
        img.src = src;
      });
    }

    class Pageflip {
      constructor(opts) {
        const o = opts || {};
        if (!Array.isArray(o.pages) || o.pages.length === 0)
          throw Error("Pageflip: pages must be a non-empty array");
        if (!(o.width > 0) || !(o.height > 0))
          throw Error("Pageflip: width and height must be positive");
        this._pages = o.pages;
        this._page = {
          width: o.width,
          height: o.height,
          marginPercent: o.marginPercent || 1,
          ratio: o.ratio || 1
        };
        this._duration = o.duration > 0 ? o.duration : 300;
        this._easing = o.easing || "linear";
        this._backFill = o.backFill || "#e9e6df";
        this._cache = o.cache > 0 ? Math.floor(o.cache) : 8;
        this._concurrency = o.preloadConcurrency > 0 ? Math.floor(o.preloadConcurrency) : 1;
        this._loadImage = typeof o.loadImage === "function" ? o.loadImage : defaultLoadImage;
        this._scheduler = o.scheduler;
        this.prefix = o.prefix || `pageflip-${_instanceSeq++}`;
        this._scope = scopedIds.createScope(this.prefix);
        this.index = 0;
        this.pageCount = this._pages.length;
        this._active = new Set;
        this._disposed = !1;
        this._pageRing = `M 0 0 L ${o.width} 0 L ${o.width} ${o.height} L 0 ${o.height} Z`;
        const template = {
          tag: "svg",
          attrs: {
            id: "book",
            width: o.width,
            height: o.height,
            viewBox: `0 0 ${o.width} ${o.height}`
          },
          children: [
            {
              tag: "defs",
              children: [{
                tag: "clipPath",
                attrs: { id: "leaf-clip" },
                children: [{
                  tag: "path",
                  attrs: { id: "leaf-clip-path", "clip-rule": "evenodd", d: this._pageRing }
                }]
              }]
            },
            ...this._pages.map((pg) => ({
              tag: "g",
              attrs: { id: `page-${pg.id}`, display: "none", "clip-path": "none" },
              children: [pageContent(pg, o.width, o.height)]
            })),
            { tag: "path", attrs: { id: "turn", fill: this._backFill, d: "" } }
          ]
        };
        this._spreadMode = o.spread === !0;
        this._shadow = o.shadow >= 0 ? o.shadow : 0.05;
        this.el = svgBuild.build(this._spreadMode ? this._spreadTemplate(o) : template, { idScope: this._scope });
        this._pageEls = this._pages.map((pg) => this._find(`page-${pg.id}`));
        this._turnPath = this._find("turn");
        this._clipPath = this._find("leaf-clip-path");
        this._clipRef = `url(#${this._scope.id("leaf-clip")})`;
        if (this._spreadMode) {
          this._slots = {
            left: this._find("slot-left"),
            right: this._find("slot-right"),
            beneath: this._find("slot-beneath"),
            back: this._find("slot-back")
          };
          this._leaf = this._find("leaf");
          this._verso = this._find("verso");
          this._shade = {
            gutterLeft: this._find("gutter-left"),
            gutterRight: this._find("gutter-right"),
            edgeLeft: this._find("edge-left"),
            edgeRight: this._find("edge-right"),
            leafEdge: this._find("leaf-edge")
          };
          this._spread = 0;
          this._ix = { mode: "idle", side: null, bottom: !1, a: -1, b: -1, rest: null, corner: null, down: null };
          this._peelTl = null;
          this._pointerScope = null;
          this._restSpread(0);
          if (o.events && typeof o.events.scope === "function" && o.pointer !== !1)
            this._bindPointer(o.events);
          this._bindImages();
          return;
        }
        this._show(0);
        this._bindImages();
      }
      _bindImages() {
        this._images = new Map;
        for (let i = 0;i < this._pages.length; i += 1) {
          const pg = this._pages[i];
          if (pg.template || !pg.src)
            continue;
          this._images.set(i, { el: this._find(`img-${pg.id}`), src: String(pg.src), state: "idle" });
        }
        this._queue = [];
        this._inflight = 0;
        this._refreshWindow([]);
      }
      _refreshWindow(first) {
        if (!this._images || this._images.size === 0 || this._disposed)
          return;
        const n = this._pages.length, c = this.index, start = Math.max(0, c - Math.floor(this._cache / 2)), end = Math.min(n, start + this._cache), win = [];
        for (let i = start;i < end; i += 1)
          win.push(i);
        win.sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b);
        const wanted = [];
        for (const i of [...first, ...win]) {
          const rec = this._images.get(i);
          if (rec && rec.state === "idle" && !wanted.includes(i))
            wanted.push(i);
        }
        this._queue = wanted;
        this._pump();
      }
      _pump() {
        while (this._inflight < this._concurrency && this._queue.length > 0) {
          const i = this._queue.shift(), rec = this._images.get(i);
          if (!rec || rec.state !== "idle")
            continue;
          rec.state = "loading";
          this._inflight += 1;
          let p;
          try {
            p = Promise.resolve(this._loadImage(rec.src));
          } catch (err) {
            p = Promise.reject(err);
          }
          p.then(() => {
            this._inflight -= 1;
            if (this._disposed)
              return;
            rec.state = "ready";
            svgApply.svgAttr(rec.el, "href", rec.src);
            this._pump();
          }, () => {
            this._inflight -= 1;
            if (this._disposed)
              return;
            rec.state = "error";
            this._pump();
          });
        }
      }
      imageState(id) {
        const rec = this._images && this._images.get(this._indexOf(id));
        return rec ? rec.state : "none";
      }
      _spreadTemplate(o) {
        const { width: w, height: h } = o, hidden = { display: "none" }, m = Math.sqrt(w * w + h * h) - h, edge = 0.002 * Math.sqrt(((2 * w) ** 2 + (h + 2 * m) ** 2) / 2), gradient = (id, x1, x2) => ({
          tag: "linearGradient",
          attrs: { id, x1, x2, y1: "0%", y2: "0%" },
          children: [
            { tag: "stop", attrs: { offset: "0%", "stop-color": "#767676", "stop-opacity": 1 } },
            { tag: "stop", attrs: { offset: "100%", "stop-color": "#767676", "stop-opacity": 0 } }
          ]
        }), gutter = (id, fill) => ({
          tag: "rect",
          attrs: { id, x: 0, y: 0, width: 0, height: h, fill: `url(#${fill})`, "fill-opacity": 0.5 }
        }), stack = (id, x, stroke) => ({
          tag: "rect",
          attrs: {
            id,
            x,
            y: 0,
            width: w,
            height: h,
            fill: "none",
            stroke: `url(#${stroke})`,
            "stroke-width": edge,
            ...hidden
          }
        });
        return {
          tag: "svg",
          attrs: { id: "book", width: 2 * w, height: h, viewBox: `0 0 ${2 * w} ${h}`, overflow: "visible" },
          children: [
            {
              tag: "defs",
              children: [
                {
                  tag: "clipPath",
                  attrs: { id: "turn-clip" },
                  children: [{ tag: "path", attrs: { id: "turn", d: "" } }]
                },
                {
                  tag: "clipPath",
                  attrs: { id: "leaf-clip" },
                  children: [{ tag: "path", attrs: { id: "leaf-clip-path", d: "" } }]
                },
                gradient("shade-r", "0%", "100%"),
                gradient("shade-l", "100%", "0%"),
                ...this._pages.map((pg) => ({
                  tag: "g",
                  attrs: { id: `page-${pg.id}` },
                  children: [pageContent(pg, w, h)]
                }))
              ]
            },
            { tag: "use", attrs: { id: "slot-left", ...hidden } },
            {
              tag: "g",
              attrs: { transform: `translate(${w} 0)` },
              children: [
                { tag: "use", attrs: { id: "slot-beneath", ...hidden } },
                { tag: "use", attrs: { id: "slot-right", "clip-path": "none", ...hidden } },
                gutter("gutter-left", "shade-l"),
                gutter("gutter-right", "shade-r"),
                stack("edge-left", -w, "shade-r"),
                stack("edge-right", 0, "shade-l"),
                {
                  tag: "g",
                  attrs: { id: "leaf", "clip-path": "url(#turn-clip)", ...hidden },
                  children: [{
                    tag: "g",
                    attrs: { id: "verso", transform: "translate(0 0) rotate(0)" },
                    children: [
                      { tag: "rect", attrs: { x: 0, y: 0, width: w, height: h, fill: this._backFill } },
                      { tag: "use", attrs: { id: "slot-back", ...hidden } }
                    ]
                  }]
                },
                {
                  tag: "path",
                  attrs: {
                    id: "leaf-edge",
                    d: "",
                    fill: "none",
                    stroke: "url(#shade-r)",
                    "stroke-width": edge / 2,
                    ...hidden
                  }
                }
              ]
            }
          ]
        };
      }
      _slotTo(slot, i) {
        if (i < 0 || i >= this._pageEls.length) {
          svgApply.svgAttr(slot, "display", "none");
          return;
        }
        svgApply.svgAttr(slot, "href", `#${this._pageEls[i].getAttribute("id")}`);
        svgApply.svgAttr(slot, "display", "inline");
      }
      _spreadOf(i) {
        return Math.floor((i + 1) / 2);
      }
      _firstOf(s) {
        return s === 0 ? 0 : 2 * s - 1;
      }
      _restSpread(s) {
        this._slotTo(this._slots.left, s === 0 ? -1 : 2 * s - 1);
        this._slotTo(this._slots.right, 2 * s);
        svgApply.svgAttr(this._slots.right, "clip-path", "none");
        svgApply.svgAttr(this._slots.beneath, "display", "none");
        svgApply.svgAttr(this._slots.back, "display", "none");
        svgApply.svgAttr(this._leaf, "display", "none");
        const n = this._pageEls.length, g = this._shadow * this._page.width, p = Math.min(1, 2 * s / n);
        svgApply.svgAttr(this._shade.gutterLeft, "x", -p * g);
        svgApply.svgAttr(this._shade.gutterLeft, "width", p * g);
        svgApply.svgAttr(this._shade.gutterRight, "width", (1 - p) * g);
        svgApply.svgAttr(this._shade.edgeLeft, "display", s > 0 && 2 * s - 1 < n ? "inline" : "none");
        svgApply.svgAttr(this._shade.edgeRight, "display", 2 * s + 1 < n ? "inline" : "none");
        svgApply.svgAttr(this._shade.leafEdge, "display", "none");
      }
      _applyCorner(c, bottom) {
        const h = this._page.height, solved = fold(c, this._page), pt = solved.pattern, flip = (poly) => bottom ? poly.map((q) => ({ x: q.x, y: h - q.y })) : poly, turn = compose(flip(solved.turn));
        svgApply.svgAttr(this._turnPath, "d", turn);
        svgApply.svgAttr(this._clipPath, "d", compose(flip(solved.under)));
        svgApply.svgAttr(this._verso, "transform", bottom ? `translate(${pt.x} ${h - pt.y}) rotate(${-pt.rotate}) translate(0 ${-h})` : `translate(${pt.x} ${pt.y}) rotate(${pt.rotate})`);
        svgApply.svgAttr(this._shade.leafEdge, "d", turn);
        this._ix.corner = { x: c.x, y: c.y };
        this._ix.bottom = bottom;
      }
      _applySpread(p) {
        this._applyCorner(this._cornerAt(p), !1);
      }
      _legs(start, end) {
        const mid = { x: 0, y: this._page.height * 0.1 }, lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        return (t) => t <= 0.5 ? lerp(start, mid, 2 * t) : lerp(mid, end, 2 * t - 1);
      }
      _setupLeaf(a, b) {
        this._slotTo(this._slots.left, a === 0 ? -1 : 2 * a - 1);
        this._slotTo(this._slots.beneath, 2 * b);
        this._slotTo(this._slots.right, 2 * a);
        svgApply.svgAttr(this._slots.right, "clip-path", this._clipRef);
        this._slotTo(this._slots.back, 2 * b - 1);
        svgApply.svgAttr(this._leaf, "display", "inline");
        svgApply.svgAttr(this._shade.leafEdge, "display", "inline");
      }
      _settle(s) {
        this._spread = s;
        this.index = this._firstOf(s);
        this._restSpread(s);
        this._ix.mode = "idle";
        this._ix.side = null;
        this._refreshWindow([]);
      }
      _animateCorner(path, bottom, duration, easing, peel, onDone) {
        this._applyCorner(path(0), bottom);
        const tween = new Tween({
          target: this._turnPath,
          property: "d",
          from: 0,
          to: 1,
          duration,
          easing,
          scheduler: this._scheduler,
          apply: (value) => this._applyCorner(path(value), bottom)
        }), tl = new Timeline({
          scheduler: this._scheduler,
          onSettle: () => {
            if (peel) {
              if (this._peelTl === tl)
                this._peelTl = null;
              return;
            }
            this._active.delete(tl);
            if (!tl.done)
              this._settle(this._spread);
          },
          onComplete: onDone
        });
        if (peel)
          this._peelTl = tl;
        else
          this._active.add(tl);
        tl.add(tween, 0);
        tl.play();
        return tl;
      }
      _cancelPeel() {
        if (this._peelTl)
          this._peelTl.stop();
        this._peelTl = null;
      }
      _turnSpread(to) {
        this._cancelPeel();
        this._refreshWindow([2 * to - 1, 2 * to]);
        const forward = to > this._spread, a = forward ? this._spread : to, b = forward ? to : this._spread, w = this._page.width;
        this._setupLeaf(a, b);
        this._ix.mode = "release";
        const path = forward ? this._legs({ x: w, y: 0 }, { x: -w, y: 0 }) : this._legs({ x: -w, y: 0 }, { x: w, y: 0 });
        return this._animateCorner(path, !1, this._duration, this._easing, !1, () => this._settle(to));
      }
      _bindPointer(events) {
        const scope = events.scope(`${this.prefix}-pointer`);
        scope.on("move", this.el, "pointermove", (e) => this._onMove(e));
        scope.on("down", this.el, "pointerdown", (e) => this._onDown(e));
        scope.on("up", this.el, "pointerup", (e) => this._onUp(e, !1));
        scope.on("cancel", this.el, "pointercancel", (e) => this._onUp(e, !0));
        scope.on("leave", this.el, "pointerleave", () => this._onLeave());
        this._pointerScope = scope;
      }
      _toBook(e) {
        const m = typeof this.el.getScreenCTM === "function" ? this.el.getScreenCTM() : null;
        if (m) {
          const det = m.a * m.d - m.b * m.c, x = e.clientX - m.e, y = e.clientY - m.f;
          return { x: (m.d * x - m.c * y) / det, y: (m.a * y - m.b * x) / det };
        }
        const r = this.el.getBoundingClientRect(), sx = r.width > 0 ? 2 * this._page.width / r.width : 1, sy = r.height > 0 ? this._page.height / r.height : 1;
        return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
      }
      _zoneAt(x, y) {
        const w = this._page.width, h = this._page.height, side = x >= 2 * w - 0.4 * w && x <= 2 * w ? "R" : x >= 0 && x <= 0.4 * w ? "L" : null;
        if (!side)
          return null;
        if (y >= 0 && y <= 0.4 * h)
          return { side, bottom: !1 };
        if (y >= h - 0.4 * h && y <= h)
          return { side, bottom: !0 };
        return null;
      }
      _zoneActive(z) {
        if (z.side === "R")
          return this._spread < this._spreadOf(this._pages.length - 1);
        return this._spread > 0;
      }
      _zoneSetup(z) {
        const w = this._page.width, right = z.side === "R", a = right ? this._spread : this._spread - 1, ix = this._ix;
        ix.side = z.side;
        ix.a = a;
        ix.b = a + 1;
        ix.rest = { x: right ? w : -w, y: 0 };
        this._setupLeaf(a, a + 1);
        this._applyCorner(ix.rest, z.bottom);
      }
      _onMove(e) {
        if (this._disposed)
          return;
        const ix = this._ix, pt = this._toBook(e);
        if (ix.mode === "drag") {
          this._applyCorner({
            x: pt.x - this._page.width,
            y: ix.bottom ? this._page.height - pt.y : pt.y
          }, ix.bottom);
          return;
        }
        if (this._active.size > 0 || e.buttons)
          return;
        const z = this._zoneAt(pt.x, pt.y), valid = z && this._zoneActive(z);
        if (ix.mode === "idle" && valid)
          this._startPeel(z);
        else if (ix.mode === "peel" && (!valid || z.side !== ix.side || z.bottom !== ix.bottom))
          this._endPeel();
      }
      _startPeel(z) {
        this._zoneSetup(z);
        const ix = this._ix, m = 0.2 * Math.min(this._page.width, this._page.height), from = ix.rest, to = { x: from.x + (z.side === "R" ? -m : m), y: m };
        ix.mode = "peel";
        this._animateCorner((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }), z.bottom, 250, "linear", !0, () => {});
      }
      _endPeel() {
        this._cancelPeel();
        const ix = this._ix, from = ix.corner, to = ix.rest;
        ix.mode = "unpeel";
        this._animateCorner((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }), ix.bottom, 250, "linear", !0, () => this._settle(this._spread));
      }
      _onLeave() {
        if (!this._disposed && this._ix.mode === "peel")
          this._endPeel();
      }
      _onDown(e) {
        if (this._disposed || this._active.size > 0)
          return;
        const ix = this._ix, pt = this._toBook(e), z = this._zoneAt(pt.x, pt.y);
        if (!z || !this._zoneActive(z))
          return;
        const same = (ix.mode === "peel" || ix.mode === "unpeel") && ix.side === z.side && ix.bottom === z.bottom;
        this._cancelPeel();
        if (!same)
          this._zoneSetup(z);
        ix.mode = "drag";
        ix.down = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        try {
          this.el.setPointerCapture(e.pointerId);
        } catch {}
      }
      _onUp(e, cancelled) {
        const ix = this._ix;
        if (this._disposed || ix.mode !== "drag")
          return;
        const w = this._page.width, right = ix.side === "R", far = { x: right ? -w : w, y: 0 }, done = right ? ix.b : ix.a, back = right ? ix.a : ix.b, from = ix.corner;
        ix.mode = "release";
        const moved = Math.hypot(e.clientX - ix.down.x, e.clientY - ix.down.y);
        if (!cancelled && moved <= 5) {
          this._animateCorner(this._legs(from, far), ix.bottom, this._duration, this._easing, !1, () => this._settle(done));
          return;
        }
        const pt = this._toBook(e), complete = !cancelled && (right ? pt.x < 1.25 * w : pt.x > 0.75 * w), to = complete ? far : ix.rest;
        this._animateCorner((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }), ix.bottom, this._duration, "linear", !1, () => this._settle(complete ? done : back));
      }
      _find(rawId) {
        const scopedId = this._scope.id(rawId);
        if (this.el.getAttribute && this.el.getAttribute("id") === scopedId)
          return this.el;
        return this.el.querySelector(`#${scopedId}`);
      }
      _indexOf(id) {
        for (let i = 0;i < this._pages.length; i += 1)
          if (this._pages[i].id === id)
            return i;
        return -1;
      }
      _show(index) {
        for (let i = 0;i < this._pageEls.length; i += 1)
          svgApply.svgAttr(this._pageEls[i], "display", i === index ? "inline" : "none");
      }
      _cornerAt(p) {
        const w = this._page.width, lift = this._page.height * 0.1;
        if (p <= 0.5)
          return { x: w * (1 - 2 * p), y: lift * 2 * p };
        return { x: -w * (2 * p - 1), y: lift * (2 - 2 * p) };
      }
      _applyFold(p) {
        const solved = fold(this._cornerAt(p), this._page);
        svgApply.svgAttr(this._turnPath, "d", compose(solved.turn));
        svgApply.svgAttr(this._clipPath, "d", `${this._pageRing} ${compose(solved.under)}`);
      }
      _rest(index, clippedEl) {
        this._show(index);
        svgApply.svgAttr(this._turnPath, "d", "");
        svgApply.svgAttr(clippedEl, "clip-path", "none");
      }
      _turnTo(toIndex) {
        this._refreshWindow([toIndex]);
        const forward = toIndex > this.index, liftedEl = this._pageEls[forward ? this.index : toIndex], beneathEl = this._pageEls[forward ? toIndex : this.index];
        for (let i = 0;i < this._pageEls.length; i += 1) {
          const el = this._pageEls[i];
          svgApply.svgAttr(el, "display", el === liftedEl || el === beneathEl ? "inline" : "none");
        }
        svgApply.svgAttr(liftedEl, "clip-path", "none");
        svgApply.svgAttr(beneathEl, "clip-path", this._clipRef);
        const foldAt = forward ? (v) => v : (v) => 1 - v;
        this._applyFold(foldAt(0));
        const turnTween = new Tween({
          target: this._turnPath,
          property: "d",
          from: 0,
          to: 1,
          duration: this._duration,
          easing: this._easing,
          scheduler: this._scheduler,
          apply: (value) => this._applyFold(foldAt(value))
        }), tl = new Timeline({
          scheduler: this._scheduler,
          onSettle: () => {
            this._active.delete(tl);
            if (!tl.done)
              this._rest(this.index, beneathEl);
          },
          onComplete: () => {
            this.index = toIndex;
            this._rest(toIndex, beneathEl);
            this._refreshWindow([]);
          }
        });
        this._active.add(tl);
        tl.add(turnTween, 0);
        tl.play();
        return tl;
      }
      next() {
        if (this._disposed)
          return null;
        if (this._active.size > 0)
          return null;
        if (this._spreadMode) {
          if (this._ix.mode === "drag")
            return null;
          if (this._spread >= this._spreadOf(this._pages.length - 1))
            return null;
          return this._turnSpread(this._spread + 1);
        }
        if (this.index >= this._pages.length - 1)
          return null;
        return this._turnTo(this.index + 1);
      }
      previous() {
        if (this._disposed)
          return null;
        if (this._active.size > 0)
          return null;
        if (this._spreadMode) {
          if (this._ix.mode === "drag")
            return null;
          if (this._spread <= 0)
            return null;
          return this._turnSpread(this._spread - 1);
        }
        if (this.index <= 0)
          return null;
        return this._turnTo(this.index - 1);
      }
      goTo(id) {
        if (this._disposed)
          return null;
        if (this._active.size > 0)
          return null;
        const target = this._indexOf(id);
        if (target < 0)
          throw Error(`pageflip: unknown page "${id}"`);
        if (this._spreadMode) {
          if (this._ix.mode === "drag")
            return null;
          const to = this._spreadOf(target);
          return to === this._spread ? null : this._turnSpread(to);
        }
        if (target === this.index)
          return null;
        return this._turnTo(target);
      }
      get currentId() {
        return this._pages[this.index].id;
      }
      mountInto(el) {
        el.replaceChildren(this.el);
        return this;
      }
      dispose() {
        if (this._disposed)
          return;
        this._disposed = !0;
        if (this._spreadMode) {
          if (this._pointerScope)
            this._pointerScope.clear();
          this._pointerScope = null;
          this._cancelPeel();
        }
        for (const tl of this._active)
          tl.stop();
        this._active.clear();
        if (this.el && this.el.parentNode)
          this.el.parentNode.removeChild(this.el);
        this.el = null;
      }
    }
    function pageflip(opts) {
      return new Pageflip(opts);
    }
    return { Pageflip, pageflip };
  } });

    const __core = __resolve("graphic.pageflip");
    return __core;
    }
};
