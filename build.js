// Build a fully static, self-contained index.html from the saved page.
// - Strips every <script> so no JS can run or crash
// - Neutralizes every <a href> so clicks do nothing
// - Points assets at the local ./assets/ folder
// - Un-hides Elementor entrance-animation elements (elementor-invisible)
// Usage: node build.js

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "Billy247.htm");
const OUT = path.join(ROOT, "index.html");
const ASSET_SRC = path.join(ROOT, "Billy247_files");
const ASSET_DST = path.join(ROOT, "assets");

// ---------- 1. Prepare assets/ ----------
if (!fs.existsSync(ASSET_DST)) {
  fs.mkdirSync(ASSET_DST, { recursive: true });
}

const renameMap = {
  "frontend-lite(1).min.css": "elementor-pro-frontend-lite.min.css",
};

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, path.join(dst, f));
      continue;
    }
    if (f.endsWith(".download")) continue; // JS payloads - not needed, all scripts removed
    fs.copyFileSync(s, path.join(dst, renameMap[f] || f));
  }
}
if (fs.existsSync(ASSET_DST)) fs.rmSync(ASSET_DST, { recursive: true, force: true });
copyDir(ASSET_SRC, ASSET_DST);

// Font Awesome css files reference ../webfonts - keep fonts inside assets/webfonts instead
for (const f of ["all.min.css", "brands.min.css", "regular.min.css", "solid.min.css", "fontawesome.min.css", "v4-shims.min.css"]) {
  const p = path.join(ASSET_DST, f);
  if (fs.existsSync(p)) {
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").split("../webfonts/").join("./webfonts/"));
  }
}

