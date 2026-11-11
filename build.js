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
  "Untitled-design4.gif": "billy247-logo.gif",
  "image-1.png": "billyexch9-logo.png",
  "logo-2-1.png": "billy777-logo.png",
  "download.png": "skyexch-logo.png",
  "300kb.gif": "whatsapp-cta.gif",
  "Screenshot-2023-08-16-180705.png": "money-guarantee.png",
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
// Remote favicon / tile-image tags -> drop (page already has a data: favicon).
// Canonical is kept - it points at the original site.
html = html.replace(/<link\b[^>]*rel=["'](?:icon|apple-touch-icon|mask-icon|shortcut icon)["'][^>]*href=["']https?:\/\/[^"']*["'][^>]*>/gi, "");
html = html.replace(/<meta\b[^>]*name=["']msapplication-TileImage["'][^>]*>/gi, "");

// lang -> en-IN; modern charset meta
html = html.split('lang="en-US"').join('lang="en-IN"');
html = html.replace(/<meta\b[^>]*http-equiv=["']Content-Type["'][^>]*>/gi, '<meta charset="UTF-8">');

// Point local refs at ./assets/ and fix the renamed parenthesised file
html = html.split("Billy247_files/").join("assets/");
html = html.split("frontend-lite(1).min.css").join("elementor-pro-frontend-lite.min.css");
html = html.split("frontend-lite%281%29.min.css").join("elementor-pro-frontend-lite.min.css");

// ---------- Link policy ----------
// 1. Strip every target/rel attr first - we re-add precisely per link class.
html = html.replace(/(<a\b[^>]*?)\s+(?:target|rel)=["'][^"']*["']/gi, "$1");

// 2. Classify by ORIGINAL href:
//    walink.me            -> live CTA (WhatsApp)  -> _blank + nofollow sponsored noopener
//    billy247.com         -> live, same tab (logo, footer pages, menu, in-text)
//    exchange domains     -> live tile URLs       -> _blank + noopener
//    billy247.com/#content -> local #content skip link
//    anything else        -> href removed (inert anchor, keeps styling)
const EXCH = "(?:www\\.)?(?:taj777|billyexch9|billy777|d247|diamondexch|lordsexch|tenexch|skyexch|world7)\\.";
html = html.replace(/<a\b([^>]*?)\bhref=["']([^"']*)["']/gi, (m, attrs, url) => {
  if (/^https:\/\/walink\.me\//.test(url)) return `<a${attrs}href="${url}"`;
  if (url === "https://billy247.com/#content") return `<a${attrs}href="#content"`;
  if (/^https:\/\/billy247\.com\//.test(url)) return `<a${attrs}href="${url}"`;
  if (new RegExp("^https?://" + EXCH).test(url)) return `<a${attrs}href="${url}"`;
  if (url.startsWith("#")) return `<a${attrs}href="${url}"`;
  return `<a${attrs}`;
});

// 3. Re-attach target/rel per class.
html = html.replace(/(<a\b(?=[^>]*href="https:\/\/walink\.me\/)[^>]*?)>/g,
  '$1 target="_blank" rel="nofollow sponsored noopener">');
html = html.replace(new RegExp("(<a\\b(?=[^>]*href=\"https?://" + EXCH + ")[^>]*?)>", "g"),
  '$1 target="_blank" rel="noopener">');

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

// ---------- Heading structure ----------
// Merge "3% Bonus ON YOUR" + "Every DEPOSIT" into one normal-text line (not a heading)
html = html.replace(
  /<h2 class="elementor-heading-title elementor-size-default">3% Bonus ON YOUR<\/h2>/,
  '<p class="elementor-heading-title elementor-size-default">3% Bonus ON YOUR <span style="color:#EB2800">Every DEPOSIT</span></p>'
);
html = html.replace(
  /<h2 class="elementor-heading-title elementor-size-default">Every DEPOSIT<\/h2>/,
  ""
);
// Premium-site tile names, winner names, section taglines -> normal text, not H2
html = html.replace(
  /<h2 class="elementor-heading-title elementor-size-default">(<a [^>]*>[^<]*<\/a>)<\/h2>/g,
  '<p class="elementor-heading-title elementor-size-default">$1</p>'
);
html = html.replace(
  /<h2 class="elementor-heading-title elementor-size-default">(\d(?:st|nd|rd|th)\. [^<]*)<\/h2>/g,
  '<p class="elementor-heading-title elementor-size-default">$1</p>'
);
for (const t of [
  "Trusted by 20+ Celebrities",
  "24/7 customer support",
  "We help with your concerns and we offer guidance.",
  "100% Money Guarantee",
  "Protected connection and encrypted data",
]) {
  html = html.replace(
    `<h2 class="elementor-heading-title elementor-size-default">${t}</h2>`,
    `<p class="elementor-heading-title elementor-size-default">${t}</p>`
  );
}

// ---------- Un-hide the "Why Choose Billy247" section ----------
// Remove device-hide classes ONLY from elements hidden on all three viewports.
html = html.replace(/class="([^"]*)"/g, (m, cls) =>
  /elementor-hidden-desktop/.test(cls) &&
  /elementor-hidden-tablet/.test(cls) &&
  /elementor-hidden-mobile/.test(cls)
    ? `class="${cls
        .replace(/\belementor-hidden-desktop\b/g, "")
        .replace(/\belementor-hidden-tablet\b/g, "")
        .replace(/\belementor-hidden-mobile\b/g, "")
        .replace(/\s{2,}/g, " ")}"`
    : m
);

// ---------- Invalid HTML cleanup ----------
// <title>Custom Ticker</title> inside body (from ticker widgets)
html = html.split("<title>Custom Ticker</title>").join("");
// Empty <p></p> inside FAQ accordion content
html = html.split("<p></p>").join("");
// Same markup for every FAQ title: <span>, not mixed <p>/<span>
html = html.replace(/<p class="eael-accordion-tab-title">([\s\S]*?)<\/p>/g,
  '<span class="eael-accordion-tab-title">$1</span>');

// ---------- Asset renames (generic filenames -> descriptive) ----------
for (const [oldN, newN] of Object.entries(renameMap)) {
  if (oldN === newN) continue;
  html = html.split(`./assets/${oldN}`).join(`./assets/${newN}`);
  html = html.split(`"assets/${oldN}`).join(`"assets/${newN}`);
}

// ---------- Image alt text ----------
const ALTS = {
  "billy247-logo.gif": "Billy247 logo",
  "Tajj.png": "TAJ777 exchange logo",
  "billyexch9-logo.png": "Billyexch9 exchange logo",
  "billy777-logo.png": "Billy777 exchange logo",
  "D247.png": "D247 exchange logo",
  "DiamondExch.png": "DiamondExch exchange logo",
  "lord-Exch.png": "Lords Exch exchange logo",
  "TenExch.png": "Ten Exch exchange logo",
  "skyexch-logo.png": "SkyExch exchange logo",
  "World.png": "World7 exchange logo",
  "whatsapp-cta.gif": "Get an ID instantly on WhatsApp",
  "776fd9cbfc017d83b409fc2781bebb15-removebg-preview.png": "Bohemia - Billy247 brand ambassador",
  "Object-06-1021x1024.png": "Billy247 casino games",
  "money-guarantee.png": "100% Money Guarantee badge",
  "1676192983_bronk-club-p-pozdravlenie-s-viigrishem-pinterest-12_prev_ui-removebg-preview-1.png": "Billy247 weekly winner",
  "bonus.png": "3% deposit bonus icon",
  "24-hours.png": "24/7 customer service icon",
  "collaboration.png": "referral bonus icon",
  "live.png": "live stream icon",
  "online-game.png": "live games icon",
  "database.png": "enhanced design icon",
  "shield-1.png": "safe and secure icon",
  "badge.png": "easy payment icon",
  "live-1.png": "live streaming icon",
  "customer-service-1.png": "customer support icon",
};
for (const [file, alt] of Object.entries(ALTS)) {
  const re = new RegExp(`(<img\\b[^>]*src="\\./assets/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*?\\balt=")[^"]*"`, "g");
  html = html.replace(re, `$1${alt}"`);
}

// srcset variants were never downloaded - drop them so the local src= is always used
html = html.replace(/\s(?:data-)?srcset=["'][^"']*["']/gi, "");

// Remote url()/src on billy247.com -> local assets/<basename> when the file was downloaded
html = html.replace(/(src=|url\(\s*)["']?https?:\/\/[^"')\s]*\/([^/"')\s]+)["']?/gi, (m, prefix, base) =>
  localFiles.has(base) ? `${prefix}"assets/${base}"` : m
);

// ---------- 3. SEO ----------
html = html.replace(
  "<title>Billy247</title>",
  "<title>Billy247 \u2013 Online Cricket &amp; Casino ID Provider in India</title>"
);
// First visible heading becomes the single H1; the ambassador line stays as
// styled normal text (H2 is reserved for main sections; "BOhemia" typo fixed)
html = html.replace(
  '<h2 class="elementor-heading-title elementor-size-default">BOhemia Official brand ambassador</h2>',
  '<h1 class="elementor-heading-title elementor-size-default">Billy247 \u2013 Online Cricket &amp; Casino ID Provider in India</h1>\n\t\t\t\t\t<p class="elementor-heading-title elementor-size-default" style="font-size:20px;line-height:1.3">Bohemia Official Brand Ambassador</p>'
);

// ---------- 4. Static + responsive overrides ----------
const overrides = `
<meta name="google-site-verification" content="nYK3pl-lI61C0PloGsKs59HowB8OR6PFG01hEnw3E6I" />
<meta name="description" content="Get your Billy247 ID on WhatsApp. Cricket, live casino, instant deposits and fast withdrawals. 24/7 support. 18+ only.">
<link rel="icon" href="assets/billy247-logo.gif" type="image/gif">
<meta property="og:type" content="website">
<meta property="og:title" content="Billy247 – Online Cricket & Casino ID Provider in India">
<meta property="og:description" content="Get your Billy247 ID on WhatsApp. Cricket, live casino, instant deposits and fast withdrawals. 24/7 support. 18+ only.">
<meta property="og:url" content="https://billy247.com/">
<meta property="og:image" content="https://www.billy247.shop/assets/banner-1.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Billy247 – Online Cricket & Casino ID Provider in India">
<meta name="twitter:description" content="Get your Billy247 ID on WhatsApp. Cricket, live casino, instant deposits and fast withdrawals. 24/7 support. 18+ only.">
<meta name="twitter:image" content="https://www.billy247.shop/assets/banner-1.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Billy247","url":"https://www.billy247.shop/","logo":"https://www.billy247.shop/assets/billy247-logo.gif","contactPoint":{"@type":"ContactPoint","contactType":"customer support","url":"https://walink.me/billy247","availableLanguage":["en","hi"]}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Billy247","alternateName":"Billy247 - Online Cricket & Casino ID Provider","url":"https://www.billy247.shop/"}</script>
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
