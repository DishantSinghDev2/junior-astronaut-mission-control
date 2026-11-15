/* AI-assisted: this file was written with help from Claude (Anthropic), directed and reviewed by Team Pheonix. See AI-DISCLOSURE.md. */
/*
  LUNAR OUTPOST — game rules, screens, HUD, story cutscene.
  Flow: loading → home → story cutscene (first time) → Moon or Mars → 3D globe: pick a real landing site
        → briefing → open-world mission (8 sols) → results.

  Each sol lasts DAY_LEN seconds. Meters change every moment:
    Life Support  crew breathing drains it; the water recycler (needs power) refills it; ice from the Ice Drill tops it up
    Power         solar panels charge it (less when dusty); every system and the rover charger use it
    Shielding     wears down; real NASA solar storms smash it; the shield generator recharges it
    Greenhouse    the crew eats food; plants grow with power and must be harvested
  Keep Life Support, Power and Shielding above zero.
*/
(() => {
  const D = window.GAME_DATA, C = window.CONFIG;
  const $ = s => document.querySelector(s);
  const app = $("#app"), gameEl = $("#game"), modal = $("#modal"), mbox = modal.querySelector(".modal-box"), hud = $("#hud");
  const I = window.icon;
  const DAY_LEN = 90, PASSIVE = 60 / DAY_LEN, LENGTHS = { short: 8, standard: 14, long: 24 };
  let DAYS = 14;
  const R = {
    lifeDrain: 0.32, recycle: 0.24, leak: 0.7, hungry: 0.25, foodDrain: 0.22, grow: 1 / 30, harvest: 26,
    load: 0.55, wear: 0.06, boostCost: 8, boostGain: 10, purifyCost: 7, purifyGain: 9,
    analyzeCost: 3, perRock: 6, sendCost: 4, askCost: 5, ice: 22
  };
  const METERS = [
    { k: "life", name: "Life Support", icon: "wind", color: "#7cc4ff" },
    { k: "power", name: "Power", icon: "zap", color: "#ffd54a" },
    { k: "shield", name: "Shielding", icon: "shield", color: "#ff6b35" },
    { k: "food", name: "Greenhouse", icon: "sprout", color: "#8be04e" }
  ];
  const NAMES = { life: "Life Support", power: "Power", shield: "Shielding", food: "Greenhouse", science: "Science" };

  const shots = {};
  // saved progress (this browser only)
  const PROFILE_KEY = "lo-profile-v1";
  const profile = { xp: 0, stars: 0, missions: 0, science: 0, lastSite: null, q: "high", suit: 0xff6b35, name: "Commander", tutorDone: false, len: "standard" };
  try { Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}")); } catch (e) {}
  DAYS = LENGTHS[profile.len] || 14;
  const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {} };
  let S = null, dest = "moon", site = null, last = 0, hudT = 0, mpT = 0, lobbyOn = false, toastTimer = null, introSeen = false, cineRun = null;

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const fill = t => esc(t).replace(/\{day\}/g, S && S.place ? S.place.dayWord : "day").replace(/\[\[([^\]]+)\]\]/g, (m, w) => `<button class="term" data-term="${w}">${w}</button>`);
  const marsDelay = () => Comms.marsDelayMinutes(new Date());
  const status = v => (v >= 60 ? ["Good", "st-good", "#2ecc71"] : v >= 30 ? ["Careful", "st-care", "#ffb020"] : ["Danger", "st-bad", "#ff4d4d"]);
  // menu screens: opts.world = show the live 3D base slowly drifting behind the menu
  function render(html, opts = {}) {
    Globe.close();
    if (opts.world) { gameEl.hidden = false; attract(opts.place || dest, opts.hero ? "hero" : "drift"); World.resize(); }
    else { if (S && S.attract) S = null; gameEl.hidden = true; }
    document.body.classList.toggle("menu", !!opts.world);
    document.body.classList.toggle("dim", !!opts.dim);
    app.innerHTML = html; app.hidden = false;
    document.body.classList.remove("playing", "cine");
    window.scrollTo(0, 0);
    const h = app.querySelector("h1, h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function rocket(cls = "") {
    return `<svg class="rocket ${cls}" viewBox="0 0 84 142" aria-hidden="true">
      <path class="flame" d="M30 92 L54 92 L42 140 Z" fill="#ffb020"/>
      <path d="M42 0 C56 12 62 30 62 46 L22 46 C22 30 28 12 42 0 Z" fill="#e2412d"/>
      <rect x="22" y="44" width="40" height="44" fill="#fff"/><rect x="22" y="80" width="40" height="10" fill="#0e1645"/>
      <circle cx="42" cy="60" r="10" fill="#7cc4ff"/><path d="M22 62 L0 98 L22 88 Z M62 62 L84 98 L62 88 Z" fill="#e2412d"/></svg>`;
  }
  function dataStatus() {
    const st = Donki.state;
    if (st.status === "live") return `<span class="badge live">Live NASA DONKI · ${st.live.length} real CMEs in 60 days</span>`;
    if (st.archive.length) return `<span class="badge arch">Archived NASA DONKI data · saved ${esc(window.DONKI_ARCHIVE.savedOn)}</span>`;
    return `<span class="badge">No NASA data · practice storms</span>`;
  }
  function soundBtn() { const b = $("#btn-sound"); b.innerHTML = I(Sound.muted ? "volume-x" : "volume-2"); b.setAttribute("aria-pressed", String(!Sound.muted)); }

  /* =========================================================
     MENU SCREENS
     ========================================================= */
  async function loading() {
    render(`<section class="screen center loading"><div>
      <div class="emblem float">${I("rocket")}</div>
      <h1 class="title">Lunar Outpost</h1><div class="sub">Explore · Analyse · Survive</div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="ld-bar"></i></div>
      <p class="load-text" id="ld-text">Loading mission… 0%</p>
      <div class="dyk">Did you know? ${esc(rand(["Radio signals take time to travel between Earth and space.", "The Moon's gravity is only 1/6 of Earth's.", "Water is great at blocking space radiation.", "A day on Mars is called a sol.", "Sunsets on Mars look blue!"]))}</div>
    </div><div class="foot">Team Pheonix · NASA Space Apps Challenge 2026</div></section>`);
    let p = 0;
    const set = (v, msg) => { p = Math.max(p, v); const b = $("#ld-bar"), t = $("#ld-text"); if (b) b.style.width = p + "%"; if (t) t.textContent = msg || `Loading mission… ${Math.round(p)}%`; };
    set(8, "Starting…");
    const donki = Donki.load();
    const fonts = Promise.race([(document.fonts && document.fonts.ready) || Promise.resolve(), wait(5000)]);
    ["intro", "explore"].forEach(n => Sound.el(n));
    const models = World.preload((f, bytes) => set(10 + f * 80, `Loading 3D models… ${Math.round(f * 100)}% (${(bytes / 1048576).toFixed(1)} MB)`));
    let skipped = false, skipRes;
    const skipP = new Promise(r => (skipRes = r)), tick = null;
    const slow = setTimeout(() => { const t = $("#ld-text"); if (!t) return; const b = document.createElement("button"); b.className = "btn-secondary sm"; b.style.marginTop = ".8rem"; b.textContent = "Slow connection? Continue anyway"; b.onclick = () => { skipped = true; skipRes(); }; t.after(b); }, 18000);
    await Promise.race([Promise.all([fonts, models, Promise.race([donki, wait(6000)]), wait(1300)]), skipP]);
    clearTimeout(slow);
    if (skipped && !World.modelsLoaded) { home(); return; }
    set(95, "Preparing the outposts…");
    await wait(50);
    try { shots.moon = await World.snapshot("moon", 505, 720, 420); shots.mars = await World.snapshot("mars", 202, 720, 420); } catch (e) { console.warn(e); }
    set(100); await wait(300);
    home();
  }

  function home() {
    stopGame();
    Sound.music("lobby");
    const lvl = Math.floor(profile.xp / 100) + 1, xp = profile.xp % 100;
    const siteName = profile.lastSite || D.places.moon.sites[0].name;
    render(`<section class="title-screen">
      <div class="t-brand"><div class="patch">${I("rocket")}</div><div class="bar-v"></div>
        <div><h1>Lunar Outpost</h1><div class="sub">EXPLORE · ANALYSE · SURVIVE</div></div></div>
      <div class="t-top">
        <span class="t-stat" title="Stars earned">${I("star")} ${profile.stars}</span>
        <span class="t-stat" title="Science sent to Earth">${I("flask-conical")} ${Math.round(profile.science)}</span>
        <span class="t-stat" title="Missions flown">${I("flag")} ${profile.missions}</span>
      </div>
      <div class="t-left">
        <div class="t-card"><div class="t-avatar">${I("user")}</div>
          <div><b>${esc(profile.name)}</b><small>Level ${lvl}</small><div class="xp"><i style="width:${xp}%"></i></div><div class="xp-t">${xp} / 100 XP</div></div></div>
        <nav class="t-menu" aria-label="Main menu">
          ${loadRun() ? `<button class="t-item cont" data-go="resume">${I("rocket")} Continue · ${cap(D.places[loadRun().placeId].dayWord)} ${loadRun().day} of ${loadRun().days}</button>` : ""}
          <button class="t-item primary" data-go="start">${I("play")} Start mission</button>
          <button class="t-item" data-go="sunwatch">${I("sun")} Sun Watch</button>
          <button class="t-item" data-go="howto">${I("book-open")} How to play</button>
          <button class="t-item" data-go="video">${I("sparkles")} Watch tutorial</button>
          <button class="t-item" data-go="sources">${I("satellite")} NASA data</button>
          <button class="t-item" data-act="suit">${I("user")} My astronaut</button>
          <button class="t-item" data-act="lang-toggle">${I("globe")} English / हिन्दी</button>
          <button class="t-item" data-act="credits">${I("info")} Credits</button>
          <button class="t-item" data-act="settings">${I("settings")} Settings</button>
        </nav>
        <div class="t-suit"><h3>Suit status</h3>
          <div class="suit-row"><div class="body">${I("user")}</div>
            <div><div class="stat"><span>Oxygen</span><span>100%</span><div class="bar"><i style="width:100%"></i></div></div>
              <div class="stat g"><span>Energy</span><span>100%</span><div class="bar"><i style="width:100%"></i></div></div>
              <div class="stat o"><span>Shielding</span><span>100%</span><div class="bar"><i style="width:100%"></i></div></div></div></div></div>
      </div>
      <div class="t-right">
        <div class="t-mission"><span class="eyebrow">Current mission</span>
          <h3>Survive ${DAYS} ${D.places[dest].dayWord}s at ${esc(siteName)}</h3>
          <p>Keep Life Support, Power and Shielding above zero while real NASA solar storms roll in.</p>
          ${shots.moon ? `<img src="${shots.moon}" alt="">` : ""}</div>
      </div>
      <div class="t-foot"><div class="t-note">${dataStatus()}<span>Team Pheonix · NASA Space Apps 2026</span></div>
        <button class="t-tag" data-go="start">A new frontier awaits… ${I("rocket")}</button></div>
    </section>`, { world: true, hero: true, place: "moon" });
  }

  /* =========================================================
     SQUAD LOBBY (solo, host or join) + multiplayer wiring
     ========================================================= */
  const QUICK = [["👋", "Hi!"], ["🆘", "Need help!"], ["⚡", "Storm! Shelter!"], ["👍", "Nice!"]];
  const hexc = c => "#" + (c >>> 0).toString(16).padStart(6, "0");
  const inMission = () => S && !S.attract && !S.intro && S.placeId;
  function myInfo() { return { name: profile.name, suit: profile.suit }; }
  function slotsHtml() {
    const list = MP.role === "off" ? [{ id: "me", name: profile.name, suit: profile.suit, host: true, me: true }] : MP.roster.map(r => ({ ...r, me: r.id === MP.id }));
    return Array.from({ length: 4 }, (_, i) => {
      const p = list[i];
      return p ? `<div class="slot on${p.me ? " me" : ""}" style="--c:${hexc(p.suit)}"><div class="disc">${esc(p.name.charAt(0).toUpperCase())}</div><b>${esc(p.name)}</b><span>${p.host ? "HOST" : "CREW"}${p.me ? " · YOU" : ""}</span></div>`
        : `<div class="slot"><div class="disc">+</div><b>Open slot</b><span>${MP.role === "off" ? "solo mission" : "waiting…"}</span></div>`;
    }).join("");
  }
  function sideHtml() {
    if (MP.role === "off") return `<h2>How do you want to play?</h2>
      <button class="btn-secondary wide" data-act="lb-host">${I("users")} Create a squad (up to 4)</button>
      <div class="join-row"><input id="lb-code" maxlength="5" placeholder="CODE" autocomplete="off" aria-label="Squad code"><button class="btn-secondary" data-act="lb-join">Join</button></div>
      <p class="vid-note" id="lb-msg">Squad play connects browsers directly through a free public relay. Only your call sign, suit colour and position are shared, and chat is 4 preset lines.</p>`;
    if (MP.role === "host") return `<h2>Your squad code</h2><div class="code-big" id="lb-codebig">${MP.code}</div>
      <button class="btn-secondary wide" data-act="lb-copy">Copy code</button>
      <p class="vid-note">Friends open this page, press Start mission, then Join with this code. You pick the landing site and deploy for everyone.</p>
      <button class="btn-secondary wide" data-act="lb-leave">Leave squad</button>`;
    return `<h2>Squad ${MP.code}</h2><p class="vid-note">You're in! The host is choosing the landing site. When they deploy, your pod drops with the squad.</p>
      <button class="btn-secondary wide" data-act="lb-leave">Leave squad</button>`;
  }
  function deployHtml() {
    if (MP.role === "guest") return `<button class="btn-primary lg" disabled>Waiting for the host…</button>`;
    return `<button class="btn-primary lg" data-go="dest">${MP.role === "host" ? "Choose landing site" : "Play solo"} ${I("arrow-right")}</button>`;
  }
  function lobby() {
    lobbyOn = true; Sound.music("lobby");
    render(`<section class="screen lobby">
      <button class="btn-secondary sm back-btn" data-act="lb-back">Back</button>
      <div class="lb-head"><span class="kicker">SQUAD LOBBY</span><h1>Ready your crew</h1></div>
      <div class="lb-main"><div class="slots" id="slots">${slotsHtml()}</div><div class="lb-side" id="lb-side">${sideHtml()}</div></div>
      <div class="next-row" id="lb-deploy">${deployHtml()}</div>
      <button class="btn-secondary sm" data-act="suit" style="margin:.8rem auto 0;display:block">${I("user")} Change suit and call sign</button>
    </section>`, { world: true, place: dest });
  }
  function lobbyRefresh() {
    if (!lobbyOn || !$("#slots")) return;
    $("#slots").innerHTML = slotsHtml(); $("#lb-side").innerHTML = sideHtml(); $("#lb-deploy").innerHTML = deployHtml();
  }
  function lobbyMsg(t) { const m = $("#lb-msg"); if (m) { m.textContent = t; m.classList.add("err"); } }
  function syncRemotes() {
    const keep = new Set();
    if (inMission()) MP.roster.forEach(r => { if (r.id !== MP.id) { keep.add(r.id); World.remote.add(r.id, { name: r.name, suit: r.suit }); } });
    World.remote.list().forEach(r => { if (!keep.has(r.id)) World.remote.remove(r.id); });
    renderSquad();
  }
  function renderSquad() {
    const el = $("#squad"); if (!el) return;
    if (MP.role === "off" || !inMission()) { el.hidden = true; return; }
    el.hidden = false;
    const others = MP.roster.filter(r => r.id !== MP.id);
    el.innerHTML = `<div class="sq-list">${others.map(r => `<span class="sq-p" style="--c:${hexc(r.suit)}"><i></i>${esc(r.name)}</span>`).join("") || "<span class='sq-p'>Waiting for teammates…</span>"}</div>
      <div class="sq-chat">${QUICK.map((q, i) => `<button data-say="${i}" title="${q[1]} (press ${i + 1})">${q[0]}</button>`).join("")}</div>`;
  }
  function saySend(k) { MP.say(k); Sound.sfx("click"); }
  MP.on("roster", () => { lobbyRefresh(); syncRemotes(); });
  MP.on("state", ({ id, s }) => World.remote.update(id, s));
  MP.on("say", ({ id, k }) => {
    const q = QUICK[k]; if (!q) return; const r = MP.roster.find(x => x.id === id);
    if (id !== MP.id) { World.remote.say(id, q[0] + " " + q[1]); Sound.sfx("pick"); if (r) toast(`<b>${esc(r.name)}</b>: ${q[0]} ${q[1]}`, 2500); }
  });
  MP.on("left", id => { World.remote.remove(id); toast("A teammate left the squad.", 2500); });
  MP.on("closed", msg => { World.remote.clear(); lobbyRefresh(); toast(esc(msg), 4500); if (lobbyOn) lobby(); renderSquad(); });
  MP.on("start", m => { const pl = D.places[m.dest]; if (!pl) return; dest = m.dest; site = pl.sites[m.site] || pl.sites[0]; closeModal(); startMission({ storms: m.storms, days: m.days }); });
  document.addEventListener("keydown", e => {
    if (MP.role === "off" || !inMission() || S.modalOpen || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    const k = "1234".indexOf(e.key); if (k >= 0) saySend(k);
  });
  function destination() {
    lobbyOn = false;
    Sound.music("lobby");
    const card = id => {
      const p = D.places[id];
      return `<button class="dest-card ${dest === id ? "sel" : ""}" data-dest="${id}" aria-pressed="${dest === id}">
        <div class="art">${shots[id] ? `<img src="${shots[id]}" alt="3D view of the ${p.name} outpost">` : ""}</div>
        <h2>${p.name}</h2>
        <div>${p.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
        <p>${p.line}</p>
        <div class="facts">Radio delay ${id === "moon" ? "1.3 seconds" : `about ${marsDelay()} minutes today`} · ${p.sites.length} real landing sites</div>
      </button>`;
    };
    render(`<section class="screen dest">
      <button class="btn-secondary sm back-btn" data-go="home">Back</button>
      <h1>Where will your crew live?</h1>
      <div class="dests">${card("moon")}${card("mars")}</div>
      <div class="len-row" role="radiogroup" aria-label="Mission length"><span>Mission length</span>${[["short", "Short"], ["standard", "Standard"], ["long", "Expedition"]].map(([k, n]) => `<button class="len${profile.len === k ? " on" : ""}" role="radio" data-len="${k}"><b>${n}</b><small>${LENGTHS[k]} ${D.places[dest].dayWord}s · about ${Math.round(LENGTHS[k] * 1.6)} min</small></button>`).join("")}</div>
      <div class="next-row"><button class="btn-primary lg" data-go="globe">Choose landing site ${I("arrow-right")}</button></div>
    </section>`, { world: true, place: dest });
  }

  function globe(sel = 0) {
    const p = D.places[dest];
    site = p.sites[sel];
    render(`<section class="screen globe-screen">
      <button class="btn-secondary sm back-btn" data-go="dest">Back</button>
      <div class="globe-layout">
        <div class="globe-box" id="globe"></div>
        <div class="site-panel">
          <span class="kicker">${dest === "mars" ? "Mars" : "The Moon"} · real landing sites</span>
          <h1>Choose your landing site</h1>
          <div class="site-list">${p.sites.map((s, i) => `
            <button class="site-card ${i === sel ? "sel" : ""}" data-site="${i}" aria-pressed="${i === sel}">
              <div class="sp"><img data-photo="${s.id}" alt="" hidden><small></small></div>
              <b>${esc(s.name)}</b><span class="coords">${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? "N" : "S"} · ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? "E" : "W"}</span>
              <p>${esc(s.desc)}</p>
              <div>${s.chips.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>
            </button>`).join("")}</div>
          <button class="btn-primary land-btn" data-go="land">Land at ${esc(site.name)}</button>
        </div>
      </div>
    </section>`);
    p.sites.forEach(si => NasaLive.photo(si.id).then(ph => { const im = document.querySelector(`img[data-photo="${si.id}"]`); if (!im || !ph) return; im.src = ph.url; im.alt = ph.title; im.hidden = false; im.onerror = () => (im.hidden = true); const c = im.nextElementSibling; if (c) c.innerHTML = `NASA photo · ${esc(ph.title.slice(0, 44))}${ph.live ? "" : " · archived"}`; }));
    Globe.open($("#globe"), { body: dest, sites: p.sites, onPick: (s, i) => globe(i) });
    Globe.focus(sel);
  }

  function briefCards() {
    const p = D.places[dest];
    return [
      { title: "Your mission", body: `<ul>
          <li><span class="dot" style="background:#ffd54a">${I("flag")}</span><div><b>Run the ${esc(site.name)} outpost for ${DAYS} ${p.dayWord}s</b><span>Each ${p.dayWord} lasts 90 seconds. Finish your daily tasks — some are far away and need the rover.</span></div></li>
          <li><span class="dot" style="background:#ff4d4d">${I("sun")}</span><div><b>Real solar storms are coming</b><span>They come from NASA's DONKI records. When the alarm sounds, get inside the Storm Shelter!</span></div></li>
          <li><span class="dot" style="background:#2ecc71">${I("flask-conical")}</span><div><b>Do science</b><span>Collect purple rocks, study them in the Lab, and beam the data home from the Radio Dish.</span></div></li>
        </ul>` },
      { title: "Today at " + site.name, body: `<ul>${SpaceEnv.describe(SpaceEnv.forSite(dest, site, new Date())).map(([k, v], i) => `<li><span class="dot" style="background:${["#7cc4ff", "#ffd54a", "#ff9a4a", "#4cffb0", "#b07cff"][i % 5]}">${I(["orbit", "star", "sun", "sparkles", "globe"][i % 5])}</span><div><b>${k}</b><span>${esc(v)}</span></div></li>`).join("")}</ul><p class="goal">Real conditions computed for today's date. Your sun, sunsets${dest === "moon" ? " and Earth's phase" : ""} follow them.</p>` },
      { title: "Your four meters", body: `<ul>
          <li><span class="dot" style="background:#7cc4ff">${I("wind")}</span><div><b>Life Support</b><span>Air and water for the crew</span></div></li>
          <li><span class="dot" style="background:#ffd54a">${I("zap")}</span><div><b>Power</b><span>Electricity for the whole base</span></div></li>
          <li><span class="dot" style="background:#ff6b35">${I("shield")}</span><div><b>Shielding</b><span>Protection from harmful space rays</span></div></li>
          <li><span class="dot" style="background:#9dff6a">${I("sprout")}</span><div><b>Food</b><span>Crops from the greenhouse</span></div></li>
        </ul><p class="goal">Keep all four above zero.</p>` },
      { title: "How to play", body: `<ul>
          <li><span class="dot" style="background:#7cc4ff">${I("map-pin")}</span><div><b>Move and look</b><span><span class="key">W A S D</span> walk relative to the camera · drag to look around · <span class="key">Q</span> <span class="key">R</span> turn · click the ground to walk there · on a phone, drag the left side to move</span></div></li>
          <li><span class="dot" style="background:#ffd54a">${I("hand")}</span><div><b>Use things</b><span><span class="key">E</span> or <span class="key">Enter</span> — or the big orange USE button. <span class="key">Space</span> jumps! Some jobs need you to hold it.</span></div></li>
          <li><span class="dot" style="background:#ff6b35">${I("car-front")}</span><div><b>Drive the rover</b><span>Walk to the rover and press USE. It needs charging at the yellow pad.</span></div></li>
        </ul>` }
    ];
  }
  function briefing(mode, i = 0) {
    if (!site) site = D.places[dest].sites[0];
    const cards = briefCards(), c = cards[i], lastCard = i === cards.length - 1;
    render(`<section class="screen center"><div class="brief">
      <div class="step">Briefing ${i + 1} of ${cards.length}</div>
      <h2>${c.title}</h2>${c.body}
      <div class="dots">${cards.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="brief-nav">
        <button class="btn-secondary" data-brief="${mode}:skip">${mode === "howto" ? "Close" : "Skip"}</button>
        <button class="btn-primary" data-brief="${mode}:${lastCard ? "end" : i + 1}">${lastCard ? (mode === "howto" ? "Done" : "Launch!") : "Next"}</button>
      </div></div></section>`, { world: true, dim: true });
  }

  function sources() {
    const st = Donki.state;
    const donkiBadge = st.status === "live" ? `<span class="badge live">Live</span>` : st.archive.length ? `<span class="badge arch">Archived</span>` : `<span class="badge sim">Game simulation</span>`;
    render(`<section class="screen sources">
      <button class="btn-secondary sm back-btn" data-go="home">Back</button>
      <h1>NASA science sources</h1>
      <p>Game numbers are simplified. Badges show <b>Live</b> or <b>Archived</b> only when real NASA data is connected.</p>
      <div class="src-grid">
        <article class="src"><h2>DONKI space weather</h2><div>${donkiBadge}</div>
          <p>Every solar storm is a <b>real CME</b> from NASA's DONKI database.</p>
          <ul><li>Its real <b>speed</b> sets how strong the storm is.</li><li>Speed ÷ distance to the Moon or Mars = <b>your countdown</b> to reach the shelter (1 real hour ≈ half a game second).</li><li>A linked radiation storm (SEP) makes it hit harder.</li></ul>
          <span class="link">ccmc.gsfc.nasa.gov/tools/DONKI</span>
          <button class="btn-secondary sm" data-go="sunwatch">Open Sun Watch</button></article>
        <article class="src"><h2>Real landing sites</h2><div><span class="badge arch">NASA facts</span></div>
          <p>The 3D globe puts your base at a real place.</p>
          <ul><li>Mars: Jezero (Perseverance), Gale (Curiosity), Acidalia Planitia, Utopia Planitia (buried ice found by MRO radar).</li><li>Moon: Shackleton rim (Artemis area), Tranquility Base (Apollo 11).</li></ul></article>
        <article class="src"><h2>Moon & Mars conditions</h2><div><span class="badge arch">NASA facts</span></div>
          <ul><li>Mars gets ~43% of Earth's sunlight → less solar power, more dust.</li><li>Radio delay: Moon 1.3 s; Mars worked out for today's real Earth–Mars distance.</li><li>Blue Mars sunsets, perchlorate soil, MOXIE oxygen, ISS water recycling — all real.</li></ul></article>
        <article class="src"><h2>OSDR astronaut research</h2><div><span class="badge sim">Game simulation</span></div>
          <p>Not connected yet. Next step: use OSDR radiation dosimetry to make storm damage more realistic.</p>
          <a class="link" href="https://osdr.nasa.gov/" target="_blank" rel="noopener">osdr.nasa.gov</a></article>
      </div></section>`, { world: true, dim: true });
  }

  /* =========================================================
     STORY CUTSCENE — played in the real game engine
     ========================================================= */
  // "attract mode": the real 3D base, camera drifting slowly around it, behind the menus
  const attractCam = { x: 1800, y: 1280 };
  const attractCine = { cam: attractCam, pitch: 0.2, dist: 11.5, yaw: 0, speed: 0.8 };
  let attractT = 0;
  function attract(place, mode) {
    const p = D.places[place] ? place : "moon";
    if (!S || !S.attract || S.placeId !== p) {
      S = storyState(); S.attract = true; S.placeId = p; S.place = D.places[p]; S.dusk = 0;
      World.reset(p, { seed: p === "mars" ? 202 : 505 }); World.resize();
      attractT = Math.random() * 10; last = performance.now();
    }
    if (S.attractMode === mode && !S.attractForce) return;
    S.attractMode = mode;
    if (mode === "hero") { World.hero(true); World.setCine({ ...World.HERO.title, jump: true }); }
    else { World.hero(false); attractCine.jump = true; attractCine.jumped = false; World.setCine(attractCine); }
  }
  function storyState() {
    return { intro: true, placeId: "mars", place: D.places.mars, life: 80, power: 80, shield: 75, food: 70, growth: 0.6,
      dust: [0.1, 0.2, 0.1, 0.15, 0.1, 0.2], samples: [], carrying: 0, stored: 0, storm: null, dusk: 1, introStorm: 0,
      modalOpen: false, over: false, speedMul: 1, solarMul: 1 };
  }
  function story() {
    stopGame();
    introSeen = true;
    S = storyState();
    app.hidden = true; gameEl.hidden = false; document.body.classList.add("playing", "cine"); document.body.classList.remove("menu", "dim");
    hud.innerHTML = ""; $("#g-ticker").hidden = true;
    $("#cine").hidden = false; $("#cine-title").hidden = true; $("#cine-sub").textContent = "";
    World.reset("mars", { seed: 202 }); World.resize();
    const P = World.player; P.x = 1800; P.y = 1480;   // by the base hub
    World.setCine({ cam: { x: 900, y: 500 }, zoom: 0.55, speed: 0.25, jump: true });
    Sound.music("explore");
    const lines = D.story, shots = [
      () => World.setCine({ cam: { x: 1500, y: 950 }, zoom: 0.6, speed: 0.12 }),
      () => World.setCine({ cam: { x: 1800, y: 1290 }, zoom: 0.95, speed: 0.6 }),
      () => { World.setCine({ cam: { x: 1700, y: 1330 }, zoom: 1.25, speed: 0.8 });
              S.t1 = setTimeout(() => World.walkTo(1640, 1560), 2000);
              S.t2 = setTimeout(() => { World.walkTo(1270, 1530); World.setCine({ cam: World.player, zoom: 1.3, speed: 1.4 }); }, 4300); },
      () => { S.introStorm = 1; Sound.music("storm"); World.setCine({ cam: { x: 1700, y: 1350 }, zoom: 0.75, speed: 0.7 }); },
      () => { S.introStorm = 0; Sound.music("explore"); S.dust = S.dust.map(() => 0.85);
              World.driveRover(2300, 900); S.t3 = setTimeout(() => World.driveRover(1850, 430), 3200);
              World.setCine({ cam: World.rover, zoom: 0.9, speed: 2 }); },
      () => { World.setCine({ cam: { x: 1800, y: 1100 }, zoom: 0.5, speed: 0.35 }); S.t4 = setTimeout(() => ($("#cine-title").hidden = false), 1200); }
    ];
    let idx = -1, done = false;
    const t0 = performance.now();
    const voice = Sound.muted ? null : Sound.voice("intro", () => finish());
    const clock = () => (voice && voice.currentTime > 0 && !voice.ended ? voice.currentTime : (performance.now() - t0) / 1000);
    function finish() {
      if (done) return; done = true;
      clearInterval(cineRun); cineRun = null;
      setTimeout(() => { if (S && S.intro) endStory(); }, 1500);
    }
    cineRun = setInterval(() => {
      if (!S || !S.intro) return;
      const tt = clock();
      S.dusk = Math.max(0, 1 - tt / 9);
      while (idx + 1 < lines.length && tt >= lines[idx + 1].at) { idx++; shots[idx](); $("#cine-sub").textContent = lines[idx].text; }
      if (tt > D.storyLength + 1) finish();
    }, 100);
    last = performance.now();
  }
  function endStory() {
    if (S && S.intro) ["t1", "t2", "t3", "t4"].forEach(k => clearTimeout(S[k]));
    clearInterval(cineRun); cineRun = null;
    $("#cine").hidden = true; World.setCine(null); S = null;
    lobby();
  }
  function skipStory() { Sound.stopVoice(); endStory(); }

  /* =========================================================
     MISSION SETUP
     ========================================================= */
  function pickStormDays(n) {
    for (let k = 0; k < 100; k++) {
      const c = []; for (let d = 2; d <= DAYS; d++) c.push(d);
      const days = []; while (days.length < n) days.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
      days.sort((a, b) => a - b);
      if (days.every((d, i) => !i || d - days[i - 1] > 1)) return days;
    }
    return [3, 6];
  }

  function startMission(opts) {
    if (!World.modelsLoaded) {   // slow connection: the 3D models are still downloading
      openModal(`<div class="pause"><h2>Loading 3D models…</h2><p id="ml-p">Please wait a moment.</p></div>`);
      World.modelsPromise.then(() => { closeModal(); startMission(opts); });
      return;
    }
    lobbyOn = false;
    if (S) S.over = true;
    closeModal(); $("#popup").hidden = true; $("#cine").hidden = true;
    if (!site) site = D.places[dest].sites[0];
    const place = D.places[dest], mods = site.mods || {};
    if (opts && opts.days) DAYS = opts.days;
    let storms = {};
    if (opts && opts.storms) storms = opts.storms;
    else { const picked = Donki.pickStorms(Math.max(2, Math.round(DAYS / 5))); pickStormDays(picked.length).forEach((d, i) => (storms[d] = picked[i])); }
    S = {
      placeId: dest, place, site, mods, day: 1, t: 0,
      life: 80, power: 80, shield: 75, food: 70, growth: 0.45,
      science: 0, stored: 0, carrying: 0, cargo: null,
      dust: [0.1, 0.25, 0.05, 0.15, 0.3, 0.1], broken: false, leakAt: null, samples: [],
      weatherBroken: false, relayBroken: false, relayUntil: 0, partTaken: false,
      sending: 0, boosting: 0, charging: false,
      solarMul: 1, solarForever: 1, wearMul: 1, speedMul: 1,
      storms, storm: null, stormAt: 0, stormStarted: false, linkDay: 1, blackout: 0,
      evAt: 0, evDone: false, pending: null, ask: null, modalOpen: false,
      up: { dust: 1, solar: 1, life: 1, grow: 1, wear: 1, rover: 1, warn: 0 }, spent: 0, lv: {}, chapter: -1,
      disc: {}, forecast: null, tasks: [], guideIdx: null, dayStart: null, dayLog: [], decisions: [], hist: [], sampleT: 0,
      stats: { cleaned: 0, fixed: 0, harvested: 0, rocks: 0, stormsFaced: [], asked: 0, lateWarnings: 0, tasksDone: 0, driven: 0, ice: 0 },
      delayMin: dest === "mars" ? marsDelay() : null, over: false, dusk: 0
    };
    if (opts && opts.resume) {
      const r = opts.resume;
      ["day", "life", "power", "shield", "food", "growth", "science", "spent", "up", "lv", "stats", "decisions", "hist", "partTaken", "wearMul", "solarForever", "linkDay", "relayUntil", "dust", "forecast", "delayMin"].forEach(k => { if (r[k] !== undefined && r[k] !== null) S[k] = r[k]; });
      S.used = new Set(r.used || []); S.disc = { weather: true, ice: true, relay: true, lander: true }; S.resumed = true; profile.tutorDone = true;
    }
    app.hidden = true; gameEl.hidden = false; document.body.classList.add("playing"); document.body.classList.remove("cine", "menu", "dim");
    World.reset(dest, site); World.setCine(null); World.resize();
    S.env = SpaceEnv.forSite(dest, site, new Date());
    crewInit();
    buildHud();
    if (MP.role === "host" && !(opts && opts.storms)) MP.start({ dest, site: D.places[dest].sites.indexOf(site), storms, days: DAYS });
    syncRemotes();
    if (opts && opts.resume) { Sound.music("explore"); beginDrop(); landNow(); endDrop(); last = performance.now(); return; }
    Sound.music("drop");
    beginDrop();
    last = performance.now();
  }
  /* ---------- crew jobs: assign the three crew members by hand, or let Auto decide ---------- */
  const JOBS = [["panels", "Clean solar panels", "sparkles", "Scrubs dusty panels, one by one"], ["greenhouse", "Tend the greenhouse", "sprout", "Plants grow faster and get harvested"], ["life", "Life Support", "droplets", "Purifies water: +Life, uses a little Power"], ["shield", "Shield generator", "shield", "Charges the shield: +Shield, uses a little Power"], ["science", "Lab research", "flask-conical", "Slowly makes science for the score"], ["rest", "Rest in quarters", "heart-pulse", "Saves energy, does nothing else"]];
  const CREW = [["Mia", "#4c8dff"], ["Arjun", "#2ecc71"], ["Zoe", "#ff6bd5"]];
  const ST = () => BaseKit.STATIONS;
  function stationFor(job, i) {
    const st = ST(), m = { greenhouse: st.green, life: st.life, shield: st.shield, science: st.lab, rest: st.rest, shelter: st.shelter }[job] || st.command;
    return { x: m.x + (i - 1) * 34, y: m.y + (i % 2 ? 26 : -10) };
  }
  function crewApply(i, job) {
    if (!S.cj) return; const c = S.cj[i]; c.job = job; c.tgt = null; c.t = 0; World.setCrewJob(i, job);
    if (job === "panels") { c.tgt = null; return; }
    const p = stationFor(job, i); World.crewGo(i, p.x, p.y);
  }
  function crewAuto() {   // decide the best three jobs from what the base needs right now
    const avgDust = S.dust.reduce((a, b) => a + b, 0) / S.dust.length;
    const need = { life: 100 - S.life, shield: (100 - S.shield) * 0.95, greenhouse: Math.max(100 - S.food, S.growth * 70), panels: avgDust * 110, science: 28, rest: 5 };
    const top = Object.entries(need).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    S.cj.forEach((c, i) => { if (c.job !== top[i] && !S.storm) crewApply(i, top[i]); });
  }
  function crewInit() { S.cj = CREW.map(() => ({ job: "rest", tgt: null, t: 0 })); S.autoCrew = true; S.cjT = 0; S.cjSaved = null; }
  function crewTick(dt) {
    if (!S.cj || S.cx) return; const list = World.crewList(), pd = dt * PASSIVE;
    if (S.storm) { if (!S.cjSaved) { S.cjSaved = S.cj.map(c => c.job); S.cj.forEach((c, i) => crewApply(i, "shelter")); } return; }
    if (S.cjSaved) { const sv = S.cjSaved; S.cjSaved = null; S.cj.forEach((c, i) => crewApply(i, sv[i] === "shelter" ? "rest" : sv[i])); if (S.autoCrew) crewAuto(); }
    S.cjT -= dt; if (S.autoCrew && S.cjT <= 0) { S.cjT = 9; crewAuto(); }
    S.cj.forEach((c, i) => {
      const w = list[i]; if (!w) return; const stn = c.job === "panels" ? null : stationFor(c.job, i);
      if (c.job === "panels") {
        if (c.tgt === null) { let b = -1, bd = 0.14; S.dust.forEach((d, k) => { if (d > bd) { bd = d; b = k; } }); if (b >= 0) { c.tgt = b; const o = World.obj("panel" + b); World.crewGo(i, o.x, o.y + 64); } return; }
        const o = World.obj("panel" + c.tgt); if (Math.hypot(w.x - o.x, w.y - (o.y + 64)) < 50 || w.arrived) { c.t += dt; if (c.t > 3.2) { c.t = 0; S.dust[c.tgt] = Math.max(0, S.dust[c.tgt] - 0.9); World.burst("spark", o.x, o.y, 6); c.tgt = null; } }
        return;
      }
      if (Math.hypot(w.x - stn.x, w.y - stn.y) > 120) return;   // still walking there
      if (c.job === "greenhouse") { S.growth = Math.min(1, S.growth + R.grow * 0.8 * pd); if (S.growth >= 1) { S.growth = 0; S.food = Math.min(100, S.food + R.harvest * 0.7); toast(`${CREW[i][0]} harvested the greenhouse <b class="green">+${Math.round(R.harvest * 0.7)} Food</b>`, 2600); } }
      else if (c.job === "life" && S.life < 100 && S.power > 5 && !S.broken) { S.life = Math.min(100, S.life + R.purifyGain * 0.45 * dt); S.power -= R.purifyCost * 0.45 * dt; }
      else if (c.job === "shield" && S.shield < 100 && S.power > 5) { S.shield = Math.min(100, S.shield + R.boostGain * 0.45 * dt); S.power -= R.boostCost * 0.45 * dt; }
      else if (c.job === "science" && S.power > 8) { S.science += 0.085 * dt; S.power -= 0.04 * dt; }
    });
  }
  function crewModal() {
    S.modalOpen = true;
    openModal(`<div class="crewbox"><h1>Your crew</h1>
      <label class="auto-row"><input type="checkbox" id="crew-auto" ${S.autoCrew ? "checked" : ""}> <b>Auto assign</b> <span>(default) The crew picks the job the base needs most.</span></label>
      <div class="crew-grid">${CREW.map(([n, col], i) => `<div class="crew-card" style="--c:${col}"><div class="cc-h"><i></i><b>${n}</b><span>${S.cj[i].job === "shelter" ? "Sheltering from the storm" : esc((JOBS.find(j => j[0] === S.cj[i].job) || [0, "Resting"])[1])}</span></div>
        <div class="cc-jobs">${JOBS.map(j => `<button class="${S.cj[i].job === j[0] ? "on" : ""}" data-cjob="${i}:${j[0]}" title="${j[3]}">${I(j[2])}<small>${j[1]}</small></button>`).join("")}</div></div>`).join("")}</div>
      <p class="vid-note">Pick a job for each crew member. They walk there and work. During a solar storm everyone runs to the Storm Shelter.</p>
      <button class="btn-primary" data-act="resume">Done</button></div>`);
    const cb = $("#crew-auto"); if (cb) cb.addEventListener("change", () => { S.autoCrew = cb.checked; if (S.autoCrew) crewAuto(); });
  }

  /* ---------- the drop: your pod falls from orbit, BGMI-style ---------- */
  const DROP_WAIT = 2.6, DROP_FALL = 6.8, H0 = 34, lerp = (a, b, t) => a + (b - a) * t;
  function beginDrop() {
    S.drop = { t: 0, landed: false, hatch: false, prevH: H0, lx: 1500, ly: 2260, burn: false, tl: 0 };
    hud.style.visibility = "hidden"; $("#g-ticker").hidden = true;
    const el = document.createElement("div"); el.id = "drop"; el.className = "drop-hud";
    el.innerHTML = `<div class="dr-top"><small>DEPLOYING TO</small><b>${esc(S.site.name)}</b><em>${S.placeId === "moon" ? "THE MOON" : "MARS"} · ${esc(profile.name)}</em></div>
      <div class="dr-count" id="dr-count"></div>
      <div class="dr-alt"><div><small>ALTITUDE</small><b id="dr-alt">12000 m</b></div><div><small>SPEED</small><b id="dr-spd">0 m/s</b></div><div><small>ENGINE</small><b id="dr-eng">STANDBY</b></div></div>
      <div class="dr-flash" id="dr-flash"></div><button class="dr-skip" data-act="drop-skip">Skip ▸</button>`;
    gameEl.appendChild(el);
    const d = S.drop, hid = { x: d.lx, y: d.ly - 64, z: 0.52, face: Math.PI, anim: "Idle", hidden: true };
    [0, 1, 2].forEach(i => World.puppetCrew(i, { ...hid })); World.puppetPlayer({ ...hid });
    World.setPod(true, d.lx, d.ly, H0, false); World.setChute(S.placeId === "mars" ? 1 : 0);
    World.setCine({ pos: { x: d.lx + 430, y: d.ly + 440, h: 1.0 }, look: { x: d.lx, y: d.ly, h: H0 * 0.78 }, fov: 58, speed: 8, jump: true });
  }
  function landNow() {   // used when skipping: lander on the ground, everybody out and walking
    const d = S.drop; if (!d || d.hatch) return; d.hatch = true;
    World.setChute(0); World.setPod(true, d.lx, d.ly, 0, false, false); if (!d.landed) { d.landed = true; World.podStay(d.lx, d.ly); }
    [0, 1, 2].forEach(i => { World.puppetCrew(i, null); World.crewSet(i, 1400 + (i - 1) * 55, 1960 + (i % 2) * 30); }); World.puppetPlayer(null); S.cx = null;
    const P = World.player; P.x = d.lx - 30; P.y = d.ly - 150; P.face = Math.PI;
  }
  /* the crew climbs down the ladder one by one and walks to the base, like the Ares crew in The Martian */
  function crewExitInit(d) {
    const pp = World.podPose(); S.cx = { t: 0, pp, playerFree: false, mem: [0, 1, 2, 3].map(k => ({ k, t0: 1.8 + k * 1.3, done: false, path: [{ x: d.lx + (k - 1.5) * 80, y: d.ly - 340 }, { x: 1400 + (k - 1.5) * 50, y: 1960 }] })) };
  }
  function crewExitTick(dt) {
    const c = S.cx; if (!c) return; c.t += dt; const pp = c.pp; let alive = false;
    c.mem.forEach(m => {
      if (m.done) return; alive = true; const u = c.t - m.t0; let st;
      if (u < 0) st = { x: pp.porch.x, y: pp.porch.y, z: 0.52, face: Math.PI, anim: "Idle", hidden: true };
      else if (u < 1.4) { const f = u / 1.4; st = { x: lerp(pp.porch.x, pp.ladder.x, f), y: lerp(pp.porch.y, pp.ladder.y, f), z: 0.52 * (1 - f), face: Math.PI, anim: "Walk", hidden: false }; }
      else {
        let dist = (u - 1.4) * 82, px = pp.ladder.x, py = pp.ladder.y, face = Math.PI, fin = true;
        for (const q of m.path) { const L = Math.hypot(q.x - px, q.y - py); if (dist <= L) { const f = dist / L; face = Math.atan2(q.x - px, q.y - py); px = lerp(px, q.x, f); py = lerp(py, q.y, f); fin = false; break; } dist -= L; px = q.x; py = q.y; face = Math.atan2(q.x - px, q.y - py); }
        st = { x: px, y: py, z: 0, face, anim: "Walk", hidden: false };
        if (m.k === 3 && !c.playerFree && u > 1.4 + Math.hypot(m.path[0].x - pp.ladder.x, m.path[0].y - pp.ladder.y) / 82 - 0.4) { c.playerFree = true; m.done = true; World.puppetPlayer(null); const P = World.player; P.x = px; P.y = py; P.face = face; if (S.drop) endDrop(); return; }
        if (fin) { m.done = true; if (m.k < 3) { World.puppetCrew(m.k, null); World.crewGo(m.k, m.path[1].x, m.path[1].y); } return; }
      }
      if (m.k < 3) World.puppetCrew(m.k, st); else World.puppetPlayer(st);
    });
    if (!alive) S.cx = null;
  }
  function crewLogic() {   // the crew shelter from storms
    if (!S || !S.tasks || S.cx) return; const stormy = !!S.storm;
    World.crewList().forEach(c => {
      const rm = World.roomAt(c.x, c.y);
      if (stormy && rm !== "shelter" && !c.moving) { World.crewGo(c.i, 1840 + c.i * 35, 1700 + (c.i % 2) * 40); }
    });
  }
  function dropTick(dt) {
    const d = S.drop; d.t += dt; const mars = S.placeId === "mars";
    const s = clamp((d.t - DROP_WAIT) / DROP_FALL, 0, 1), h0 = H0 - DROP_WAIT * 1.1, cnt = $("#dr-count");
    const h = d.t < DROP_WAIT ? H0 - d.t * 1.1 : h0 * Math.pow(1 - s, 1.7);
    const burnAt = mars ? 0.5 : 0.1;
    if (d.t < DROP_WAIT) cnt.textContent = d.t < 0.5 ? "" : String(Math.max(1, Math.ceil(DROP_WAIT - d.t)));
    else if (!d.landed) cnt.textContent = s < burnAt ? (mars ? "PARACHUTE" : "FREE FALL") : d.t < DROP_WAIT + DROP_FALL * burnAt + 1.0 ? "IGNITION" : "";
    if (s >= burnAt && !d.burn && !d.landed) { d.burn = true; Sound.sfx("thrust"); $("#dr-eng").textContent = "BURN"; $("#dr-eng").classList.add("hot"); if (mars) World.setChute(2); }
    const spd = Math.max(0, (d.prevH - h) / Math.max(dt, 0.001) * 6.3); d.prevH = h;
    $("#dr-alt").textContent = Math.round(h / H0 * 12000 / 10) * 10 + " m"; $("#dr-spd").textContent = Math.round(spd) + " m/s";
    if (!d.hatch) {
      const bounce = d.landed ? Math.max(0, 0.08 * Math.exp(-4 * (d.t - d.tl)) * Math.sin(20 * (d.t - d.tl))) : 0;
      World.setPod(true, d.lx, d.ly, h + bounce, d.burn && !d.landed, false);
    }
    if (!d.landed) {
      const close = clamp((s - 0.35) / 0.4, 0, 1), shake = 0;
      World.setCine({ pos: { x: lerp(d.lx + 430, d.lx + 260, close), y: lerp(d.ly + 440, d.ly + 250, close), h: lerp(1.0, 0.55, close) }, look: { x: d.lx, y: d.ly, h: Math.max(0.55, h * lerp(0.78, 0.4, close)) }, fov: h > 12 ? 58 : 50, speed: 6 });
    } else {
      const u = d.t - d.tl, shake = u < 0.8 ? (Math.random() - 0.5) * 0.1 * (1 - u / 0.8) : 0;
      World.setCine({ pos: { x: d.lx + 360 + shake * 200, y: d.ly - 10, h: 0.75 + shake }, look: { x: d.lx - 20, y: d.ly - 210, h: 0.55 }, fov: 50, speed: 2.2 });
      if (u > 0.6 && !d.cx) { d.cx = true; crewExitInit(d); cnt.textContent = ""; }
      if (S.cx) crewExitTick(dt);
      if (u > 22) endDrop();
    }
    if (s >= 1 && !d.landed) {
      d.landed = true; d.tl = d.t; cnt.textContent = "TOUCHDOWN"; Sound.sfx("land"); $("#dr-eng").textContent = "SHUTDOWN"; $("#dr-eng").classList.remove("hot"); World.podStay(d.lx, d.ly);
      for (let i = 0; i < 70; i++) { const a = (i / 70) * 6.28; World.burst("dust", d.lx + Math.cos(a) * 60, d.ly + Math.sin(a) * 60, 2); }
      for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; World.throwRock(d.lx + Math.cos(a) * 60, d.ly + Math.sin(a) * 60, 0.1, Math.cos(a) * 380, Math.sin(a) * 380, 3 + Math.random() * 3, 0.05 + Math.random() * 0.06, 2.4); }
      $("#dr-flash").classList.add("on");
    }
  }
  function endDrop() {
    if (!S || !S.drop) return;
    const d = S.drop, keepCx = d.cx && S.cx && S.cx.playerFree;
    if (!keepCx) landNow();
    S.drop = null; const el = $("#drop"); if (el) el.remove();
    World.setCine(null); World.setChute(0);
    hud.style.visibility = "";
    Sound.music("explore"); startDay(); toast(S.resumed ? `Welcome back, ${esc(profile.name)}! ${cap(S.place.dayWord)} ${S.day} of ${DAYS}.` : `Touchdown at ${esc(S.site.name)}! Your ${S.place.dayWord} 1 begins.`, 4500);
    last = performance.now();
  }
  /* ---------- auto-save so a long mission can be continued ---------- */
  const RUN_KEY = "lo-run-v1";
  function saveRun() {
    try {
      if (!S || S.over || S.intro || S.attract || MP.role !== "off") return;
      localStorage.setItem(RUN_KEY, JSON.stringify({ placeId: S.placeId, site: D.places[S.placeId].sites.indexOf(S.site), days: DAYS, day: S.day, life: S.life, power: S.power, shield: S.shield, food: S.food, growth: S.growth, science: S.science, spent: S.spent, up: S.up, lv: S.lv, storms: S.storms, stats: S.stats, decisions: S.decisions, hist: S.hist, used: [...(S.used || [])], partTaken: S.partTaken, wearMul: S.wearMul, solarForever: S.solarForever, linkDay: S.linkDay, relayUntil: S.relayUntil, dust: S.dust, forecast: S.forecast, delayMin: S.delayMin }));
    } catch (e) {}
  }
  const loadRun = () => { try { return JSON.parse(localStorage.getItem(RUN_KEY) || "null"); } catch (e) { return null; } };
  const clearRun = () => { try { localStorage.removeItem(RUN_KEY); } catch (e) {} };
  function resumeRun() {
    const r = loadRun(); if (!r || !D.places[r.placeId]) return;
    dest = r.placeId; site = D.places[dest].sites[r.site] || D.places[dest].sites[0];
    startMission({ storms: r.storms, days: r.days, resume: r });
  }
  function stopGame() {
    if (S) { S.over = true; if (S.intro) ["t1", "t2", "t3", "t4"].forEach(k => clearTimeout(S[k])); }
    closeModal(); clearInterval(cineRun); cineRun = null; Sound.stopVoice();
    $("#cine").hidden = true; World.setCine(null);
  }

  /* ---------- daily tasks ---------- */
  const TASKS = {
    clean:   { title: () => "Scrub 2 dusty solar panels", need: 2, where: () => dustiest() },
    harvest: { title: () => "Harvest the greenhouse", need: 1, where: () => World.obj("green") },
    study:   { title: () => "Study 2 rocks in the Lab", need: 2, where: () => (S.carrying ? World.obj("lab") : nearSample() || World.obj("lab")) },
    send:    { title: () => "Beam science to Earth (Radio Dish)", need: 1, where: () => (S.stored ? World.obj("dish") : S.carrying ? World.obj("lab") : nearSample() || World.obj("dish")) },
    weather: { title: () => "Drive to the Weather Station, download data", need: 1, where: () => World.obj("weather") },
    relay:   { title: () => "Repair the Relay Tower", need: 1, where: () => World.obj("relay") },
    ice:     { title: () => "Bring ice from the Ice Drill to Life Support", need: 1, where: () => (S.cargo === "ice" ? World.obj("life") : World.obj("ice")) },
    lander:  { title: () => "Salvage a part from the Old Lander", need: 1, where: () => (S.cargo === "part" ? World.obj("shield") : World.obj("lander")) }
  };
  const SPOTS = {
    weather: { icon: "cloud-fog", name: "Weather Station", does: "Download its data to get a storm forecast built from real NASA records.", reward: "+10 data, and +8 s extra storm warning", cost: "Far away: take the rover", tag: "Forecast" },
    ice: { icon: "droplets", name: "Ice Drill", does: "Drill an ice core, carry it to Life Support and melt it.", reward: "Refills Life Support", cost: "−6 Power to run the drill", tag: "Water" },
    relay: { icon: "radio-tower", name: "Relay Tower", does: "Repair it to keep your radio link to Earth strong.", reward: "Early storm warnings for 2 days", cost: "A wiring puzzle", tag: "Comms" },
    lander: { icon: "package", name: "Old Lander", does: "Salvage a part and fit it into the Shield Generator.", reward: "+20 Shielding, and it wears slower", cost: "Only one part to find", tag: "Salvage" }
  };
  function showSpotCard(id) {
    const sp = SPOTS[id]; if (!sp) return;
    document.querySelectorAll(".spot-card").forEach(e => e.remove());
    const el = document.createElement("div"); el.className = "spot-card";
    el.innerHTML = `<div class="sc-ic">${I(sp.icon)}</div><div><small>NEW MISSION SPOT · ${sp.tag}</small><b>${sp.name}</b><p>${sp.does}</p><div class="sc-row"><span class="g">▲ ${sp.reward}</span><span class="l">▼ ${sp.cost}</span></div></div>`;
    gameEl.appendChild(el); Sound.sfx("pick"); setTimeout(() => el.remove(), 7000);
  }
  function dustiest() { let i = 0; S.dust.forEach((d, k) => { if (d > S.dust[i]) i = k; }); return World.obj("panel" + i); }
  function nearSample() { const P = World.player; let b = null, bd = 1e9; S.samples.forEach(s => { if (!s.taken) { const d = Math.hypot(s.x - P.x, s.y - P.y); if (d < bd) { bd = d; b = s; } } }); return b; }
  function planTasks() {
    let ids;
    if (S.day === 1) ids = ["clean", "study", "weather"];
    else {
      const exp = ["weather", "relay", "ice"].concat(S.partTaken ? [] : ["lander"]);
      ids = [rand(["clean", "harvest"]), rand(exp), rand(["study", "send"])];
      const want = S.day >= 14 ? 5 : S.day >= 6 ? 4 : 3, rest = ["clean", "harvest", "study", "send", "weather", "relay", "ice"].filter(x => !ids.includes(x));
      while (ids.length < want && rest.length) ids.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    }
    S.tasks = ids.map(id => ({ id, n: 0, need: TASKS[id].need, done: false }));
    if (ids.includes("relay")) S.relayBroken = true;
    if (ids.includes("weather") && S.day > 2 && Math.random() < 0.5) S.weatherBroken = true;
    S.guideIdx = null;
  }
  function progress(id, k = 1) {
    const t = S.tasks.find(x => x.id === id && !x.done); if (!t) return;
    t.n = Math.min(t.need, t.n + k);
    if (t.n >= t.need) {
      t.done = true; S.stats.tasksDone++; S.science += 5; Sound.sfx("task");
      toast(`Task complete: ${TASKS[id].title()} <b class="yellow">+5 science</b>`);
      if (S.tasks.every(x => x.done)) { S.science += 10; setTimeout(() => S && toast(`All ${S.place.dayWord} tasks done! <b class="yellow">+10 bonus science</b>`, 4000), 1500); }
      S.guideIdx = null;
    }
  }
  function guideTarget() {
    if (S.storm) return World.obj("shelter");
    if (S.leakAt) return World.obj(S.leakAt);
    if (S.broken) return World.obj("life");
    const list = S.tasks.filter(t => !t.done);
    const t = S.guideIdx !== null && S.tasks[S.guideIdx] && !S.tasks[S.guideIdx].done ? S.tasks[S.guideIdx] : list[0];
    return t ? TASKS[t.id].where() : null;
  }

  function startDay() {
    S.t = 0; S.solarMul = 1; S.speedMul = 1;
    S.evDone = false; S.evAt = 35 + Math.random() * 20;
    S.stormAt = 8 + Math.random() * 15; S.stormStarted = false;
    S.dayStart = { life: S.life, power: S.power, shield: S.shield, food: S.food, science: S.science };
    S.dayLog = [];
    chapterBanner();
    planTasks();
    saveRun();
    spawnSamples(2 + (S.mods.samples || 0));
    if (S.day === 1) toast("Welcome, Commander! Follow the yellow arrow to your first task.", 6000);
    else { toast(`${cap(S.place.dayWord)} ${S.day} begins. New tasks are on your list.`); Sound.voice("vo-morning"); }
  }
  const CHAPTERS = [["Chapter 1", "Touchdown", "Learn the base. Keep every meter above zero."], ["Chapter 2", "Settling in", "Routines are working. Watch the dust and the daily tasks."], ["Chapter 3", "Storm season", "More solar storms are coming. Stay close to the shelter."], ["Chapter 4", "The long haul", "Everything wears out. Spend your science on upgrades."], ["Final stretch", "Hold on!", "The last sols. Bring the whole crew home safe."]];
  function chapterBanner() {
    const f = (S.day - 1) / Math.max(1, DAYS - 1), idx = S.day === DAYS && DAYS > 4 ? 4 : S.day === 1 ? 0 : f < 0.34 ? 1 : f < 0.62 ? 2 : 3;
    if (S.chapter === idx) return; S.chapter = idx;
    const c = CHAPTERS[idx], el = document.createElement("div"); el.className = "chapter";
    el.innerHTML = `<small>${c[0]} · ${cap(S.place.dayWord)} ${S.day} of ${DAYS}</small><b>${c[1]}</b><span>${c[2]}</span>`;
    gameEl.appendChild(el); setTimeout(() => el.remove(), 4800);
  }
  function spawnSamples(n) {
    let tries = 0;
    while (n > 0 && tries++ < 300) {
      const a = Math.random() * Math.PI * 2, r = 520 + Math.random() * 700;
      const x = 1800 + Math.cos(a) * r, y = 1290 + Math.sin(a) * r * 0.8;
      if (x > 80 && y > 80 && x < World.W - 80 && y < World.H - 80 && !(x > 380 && x < 3080 && y > 440 && y < 2080) && World.free(x, y)) { S.samples.push({ x, y, taken: false }); n--; }
    }
    S.samples = S.samples.filter(s => !s.taken).slice(-12);
  }

  /* =========================================================
     SIMULATION
     ========================================================= */
  const solarNow = () => S.place.solar * (S.mods.solar || 1) * S.up.solar * (1 - 0.7 * (S.dust.reduce((a, b) => a + b, 0) / S.dust.length)) * S.solarMul * S.solarForever;

  function update(dt) {
    if (S.drop) return dropTick(dt);
    if (S.cx) crewExitTick(dt);
    S.crewT = (S.crewT || 0) - dt;
    if (S.crewT <= 0) { S.crewT = 1.2; crewLogic(); }
    if (S.intro) { S.storm = S.introStorm ? { phase: "hit" } : null; return; }
    const simulate = !S.modalOpen || (S.ask && S.ask.live);
    if (S.ask) {
      S.ask.left -= dt;
      if (S.ask.left <= 0) { S.ask = null; if (!S.pending) return; S.pending.tip = true; Sound.sfx("pick"); if (S.modalOpen && S.pending) showChoices(); else toast("Mission Control replied! Tap the radio button to decide."); }
    }
    if (!simulate) return;
    const pd = dt * PASSIVE;
    S.t += dt;
    coachTick(dt);
    if (S.disc) { const Pl = World.player; Object.keys(SPOTS).forEach(id => { if (S.disc[id]) return; const o = World.obj(id); if (o && Math.hypot(o.x - Pl.x, o.y - Pl.y) < 460) { S.disc[id] = true; showSpotCard(id); } }); }
    const powered = S.power > 0;
    S.power += (solarNow() - R.load) * pd;
    const rv = World.rover, pad = World.obj("pad");
    S.charging = !World.player.inRover && rv.battery < 100 && Math.hypot(rv.x - pad.x, rv.y - pad.y) < 90 && S.power > 2;
    if (S.charging) { rv.battery = Math.min(100, rv.battery + 9 * dt); S.power -= 1.0 * dt; }
    const df = 1 + 0.03 * (S.day - 1);   // life gets a little harder every day
    let dl = -R.lifeDrain * df * S.up.life;
    if (!S.broken && powered) dl += R.recycle;
    if (S.leakAt) dl -= R.leak;
    if (S.food <= 0) dl -= R.hungry;
    S.life += dl * pd;
    S.food -= R.foodDrain * pd * df;
    if (powered) S.growth = Math.min(1, S.growth + R.grow * S.up.grow * pd);
    S.shield -= R.wear * S.wearMul * S.up.wear * df * (powered ? 1 : 2) * pd;
    S.dust = S.dust.map(d => Math.min(1, d + S.place.dustRate * (S.mods.dust || 1) * S.up.dust * pd * (0.6 + Math.random() * 0.8)));
    S.sending = Math.max(0, S.sending - dt); S.boosting = Math.max(0, S.boosting - dt);
    if (S.env) { const sa = SpaceEnv.sunAt(S.env, S.t / DAY_LEN); S.sun = sa; S.dusk = sa.dusk; S.sunsetNow = S.t / DAY_LEN > sa.us - 0.04; }
    else S.dusk = S.t > DAY_LEN * 0.82 ? Math.min(1, (S.t - DAY_LEN * 0.82) / (DAY_LEN * 0.18)) : 0;

    if (S.storms[S.day] && !S.stormStarted && S.t >= S.stormAt && !S.modalOpen) startStorm();
    if (S.storm) {
      const st = S.storm;
      if (st.phase === "coming") {
        st.eta -= dt;
        if (st.eta <= 0) { st.phase = "hit"; st.hitLeft = 5; st.where = {}; toast("The storm is here!", 2500); Sound.sfx("alarm"); }
      } else if (st.phase === "hit") {
        const w = World.where();
        const loc = w === "shelter" ? 0.3 : w === "outside" ? 1.8 : w === "rover" ? 1.3 : 1;
        const dmg = (st.dmg / 5) * loc * st.mul * dt;
        S.shield -= dmg; st.taken += dmg; st.where[w] = (st.where[w] || 0) + dt;
        st.hitLeft -= dt;
        if (st.hitLeft <= 0) endStorm();
      }
    }
    if (!S.evDone && !S.storms[S.day] && S.t >= S.evAt && !S.modalOpen && !S.pending) openEvent(drawEvent());

    S.life = clamp(S.life, 0, 100); S.food = clamp(S.food, 0, 100); S.shield = clamp(S.shield, 0, 100);
    if (S.power <= 0) { S.power = 0; S.blackout += dt; } else { S.power = Math.min(100, S.power); S.blackout = 0; }
    S.sampleT += dt;
    if (S.sampleT >= 2) { S.sampleT = 0; S.hist.push({ d: S.day - 1 + S.t / DAY_LEN, life: S.life, power: S.power, shield: S.shield }); }

    crewTick(dt);
    if (S.life <= 0) return fail("Life Support ran out. The crew didn't have enough air and water.");
    if (S.shield <= 0) return fail("Shielding hit zero. The crew got too much radiation.");
    if (S.blackout > 10) return fail("The base was out of power for too long.");
    if (S.t >= DAY_LEN && !S.storm && !S.pending && !S.modalOpen && (!S.storms[S.day] || S.stormStarted)) endDay();
  }

  document.addEventListener("click", e => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const b = t.closest("[data-say]"); if (b) return saySend(+b.dataset.say);
    const u = t.closest("[data-buy]"); if (u) return buy(u.dataset.buy);
    const cj = t.closest("[data-cjob]"); if (cj && S && S.cj) { const [i, job] = cj.dataset.cjob.split(":"); S.autoCrew = false; const cb = $("#crew-auto"); if (cb) cb.checked = false; crewApply(+i, job); return crewModal(); }
    const lg = t.closest("[data-lang]"); if (lg) return I18N.set(lg.dataset.lang);
    const l = t.closest("[data-len]"); if (l) { profile.len = l.dataset.len; DAYS = LENGTHS[profile.len]; saveProfile(); document.querySelectorAll("[data-len]").forEach(x => x.classList.toggle("on", x === l)); }
  });
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (S && S.attract && !gameEl.hidden) {
      attractT += dt;
      attractCine.yaw = attractT * 0.045; attractCam.x = 1800; attractCam.y = 1300;
    }
    mpT += dt;
    if (MP.role !== "off" && mpT > 0.1 && inMission() && !S.over && World.player) { mpT = 0; const ls = World.localState(); if (ls) MP.sendState(ls); }
    if (S && !S.over && !gameEl.hidden) {
      update(dt);
      if (S && !S.modalOpen) World.step(dt);
      if (S) World.draw();
      hudT += dt;
      if (hudT > 0.1 && S && !S.intro && !S.over && !S.drop) { hudT = 0; updateHud(); }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- world handlers ---------- */
  function prompt(o) {
    if (!S || S.intro) return null;
    if (S.leakAt === o.id) return { text: "Patch the air leak", hold: 2, enabled: true };
    switch (o.kind) {
      case "panel": return S.dust[o.idx] > 0.06 ? { text: "Scrub panel", tap: true, enabled: true } : { text: "Panel is clean", enabled: false };
      case "life":
        if (S.cargo === "ice") return { text: "Melt ice into the tanks", hold: 1.2, enabled: true };
        if (S.broken) return { text: "Repair the recycler", tap: true, enabled: true };
        if (S.life >= 99.5) return { text: "Tanks full", enabled: false };
        if (S.power < 3) return { text: "Not enough power", enabled: false };
        return { text: "Hold: purify water", continuous: true, enabled: true };
      case "green": return S.growth >= 1 ? { text: "Harvest food", hold: 1.1, enabled: true } : { text: `Plants growing ${Math.round(S.growth * 100)}%`, enabled: false };
      case "shield":
        if (S.cargo === "part") return { text: "Install the lander part", hold: 1.5, enabled: true };
        if (S.shield >= 99.5) return { text: "Shield full", enabled: false };
        if (S.power < 3) return { text: "Not enough power", enabled: false };
        return { text: "Hold: charge shield", continuous: true, enabled: true };
      case "shelter": return { text: S.storm ? "Safe in the shelter!" : "Storm Shelter", enabled: false };
      case "airlock": return { text: "Airlock", enabled: false };
      case "lab": return S.carrying ? { text: `Study rock (${S.carrying})`, hold: 1.1, enabled: true } : { text: "Bring purple rocks here", enabled: false };
      case "dish":
        if (S.stored > 0) return { text: `Send ${S.stored} data to Earth`, hold: 1.3, enabled: true };
        return S.linkDay < S.day ? { text: "Check in with Earth", hold: 1, enabled: true } : { text: "Earth link strong", enabled: false };
      case "pad": return { text: `Rover battery ${Math.round(World.rover.battery)}%${S.charging ? " · charging" : ""}`, enabled: false };
      case "weather":
        if (S.weatherBroken) return { text: "Repair the station", tap: true, enabled: true };
        if (S.tasks.some(t => t.id === "weather" && !t.done)) return { text: "Download weather data", hold: 2.2, enabled: true };
        return { text: "Station online", enabled: false };
      case "ice": return S.cargo ? { text: "Hands full", enabled: false } : S.power < 8 ? { text: "Not enough power to run the drill (needs 8)", enabled: false } : { text: "Drill ice (−6 Power)", hold: 2.5, enabled: true };
      case "relay": return S.relayBroken ? { text: "Repair the relay", tap: true, enabled: true } : { text: "Relay online", enabled: false };
      case "lander": return S.partTaken ? { text: "Already salvaged", enabled: false } : S.cargo ? { text: "Hands full", enabled: false } : { text: "Salvage antenna part", hold: 2.5, enabled: true };
    }
    return null;
  }
  function done(o) {
    Sound.sfx("done");
    if (S.leakAt === o.id) { S.leakAt = null; S.stats.fixed++; logDay("You patched the air leak."); return toast("Leak patched!"); }
    switch (o.kind) {
      case "panel": return mini("scrub", { place: S.placeId }, () => { S.dust[o.idx] = 0; S.stats.cleaned++; logDay("cleaned", 1); progress("clean"); toast("Panel sparkling clean! More power."); });
      case "life":
        if (S.cargo === "ice") { const g = Math.round(R.ice * (S.mods.ice || 1)); S.life = Math.min(100, S.life + g); S.cargo = null; S.stats.ice++; progress("ice"); logDay("You melted ice into the water tanks."); return toast(`Ice melted: +${g} Life Support`); }
        return mini("wires", { title: "Repair the water recycler" }, () => { S.broken = false; S.stats.fixed++; logDay("You repaired the water recycler."); toast("Recycler fixed!"); });
      case "green": S.growth = 0; S.food = Math.min(100, S.food + R.harvest); S.stats.harvested++; progress("harvest"); logDay("You harvested the greenhouse."); return toast(`Harvest! +${R.harvest} Greenhouse food`);
      case "shield": S.cargo = null; S.shield = Math.min(100, S.shield + 20); S.wearMul *= 0.6; progress("lander"); logDay("You installed the old lander's part into the shield generator."); return toast("New part installed: +20 Shielding, and it wears slower!");
      case "lab": S.carrying--; S.stored += R.perRock; S.power -= R.analyzeCost; S.stats.rocks++; progress("study"); return toast(`Rock studied: +${R.perRock} data. Beam it home from the Radio Dish!`);
      case "dish": {
        const n = S.stored;
        S.science += n; S.stored = 0; S.power -= n ? R.sendCost : 1; S.linkDay = S.day; S.sending = 1.6;
        if (n) progress("send");
        logDay(n ? `You sent ${n} science data to Earth.` : "You checked in with Earth.");
        return toast(n ? `${n} data on its way to Earth! It takes ${S.placeId === "moon" ? "1.3 seconds" : `about ${S.delayMin} minutes`} to arrive.` : "Earth link is strong. You'll get early storm warnings.");
      }
      case "weather":
        if (S.weatherBroken) return mini("wires", { title: "Repair the weather station" }, () => { S.weatherBroken = false; toast("Station repaired. Now download the data!"); });
        S.stored += 10; progress("weather"); logDay("You downloaded data from the Weather Station.");
        { const fd = Object.keys(S.storms).map(Number).filter(d => d >= S.day && !(d === S.day && S.stormStarted)).sort((a, b) => a - b)[0];
          if (fd) { S.forecast = { day: fd, speed: S.storms[fd].speed }; return toast(`Forecast ready: a solar storm (${S.storms[fd].speed.toLocaleString()} km/s) is expected on ${S.place.dayWord} ${fd}. <b class="yellow">+10 data</b>`, 5000); } }
        return toast("Weather data downloaded: +10 data. No storm in the forecast. Beam it home from the Radio Dish!");
      case "ice": S.cargo = "ice"; S.power = Math.max(0, S.power - 6); return toast("Ice core collected! <b class=\"red\">−6 Power</b>. Carry it to Life Support.");
      case "relay": return mini("wires", { title: "Repair the relay tower" }, () => { S.relayBroken = false; S.relayUntil = S.day + 2; S.linkDay = S.day; progress("relay"); logDay("You repaired the Relay Tower."); toast("Relay online! Early storm warnings for 2 days."); });
      case "lander": S.cargo = "part"; S.partTaken = true; return toast("Part salvaged! Carry it to the Shield Generator.");
    }
  }
  function hold(o, dt) {
    if (o.kind === "life" && !S.broken && S.power >= 3 && S.life < 100) { S.power -= R.purifyCost * dt; S.life = Math.min(100, S.life + R.purifyGain * dt); return; }
    if (o.kind === "shield" && S.power >= 3 && S.shield < 100) { S.power -= R.boostCost * dt; S.shield = Math.min(100, S.shield + R.boostGain * dt); S.boosting = 0.2; }
  }
  function pickup(s) {
    if (S.carrying >= 3) { if (!S.fullMsg) { S.fullMsg = true; toast("Hands full! Take your rocks to the Science Lab."); setTimeout(() => S && (S.fullMsg = false), 4000); } return; }
    s.taken = true; S.carrying++; World.burst("spark", s.x, s.y, 10); Sound.sfx("pick");
    toast(`Rock collected (${S.carrying}/3). Study it in the Science Lab.`, 2500);
  }
  function logDay(text, count) {
    if (count) { const e = S.dayLog.find(x => x.k === text); if (e) e.n++; else S.dayLog.push({ k: text, n: 1 }); return; }
    S.dayLog.push({ text });
  }
  function mini(kind, opts, onDone) {
    if (window.__autoMini) return onDone();   // automated tests only
    openModal(`<div class="mini-host"></div>`);
    Mini[kind](mbox.querySelector(".mini-host"), opts, ok => { closeModal(); if (ok) onDone(); });
  }

  /* =========================================================
     STORMS
     ========================================================= */
  function startStorm() {
    S.stormStarted = true;
    const st = S.storms[S.day], au = S.placeId === "moon" ? 1 : 1.524;
    const hours = st.source === "practice" ? 40 : SunWatch.hoursTo(st.speed, au);
    let secs = clamp(Math.round(hours * 0.5), 14, 45);
    const late = S.linkDay < S.day - 1 && S.relayUntil < S.day;
    if (late) { secs = Math.max(9, Math.round(secs * 0.5)); S.stats.lateWarnings++; }
    secs += S.up.warn;
    if (S.forecast && S.forecast.day === S.day) { secs += 8; setTimeout(() => S && toast("Your Weather Station forecast gave you <b class=\"yellow\">+8 s</b> extra warning!", 3500), 1800); }
    const dmg = [0, 30, 45, 60][st.level] + (st.hasSep ? 15 : 0);
    S.storm = { st, phase: "coming", eta: secs, total: secs, hours, late, dmg, mul: 1, taken: 0, where: {} };
    Sound.music("storm"); Sound.sfx("alarm"); setTimeout(() => S && S.storm && Sound.voice("vo-storm"), 600);
    stormAlert();
  }
  function endStorm() {
    const st = S.storm;
    const mostly = Object.entries(st.where).sort((a, b) => b[1] - a[1])[0]?.[0] || "hab";
    const lost = Math.round(st.taken);
    S.stats.stormsFaced.push({ ...st.st, lost, mostly });
    logDay(`A real solar storm hit. You were ${mostly === "shelter" ? "safe in the shelter" : mostly === "outside" ? "OUTSIDE — ouch" : mostly === "rover" ? "in the rover" : "inside the base"}. Shielding −${lost}.`);
    toast(`Storm over. Shielding −${lost}${mostly === "shelter" ? " (the shelter helped!)" : mostly === "outside" ? " (being outside made it worse!)" : ""}.`, 5000);
    S.storm = null; Sound.music("explore"); Sound.voice("vo-stormover");
  }
  function stormAlert() {
    const st = S.storm, c = st.st;
    const badge = c.source === "live" ? `<span class="badge live">Live NASA data</span>` : c.source === "archive" ? `<span class="badge arch">Archived NASA data</span>` : `<span class="badge">Practice storm</span>`;
    openModal(`<div class="emerg">
      <span class="e-pill">Emergency</span>
      <div class="e-art" aria-hidden="true"><div class="sun"></div><div class="beam"></div><div class="dome ${S.placeId}"></div></div>
      <h2>${esc(D.storm.title)}</h2>
      <p>${fill(D.storm.text)}</p>
      ${c.source === "practice" ? "" : `<div class="data-line">${badge}
        <span>Real <button class="term" data-term="CME">CME</button> left the Sun <b>${esc(c.date)}</b></span>
        <span>Speed <b>${c.speed.toLocaleString()} km/s</b></span>
        <span>Real trip to ${S.placeId === "moon" ? "the Moon" : "Mars"}: <b>~${st.hours} h</b></span>
        <span>Your warning: <b>${st.eta} seconds</b></span>
        <span>Strength <b>${c.level}/3</b>${c.hasSep ? " + radiation storm" : ""}</span></div>`}
      <p class="note">${st.late ? "Your radio was quiet, so the warning came LATE. Check in at the Radio Dish (or fix the Relay Tower) for earlier warnings. " : ""}Inspired by NASA DONKI space weather. Game values are simplified.</p>
      <button class="btn-primary" data-act="storm-choices">See my choices</button>
    </div>`);
  }

  /* =========================================================
     EVENTS + CHOICES
     ========================================================= */
  function drawEvent() {
    S.used = S.used || new Set();
    let pool = D.events.filter(e => (e.place === "both" || e.place === S.placeId) && !S.used.has(e.id));
    if (!pool.length) { S.used.clear(); pool = D.events.filter(e => e.place === "both" || e.place === S.placeId); }
    const ev = rand(pool); S.used.add(ev.id); return ev;
  }
  function openEvent(ev) { S.evDone = true; S.pending = { ev, sel: null, tip: false, storm: false }; Sound.sfx("alarm"); openModal(""); showChoices(); }
  function effFx(ch, i) { const fx = { ...(ch.fx || {}) }; if (S.pending.tip && i === S.pending.ev.tip) for (const k in fx) if (fx[k] < 0) fx[k] = Math.ceil(fx[k] / 2); return fx; }
  function chips(ch, i) {
    const out = Object.entries(effFx(ch, i)).filter(([, v]) => v).map(([k, v]) => `<span class="chip ${v > 0 ? "up" : "down"}">${v > 0 ? "+" : "−"}${Math.abs(v)} ${NAMES[k]}</span>`);
    (ch.extra || []).forEach(x => out.push(`<span class="chip ${x.startsWith("Task") ? "task" : "note"}">${esc(x)}</span>`));
    if (ch.risk) out.push(`<span class="chip down">${esc(ch.risk)}</span>`);
    return out.join("");
  }
  function showChoices() {
    if (!S || !S.pending) return closeModal();
    const P = S.pending, ev = P.ev;
    const text = ev[S.placeId === "moon" ? "textMoon" : "textMars"] || ev.text;
    const fact = ev[S.placeId === "moon" ? "factMoon" : "factMars"] || ev.fact;
    const asking = !!S.ask, roundTrip = S.placeId === "moon" ? "2.6 seconds" : `${S.delayMin * 2} minutes`;
    const askState = asking ? `Message travelling to Earth and back… <b id="ask-left">${Math.ceil(S.ask.left)} s</b> (real round trip: ${roundTrip}). Your base keeps running!`
      : P.tip ? `<b>Mission Control replied:</b> they recommend “${esc(ev.choices[ev.tip].label)}” and halved its costs.`
      : S.placeId === "mars" ? "Mars is far: a reply takes a while (shortened for the game)." : "The Moon is close: Earth replies in about 2.6 seconds.";
    mbox.innerHTML = `<div class="choose">
      <h1>${fill(ev.title)}</h1>
      <p class="lead">${fill(text)}${P.storm && S.storm ? ` <b class="yellow">Storm arrives in <span id="storm-eta">${Math.ceil(S.storm.eta)}</span> s.</b>` : ""}</p>
      <div class="opts">${ev.choices.map((c, i) => `
        <button class="opt ${P.sel === i ? "sel" : ""}" data-opt="${i}" aria-pressed="${P.sel === i}">
          ${P.tip && i === ev.tip ? `<span class="rec">Mission Control pick</span>` : ""}
          <span class="optkey">${"ABC"[i]}</span><h3>${fill(c.label)}</h3><p>${fill(c.desc)}</p><div>${chips(c, i)}</div>
        </button>`).join("")}</div>
      <div class="choose-foot">
        <button class="btn-secondary" data-act="ask" ${asking || P.tip || S.power < R.askCost ? "disabled" : ""}>${I("radio-tower")} Ask Mission Control (−${R.askCost} Power)</button>
        <span class="ask-state">${askState}${asking && S.placeId === "mars" ? ` <button class="mc-btn" data-act="minimize">Go work while you wait</button>` : ""}</span>
        <button class="btn-primary" data-act="confirm" ${P.sel === null ? "disabled" : ""}>Confirm</button>
      </div>
      <div class="fact-strip"><b>Did you know?</b> ${fill(fact)} <small>Source: ${esc(ev.source)}</small></div>
    </div>`;
  }
  function confirmChoice() {
    const P = S && S.pending; if (!P) return closeModal();
    const ev = P.ev, i = P.sel; if (i === null) return;
    const ch = ev.choices[i], fx = effFx(ch, i);
    for (const [k, v] of Object.entries(fx)) { if (k === "science") S.science = Math.max(0, S.science + v); else S[k] = clamp(S[k] + v, 0, 100); }
    const m = ch.mod || {};
    if (m.solarMul) { if (m.forever) S.solarForever *= m.solarMul; else S.solarMul *= m.solarMul; }
    if (m.speedMul) S.speedMul = m.speedMul;
    if (m.wearMul) S.wearMul *= m.wearMul;
    if (ch.clean) S.dust = S.dust.map(() => 0);
    if (ch.link) S.linkDay = S.day;
    if (ch.stormMul && S.storm) S.storm.mul *= ch.stormMul;
    if (ch.task === "recycler") S.broken = true;
    if (ch.task === "leak") S.leakAt = rand(["life", "green", "lab", "shield"]);
    if (ch.task === "dust") S.dust = S.dust.map(d => Math.max(d, 0.85));
    if (ch.task === "samples") spawnSamples(3);
    S.decisions.push(`${ev.title.replace(/!$/, "")}: ${ch.label.toLowerCase()}`);
    S.dayLog.push({ choice: ch.label, title: ev.title, fx });
    S.pending = null; S.ask = null;
    Sound.sfx("click");
    closeModal(); toast(fill(ch.result), 5000);
  }

  /* =========================================================
     DAY END + RESULTS
     ========================================================= */
  function endDay() {
    S.hist.push({ d: S.day, life: S.life, power: S.power, shield: S.shield });
    const s0 = S.dayStart;
    const card = (k, name) => {
      const a = Math.round(s0[k]), b = Math.round(S[k]), d = b - a, [, , col] = status(b);
      return `<div class="hap"><div class="hap-top"><b>${name}</b><span class="delta ${d > 0 ? "up" : d < 0 ? "down" : "same"}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</span></div>
        <div class="from">${a} → ${b}</div><div class="mbar"><i style="width:${b}%;background:${col}"></i></div></div>`;
    };
    const lines = [];
    const choice = S.dayLog.find(x => x.choice);
    if (choice) {
      const ups = Object.entries(choice.fx).filter(([, v]) => v > 0).map(([k]) => NAMES[k]), downs = Object.entries(choice.fx).filter(([, v]) => v < 0).map(([k]) => NAMES[k]);
      lines.push(`You chose “${esc(choice.choice)}”.${ups.length ? ` ${ups.join(" and ")} got a boost` : ""}${ups.length && downs.length ? ", but" : ""}${downs.length ? ` ${downs.join(" and ")} paid the price` : ""}.`);
    }
    const cleaned = S.dayLog.find(x => x.k === "cleaned"); if (cleaned) lines.push(`You scrubbed ${cleaned.n} solar panel${cleaned.n > 1 ? "s" : ""}.`);
    S.dayLog.filter(x => x.text).forEach(x => lines.push(esc(x.text)));
    if (!lines.length) lines.push("A quiet day. Remember: dusty panels make less power, and plants need harvesting!");
    Sound.sfx("done");
    openModal(`<div class="happened">
      <h1>What happened · ${cap(S.place.dayWord)} ${S.day}</h1>
      <div class="hap-grid">
        <div class="hap-list">${card("shield", "Shielding")}${card("power", "Power")}${card("life", "Life Support")}${card("food", "Greenhouse")}</div>
        <div>
          <div class="note-card"><b>Tasks</b>${S.tasks.map(t => `<div class="task-sum ${t.done ? "ok" : ""}">${t.done ? "✓" : "○"} ${esc(TASKS[t.id].title())}</div>`).join("")}</div>
          <div class="note-card"><b>${D.commander}</b>${lines.slice(0, 5).join(" ")}</div>
          <div class="note-card"><b class="yellow">Did you know?</b>${fill(rand(S.place.facts))}</div>
        </div>
      </div>
      <div class="cont-row"><button class="btn-primary" data-act="next-day">${S.day >= DAYS ? "See results" : "Continue"}</button></div>
    </div>`);
  }
  const UPG = [
    { id: "dust", icon: "sparkles", name: "Dust-repellent coating", desc: "Panels get dusty 40% slower.", cost: 25, max: 2, fx: () => (S.up.dust *= 0.6) },
    { id: "solar", icon: "zap", name: "High-efficiency panels", desc: "+20% solar power.", cost: 35, max: 2, fx: () => (S.up.solar *= 1.2) },
    { id: "life", icon: "droplets", name: "Water recycler Mk II", desc: "Life Support drains 25% slower.", cost: 30, max: 2, fx: () => (S.up.life *= 0.75) },
    { id: "grow", icon: "sprout", name: "Hydroponic racks", desc: "Plants grow 35% faster.", cost: 25, max: 2, fx: () => (S.up.grow *= 1.35) },
    { id: "wear", icon: "shield", name: "Radiation plating", desc: "Shielding wears 30% slower.", cost: 40, max: 2, fx: () => (S.up.wear *= 0.7) },
    { id: "rover", icon: "car-front", name: "Rover power pack", desc: "The rover uses 40% less battery.", cost: 25, max: 2, fx: () => (S.up.rover *= 0.6) },
    { id: "warn", icon: "radio-tower", name: "Storm radar array", desc: "+8 seconds of storm warning.", cost: 30, max: 2, fx: () => (S.up.warn += 8) },
    { id: "kit", icon: "heart-pulse", name: "Emergency supplies", desc: "+20 Life Support and +20 Greenhouse right now.", cost: 20, max: 99, fx: () => { S.life = Math.min(100, S.life + 20); S.food = Math.min(100, S.food + 20); } }
  ];
  const wallet = () => Math.floor(S.science - S.spent);
  const upCost = u => Math.round(u.cost * Math.pow(1.6, S.lv[u.id] || 0));
  function shop(from) {
    S.shopFrom = from;
    const w = wallet();
    openModal(`<div class="shop"><h1>Research and upgrades</h1>
      <p class="lead">${I("star")} <b class="yellow">${w}</b> science to spend. Upgrades last for the whole mission. Score is not reduced.</p>
      <div class="up-grid">${UPG.map(u => {
        const lv = S.lv[u.id] || 0, c = upCost(u), maxed = lv >= u.max, ok = !maxed && c <= w;
        return `<button class="up-card${maxed ? " maxed" : ""}" data-buy="${u.id}" ${ok ? "" : "disabled"}>
          <span class="up-ic">${I(u.icon)}</span><b>${u.name}</b><span class="up-d">${u.desc}</span>
          <span class="up-foot">${u.max < 99 ? `<i class="pips">${Array.from({ length: u.max }, (_, k) => `<s class="${k < lv ? "on" : ""}"></s>`).join("")}</i>` : ""}<em>${maxed ? "MAX" : c + " ★"}</em></span></button>`;
      }).join("")}</div>
      <div class="cont-row"><button class="btn-primary" data-act="shop-done">${from === "day" ? "Continue to the next " + S.place.dayWord : "Done"}</button></div></div>`);
  }
  function buy(id) {
    const u = UPG.find(x => x.id === id); if (!u || !S) return;
    const lv = S.lv[id] || 0, c = upCost(u); if (lv >= u.max || c > wallet()) return;
    S.spent += c; S.lv[id] = lv + 1; u.fx(); Sound.sfx("task");
    const sc = $(".shop"); const keep = sc ? sc.scrollTop : 0; shop(S.shopFrom); toast(`Installed: <b class="yellow">${u.name}</b>`, 2500);
  }
  function advanceDay() { S.day++; startDay(); }
  function nextDay() { closeModal(); if (S.day >= DAYS) return results(true); if (wallet() >= 20) return shop("day"); advanceDay(); }
  function fail(reason) { if (S.over) return; S.failReason = reason; results(false); }

  function chart() {
    const W = 560, H = 210, pl = 30, pr = 10, pt = 10, pb = 24;
    const x = d => pl + (d / DAYS) * (W - pl - pr), y = v => H - pb - (v / 100) * (H - pt - pb);
    const pts = [{ d: 0, life: 80, power: 80, shield: 75 }, ...S.hist];
    const line = (k, c) => `<polyline fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => `${x(p.d).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ")}"/>`;
    const grid = [0, 50, 100].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#2c3a80"/><text x="2" y="${y(v) + 4}">${v}</text>`).join("");
    const days = Array.from({ length: DAYS + 1 }, (_, d) => `<text x="${x(d) - 3}" y="${H - 6}">${d}</text>`).join("");
    return `<svg class="res-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="How Life Support, Power and Shielding changed during the mission">${grid}${days}${line("life", "#7cc4ff")}${line("power", "#ffd54a")}${line("shield", "#ff6b35")}</svg>
      <div class="legend"><span><i style="background:#7cc4ff"></i>Life Support</span><span><i style="background:#ffd54a"></i>Power</span><span><i style="background:#ff6b35"></i>Shielding</span></div>`;
  }
  function results(success) {
    S.over = true; closeModal(); clearRun();
    Sound.music(null); Sound.voice(success ? "vo-win" : "vo-lose");
    const L = Math.round(S.life), P = Math.round(S.power), Sh = Math.round(S.shield);
    const crit = [success, success && Math.round(S.science) >= Math.round(60 * DAYS / 8), success && Math.min(L, P, Sh) >= 40];
    const stars = crit.filter(Boolean).length;
    const final = Math.round(S.science) * 3 + L + P + Sh + (success ? 100 : 0) + S.stats.tasksDone * 10;
    const st = S.stats;
    const xpGain = Math.round(final / 4);
    profile.xp += xpGain; profile.stars += stars; profile.missions++; profile.science = Math.round(profile.science + S.science); profile.lastSite = S.site.name; saveProfile();
    const learned = [
      "Shielding uses power, and power is limited. Every choice has a gain and a cost.",
      `You scrubbed solar panels ${st.cleaned} time${st.cleaned === 1 ? "" : "s"}. Dust really cuts power${S.placeId === "mars" ? " on Mars" : ""}.`,
      st.stormsFaced.length ? `You faced ${st.stormsFaced.length} real solar storm${st.stormsFaced.length > 1 ? "s" : ""} from NASA DONKI: ${st.stormsFaced.map(s => `${s.date} (${s.speed.toLocaleString()} km/s, Shielding −${s.lost}${s.mostly === "shelter" ? ", in the shelter" : ""})`).join("; ")}.` : "No storm reached you this time.",
      st.lateWarnings ? `${st.lateWarnings} storm warning${st.lateWarnings > 1 ? "s were" : " was"} late because your radio was quiet.` : "Staying in touch with Earth gave you early storm warnings.",
      S.placeId === "mars" ? `Messages to Mars took about ${S.delayMin} minutes each way today, so help from Earth comes slowly.` : "On the Moon, Earth answers in about 1.3 seconds — help is fast.",
      `You completed ${st.tasksDone} tasks, harvested ${st.harvested} time${st.harvested === 1 ? "" : "s"}, studied ${st.rocks} rock${st.rocks === 1 ? "" : "s"} and brought back ${st.ice} ice core${st.ice === 1 ? "" : "s"}.`
    ];
    const led = S.tk ? S.tk.led : null;
    const TIP = { life: "Tip: hold USE at Life Support to purify water, and bring ice from the Ice Drill.", power: "Tip: scrub dusty solar panels first. Dust cuts solar power a lot.", shield: "Tip: hide in the Storm Shelter when the alarm sounds, and charge the Shield Generator." };
    const lostKey = !success && /Life/i.test(S.failReason) ? "life" : !success && /Shield/i.test(S.failReason) ? "shield" : !success ? "power" : null;
    const ledger = led ? `<h2>Gained and lost</h2><table class="ledger"><tr><th></th><th class="g">Gained</th><th class="l">Lost</th><th>Net</th></tr>${TK.map(k => { const g = Math.round(led[k][0]), l = Math.round(led[k][1]), n = g - l; return `<tr><td>${TKN[k]}</td><td class="g">+${g}</td><td class="l">−${l}</td><td class="${n >= 0 ? "g" : "l"}">${n >= 0 ? "+" : "−"}${Math.abs(n)}</td></tr>`; }).join("")}</table>` : "";
    render(`<section class="screen results">
      <h1>${success ? "Mission success!" : "Mission over"}</h1>
      <p class="muted" style="text-align:center">${success ? `${esc(S.site.name)} outpost survived ${DAYS} ${S.place.dayWord}s.` : "The crew flew home safely. Try a new plan!"}</p>
      ${!success && lostKey ? `<div class="why-lost"><b>Why you lost:</b> ${esc(S.failReason)}<br><span>${TIP[lostKey]}</span></div>` : ""}
      <div class="stars" aria-label="${stars} of 3 stars">${[0, 1, 2].map(i => `<span class="${i < stars ? "on" : "off"}">★</span>`).join("")}</div>
      <div class="xp-gain">+${xpGain} XP · Level ${Math.floor(profile.xp / 100) + 1}</div>
      <div class="res-grid">
        <div class="card"><h2>Score</h2>
          <div class="score-row"><span>Final</span><b class="yellow">${final}</b></div>
          <div class="score-row"><span>Science</span><b>${Math.round(S.science)}</b></div>
          <div class="score-row"><span>Life · Power · Shield</span><b>${L} · ${P} · ${Sh}</b></div>
          <div class="score-row"><span>Tasks completed</span><b>${st.tasksDone}</b></div>
          ${chart()}
          <ul class="decisions" style="margin-top:14px">
            <li>${crit[0] ? "★" : "☆"} Keep the crew safe for ${DAYS} ${S.place.dayWord}s</li>
            <li>${crit[1] ? "★" : "☆"} Send ${Math.round(60 * DAYS / 8)}+ science to Earth</li>
            <li>${crit[2] ? "★" : "☆"} End with all three meters at 40+</li></ul></div>
        <div class="card">${ledger}<h2>Key decisions</h2>
          <ul class="decisions">${S.decisions.slice(-8).map(d => `<li>${esc(cap(d))}</li>`).join("") || "<li>No decisions this time.</li>"}</ul>
          <h2>What you learned</h2><ul class="learned">${learned.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>
      </div>
      <div class="res-btns">
        <button class="btn-primary" data-act="again">Play again</button>
        <button class="btn-secondary" data-go="dest">Switch destination</button>
        <button class="btn-secondary" data-go="home">Main menu</button>
      </div></section>`, { world: true, dim: true, place: S.placeId });
  }

  /* =========================================================
     HUD
     ========================================================= */
  function buildHud() {
    hud.innerHTML = `
      <div class="dmg-flash" id="dmg-flash"></div>
      <div class="coach" id="coach" hidden></div>
      <div class="squad" id="squad" hidden></div>
      <div class="h-tasks" id="h-tasks"></div>
      <div class="h-clock"><div class="h-medal" id="h-medal"><div class="h-sol" id="h-sol"></div></div><div class="h-sci" id="h-sci"></div><div class="h-fc" id="h-fc"></div></div>
      <div class="h-topright"><button class="hbtn" data-act="nasa" aria-label="Live from NASA" title="Live from NASA">${I("telescope")}</button><button class="hbtn" id="g-menu" aria-label="Menu">${I("menu")}</button></div>
      <div class="h-meters">${METERS.map(m => `<div class="h-meter" data-k="${m.k}" style="--c:${m.color}"><span class="h-ic">${I(m.icon)}</span>
        <div class="h-mid"><span class="h-bar"><i id="m-${m.k}"></i></span><span class="h-name">${m.name}</span><i class="h-trend" id="t-${m.k}"></i><b id="v-${m.k}">0</b></div></div>`).join("")}
        <div class="h-crew" id="h-crew"></div></div>
      <div class="h-actions">
        <div class="stack">
          <button class="round crewb" data-act="crew" aria-label="Crew jobs">${I("users")}<small>Crew</small></button>
          <button class="round radio" id="mc-btn" data-act="reopen" aria-label="Mission Control">${I("radio-tower")}<small id="mc-txt">Radio</small></button>
          <button class="round radar" id="alert-btn" data-act="sunwatch" aria-label="Sun Watch: real NASA solar storms"><span class="sweep"></span><b id="alert-txt">${I("sun")}</b><small>Sun Watch</small></button>
        </div>
        <button class="jump" id="jump-btn" aria-label="Jump">${I("arrow-up")}<span>JUMP</span></button>
        <button class="use" id="use-btn" aria-label="Use"><svg class="use-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" id="use-prog"/></svg><span class="use-ic" id="use-ic">${I("hand")}</span><span class="use-lb" id="use-lb">USE</span></button>
      </div>`;
    const use = $("#use-btn");
    const on = e => { e.preventDefault(); Sound.unlock(); World.keys.act = true; use.classList.add("down"); };
    const off = () => { World.keys.act = false; use.classList.remove("down"); };
    const jb = $("#jump-btn");
    jb.addEventListener("pointerdown", e => { e.preventDefault(); Sound.unlock(); World.keys.jump = true; jb.classList.add("down"); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => jb.addEventListener(ev, () => { World.keys.jump = false; jb.classList.remove("down"); }));
    use.addEventListener("pointerdown", on); use.addEventListener("pointerup", off); use.addEventListener("pointerleave", off); use.addEventListener("pointercancel", off);
  }
  /* ---------- gains and losses: floating numbers, trend arrows, ledger ---------- */
  const TK = ["life", "power", "shield", "food", "science"], TKN = { life: "Life", power: "Power", shield: "Shield", food: "Food", science: "Science" };
  function trackInit() { S.tk = { prev: {}, acc: {}, rate: {}, led: {}, t: performance.now(), win: performance.now() }; TK.forEach(k => { S.tk.prev[k] = S[k]; S.tk.acc[k] = 0; S.tk.rate[k] = 0; S.tk.led[k] = [0, 0]; }); }
  function trackDeltas() {
    if (!S.tk) trackInit();
    const T = S.tk, now = performance.now(), dtS = Math.max(0.05, (now - T.t) / 1000); T.t = now;
    TK.forEach(k => {
      const d = S[k] - T.prev[k]; T.prev[k] = S[k];
      if (Math.abs(d) < 40) { T.acc[k] += d; T.led[k][d >= 0 ? 0 : 1] += Math.abs(d); }
      T.rate[k] += (d / dtS - T.rate[k]) * 0.15;
      const el = $("#t-" + k); if (el) { const r = T.rate[k]; el.textContent = r > 0.35 ? "▲" : r < -0.35 ? "▼" : ""; el.className = "h-trend " + (r > 0.35 ? "up" : r < -0.35 ? "down" : ""); el.title = r > 0 ? "rising" : "falling"; }
    });
    if (now - T.win > 1200) {
      T.win = now;
      TK.forEach(k => {
        const a = T.acc[k]; T.acc[k] = 0;
        if (Math.abs(a) < (k === "science" ? 1 : 3.5)) return;
        floatChip(k, a);
      });
    }
  }
  function floatChip(k, a) {
    const up = a > 0, row = k === "science" ? $("#h-sci") : $(`.h-meter[data-k="${k}"]`); if (!row) return;
    const r = row.getBoundingClientRect(), chip = document.createElement("div");
    chip.className = "fx-float " + (up ? "up" : "down");
    chip.textContent = `${up ? "+" : "−"}${Math.round(Math.abs(a))} ${TKN[k]}`;
    chip.style.left = (k === "science" ? r.left + r.width / 2 - 40 : r.right + 10) + "px"; chip.style.top = r.top + "px";
    document.body.appendChild(chip); setTimeout(() => chip.remove(), 1900);
    row.classList.remove("flash-up", "flash-down"); void row.offsetWidth; row.classList.add(up ? "flash-up" : "flash-down");
    if (up) Sound.sfx("gain");
    else { Sound.sfx("loss"); if (a < -8 && k !== "food") { const f = $("#dmg-flash"); if (f) { f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); } } }
  }
  function updateHud() {
    trackDeltas();
    METERS.forEach(m => {
      const v = Math.round(S[m.k]);
      const b = $(`#m-${m.k}`); b.style.width = v + "%";
      $(`#v-${m.k}`).textContent = v;
      const row = b.closest(".h-meter"); row.classList.toggle("danger", v < 25); row.classList.toggle("low", v >= 25 && v < 45);
    });
    $("#h-sol").innerHTML = `<small>${S.place.dayWord.toUpperCase()}</small><b>${S.day}</b><i>of ${DAYS}</i>`;
    $("#h-medal").style.setProperty("--p", Math.min(100, (S.t / DAY_LEN) * 100).toFixed(1));
    $("#h-sci").innerHTML = `${I("star")} ${Math.floor(S.science)} science`;
    { const fc = $("#h-fc"); const on = S.forecast && S.forecast.day >= S.day && !(S.forecast.day === S.day && S.stormStarted); fc.hidden = !on; if (on) fc.innerHTML = `${I("cloud-fog")} Storm forecast: ${cap(S.place.dayWord)} ${S.forecast.day} · ${S.forecast.speed.toLocaleString()} km/s`; }
    const doneN = S.tasks.filter(t => t.done).length;
    const html = `<div class="ribbon"><span>${cap(S.place.dayWord)} ${S.day} tasks</span><span>${doneN}/${S.tasks.length}</span></div>
      <div class="ht-bar"><i style="width:${(doneN / S.tasks.length) * 100}%"></i></div>
      <ul>${S.tasks.map((t, i) => `<li class="${t.done ? "done" : ""} ${S.guideIdx === i ? "sel" : ""}" data-task="${i}" role="button" tabindex="0"><span class="ck">${t.done ? I("check") : ""}</span><span>${esc(TASKS[t.id].title())}</span>${t.need > 1 ? `<em>${t.n}/${t.need}</em>` : ""}</li>`).join("")}</ul>
      ${S.cargo || S.carrying ? `<div class="ht-carry">${S.cargo ? `Carrying: <b>${S.cargo === "ice" ? "ice core" : "lander part"}</b> ` : ""}${S.carrying ? `Rocks: <b>${S.carrying}/3</b>` : ""}</div>` : ""}`;
    const ht = $("#h-tasks"); if (ht._html !== html) { ht.innerHTML = html; ht._html = html; }
    const w = World.where();
    $("#h-crew").innerHTML = `${I("heart-pulse")} 4 crew · ${S.storm && S.storm.phase === "hit" ? (w === "shelter" ? "in the shelter" : "in danger!") : S.food <= 0 ? "hungry!" : S.life < 25 ? "short of air!" : "all well"}${World.player.inRover ? ` · rover ${Math.round(World.rover.battery)}%` : ""}`;
    const cur = World.current(), use = $("#use-btn");
    if (cur && cur.pr) {
      use.classList.toggle("off", !cur.pr.enabled);
      $("#use-lb").textContent = cur.o.kind === "rover" ? (World.player.inRover ? "EXIT" : "DRIVE") : cur.pr.enabled ? (cur.pr.tap ? "FIX" : cur.pr.continuous ? "HOLD" : "USE") : "—";
      const icn = cur.o.kind === "rover" ? "car-front" : cur.o.kind === "panel" ? "sparkles" : cur.pr.tap ? "wrench" : "hand";
      if (use._ic !== icn) { $("#use-ic").innerHTML = I(icn); use._ic = icn; }
      $("#use-prog").style.strokeDashoffset = cur.pr.hold ? 289 * (1 - Math.min(1, cur.prog / cur.pr.hold)) : 289;
      use.title = cur.pr.text;
    } else { use.classList.add("off"); $("#use-lb").textContent = "USE"; if (use._ic !== "hand") { $("#use-ic").innerHTML = I("hand"); use._ic = "hand"; } $("#use-prog").style.strokeDashoffset = 289; }
    $("#alert-btn").classList.toggle("hot", !!S.storm);
    $("#alert-txt").innerHTML = S.storm ? (S.storm.phase === "coming" ? `${Math.ceil(S.storm.eta)}s` : "!!") : I("sun");
    $("#mc-btn").classList.toggle("ping", !!(S.pending && !S.modalOpen));
    $("#mc-txt").textContent = S.ask ? `${Math.ceil(S.ask.left)}s` : S.pending ? (S.pending.tip ? "Reply!" : "Decide") : S.linkDay >= S.day || S.relayUntil >= S.day ? "Linked" : "Quiet";
    const tk = $("#g-ticker"); let msg = "", cls = "";
    if (S.storm && S.storm.phase === "coming") { msg = `Solar storm arrives in ${Math.ceil(S.storm.eta)} s — get to the Storm Shelter!`; cls = "danger"; }
    else if (S.storm) { msg = w === "shelter" ? "Storm hitting! Stay in the shelter…" : "Storm hitting! Get to the Storm Shelter!"; cls = "danger"; }
    else if (S.blackout > 0) { msg = `Power is out! ${Math.max(0, Math.ceil(10 - S.blackout))} s until shutdown — scrub the panels!`; cls = "danger"; }
    else if (S.leakAt) { msg = `Air leak in the ${World.obj(S.leakAt).label}! Patch it.`; cls = "warn"; }
    else if (S.broken) { msg = "The water recycler is broken — fix it in Life Support."; cls = "warn"; }
    else if (World.player.inRover && World.rover.battery < 20) { msg = "Rover battery low! Drive back to the yellow charging pad."; cls = "warn"; }
    else if (S.power < 30) { msg = "Power is low. Scrub dusty panels or save energy."; cls = "warn"; }
    else if (S.shield < 35) { msg = "Shielding is low. Charge it at the Shield Generator."; cls = "warn"; }
    else if (S.sunsetNow) msg = `Sunset — the ${S.place.dayWord} is ending.${S.placeId === "mars" ? " Mars sunsets really are blue!" : ""}`;
    tk.textContent = msg; tk.className = `ticker ${cls}`; tk.hidden = !msg;
  }
  function toast(html, ms = 3500) {
    const t = $("#g-toast"); t.innerHTML = html; t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  /* ---------- modals ---------- */
  function openModal(html) {
    if (S) { S.modalOpen = true; Object.keys(World.keys).forEach(k => (World.keys[k] = false)); }
    mbox.className = "modal-box"; mbox.innerHTML = html; modal.hidden = false;
    const f = mbox.querySelector("button.btn-primary:not([disabled])"); if (f) f.focus({ preventScroll: true });
  }
  function videoModal() {
    openModal(`<div class="vid-box"><h2>How to play Lunar Outpost</h2>
      <video src="assets/video/how-to-play.mp4" poster="assets/video/how-to-play.jpg" controls autoplay playsinline preload="auto"></video>
      <p class="vid-note">1 min 07 s · voice-over by ElevenLabs · footage from the real game</p>
      <button class="btn-primary" data-act="vidclose">Close</button></div>`);
    Sound.stopVoice(); Sound.music(null);
  }
  function closeModal() { Mini.stop(); modal.hidden = true; mbox.innerHTML = ""; SunWatch.close(); if (S) S.modalOpen = false; }
  function pauseMenu() {
    openModal(`<div class="pause"><h2>Paused</h2>
      <button class="btn-primary" data-act="resume">Resume</button>
      <button class="btn-secondary" data-act="shop">Research and upgrades</button>
      <button class="btn-secondary" data-act="sunwatch">Sun Watch (NASA data)</button>
      <button class="btn-secondary" data-act="controls">Controls</button>
      <button class="btn-secondary" data-act="quit">Quit to main menu</button></div>`);
  }
  function settingsModal() {
    const big = document.documentElement.classList.contains("big");
    const row = (label, act, on, state) => `<div class="set-row"><span>${label}</span><button class="toggle" data-act="${act}" aria-pressed="${on}" aria-label="${label}: ${state}"></button></div>`;
    modal.hidden = false; mbox.className = "modal-box";
    if (S) { S.modalOpen = true; }
    mbox.innerHTML = `<div class="pause"><h2>Settings</h2>
      ${row("Sound and music", "tog-sound", !Sound.muted, Sound.muted ? "off" : "on")}
      <div class="set-row"><span>Language</span><span class="langs">${I18N.codes.map(c => `<button class="lang-b${c === I18N.lang ? " on" : ""}" data-lang="${c}">${I18N.names[c]}</button>`).join("")}</span></div>
      <div class="set-row vol"><label for="vol-m">Music</label><input type="range" id="vol-m" min="0" max="100" value="${Math.round(Sound.musicVol * 100)}"></div>
      <div class="set-row vol"><label for="vol-s">Sound effects</label><input type="range" id="vol-s" min="0" max="100" value="${Math.round(Sound.sfxVol * 100)}"></div>
      ${row("Larger text", "tog-text", big, big ? "on" : "off")}
      ${row("High quality graphics", "tog-gfx", profile.q === "high", profile.q)}
      <p class="vid-note">Music: original tracks made with ElevenLabs. Models: Kenney and Quaternius (CC0).</p>
      <button class="btn-secondary sm" data-act="credits">Credits</button>
      <button class="btn-secondary sm" data-act="reset-progress">Reset saved progress</button>
      <button class="btn-primary" data-act="${S && !S.over && !S.attract && !S.intro ? "resume" : "close-sw"}">Done</button></div>`;
  }
  document.addEventListener("input", e => { if (e.target.id === "vol-m") Sound.setMusicVol(e.target.value / 100); else if (e.target.id === "vol-s") { Sound.setSfxVol(e.target.value / 100); Sound.sfx("gain"); } });
  const CREDITS = [
    ["NASA data and facts", [["DONKI space weather", "Real coronal mass ejection records from NASA / CCMC (api.nasa.gov, ccmc.gsfc.nasa.gov/tools/DONKI)", "NASA Open Data"], ["Mission facts", "Phoenix, LCROSS, MRO, MOXIE, ISS water recovery, Veggie, 3D Printing in Zero-G, ARISS, Apollo, Human Research Program", "NASA public material"]]],
    ["3D models", [["NASA 3D Resources", "Apollo Lunar Module, Viking Lander, Perseverance rover, Habitat Demonstration Unit, DSN 34 m antenna, Ingenuity", "Public domain · github.com/nasa/NASA-3D-Resources"], ["Space Kit", "Kenney (kenney.nl): base modules, corridors, props, rocks", "CC0 1.0"], ["Astronaut and Solar Panel", "Quaternius (quaternius.com, via poly.pizza)", "CC0 1.0"]]],
    ["Textures and maps", [["Poly Haven", "Ground textures: Gray Rocks, Red Laterite Soil Stones (polyhaven.com)", "CC0 1.0"], ["Solar System Scope", "Mars, Moon and Earth maps, based on NASA data (solarsystemscope.com/textures), resized", "CC BY 4.0"]]],
    ["Audio", [["Narration and voice lines", "ElevenLabs text-to-speech, voice Atlas", "AI generated"], ["Music", "Lobby, exploration, storm and drop tracks made with ElevenLabs Music v2.5", "AI generated"], ["Sound effects", "Synthesized live with the Web Audio API", "No sample files"]]],
    ["Software, fonts and icons", [["three.js r128", "3D engine (threejs.org)", "MIT"], ["PeerJS 1.5.4", "Squad play (peerjs.com)", "MIT"], ["Lucide", "Icons (lucide.dev)", "ISC"], ["Orbitron, Rajdhani, Noto Sans Devanagari", "Fonts from Google Fonts", "SIL OFL 1.1"]]],
    ["Super Intelligence (SI) tools used", [["Code, data and text", "Written with help from Claude (Anthropic): the game code, event texts, Hindi translation and documentation. Team Pheonix directed and reviewed it.", "SI-assisted"], ["Voice and music", "Narration, voice lines and music were generated by ElevenLabs. Every audio file carries an SI-generated tag in its metadata.", "SI-generated"], ["Tutorial video", "The how-to-play video has an AI voice-over and a visible SI watermark. Its footage is rendered by the game itself.", "SI-assisted"], ["Images", "No images were generated by SI. NASA pictures are shown unchanged with credit. No NASA logos, flags or mission identifiers appear in SI-generated content.", ""], ["Full list", "AI-DISCLOSURE.md in the project", ""]]]
  ];
  function creditsModal() {
    openModal(`<div class="credits-box"><h2>Credits</h2>
      <p class="vid-note"><b>Lunar Outpost</b> is a student project by Team Pheonix for the NASA International Space Apps Challenge 2026. It is not made, sponsored or endorsed by NASA.</p>
      ${CREDITS.map(([h, rows]) => `<h3>${h}</h3><ul>${rows.map(([n, d, l]) => `<li><b>${n}</b> <span>${d}</span>${l ? ` <em>${l}</em>` : ""}</li>`).join("")}</ul>`).join("")}
      <p class="vid-note">Full list: assets/CREDITS.md</p>
      <button class="btn-primary" data-act="resume">Close</button></div>`);
  }
  async function nasaModal() {
    const env = S && S.env ? S.env : SpaceEnv.forSite(dest, site || D.places[dest].sites[0], new Date()), sname = (S && S.site ? S.site : site || D.places[dest].sites[0]).name;
    const lines = SpaceEnv.describe(env).map(([k, v]) => `<li><b>${k}</b> <span>${esc(v)}</span></li>`).join("");
    openModal(`<div class="nasabox"><h2>Live from NASA</h2>
      <div class="nl-grid"><figure id="nl-sun"><div class="ph"></div><figcaption>Loading the Sun…</figcaption></figure><figure id="nl-2"><div class="ph"></div><figcaption>Loading…</figcaption></figure></div>
      <h3>Today at ${esc(sname)}</h3><ul class="nl-list">${lines}</ul>
      <p class="vid-note">Pictures are NASA's and are shown unchanged. Sources: SDO (sdo.gsfc.nasa.gov), ${dest === "mars" ? "Mars 2020 raw images (mars.nasa.gov)" : "EPIC on DSCOVR (epic.gsfc.nasa.gov)"}. Sun, Mars and Moon numbers are computed from the date. Archived means the live service did not answer.</p>
      <button class="btn-primary" data-act="resume">Close</button></div>`);
    const set = (id, html) => { const f = document.getElementById(id); if (f) f.innerHTML = html; };
    const sn = NasaLive.sun(); set("nl-sun", `<img src="${sn.url}" alt="The Sun now" onerror="this.parentNode.querySelector('figcaption').textContent='The Sun picture is not available right now.'"><figcaption><span class="badge live">Live</span> ${esc(sn.caption)} <i>Image: NASA/SDO</i></figcaption>`);
    if (dest === "mars") {
      const m = await NasaLive.mars();
      if (!m) return set("nl-2", `<div class="ph"></div><figcaption>No Perseverance pictures could be loaded.</figcaption>`);
      const it = m.items[0];
      set("nl-2", `<img src="${it.url}" alt="Perseverance ${esc(it.cam)}"><figcaption><span class="badge ${m.live ? "live" : "arch"}">${m.live ? "Live" : "Archived"}</span> Newest picture from Perseverance: sol ${it.sol}, ${esc(it.cam)}, ${esc((it.date || "").slice(0, 10))}. <i>Image: NASA/JPL-Caltech</i> <a href="${it.link}" target="_blank" rel="noopener">raw images</a></figcaption>`);
    } else {
      const e = await NasaLive.earth();
      if (!e) return set("nl-2", `<div class="ph"></div><figcaption>No Earth picture could be loaded.</figcaption>`);
      set("nl-2", `<img src="${e.url}" alt="Earth"><figcaption><span class="badge ${e.live ? "live" : "arch"}">${e.live ? "Live" : "Archived"}</span> Earth today (${esc(e.date)}). Your home planet, seen from a million miles away. <i>Image: NASA/DSCOVR EPIC</i></figcaption>`);
    }
  }
  const SUITS = [["Orange", 0xff6b35], ["Blue", 0x4c8dff], ["Green", 0x2ecc71], ["Pink", 0xff6bd5], ["Purple", 0xa070ff], ["Gold", 0xffc94a], ["Red", 0xe0453a], ["Teal", 0x1ed6c4]];
  function suitModal() {
    const hex = c => "#" + c.toString(16).padStart(6, "0");
    openModal(`<div class="suit-box"><h2>Your astronaut</h2>
      <label class="nm">Call sign<input id="suit-name" maxlength="14" value="${esc(profile.name)}" autocomplete="off"></label>
      <div class="swatches" role="radiogroup" aria-label="Suit colour">${SUITS.map(([n, c]) => `<button class="sw ${c === profile.suit ? "on" : ""}" role="radio" aria-checked="${c === profile.suit}" aria-label="${n}" data-suit="${c}" style="--c:${hex(c)}"></button>`).join("")}</div>
      <p class="vid-note">Teammates see your colour and call sign in multiplayer.</p>
      <button class="btn-primary" data-act="suit-save">Save</button></div>`);
    mbox.querySelectorAll(".sw").forEach(b => b.addEventListener("click", () => { profile.suit = +b.dataset.suit; World.setSuit(profile.suit); mbox.querySelectorAll(".sw").forEach(x => x.classList.toggle("on", x === b)); }));
  }
  function suitSave() { const v = ($("#suit-name") || {}).value || ""; profile.name = v.trim().slice(0, 14) || "Commander"; saveProfile(); closeModal(); if (MP.role !== "off") MP.setSuit(profile.suit); if (lobbyOn) lobby(); else if (!S || S.attract) home(); }
  /* ---------- coach: sensible step-by-step hints in the first mission ---------- */
  const COACH = [
    { t: "Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> (or drag the joystick on a phone). Walk a few steps!", hi: "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> से चलें (फ़ोन पर जॉयस्टिक खींचें)। कुछ कदम चलें!", ok: c => Math.hypot(World.player.x - c.x0, World.player.y - c.y0) > 160 },
    { t: "Look around: hold the mouse and drag, or press <kbd>Q</kbd> / <kbd>R</kbd> to turn the camera. Scroll to zoom.", hi: "चारों ओर देखें: माउस दबाकर खींचें, या कैमरा घुमाने के लिए <kbd>Q</kbd> / <kbd>R</kbd> दबाएँ। ज़ूम के लिए स्क्रॉल करें।", ok: c => Math.abs(World.yaw - c.yaw0) > 0.45 },
    { t: "Press <kbd>Space</kbd> (or the JUMP button) to jump. Gravity here is much weaker than on Earth!", hi: "कूदने के लिए <kbd>Space</kbd> (या JUMP बटन) दबाएँ। यहाँ गुरुत्व पृथ्वी से बहुत कम है!", ok: () => S.stats.jumps >= 1 },
    { t: "Your tasks are at the top left. Follow the <b class='yellow'>yellow arrow ➤</b> to the first one.", hi: "आपके काम ऊपर बाईं ओर हैं। पहले काम तक पहुँचने के लिए <b class='yellow'>पीले तीर ➤</b> का पीछा करें।", ok: c => c.t > 14 || S.tasks.some(t => t.n > 0 || t.done) },
    { t: "Stand next to a glowing object and press <kbd>E</kbd> (or the USE button). Some jobs need you to <b>hold</b> it.", hi: "किसी चमकती चीज़ के पास खड़े हों और <kbd>E</kbd> (या USE बटन) दबाएँ। कुछ कामों में इसे <b>दबाए रखना</b> पड़ता है।", ok: () => S.stats.tasksDone >= 1 || S.stats.cleaned >= 1 || S.stats.rocks >= 1 || S.stats.fixed >= 1 || S.stats.harvested >= 1 },
    { t: "Watch the four meters at the bottom left. <b class='green'>▲ green</b> = rising, <b class='red'>▼ red</b> = falling. If one reaches zero, you lose!", hi: "नीचे बाईं ओर चार मीटर देखें। <b class='green'>▲ हरा</b> = बढ़ रहा है, <b class='red'>▼ लाल</b> = घट रहा है। कोई मीटर शून्य हुआ तो आप हार जाएँगे!", ok: c => c.t > 9 },
    { t: "When the <b class='red'>storm alarm</b> rings, run to the <b>Storm Shelter</b> (the round building at the bottom). You are ready, Commander!", hi: "जब <b class='red'>तूफ़ान अलार्म</b> बजे, <b>तूफ़ान आश्रय</b> (नीचे का गोल भवन) में दौड़ें। आप तैयार हैं, कमांडर!", ok: c => c.t > 8 }
  ];
  function coachTick(dt) {
    if (profile.tutorDone || !S.tasks || S.day !== 1) { const e = $("#coach"); if (e && !e.hidden) e.hidden = true; return; }
    const el = $("#coach"); if (!el) return;
    if (!S.coach) S.coach = { i: 0, t: 0, x0: World.player.x, y0: World.player.y, yaw0: World.yaw, held: 0 };
    const c = S.coach; c.t += dt;
    if (c.i >= COACH.length) { profile.tutorDone = true; saveProfile(); el.hidden = true; return; }
    const st = COACH[c.i];
    if (el._i !== c.i) {
      el._i = c.i; el.hidden = false;
      el.innerHTML = `<div class="co-top"><span>TIP ${c.i + 1} / ${COACH.length}</span><button data-act="coach-skip" aria-label="Skip tips">Skip tips</button></div><p>${I18N.lang === "hi" && st.hi ? st.hi : st.t}</p><div class="co-dots">${COACH.map((_, j) => `<i class="${j < c.i ? "d" : j === c.i ? "on" : ""}"></i>`).join("")}</div>`;
    }
    if (st.ok(c)) { c.held += dt; if (c.held > 0.8) { c.i++; c.t = 0; c.held = 0; c.x0 = World.player.x; c.y0 = World.player.y; c.yaw0 = World.yaw; Sound.sfx("gain"); } } else c.held = 0;
  }
  function sunWatchModal() {
    const inGame = S && !S.over && !S.intro;
    const html = `<div class="sunwatch-wrap"><h2>Sun Watch</h2>
      <p class="lead">Each dot is a <b>real CME</b> from NASA's DONKI database. Drag the time slider or press Play to watch them fly out from the Sun at their real measured speeds. Tap a dot to read its record.</p>
      <div id="sw-root"></div>
      <div class="sw-close"><button class="btn-primary" data-act="${inGame ? "resume" : "close-sw"}">${inGame ? "Back to the base" : "Close"}</button></div></div>`;
    if (inGame) openModal(html); else { modal.hidden = false; mbox.className = "modal-box"; mbox.innerHTML = html; }
    SunWatch.open($("#sw-root"), { storm: inGame && S.storm ? S.storm.st : null, placeId: inGame ? S.placeId : dest });
  }

  /* =========================================================
     INPUT
     ========================================================= */
  document.addEventListener("pointerdown", () => Sound.unlock(), { once: true });
  document.addEventListener("click", e => {
    const t = e.target.closest("button, [data-task]");
    if (!t) return;
    if (t.dataset.task !== undefined && S) { S.guideIdx = +t.dataset.task; Sound.sfx("click"); updateHud(); return; }
    if (t.classList.contains("term")) return showTerm(t.dataset.term);
    if (t.id === "popup-close") return ($("#popup").hidden = true);
    if (t.id === "btn-a11y") { const on = document.documentElement.classList.toggle("big"); t.setAttribute("aria-pressed", on); World.resize(); return; }
    if (t.id === "btn-sound") { Sound.setMuted(!Sound.muted); return soundBtn(); }
    if (t.id === "cine-skip") return skipStory();
    if (t.id === "g-menu") return pauseMenu();
    if (t.dataset.mini === "cancel") { closeModal(); return; }
    if (t.dataset.dest) { dest = t.dataset.dest; Sound.sfx("click"); return destination(); }
    if (t.dataset.site !== undefined && !t.classList.contains("pin")) { Sound.sfx("click"); return globe(+t.dataset.site); }
    if (t.dataset.brief) {
      const [mode, step] = t.dataset.brief.split(":");
      if (step === "skip" || step === "end") return mode === "howto" ? home() : startMission();
      return briefing(mode, +step);
    }
    if (t.dataset.opt !== undefined && S && S.pending) { S.pending.sel = +t.dataset.opt; Sound.sfx("click"); return showChoices(); }
    const go = {
      home, dest: destination, howto: () => briefing("howto"), video: videoModal, sources, sunwatch: sunWatchModal,
      start: () => (introSeen ? lobby() : story()), resume: resumeRun, lobby, story,
      globe: () => globe(0),
      land: async () => { Sound.sfx("engine"); t.disabled = true; await Promise.race([Globe.landAnim(), wait(2500)]); briefing("start"); }
    }[t.dataset.go];
    if (go) { Sound.sfx("click"); return go(); }
    switch (t.dataset.act) {
      case "storm-choices": S.pending = { ev: D.storm, sel: null, tip: false, storm: true }; return showChoices();
      case "confirm": return confirmChoice();
      case "ask":
        if (S.power < R.askCost || S.ask) return;
        S.power -= R.askCost; S.stats.asked++;
        S.ask = { left: S.placeId === "moon" ? 2.6 : clamp(S.delayMin * 2, 6, 44), live: true };
        return showChoices();
      case "minimize": closeModal(); return toast("Keep working! Tap the radio button when Earth replies.", 4500);
      case "reopen": if (S && S.pending) { openModal(""); showChoices(); } else if (S) toast(S.linkDay >= S.day ? "Earth link is strong today." : "The radio is quiet. Check in at the Radio Dish for early storm warnings."); return;
      case "next-day": return nextDay();
      case "vidclose": closeModal(); Sound.music("explore"); return;
      case "lb-back": if (MP.role !== "off") MP.leave(); lobbyOn = false; return home();
      case "lb-host": MP.host(myInfo(), (err) => { if (err) return lobbyMsg(err); lobbyRefresh(); }); { const m = $("#lb-msg"); if (m) m.textContent = "Opening your squad…"; } return;
      case "lb-join": { const c = ($("#lb-code") || {}).value || ""; if (c.trim().length < 4) return lobbyMsg("Type the 5-letter squad code."); const m = $("#lb-msg"); if (m) { m.textContent = "Joining…"; m.classList.remove("err"); } return MP.join(c, myInfo(), err => { if (err) return lobbyMsg(err); lobbyRefresh(); }); }
      case "lb-copy": try { navigator.clipboard.writeText(MP.code); } catch (e) {} { const b = $("#lb-codebig"); if (b) b.classList.add("copied"); } return;
      case "lb-leave": MP.leave(); World.remote.clear(); return lobby();
      case "drop-skip": if (S && S.drop) endDrop(); return;
      case "lang-toggle": { const c = I18N.codes, i = c.indexOf(I18N.lang); return I18N.set(c[(i + 1) % c.length]); }
      case "credits": return creditsModal();
      case "crew": return crewModal();
      case "nasa": return nasaModal();
      case "shop": return shop("pause");
      case "shop-done": closeModal(); if (S && S.shopFrom === "day") { S.shopFrom = null; advanceDay(); } return;
      case "suit": return suitModal();
      case "suit-save": return suitSave();
      case "coach-skip": profile.tutorDone = true; saveProfile(); { const e = $("#coach"); if (e) e.hidden = true; } return;
      case "resume": closeModal(); if (S && S.pending && !S.ask) { openModal(""); showChoices(); } return;
      case "close-sw": SunWatch.close(); modal.hidden = true; return;
      case "sunwatch": return sunWatchModal();
      case "controls": return openModal(`<div class="pause"><h2>Controls</h2><p>Move: W A S D or arrow keys, or click/tap where to go. On a phone: drag on the left side.</p><p>Use / drive: E, Enter, or the orange USE button</p><p>Jump: Space (or the JUMP button). Gravity is real: you jump higher on the Moon than on Mars!</p><p>Look around: drag the mouse · Q / R turn the camera · scroll to zoom</p><p>Tasks: click a task to point the arrow at it</p><button class="btn-primary" data-act="resume">Back to the base</button></div>`);
      case "quit": return home();
      case "settings": return settingsModal();
      case "tog-sound": Sound.setMuted(!Sound.muted); soundBtn(); return settingsModal();
      case "tog-text": document.documentElement.classList.toggle("big"); World.resize(); return settingsModal();
      case "tog-gfx": profile.q = profile.q === "high" ? "low" : "high"; saveProfile(); World.setQuality(profile.q); return settingsModal();
      case "reset-progress": Object.assign(profile, { xp: 0, stars: 0, missions: 0, science: 0, lastSite: null }); saveProfile(); closeModal(); return home();
      case "again": return startMission();
    }
  });
  setInterval(() => {
    if (!S || !S.modalOpen) return;
    const a = document.getElementById("ask-left"); if (a && S.ask) a.textContent = `${Math.ceil(S.ask.left)} s`;
    const e = document.getElementById("storm-eta"); if (e && S.storm) e.textContent = Math.max(0, Math.ceil(S.storm.eta));
  }, 250);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("#popup").hidden) return ($("#popup").hidden = true);
      if (S && S.intro) return skipStory();
      if (S && !S.over && !gameEl.hidden && !S.modalOpen) return pauseMenu();
    }
    if (S && S.pending && S.modalOpen && !mbox.querySelector(".mini")) {
      const i = { a: 0, b: 1, c: 2, 1: 0, 2: 1, 3: 2 }[e.key.toLowerCase()];
      if (i !== undefined && i < S.pending.ev.choices.length) { S.pending.sel = i; showChoices(); }
    }
  });
  function showTerm(term) {
    const key = Object.keys(D.glossary).find(k => k.toLowerCase() === term.toLowerCase());
    $("#popup-title").textContent = cap(term); $("#popup-text").textContent = key ? D.glossary[key] : "";
    $("#popup").hidden = false; $("#popup-close").focus();
  }

  /* ---------- start ---------- */
  World.init($("#world"), {
    isRunning: () => S && !S.over && !S.modalOpen && !S.intro,
    view: () => ({
      life: S.life, power: S.power, shield: S.shield, food: S.food, growth: S.growth, dust: S.dust,
      broken: S.broken, leakAt: S.leakAt, samples: S.samples, carrying: S.carrying, stored: S.stored, cargo: S.cargo,
      sending: S.sending > 0, boosting: S.boosting > 0, storm: S.storm && S.storm.phase === "hit" ? 1 : 0,
      stormSoon: !!(S.storm && S.storm.phase === "coming"), speedMul: S.speedMul, lamps: S.power > 0, charging: S.charging,
      weatherBroken: S.weatherBroken, relayBroken: S.relayBroken, partTaken: S.partTaken, dusk: S.dusk, sunEl: S.sun ? S.sun.el : undefined, sunAz: S.sun ? S.sun.az : undefined, sunLight: S.sun ? S.sun.light : undefined, earthIllum: S.env && S.env.earthIllum, earthWaning: !!(S.env && S.env.moon && S.env.moon.waxing),
      haze: S.placeId === "mars" && S.solarMul < 1 ? 1 - S.solarMul : 0,
      roverDrain: S.up ? S.up.rover : 1,
      guide: S.intro || !S.tasks ? null : guideTarget()
    }), prompt, done, hold, pickup,
    jump: ev => {
      Sound.sfx(ev === "up" ? "jump" : "land");
      if (ev === "up" && S && S.stats) { S.stats.jumps = (S.stats.jumps || 0) + 1; if (!S.jumpTold && S.place) { S.jumpTold = true; toast(S.placeId === "moon" ? "Moon gravity is only 1/6 of Earth's, so you hop about 6× higher!" : "Mars gravity is 38% of Earth's, so you jump about 2.6× higher than at home!", 4500); } }
    },
    rover: inRover => { Sound.sfx(inRover ? "engine" : "door"); if (inRover && S.stats) S.stats.driven++; }
  });
  soundBtn(); World.setQuality(profile.q); World.setSuit(profile.suit);
  window.__lo = { get S() { return S; }, lobby: () => lobby(), update, skipDrop: () => { if (S && S.drop) endDrop(); }, startMission, endDay, story, setDest: (d, i = 0) => { dest = d; site = D.places[d].sites[i]; } };
  requestAnimationFrame(loop);
  loading();
})();
