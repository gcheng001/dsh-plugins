// dsh-claude-lite (轻妆) host half —
//   /fonts/*            the Claude-look fonts (client half declares @font-face;
//                       the distributed package ships OFL fonts only — Anthropic
//                       typefaces are NOT publicly licensed for distribution and
//                       are only present in personal local installs)
//   /brand-icon         the user-chosen sidebar brand icon (local image path,
//                       strict extension whitelist + 2MB cap)
//   /brand-marks/*      the 8 vendored vendor wordmarks for model-row brand marks
//   /title-config       GET/POST the category-emoji set of the title module
//                       (validated in lib/host/title/core.js, persisted in
//                       plugin-data, applied in-process via setCategories)
//   skin install        on activate, copy skins/claude-lite/ into the harness
//                       skins dir (idempotent, version-gated) so the skin
//                       center lists it; the user applies it there once.
//   title curator       the merged session-title module (lib/title/*), enabled
//                       via config.titleCurator.enabled (default true).
// localhost single-user service; zero dependencies; assets are local copies
// already present on this machine.
import { join, dirname, resolve, extname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { CATEGORY_SLOTS, LEGACY_EMOJI_KEYS, categoriesCustomized, getCategories, migrateLegacyEmojis, setCategories, validateCategoryList } from "./title/core.js";
import { apply as titleApply, titleDataDir } from "./title/index.js";

var name = "dsh-claude-lite";
var FONTS = {
  "JetBrainsMonoVariable.ttf": "font/ttf",
  "JetBrainsMonoItalicVariable.ttf": "font/ttf",
  "AnthropicSansWebText.ttf": "font/ttf",
  "AnthropicSerifWebText.ttf": "font/ttf",
  "AnthropicMonoWeb.ttf": "font/ttf",
  "InterVariable.woff2": "font/woff2",
  "NotoSerifVariable.woff2": "font/woff2"
};
var ICON_MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml"
};
/* model-row brand marks（取自 dsh-claude-style 包的 lobe-icons 词标，见拆解报告 §2.7） */
var MARKS = {
  "claude.svg": "image/svg+xml",
  "deepseek.svg": "image/svg+xml",
  "gemini.svg": "image/svg+xml",
  "openai.svg": "image/svg+xml",
  "grok.svg": "image/svg+xml",
  "kimi.svg": "image/svg+xml",
  "minimax.svg": "image/svg+xml",
  "zai.svg": "image/svg+xml"
};
var ICON_MAX_BYTES = 2 * 1024 * 1024;
var POST_BODY_MAX_BYTES = 4096;
var SKIN_ID = "claude-lite";
var SKIN_FILES = ["skin.json", "skin.css"];

function harnessHome() {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), ".dsh");
}

/* Same precedence the skin center itself uses for the user skins dir. */
function userSkinsDir() {
  if (process.env.DSH_SKINS_HOME && process.env.DSH_SKINS_HOME.trim() !== "") return resolve(process.env.DSH_SKINS_HOME);
  if (process.env.DSH_SKINS_DIR && process.env.DSH_SKINS_DIR.trim() !== "") return resolve(process.env.DSH_SKINS_DIR);
  return join(harnessHome(), "skins");
}

function pluginRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function brandIconResponse(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }
  const raw = new URL(req.url || "/", "http://localhost").searchParams.get("p") || "";
  const p = String(raw).trim();
  const type = ICON_MIME[extname(p).toLowerCase()];
  if (p.length === 0 || p.includes("\0") || type === void 0 || !p.startsWith("/")) {
    res.writeHead(400);
    res.end();
    return;
  }
  const abs = resolve(p);
  if (abs.split("/").includes("..") || !existsSync(abs)) {
    res.writeHead(404);
    res.end();
    return;
  }
  let size = 0;
  try { size = statSync(abs).size; } catch { res.writeHead(404); res.end(); return; }
  if (size > ICON_MAX_BYTES) {
    res.writeHead(413);
    res.end();
    return;
  }
  const body = readFileSync(abs);
  res.writeHead(200, {
    "content-type": type,
    "content-length": String(body.byteLength),
    "cache-control": "no-cache"
  });
  res.end(req.method === "HEAD" ? void 0 : body);
}

/**
 * Copy the bundled skin into the harness skins dir so the skin center lists
 * it. Idempotent: skipped when the installed manifest already carries this
 * package's version. Never touches other files in the destination.
 */
