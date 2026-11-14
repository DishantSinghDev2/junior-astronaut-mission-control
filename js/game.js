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
  const DAY_LEN = 90, PASSIVE = 60 / DAY_LEN, DAYS = C.MISSION_DAYS;
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
  const profile = { xp: 0, stars: 0, missions: 0, science: 0, lastSite: null, q: "high" };
  try { Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}")); } catch (e) {}
  const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {} };
  let S = null, dest = "moon", site = null, last = 0, hudT = 0, toastTimer = null, introSeen = false, cineRun = null;

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
    const tick = setInterval(() => set(Math.min(88, p + 3)), 100);
    set(10, "Talking to NASA DONKI…");
    const donki = Donki.load().then(() => set(90));
    const fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
    ["intro", "explore"].forEach(n => Sound.el(n));
    const models = World.preload(f => set(15 + f * 70, `Loading 3D models… ${Math.round(f * 100)}%`));
    await Promise.all([fonts, models, Promise.race([donki, wait(6000)]), wait(1300)]);
    set(95, "Preparing the outposts…");
    await wait(50);
    try { shots.moon = await World.snapshot("moon", 505, 720, 420); shots.mars = await World.snapshot("mars", 202, 720, 420); } catch (e) { console.warn(e); }
    clearInterval(tick); set(100); await wait(300);
    home();
  }

  function home() {
    stopGame();
    Sound.music(null);
    const lvl = Math.floor(profile.xp / 100) + 1, xp = profile.xp % 100;
    const siteName = profile.lastSite || D.places.moon.sites[0].name;
    render(`<section class="title-screen">
      <div class="t-brand"><div class="patch">${I("rocket")}</div><div class="bar-v"></div>
        <div><h1>Lunar Outpost</h1><div class="sub">EXPLORE · ANALYSE · SURVIVE</div></div></div>
      <div class="t-top">
        <span class="t-stat" title="Stars earned">${I("star")} ${profile.stars}</span>
        <span class="t-stat" title="Science sent to Earth">${I("flask-conical")} ${profile.science}</span>
        <span class="t-stat" title="Missions flown">${I("flag")} ${profile.missions}</span>
      </div>
      <div class="t-left">
        <div class="t-card"><div class="t-avatar">${I("user")}</div>
          <div><b>Commander</b><small>Level ${lvl}</small><div class="xp"><i style="width:${xp}%"></i></div><div class="xp-t">${xp} / 100 XP</div></div></div>
        <nav class="t-menu" aria-label="Main menu">
          <button class="t-item primary" data-go="start">${I("play")} Start mission</button>
          <button class="t-item" data-go="sunwatch">${I("sun")} Sun Watch</button>
          <button class="t-item" data-go="howto">${I("book-open")} How to play</button>
          <button class="t-item" data-go="sources">${I("satellite")} NASA data</button>
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
          <h3>Survive 8 days at ${esc(siteName)}</h3>
          <p>Keep Life Support, Power and Shielding above zero while real NASA solar storms roll in.</p>
          ${shots.moon ? `<img src="${shots.moon}" alt="">` : ""}</div>
      </div>
      <div class="t-foot"><div class="t-note">${dataStatus()}<span>Team Pheonix · NASA Space Apps 2026</span></div>
        <button class="t-tag" data-go="start">A new frontier awaits… ${I("rocket")}</button></div>
    </section>`, { world: true, hero: true, place: "moon" });
  }

  function destination() {
    Sound.music("explore");
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
              <b>${esc(s.name)}</b><span class="coords">${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? "N" : "S"} · ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? "E" : "W"}</span>
              <p>${esc(s.desc)}</p>
              <div>${s.chips.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>
            </button>`).join("")}</div>
          <button class="btn-primary land-btn" data-go="land">Land at ${esc(site.name)}</button>
        </div>
      </div>
    </section>`);
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
      { title: "Your three meters", body: `<ul>
          <li><span class="dot" style="background:#7cc4ff">${I("wind")}</span><div><b>Life Support</b><span>Air and water for the crew</span></div></li>
          <li><span class="dot" style="background:#ffd54a">${I("zap")}</span><div><b>Power</b><span>Electricity for the whole base</span></div></li>
          <li><span class="dot" style="background:#ff6b35">${I("shield")}</span><div><b>Shielding</b><span>Protection from harmful space rays</span></div></li>
        </ul><p class="goal">Keep all three above zero.</p>` },
      { title: "How to play", body: `<ul>
          <li><span class="dot" style="background:#7cc4ff">${I("map-pin")}</span><div><b>Move and look</b><span><span class="key">W A S D</span> walk relative to the camera · drag to look around · <span class="key">Q</span> <span class="key">R</span> turn · click the ground to walk there · on a phone, drag the left side to move</span></div></li>
          <li><span class="dot" style="background:#ffd54a">${I("hand")}</span><div><b>Use things</b><span><span class="key">E</span> or <span class="key">Space</span> — or the big orange USE button. Some jobs need you to hold it.</span></div></li>
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
    destination();
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

  function startMission() {
    if (S) S.over = true;
    closeModal(); $("#popup").hidden = true; $("#cine").hidden = true;
    if (!site) site = D.places[dest].sites[0];
    const place = D.places[dest], mods = site.mods || {};
    const storms = {}, picked = Donki.pickStorms(C.STORMS_PER_MISSION);
    pickStormDays(picked.length).forEach((d, i) => (storms[d] = picked[i]));
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
      tasks: [], guideIdx: null, dayStart: null, dayLog: [], decisions: [], hist: [], sampleT: 0,
      stats: { cleaned: 0, fixed: 0, harvested: 0, rocks: 0, stormsFaced: [], asked: 0, lateWarnings: 0, tasksDone: 0, driven: 0, ice: 0 },
      delayMin: dest === "mars" ? marsDelay() : null, over: false, dusk: 0
    };
    app.hidden = true; gameEl.hidden = false; document.body.classList.add("playing"); document.body.classList.remove("cine", "menu", "dim");
    World.reset(dest, site); World.setCine(null); World.resize();
    buildHud();
    Sound.music("explore");
    startDay();
    last = performance.now();
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
  function dustiest() { let i = 0; S.dust.forEach((d, k) => { if (d > S.dust[i]) i = k; }); return World.obj("panel" + i); }
  function nearSample() { const P = World.player; let b = null, bd = 1e9; S.samples.forEach(s => { if (!s.taken) { const d = Math.hypot(s.x - P.x, s.y - P.y); if (d < bd) { bd = d; b = s; } } }); return b; }
  function planTasks() {
    let ids;
    if (S.day === 1) ids = ["clean", "study", "weather"];
    else {
      const exp = ["weather", "relay", "ice"].concat(S.partTaken ? [] : ["lander"]);
      ids = [rand(["clean", "harvest"]), rand(exp), rand(["study", "send"])];
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
    planTasks();
    spawnSamples(2 + (S.mods.samples || 0));
    if (S.day === 1) toast("Welcome, Commander! Follow the yellow arrow to your first task.", 6000);
    else { toast(`${cap(S.place.dayWord)} ${S.day} begins. New tasks are on your list.`); Sound.voice("vo-morning"); }
  }
  function spawnSamples(n) {
    let tries = 0;
    while (n > 0 && tries++ < 300) {
      const a = Math.random() * Math.PI * 2, r = 520 + Math.random() * 700;
      const x = 1800 + Math.cos(a) * r, y = 1290 + Math.sin(a) * r * 0.8;
      if (x > 80 && y > 80 && x < World.W - 80 && y < World.H - 80 && World.free(x, y)) { S.samples.push({ x, y, taken: false }); n--; }
    }
    S.samples = S.samples.filter(s => !s.taken).slice(-12);
  }

  /* =========================================================
     SIMULATION
     ========================================================= */
  const solarNow = () => S.place.solar * (S.mods.solar || 1) * (1 - 0.7 * (S.dust.reduce((a, b) => a + b, 0) / S.dust.length)) * S.solarMul * S.solarForever;

  function update(dt) {
    if (S.intro) { S.storm = S.introStorm ? { phase: "hit" } : null; return; }
    const simulate = !S.modalOpen || (S.ask && S.ask.live);
    if (S.ask) {
      S.ask.left -= dt;
      if (S.ask.left <= 0) { S.ask = null; if (!S.pending) return; S.pending.tip = true; Sound.sfx("pick"); if (S.modalOpen && S.pending) showChoices(); else toast("Mission Control replied! Tap the radio button to decide."); }
    }
    if (!simulate) return;
    const pd = dt * PASSIVE;
    S.t += dt;
    const powered = S.power > 0;
    S.power += (solarNow() - R.load) * pd;
    const rv = World.rover, pad = World.obj("pad");
    S.charging = !World.player.inRover && rv.battery < 100 && Math.hypot(rv.x - pad.x, rv.y - pad.y) < 90 && S.power > 2;
    if (S.charging) { rv.battery = Math.min(100, rv.battery + 9 * dt); S.power -= 1.0 * dt; }
    let dl = -R.lifeDrain;
    if (!S.broken && powered) dl += R.recycle;
    if (S.leakAt) dl -= R.leak;
    if (S.food <= 0) dl -= R.hungry;
    S.life += dl * pd;
    S.food -= R.foodDrain * pd;
    if (powered) S.growth = Math.min(1, S.growth + R.grow * pd);
    S.shield -= R.wear * S.wearMul * (powered ? 1 : 2) * pd;
    S.dust = S.dust.map(d => Math.min(1, d + S.place.dustRate * (S.mods.dust || 1) * pd * (0.6 + Math.random() * 0.8)));
    S.sending = Math.max(0, S.sending - dt); S.boosting = Math.max(0, S.boosting - dt);
    S.dusk = S.t > DAY_LEN * 0.82 ? Math.min(1, (S.t - DAY_LEN * 0.82) / (DAY_LEN * 0.18)) : 0;

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

    if (S.life <= 0) return fail("Life Support ran out. The crew didn't have enough air and water.");
    if (S.shield <= 0) return fail("Shielding hit zero. The crew got too much radiation.");
    if (S.blackout > 10) return fail("The base was out of power for too long.");
    if (S.t >= DAY_LEN && !S.storm && !S.pending && !S.modalOpen && (!S.storms[S.day] || S.stormStarted)) endDay();
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (S && S.attract && !gameEl.hidden) {
      attractT += dt;
      attractCine.yaw = attractT * 0.045; attractCam.x = 1800; attractCam.y = 1300;
    }
    if (S && !S.over && !gameEl.hidden) {
      update(dt);
      if (S && !S.modalOpen) World.step(dt);
      if (S) World.draw();
      hudT += dt;
      if (hudT > 0.1 && S && !S.intro && !S.over) { hudT = 0; updateHud(); }
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
      case "ice": return S.cargo ? { text: "Hands full", enabled: false } : { text: "Drill ice", hold: 2.5, enabled: true };
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
        return toast("Weather data downloaded: +10 data. Beam it home from the Radio Dish!");
      case "ice": S.cargo = "ice"; return toast("Ice core collected! Carry it to Life Support.");
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
  function nextDay() { closeModal(); if (S.day >= DAYS) return results(true); S.day++; startDay(); }
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
    S.over = true; closeModal();
    Sound.music(null); Sound.voice(success ? "vo-win" : "vo-lose");
    const L = Math.round(S.life), P = Math.round(S.power), Sh = Math.round(S.shield);
    const crit = [success, success && S.science >= 60, success && Math.min(L, P, Sh) >= 40];
    const stars = crit.filter(Boolean).length;
    const final = S.science * 3 + L + P + Sh + (success ? 100 : 0) + S.stats.tasksDone * 10;
    const st = S.stats;
    const xpGain = Math.round(final / 4);
    profile.xp += xpGain; profile.stars += stars; profile.missions++; profile.science += S.science; profile.lastSite = S.site.name; saveProfile();
    const learned = [
      "Shielding uses power, and power is limited. Every choice has a gain and a cost.",
      `You scrubbed solar panels ${st.cleaned} time${st.cleaned === 1 ? "" : "s"}. Dust really cuts power${S.placeId === "mars" ? " on Mars" : ""}.`,
      st.stormsFaced.length ? `You faced ${st.stormsFaced.length} real solar storm${st.stormsFaced.length > 1 ? "s" : ""} from NASA DONKI: ${st.stormsFaced.map(s => `${s.date} (${s.speed.toLocaleString()} km/s, Shielding −${s.lost}${s.mostly === "shelter" ? ", in the shelter" : ""})`).join("; ")}.` : "No storm reached you this time.",
      st.lateWarnings ? `${st.lateWarnings} storm warning${st.lateWarnings > 1 ? "s were" : " was"} late because your radio was quiet.` : "Staying in touch with Earth gave you early storm warnings.",
      S.placeId === "mars" ? `Messages to Mars took about ${S.delayMin} minutes each way today, so help from Earth comes slowly.` : "On the Moon, Earth answers in about 1.3 seconds — help is fast.",
      `You completed ${st.tasksDone} tasks, harvested ${st.harvested} time${st.harvested === 1 ? "" : "s"}, studied ${st.rocks} rock${st.rocks === 1 ? "" : "s"} and brought back ${st.ice} ice core${st.ice === 1 ? "" : "s"}.`
    ];
    render(`<section class="screen results">
      <h1>${success ? "Mission success!" : "Mission over"}</h1>
      <p class="muted" style="text-align:center">${success ? `${esc(S.site.name)} outpost survived ${DAYS} ${S.place.dayWord}s.` : `${esc(S.failReason)} The crew flew home safely — try a new plan!`}</p>
      <div class="stars" aria-label="${stars} of 3 stars">${[0, 1, 2].map(i => `<span class="${i < stars ? "on" : "off"}">★</span>`).join("")}</div>
      <div class="xp-gain">+${xpGain} XP · Level ${Math.floor(profile.xp / 100) + 1}</div>
      <div class="res-grid">
        <div class="card"><h2>Score</h2>
          <div class="score-row"><span>Final</span><b class="yellow">${final}</b></div>
          <div class="score-row"><span>Science</span><b>${S.science}</b></div>
          <div class="score-row"><span>Life · Power · Shield</span><b>${L} · ${P} · ${Sh}</b></div>
          <div class="score-row"><span>Tasks completed</span><b>${st.tasksDone}</b></div>
          ${chart()}
          <ul class="decisions" style="margin-top:14px">
            <li>${crit[0] ? "★" : "☆"} Keep the crew safe for ${DAYS} ${S.place.dayWord}s</li>
            <li>${crit[1] ? "★" : "☆"} Send 60+ science to Earth</li>
            <li>${crit[2] ? "★" : "☆"} End with all three meters at 40+</li></ul></div>
        <div class="card"><h2>Key decisions</h2>
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
      <div class="h-tasks" id="h-tasks"></div>
      <div class="h-clock"><div class="h-medal" id="h-medal"><div class="h-sol" id="h-sol"></div></div><div class="h-sci" id="h-sci"></div></div>
      <div class="h-topright"><button class="hbtn" id="g-menu" aria-label="Menu">${I("menu")}</button></div>
      <div class="h-meters">${METERS.map(m => `<div class="h-meter" data-k="${m.k}" style="--c:${m.color}"><span class="h-ic">${I(m.icon)}</span>
        <div class="h-mid"><span class="h-bar"><i id="m-${m.k}"></i></span><span class="h-name">${m.name}</span><b id="v-${m.k}">0</b></div></div>`).join("")}
        <div class="h-crew" id="h-crew"></div></div>
      <div class="h-actions">
        <div class="stack">
          <button class="round radio" id="mc-btn" data-act="reopen" aria-label="Mission Control">${I("radio-tower")}<small id="mc-txt">Radio</small></button>
          <button class="round radar" id="alert-btn" data-act="sunwatch" aria-label="Sun Watch: real NASA solar storms"><span class="sweep"></span><b id="alert-txt">${I("sun")}</b><small>Sun Watch</small></button>
        </div>
        <button class="use" id="use-btn" aria-label="Use"><svg class="use-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" id="use-prog"/></svg><span class="use-ic" id="use-ic">${I("hand")}</span><span class="use-lb" id="use-lb">USE</span></button>
      </div>`;
    const use = $("#use-btn");
    const on = e => { e.preventDefault(); Sound.unlock(); World.keys.act = true; use.classList.add("down"); };
    const off = () => { World.keys.act = false; use.classList.remove("down"); };
    use.addEventListener("pointerdown", on); use.addEventListener("pointerup", off); use.addEventListener("pointerleave", off); use.addEventListener("pointercancel", off);
  }
  function updateHud() {
    METERS.forEach(m => {
      const v = Math.round(S[m.k]);
      const b = $(`#m-${m.k}`); b.style.width = v + "%";
      $(`#v-${m.k}`).textContent = v;
      const row = b.closest(".h-meter"); row.classList.toggle("danger", v < 25); row.classList.toggle("low", v >= 25 && v < 45);
    });
    $("#h-sol").innerHTML = `<small>${S.place.dayWord.toUpperCase()}</small><b>${S.day}</b><i>of ${DAYS}</i>`;
    $("#h-medal").style.setProperty("--p", Math.min(100, (S.t / DAY_LEN) * 100).toFixed(1));
    $("#h-sci").innerHTML = `${I("star")} ${S.science} science`;
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
    else if (S.dusk > 0) msg = `Sunset — the ${S.place.dayWord} is ending.${S.placeId === "mars" ? " Mars sunsets really are blue!" : ""}`;
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
  function closeModal() { Mini.stop(); modal.hidden = true; mbox.innerHTML = ""; SunWatch.close(); if (S) S.modalOpen = false; }
  function pauseMenu() {
    openModal(`<div class="pause"><h2>Paused</h2>
      <button class="btn-primary" data-act="resume">Resume</button>
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
      ${row("Larger text", "tog-text", big, big ? "on" : "off")}
      ${row("High quality graphics", "tog-gfx", profile.q === "high", profile.q)}
      <button class="btn-secondary sm" data-act="reset-progress">Reset saved progress</button>
      <button class="btn-primary" data-act="${S && !S.over && !S.attract && !S.intro ? "resume" : "close-sw"}">Done</button></div>`;
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
      home, dest: destination, howto: () => briefing("howto"), sources, sunwatch: sunWatchModal,
      start: () => (introSeen ? destination() : story()), story,
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
      case "resume": closeModal(); if (S && S.pending && !S.ask) { openModal(""); showChoices(); } return;
      case "close-sw": SunWatch.close(); modal.hidden = true; return;
      case "sunwatch": return sunWatchModal();
      case "controls": return openModal(`<div class="pause"><h2>Controls</h2><p>Move: W A S D or arrow keys, or click/tap where to go. On a phone: drag on the left side.</p><p>Use / drive: E, Space, or the orange USE button</p><p>Tasks: click a task to point the arrow at it</p><button class="btn-primary" data-act="resume">Back to the base</button></div>`);
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
      weatherBroken: S.weatherBroken, relayBroken: S.relayBroken, partTaken: S.partTaken, dusk: S.dusk,
      haze: S.placeId === "mars" && S.solarMul < 1 ? 1 - S.solarMul : 0,
      guide: S.intro || !S.tasks ? null : guideTarget()
    }), prompt, done, hold, pickup,
    rover: inRover => { Sound.sfx(inRover ? "engine" : "door"); if (inRover && S.stats) S.stats.driven++; }
  });
  soundBtn(); World.setQuality(profile.q);
  window.__lo = { get S() { return S; }, update, startMission, endDay, story, setDest: (d, i = 0) => { dest = d; site = D.places[d].sites[i]; } };
  requestAnimationFrame(loop);
  loading();
})();
