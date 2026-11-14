/**
 * dsh-claude-lite (轻妆) — sidebar & session upgrades for the DeepSeek Harness
 * web GUI. Client half. Hand-written, no build step, zero dependencies.
 *
 * Features:
 *  1. Date groups — in the host's native FLAT grouping, sessions are banded by
 *     今天/昨天/本周/更早. Workspace / workspace-tree grouping is left fully to
 *     the host (the sidebar's own filter picker switches modes; we never call
 *     setGroupBy — B2).
 *  2. Bucket collapse — click a date header to fold its rows; the state
 *     survives host re-renders (session-scoped) (B1).
 *  3. Panel-area collapse — the 插件/自动化任务/更多 block folds behind one
 *     slim toggle; persisted in localStorage.
 *  4. Footer declutter — the "Remote" footer entry is hidden; a mirror row
 *     inside the 功能 panel opens the same dialog (proxy click on the hidden
 *     React button — delegated events ignore visibility, verified). The
 *     matcher is class-based (.dshRemoteSidebarEntry), immune to label and
 *     badge drift (B3, B30).
 *  5. Brand row — star mark + custom name, right-click to edit (name: free
 *     text; icon: emoji / builtin name / local image path via host route);
 *     persisted in localStorage. Default name: "Claude".
 *  6. Model-row brand marks — the model picker's labels (composer trigger,
 *     menu current value, menu rows) get the vendor's wordmark in front of /
 *     replacing the brand word. Matched by the host's own data-model-id
 *     attribute (prefix table); wordmark SVGs are dsh-claude-style's
 *     lobe-icons lockups served by the host half, light/dark variants follow
 *     the original class semantics (dsh-combine-mark-color/-mono).
 *  7. Settings overlay — right-click the brand row (or 头像菜单 → 轻妆设置):
 *     brand row editor + the title module's category-emoji slots (one input
 *     per slot, rendered from the host config; persisted host-side via
 *     /dsh-claude-lite/title-config).
 *
 * Mechanism (verified against dsh 0.2.1-rc.5):
 *  - `ctx.get("uiWorkspace")` → workspace browser service; `view` carries the
 *    BOUND view actions (setGroupBy is SINGLE-argument — one call, one string);
 *    `sessions.list.getSnapshot().byId[id].updatedAt` = real epoch ms.
 *  - Sidebar subtrees get replaced wholesale on re-render, so element
 *    (re)insertion runs through a debounced tick anchored on document.body,
 *    and clicks are delegated at body level.
 *  - Fonts (Claude typography) are served by the host half via
 *    /dsh-claude-lite/fonts/* and declared with font-display: swap. The
 *    distributed package ships OFL fonts only; Anthropic @font-face entries
 *    simply 404 and fall back to system fonts there.
 */