function ensureSkinInstalled(ctx) {
  try {
    const srcDir = join(pluginRoot(), "skins", SKIN_ID);
    const srcManifestPath = join(srcDir, "skin.json");
    if (!existsSync(srcManifestPath)) {
      ctx.logger?.warn?.("dsh-claude-lite: bundled skin manifest missing, skipped install");
      return;
    }
    const manifest = JSON.parse(readFileSync(srcManifestPath, "utf8"));
    const destDir = join(userSkinsDir(), SKIN_ID);
    let current = null;
    try { current = JSON.parse(readFileSync(join(destDir, "skin.json"), "utf8")); } catch {}
    // Version gate AND self-heal: a partially installed dir (manifest present,
    // stylesheet lost) must be repaired even at the same version.
    const complete = current && current.version === manifest.version
      && SKIN_FILES.every((file) => existsSync(join(destDir, file)));
    if (complete) return;
    mkdirSync(destDir, { recursive: true });
    // Copy the manifest LAST: its presence marks a complete install.
    for (const file of SKIN_FILES.slice().reverse()) {
      const src = join(srcDir, file);
      if (existsSync(src)) copyFileSync(src, join(destDir, file));
    }
    ctx.logger?.info?.("dsh-claude-lite: skin " + SKIN_ID + " " + (current ? "updated to " + manifest.version : "installed (" + manifest.version + ")") + " at " + destDir);
  } catch (error) {
    ctx.logger?.warn?.("dsh-claude-lite: skin install failed: " + String(error?.message ?? error));
  }
}

/**
 * One-time, non-destructive migration: the standalone dsh-title-curator kept
 * its sidecar in plugin-data/dsh-title-curator; copy it into this plugin's
 * data dir so locks/fingerprints/audit survive the merge. Skipped when the
 * state already exists or a custom data dir (DSH_TITLE_CURATOR_DATA) is set
 * — that location is still honored directly.
 */
function migrateLegacyTitleState(ctx) {
  try {
    if (process.env.DSH_TITLE_CURATOR_DATA) return;
    const legacyDir = join(harnessHome(), "plugin-data", "dsh-title-curator");
    if (!existsSync(join(legacyDir, "state.json"))) return;
    const newDir = titleDataDir();
    if (existsSync(join(newDir, "state.json"))) return;
    mkdirSync(newDir, { recursive: true });
    copyFileSync(join(legacyDir, "state.json"), join(newDir, "state.json"));
    if (existsSync(join(legacyDir, "audit.jsonl"))) copyFileSync(join(legacyDir, "audit.jsonl"), join(newDir, "audit.jsonl"));
    ctx.logger?.info?.("dsh-claude-lite: migrated title-curator state from " + legacyDir);
  } catch (error) {
    ctx.logger?.warn?.("dsh-claude-lite: title state migration failed: " + String(error?.message ?? error));
  }
}

function categoriesFilePath() {
  return join(titleDataDir(), "categories.json");
}

/* CAS 修订号：GET 下发、POST 带回比对——客户端 abort 挡不住服务端已收到的
 * 旧 POST，真正的晚到覆盖只能在服务端拒绝（终审⑥）。 */
var categoryWriteRevision = 0;

function loadCategoriesFromFile(ctx) {
  try {
    const path = categoriesFilePath();
    if (!existsSync(path)) return;
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw && typeof raw.revision === "number") categoryWriteRevision = raw.revision;
    if (raw && Array.isArray(raw.emojis)) {
      /* v1 (≤1.0.5) stored 8 emojis index-aligned with the legacy slot order;
       * remap onto the current 12-slot table by key (carried slots keep the
       * user's emoji, slots that did not exist yet take their defaults). The
       * file itself is left untouched — migration is in-memory and idempotent,
       * and the next explicit save persists the 12-slot form (version 2). */
      const emojis = raw.version === 1 && raw.emojis.length === LEGACY_EMOJI_KEYS.length
        ? migrateLegacyEmojis(raw.emojis)
        : raw.emojis;
      const result = setCategories(emojis);
      if (!result.ok) ctx.logger?.warn?.("dsh-claude-lite: saved category set invalid (" + result.reason + "), using defaults");
      else if (emojis !== raw.emojis) ctx.logger?.info?.("dsh-claude-lite: migrated v1 category set to " + CATEGORY_SLOTS.length + " slots");
    }
  } catch (error) {
    ctx.logger?.warn?.("dsh-claude-lite: category config unreadable, using defaults: " + String(error?.message ?? error));
  }
}

