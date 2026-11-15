/* Language system. Screens are written in English; this module translates what is shown, using a phrase
   dictionary per language (js/lang-*.js). Add a new language by adding a file that calls I18N.register("xx", {...}, [[/regex/, fn]]). */
window.I18N = (function () {
  const dicts = {}, pats = {}, names = { en: "English" };
  let lang = "en";
  try { lang = localStorage.getItem("lo-lang") || "en"; } catch (e) {}
  function register(code, name, dict, patterns) { dicts[code] = dict; pats[code] = patterns || []; names[code] = name; }
  function T(s) {
    if (lang === "en") return s;
    const d = dicts[lang]; if (!d) return s;
    const k = s.replace(/\s+/g, " ").trim(); if (!k) return s;
    if (d[k] !== undefined) return s.replace(k, d[k]);
    for (const [re, fn] of pats[lang] || []) { const m = k.match(re); if (m) return s.replace(k, fn(m, T)); }
    return s;
  }
  const ATTRS = ["aria-label", "title", "placeholder", "alt"];
  function walk(root) {
    if (lang === "en" || !root) return;
    if (root.nodeType === 3) { const t = T(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|CANVAS)$/.test(root.tagName)) return;
    ATTRS.forEach(a => { if (root.hasAttribute && root.hasAttribute(a)) { const v = root.getAttribute(a), t = T(v); if (t !== v) root.setAttribute(a, t); } });
    if (root.tagName === "INPUT" && root.placeholder === "CODE") root.placeholder = T("CODE");
    root.childNodes.forEach(walk);
  }
  let queued = new Set(), raf = 0;
  function flush() { raf = 0; const q = queued; queued = new Set(); q.forEach(n => { if (n.isConnected !== false) walk(n); }); }
  function start() {
    document.documentElement.lang = lang;
    if (lang === "en") return;
    walk(document.body);
    new MutationObserver(ms => { ms.forEach(m => { if (m.type === "characterData") queued.add(m.target); else m.addedNodes.forEach(n => queued.add(n)); }); if (!raf) raf = requestAnimationFrame(flush); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function set(code) { try { localStorage.setItem("lo-lang", code); } catch (e) {} location.reload(); }
  return { register, T, set, start, get lang() { return lang; }, get names() { return names; }, get codes() { return Object.keys(names); } };
})();