// Rewrite remote billy247.com url() inside copied css files -> ./<basename> when the file exists locally
const localFiles = new Set(fs.readdirSync(ASSET_DST));
for (const f of fs.readdirSync(ASSET_DST)) {
  if (!f.endsWith(".css")) continue;
  const p = path.join(ASSET_DST, f);
  let css = fs.readFileSync(p, "utf8");
  css = css.replace(/url\((['"]?)https?:\/\/[^)"']*\/([^/)'"]+)\1\)/g, (m, q, base) =>
    localFiles.has(base) ? `url(${q}./${base}${q})` : m
  );
  fs.writeFileSync(p, css);
}
console.log("assets/ populated");

// ---------- 2. Transform HTML ----------
let html = fs.readFileSync(SRC, "utf8");

// Drop the "saved from url" comment and editor-only remote background-image rules
html = html.replace(/<!--\s*saved from url=[^>]*-->/i, "");
html = html.replace(/url\(https?:\/\/[^)]*templately[^)]*\)/gi, "none");

// Remove every <script> block (external + inline + json blobs)
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
html = html.replace(/<script\b[^>]*\/>/gi, "");

// Remove <link> tags pointing at missing local files (styles.css) or WP meta endpoints
html = html.replace(/<link\b[^>]*href=["'][^"']*styles\.css["'][^>]*>/gi, "");
html = html.replace(/<link\b[^>]*rel=["'](?:alternate|shortlink|EditURI|wlwmanifest|https:\/\/api\.w\.org\/)["'][^>]*>/gi, "");
html = html.replace(/<link\b[^>]*rel=["'](?:dns-prefetch|preconnect|preload|prefetch|pingback)["'][^>]*>/gi, "");
html = html.replace(/<meta\b[^>]*name=["']generator["'][^>]*>/gi, "");
// Remote canonical / favicon / tile-image tags -> drop (page already has a data: favicon)
html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
html = html.replace(/<link\b[^>]*rel=["'](?:icon|apple-touch-icon|mask-icon|shortcut icon)["'][^>]*href=["']https?:\/\/[^"']*["'][^>]*>/gi, "");
html = html.replace(/<meta\b[^>]*name=["']msapplication-TileImage["'][^>]*>/gi, "");

// Point local refs at ./assets/ and fix the renamed parenthesised file
html = html.split("Billy247_files/").join("assets/");
html = html.split("frontend-lite(1).min.css").join("elementor-pro-frontend-lite.min.css");
html = html.split("frontend-lite%281%29.min.css").join("elementor-pro-frontend-lite.min.css");

// Neutralize every <a href> - clicks do absolutely nothing.
// Exception: footer pages that exist on the original site stay real links.
const LIVE_LINKS = new Set([
  "https://billy247.com/contact-us/",
  "https://billy247.com/faqs/",
  "https://billy247.com/privacy-policy/",
]);
html = html.replace(/(<a\b[^>]*?\bhref=)["']([^"']*)["']/gi, (m, pre, url) =>
  LIVE_LINKS.has(url) || url.startsWith("https://walink.me/")
    ? `${pre}"${url}"`
    : `${pre}"javascript:void(0)"`
);
// Strip target=_blank etc. so dead links can't even open an empty tab,
// then re-add it to the few live external links so they open in a new tab.
html = html.replace(/(<a\b[^>]*?)\s+target=["'][^"']*["']/gi, "$1");
html = html.replace(/(<a\b(?=[^>]*href="https?:\/\/)(?![^>]*\btarget=)[^>]*?)>/gi, '$1 target="_blank" rel="noopener">');

// Drop the entrance-animation hidden state so nothing stays invisible without JS
html = html.replace(/\belementor-invisible\b/g, "");

// FAQ accordions: EAEL toggles .active via JS. Convert each item to a
// radio-input + <label> so expand/collapse works with zero scripts.
const accGroups = [];
const accRe = /<div class="eael-adv-accordion"[^>]*id="eael-adv-accordion-([a-z0-9]+)"/gi;
let am;
while ((am = accRe.exec(html))) accGroups.push({ id: am[1], pos: am.index });

let faqN = 0;
html = html.replace(
  /(<div class="eael-accordion-list">)\s*(<div\b(?=[^>]*elementor-tab-title)(?=[^>]*eael-accordion-header)[^>]*>)/g,
  (match, listOpen, headerOpen, offset) => {
    const gid = (accGroups.filter((g) => g.pos < offset).pop() || {}).id || "x";
    faqN++;
    const fid = `faq-${gid}-${faqN}`;
    // Two stacked hit-areas inside the header: the "open" one shows when closed,
    // the "close" one (which checks a dummy radio in the same group) shows when open.
    return `${listOpen}<input type="radio" class="faq-radio faq-on" name="faq-${gid}" id="${fid}"><input type="radio" class="faq-radio faq-off" name="faq-${gid}" id="${fid}-off">${headerOpen}<label class="faq-hit" for="${fid}"></label><label class="faq-hit faq-hit-close" for="${fid}-off"></label>`;
  }
);
console.log("faq items converted:", faqN);

// srcset variants were never downloaded - drop them so the local src= is always used
html = html.replace(/\s(?:data-)?srcset=["'][^"']*["']/gi, "");

// Remote url()/src on billy247.com -> local assets/<basename> when the file was downloaded
html = html.replace(/(src=|url\(\s*)["']?https?:\/\/[^"')\s]*\/([^/"')\s]+)["']?/gi, (m, prefix, base) =>
  localFiles.has(base) ? `${prefix}"assets/${base}"` : m
);

// ---------- 3. Static + responsive overrides ----------
const overrides = `
<link rel="icon" href="assets/badge.png" type="image/png">
<style id="static-overrides">
/* Ensure everything is visible with zero JS */
.elementor-invisible,[data-elementor-invisible]{visibility:visible!important;opacity:1!important;transform:none!important;animation:none!important}
.animated{animation:none!important}
/* Motion-effects transforms are scroll-driven JS; without JS they strand elements off-canvas - pin them at rest position */
.elementor-motion-effects-element{transform:none!important;transition:none!important}
/* FAQ accordion - pure CSS toggle via hidden radios + stacked labels (replaces EAEL .active JS) */
.faq-radio{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
.eael-adv-accordion .eael-accordion-list .eael-accordion-header{position:relative;cursor:pointer;-webkit-user-select:none;user-select:none}
.faq-hit{position:absolute;inset:0;z-index:5;cursor:pointer}
.faq-hit-close{display:none}
.faq-on:checked~.eael-accordion-header .faq-hit{display:none}
.faq-on:checked~.eael-accordion-header .faq-hit-close{display:block}
.faq-on:checked~.eael-accordion-header{background-color:transparent!important;background-image:linear-gradient(135deg,#9E2309 0%,#EB2800 100%)!important;color:#fff!important}
.faq-on:checked~.eael-accordion-header .eael-accordion-tab-title,
.faq-on:checked~.eael-accordion-header .fa-accordion-icon,
.faq-on:checked~.eael-accordion-header .fa-toggle{color:#fff!important;fill:#fff!important}
.faq-on:checked~.eael-accordion-header .eael-advanced-accordion-icon-closed{display:none!important}
.faq-on:checked~.eael-accordion-header .eael-advanced-accordion-icon-opened{display:block!important}
.faq-on:checked~.eael-accordion-header .fa-toggle{-webkit-transform:rotate(90deg);transform:rotate(90deg)}
.faq-on:checked~.eael-accordion-content{display:block!important}
/* Responsiveness safety net */
img,video,iframe{max-width:100%;height:auto}
html,body{overflow-x:hidden}
a[href="javascript:void(0)"]{cursor:pointer}
@media (max-width:767px){
  .elementor-section{min-height:0!important}
  .elementor-column{min-width:0}
  h1,h2,h3{word-break:break-word}
}
</style>
</head>`;
html = html.replace(/<\/head>/i, overrides);

fs.writeFileSync(OUT, html, "utf8");

// ---------- 4. Report ----------
const leftoverScripts = (html.match(/<script/gi) || []).length;
const remoteRefs = (html.match(/(?:src|href)=["']https?:\/\/[^"']*["']/gi) || []);
console.log("index.html written:", (html.length / 1024).toFixed(1) + "KB");
console.log("remaining <script> tags:", leftoverScripts);
console.log("remaining remote src/href:", remoteRefs.length);
remoteRefs.slice(0, 20).forEach((r) => console.log("  -", r.slice(0, 110)));