function saveCategoriesFile(emojis, revision) {
  mkdirSync(titleDataDir(), { recursive: true });
  const path = categoriesFilePath();
  const tmp = path + "." + process.pid + ".tmp";
  writeFileSync(tmp, JSON.stringify({ version: 2, emojis, revision }, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

/** Read a request body with a hard cap; cb(null) on overflow/error. Drains
 * (instead of destroying) on overflow so the 413 response still gets out. */
function readBody(req, cap, cb) {
  let size = 0;
  let overflow = false;
  const chunks = [];
  let done = false;
  const finish = (value) => { if (!done) { done = true; cb(value); } };
  req.on("data", (chunk) => {
    if (overflow) return;
    size += chunk.length;
    if (size > cap) { overflow = true; chunks.length = 0; req.resume(); return; }
    chunks.push(chunk);
  });
  req.on("end", () => finish(overflow ? null : Buffer.concat(chunks).toString("utf8")));
  req.on("error", () => finish(null));
}

/** Mutating config endpoints are reachable from any local process and from
 * web pages via cross-site POSTs: require an exact application/json media
 * type and reject cross-origin requests (full origin comparison — scheme
 * included — against this request's own socket scheme + Host). */
function titleConfigGuard(req, res) {
  const origin = req.headers?.origin;
  if (origin) {
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      const scheme = req.socket?.encrypted ? "https:" : "http:";
      sameOrigin = parsed.protocol === scheme && parsed.host === req.headers?.host;
    } catch {}
    if (!sameOrigin) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "cross-origin request rejected" }));
      return false;
    }
  }
  const mediaType = String(req.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    res.writeHead(415, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "content-type must be application/json" }));
    return false;
  }
  return true;
}

function titleConfigResponse(titleEnabled) {
  return JSON.stringify({
    enabled: titleEnabled,
    customized: categoriesCustomized(),
    revision: categoryWriteRevision,
    slots: CATEGORY_SLOTS.map((slot) => ({ key: slot.key, text: slot.text })),
    emojis: getCategories()
  });
}

function handleTitleConfigPost(req, res) {
  if (!titleConfigGuard(req, res)) return;
  readBody(req, POST_BODY_MAX_BYTES, (text) => {
    if (text === null) { res.writeHead(413); res.end(); return; }
    let payload;
    try { payload = JSON.parse(text); } catch {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "请求体不是合法 JSON" }));
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "请求体必须是 JSON 对象" }));
      return;
    }
    // CAS: a client writing from an older read than the last applied write
    // is stale — reject instead of letting it clobber (409 with current rev).
    if (typeof payload.revision === "number" && payload.revision !== categoryWriteRevision) {
      res.writeHead(409, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "配置已被其他窗口修改，已为你刷新，请重新编辑", revision: categoryWriteRevision }));
      return;
    }
    if (payload && payload.reset === true) {
      // Reset persists the DEFAULTS (not an unlink): the file is the carrier
      // of the CAS revision — deleting it would silently rewind the revision
      // on restart and break stale-writer detection.
      const nextRevision = categoryWriteRevision + 1;
      try { saveCategoriesFile(CATEGORY_SLOTS.map((slot) => slot.emoji), nextRevision); } catch (error) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "重置失败：" + String(error?.message ?? error) }));
        return;
      }
      categoryWriteRevision = nextRevision;
      setCategories(CATEGORY_SLOTS.map((slot) => slot.emoji));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, emojis: getCategories(), revision: categoryWriteRevision }));
      return;
    }
    const checked = validateCategoryList(payload && payload.emojis);
    if (!checked.ok) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: checked.reason }));
      return;
    }
    // Persist first, then flip the in-memory set: a failed write must not
    // leave memory and disk describing different category sets.
    const nextRevision = categoryWriteRevision + 1;
    try { saveCategoriesFile(checked.emojis, nextRevision); } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "保存失败：" + String(error?.message ?? error) }));
      return;
    }
    categoryWriteRevision = nextRevision;
    setCategories(checked.emojis);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, emojis: getCategories(), revision: categoryWriteRevision }));
  });
}

