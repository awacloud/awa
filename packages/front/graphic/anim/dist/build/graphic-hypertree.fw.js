/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-hypertree-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 5 fw modules as dependencies and inlines every
 * graphic-local factory transitively reachable from `graphic.hypertree` .
 *
 * Sibling modules DECLARED (not inlined), DI-injected: graphic.scopedIds, graphic.svgApply, graphic.svgBuild, graphic.scheduler, graphic.tween, graphic.timeline.
 *
 * @module graphic/bundles/prebuilt/graphic-hypertree-package
 */

export const graphicHypertreePackage = {
    name: "graphicHypertreePackage",
    dependencies: ["secPolicy","dom","interp","easing","clock","graphic.scopedIds","graphic.svgApply","graphic.svgBuild","graphic.scheduler","graphic.tween","graphic.timeline"],
    factory(secPolicy, dom, interp, easing, clock, __ext_graphic_scopedIds, __ext_graphic_svgApply, __ext_graphic_svgBuild, __ext_graphic_scheduler, __ext_graphic_tween, __ext_graphic_timeline) {
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
    __cache["graphic.scheduler"] = __ext_graphic_scheduler;
    __cache["graphic.tween"] = __ext_graphic_tween;
    __cache["graphic.timeline"] = __ext_graphic_timeline;

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "hypertree.layout", dependencies: [], factory: function() {
    const TWO_PI = Math.PI * 2, DEFAULT_ZOOM = 1.5 * Math.PI;
    function ringRadius(depth, radius) {
      if (depth <= 0)
        return 0;
      return radius * (1 - Math.pow(2, -depth));
    }
    function emit(node, depth, sector, parent, ctx) {
      const id = node.id;
      if (ctx.seen.has(id))
        throw Error(`hypertree.layout: cycle or duplicate id "${id}"`);
      ctx.seen.add(id);
      const { start, end } = sector, angle = (start + end) / 2, r = ringRadius(depth, ctx.radius), x = ctx.cx + r * Math.cos(angle), y = ctx.cy + r * Math.sin(angle);
      ctx.nodes.push({ id, x, y, depth, angle, sector: { start, end } });
      if (parent) {
        const midR = (ringRadius(parent.depth, ctx.radius) + r) / 2;
        ctx.links.push({
          from: parent.id,
          to: id,
          cx: ctx.cx + midR * Math.cos(angle),
          cy: ctx.cy + midR * Math.sin(angle)
        });
      }
      const kids = Array.isArray(node.children) ? node.children : [], n = kids.length;
      if (n === 0)
        return;
      const w = (end - start) / n;
      for (let i = 0;i < n; i += 1)
        emit(kids[i], depth + 1, { start: start + i * w, end: start + (i + 1) * w }, { id, depth }, ctx);
    }
    function layout(tree, opts) {
      if (!tree || typeof tree !== "object" || tree.id === void 0 || tree.id === null)
        throw Error("hypertree.layout: tree must be an object with an id");
      const radius = opts && opts.radius > 0 ? opts.radius : 500, ctx = {
        cx: radius,
        cy: radius,
        radius,
        nodes: [],
        links: [],
        seen: new Set
      };
      emit(tree, 0, { start: 0, end: TWO_PI }, null, ctx);
      return { nodes: ctx.nodes, links: ctx.links };
    }
    function focusMove(layoutResult, focusId, opts) {
      const { nodes, links } = layoutResult, byId = new Map;
      for (const nd of nodes)
        byId.set(nd.id, nd);
      if (!byId.has(focusId))
        throw Error(`hypertree.layout: unknown node "${focusId}"`);
      let root = null;
      for (const nd of nodes)
        if (nd.depth === 0) {
          root = nd;
          break;
        }
      if (!root)
        throw Error("hypertree.layout: layout has no root (depth 0)");
      if (focusId === root.id)
        return layoutResult;
      const zoomIn = opts && opts.zoom, zoom = zoomIn > 0 && zoomIn < TWO_PI ? zoomIn : DEFAULT_ZOOM, parentOf = new Map, childrenOf = new Map;
      for (const nd of nodes)
        childrenOf.set(nd.id, []);
      for (const l of links) {
        parentOf.set(l.to, l.from);
        childrenOf.get(l.from).push(l.to);
      }
      function reroot(id, fromChild) {
        const kids = childrenOf.get(id) || [];
        if (fromChild === null)
          return { id, children: kids.map((c) => reroot(c, null)) };
        const j = kids.indexOf(fromChild), out = kids.slice(j + 1).map((c) => reroot(c, null));
        if (parentOf.has(id))
          out.push(reroot(parentOf.get(id), id));
        for (const c of kids.slice(0, j))
          out.push(reroot(c, null));
        return { id, children: out };
      }
      const ctx = {
        cx: root.x,
        cy: root.y,
        radius: root.x,
        nodes: [],
        links: [],
        seen: new Set
      }, theta = byId.get(focusId).angle, own = childrenOf.get(focusId), fan = own.length > 0 ? zoom : 0;
      ctx.seen.add(focusId);
      ctx.nodes.push({
        id: focusId,
        x: ctx.cx,
        y: ctx.cy,
        depth: 0,
        angle: theta,
        sector: { start: theta - fan / 2, end: theta - fan / 2 + TWO_PI }
      });
      const focusRef = { id: focusId, depth: 0 }, fanStart = theta - fan / 2, w = own.length > 0 ? fan / own.length : 0;
      for (let i = 0;i < own.length; i += 1)
        emit(reroot(own[i], null), 1, { start: fanStart + i * w, end: fanStart + (i + 1) * w }, focusRef, ctx);
      emit(reroot(parentOf.get(focusId), focusId), 1, { start: fanStart + fan, end: fanStart + TWO_PI }, focusRef, ctx);
      return { nodes: ctx.nodes, links: ctx.links };
    }
    return { layout, focusMove, ringRadius, TWO_PI, DEFAULT_RADIUS: 500, DEFAULT_ZOOM };
  } });
    __register({ name: "hypertree.measure", dependencies: [], factory: function() {
    function wrapLabel(text, maxLabel) {
      const words = (text === void 0 || text === null ? "" : String(text)).split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0)
        return [];
      const max = maxLabel > 0 ? Math.floor(maxLabel) : 0;
      if (max <= 0)
        return [words.join(" ")];
      const lines = [];
      let cur = "";
      for (const word of words) {
        if (cur === "")
          cur = word;
        else if (cur.length + 1 + word.length <= max)
          cur += ` ${word}`;
        else {
          lines.push(cur);
          cur = word;
        }
        while (cur.length > max) {
          lines.push(cur.slice(0, max));
          cur = cur.slice(max);
        }
      }
      if (cur !== "")
        lines.push(cur);
      return lines;
    }
    return { wrapLabel };
  } });
    __register({ name: "graphic.hypertree", dependencies: ["graphic.svgBuild","graphic.scopedIds","graphic.timeline","graphic.tween","graphic.svgApply","graphic.scheduler","hypertree.layout","hypertree.measure"], factory: function(svgBuild, scopedIds, timelineMod, tweenMod, svgApply, schedulerMod, layoutApi, measureApi) {
    const { Timeline } = timelineMod, { Tween } = tweenMod, { layout, focusMove } = layoutApi, { wrapLabel } = measureApi, BADGE_GLYPHS = {
      action: { tag: "path", attrs: { d: "M7 4h9v9h-2V7.41l-8.29 8.3-1.42-1.42L12.59 6H7z" } },
      info: { tag: "path", attrs: { d: "M9 8h2v8H9z M10 3.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z" } }
    };
    let _instanceSeq = 0;

    class Hypertree {
      static FOREST_ORIGIN = "hypertree-origin";
      constructor(svgRoot, tree, opts) {
        if (!svgRoot)
          throw Error("Hypertree: svgRoot is required");
        const origin = Hypertree.FOREST_ORIGIN;
        this.forest = Array.isArray(tree);
        if (this.forest) {
          if (tree.length === 0)
            throw Error("Hypertree: a forest must have at least one root");
          (function reserved(nodes) {
            for (const nd of nodes) {
              if (!nd || nd.id === void 0 || nd.id === null)
                throw Error("Hypertree: tree must have an id");
              if (nd.id === origin)
                throw Error(`Hypertree: id "${origin}" is reserved for the forest origin`);
              if (Array.isArray(nd.children))
                reserved(nd.children);
            }
          })(tree);
          tree = { id: origin, children: tree };
        }
        if (!tree || tree.id === void 0 || tree.id === null)
          throw Error("Hypertree: tree must have an id");
        const o = opts || {};
        this._radius = o.radius > 0 ? o.radius : void 0;
        this._duration = o.duration > 0 ? o.duration : 400;
        this._easing = o.easing || "easeInOutCubic";
        this._onFocus = typeof o.onFocus === "function" ? o.onFocus : null;
        this._onNodeClick = typeof o.onNodeClick === "function" ? o.onNodeClick : null;
        this._ignoreWhileFocusing = o.ignoreWhileFocusing === !0;
        const maxLabel = o.maxLabel > 0 ? o.maxLabel : 16, st = o.styled ? typeof o.styled === "object" ? o.styled : {} : null;
        this._style = st ? {
          bullet: st.bullet > 0 ? st.bullet : 7.5,
          factor: st.bulletFactor > 0 ? st.bulletFactor : 1.5,
          fontSize: st.fontSize > 0 ? st.fontSize : 14,
          fontFamily: st.fontFamily || "system-ui, sans-serif",
          palette: Array.isArray(st.palette) && st.palette.length > 0 ? st.palette : ["#3b6ea8", "#d9822b", "#3a9e6f", "#a4508b", "#c9a227", "#5a6b7b"]
        } : null;
        const nodeStyle = typeof o.nodeStyle === "function" ? o.nodeStyle : null, bg = o.badgeGlyphs && typeof o.badgeGlyphs === "object" ? o.badgeGlyphs : {}, badgeGlyphs = {
          action: bg.action && typeof bg.action === "object" ? bg.action : BADGE_GLYPHS.action,
          info: bg.info && typeof bg.info === "object" ? bg.info : BADGE_GLYPHS.info
        };
        this._noLabel = this.forest || st && o.rootGlyph ? tree.id : null;
        this._glyphR = o.rootGlyphRadius > 0 ? o.rootGlyphRadius : 100;
        this._labelDepth = o.labelDepth >= 0 ? o.labelDepth : 1 / 0;
        this._scheduler = o.scheduler || schedulerMod.scheduler;
        this.rootId = tree.id;
        this._baseLayout = layout(tree, this._radius ? { radius: this._radius } : void 0);
        this._center = this._baseLayout.nodes[0].x;
        this._baseNodeById = new Map;
        this._current = new Map;
        for (const nd of this._baseLayout.nodes) {
          this._baseNodeById.set(nd.id, nd);
          this._current.set(nd.id, { x: nd.x, y: nd.y });
        }
        this._order = [];
        const labelLines = new Map, labelText = new Map, detailOf = new Map, colorOf = new Map;
        this._edges = [];
        const style = this._style;
        (function walk(node, parentId, depth, inherited, childIndex) {
          this._order.push(node.id);
          const raw = node.label !== void 0 && node.label !== null ? String(node.label) : String(node.id);
          labelText.set(node.id, raw);
          const detail = [];
          for (const kind of ["action", "info"]) {
            const v = node[kind];
            if (v !== void 0 && v !== null && v !== "")
              detail.push({ kind, value: v });
          }
          if (detail.length > 0)
            detailOf.set(node.id, detail);
          labelLines.set(node.id, wrapLabel(raw, maxLabel));
          if (parentId !== null)
            this._edges.push({ from: parentId, to: node.id });
          let color = inherited;
          if (style) {
            if (node.color)
              color = String(node.color);
            else if (parentId === null)
              color = "#5f6368";
            else if (depth === 1 && !tree.color)
              color = style.palette[childIndex % style.palette.length];
            const over = nodeStyle ? nodeStyle(node, { depth, color }) : null;
            if (over && over.color)
              color = String(over.color);
            colorOf.set(node.id, color);
          }
          const kids = Array.isArray(node.children) ? node.children : [];
          for (let i = 0;i < kids.length; i += 1)
            walk.call(this, kids[i], node.id, depth + 1, color, i);
        }).call(this, tree, null, 0, null, 0);
        this.prefix = o.prefix || `hypertree-${_instanceSeq++}`;
        this._scope = scopedIds.createScope(this.prefix);
        const linkNodes = this._edges.map((e) => ({
          tag: "path",
          attrs: {
            id: `link-${e.from}-${e.to}`,
            fill: "none",
            stroke: style ? colorOf.get(e.to) : "#9aa0a6",
            "stroke-width": style ? 1.5 : 1,
            d: ""
          }
        })), baseDepth = new Map;
        for (const nd of this._baseLayout.nodes)
          baseDepth.set(nd.id, nd.depth);
        const fs = style ? style.fontSize : 0, pillH = fs * 22 / 14, estimate = (text) => text.length * fs * 0.55, styledNode = (id) => {
          const r = this._radiusAt(baseDepth.get(id)), color = colorOf.get(id), width = estimate(labelText.get(id)) + 10, glyph = id === this.rootId && o.rootGlyph ? {
            tag: "g",
            attrs: { id: `glyph-${id}`, transform: `scale(${this._glyphScale(baseDepth.get(id))})` },
            children: [o.rootGlyph]
          } : id === this.rootId && this.forest ? null : { tag: "circle", attrs: { id: `dot-${id}`, cx: 0, cy: 0, r, fill: color } };
          return {
            tag: "g",
            attrs: { id: `node-${id}`, transform: "translate(0 0)" },
            children: [
              ...glyph ? [glyph] : [],
              {
                tag: "g",
                attrs: {
                  id: `label-${id}`,
                  transform: `translate(0 ${2 * r + 15})`,
                  ...id === this._noLabel ? { display: "none" } : {}
                },
                children: [
                  {
                    tag: "rect",
                    attrs: {
                      id: `pill-${id}`,
                      rx: 5,
                      ry: 5,
                      x: -width / 2,
                      y: -(pillH - fs) / 3 - fs,
                      width,
                      height: pillH,
                      fill: color
                    }
                  },
                  {
                    tag: "text",
                    attrs: {
                      id: `text-${id}`,
                      x: 0,
                      y: 0,
                      "text-anchor": "middle",
                      fill: "#ffffff",
                      "font-size": fs,
                      "font-family": style.fontFamily
                    },
                    text: labelText.get(id)
                  },
                  ...detailOf.has(id) ? [{
                    tag: "g",
                    attrs: { id: `detail-${id}`, transform: `translate(${width / 2 + 15} -7.5)` },
                    children: detailOf.get(id).map((d, i) => ({
                      tag: "g",
                      attrs: {
                        id: `detail-${d.kind}-${id}`,
                        "data-kind": d.kind,
                        cursor: "pointer",
                        transform: `translate(${i * 25} 0)`
                      },
                      children: [
                        { tag: "circle", attrs: { cx: 0, cy: 0, r: 10, fill: color } },
                        {
                          tag: "g",
                          attrs: { "data-glyph": d.kind, fill: "#ffffff", transform: "translate(-10 -10)" },
                          children: [badgeGlyphs[d.kind]]
                        }
                      ]
                    }))
                  }] : []
                ]
              }
            ]
          };
        }, nodeNodes = this._order.map((id) => style ? styledNode(id) : {
          tag: "g",
          attrs: { id: `node-${id}`, transform: "translate(0 0)" },
          children: [
            ...id === this._noLabel ? [] : [{
              tag: "circle",
              attrs: { id: `dot-${id}`, cx: 0, cy: 0, r: 6, fill: "#4488cc" }
            }],
            {
              tag: "text",
              attrs: {
                id: `label-${id}`,
                x: 0,
                y: 18,
                "text-anchor": "middle",
                fill: "#202124",
                "font-size": 12,
                ...id === this._noLabel ? { display: "none" } : {}
              },
              children: (labelLines.get(id) || []).map((line, i) => ({
                tag: "tspan",
                attrs: { x: 0, dy: i === 0 ? 0 : "1.1em" },
                text: line
              }))
            }
          ]
        }), template = {
          tag: "g",
          attrs: { id: "root" },
          children: [
            { tag: "g", attrs: { id: "links" }, children: linkNodes },
            { tag: "g", attrs: { id: "nodes" }, children: nodeNodes }
          ]
        };
        this.el = svgBuild.build(template, { idScope: this._scope });
        svgRoot.appendChild(this.el);
        const byDomId = new Map;
        (function idx(node) {
          if (node && node.getAttribute) {
            const a = node.getAttribute("id");
            if (a)
              byDomId.set(a, node);
          }
          const ch = node && node.childNodes || [];
          for (const c of ch)
            idx(c);
        })(this.el);
        const find = (rawId) => byDomId.get(this._scope.id(rawId));
        this._nodeEls = new Map;
        for (const id of this._order)
          this._nodeEls.set(id, find(`node-${id}`));
        this._labelEls = new Map;
        for (const id of this._order)
          this._labelEls.set(id, find(`label-${id}`));
        this._glyphEl = find(`glyph-${this.rootId}`) || null;
        this._dotEls = new Map;
        for (const id of this._order) {
          const dot = find(`dot-${id}`);
          if (dot)
            this._dotEls.set(id, dot);
        }
        if (style)
          for (const id of this._order) {
            const text = find(`text-${id}`), len = text && typeof text.getComputedTextLength === "function" ? text.getComputedTextLength() : 0;
            if (len > 0) {
              const pill = find(`pill-${id}`);
              svgApply.svgAttr(pill, "width", len + 10);
              svgApply.svgAttr(pill, "x", -(len + 10) / 2);
              const badges = find(`detail-${id}`);
              if (badges)
                svgApply.svgAttr(badges, "transform", `translate(${(len + 10) / 2 + 15} -7.5)`);
            }
          }
        this._detailEls = new Map;
        this._badgeHandlers = [];
        this._onNodeDetail = typeof o.onNodeDetail === "function" ? o.onNodeDetail : null;
        if (style)
          for (const [id, detail] of detailOf) {
            this._detailEls.set(id, find(`detail-${id}`));
            for (const d of detail) {
              const el = find(`detail-${d.kind}-${id}`);
              if (!el || typeof el.addEventListener !== "function")
                continue;
              const handler = (ev) => {
                if (ev && typeof ev.stopPropagation === "function")
                  ev.stopPropagation();
                if (this._disposed || !this._onNodeDetail)
                  return;
                this._onNodeDetail(id, d.kind, d.value, ev);
              };
              el.addEventListener("click", handler);
              this._badgeHandlers.push({ el, handler });
            }
          }
        this._linkEls = new Map;
        for (const e of this._edges)
          this._linkEls.set(`${e.from}>${e.to}`, find(`link-${e.from}-${e.to}`));
        this._focusId = this.rootId;
        this._previousFocusId = null;
        this._focusing = !1;
        this._active = new Set;
        this._handlers = new Map;
        this._disposed = !1;
        for (const id of this._order) {
          const el = this._nodeEls.get(id);
          if (el && typeof el.addEventListener === "function") {
            const handler = (ev) => {
              if (this._disposed)
                return;
              if (this._ignoreWhileFocusing && this._focusing)
                return;
              if (this._onNodeClick && this._onNodeClick(id, ev) === !1)
                return;
              this.focus(id);
            };
            el.addEventListener("click", handler);
            this._handlers.set(id, handler);
          }
        }
        this._writePositions(this._current);
        this._depth = new Map;
        for (const nd of this._baseLayout.nodes)
          this._depth.set(nd.id, nd.depth);
        this._writeLabels(this._depth, !1);
      }
      _radiusAt(d) {
        const st = this._style;
        return d <= 1 ? st.bullet : st.bullet / st.factor ** (d - 1);
      }
      _glyphScale(d) {
        return d === 0 ? 1 : 2 * this._radiusAt(d) / this._glyphR;
      }
      _writeGlyphs(from, to, p) {
        if (!this._style)
          return;
        for (const id of this._order) {
          const a = this._radiusAt(from.get(id)), r = a + (this._radiusAt(to.get(id)) - a) * p, dot = this._dotEls.get(id);
          if (dot)
            svgApply.svgAttr(dot, "r", r);
          svgApply.svgAttr(this._labelEls.get(id), "transform", `translate(0 ${2 * r + 15})`);
        }
        if (this._glyphEl) {
          const a = this._glyphScale(from.get(this.rootId)), b = this._glyphScale(to.get(this.rootId));
          svgApply.svgAttr(this._glyphEl, "transform", `scale(${a + (b - a) * p})`);
        }
      }
      _writeLabels(depth, hideOnly) {
        if (this._labelDepth === 1 / 0)
          return;
        for (const id of this._order) {
          if (id === this._noLabel)
            continue;
          const inside = depth.get(id) <= this._labelDepth;
          if (hideOnly && inside)
            continue;
          svgApply.svgAttr(this._labelEls.get(id), "display", inside ? "inline" : "none");
        }
      }
      _writePositions(posMap) {
        for (const id of this._order) {
          const p = posMap.get(id), g = this._nodeEls.get(id);
          svgApply.svgAttr(g, "transform", `translate(${p.x} ${p.y})`);
        }
        const c = this._center;
        for (const e of this._edges) {
          const a = posMap.get(e.from), b = posMap.get(e.to), da = Math.hypot(a.x - c, a.y - c), db = Math.hypot(b.x - c, b.y - c), far = db >= da ? b : a, ang = Math.atan2(far.y - c, far.x - c), r = (da + db) / 2, qx = c + r * Math.cos(ang), qy = c + r * Math.sin(ang);
          svgApply.svgAttr(this._linkEls.get(`${e.from}>${e.to}`), "d", `M ${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}`);
        }
      }
      _notifyFocus(nodeId) {
        const previous = this._previousFocusId;
        this._previousFocusId = nodeId;
        if (this._onFocus)
          this._onFocus(nodeId, { previous, refocus: previous === nodeId });
      }
      _target(nodeId) {
        const res = nodeId === this.rootId ? this._baseLayout : focusMove(this._baseLayout, nodeId), pos = new Map, depth = new Map;
        for (const nd of res.nodes) {
          pos.set(nd.id, { x: nd.x, y: nd.y });
          depth.set(nd.id, nd.depth);
        }
        return { pos, depth };
      }
      _cancelActive() {
        if (this._active.size === 0)
          return;
        for (const tl of Array.from(this._active))
          tl.stop();
        this._active.clear();
        this._focusing = !1;
      }
      focusSync(nodeId) {
        const { pos: target, depth } = this._target(nodeId);
        this._cancelActive();
        this._writePositions(target);
        this._writeGlyphs(depth, depth, 1);
        this._writeLabels(depth, !1);
        this._depth = depth;
        this._current = target;
        this._focusId = nodeId;
        this._notifyFocus(nodeId);
        return this;
      }
      focus(nodeId) {
        const start = this._current, fromDepth = this._depth, { pos: target, depth } = this._target(nodeId);
        this._writeLabels(depth, !0);
        const order = this._order, center = { x: this._center, y: this._center }, moveTween = new Tween({
          target: this.el,
          property: "focus",
          from: 0,
          to: 1,
          duration: this._duration,
          easing: this._easing,
          scheduler: this._scheduler,
          apply: (t) => {
            const p = t, m = new Map;
            for (const id of order) {
              const a = start.get(id) || center, b = target.get(id) || center;
              m.set(id, { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
            }
            this._writePositions(m);
            this._writeGlyphs(fromDepth, depth, p);
          }
        }), tl = new Timeline({
          scheduler: this._scheduler,
          onSettle: () => {
            this._active.delete(tl);
            this._focusing = this._active.size > 0;
          },
          onComplete: () => {
            this._writePositions(target);
            this._writeGlyphs(depth, depth, 1);
            this._writeLabels(depth, !1);
            this._depth = depth;
            this._current = target;
            this._focusId = nodeId;
            this._notifyFocus(nodeId);
          }
        });
        tl.add(moveTween, 0);
        tl.play();
        this._active.add(tl);
        this._focusing = !0;
        return tl;
      }
      node(nodeId) {
        const base = this._baseNodeById.get(nodeId);
        if (!base)
          throw Error(`hypertree: unknown node "${nodeId}"`);
        const cur = this._current.get(nodeId);
        return {
          id: base.id,
          x: cur.x,
          y: cur.y,
          depth: base.depth,
          angle: base.angle,
          sector: { start: base.sector.start, end: base.sector.end }
        };
      }
      get focusId() {
        return this._focusId;
      }
      dispose() {
        for (const [id, handler] of this._handlers) {
          const el = this._nodeEls.get(id);
          if (el && typeof el.removeEventListener === "function")
            el.removeEventListener("click", handler);
        }
        this._handlers.clear();
        for (const { el, handler } of this._badgeHandlers)
          el.removeEventListener("click", handler);
        this._badgeHandlers = [];
        this._cancelActive();
        this._focusing = !1;
        this._disposed = !0;
        if (this.el && this.el.parentNode)
          this.el.parentNode.removeChild(this.el);
      }
    }
    function hypertree(svgRoot, tree, opts) {
      return new Hypertree(svgRoot, tree, opts);
    }
    return { Hypertree, hypertree };
  } });

    const __core = __resolve("graphic.hypertree");
    return __core;
    }
};
