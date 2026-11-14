/*
  LUNAR OUTPOST — game rules, screens and HUD.
  Real-time: each day lasts DAY_LEN seconds. Meters change every moment:
    Life Support  drains as the crew breathes; the water recycler (needs power) refills it
    Power         solar panels charge it (less when dusty); every system uses it
    Shielding     slowly wears down; solar storms smash it; the shield generator recharges it
    Greenhouse    the crew eats food; plants grow (with power) and must be harvested
  Keep Life Support, Power and Shielding above zero for 8 days.
*/
(() => {
  const D = window.GAME_DATA, C = window.CONFIG;
  const $ = s => document.querySelector(s);
  const app = $("#app"), gameEl = $("#game"), modal = $("#modal"), mbox = modal.querySelector(".modal-box");
  const DAY_LEN = 60;
  const DAYS = C.MISSION_DAYS;
  const R = {
    lifeDrain: 0.32, recycle: 0.24, leak: 0.7, hungry: 0.25,
    foodDrain: 0.22, grow: 1 / 30, harvest: 24,
    load: 0.55, wear: 0.06,
    boostCost: 8, boostGain: 10, purifyCost: 7, purifyGain: 9, analyzeCost: 3, perRock: 6, sendCost: 4, askCost: 5
  };
  const METERS = [
    { k: "life", name: "Life Support", color: "#7cc4ff" },
    { k: "power", name: "Power", color: "#ffd54a" },
    { k: "shield", name: "Shielding", color: "#ff6b35" }
  ];

  let S = null;
  let dest = "moon";
  let last = 0, hudT = 0;
  let toastTimer = null;

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function fill(t) {
    let s = esc(t);
    s = s.replace(/\{day\}/g, S ? S.place.dayWord : "day");
    s = s.replace(/\[\[([^\]]+)\]\]/g, (m, w) => `<button class="term" data-term="${w}">${w}</button>`);
    return s;
  }
  const marsDelay = () => Comms.marsDelayMinutes(new Date());
  const status = v => (v >= 60 ? ["Good", "st-good", "#2ecc71"] : v >= 30 ? ["Careful", "st-care", "#ffb020"] : ["Danger", "st-bad", "#ff4d4d"]);
  function render(html) {
    app.innerHTML = html;
    app.hidden = false; gameEl.hidden = true; document.body.classList.remove("playing");
    window.scrollTo(0, 0);
    const h = app.querySelector("h1, h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function rocket(cls = "") {
    return `<svg class="rocket ${cls}" viewBox="0 0 84 142" aria-hidden="true">
      <path class="flame" d="M30 92 L54 92 L42 140 Z" fill="#ffb020"/>
      <path d="M42 0 C56 12 62 30 62 46 L22 46 C22 30 28 12 42 0 Z" fill="#e2412d"/>
      <rect x="22" y="44" width="40" height="44" fill="#fff"/>
      <rect x="22" y="80" width="40" height="10" fill="#0e1645"/>
      <circle cx="42" cy="60" r="10" fill="#7cc4ff"/>
      <path d="M22 62 L0 98 L22 88 Z M62 62 L84 98 L62 88 Z" fill="#e2412d"/>
    </svg>`;
  }
  function dataStatus() {
    const st = Donki.state;
    if (st.status === "live") return `<span class="badge live">Live NASA DONKI · ${st.live.length} real CMEs in 60 days</span>`;
    if (st.archive.length) return `<span class="badge arch">Archived NASA DONKI data · saved ${esc(window.DONKI_ARCHIVE.savedOn)}</span>`;
    return `<span class="badge">No NASA data · practice storms</span>`;
  }

  /* =========================================================
     MENU SCREENS
     ========================================================= */
  async function loading() {
    const fact = rand(["Radio signals take time to travel between Earth and space.", "The Moon's gravity is only 1/6 of Earth's.", "Water is great at blocking space radiation.", "A day on Mars is called a sol."]);
    render(`<section class="screen center loading"><div>
      ${rocket("float")}
      <h1 class="title">Lunar Outpost</h1>
      <div class="sub">Mission Control</div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="ld-bar"></i></div>
      <p class="load-text" id="ld-text">Loading mission… 0%</p>
      <div class="dyk">Did you know? ${esc(fact)}</div>
    </div><div class="foot">Team Pheonix · NASA Space Apps Challenge 2026</div></section>`);
    let p = 0;
    const set = (v, msg) => {
      p = Math.max(p, v);
      const b = $("#ld-bar"), t = $("#ld-text");
      if (b) { b.style.width = p + "%"; b.parentElement.setAttribute("aria-valuenow", Math.round(p)); }
      if (t) t.textContent = msg || `Loading mission… ${Math.round(p)}%`;
    };
    const tick = setInterval(() => set(Math.min(88, p + 4)), 100);
    const fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
    set(10, "Talking to NASA DONKI…");
    const donki = Donki.load().then(() => set(90));
    await Promise.all([fonts.then(() => set(35)), Promise.race([donki, wait(6000)]), wait(1300)]);   // don't keep kids waiting; live data can still arrive later
    clearInterval(tick);
    set(100);
    await wait(350);
    home();
  }

  function home() {
    stopGame();
    render(`<section class="screen">
      <div class="home">
        <div class="home-art" aria-hidden="true"><div class="pad-shadow"></div><div class="pad"></div>${rocket("float")}</div>
        <div class="home-copy">
          <h1>Lunar Outpost</h1>
          <div class="tag-line">Junior Astronaut Mission Trainer</div>
          <p class="q">Can you keep your crew safe?</p>
          <div class="home-btns">
            <button class="btn-primary" data-go="dest">Start mission</button>
            <button class="btn-secondary" data-go="howto">How to play</button>
            <button class="btn-secondary" data-go="sources">About NASA data</button>
          </div>
          <div class="data-status">${dataStatus()}</div>
        </div>
      </div>
      <div class="foot">Made by Team Pheonix for the NASA Space Apps Challenge 2026</div>
    </section>`);
  }

  function destination() {
    const card = id => {
      const p = D.places[id];
      return `<button class="dest-card ${dest === id ? "sel" : ""}" data-dest="${id}" aria-pressed="${dest === id}">
        <div class="art">${scene(id)}</div>
        <h2>${p.name}</h2>
        <div>${p.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
        <p>${p.line}</p>
        <div class="facts">Gravity ${p.gravityText} · Radio delay ${id === "moon" ? "1.3 seconds" : `about ${marsDelay()} minutes today`}</div>
      </button>`;
    };
    render(`<section class="screen dest">
      <button class="btn-secondary sm back-btn" data-go="home">Back</button>
      <h1>Where will your crew live?</h1>
      <div class="dests">${card("moon")}${card("mars")}</div>
      <div class="next-row"><button class="btn-primary" data-go="brief">Next</button></div>
    </section>`);
  }

  function briefCards(placeId) {
    const p = D.places[placeId];
    return [
      { title: "Your mission", body: `<ul>
          <li><span class="dot" style="background:#ffd54a"></span><div><b>Command the ${placeId === "moon" ? "Moon" : "Mars"} outpost for ${DAYS} ${p.dayWord}s</b><span>Each ${p.dayWord} lasts one minute. Walk your astronaut to the machines that need help.</span></div></li>
          <li><span class="dot" style="background:#ff4d4d"></span><div><b>Real solar storms are coming</b><span>They come from NASA's DONKI records. When the alert sounds, run to the Storm Shelter!</span></div></li>
          <li><span class="dot" style="background:#2ecc71"></span><div><b>Collect science</b><span>Pick up rocks outside, study them in the Lab, and send the data home from the Radio Dish.</span></div></li>
        </ul>` },
      { title: "Your three meters", body: `<ul>
          <li><span class="dot" style="background:#7cc4ff"></span><div><b>Life Support</b><span>Air and water for the crew</span></div></li>
          <li><span class="dot" style="background:#ffd54a"></span><div><b>Power</b><span>Electricity for the whole base</span></div></li>
          <li><span class="dot" style="background:#ff6b35"></span><div><b>Shielding</b><span>Protection from harmful space rays</span></div></li>
        </ul><p class="goal">Keep all three above zero.</p>` },
      { title: "How to move", body: `<ul>
          <li><span class="dot" style="background:#7cc4ff"></span><div><b>Walk</b><span><span class="key">←</span><span class="key">→</span> or <span class="key">A</span><span class="key">D</span> — or tap where you want to go</span></div></li>
          <li><span class="dot" style="background:#ffd54a"></span><div><b>Jump</b><span><span class="key">Space</span> or <span class="key">W</span>. Gravity here is ${p.gravityText}, so ${placeId === "moon" ? "you float high!" : "you jump higher than on Earth."}</span></div></li>
          <li><span class="dot" style="background:#ff6b35"></span><div><b>Work</b><span>Stand at a machine and hold <span class="key">E</span> (the orange button on a phone or tablet)</span></div></li>
        </ul>` }
    ];
  }
  function briefing(mode, i = 0) {
    const cards = briefCards(mode === "howto" ? "moon" : dest);
    const c = cards[i];
    const last = i === cards.length - 1;
    render(`<section class="screen center"><div class="brief">
      <div class="step">Briefing ${i + 1} of ${cards.length}</div>
      <h2>${c.title}</h2>
      ${c.body}
      <div class="dots">${cards.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="brief-nav">
        <button class="btn-secondary" data-brief="${mode}:skip">${mode === "howto" ? "Close" : "Skip"}</button>
        <button class="btn-primary" data-brief="${mode}:${last ? "end" : i + 1}">${last ? (mode === "howto" ? "Done" : "Launch!") : "Next"}</button>
      </div>
    </div></section>`);
  }

  function sources() {
    const st = Donki.state;
    const donkiBadge = st.status === "live" ? `<span class="badge live">Live</span>` : st.archive.length ? `<span class="badge arch">Archived</span>` : `<span class="badge sim">Game simulation</span>`;
    render(`<section class="screen sources">
      <button class="btn-secondary sm back-btn" data-go="home">Back</button>
      <h1>NASA science sources</h1>
      <p>Game numbers are simplified. Badges show <b>Live</b> or <b>Archived</b> only when real NASA data is connected.</p>
      <div class="src-grid">
        <article class="src">
          <h2>DONKI space weather</h2><div>${donkiBadge}</div>
          <p>Every solar storm is a <b>real CME</b> from NASA's DONKI database.</p>
          <ul>
            <li>Its real <b>speed</b> sets how strong the storm is.</li>
            <li>Speed ÷ distance to the Moon or Mars = <b>your countdown</b> (1 real hour ≈ half a game second).</li>
            <li>If DONKI linked it to a radiation storm (SEP), it hits harder.</li>
          </ul>
          <span class="link">ccmc.gsfc.nasa.gov/tools/DONKI</span>
          <button class="btn-secondary sm" data-go="sunwatch">Open Sun Watch</button>
        </article>
        <article class="src">
          <h2>OSDR astronaut research</h2><div><span class="badge sim">Game simulation</span></div>
          <p>Radiation and crew health messages.</p>
          <ul><li>Not connected yet. Next step: use OSDR radiation dosimetry to make storm damage more realistic.</li></ul>
          <a class="link" href="https://osdr.nasa.gov/" target="_blank" rel="noopener">osdr.nasa.gov</a>
        </article>
        <article class="src">
          <h2>Artemis (Moon)</h2><div><span class="badge arch">NASA facts</span></div>
          <p>Moon base conditions, simplified.</p>
          <ul><li>Jump physics use the Moon's real gravity: 1.62 m/s².</li><li>Radio delay: 1.3 seconds.</li><li>Base at the south pole, where Artemis plans to explore.</li></ul>
          <a class="link" href="https://www.nasa.gov/humans-in-space/artemis/" target="_blank" rel="noopener">NASA Artemis</a>
        </article>
        <article class="src">
          <h2>Mars surface missions</h2><div><span class="badge arch">NASA facts</span></div>
          <p>Dust storms and low power on Mars, simplified.</p>
          <ul><li>Jump physics use Mars' real gravity: 3.71 m/s².</li><li>Mars gets ~43% of Earth's sunlight → less solar power.</li><li>Radio delay is worked out for today's real Earth–Mars distance.</li></ul>
          <a class="link" href="https://science.nasa.gov/mars/" target="_blank" rel="noopener">NASA Mars missions</a>
        </article>
      </div>
    </section>`);
  }

  /* =========================================================
     MISSION SETUP
     ========================================================= */
  function pickStormDays(n) {
    for (let k = 0; k < 100; k++) {
      const c = []; for (let d = 2; d <= DAYS; d++) c.push(d);
      const days = [];
      while (days.length < n) days.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
      days.sort((a, b) => a - b);
      if (days.every((d, i) => !i || d - days[i - 1] > 1)) return days;
    }
    return [3, 6];
  }

  function startMission(placeId) {
    if (S) S.over = true;
    closeModal(true);
    $("#popup").hidden = true;
    dest = placeId;
    const place = D.places[placeId];
    const storms = {};
    const picked = Donki.pickStorms(C.STORMS_PER_MISSION);
    pickStormDays(picked.length).forEach((d, i) => (storms[d] = picked[i]));
    S = {
      placeId, place, day: 1, t: 0,
      life: 80, power: 80, shield: 75, food: 70, growth: 0.45,
      science: 0, stored: 0, carrying: 0,
      dust: [0.1, 0.2, 0.05], broken: false, leakAt: null, samples: [],
      sending: 0, boosting: 0,
      solarMul: 1, solarForever: 1, wearMul: 1, speedMul: 1,
      storms, storm: null, stormAt: 0, stormStarted: false, linkDay: 1, blackout: 0,
      evAt: 0, evDone: false, pending: null, ask: null, modalOpen: false,
      dayStart: null, dayLog: [], decisions: [], hist: [], sparks: { life: [], power: [], shield: [] }, sampleT: 0,
      stats: { cleaned: 0, fixed: 0, harvested: 0, rocks: 0, stormsFaced: [], asked: 0, lateWarnings: 0, boosted: 0 },
      delayMin: placeId === "mars" ? marsDelay() : null,
      over: false
    };
    app.hidden = true; gameEl.hidden = false; document.body.classList.add("playing");
    $("#g-place").textContent = place.short;
    buildHud();
    World.reset(placeId);
    World.resize();
    startDay();
    last = performance.now();
  }

  function stopGame() {
    if (S) S.over = true;
    closeModal(true);
  }

  function startDay() {
    S.t = 0; S.solarMul = 1; S.speedMul = 1;
    S.evDone = false; S.evAt = 16 + Math.random() * 14;
    S.stormAt = 5 + Math.random() * 8; S.stormStarted = false;
    S.dayStart = { life: S.life, power: S.power, shield: S.shield, food: S.food, science: S.science };
    S.dayLog = [];
    spawnSamples(2, 2180, 2650);
    if (S.day === 1) toast(`Welcome, Commander! Walk with ← → (or tap), jump with Space, hold E to work.`, 6000);
    else toast(`${cap(S.place.dayWord)} ${S.day} begins.`);
  }

  function spawnSamples(n, a, b) {
    for (let i = 0; i < n; i++) S.samples.push({ x: a + Math.random() * (b - a), taken: false });
    S.samples = S.samples.filter(s => !s.taken).slice(-8);
  }

  /* =========================================================
     SIMULATION
     ========================================================= */
  const solarNow = () => S.place.solar * (1 - 0.7 * (S.dust.reduce((a, b) => a + b, 0) / 3)) * S.solarMul * S.solarForever;
  const where = () => (World.isOutside() ? "outside" : World.roomOf(World.player.x) === "shelter" ? "shelter" : "inside");

  function update(dt) {
    const simulate = !S.modalOpen || (S.ask && S.ask.live);
    if (S.ask) {
      S.ask.left -= dt;
      if (S.ask.left <= 0) {
        S.ask = null; S.pending.tip = true;
        if (S.modalOpen && S.pending) showChoices(); else toast("Mission Control replied! Tap Decide in the Mission Control panel.");
      }
    }
    if (!simulate) return;
    S.t += dt;
    const powered = S.power > 0;
    S.power += (solarNow() - R.load) * dt;
    let dl = -R.lifeDrain;
    if (!S.broken && powered) dl += R.recycle;
    if (S.leakAt) dl -= R.leak;
    if (S.food <= 0) dl -= R.hungry;
    S.life += dl * dt;
    S.food -= R.foodDrain * dt;
    if (powered) S.growth = Math.min(1, S.growth + R.grow * dt);
    S.shield -= R.wear * S.wearMul * (powered ? 1 : 2) * dt;
    S.dust = S.dust.map(d => Math.min(1, d + S.place.dustRate * dt * (0.7 + Math.random() * 0.6)));
    S.sending = Math.max(0, S.sending - dt);
    S.boosting = Math.max(0, S.boosting - dt);

    // storms
    if (S.storms[S.day] && !S.stormStarted && S.t >= S.stormAt && !S.modalOpen) startStorm();
    if (S.storm) {
      const st = S.storm;
      if (st.phase === "coming") {
        st.eta -= dt;
        if (st.eta <= 0) { st.phase = "hit"; st.hitLeft = 5; st.where = {}; toast("The storm is here!", 2500); }
      } else if (st.phase === "hit") {
        const w = where();
        const loc = w === "shelter" ? 0.3 : w === "outside" ? 1.8 : 1;
        const dmg = (st.dmg / 5) * loc * st.mul * dt;
        S.shield -= dmg; st.taken += dmg; st.where[w] = (st.where[w] || 0) + dt;
        st.hitLeft -= dt;
        if (st.hitLeft <= 0) endStorm();
      }
    }

    // daily event
    if (!S.evDone && !S.storms[S.day] && S.t >= S.evAt && !S.modalOpen && !S.pending) openEvent(drawEvent());

    S.life = clamp(S.life, 0, 100); S.food = clamp(S.food, 0, 100); S.shield = clamp(S.shield, 0, 100);
    if (S.power <= 0) { S.power = 0; S.blackout += dt; } else { S.power = Math.min(100, S.power); S.blackout = 0; }

    S.sampleT += dt;
    if (S.sampleT >= 1) {
      S.sampleT = 0;
      METERS.forEach(m => { const a = S.sparks[m.k]; a.push(S[m.k]); if (a.length > 40) a.shift(); });
      S.hist.push({ d: S.day - 1 + S.t / DAY_LEN, life: S.life, power: S.power, shield: S.shield });
    }

    if (S.life <= 0) return fail("Life Support ran out. The crew didn't have enough air and water.");
    if (S.shield <= 0) return fail("Shielding hit zero. The crew got too much radiation.");
    if (S.blackout > 10) return fail("The base was out of power for too long.");

    if (S.t >= DAY_LEN && !S.storm && !S.pending && !S.modalOpen && (!S.storms[S.day] || S.stormStarted)) endDay();
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (S && !S.over && !gameEl.hidden) {
      update(dt);
      if (!S.modalOpen) World.step(dt);
      World.draw();
      hudT += dt;
      if (hudT > 0.12) { hudT = 0; updateHud(); }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- world handlers ---------- */
  function prompt(st) {
    if (S.leakAt === st.id) return { text: "Patch the air leak", hold: 2.2, enabled: true };
    switch (st.kind) {
      case "panel": return S.dust[st.idx] > 0.06 ? { text: "Clean panel", hold: 0.9, enabled: true } : { text: "Panel is clean", enabled: false };
      case "life":
        if (S.broken) return { text: "Fix the recycler", hold: 2.2, enabled: true };
        if (S.life >= 99.5) return { text: "Tanks full", enabled: false };
        if (S.power < 3) return { text: "Not enough power", enabled: false };
        return { text: "Hold to purify water", continuous: true, enabled: true };
      case "green": return S.growth >= 1 ? { text: "Harvest food", hold: 1.1, enabled: true } : { text: `Plants growing ${Math.round(S.growth * 100)}%`, enabled: false };
      case "shield":
        if (S.shield >= 99.5) return { text: "Shield full", enabled: false };
        if (S.power < 3) return { text: "Not enough power", enabled: false };
        return { text: "Hold to charge shield", continuous: true, enabled: true };
      case "shelter": return { text: S.storm ? "Safe in the shelter!" : "Storm shelter", enabled: false };
      case "lab": return S.carrying ? { text: `Study rock (${S.carrying})`, hold: 1.1, enabled: true } : { text: "Bring rocks from outside", enabled: false };
      case "dish":
        if (S.stored > 0) return { text: `Send ${S.stored} data to Earth`, hold: 1.3, enabled: true };
        return S.linkDay < S.day ? { text: "Check in with Earth", hold: 1, enabled: true } : { text: "Earth link strong", enabled: false };
    }
    return null;
  }
  function done(st) {
    if (S.leakAt === st.id) { S.leakAt = null; S.stats.fixed++; logDay("You patched the air leak."); World.burst("spark", st.x + 50, World.HAB_TOP + 26, 14); return toast("Leak patched!"); }
    switch (st.kind) {
      case "panel": S.dust[st.idx] = 0; S.stats.cleaned++; World.burst("dust", st.x, World.GROUND - 100, 12); logDay("cleaned", 1); break;
      case "life": S.broken = false; S.stats.fixed++; logDay("You fixed the water recycler."); toast("Recycler fixed!"); break;
      case "green": S.growth = 0; S.food = Math.min(100, S.food + R.harvest); S.stats.harvested++; logDay("You harvested the greenhouse."); toast(`Harvest! +${R.harvest} Greenhouse food`); break;
      case "lab": S.carrying--; S.stored += R.perRock; S.power -= R.analyzeCost; S.stats.rocks++; toast(`Rock studied: +${R.perRock} data. Send it from the Radio Dish!`); break;
      case "dish": {
        const n = S.stored;
        S.science += n; S.stored = 0; S.power -= n ? R.sendCost : 1; S.linkDay = S.day; S.sending = 1.6;
        logDay(n ? `You sent ${n} science data to Earth.` : "You checked in with Earth.");
        toast(n ? `${n} data on its way to Earth! It takes ${S.placeId === "moon" ? "1.3 seconds" : `about ${S.delayMin} minutes`} to arrive.` : "Earth link is strong. You'll get early storm warnings.");
        break;
      }
    }
  }
  function hold(st, dt) {
    if (st.kind === "life" && !S.broken && S.power >= 3 && S.life < 100) { S.power -= R.purifyCost * dt; S.life = Math.min(100, S.life + R.purifyGain * dt); return; }
    if (st.kind !== "shield" || S.power < 3 || S.shield >= 100) return;
    S.power -= R.boostCost * dt; S.shield = Math.min(100, S.shield + R.boostGain * dt); S.boosting = 0.2; S.stats.boosted += R.boostGain * dt;
  }
  function pickup(s) {
    if (S.carrying >= 3) { if (!S.fullMsg) { S.fullMsg = true; toast("Hands full! Take your rocks to the Science Lab."); setTimeout(() => S && (S.fullMsg = false), 4000); } return; }
    s.taken = true; S.carrying++; World.burst("spark", s.x, World.GROUND - 20, 10);
    toast(`Rock collected (${S.carrying}/3). Study it in the Science Lab.`, 2500);
  }
  function logDay(text, count) {
    if (count) { const e = S.dayLog.find(x => x.k === text); if (e) e.n++; else S.dayLog.push({ k: text, n: 1 }); return; }
    S.dayLog.push({ text });
  }

  /* =========================================================
     STORMS (real NASA DONKI CMEs)
     ========================================================= */
  function startStorm() {
    S.stormStarted = true;
    const st = S.storms[S.day];
    const au = S.placeId === "moon" ? 1 : 1.524;
    const hours = st.source === "practice" ? 40 : SunWatch.hoursTo(st.speed, au);
    let secs = clamp(Math.round(hours * 0.5), 12, 45);
    const late = S.linkDay < S.day - 1;
    if (late) { secs = Math.max(8, Math.round(secs * 0.5)); S.stats.lateWarnings++; }
    const dmg = [0, 30, 45, 60][st.level] + (st.hasSep ? 15 : 0);
    S.storm = { st, phase: "coming", eta: secs, total: secs, hours, late, dmg, mul: 1, taken: 0, where: {} };
    stormAlert();
  }
  function endStorm() {
    const st = S.storm;
    const mostly = Object.entries(st.where).sort((a, b) => b[1] - a[1])[0]?.[0] || "inside";
    const lost = Math.round(st.taken);
    S.stats.stormsFaced.push({ ...st.st, lost, mostly });
    logDay(`A real solar storm hit. You were ${mostly === "shelter" ? "safe in the shelter" : mostly === "outside" ? "OUTSIDE — ouch" : "inside the base"}. Shielding −${lost}.`);
    toast(`Storm over. Shielding −${lost}${mostly === "shelter" ? " (the shelter helped!)" : mostly === "outside" ? " (being outside made it worse!)" : ""}.`, 5000);
    S.storm = null;
  }
  function stormAlert() {
    const st = S.storm, c = st.st;
    const badge = c.source === "live" ? `<span class="badge live">Live NASA data</span>` : c.source === "archive" ? `<span class="badge arch">Archived NASA data</span>` : `<span class="badge">Practice storm</span>`;
    openModal(`<div class="emerg">
      <span class="e-pill">Emergency</span>
      <div class="e-art" aria-hidden="true"><div class="sun"></div><div class="beam"></div><div class="dome ${S.placeId}"></div></div>
      <h2>${esc(D.storm.title)}</h2>
      <p>${fill(D.storm.text)}</p>
      ${c.source === "practice" ? "" : `<div class="data-line">
        ${badge}
        <span>Real <button class="term" data-term="CME">CME</button> left the Sun <b>${esc(c.date)}</b></span>
        <span>Speed <b>${c.speed.toLocaleString()} km/s</b></span>
        <span>Real trip to ${S.placeId === "moon" ? "the Moon" : "Mars"}: <b>~${st.hours} h</b></span>
        <span>Your warning: <b>${st.eta} seconds</b></span>
        <span>Strength <b>${c.level}/3</b>${c.hasSep ? " + radiation storm" : ""}</span>
      </div>`}
      <p class="note">${st.late ? "Your radio was quiet yesterday, so the warning came LATE. Check in with Earth at the Radio Dish to get earlier warnings. " : ""}Inspired by NASA DONKI space weather. Game values are simplified.</p>
      <button class="btn-primary" data-act="storm-choices">See my choices</button>
    </div>`);
  }

  /* =========================================================
     EVENTS + CHOICES (design pages 6–7)
     ========================================================= */
  function drawEvent() {
    S.used = S.used || new Set();
    let pool = D.events.filter(e => (e.place === "both" || e.place === S.placeId) && !S.used.has(e.id));
    if (!pool.length) { S.used.clear(); pool = D.events.filter(e => e.place === "both" || e.place === S.placeId); }
    const ev = rand(pool); S.used.add(ev.id); return ev;
  }
  function openEvent(ev) {
    S.evDone = true;
    S.pending = { ev, sel: null, tip: false, storm: false };
    openModal(""); showChoices();
  }
  const NAMES = { life: "Life Support", power: "Power", shield: "Shielding", food: "Greenhouse", science: "Science" };
  function effFx(ch, i) {
    const fx = { ...(ch.fx || {}) };
    if (S.pending.tip && i === S.pending.ev.tip) for (const k in fx) if (fx[k] < 0) fx[k] = Math.ceil(fx[k] / 2);
    return fx;
  }
  function chips(ch, i) {
    const fx = effFx(ch, i);
    const out = Object.entries(fx).filter(([, v]) => v).map(([k, v]) => `<span class="chip ${v > 0 ? "up" : "down"}">${v > 0 ? "+" : "−"}${Math.abs(v)} ${NAMES[k]}</span>`);
    (ch.extra || []).forEach(x => out.push(`<span class="chip ${x.startsWith("Task") ? "task" : "note"}">${esc(x)}</span>`));
    if (ch.risk) out.push(`<span class="chip down">${esc(ch.risk)}</span>`);
    return out.join("");
  }
  function showChoices() {
    const P = S.pending, ev = P.ev;
    const text = ev[S.placeId === "moon" ? "textMoon" : "textMars"] || ev.text;
    const fact = ev[S.placeId === "moon" ? "factMoon" : "factMars"] || ev.fact;
    const asking = !!S.ask;
    const roundTrip = S.placeId === "moon" ? "2.6 seconds" : `${S.delayMin * 2} minutes`;
    let askState = "";
    if (asking) askState = `Message travelling to Earth and back… <b id="ask-left">${Math.ceil(S.ask.left)} s</b> (real round trip: ${roundTrip}). Your base keeps running!`;
    else if (P.tip) askState = `<b>Mission Control replied:</b> they recommend “${esc(ev.choices[ev.tip].label)}” and halved its costs.`;
    else askState = S.placeId === "mars" ? `Mars is far: a reply takes a while (shortened for the game).` : `The Moon is close: Earth replies in about 2.6 seconds.`;
    mbox.innerHTML = `<div class="choose">
      <h1>${fill(ev.title)}</h1>
      <p class="lead">${fill(text)}${P.storm && S.storm ? ` <b class="yellow">Storm arrives in <span id="storm-eta">${Math.ceil(S.storm.eta)}</span> s.</b>` : ""}</p>
      <div class="opts">${ev.choices.map((c, i) => `
        <button class="opt ${P.sel === i ? "sel" : ""}" data-opt="${i}" aria-pressed="${P.sel === i}">
          ${P.tip && i === ev.tip ? `<span class="rec">Mission Control pick</span>` : ""}
          <h3>${fill(c.label)}</h3>
          <p>${fill(c.desc)}</p>
          <div>${chips(c, i)}</div>
        </button>`).join("")}</div>
      <div class="choose-foot">
        <button class="btn-secondary" data-act="ask" ${asking || P.tip || S.power < R.askCost ? "disabled" : ""}>Ask Mission Control (−${R.askCost} Power)</button>
        <span class="ask-state">${askState}${asking && S.placeId === "mars" ? ` <button class="mc-btn" data-act="minimize">Go work while you wait</button>` : ""}</span>
        <button class="btn-primary" data-act="confirm" ${P.sel === null ? "disabled" : ""}>Confirm</button>
      </div>
      <div class="fact-strip"><b>Did you know?</b> ${fill(fact)} <small>Source: ${esc(ev.source)}</small></div>
    </div>`;
  }
  function confirmChoice() {
    const P = S && S.pending;
    if (!P) return closeModal();
    const ev = P.ev, i = P.sel;
    if (i === null) return;
    const ch = ev.choices[i];
    const fx = effFx(ch, i);
    for (const [k, v] of Object.entries(fx)) {
      if (k === "science") S.science = Math.max(0, S.science + v);
      else S[k] = clamp(S[k] + v, 0, 100);
    }
    const m = ch.mod || {};
    if (m.solarMul) { if (m.forever) S.solarForever *= m.solarMul; else S.solarMul *= m.solarMul; }
    if (m.speedMul) S.speedMul = m.speedMul;
    if (m.wearMul) S.wearMul *= m.wearMul;
    if (ch.clean) S.dust = [0, 0, 0];
    if (ch.link) S.linkDay = S.day;
    if (ch.stormMul && S.storm) S.storm.mul *= ch.stormMul;
    if (ch.task === "recycler") S.broken = true;
    if (ch.task === "leak") S.leakAt = rand(["life", "green", "lab", "shield"]);
    if (ch.task === "dust") S.dust = S.dust.map(d => Math.max(d, 0.85));
    if (ch.task === "samples") spawnSamples(3, 2350, 2680);
    S.decisions.push(`${ev.title.replace(/!$/, "")}: ${ch.label.toLowerCase()}`);
    S.dayLog.push({ choice: ch.label, title: ev.title, fx });
    S.pending = null; S.ask = null;
    closeModal();
    toast(fill(ch.result), 5000);
  }

  /* =========================================================
     DAY END — "What happened" (design page 8)
     ========================================================= */
  function endDay() {
    S.hist.push({ d: S.day, life: S.life, power: S.power, shield: S.shield });
    const s0 = S.dayStart;
    const card = (k, name) => {
      const a = Math.round(s0[k]), b = Math.round(S[k]), d = b - a;
      const [, , col] = status(b);
      return `<div class="hap"><div class="hap-top"><b>${name}</b><span class="delta ${d > 0 ? "up" : d < 0 ? "down" : "same"}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</span></div>
        <div class="from">${a} → ${b}</div><div class="mbar"><i style="width:${b}%;background:${col}"></i></div></div>`;
    };
    const choice = S.dayLog.find(x => x.choice);
    const lines = [];
    if (choice) {
      const ups = Object.entries(choice.fx).filter(([, v]) => v > 0).map(([k]) => NAMES[k]);
      const downs = Object.entries(choice.fx).filter(([, v]) => v < 0).map(([k]) => NAMES[k]);
      lines.push(`You chose “${esc(choice.choice)}”.${ups.length ? ` ${ups.join(" and ")} got a boost` : ""}${ups.length && downs.length ? ", but" : ""}${downs.length ? ` ${downs.join(" and ")} paid the price` : ""}.`);
    }
    const cleaned = S.dayLog.find(x => x.k === "cleaned");
    if (cleaned) lines.push(`You cleaned ${cleaned.n} solar panel${cleaned.n > 1 ? "s" : ""}.`);
    S.dayLog.filter(x => x.text).forEach(x => lines.push(esc(x.text)));
    if (!lines.length) lines.push("A quiet day. Remember: dusty panels make less power, and plants need harvesting!");
    S.modalOpen = true;
    openModal(`<div class="happened">
      <h1>What happened · ${cap(S.place.dayWord)} ${S.day}</h1>
      <div class="hap-grid">
        <div class="hap-list">${card("shield", "Shielding")}${card("power", "Power")}${card("life", "Life Support")}${card("food", "Greenhouse")}</div>
        <div>
          <div class="note-card"><b>${D.commander}</b>${lines.slice(0, 5).join(" ")}</div>
          <div class="note-card"><b class="yellow">Did you know?</b>${fill(rand(S.place.facts))}</div>
          <div class="note-card"><b>Science sent to Earth</b>${S.science} total${S.stored ? ` · ${S.stored} still waiting at the Lab — send it from the Radio Dish!` : ""}</div>
        </div>
      </div>
      <div class="cont-row"><button class="btn-primary" data-act="next-day">${S.day >= DAYS ? "See results" : "Continue"}</button></div>
    </div>`);
  }
  function nextDay() {
    closeModal();
    if (S.day >= DAYS) return results(true);
    S.day++; startDay();
  }
  function fail(reason) { if (S.over) return; S.failReason = reason; results(false); }

  /* =========================================================
     RESULTS (design page 9)
     ========================================================= */
  function chart() {
    const W = 560, H = 210, pl = 30, pr = 10, pt = 10, pb = 24;
    const x = d => pl + (d / DAYS) * (W - pl - pr);
    const y = v => H - pb - (v / 100) * (H - pt - pb);
    const pts = [{ d: 0, life: 80, power: 80, shield: 75 }, ...S.hist];
    const line = (k, c) => `<polyline fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => `${x(p.d).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ")}"/>`;
    const grid = [0, 50, 100].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#2c3a80"/><text x="2" y="${y(v) + 4}">${v}</text>`).join("");
    const days = Array.from({ length: DAYS + 1 }, (_, d) => `<text x="${x(d) - 3}" y="${H - 6}">${d}</text>`).join("");
    const storms = S.stats.stormsFaced.map((_, i) => "").join("");
    return `<svg class="res-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="How Life Support, Power and Shielding changed during the mission">${grid}${days}${storms}${line("life", "#7cc4ff")}${line("power", "#ffd54a")}${line("shield", "#ff6b35")}</svg>
      <div class="legend"><span><i style="background:#7cc4ff"></i>Life Support</span><span><i style="background:#ffd54a"></i>Power</span><span><i style="background:#ff6b35"></i>Shielding</span></div>`;
  }
  function results(success) {
    S.over = true;
    closeModal(true);
    const L = Math.round(S.life), P = Math.round(S.power), Sh = Math.round(S.shield);
    const crit = [success, success && S.science >= 60, success && Math.min(L, P, Sh) >= 40];
    const stars = crit.filter(Boolean).length;
    const final = S.science * 3 + L + P + Sh + (success ? 100 : 0);
    const st = S.stats;
    const learned = [
      "Shielding uses power, and power is limited. Every choice has a gain and a cost.",
      `You cleaned solar panels ${st.cleaned} time${st.cleaned === 1 ? "" : "s"}. Dust ${S.placeId === "mars" ? "on Mars" : "on the Moon"} really cuts power.`,
      st.stormsFaced.length ? `You faced ${st.stormsFaced.length} real solar storm${st.stormsFaced.length > 1 ? "s" : ""} from NASA DONKI: ${st.stormsFaced.map(s => `${s.date} (${s.speed.toLocaleString()} km/s, Shielding −${s.lost}${s.mostly === "shelter" ? ", in the shelter" : ""})`).join("; ")}.` : "No storm reached you this time.",
      st.lateWarnings ? `${st.lateWarnings} storm warning${st.lateWarnings > 1 ? "s were" : " was"} late because your radio was quiet. Staying in touch with Earth gives you more time.` : "Your radio contact with Earth gave you early storm warnings.",
      S.placeId === "mars" ? `Messages to Mars took about ${S.delayMin} minutes each way today, so help from Earth comes slowly.` : "On the Moon, Earth answers in about 1.3 seconds — help is fast.",
      `You harvested the greenhouse ${st.harvested} time${st.harvested === 1 ? "" : "s"} and studied ${st.rocks} rock${st.rocks === 1 ? "" : "s"}.`
    ];
    render(`<section class="screen results">
      <h1>${success ? "Mission success!" : "Mission over"}</h1>
      ${success ? "" : `<p class="muted" style="text-align:center">${esc(S.failReason)} The crew flew home safely — try a new plan!</p>`}
      <div class="stars" aria-label="${stars} of 3 stars">${[0, 1, 2].map(i => `<span class="${i < stars ? "on" : "off"}">★</span>`).join("")}</div>
      <div class="res-grid">
        <div class="card">
          <h2>Score</h2>
          <div class="score-row"><span>Final</span><b class="yellow">${final}</b></div>
          <div class="score-row"><span>Science</span><b>${S.science}</b></div>
          <div class="score-row"><span>Life · Power · Shield</span><b>${L} · ${P} · ${Sh}</b></div>
          <div class="score-row"><span>${cap(S.place.dayWord)}s survived</span><b>${success ? DAYS : S.day - 1} of ${DAYS}</b></div>
          ${chart()}
          <ul class="decisions" style="margin-top:14px">
            <li>${crit[0] ? "★" : "☆"} Keep the crew safe for ${DAYS} ${S.place.dayWord}s</li>
            <li>${crit[1] ? "★" : "☆"} Send 60+ science to Earth</li>
            <li>${crit[2] ? "★" : "☆"} End with all three meters at 40+</li>
          </ul>
        </div>
        <div class="card">
          <h2>Key decisions</h2>
          <ul class="decisions">${S.decisions.slice(-8).map(d => `<li>${esc(cap(d))}</li>`).join("") || "<li>No decisions this time.</li>"}</ul>
          <h2>What you learned</h2>
          <ul class="learned">${learned.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="res-btns">
        <button class="btn-primary" data-start="${S.placeId}">Play again</button>
        <button class="btn-secondary" data-start="${S.placeId === "moon" ? "mars" : "moon"}">Switch destination</button>
        <button class="btn-secondary" data-go="home">Main menu</button>
      </div>
    </section>`);
  }

  /* =========================================================
     HUD (design page 5)
     ========================================================= */
  function buildHud() {
    const meter = m => `<div class="panel"><h4>${m.name} <em id="${m.k}-st"></em></h4><div class="mbar"><i id="${m.k}-bar"></i></div>
      <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline id="${m.k}-sp"/></svg></div>`;
    $("#hud").innerHTML = `${METERS.map(meter).join("")}
      <div class="panel radar"><div class="scope" id="scope"><span class="blip" id="blip"></span></div><button class="alert-btn" id="alert-btn" data-act="sunwatch" aria-label="Open Sun Watch: real NASA solar storms">Alert</button></div>
      <div class="panel"><h4>Mission Control</h4><div class="sig" id="sig">${[30, 48, 26, 42, 20, 36, 28].map((h, i) => `<i style="height:${h}px;animation-delay:${i * 0.12}s"></i>`).join("")}</div><div class="sub" id="mc-st"></div></div>
      <div class="panel"><h4>Greenhouse <em id="food-st"></em></h4><div class="mbar"><i id="food-bar"></i></div><h4 style="margin-top:6px">Crew</h4><div class="sub" id="crew-st"></div></div>`;
  }
  function updateHud() {
    METERS.forEach(m => {
      const v = Math.round(S[m.k]); const [w, cls, col] = status(v);
      const st = $(`#${m.k}-st`); st.textContent = `${w} ${v}`; st.className = cls;
      const b = $(`#${m.k}-bar`); b.style.width = v + "%"; b.style.background = col;
      const a = S.sparks[m.k];
      $(`#${m.k}-sp`).setAttribute("points", a.map((y, i) => `${(i / 39) * 100},${28 - (y / 100) * 26}`).join(" "));
      $(`#${m.k}-sp`).setAttribute("stroke", col);
    });
    const fv = Math.round(S.food), [fw, fcls, fcol] = status(fv);
    $("#food-st").textContent = `${fw} ${fv}`; $("#food-st").className = fcls;
    $("#food-bar").style.width = fv + "%"; $("#food-bar").style.background = fcol;
    $("#g-day").textContent = `${cap(S.place.dayWord)} ${S.day} of ${DAYS}`;
    $("#g-dayfill").style.width = Math.min(100, (S.t / DAY_LEN) * 100) + "%";
    $("#g-sci").textContent = `Science ${S.science}`;

    // radar
    const scope = $("#scope"), ab = $("#alert-btn"), blip = $("#blip");
    if (S.storm) {
      scope.classList.add("hot"); ab.classList.add("pulse");
      ab.textContent = S.storm.phase === "coming" ? `${Math.ceil(S.storm.eta)}s` : "Storm!";
      const k = S.storm.phase === "coming" ? S.storm.eta / S.storm.total : 0;
      blip.hidden = false; blip.style.left = `${46 - 40 * k}px`; blip.style.top = `${42 - 30 * k}px`;
    } else { scope.classList.remove("hot"); ab.classList.remove("pulse"); ab.textContent = "Alert"; blip.hidden = true; }

    // mission control
    const sig = $("#sig"), mc = $("#mc-st");
    sig.className = "sig";
    if (S.ask) { sig.classList.add("wait"); mc.innerHTML = `Reply in ${Math.ceil(S.ask.left)} s…`; }
    else if (S.pending && !S.modalOpen) { mc.innerHTML = `<button class="mc-btn" data-act="reopen">${S.pending.tip ? "Reply arrived — Decide" : "Decide"}</button>`; }
    else if (S.linkDay >= S.day) mc.textContent = "Earth link: strong today";
    else { sig.classList.add("off"); mc.textContent = "Radio quiet — visit the dish"; }

    // crew
    const w = where();
    $("#crew-st").textContent = `4 astronauts · ${S.storm && S.storm.phase === "hit" ? (w === "shelter" ? "in the shelter" : "in danger!") : S.food <= 0 ? "hungry!" : S.life < 25 ? "short of air!" : "all well"}`;

    // ticker
    const tk = $("#g-ticker");
    let msg = "", cls = "";
    const avgDust = S.dust.reduce((a, b) => a + b, 0) / 3;
    if (S.storm && S.storm.phase === "coming") { msg = `Solar storm arrives in ${Math.ceil(S.storm.eta)} s — go to the Storm Shelter!`; cls = "danger"; }
    else if (S.storm) { msg = w === "shelter" ? "Storm hitting! Stay in the shelter…" : "Storm hitting! Get to the Storm Shelter!"; cls = "danger"; }
    else if (S.blackout > 0) { msg = `Power is out! ${Math.max(0, Math.ceil(10 - S.blackout))} s until shutdown — clean the panels!`; cls = "danger"; }
    else if (S.leakAt) { msg = `Air leak in the ${World.STATIONS.find(s => s.id === S.leakAt).label}! Patch it.`; cls = "warn"; }
    else if (S.broken) { msg = "The water recycler is broken — fix it in the Life Support room."; cls = "warn"; }
    else if (S.ask) { msg = `Message to Earth… reply in ${Math.ceil(S.ask.left)} s`; cls = "warn"; }
    else if (S.pending) { msg = "Mission Control is waiting for your decision — tap Decide."; cls = "warn"; }
    else if (S.power < 30 && avgDust > 0.35) { msg = "Power is low. Clean the dusty solar panels (left, outside)."; cls = "warn"; }
    else if (S.shield < 35) { msg = "Shielding is low. Charge it at the Shield Generator."; cls = "warn"; }
    else if (S.growth >= 1 && S.food < 85) msg = "The greenhouse is ready to harvest!";
    else if (S.carrying) msg = "Take your rocks to the Science Lab.";
    else if (S.stored) msg = `Send ${S.stored} data from the Radio Dish (right, outside).`;
    else if (S.samples.some(s => !s.taken)) msg = "Rock samples are waiting outside, past the Radio Dish.";
    else msg = `Scanning deep space… all systems normal`;
    tk.textContent = msg; tk.className = `ticker ${cls}`;
  }

  function toast(html, ms = 3500) {
    const t = $("#g-toast");
    t.innerHTML = html; t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  /* ---------- modals ---------- */
  function openModal(html) {
    if (S) { S.modalOpen = true; Object.keys(World.keys).forEach(k => (World.keys[k] = false)); }
    mbox.className = "modal-box"; mbox.innerHTML = html; modal.hidden = false;
    const f = mbox.querySelector("button.btn-primary:not([disabled]), button"); if (f) f.focus({ preventScroll: true });
  }
  function closeModal(force) {
    modal.hidden = true; mbox.innerHTML = "";
    SunWatch.close();
    if (S) S.modalOpen = false;
    if (force) return;
  }
  function pauseMenu() {
    openModal(`<div class="pause"><h2>Paused</h2>
      <button class="btn-primary" data-act="resume">Resume</button>
      <button class="btn-secondary" data-act="sunwatch">Sun Watch (NASA data)</button>
      <button class="btn-secondary" data-act="controls">Controls</button>
      <button class="btn-secondary" data-act="quit">Quit to main menu</button></div>`);
  }
  function sunWatchModal() {
    const back = S && !S.over ? "resume" : "close-sw";
    const html = `<div class="sunwatch-wrap"><h2>Sun Watch</h2>
      <p class="lead">Each dot is a <b>real CME</b> from NASA's DONKI database. Drag the time slider or press Play to watch them fly out from the Sun at their real measured speeds. Tap a dot to read its record.</p>
      <div id="sw-root"></div>
      <div class="sw-close"><button class="btn-primary" data-act="${back}">${S && !S.over ? "Back to the base" : "Close"}</button></div></div>`;
    if (S && !S.over) openModal(html); else { modal.hidden = false; mbox.className = "modal-box"; mbox.innerHTML = html; }
    SunWatch.open($("#sw-root"), { storm: S && S.storm ? S.storm.st : null, placeId: S ? S.placeId : dest });
  }

  /* =========================================================
     INPUT
     ========================================================= */
  document.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("term")) return showTerm(t.dataset.term);
    if (t.id === "popup-close") return ($("#popup").hidden = true);
    if (t.id === "btn-a11y") { const on = document.documentElement.classList.toggle("big"); t.setAttribute("aria-pressed", on); World.resize(); return; }
    if (t.id === "g-menu") return pauseMenu();
    if (t.dataset.dest) { dest = t.dataset.dest; return destination(); }
    if (t.dataset.start) return startMission(t.dataset.start);
    if (t.dataset.brief) {
      const [mode, step] = t.dataset.brief.split(":");
      if (step === "skip" || step === "end") return mode === "howto" ? home() : startMission(dest);
      return briefing(mode, +step);
    }
    if (t.dataset.opt !== undefined && S && S.pending) { S.pending.sel = +t.dataset.opt; return showChoices(); }
    const go = { home, dest: destination, howto: () => briefing("howto"), sources, brief: () => briefing("start"), sunwatch: sunWatchModal }[t.dataset.go];
    if (go) return go();
    switch (t.dataset.act) {
      case "storm-choices": S.pending = { ev: D.storm, sel: null, tip: false, storm: true }; return showChoices();
      case "confirm": return confirmChoice();
      case "ask":
        if (S.power < R.askCost || S.ask) return;
        S.power -= R.askCost; S.stats.asked++;
        S.ask = { left: S.placeId === "moon" ? 2.6 : clamp(S.delayMin * 2, 6, 44), live: true };
        return showChoices();
      case "minimize": closeModal(); return toast("Keep working! Tap Decide in the Mission Control panel when the reply arrives.", 4500);
      case "reopen": openModal(""); return showChoices();
      case "next-day": return nextDay();
      case "resume": closeModal(); if (S && S.pending && !S.ask) { openModal(""); showChoices(); } return;
      case "close-sw": SunWatch.close(); modal.hidden = true; return;
      case "sunwatch": return sunWatchModal();
      case "controls": return openModal(`<div class="pause"><h2>Controls</h2><p>Walk: ← → or A D, or tap the ground</p><p>Jump: Space or W</p><p>Work: stand at a machine and hold E</p><button class="btn-primary" data-act="resume">Back to the base</button></div>`);
      case "quit": return home();
    }
  });
  // live-update countdowns inside the choices modal
  setInterval(() => {
    if (!S || !S.modalOpen) return;
    const a = document.getElementById("ask-left"); if (a && S.ask) a.textContent = `${Math.ceil(S.ask.left)} s`;
    const e = document.getElementById("storm-eta"); if (e && S.storm) e.textContent = Math.max(0, Math.ceil(S.storm.eta));
  }, 250);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("#popup").hidden) return ($("#popup").hidden = true);
      if (S && !S.over && !gameEl.hidden && !S.modalOpen) return pauseMenu();
    }
  });

  // touch controls
  document.querySelectorAll("#touch button").forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); World.keys[k] = true; b.classList.add("down"); if (k === "left" || k === "right") World.setTarget(null); };
    const off = () => { World.keys[k] = false; b.classList.remove("down"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });

  function showTerm(term) {
    const key = Object.keys(D.glossary).find(k => k.toLowerCase() === term.toLowerCase());
    $("#popup-title").textContent = cap(term);
    $("#popup-text").textContent = key ? D.glossary[key] : "";
    $("#popup").hidden = false; $("#popup-close").focus();
  }

  /* ---------- start ---------- */
  World.init($("#world"), { isRunning: () => S && !S.over && !S.modalOpen, view: () => ({
    life: S.life, power: S.power, shield: S.shield, food: S.food, growth: S.growth, dust: S.dust,
    broken: S.broken, leakAt: S.leakAt, samples: S.samples, carrying: S.carrying, stored: S.stored,
    sending: S.sending > 0, boosting: S.boosting > 0, storm: S.storm && S.storm.phase === "hit" ? 1 : 0,
    stormSoon: !!(S.storm && S.storm.phase === "coming"), speedMul: S.speedMul, lamps: S.power > 0,
    haze: S.placeId === "mars" && S.solarMul < 1 ? 1 - S.solarMul : 0
  }), prompt, done, hold, pickup });
  window.__lo = { get S() { return S; }, update, startMission, endDay };   // debug hook for testing
  requestAnimationFrame(loop);
  loading();
})();