window.__ModuleLoader__.load({
  id: "dsh-claude-lite",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    "use strict";
    var PACKAGE_NAME = "dsh-claude-lite";
    var ATTR = "data-claude-lite";
    var HEADER_SEL = "[" + ATTR + '~="date-header"]';
    var BODY_FLAG = "data-claude-lite-date-groups";
    /* 1.0.0 更名迁移：旧键只读一次，读到即搬走（品牌自定义/折叠状态不丢） */
    var PANEL_KEY = "dsh.claude-lite.panels"; /* "1" = collapsed; absent = collapsed (default) */
    /* web-all 全家桶 remote-bridge「配对 iPhone」footer QR 触发钮（B31，纯图标无文字） */
    var FOOTER_QR_SEL = '[data-dsh-plugin="remote-bridge"][data-dsh-part="entry"]';
    var BRAND_KEY = "dsh.claude-lite.brand"; /* JSON {text, icon}; icon = ""(default star) | builtin name | emoji | /abs/path */
    var LEGACY_PANEL_KEY = "dsh.moshang-lite.panels";
    var LEGACY_BRAND_KEY = "dsh.moshang-lite.brand";
    var TITLE_CFG_ROUTE = "/dsh-claude-lite/title-config";
    var BUCKET_LABEL = { today: "今天", yesterday: "昨天", week: "本周", earlier: "更早" };
    var STAR_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 148.09 148.18\"><g transform=\"translate(-75.96,-223.53)\"><path fill=\"#D97757\" d=\"m 105.01,322.07 29.14,-16.35 0.49,-1.42 -0.49,-0.79 h -1.42 l -4.87,-0.3 -16.65,-0.45 -14.44,-0.6 -13.99,-0.75 -3.52,-0.75 -3.3,-4.35 0.34,-2.17 2.96,-1.99 4.24,0.37 9.37,0.64 14.06,0.97 10.2,0.6 15.11,1.57 h 2.4 l 0.34,-0.97 -0.82,-0.6 -0.64,-0.6 -14.55,-9.86 -15.75,-10.42 -8.25,-6 -4.46,-3.04 -2.25,-2.85 -0.97,-6.22 4.05,-4.46 5.44,0.37 1.39,0.37 5.51,4.24 11.77,9.11 15.37,11.32 2.25,1.87 0.9,-0.64 0.11,-0.45 -1.01,-1.69 -8.36,-15.11 -8.92,-15.37 -3.97,-6.37 -1.05,-3.82 c -0.37,-1.57 -0.64,-2.89 -0.64,-4.5 l 4.61,-6.26 2.55,-0.82 6.15,0.82 2.59,2.25 3.82,8.74 6.19,13.76 9.6,18.71 2.81,5.55 1.5,5.14 0.56,1.57 h 0.97 v -0.9 l 0.79,-10.54 1.46,-12.94 1.42,-16.65 0.49,-4.69 2.32,-5.62 4.61,-3.04 3.6,1.72 2.96,4.24 -0.41,2.74 -1.76,11.44 -3.45,17.92 -2.25,12 h 1.31 l 1.5,-1.5 6.07,-8.06 10.2,-12.75 4.5,-5.06 5.25,-5.59 3.37,-2.66 h 6.37 l 4.69,6.97 -2.1,7.2 -6.56,8.32 -5.44,7.05 -7.8,10.5 -4.87,8.4 0.45,0.67 1.16,-0.11 17.62,-3.75 9.52,-1.72 11.36,-1.95 5.14,2.4 0.56,2.44 -2.02,4.99 -12.15,3 -14.25,2.85 -21.22,5.02 -0.26,0.19 0.3,0.37 9.56,0.9 4.09,0.22 h 10.01 l 18.64,1.39 4.87,3.22 2.92,3.94 -0.49,3 -7.5,3.82 -10.12,-2.4 -23.62,-5.62 -8.1,-2.02 h -1.12 v 0.67 l 6.75,6.6 12.37,11.17 15.49,14.4 0.79,3.56 -1.99,2.81 -2.1,-0.3 -13.61,-10.24 -5.25,-4.61 -11.89,-10.01 h -0.79 v 1.05 l 2.74,4.01 14.47,21.75 0.75,6.67 -1.05,2.17 -3.75,1.31 -4.12,-0.75 -8.47,-11.89 -8.74,-13.39 -7.05,-12 -0.86,0.49 -4.16,44.81 -1.95,2.29 -4.5,1.72 -3.75,-2.85 -1.99,-4.61 1.99,-9.11 2.4,-11.89 1.95,-9.45 1.76,-11.74 1.05,-3.9 -0.07,-0.26 -0.86,0.11 -8.85,12.15 -13.46,18.19 -10.65,11.4 -2.55,1.01 -4.42,-2.29 0.41,-4.09 2.47,-3.64 14.74,-18.75 8.89,-11.62 5.74,-6.71 -0.04,-0.97 h -0.34 l -39.15,25.42 -6.97,0.9 -3,-2.81 0.37,-4.61 1.42,-1.5 11.77,-8.1 -0.04,0.04 z\"/></g></svg>";

    /* 内置候选图标（陶土橙描边风；配置里填名字即切换） */
    var BUILTIN_ICONS = {
      star: STAR_SVG,
      balance: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#D97757\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3.5v17M8.5 20.5h7M4 7h16\"/><path d=\"M6.5 7 4 12.3a2.7 2.7 0 0 0 5 0L6.5 7Z\"/><path d=\"M17.5 7 15 12.3a2.7 2.7 0 0 0 5 0L17.5 7Z\"/></svg>",
      flower: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#D97757\" stroke-width=\"1.6\"><ellipse cx=\"12\" cy=\"6.8\" rx=\"2.5\" ry=\"3.9\"/><ellipse cx=\"12\" cy=\"6.8\" rx=\"2.5\" ry=\"3.9\" transform=\"rotate(72 12 12)\"/><ellipse cx=\"12\" cy=\"6.8\" rx=\"2.5\" ry=\"3.9\" transform=\"rotate(144 12 12)\"/><ellipse cx=\"12\" cy=\"6.8\" rx=\"2.5\" ry=\"3.9\" transform=\"rotate(216 12 12)\"/><ellipse cx=\"12\" cy=\"6.8\" rx=\"2.5\" ry=\"3.9\" transform=\"rotate(288 12 12)\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\" fill=\"#D97757\" stroke=\"none\"/></svg>",
      gem: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#D97757\" stroke-width=\"1.8\" stroke-linejoin=\"round\"><path d=\"M7.5 4h9L21 9.5 12 20.5 3 9.5 7.5 4Z\"/><path d=\"M3 9.5h18M7.5 4 12 20.5 16.5 4\"/></svg>"
    };
    var ICON_HINT = "可填：emoji（如 ⚖️）· 内置名 star / balance / flower / gem · 本机图片路径（/…/icon.png）";

    /* localStorage 键一次性迁移：moshang-lite → claude-lite（新键已存在则不动） */
    function migrateLegacyKey(oldKey, newKey) {
      try {
        if (localStorage.getItem(newKey) !== null) return;
        var value = localStorage.getItem(oldKey);
        if (value === null) return;
        localStorage.setItem(newKey, value);
        localStorage.removeItem(oldKey);
      } catch (e) {}
    }
    migrateLegacyKey(LEGACY_PANEL_KEY, PANEL_KEY);
    migrateLegacyKey(LEGACY_BRAND_KEY, BRAND_KEY);

    var STYLE = [
      /* Claude 字体（font-display:swap，不阻塞渲染；文件由本插件路由提供） */
      '@font-face{font-family:"Anthropic Sans Web Text";src:url(/dsh-claude-lite/fonts/AnthropicSansWebText.ttf) format("truetype");font-weight:400;font-style:normal;font-display:swap}',
      '@font-face{font-family:"Anthropic Serif Web Text";src:url(/dsh-claude-lite/fonts/AnthropicSerifWebText.ttf) format("truetype");font-weight:400;font-style:normal;font-display:swap}',
      '@font-face{font-family:"Anthropic Mono Web";src:url(/dsh-claude-lite/fonts/AnthropicMonoWeb.ttf) format("truetype");font-weight:400;font-style:normal;font-display:swap}',
      '@font-face{font-family:"Claude Style Inter";src:url(/dsh-claude-lite/fonts/InterVariable.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}',
      '@font-face{font-family:"Claude Style Noto Serif";src:url(/dsh-claude-lite/fonts/NotoSerifVariable.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}',
      '@font-face{font-family:"JetBrains Mono";src:url(/dsh-claude-lite/fonts/JetBrainsMonoVariable.ttf) format("truetype-variations");font-weight:100 800;font-style:normal;font-display:swap}',
      '@font-face{font-family:"JetBrains Mono";src:url(/dsh-claude-lite/fonts/JetBrainsMonoItalicVariable.ttf) format("truetype-variations");font-weight:100 800;font-style:italic;font-display:swap}',
      /* date groups */
      "[" + ATTR + '~="date-header"] {',
      "  display: flex; align-items: center; gap: 6px;",
      "  padding: 12px 12px 3px; font-size: 11px; line-height: 16px; font-weight: 400;",
      "  color: var(--dsw-alias-label-tertiary, #98968a);",
      "  letter-spacing: .04em; user-select: none; cursor: pointer;",
      "}",
      "[" + ATTR + '~="date-header"]::after { content: "▾"; font-size: 9px; opacity: .7; }',
      "[" + ATTR + '~="date-header"][data-claude-lite~="collapsed"]::after { content: "▸"; }',
      "[" + ATTR + '~="date-header"]:first-child { padding-top: 4px; }',
      "[" + ATTR + '~="row-hidden"] { display: none !important; }',
      /* panel-area collapse */
      "[" + ATTR + '~="panel-toggle"] {',
      "  display: flex; align-items: center; gap: 6px; box-sizing: border-box;",
      "  flex: 0 0 auto; align-self: stretch;",
      "  grid-column: 1 / -1; justify-self: stretch;",
      "  width: auto; min-width: 0; min-height: 24px;",
      "  margin: 0 2px 2px; padding: 4px 8px; border: 0; background: transparent;",
      "  font-size: 12px; line-height: 18px; font-weight: 600; text-align: left; cursor: pointer;",
      "  color: var(--dsw-alias-label-secondary, #70686a); border-radius: 8px;",
      "  overflow: hidden; white-space: nowrap;",
      "}",
      "[" + ATTR + '~="panel-toggle"]:hover { background: var(--dsw-alias-interactive-bg-hover, #ffffff0d); }',
      "[" + ATTR + '~="panel-toggle"]::after { content: "▾"; margin-left: auto; font-size: 9px; opacity: .7; }',
      "[" + ATTR + '~="panel-toggle"][data-claude-lite~="collapsed"]::after { content: "▸"; }',
      /* Remote mirror row inside the 功能 panel (B30) — same hierarchy level as
         the toggle itself (一级：12px/600/secondary) */
      "[" + ATTR + '~="remote-row"] {',
      "  display: flex; align-items: center; gap: 6px; width: calc(100% - 4px);",
      "  margin: 0 2px 2px; padding: 4px 8px; border: 0; background: transparent;",
      "  font-size: 12px; line-height: 18px; font-weight: 600; text-align: left; cursor: pointer;",
      "  color: var(--dsw-alias-label-secondary, #70686a); border-radius: 8px;",
      "}",
      "[" + ATTR + '~="remote-row"]:hover { background: var(--dsw-alias-interactive-bg-hover, #ffffff0d); }',
      /* avatar-menu injected items (B8) */
      "[" + ATTR + '~="menu-item"] {',
      "  display: flex; align-items: center; gap: 10px; width: 100%;",
      "  padding: 8px 12px; border: 0; background: transparent; text-align: left;",
      "  font-size: 13px; line-height: 20px; cursor: pointer;",
      "  color: var(--dsw-alias-label-primary, #29261b); border-radius: 8px;",
      "}",
      "[" + ATTR + '~="menu-item"]:hover { background: var(--dsw-alias-interactive-bg-hover, #0000000a); }',
      /* model-row brand marks（词标来自原版包 lobe-icons 词标，本插件路由提供；
       * 亮暗双变体沿用原版类名语义：浅色画布显示厂商彩色，深色退单色） */
      ".claude-lite-model-combine { display: inline-block; height: .72em; margin-right: .25em; vertical-align: baseline; }",
      "@supports (height: 1cap) { .claude-lite-model-combine { height: 1cap; } }",
      ".claude-lite-model-combine svg { display: block; height: 100%; width: auto; overflow: visible; }",
      ".claude-lite-model-combine .dsh-combine-mark-color:not(.dsh-combine-mark-mono) { display: none; }",
      "body:not([data-ds-dark-theme]) .claude-lite-model-combine .dsh-combine-mark-color { display: block; }",
      "body:not([data-ds-dark-theme]) .claude-lite-model-combine .dsh-combine-mark-mono:not(.dsh-combine-mark-color) { display: none; }",
      "[" + ATTR + '~="model-mark-alt"] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
    ].join("\n");

    /* ── date buckets ────────────────────────────────────────────── */

    function bucketFromTs(ts) {
      if (typeof ts !== "number" || !(ts > 0)) return null;
      var d = new Date(ts), now = new Date();
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      var delta = Math.round((today - day) / 86400000);
      if (delta <= 0) return "today";
      if (delta === 1) return "yesterday";
      if (delta <= 6) return "week";
      return "earlier";
    }
    function bucketFromLabel(row) {
      var t = String(row.textContent || "");
      if (/(刚刚|now)/i.test(t)) return "today";
      if (/\d+\s*(秒|秒钟|分钟|分|sec)/i.test(t)) return "today";
      if (/\d+\s*(小时|时|h\b|hour|min)/i.test(t)) return "today";
      if (/1\s*(天|日|day)/i.test(t)) return "yesterday";
      if (/[2-6]\s*(天|日|day)/i.test(t)) return "week";
      return "earlier";
    }
    /* Collapsed date buckets survive host re-renders (B1). */
    var collapsedBuckets = {};
    function makeHeader(key) {
      var h = document.createElement("div");
      h.setAttribute(ATTR, collapsedBuckets[key] ? "date-header collapsed" : "date-header");
      h.setAttribute(ATTR + "-bucket", key);
      h.setAttribute("aria-hidden", "true");
      h.textContent = BUCKET_LABEL[key] || key;
      return h;
    }
    function topLevelAnchor(row, list) {
      var anchor = row;
      while (anchor.parentElement !== null && anchor.parentElement !== list) anchor = anchor.parentElement;
      return anchor;
    }
    function currentGroupMode() {
      /* The host's own grouping choice (B2: never fight it). Tolerates the
       * historically corrupted nested shape {"groupBy":{"groupBy":…}}. */
      try {
        var g = JSON.parse(localStorage.getItem("dsh.workspace.view.v5") || "{}").groupBy;
        if (g && typeof g === "object") g = g.groupBy;
        return typeof g === "string" ? g : "workspace";
      } catch (e) { return "workspace"; }
    }
    function regroup(list, byId) {
      /* B11：header 必须跨 tick 复用（增量更新），不能删光重建——
       * 用户点击瞬间若恰逢重建，click 的 target 已 detached，事件
       * 冒泡不到 body 委托 = "点了没反应"。复用保证元素身份稳定。 */
      var existing = {}, stale = [];
      list.querySelectorAll(HEADER_SEL).forEach(function (h) {
        var k = h.getAttribute(ATTR + "-bucket");
        if (typeof k === "string" && k !== "" && existing[k] === void 0) existing[k] = h;
        else stale.push(h);
      });
      stale.forEach(function (h) { h.remove(); });
      if (currentGroupMode() !== "flat" || list.querySelector('[data-row-key^="workspace:"]') !== null) {
        /* Native workspace grouping is in force — stand down entirely. */
        list.querySelectorAll("[" + ATTR + '~="row-hidden"]').forEach(function (n) {
          if (n.getAttribute(ATTR) === "row-hidden") n.removeAttribute(ATTR);
        });
        Object.keys(existing).forEach(function (k) { existing[k].remove(); });
        document.body.removeAttribute(BODY_FLAG);
        return false;
      }
      var rows = list.querySelectorAll('[data-row-key^="session:"]');
      if (rows.length === 0) {
        Object.keys(existing).forEach(function (k) { existing[k].remove(); });
        document.body.removeAttribute(BODY_FLAG);
        return false;
      }
      var prev = null, used = {};
      rows.forEach(function (row) {
        var id = String(row.getAttribute("data-row-key") || "").slice("session:".length);
        var record = byId ? byId[id] : null;
        var key = (record && bucketFromTs(record.updatedAt)) || bucketFromLabel(row);
        var anchor = topLevelAnchor(row, list);
        if (key !== prev) {
          used[key] = true;
          var h = existing[key];
          if (h === void 0) {
            h = makeHeader(key);
            list.insertBefore(h, anchor);
          } else {
            h.setAttribute(ATTR, collapsedBuckets[key] ? "date-header collapsed" : "date-header");
            if (h.nextSibling !== anchor) list.insertBefore(h, anchor);
          }
          prev = key;
        }
        if (collapsedBuckets[key]) anchor.setAttribute(ATTR, "row-hidden");
        else if (anchor.getAttribute(ATTR) === "row-hidden") anchor.removeAttribute(ATTR);
      });
      /* 桶消失（全部行离开该桶）：移除闲置 header */
      Object.keys(existing).forEach(function (k) {
        if (!used[k] && existing[k].parentElement === list) existing[k].remove();
      });
      document.body.setAttribute(BODY_FLAG, "");
      return true;
    }


    /* ── 品牌行（原版形态 + 用户可自定义：右键品牌行弹出设置浮层） ── */

    function brandConfig() {
      try {
        var cfg = JSON.parse(localStorage.getItem(BRAND_KEY) || "{}");
        return { text: typeof cfg.text === "string" && cfg.text !== "" ? cfg.text : "Claude",
                 icon: typeof cfg.icon === "string" ? cfg.icon : "" };
      } catch (e) { return { text: "Claude", icon: "" }; }
    }
    /* 图标三形式：内置名 / emoji / 本机图片路径（经 host 路由读取，见 host/index.js） */
    function brandIconNode(icon) {
      var v = String(icon || "").trim();
      var mark = document.createElement("span");
      mark.style.cssText = "display:flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px";
      var lower = v.toLowerCase();
      if (v === "" || BUILTIN_ICONS[lower] !== void 0) {
        mark.innerHTML = v === "" ? STAR_SVG : BUILTIN_ICONS[lower];
        var svg = mark.querySelector("svg");
        if (svg !== null) { svg.setAttribute("width", "18"); svg.setAttribute("height", "18"); svg.style.flex = "none"; }
      } else if (/^([/~]|[A-Za-z]:[\\/])/i.test(v) && /\.(png|jpe?g|webp|gif|svg)$/i.test(v)) {
        var img = document.createElement("img");
        img.src = "/dsh-claude-lite/brand-icon?p=" + encodeURIComponent(v);
        img.alt = "";
        img.style.cssText = "width:18px;height:18px;object-fit:contain;border-radius:3px;flex:none";
        mark.appendChild(img);
      } else {
        mark.textContent = v; /* emoji / 任意短文本 */
        mark.style.fontSize = "15px";
        mark.style.lineHeight = "1";
      }
      return mark;
    }
    function refreshBrand() {
      var sb = document.querySelector('[data-slot="sidebar"]');
      var brand = sb && sb.querySelector('[class*="logoRow"] [class*="brand"]');
      if (brand === null) return;
      brand.removeAttribute(ATTR);
      ensureBrand();
    }
    function ensureBrand() {
      var sb = document.querySelector('[data-slot="sidebar"]');
      if (sb === null) return;
      var brand = sb.querySelector('[class*="logoRow"] [class*="brand"]');
      if (brand === null || brand.getAttribute(ATTR) === "branded") return;
      brand.setAttribute(ATTR, "branded");
      var cfg = brandConfig();
      var wrap = document.createElement("span");
      wrap.style.cssText = "display:flex;align-items:center;gap:9px;min-width:0";
      wrap.appendChild(brandIconNode(cfg.icon));
      var label = document.createElement("span");
      label.textContent = cfg.text;
      label.style.cssText = "font-size:15px;font-weight:600;letter-spacing:.01em;color:var(--dsw-alias-label-primary,#29261b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      wrap.appendChild(label);
      brand.textContent = "";
      brand.appendChild(wrap);
    }

    /* ── 设置浮层（右键品牌行 / 头像菜单「轻妆设置」打开；
     *    单例挂 body，不进侧栏子树。两段：品牌行 + 会话标题类别） ── */
    var INPUT_CSS = "box-sizing:border-box;height:30px;padding:0 8px;border:1px solid #00000026;border-radius:6px;background:transparent;color:inherit;font:inherit;outline:none";
    var BTN_GHOST_CSS = "height:28px;padding:0 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#70686a);font:inherit;cursor:pointer;border-radius:6px";
    var BTN_MAIN_CSS = "height:28px;padding:0 14px;border:0;background:#D97757;color:#fff;font:inherit;cursor:pointer;border-radius:6px";

    function titleStatus(el, message, ok) {
      el.textContent = message;
      el.style.display = message ? "block" : "none";
      el.style.color = ok ? "var(--dsw-alias-label-secondary,#70686a)" : "#b3261e";
    }

    /* 请求竞态守卫（挂在 globalThis 上跨模块实例共享——⌘R 重载后新旧实例
     * 共用同一份序号/队列/闸门，旧实例在途请求与新实例读取保持全序）：
     * ① 单调 seq——只有最新请求的响应才回填界面；
     * ② chain 串行化全部 GET/POST——在途保存期间重开浮层，读取排在写入后；
     * ③ inflight——按钮禁用之外，Enter 提交路径同样拦截；
     * ④ 每个请求带超时——悬挂时走失败分支解禁，设置界面永不永久锁死。 */
    var titleNet = globalThis.__claudeLiteTitleNet;
    if (!titleNet || typeof titleNet !== "object") {
      titleNet = globalThis.__claudeLiteTitleNet = { seq: 0, chain: Promise.resolve(), inflight: false, revision: 0 };
    }
    var overlayAnchor = null; /* 异步渲染改变高度后重新定位用（P2-7） */

    function setTitleBusy(ed, busy) {
      var buttons = ["title-save", "title-reset"];
      for (var i = 0; i < buttons.length; i++) {
        var b = ed.querySelector('[data-claude-lite~="' + buttons[i] + '"]');
        if (b !== null) b.disabled = busy;
      }
    }

    function clampOverlay(ed) {
      var w = Math.min(340, window.innerWidth - 16);
      ed.style.width = w + "px";
      var r = overlayAnchor && overlayAnchor.isConnected ? overlayAnchor.getBoundingClientRect() : null;
      var top = r ? Math.min(r.bottom + 6, window.innerHeight - ed.offsetHeight - 12) : Math.round((window.innerHeight - ed.offsetHeight) / 2);
      var left = r ? Math.min(r.left, window.innerWidth - w - 12) : Math.round((window.innerWidth - w) / 2);
      ed.style.top = Math.max(8, top) + "px";
      ed.style.left = Math.max(8, left) + "px";
    }

    function fetchTitleConfig(ed, cb) {
      var seq = ++titleNet.seq;
      titleNet.inflight = true; /* 读取也占闸：Enter/按钮在读取期间一律拦截 */
      titleNet.chain = titleNet.chain.then(function () {
        /* AbortController 罩住 fetch+json 全程：正文卡住也能解禁；
         * abort 同时取消底层连接——悬挂请求不会晚到覆盖新配置 */
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 10000);
        return fetch(TITLE_CFG_ROUTE, { signal: controller.signal }).then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        }).then(function (data) {
          clearTimeout(timer);
          if (data && typeof data.revision === "number") titleNet.revision = data.revision;
          if (seq === titleNet.seq) { titleNet.inflight = false; cb(data); }
        }, function () {
          clearTimeout(timer);
          if (seq === titleNet.seq) { titleNet.inflight = false; cb(null); }
        });
      }).catch(function () { if (seq === titleNet.seq) titleNet.inflight = false; });
    }

    function saveTitleCategories(ed, emojis) {
      if (titleNet.inflight) return; /* busy：按钮与 Enter 共用一道闸（读+写统一） */
      titleNet.inflight = true;
      var status = ed.querySelector('[data-claude-lite~="title-status"]');
      var seq = ++titleNet.seq;
      setTitleBusy(ed, true);
      titleStatus(status, "保存中…", true);
      var payload = JSON.stringify(emojis === null ? { reset: true, revision: titleNet.revision } : { emojis: emojis, revision: titleNet.revision });
      titleNet.chain = titleNet.chain.then(function () {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 15000);
        return fetch(TITLE_CFG_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          signal: controller.signal
        }).then(function (r) {
          return r.json().then(function (data) { return { ok: r.ok, data: data }; }).catch(function () { return { ok: r.ok, data: {} }; });
        }).then(function (res) {
          clearTimeout(timer);
          if (res.data && typeof res.data.revision === "number") titleNet.revision = res.data.revision;
          if (seq !== titleNet.seq) return; /* 界面已被更新请求接管：由它解禁 */
          titleNet.inflight = false;
          setTitleBusy(ed, false);
          if (res.ok && res.data && res.data.ok) {
            fillTitleInputs(ed, res.data.emojis);
            titleStatus(status, emojis === null ? "已恢复默认 ✓" : "已保存 ✓", true);
          } else {
            titleStatus(status, (res.data && res.data.error) || "保存失败", false);
            /* CAS 冲突（409）：服务端已拒绝晚到写入并回传新修订号，自动刷新输入 */
            if (res.data && res.data.revision !== undefined) fetchTitleConfig(ed, function (cfg) { renderTitleSlots(ed, cfg); });
          }
        }, function () {
          clearTimeout(timer);
          if (seq !== titleNet.seq) return;
          titleNet.inflight = false;
          setTitleBusy(ed, false);
          titleStatus(status, "保存失败：无法连接插件 host", false);
        });
      });
    }

    function fillTitleInputs(ed, emojis) {
      var inputs = ed.querySelectorAll('[data-claude-lite~="title-emoji"]');
      inputs.forEach(function (input, i) {
        input.value = emojis && typeof emojis[i] === "string" ? emojis[i] : "";
      });
    }

    function renderTitleSlots(ed, config) {
      var box = ed.querySelector('[data-claude-lite~="title-slots"]');
      if (box === null) return;
      box.textContent = "";
      setTitleBusy(ed, false); /* 读取结束（无论成败）都恢复按钮 */
      if (config === null) {
        var err = document.createElement("div");
        err.style.cssText = "font-size:11px;line-height:15px;color:#b3261e";
        err.textContent = "读取失败：插件 host 未运行或版本过旧";
        box.appendChild(err);
        clampOverlay(ed);
        return;
      }
      var slots = config.slots || [];
      var emojis = config.emojis || [];
      for (var i = 0; i < slots.length; i++) {
        var row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:8px";
        var input = document.createElement("input");
        input.setAttribute(ATTR, "title-emoji");
        input.value = typeof emojis[i] === "string" ? emojis[i] : "";
        input.style.cssText = INPUT_CSS + ";width:44px;text-align:center;flex:none;padding:0";
        var text = document.createElement("span");
        text.textContent = slots[i].text;
        text.style.cssText = "font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#98968a)";
        row.appendChild(input);
        row.appendChild(text);
        box.appendChild(row);
      }
      if (config.enabled === false) {
        var note = document.createElement("div");
        note.style.cssText = "font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#98968a)";
        note.textContent = "会话标题整理当前未启用（配置 titleCurator.enabled=false），改动将在启用后生效";
        box.appendChild(note);
      }
      clampOverlay(ed); /* 槽位渲染改变了浮层高度，重新夹紧到视口内 */
    }

    function collectTitleInputs(ed) {
      var values = [];
      var inputs = ed.querySelectorAll('[data-claude-lite~="title-emoji"]');
      for (var i = 0; i < inputs.length; i++) {
        var v = inputs[i].value.trim();
        if (!v) return null; /* 空 = 有槽没填，交由后端报错文案 */
        values.push(v);
      }
      return values;
    }

    function openSettingsOverlay(anchor) {
      /* 每次打开都重建浮层：老单例会被跨实例闭包复用（老实例的按钮监听
       * 永远绑在老闭包上），重建让监听与取值始终来自当前实例（终审新增 P2）。 */
      var stale = document.querySelector("[" + ATTR + '~="brand-editor"]');
      if (stale !== null) stale.remove();
      var ed = document.createElement("div");
      {
        ed.__claudeLiteOwner = activeOwner; /* dispose 所有权判定 */
        ed.setAttribute(ATTR, "brand-editor");
        ed.style.cssText = "position:fixed;z-index:2147483000;display:none;flex-direction:column;gap:10px;"
          + "max-height:calc(100vh - 24px);overflow:auto;padding:14px;border-radius:12px;box-sizing:border-box;"
          + "box-shadow:0 8px 32px #0003,0 0 0 .5px #0000001a;"
          + "background:var(--dsw-alias-bg-layer-1,#faf9f5);color:var(--dsw-alias-label-primary,#29261b);"
          + "font-size:13px;line-height:18px";
        ed.innerHTML = '<div style="font-weight:600">轻妆设置</div>'
          + '<div style="display:flex;flex-direction:column;gap:4px">'
          + '<label style="display:flex;flex-direction:column;gap:4px">品牌行名称'
          + '<input data-claude-lite="brand-text" style="' + INPUT_CSS + '"></label>'
          + '<label style="display:flex;flex-direction:column;gap:4px">品牌行图标'
          + '<input data-claude-lite="brand-icon-input" style="' + INPUT_CSS + '"></label>'
          + '<div style="font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#98968a)">' + ICON_HINT + '</div>'
          + '<div style="display:flex;gap:8px;justify-content:flex-end">'
          + '<button type="button" data-claude-lite="brand-reset" style="' + BTN_GHOST_CSS + '">恢复默认</button>'
          + '<button type="button" data-claude-lite="brand-save" style="' + BTN_MAIN_CSS + '">保存</button></div></div>'
          + '<div style="height:1px;background:#0000001a"></div>'
          + '<div style="font-weight:600">会话标题类别 emoji</div>'
          + '<div style="font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#98968a)">类别含义固定，只换图标；保存后对新命名立即生效。</div>'
          + '<div data-claude-lite="title-slots" style="display:flex;flex-direction:column;gap:6px"></div>'
          + '<div data-claude-lite="title-status" style="display:none;font-size:11px;line-height:15px"></div>'
          + '<div style="display:flex;gap:8px;justify-content:flex-end">'
          + '<button type="button" data-claude-lite="title-reset" style="' + BTN_GHOST_CSS + '">恢复默认</button>'
          + '<button type="button" data-claude-lite="title-save" style="' + BTN_MAIN_CSS + '">保存</button></div>';
        document.body.appendChild(ed);
        ed.addEventListener("keydown", function (ev) {
          if (ev.key === "Escape") ed.style.display = "none";
          if (ev.key !== "Enter" || !ev.target || !ev.target.closest || !ev.target.closest("input")) return;
          if (ev.target.closest('[data-claude-lite~="title-emoji"]')) saveTitleSection(ed);
          else saveBrandEditor();
        });
        ed.querySelector('[data-claude-lite~="brand-save"]').addEventListener("click", saveBrandEditor);
        ed.querySelector('[data-claude-lite~="brand-reset"]').addEventListener("click", function () {
          try { localStorage.removeItem(BRAND_KEY); } catch (e) {}
          refreshBrand();
          /* 回填输入框：否则浮层里还是旧值，再点保存会把旧配置写回去（P2-10） */
          var cfg = brandConfig();
          ed.querySelector('[data-claude-lite~="brand-text"]').value = cfg.text;
          ed.querySelector('[data-claude-lite~="brand-icon-input"]').value = cfg.icon;
        });
        ed.querySelector('[data-claude-lite~="title-save"]').addEventListener("click", function () { saveTitleSection(ed); });
        ed.querySelector('[data-claude-lite~="title-reset"]').addEventListener("click", function () { saveTitleCategories(ed, null); });
      }
      var cfg = brandConfig();
      ed.querySelector('[data-claude-lite~="brand-text"]').value = cfg.text;
      ed.querySelector('[data-claude-lite~="brand-icon-input"]').value = cfg.icon;
      var status = ed.querySelector('[data-claude-lite~="title-status"]');
      titleStatus(status, "", true);
      overlayAnchor = anchor && anchor.isConnected ? anchor : null;
      ed.style.display = "flex";
      clampOverlay(ed);
      setTitleBusy(ed, true);
      fetchTitleConfig(ed, function (config) { renderTitleSlots(ed, config); });
      ed.querySelector("input").focus();
    }

    function saveTitleSection(ed) {
      var values = collectTitleInputs(ed);
      var status = ed.querySelector('[data-claude-lite~="title-status"]');
      if (values === null) {
        var total = ed.querySelectorAll('[data-claude-lite~="title-emoji"]').length;
        titleStatus(status, total + " 个类别 emoji 都要填写", false);
        return;
      }
      saveTitleCategories(ed, values);
    }

    function saveBrandEditor() {
      var ed = document.querySelector("[" + ATTR + '~="brand-editor"]');
      if (ed === null) return;
      var text = ed.querySelector('[data-claude-lite~="brand-text"]').value.trim() || "Claude";
      var icon = ed.querySelector('[data-claude-lite~="brand-icon-input"]').value.trim();
      try { localStorage.setItem(BRAND_KEY, JSON.stringify({ text: text, icon: icon })); } catch (e) {}
      refreshBrand();
    }

    /* ── panel-area collapse ─────────────────────────────────────── */

    function panelsCollapsed() {
      /* 默认折叠：顶部插件区默认收起；显式存过 "0" 才常开 */
      var v = localStorage.getItem(PANEL_KEY);
      return v === null ? true : v === "1";
    }
    function applyPanelState() {
      var sb = document.querySelector('[data-slot="sidebar"]');
      if (sb === null) return;
      var nav = sb.querySelector('nav[class*="panelList"]');
      var btn = sb.querySelector("[" + ATTR + '~="panel-toggle"]');
      if (nav === null || btn === null) return;
      var collapsed = panelsCollapsed();
      nav.style.display = collapsed ? "none" : "";
      btn.setAttribute(ATTR, collapsed ? "panel-toggle collapsed" : "panel-toggle");
      btn.textContent = "功能";
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    function ensurePanelToggle() {
      var sb = document.querySelector('[data-slot="sidebar"]');
      if (sb === null) return;
      var nav = sb.querySelector('nav[class*="panelList"]');
      if (nav === null) return;
      if (sb.querySelector("[" + ATTR + '~="panel-toggle"]') !== null) { applyPanelState(); return; }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute(ATTR, "panel-toggle");
      /* click handled by the body-level delegate — no direct listener here */
      /* 插入位置（B33 实测）：宿主 nav.panelList 的父容器 .scrollArea 是
       * display:grid（列 4px / 1fr / padding），panelList 显式占 grid-column:2。
       * 按旧法插进 grid 会被自动放进 4px 装饰列，flex 属性对 grid 子项无效，
       * 按钮宽度锁死在 16px（「功能」被裁成一个字）。上溯到 flex column 的
       * .scrollRegion 插入，按钮才是天然整宽的 flex item。 */
      var region = nav.closest('[class*="scrollRegion"]');
      if (region !== null) region.insertBefore(btn, region.firstChild);
      else nav.parentElement.insertBefore(btn, nav);
      applyPanelState();
    }


    /* ── 区段标签加粗（「会话」；用户要求与行区分层次） ───────────── */

    function boldSectionLabel() {
      var ra = document.querySelector('[data-slot="sidebar"] [class*="regionArea"]');
      if (ra === null || ra.getAttribute(ATTR + "-label") === "1") return;
      var walk = function (el, depth) {
        if (el === null || depth > 3) return false;
        for (var i = 0; i < el.children.length; i++) {
          var c = el.children[i];
          if ((c.textContent || "").trim() === "会话" && c.children.length <= 2) {
            c.style.fontWeight = "600";
            c.style.color = "var(--dsw-alias-label-secondary, #70686a)";
            ra.setAttribute(ATTR + "-label", "1");
            return true;
          }
          if (walk(c, depth + 1)) return true;
        }
        return false;
      };
      walk(ra, 0);
    }

    /* ── footer declutter (B3, B30) ────────────────────────────────
     * B30：Remote 0.6.x 的入口走宿主官方 sidebar.footer.action slot，行内
     * 可能带更新角标/退出链接等附加文本，旧的「整行文本 === Remote」精确
     * 匹配会漏。改按插件自己的类名 .dshRemoteSidebarEntry 找，天然免疫文
     * 案漂移；隐藏仍是行级 display:none（React 托管的行，内联样式不参与
     * 其调和，B3 数周验证）。 */

    function applyFooterState() {
      var fa = document.querySelector('[data-slot="sidebar"] [class*="footerActions"]');
      if (fa === null) return;
      var rows = fa.querySelectorAll(".dshRemoteSidebarEntry");
      for (var i = 0; i < rows.length; i++) rows[i].style.display = "none";
      /* B31：web-all 的 remote-bridge「配对 iPhone」QR 触发钮（同 slot、纯图标
         无文字，文本匹配永远够不着），一并纳入 footer 清理 */
      var qr = fa.querySelectorAll(FOOTER_QR_SEL);
      for (var j = 0; j < qr.length; j++) qr[j].style.display = "none";
    }
    function undoFooterState() {
      var fa = document.querySelector('[data-slot="sidebar"] [class*="footerActions"]');
      if (fa === null) return;
      var rows = fa.querySelectorAll(".dshRemoteSidebarEntry");
      for (var i = 0; i < rows.length; i++) rows[i].style.display = "";
      var qr = fa.querySelectorAll(FOOTER_QR_SEL);
      for (var j = 0; j < qr.length; j++) qr[j].style.display = "";
    }
    /* 代理点击的统一入口：找真实入口按钮。已实测（jsdom+React18）：按钮
     * 处于 display:none 子树时 .click() 照样触发 onClick（React 事件委托
     * 挂根节点、不看可见性）——2026-11-09 曾据「藏了点不动」取消隐藏，属
     * 误诊，真因是当时的精确文本匹配在角标/紧凑模式下找不到行。 */
    function findRemoteTrigger() {
      var btn = document.querySelector('[data-slot="sidebar"] .dshRemoteSidebarEntry button');
      if (btn !== null) return btn;
      /* 兜底：入口被设为「紧凑」时行被 portal 进账户行，不在 footerActions；
         按 aria-label/title 精确认领，避免误点标题含 Remote 的会话行 */
      var cand = document.querySelectorAll('[data-slot="sidebar"] button, [data-slot="sidebar"] [role="button"]');
      for (var i = 0; i < cand.length; i++) {
        var n = cand[i];
        if (n.closest('[role="menu"]') !== null) continue;
        if (n.closest(".dshRemoteSidebarEntry") !== null) continue;
        var label = ((n.getAttribute("aria-label") || "") + " " + (n.getAttribute("title") || "")).trim().toLowerCase();
        if (label === "remote" || label === "deepseek remote") return n;
      }
      return null;
    }
    /* 功能区镜像行（B30，用户拍板「移到功能里面去」）：claude-lite 自有节
     * 点，跟 panel-toggle 同款模式，随功能区折叠自动显隐；点击代理触发真
     * 实入口（见 findRemoteTrigger 注释）。B31：字体规格改为动态跟随宿主
     * panelRow 邻居（v1.0.1 固定 12px/600 与邻居不一致，用户指正），并补
     * remote 自家的显示器图标与兄弟行对齐。 */
    function syncRemoteRowStyle(row, nav) {
      var src = nav.querySelector('[class*="panelRow"]');
      if (src === null) return;
      if (row.__claudeLiteStyleSrc === src) return; /* 同一邻居且宿主未重渲染，不重复抄 */
      var cs = window.getComputedStyle(src);
      row.style.fontSize = cs.fontSize;
      row.style.fontWeight = cs.fontWeight;
      row.style.lineHeight = cs.lineHeight;
      row.style.color = cs.color;
      row.style.padding = cs.padding;
      row.style.height = cs.height;
      row.style.gap = cs.gap;
      row.style.borderRadius = cs.borderRadius;
      row.__claudeLiteStyleSrc = src;
    }
    function ensureRemotePanelRow() {
      var sb = document.querySelector('[data-slot="sidebar"]');
      if (sb === null) return;
      var nav = sb.querySelector('nav[class*="panelList"]');
      if (nav === null) return;
      var row = nav.querySelector("[" + ATTR + '~="remote-row"]');
      if (row === null) {
        var SVGNS = "http://www.w3.org/2000/svg";
        row = document.createElement("button");
        row.type = "button";
        row.setAttribute(ATTR, "remote-row");
        row.title = "DeepSeek Remote";
        var ic = document.createElementNS(SVGNS, "svg");
        ic.setAttribute("viewBox", "0 0 24 24");
        ic.setAttribute("fill", "none");
        ic.setAttribute("stroke", "currentColor");
        ic.setAttribute("stroke-width", "1.7");
        ic.setAttribute("stroke-linecap", "round");
        ic.setAttribute("stroke-linejoin", "round");
        ic.setAttribute("aria-hidden", "true");
        var rect = document.createElementNS(SVGNS, "rect");
        rect.setAttribute("x", "3"); rect.setAttribute("y", "4");
        rect.setAttribute("width", "18"); rect.setAttribute("height", "13");
        rect.setAttribute("rx", "2");
        var stand = document.createElementNS(SVGNS, "path");
        stand.setAttribute("d", "M8 21h8M12 17v4");
        ic.appendChild(rect); ic.appendChild(stand);
        ic.style.cssText = "width:16px;height:16px;flex:0 0 16px;";
        var label = document.createElement("span");
        label.textContent = "Remote";
        row.appendChild(ic); row.appendChild(label);
        row.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var btn = findRemoteTrigger();
          if (btn !== null) btn.click();
        });
        nav.appendChild(row);
      }
      syncRemoteRowStyle(row, nav);
    }

    /* ── delegated clicks ──────────────────────────────────────────
     * SINGLETON per document (B6: a remount must NOT stack another
     * listener — two listeners = double toggle = "can't re-open"). The
     * current mount publishes its bucket-click hook on globalThis, so the
     * singleton always calls the live closure. */

    function ensureAvatarMenuItems() {
      var menus = document.querySelectorAll('[role="menu"]');
      for (var i = 0; i < menus.length; i++) {
        var menu = menus[i];
        if (menu.getAttribute(ATTR) === "extended") continue;
        var text = menu.textContent || "";
        if (text.indexOf("退出登录") < 0) continue;
        if (menu.offsetParent === null && menu.getClientRects().length === 0) continue;
        menu.setAttribute(ATTR, "extended");
        var first = menu.firstElementChild;
        var mk = function (label, action) {
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute(ATTR, "menu-item");
          b.textContent = label;
          b.addEventListener("click", function (ev) {
            ev.stopPropagation();
            action();
          });
          return b;
        };
        var remoteItem = mk("DeepSeek Remote", function () {
          var btn = findRemoteTrigger();
          if (btn !== null) btn.click();
        });
        var usageItem = mk("使用统计", function () {
          var card = document.querySelector("[data-dsh-usage-foot-card]");
          if (card === null) return;
          var btn = card.querySelector("button");
          if (btn !== null) btn.click();
        });
        var settingsItem = mk("轻妆设置", function () {
          var sb = document.querySelector('[data-slot="sidebar"]');
          var brandRow = sb && sb.querySelector('[class*="logoRow"] [class*="brand"]');
          openSettingsOverlay(brandRow);
        });
        /* 原版细节：菜单项右侧带今日用量的实时数值（读隐藏速览卡的文本） */
        var usageCard = document.querySelector("[data-dsh-usage-foot-card]");
        if (usageCard !== null) {
          var mv = (usageCard.textContent || "").match(/[\d.]+\s*[KM]?\s*tokens/i);
          if (mv !== null) {
            var val = document.createElement("span");
            val.textContent = mv[0];
            val.style.cssText = "margin-left:auto;font-weight:600;font-size:12px;color:var(--dsw-alias-label-primary,#29261b)";
            usageItem.appendChild(val);
            usageItem.style.paddingRight = "12px";
          }
        }
        if (first !== null) { menu.insertBefore(usageItem, first); menu.insertBefore(remoteItem, first); menu.insertBefore(settingsItem, first); }
        else { menu.appendChild(settingsItem); menu.appendChild(remoteItem); menu.appendChild(usageItem); }
      }
    }

    /* body 级委托 = 「薄监听 + globalThis 活实例指针」（B6/B12 同款所有权模式）：
     * 监听器只含一行转发，真正的逻辑经 __claudeLiteDelegate 指到当前挂载实例——
     * 模块重载（⌘R）后旧监听器自动调到新逻辑；dispose 用每次挂载独立的
     * owner 身份判定，只有自己是发布者才拆监听（P2-B：所有权不能放在模块级
     * 变量上，A 挂载→B 挂载→A 卸载时会被 B 覆盖）。 */
    function handleBodyClick(ev) { var api = globalThis.__claudeLiteDelegate; if (api) api.click(ev); }
    function handleBodyContextmenu(ev) { var api = globalThis.__claudeLiteDelegate; if (api) api.contextmenu(ev); }
    function bodyClickLogic(ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var ed = document.querySelector("[" + ATTR + '~="brand-editor"]');
      if (ed !== null && ed.style.display !== "none" && !ed.contains(t)) {
        var brandRow = t.closest('[class*="logoRow"] [class*="brand"]');
        if (brandRow === null) ed.style.display = "none";
      }
      var header = t.closest(HEADER_SEL);
      if (header !== null) {
        if (globalThis.__claudeLiteBucketClick) globalThis.__claudeLiteBucketClick(header);
        return;
      }
      var toggle = t.closest("[" + ATTR + '~="panel-toggle"]');
      if (toggle !== null) {
        localStorage.setItem(PANEL_KEY, panelsCollapsed() ? "0" : "1");
        applyPanelState();
      }
    }
    function bodyContextmenuLogic(ev) {
      /* 右键品牌行 → 设置浮层（品牌行元素随宿主重渲染被替换，必须走 body 委托） */
      var t = ev.target;
      if (!t || !t.closest) return;
      var brandRow = t.closest('[class*="logoRow"] [class*="brand"]');
      if (brandRow === null) return;
      ev.preventDefault();
      openSettingsOverlay(brandRow);
    }
    function installClickDelegate(owner) {
      activeOwner = owner; /* 当前发布者：浮层重建时的所有权标记 */
      if (document.body.getAttribute(ATTR + "-delegate") !== "1") {
        document.body.setAttribute(ATTR + "-delegate", "1");
        document.body.addEventListener("click", handleBodyClick);
        document.body.addEventListener("contextmenu", handleBodyContextmenu);
        document.body.__claudeLiteListenerRefs = { click: handleBodyClick, contextmenu: handleBodyContextmenu };
      }
      globalThis.__claudeLiteDelegate = { owner: owner, click: bodyClickLogic, contextmenu: bodyContextmenuLogic };
    }
    function removeClickDelegate(owner) {
      var api = globalThis.__claudeLiteDelegate;
      if (!api || api.owner !== owner) return; /* 已被新挂载接管：不许拆 */
      globalThis.__claudeLiteDelegate = null;
      var refs = document.body.__claudeLiteListenerRefs;
      if (refs) {
        document.body.removeEventListener("click", refs.click);
        document.body.removeEventListener("contextmenu", refs.contextmenu);
        document.body.__claudeLiteListenerRefs = null;
      }
      document.body.removeAttribute(ATTR + "-delegate");
    }
    var activeOwner = null; /* 当前挂载的所有权凭证（installClickDelegate 刷新） */
    function removeInjectedMenuItems() {
      document.querySelectorAll('[role="menu"][' + ATTR + '="extended"]').forEach(function (menu) {
        menu.querySelectorAll("[" + ATTR + '~="menu-item"]').forEach(function (b) { b.remove(); });
        menu.removeAttribute(ATTR);
      });
    }

    /* ── model-row brand marks（原版 §2.7 机制的轻量移植）──────────
     * 宿主在模型名的三个显示位置都给外层元素带 data-model-id /
     * data-provider-id 属性（app.asar 实证）。按 model id 前缀认领品牌，
     * 把模型名里的品牌词换成厂商词标 SVG；词标素材由 host 半侧
     * /dsh-claude-lite/brand-marks/* 白名单路由提供（取自原版包
     * lobe-icons 词标，含 data-combine-word 与亮/暗双变体类）。 */
    var MARK_ROUTE = "/dsh-claude-lite/brand-marks/";
    var MODEL_BRANDS = [
      { id: "claude", word: "Claude", prefixes: ["claude"] },
      { id: "deepseek", word: "DeepSeek", prefixes: ["deepseek", "ds-"] },
      { id: "gemini", word: "Gemini", prefixes: ["gemini"] },
      { id: "openai", word: "GPT", prefixes: ["gpt"] },
      { id: "grok", word: "Grok", prefixes: ["grok"] },
      { id: "kimi", word: "Kimi", prefixes: ["kimi"] },
      { id: "minimax", word: "Minimax", prefixes: ["minimax"] },
      { id: "zai", word: "GLM", prefixes: ["glm"] }
    ];
    var markCache = {};
    var markAttempts = {};
    var markInflight = {};
    var markKick = null; /* effect 注入：素材到手后合并调度一次 tick */

    function prefetchMarks() {
      MODEL_BRANDS.forEach(function (b) {
        if (markCache[b.id] !== void 0 || markInflight[b.id]) return;
        if ((markAttempts[b.id] || 0) >= 3) return; /* 每品牌至多试 3 次，不做无限退避 */
        markAttempts[b.id] = (markAttempts[b.id] || 0) + 1;
        markInflight[b.id] = true;
        fetch(MARK_ROUTE + b.id + ".svg").then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        }).then(function (t) {
          markCache[b.id] = t;
          if (typeof markKick === "function") markKick();
        }).catch(function () {}).then(function () { markInflight[b.id] = false; });
      });
    }

    function brandForModel(mid) {
      var s = String(mid || "").toLowerCase();
      for (var i = 0; i < MODEL_BRANDS.length; i++) {
        var prefixes = MODEL_BRANDS[i].prefixes;
        for (var j = 0; j < prefixes.length; j++) {
          if (s.lastIndexOf(prefixes[j], 0) === 0) return MODEL_BRANDS[i];
        }
      }
      return null;
    }

    function firstTextNode(el) {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        var p = n.parentNode, own = false;
        while (p !== null && p !== el) {
          if (p.getAttribute) {
            var v = p.getAttribute(ATTR);
            if (v === "model-mark" || v === "model-mark-alt") { own = true; break; }
          }
          p = p.parentNode;
        }
        if (!own) return n;
      }
      return null;
    }

    /* 找 el 子树里第一个含品牌词、且不在自家词标/alt 内的文本节点——
     * alt 里存的就是品牌词，不排除会命中自己（自愈重拼错位的根因） */
    function wordNodeIn(el, lower) {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue) continue;
        var p = n.parentNode, own = false;
        while (p !== null && p !== el) {
          if (p.getAttribute) {
            var v = p.getAttribute(ATTR);
            if (v === "model-mark" || v === "model-mark-alt") { own = true; break; }
          }
          p = p.parentNode;
        }
        if (own) continue;
        if (n.nodeValue.toLowerCase().indexOf(lower) !== -1) return n;
      }
      return null;
    }

    function stripOwnNodes(el) {
      el.querySelectorAll("[" + ATTR + '~="model-mark"], [' + ATTR + '~="model-mark-alt"]').forEach(function (n) { n.remove(); });
    }

    /* 撤妆（可还原）：词标位置塞回「被替换的词 + 被剥掉的分隔符」；
     * 纯前插词标（prepend）原文里没有词，不回插；alt 只是读屏副本，直接删。
     * 与 stripOwnNodes 的区别：strip 会把被替换的词一起丢掉，仅限「文本即将
     * 全部重搜」的场景；一切撤妆走 restore，防止吞词。 */
    function restoreOwnNodes(el) {
      el.querySelectorAll("[" + ATTR + '~="model-mark"]').forEach(function (mark) {
        var seg = mark.dataset.word || "";
        var sep = mark.dataset.sep || "";
        var occ = parseInt(mark.dataset.occ || "1", 10) || 1;
        if (seg && !mark.dataset.prepend && mark.parentNode) {
          /* A2 还原：词标后的紧邻文本节点若仍是装饰时截短的 tail（结构没被
           * 宿主动过），原地补回品牌词——该文本节点始终是 React 管理的那个，
           * 换模后 React 写值照常生效，胶囊不会定格旧名。 */
          var tn = mark.nextSibling;
          if (tn !== null && tn.nodeType === 3 && mark.dataset.tail !== void 0 && tn.nodeValue === mark.dataset.tail) {
            tn.nodeValue = seg + sep + tn.nodeValue;
          } else {
            /* 兜底：结构被宿主动过时才按词频对账回插，且只限「模型没换」——
             * mid 已变说明词缺失是换模的正常结果，回插会把旧品牌词拼到新名
             * 前（旧方案定格旧名的帮凶之一） */
            var host = mark.closest("[data-model-id]");
            if (host !== null && host.getAttribute("data-model-id") === mark.dataset.mid) {
              var foreign = foreignText(el).toLowerCase();
              var cnt = 0, idx = 0, needle = seg.toLowerCase();
              while ((idx = foreign.indexOf(needle, idx)) !== -1) { cnt += 1; idx += needle.length; }
              if (cnt < occ) mark.parentNode.insertBefore(document.createTextNode(seg + sep), mark);
            }
          }
        }
        mark.remove();
      });
      el.querySelectorAll("[" + ATTR + '~="model-mark-alt"]').forEach(function (n) { n.remove(); });
    }

    /* 词标之外的文本（排除自家子树，空白归一）——装饰后记录快照，
     * 之后每轮 tick 比对：被宿主改写才重拼，名字里本就有第二个品牌词
     * 这类情况不会被视为回写（否则会反复吞词） */
    function foreignText(el) {
      var out = "";
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue) continue;
        var p = n.parentNode, own = false;
        while (p !== null && p !== el) {
          if (p.getAttribute) {
            var v = p.getAttribute(ATTR);
            if (v === "model-mark" || v === "model-mark-alt") { own = true; break; }
          }
          p = p.parentNode;
        }
        if (!own) out += n.nodeValue;
      }
      return out.replace(/\s+/g, " ").trim();
    }

    function decorateModelMarks() {
      /* 先对账：宿主删掉 data-model-id 的标签，其旧词标要在下一 tick 还原撤净 */
      var live = document.querySelectorAll("[" + ATTR + '~="model-mark"]');
      for (var k = 0; k < live.length; k++) {
        if (live[k].closest("[data-model-id]") === null && live[k].parentNode !== null) {
          restoreOwnNodes(live[k].parentNode);
        }
      }
      var labels = document.querySelectorAll("[data-model-id]");
      for (var i = 0; i < labels.length; i++) {
        var el = labels[i];
        var mid = el.getAttribute("data-model-id") || "";
        var b = brandForModel(mid);
        var existing = el.querySelector("[" + ATTR + '~="model-mark"]');
        if (b === null || markCache[b.id] === void 0) {
          /* 换成未认领的模型 / 素材未到手：还原撤妆（防换模残留），再试一轮拉取 */
          if (existing !== null || el.querySelector("[" + ATTR + '~="model-mark-alt"]') !== null) restoreOwnNodes(el);
          else if (b !== null) prefetchMarks();
          continue;
        }
        var lower = b.word.toLowerCase();
        existing = el.querySelector("[" + ATTR + '~="model-mark"]');
        if (existing === null) {
          /* 只有「词标不在」时 alt 才算孤儿（健康装饰恰有一个 alt，不能见 alt 就拆，
           * 否则每轮 tick 都会把好妆拆掉重拼——B13 实测根因） */
          if (el.querySelector("[" + ATTR + '~="model-mark-alt"]') !== null) restoreOwnNodes(el);
        }
        existing = el.querySelector("[" + ATTR + '~="model-mark"]');
        if (existing !== null) {
          /* 完整性校验：品牌/模型未换、外部文本与装饰时快照一致、alt 恰一个
           * ——三者都成立才维持现状；否则先还原再重拼（自愈不吞词） */
          var alts = el.querySelectorAll("[" + ATTR + '~="model-mark-alt"]');
          var stable = existing.dataset.mid === mid && existing.dataset.brand === b.id
            && alts.length === 1 && foreignText(el) === (existing.dataset.expect || "");
          if (stable) continue;
          restoreOwnNodes(el);
        }
        var tn = wordNodeIn(el, lower);
        var mark = document.createElement("span");
        mark.setAttribute(ATTR, "model-mark");
        mark.setAttribute("aria-hidden", "true");
        mark.className = "claude-lite-model-combine";
        mark.innerHTML = markCache[b.id];
        mark.dataset.mid = mid;
        mark.dataset.brand = b.id;
        if (tn !== null) {
          var text = tn.nodeValue;
          var wordLen = b.word.length;
          var at = text.toLowerCase().indexOf(lower);
          var head = text.slice(0, at);
          var raw = text.slice(at + wordLen);
          var sepMatch = raw.match(/^[\s\-–—]+/);
          var sep = sepMatch ? sepMatch[0] : "";
          var tail = raw.slice(sep.length);
          mark.dataset.word = text.slice(at, at + wordLen); /* 原样保留大小写，撤妆还原用 */
          mark.dataset.sep = sep;
          mark.dataset.occ = String(text.toLowerCase().split(lower).length - 1); /* 原文词频，还原对账用 */
          /* A2：不再 replaceChild 替换 React 管理的文本节点（旧方案换模后
           * React 把新名字写进已脱离文档的旧节点，胶囊定格旧模型名）。
           * 词标前插、原文本原地截短——tn 始终留在文档里，React 随时能写值。 */
          mark.dataset.tail = tail;
          tn.nodeValue = head ? head + tail : tail;
          tn.parentNode.insertBefore(mark, tn);
        } else {
          /* 名字里没有品牌词（如 ds-trae 这类渠道 id）：词标放在名字前面 */
          var tn0 = firstTextNode(el);
          if (tn0 === null) continue; /* 纯图标位/纯空白（无文字）不动 */
          mark.dataset.prepend = "1";
          tn0.parentNode.insertBefore(mark, tn0);
        }
        var alt = document.createElement("span");
        alt.setAttribute(ATTR, "model-mark-alt");
        alt.textContent = b.word; /* 只补品牌词：可见文本照常读屏，尾文不重复 */
        el.appendChild(alt);
        mark.dataset.expect = foreignText(el);
      }
    }

    function undecorateModelMarks() {
      document.querySelectorAll("[" + ATTR + '~="model-mark"]').forEach(function (mark) {
        if (mark.parentNode !== null) restoreOwnNodes(mark.parentNode);
      });
      document.querySelectorAll("[" + ATTR + '~="model-mark-alt"]').forEach(function (n) { n.remove(); });
    }

    /* ── wiring ──────────────────────────────────────────────────── */

    function resolveWS(ctx, scope) {
      try {
        var w = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null;
        if (w !== null && w !== void 0 && w.sessions !== void 0) return w;
      } catch (e) {}
      if (scope && scope.uiWorkspace && scope.uiWorkspace.sessions !== void 0) return scope.uiWorkspace;
      return null;
    }

    function apply(ctx) {
      if (typeof ctx.inject !== "function") return;
      ctx.inject(["uiWorkspace"], function (scope) {
        var ws = resolveWS(ctx, scope);
        scope.effect(function () {
          var delegateOwner = {}; /* 本挂载的独立所有权凭证 */
          var style = document.createElement("style");
          style.dataset.plugin = PACKAGE_NAME;
          style.textContent = STYLE;
          document.head.appendChild(style);
          installClickDelegate(delegateOwner);
          /* B11：hook 命名持有——dispose 只删自己的 hook（若重挂时序为
           * "新挂载→旧dispose"，无条件 delete 会把新 hook 误删，日期头
           * 点击从此持续静默） */
          var bucketClickHook = function (header) {
            var key = header.getAttribute(ATTR + "-bucket") || "today";
            if (collapsedBuckets[key]) delete collapsedBuckets[key];
            else collapsedBuckets[key] = true;
            var sb = document.querySelector('[data-slot="sidebar"]');
            var row = sb && sb.querySelector('[data-row-key^="session:"]');
            var list = row && row.closest('[class*="list"]');
            if (list !== null) regroup(list, currentById());
          };
          globalThis.__claudeLiteBucketClick = bucketClickHook;

          var list = null, pending = false, pendingTimer = null, disposed = false;
          function currentById() {
            try {
              var snap = ws !== null && ws.sessions !== void 0 && ws.sessions.list ? ws.sessions.list.getSnapshot() : null;
              return snap ? snap.byId : null;
            } catch (e) { return null; }
          }
          function schedule() {
            if (pending || disposed) return;
            pending = true;
            pendingTimer = setTimeout(function () { pending = false; tick(); }, 120);
          }
          markKick = schedule;
          prefetchMarks();
          function tick() {
            if (disposed) return; /* dispose 后丢弃排队回调，防止卸载后重新装饰 */
            decorateModelMarks(); /* 模型选择器在 composer 一侧，不依赖 sidebar 存在 */
            var sb = document.querySelector('[data-slot="sidebar"]');
            if (sb === null) return;
            ensureBrand();
            boldSectionLabel();
            ensurePanelToggle();
            ensureRemotePanelRow();
            applyFooterState();
            ensureAvatarMenuItems();
            var row = sb.querySelector('[data-row-key^="session:"], [data-row-key^="workspace:"]');
            var found = row === null ? null : row.closest('[class*="list"]');
            if (found !== null && found !== list) {
              if (list !== null) observer.disconnect();
              list = found;
              observer.observe(list, { childList: true, subtree: true });
            }
            if (list !== null) regroup(list, currentById());
          }
          var observer = new MutationObserver(schedule);
          /* The host may replace the whole sidebar subtree on re-render, so the
           * fallback observer anchors on body, which is never replaced. */
          var rootObserver = new MutationObserver(schedule);
          rootObserver.observe(document.body, { childList: true, subtree: true });
          tick();
          /* Settling: keep the first ~12s covered so headers land after the
           * boot-time re-renders (no group forcing — B2). */
          var settleTicks = 0;
          var settleTimer = setInterval(function () {
            tick();
            settleTicks += 1;
            if (settleTicks >= 8) clearInterval(settleTimer);
          }, 1500);

          return function dispose() {
            disposed = true;
            observer.disconnect();
            rootObserver.disconnect();
            clearInterval(settleTimer);
            if (pendingTimer !== null) { clearTimeout(pendingTimer); pendingTimer = null; }
            markKick = null;
            if (list !== null) {
              list.querySelectorAll(HEADER_SEL).forEach(function (h) { h.remove(); });
              list.querySelectorAll("[" + ATTR + '~="row-hidden"]').forEach(function (n) {
                if (n.getAttribute(ATTR) === "row-hidden") n.removeAttribute(ATTR);
              });
            }
            document.body.removeAttribute(BODY_FLAG);
            undoFooterState();
            undecorateModelMarks();
            removeInjectedMenuItems();
            removeClickDelegate(delegateOwner);
            var sb = document.querySelector('[data-slot="sidebar"]');
            var btn = sb && sb.querySelector("[" + ATTR + '~="panel-toggle"]');
            if (btn !== null) btn.remove();
            var ed = document.querySelector("[" + ATTR + '~="brand-editor"]');
            if (ed !== null && ed.__claudeLiteOwner === delegateOwner) ed.remove(); /* 只拆自己的浮层 */
            var nav = sb && sb.querySelector('nav[class*="panelList"]');
            if (nav !== null) {
              var rr = nav.querySelector("[" + ATTR + '~="remote-row"]');
              if (rr !== null) rr.remove();
              nav.style.display = "";
            }
            style.remove();
            try { if (globalThis.__claudeLiteBucketClick === bucketClickHook) delete globalThis.__claudeLiteBucketClick; } catch (e) {}
          };
        }, PACKAGE_NAME + ": sidebar upgrades");
      });
    }

    exports.name = PACKAGE_NAME;
    exports.apply = apply;
    return module.exports
  },
})