function registerRoutes(ctx, titleEnabled) {
  if (typeof ctx.inject !== "function") return;
  ctx.inject(["webServer"], (scope) => {
    scope.effect(() => {
      const server = scope.webServer;
      if (server === void 0 || server === null) {
        ctx.logger?.warn?.("dsh-claude-lite: no webServer service; static routes not registered");
        return () => {};
      }
      const fontsRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");
      const marksRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "brand-marks");
      const disposers = [];
      const staticRoute = (path, root, table, slicePrefix) => {
        const dispose = server.register({
          kind: "prefix",
          path,
          handler: (req, res) => {
            if (req.method !== "GET" && req.method !== "HEAD") {
              res.writeHead(405, { allow: "GET, HEAD" });
              res.end();
              return;
            }
            const reqName = String(req.url || "/").slice(slicePrefix.length).split("?")[0];
            const type = Object.hasOwn(table, reqName) ? table[reqName] : void 0;
            const filePath = type !== void 0 ? join(root, reqName) : null;
            if (type === void 0 || filePath === null || !existsSync(filePath)) {
              res.writeHead(404);
              res.end();
              return;
            }
            const body = readFileSync(filePath);
            res.writeHead(200, {
              "content-type": type,
              "content-length": String(body.byteLength),
              "cache-control": "public, max-age=31536000, immutable"
            });
            res.end(req.method === "HEAD" ? void 0 : body);
          }
        });
        if (typeof dispose === "function") disposers.push(dispose);
      };
      try {
        staticRoute("/dsh-claude-lite/fonts", fontsRoot, FONTS, "/dsh-claude-lite/fonts/");
      } catch (error) {
        ctx.logger?.warn?.("dsh-claude-lite: fonts route unavailable: " + String(error?.message ?? error));
      }
      try {
        const dispose = server.register({
          kind: "prefix",
          path: "/dsh-claude-lite/brand-icon",
          handler: brandIconResponse
        });
        if (typeof dispose === "function") disposers.push(dispose);
      } catch (error) {
        ctx.logger?.warn?.("dsh-claude-lite: brand-icon route unavailable: " + String(error?.message ?? error));
      }
      try {
        staticRoute("/dsh-claude-lite/brand-marks", marksRoot, MARKS, "/dsh-claude-lite/brand-marks/");
      } catch (error) {
        ctx.logger?.warn?.("dsh-claude-lite: brand-marks route unavailable: " + String(error?.message ?? error));
      }
      try {
        const dispose = server.register({
          kind: "prefix",
          path: "/dsh-claude-lite/title-config",
          handler: (req, res) => {
            if (req.method === "GET" || req.method === "HEAD") {
              const body = titleConfigResponse(titleEnabled);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
              res.end(req.method === "HEAD" ? void 0 : body);
              return;
            }
            if (req.method !== "POST") {
              res.writeHead(405, { allow: "GET, HEAD, POST" });
              res.end();
              return;
            }
            handleTitleConfigPost(req, res);
          }
        });
        if (typeof dispose === "function") disposers.push(dispose);
      } catch (error) {
        ctx.logger?.warn?.("dsh-claude-lite: title-config route unavailable: " + String(error?.message ?? error));
      }
      return () => {
        for (const dispose of disposers) {
          try { dispose(); } catch (e) {}
        }
      };
    }, "dsh-claude-lite: static routes");
  });
}

/** Start the merged title module once its services are available. */
function startTitleCurator(ctx, section, enabled) {
  if (!enabled) {
    ctx.logger?.info?.("dsh-claude-lite: title curator disabled (config.titleCurator.enabled=false)");
    return;
  }
  if (typeof ctx.inject !== "function") return;
  ctx.inject(["sessionTitle", "sessions", "llm"], (scope) => {
    try {
      /* The inject scope exposes the services as properties and carries the
       * full context API (on/effect) — verified against the bundled Cordis
       * 4.0.2. Passing the scope directly also ties the module's lifetime to
       * these services (a service reload disposes the old instance). */
      titleApply(scope, section);
    } catch (error) {
      ctx.logger?.warn?.("dsh-claude-lite: title curator failed to start: " + String(error?.message ?? error));
    }
  });
}

function apply(ctx, config) {
  ensureSkinInstalled(ctx);
  migrateLegacyTitleState(ctx);
  loadCategoriesFromFile(ctx);
  const section = config && typeof config === "object" && config.titleCurator && typeof config.titleCurator === "object"
    ? config.titleCurator
    : undefined;
  const enabled = !(section && section.enabled === false);
  registerRoutes(ctx, enabled);
  startTitleCurator(ctx, section, enabled);
}

export { apply, name };
