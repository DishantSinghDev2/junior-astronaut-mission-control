/*
  JUNIOR ASTRONAUT – MISSION CONTROL
  Main game logic + screens. Each day (or sol on Mars):
    1. Briefing   – messages from Earth, surprise storms, late answers
    2. Incident   – a problem with 2–3 choices; every choice has a gain AND a cost
    3. Power plan – share limited power between 5 systems
    4. Report     – what changed and why
  After 8 days -> Mission results.
*/
(() => {
  const D = window.GAME_DATA;
  const C = window.CONFIG;
  const app = document.getElementById("app");
  const I = window.icon;

  const SYSTEMS = [
    { id: "life", icon: "wind", name: "Life Support", help: "Makes air and cleans water. Needs 3 to stay steady.", need: 3 },
    { id: "green", icon: "sprout", name: "Greenhouse", help: "Grows food. The crew eats 2 power's worth a day.", need: 2 },
    { id: "shield", icon: "shield", name: "Radiation Shield", help: "Each unit blocks 1 daily radiation and 20% of a storm.", need: 0 },
    { id: "comms", icon: "radio-tower", name: "Radio to Earth", help: "Sends your science home. Earth can warn you of storms.", need: 1 },
    { id: "science", icon: "flask-conical", name: "Science Lab", help: "Each unit collects 8 science data.", need: 0 }
  ];
  const CATS = {
    life: "Life support", food: "Food production", power: "Power", science: "Science",
    crew: "Crew health", supply: "Supply run", storm: "Radiation alert"
  };
  const MAX_UNITS = 4;
  const BATTERY_MAX = 6;
  const DAYS = C.MISSION_DAYS;

  let S = null;            // game state
  let readAloud = false;

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  const sign = v => (v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : "0");
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const dayName = () => cap(S.place.dayWord);

  function marsDelay() { return Comms.marsDelayMinutes(new Date()); }
  function delayText() { return !S || S.placeId === "moon" ? "1.3 seconds" : `about ${S.delayMin} minutes`; }
  function delayShort() { return !S || S.placeId === "moon" ? "1.3 s" : `~${S.delayMin} min`; }

  // Fill placeholders, glossary words and power symbols
  function fill(text) {
    if (!text) return "";
    let t = esc(text);
    t = t.replace(/\{day\}/g, S ? S.place.dayWord : "day");
    t = t.replace(/\{delay\}/g, delayText());
    t = t.replace(/\{marsDelay\}/g, `about ${marsDelay()} minutes today`);
    t = t.replace(/\[\[([^\]]+)\]\]/g, (m, w) => `<button class="term" data-term="${w}">${w}</button>`);
    t = t.replace(/⚡/g, I("zap", "inline"));
    return t;
  }
  function speak(text) {
    if (!readAloud || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\[\[|\]\]/g, "").replace(/⚡/g, " power"));
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  function render(html) {
    app.innerHTML = html;
    window.scrollTo({ top: 0, behavior: "smooth" });
    const h = app.querySelector("h1, h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    // animate gauges from their previous value
    requestAnimationFrame(() => requestAnimationFrame(() => {
      app.querySelectorAll(".gauge .val[data-to]").forEach(el => (el.style.strokeDashoffset = el.dataset.to));
    }));
    if (S) S.prevMeters = { air: S.air, food: S.food, health: S.health };
  }

  /* ---------- data status chip ---------- */
  function dataChip() {
    const st = Donki.state;
    const saved = window.DONKI_ARCHIVE ? window.DONKI_ARCHIVE.savedOn : "?";
    if (st.status === "loading") return `<span class="chip"><span class="dot"></span>Connecting to NASA DONKI…</span>`;
    if (st.status === "live") return `<span class="chip live"><span class="dot"></span>Live NASA space weather · ${st.live.length} CMEs in 60 days</span>`;
    if (st.archive.length) return `<span class="chip archive"><span class="dot"></span>Archived NASA DONKI data · saved ${esc(saved)}</span>`;
    return `<span class="chip warn"><span class="dot"></span>No NASA data · practice storms only</span>`;
  }

  /* ================= MENU SCREENS ================= */
  function home() {
    S = null;
    render(`
      <section class="home">
        ${scene("moon")}
        <div class="home-copy">
          <span class="label">Team Pheonix · NASA Space Apps 2026</span>
          <h1>Junior Astronaut <em>Mission Control</em></h1>
          <p class="lead">Run a base on the Moon or Mars. Share your power, solve problems, and keep your crew safe for ${DAYS} days.</p>
          <div class="home-actions">
            <button class="btn primary lg" data-go="choose">${I("rocket")} Start mission</button>
            <button class="btn lg" data-go="howto">${I("book-open")} How to play</button>
          </div>
          <div class="home-meta">
            <span id="data-chip">${dataChip()}</span>
            <button class="chip" data-go="sources">${I("satellite")} NASA data</button>
            <button class="chip" data-go="glossary">${I("book-open")} Space words</button>
          </div>
        </div>
      </section>`);
    speak("Junior Astronaut Mission Control. Press Start mission to begin.");
  }

  function choose() {
    const card = (p, diff) => `
      <button class="place ${p.id}" data-start="${p.id}">
        ${scene(p.id)}
        <div class="place-body">
          <div class="place-title">${planet(p.id)}
            <div><span class="label">${p.id === "moon" ? "Lunar south pole" : "Red planet"}</span><h2>${p.name}</h2></div>
          </div>
          <p class="muted" style="margin:0">${esc(p.blurb)}</p>
          <dl class="specs">
            <div class="spec"><dt>Solar power</dt><dd>${p.solar} / ${p.dayWord}</dd></div>
            <div class="spec"><dt>Radiation</dt><dd>${p.radiation} / ${p.dayWord}</dd></div>
            <div class="spec"><dt>Radio delay</dt><dd>${p.id === "moon" ? "1.3 sec" : `~${marsDelay()} min`}</dd></div>
            <div class="spec"><dt>Gravity</dt><dd>${p.id === "moon" ? "1/6 Earth" : "38% Earth"}</dd></div>
          </dl>
          <div class="difficulty">${[1, 2, 3].map(i => `<i class="${i <= diff ? "on" : ""}"></i>`).join("")} ${diff === 1 ? "Good first mission" : "Harder: less power, slow radio"}</div>
        </div>
      </button>`;
    render(`
      <header class="page-head">
        <span class="label">Step 1</span>
        <h1>Choose your base</h1>
        <p>The Mars radio delay is worked out for today's real positions of Earth and Mars.</p>
      </header>
      <div class="places">${card(D.places.moon, 1)}${card(D.places.mars, 2)}</div>
      <div class="back"><button class="btn ghost" data-go="home">${I("arrow-left")} Back</button></div>`);
    speak("Choose your base. The Moon or Mars.");
  }

  function howto() {
    render(`
      <header class="page-head"><span class="label">Training</span><h1>How to play</h1></header>
      <ol class="steps">
        <li><h3>Keep 3 meters above zero</h3><p class="muted">Air &amp; Water, Food and Crew Health. If one hits zero, the crew must fly home.</p></li>
        <li><h3>Solve one problem every day</h3><p class="muted">Every choice has a <span class="good">gain</span> and a <span class="bad">cost</span>. There is no perfect answer — that's real mission planning!</p></li>
        <li><h3>Share your power</h3><p class="muted">The Sun gives you a few power units each day. Give them to your 5 systems:</p>
          <ul class="sys-list">${SYSTEMS.map(s => `<li>${I(s.icon)}<span><b>${s.name}</b><br>${s.help}</span></li>`).join("")}</ul></li>
        <li><h3>Save power in the battery</h3><p class="muted">Power you don't use charges the battery (up to ${BATTERY_MAX}). Use it on hard days.</p></li>
        <li><h3>Watch out for real solar storms</h3><p class="muted">Storms come from real NASA records. If your radio is on, Earth warns you a day early.</p></li>
        <li><h3>Send your science home</h3><p class="muted">Science only counts when it reaches Earth, so keep the radio on. Tap any <button class="term" data-term="sol">underlined word</button> to learn what it means.</p></li>
      </ol>
      <div class="actions back">
        <button class="btn primary lg" data-go="choose">${I("rocket")} I'm ready</button>
        <button class="btn ghost" data-go="home">${I("arrow-left")} Back</button>
      </div>`);
    speak("How to play. Keep air and water, food, and crew health above zero. Share your power between five systems. Every choice has a gain and a cost.");
  }

  function glossary() {
    render(`
      <header class="page-head"><span class="label">Dictionary</span><h1>Space words</h1></header>
      <div class="words">${Object.entries(D.glossary).map(([k, v]) => `<article class="word"><h3>${esc(cap(k))}</h3><p>${esc(v)}</p></article>`).join("")}</div>
      <div class="back"><button class="btn ghost" data-go="home">${I("arrow-left")} Back</button></div>`);
  }

  function sources() {
    const a = window.DONKI_ARCHIVE;
    render(`
      <header class="page-head"><span class="label">Scientific transparency</span><h1>NASA science sources</h1>
        <p>This game uses real NASA data. Here is exactly what we used, and how.</p></header>
      <div class="sources">
        <article class="source main">
          <span class="label">Used for solar storms</span>
          <h2>DONKI — Space Weather Database</h2>
          <p><b>What:</b> NASA's record of real Coronal Mass Ejections (CMEs) and radiation storms (SEP events), from the Community Coordinated Modeling Center.</p>
          <p><b>How we use it:</b> each mission picks 2 real CMEs: one from the live feed (what the Sun did in the last 60 days) and one from our archive of big storms from the 2024–2025 solar maximum.
          The CME's <b>speed</b> sets the storm level (under 1,000 km/s = level 1, 1,000–1,999 = level 2, 2,000+ = level 3). If DONKI linked the CME to a radiation storm (SEP), the level goes up by 1.
          We also use the speed to work out how long the CME would take to reach the Moon or Mars.</p>
          <p><b>Live or archived?</b> The game first asks the live API. If that fails, it uses a saved copy of real DONKI records${a ? ` (saved ${esc(a.savedOn)}, ${a.storms.length} CMEs)` : ""}. Every storm card says which one it is.</p>
          <p>${dataChip()}</p>
          <p class="muted small"><b>Simplification:</b> a real CME only hits a planet if it is aimed that way. The game asks “what if a storm this strong hit our base?”</p>
          <p><a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noopener">ccmc.gsfc.nasa.gov/tools/DONKI</a> · <a href="https://api.nasa.gov" target="_blank" rel="noopener">api.nasa.gov</a></p>
        </article>
        <article class="source">
          <span class="label">Used for power, gravity, radiation, radio delay</span>
          <h2>Planet facts</h2>
          <ul>
            <li><b>Radio delay:</b> Moon ≈ 1.3 s (384,400 km ÷ speed of light). Mars ≈ 3–22 min, estimated for today's date from Earth's and Mars' orbits.</li>
            <li><b>Solar power:</b> Mars gets about 43% of the sunlight Earth gets, so the Mars base has less power.</li>
            <li><b>Radiation:</b> the Moon has no air; Mars has thin air. Measurements (NASA Curiosity's RAD instrument on Mars, and lunar surface measurements) show the Moon's surface gets roughly twice Mars' daily dose, so the game uses 2 for the Moon and 1 for Mars.</li>
            <li><b>Sol length and gravity:</b> NASA Mars and Moon fact sheets.</li>
          </ul>
          <p><a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noopener">NASA Planetary Fact Sheet</a> ·
             <a href="https://science.nasa.gov/mars/facts/" target="_blank" rel="noopener">Mars facts</a> ·
             <a href="https://science.nasa.gov/moon/facts/" target="_blank" rel="noopener">Moon facts</a></p>
        </article>
        <article class="source">
          <span class="label">Used for event cards</span>
          <h2>Real missions behind the events</h2>
          <p>Every event card shows a true fact and its NASA source: ISS water recycling, the Veggie greenhouse, Apollo moon dust, LCROSS lunar ice, the Artemis south pole, Opportunity and the 2018 Mars dust storm, MOXIE oxygen, and the Phoenix lander's perchlorate discovery.</p>
        </article>
        <article class="source next">
          <span class="label">Next step</span>
          <h2>OSDR — Open Science Data Repository</h2>
          <p>Not used yet. Plan: use OSDR radiation dosimetry and astronaut health studies to make the Crew Health meter more realistic. <a href="https://osdr.nasa.gov/" target="_blank" rel="noopener">osdr.nasa.gov</a></p>
        </article>
      </div>
      <p class="muted small back">Game numbers (like “10 food per day”) are simplified for play. Facts and storm data are real. Not an official NASA product.</p>
      <div><button class="btn ghost" data-go="home">${I("arrow-left")} Back</button></div>`);
  }

  /* ================= GAME SETUP ================= */
  function pickStormDays(n) {
    for (let tries = 0; tries < 100; tries++) {
      const cand = [];
      for (let d = 3; d <= DAYS; d++) cand.push(d);
      const days = [];
      while (days.length < n && cand.length) days.push(cand.splice(Math.floor(Math.random() * cand.length), 1)[0]);
      days.sort((a, b) => a - b);
      if (days.every((d, i) => i === 0 || d - days[i - 1] > 1)) return days;
    }
    return [3, 6];
  }

  function newGame(placeId) {
    const place = D.places[placeId];
    const storms = Donki.pickStorms(C.STORMS_PER_MISSION);
    const stormByDay = {};
    pickStormDays(storms.length).forEach((d, i) => (stormByDay[d] = storms[i]));
    S = {
      placeId, place, day: 1,
      air: 70, food: 60, health: 100,
      prevMeters: { air: 70, food: 60, health: 100 },
      battery: 2, stored: 0, sent: 0,
      solarBonus: 0, radMod: 0, tempSolar: [],
      pending: [], inbox: [],
      alloc: { life: 3, green: 2, shield: 0, comms: 1, science: 0 },
      useBattery: 0, lastShield: 0,
      stormByDay, warned: {},
      delayMin: placeId === "mars" ? marsDelay() : null,
      usedEvents: new Set(),
      log: [], history: [{ day: 0, air: 70, food: 60, health: 100 }],
      stats: { commsDays: 0, warnings: 0, surprises: 0, stormDamage: 0, shieldDays: 0, powerUsed: 0, lowAir: 70, lowFood: 60 },
      today: null
    };
    S.inbox.push({ icon: "flag", from: "Mission Control · Earth", text: `Welcome, Commander! Your crew has landed at the ${place.name}. Keep them safe for ${DAYS} ${place.dayWord}s.` });
    startDay();
  }

  /* ================= EFFECTS ================= */
  function applyEffects(e) {
    if (!e) return;
    const T = S.today;
    for (const [k, v] of Object.entries(e)) {
      switch (k) {
        case "air": case "food": case "health": S[k] = clamp(S[k] + v, 0, 100); break;
        case "science": S.stored = Math.max(0, S.stored + v); break;
        case "battery": S.battery = clamp(S.battery + v, 0, BATTERY_MAX); break;
        case "fromBattery": { const m = Math.min(v, S.battery); S.battery -= m; T.powerDelta += m; break; }
        case "powerToday": T.powerDelta += v; break;
        case "shieldBonus": T.shieldBonus += v; break;
        case "noScience": T.noScience = true; break;
        case "stormFactor": T.stormFactor *= v; break;
        case "solarTemp": S.tempSolar.push({ delta: v.delta, until: S.day + v.days - 1 }); break;
        case "solarForever": S.solarBonus += v; break;
        case "radiationForever": S.radMod += v; break;
        case "later": S.pending.push({ day: S.day + v.days, effects: v.effects, msg: v.msg }); break;
      }
    }
  }

  function solarToday() {
    const temp = S.tempSolar.filter(t => t.until >= S.day).reduce((a, t) => a + t.delta, 0);
    return Math.max(0, S.place.solar + S.solarBonus + temp);
  }
  const dailyRadiation = () => Math.max(0, S.place.radiation + S.radMod);
  const stormDamage = (storm, shield, factor) => Math.round(storm.level * 18 * Math.max(0, 1 - 0.2 * shield) * factor);
  const lifeDelta = L => (L >= 3 ? (L - 3) * 4 : (L - 3) * 8);
  const foodDelta = G => G * 5 - 10;

  /* ================= DAY FLOW ================= */
  function startDay() {
    const T = S.today = {
      powerDelta: 0, shieldBonus: 0, noScience: false, stormFactor: 1,
      messages: [], event: null, choice: null,
      storm: S.stormByDay[S.day] || null, warned: !!S.warned[S.day], surprise: null
    };
    S.tempSolar = S.tempSolar.filter(t => t.until >= S.day);
    T.messages.push(...S.inbox); S.inbox = [];

    S.pending.filter(p => p.day === S.day).forEach(p => {
      applyEffects(p.effects);
      T.messages.push({ icon: "message-square", from: "Late reply from Earth", text: p.msg });
    });
    S.pending = S.pending.filter(p => p.day !== S.day);

    // A storm with NO warning hits before you can prepare
    if (T.storm && !T.warned) {
      const dmg = stormDamage(T.storm, S.lastShield, 1);
      S.health = clamp(S.health - dmg, 0, 100);
      S.stats.surprises++; S.stats.stormDamage += dmg;
      T.surprise = { dmg };
      T.messages.push({ icon: "sun", cls: "bad", from: "Base alarm", text: `Surprise solar storm! Your radio was off yesterday, so Earth could not warn you. It hit during the night: crew health −${dmg}.` + (S.lastShield ? ` Yesterday's shield helped a little.` : "") });
      S.log.push({ day: S.day, text: `Surprise solar storm, no warning (−${dmg} health)` });
    }

    T.event = (T.storm && T.warned) ? makeStormEvent(T.storm) : drawEvent();
    if (checkFail()) return;
    briefing();
  }

  function drawEvent() {
    let pool = D.events.filter(e => (e.place === "both" || e.place === S.placeId) && !S.usedEvents.has(e.id));
    if (!pool.length) { S.usedEvents.clear(); pool = D.events.filter(e => e.place === "both" || e.place === S.placeId); }
    const ev = rand(pool);
    S.usedEvents.add(ev.id);
    return ev;
  }

  function makeStormEvent(st) {
    return {
      id: "storm", isStorm: true, icon: "sun", cat: "storm",
      title: "Solar storm incoming!",
      text: "Earth spotted a giant cloud from the Sun (a [[CME]]). It will hit your base today. What should the crew do? You can also add power to the Radiation Shield in your plan.",
      fact: "Water is great at blocking radiation. Artemis astronauts in the Orion capsule can build a storm shelter by moving supply bags around themselves.",
      source: "NASA Artemis / Orion",
      choices: [
        { label: "Everyone into the storm shelter", good: "Storm radiation cut in half", cost: "No science today, −5 air & water",
          effects: { stormFactor: 0.5, noScience: true, air: -5 },
          result: "The crew squeezed into the shelter with water bags all around them. Cozy, and much safer!" },
        { label: "Keep working and measure the storm", good: "+15 science data about the storm", cost: "Crew gets the full storm radiation",
          effects: { science: 15 },
          result: "Scientists love storm data! NASA's Curiosity rover measured solar storms on Mars too. But the crew got more radiation." },
        { label: "Run extra shields on battery", good: "+2 free shield power today", cost: "Uses 3 battery power", needsBattery: 3,
          effects: { shieldBonus: 2, battery: -3 },
          result: "The shields are humming at full power, thanks to your saved battery energy." }
      ]
    };
  }

  /* ================= SHARED PIECES ================= */
  function gauge(key, ic, label, v, from) {
    const R = 34, CIRC = 2 * Math.PI * R;
    const lvl = v <= 20 ? "danger" : v <= 40 ? "low" : "";
    const off = n => (CIRC * (1 - n / 100)).toFixed(1);
    return `<div class="gauge ${key} ${lvl}" role="meter" aria-label="${label}" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100">
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle class="track" cx="42" cy="42" r="${R}" fill="none" stroke-width="9"/>
        <circle class="val" cx="42" cy="42" r="${R}" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${CIRC.toFixed(1)}" style="stroke-dashoffset:${off(from)}" data-to="${off(v)}" transform="rotate(-90 42 42)"/>
        <text x="42" y="50" text-anchor="middle">${v}</text>
      </svg>
      <div class="g-label">${I(ic)}${label}</div>
    </div>`;
  }

  function rail() {
    const p = S.prevMeters;
    const tl = Array.from({ length: DAYS }, (_, i) => {
      const d = i + 1;
      const known = S.stormByDay[d] && (d < S.day || S.warned[d] || (d === S.day && S.today.storm));
      const cls = d < S.day ? "done" : d === S.day ? "now" : "";
      return `<span class="tl ${cls} ${known ? "storm" : ""}" title="${dayName()} ${d}${known ? " · solar storm" : ""}">${d}</span>`;
    }).join("");
    return `<aside class="rail" aria-label="Base status">
      <div class="rail-card">
        <div class="rail-head"><span class="day">${dayName()} ${Math.min(S.day, DAYS)}<small>/ ${DAYS}</small></span><span class="label">${S.place.name}</span></div>
        <div class="timeline">${tl}</div>
      </div>
      <div class="rail-card">
        <div class="gauges">
          ${gauge("air", "wind", "Air & Water", S.air, p.air)}
          ${gauge("food", "sprout", "Food", S.food, p.food)}
          ${gauge("health", "heart-pulse", "Crew Health", S.health, p.health)}
        </div>
      </div>
      <div class="rail-card readouts">
        <div class="readout">${I("battery-medium")} Battery <span class="cells" aria-label="${S.battery} of ${BATTERY_MAX}">${Array.from({ length: BATTERY_MAX }, (_, i) => `<i class="${i < S.battery ? "on" : ""}"></i>`).join("")}</span></div>
        <div class="readout">${I("flask-conical")} Data waiting <b>${S.stored}</b></div>
        <div class="readout">${I("send")} Sent to Earth <b>${S.sent}</b></div>
        <div class="readout">${I("radio")} Radio delay <b>${delayShort()}</b></div>
      </div>
    </aside>`;
  }

  const consoleView = stage => `<div class="console">${rail()}<div class="stage">${stage}</div></div>`;

  function cmeBox(st) {
    if (st.source === "practice") return `<div class="callout">${I("triangle-alert")} Practice storm: no NASA data could be loaded, so this storm is made up.</div>`;
    const dest = S.placeId === "moon" ? "the Moon" : "Mars";
    const hours = Donki.hoursToTravel(st.speed, S.placeId === "moon" ? 1.0 : 1.52);
    const badge = st.source === "live" ? `<span class="chip live"><span class="dot"></span>Live NASA data</span>` : `<span class="chip archive"><span class="dot"></span>Archived NASA data</span>`;
    return `<div class="cme">
      <div class="cme-top"><span class="label">NASA DONKI · real CME record</span>${badge}</div>
      <dl class="cme-stat"><dt>Left the Sun</dt><dd>${esc(st.date)}${st.time ? ` <small>${esc(st.time)} UTC</small>` : ""}</dd></dl>
      <dl class="cme-stat"><dt>Speed</dt><dd>${st.speed.toLocaleString()} <small>km/s</small></dd></dl>
      <dl class="cme-stat"><dt>Trip to ${dest}</dt><dd>~${hours} <small>hours</small></dd></dl>
      <dl class="cme-stat"><dt>Storm level</dt><dd>${st.level} <small>of 3</small><div class="flames">${[1, 2, 3].map(i => `<i class="${i <= st.level ? "on" : ""}"></i>`).join("")}</div></dd></dl>
      <p>${st.hasSep ? `DONKI linked this CME to a radiation storm of fast particles (<button class="term" data-term="SEP">SEP</button>), so it's extra dangerous. ` : ""}${st.link ? `<a href="${esc(st.link)}" target="_blank" rel="noopener">See this record on DONKI</a>` : ""}</p>
    </div>`;
  }

  /* ---------- 1. Briefing ---------- */
  function briefing() {
    const T = S.today;
    const feed = T.messages.map(m => `
      <li class="tx ${m.cls || ""}"><span class="badge">${I(m.icon)}</span>
        <div><div class="from">${esc(m.from || "Mission Control · Earth")}</div><p>${fill(m.text)}</p></div></li>`).join("");
    const solar = solarToday();
    render(consoleView(`
      <div class="window">${scene(S.placeId)}
        <div class="window-copy"><span class="chip">${I("sunrise")} ${S.place.name} · ${S.place.dayWord} ${S.day}</span></div></div>
      <section class="panel" style="display:grid;gap:16px">
        <div><span class="label">Morning briefing · incoming transmissions</span><h2>Good morning, Commander</h2></div>
        ${feed ? `<ul class="feed">${feed}</ul>` : `<p class="muted">All quiet at the base this morning.</p>`}
        ${T.surprise ? cmeBox(T.storm) : ""}
        <div class="forecast"><div class="big">${I("zap")}${solar}</div>
          <div><b>Power forecast</b><br><span class="muted small">Your solar panels will make ${solar} power today.</span></div></div>
        <div class="actions"><button class="btn primary lg" data-go="event">See today's challenge ${I("arrow-right")}</button></div>
      </section>`));
    speak(`Good morning, Commander. ${dayName()} ${S.day}. ` + T.messages.map(m => m.text).join(" "));
  }

  /* ---------- 2. Incident ---------- */
  function eventScreen() {
    const T = S.today, ev = T.event;
    const text = ev[S.placeId === "moon" ? "textMoon" : "textMars"] || ev.text;
    const fact = ev[S.placeId === "moon" ? "factMoon" : "factMars"] || ev.fact;
    let body;
    if (!T.choice) {
      body = `<div class="options">${ev.choices.map((c, i) => {
        const disabled = c.needsBattery && S.battery < c.needsBattery;
        return `<button class="option" data-choice="${i}" ${disabled ? "disabled" : ""}>
          <span class="key">${"ABC"[i]}</span>
          <strong>${fill(c.label)}</strong>
          <span class="tradeoff">
            <span class="gain">${I("check")}<span>${fill(c.good)}</span></span>
            <span class="cost">${I("triangle-alert")}<span>${fill(c.cost)}</span></span>
          </span>
          ${disabled ? `<span class="need">Needs ${c.needsBattery} battery</span>` : ""}
        </button>`; }).join("")}</div>`;
    } else {
      body = `<div class="outcome"><span class="badge">${I(ev.icon)}</span>
          <div><span class="label">You chose: ${fill(T.choice.label)}</span><p>${fill(T.choice.result)}</p></div></div>
        <div class="actions"><button class="btn primary lg" data-go="plan">${I("zap")} Plan today's power ${I("arrow-right")}</button></div>`;
    }
    render(consoleView(`
      <section class="panel incident" data-cat="${ev.cat || "science"}">
        <header class="incident-head">
          <div class="emblem"><span>${I(ev.icon)}</span></div>
          <div><span class="label">${CATS[ev.cat] || "Incident"} · ${dayName()} ${S.day}</span>
            <h2>${fill(ev.title)}</h2><p>${fill(text)}</p></div>
        </header>
        <div class="incident-body">
          ${ev.base ? `<div class="callout sun">${I("zap")} This changes your power today. Read the choices carefully.</div>` : ""}
          ${ev.isStorm ? cmeBox(T.storm) : ""}
          ${body}
          <aside class="note-card"><span class="badge">${I("lightbulb")}</span>
            <div><span class="label">Real space fact</span><p>${fill(fact)}</p><span class="src">Source · ${esc(ev.source)}</span></div></aside>
        </div>
      </section>`));
    if (!T.choice) speak(`${ev.title} ${text} ` + ev.choices.map((c, i) => `Choice ${"ABC"[i]}: ${c.label}.`).join(" "));
    else speak(T.choice.result);
  }

  function pickChoice(i) {
    const T = S.today, ev = T.event, ch = ev.choices[i];
    if (T.choice || !ch || (ch.needsBattery && S.battery < ch.needsBattery)) return;
    const v = ch.ask ? ch[S.placeId] : ch;
    if (ev.base) applyEffects(ev.base);
    applyEffects(v.effects);
    T.choice = { label: ch.label, result: v.result };
    S.log.push({ day: S.day, text: `${fill(ev.title)} <b>${fill(ch.label)}</b>` });
    if (checkFail()) return;
    eventScreen();
  }

  /* ---------- 3. Power plan ---------- */
  const sunPower = () => Math.max(0, solarToday() + S.today.powerDelta);
  const available = () => sunPower() + S.useBattery;
  const used = () => Object.values(S.alloc).reduce((a, b) => a + b, 0);

  function preview() {
    const T = S.today, a = S.alloc;
    const shield = a.shield + T.shieldBonus;
    const rad = dailyRadiation();
    const storm = T.storm && T.warned ? stormDamage(T.storm, shield, T.stormFactor) : 0;
    const made = T.noScience ? 0 : a.science * 8;
    const left = available() - used();
    return {
      life: lifeDelta(a.life), food: foodDelta(a.green),
      radiation: -Math.max(0, rad - shield), storm: -storm, shield, rad,
      made, sends: a.comms >= 1 ? S.stored + made : 0,
      left, batteryAfter: clamp(S.battery - S.useBattery + Math.max(0, left), 0, BATTERY_MAX)
    };
  }

  function plan() {
    const T = S.today;
    while (used() > available()) {
      const k = ["science", "shield", "comms", "green", "life"].find(k => S.alloc[k] > 0);
      if (!k) break; S.alloc[k]--;
    }
    const p = preview();
    const cls = v => (v > 0 ? "good" : v < 0 ? "bad" : "neutral");
    const effect = {
      life: `<span class="${cls(p.life)}">AIR &amp; WATER ${sign(p.life)}</span>`,
      green: `<span class="${cls(p.food)}">FOOD ${sign(p.food)}</span>`,
      shield: `<span class="${cls(p.radiation + p.storm)}">HEALTH ${sign(p.radiation)} RADIATION${T.storm && T.warned ? ` · ${sign(p.storm)} STORM` : ""}</span>${T.shieldBonus ? ` <span class="good">+${T.shieldBonus} FREE</span>` : ""}`,
      comms: S.alloc.comms >= 1 ? `<span class="good">SENDS ${p.sends} DATA · STORM WARNINGS ON</span>` : `<span class="bad">NO DATA SENT · NO WARNINGS</span>`,
      science: T.noScience ? `<span class="bad">CREW IN SHELTER · NO SCIENCE</span>` : `<span class="${cls(p.made)}">DATA +${p.made}</span>`
    };
    const rows = SYSTEMS.map(s => {
      const n = S.alloc[s.id];
      const bars = Array.from({ length: MAX_UNITS }, (_, i) => `<i class="${i < n ? "on" : ""} ${i < s.need ? "need" : ""}"></i>`).join("");
      return `<div class="sys" data-sys="${s.id}">
        <span class="sys-icon">${I(s.icon)}</span>
        <div class="sys-name"><b>${s.name}</b><small>${s.help}</small></div>
        <div class="sys-effect">${effect[s.id]}</div>
        <div class="ctl">
          <button class="step" data-dec="${s.id}" aria-label="Less power to ${s.name}" ${n <= 0 ? "disabled" : ""}>${I("minus")}</button>
          <span class="bars" aria-label="${n} of ${MAX_UNITS} power">${bars}</span>
          <button class="step plus" data-inc="${s.id}" aria-label="More power to ${s.name}" ${n >= MAX_UNITS || p.left <= 0 ? "disabled" : ""}>${I("plus")}</button>
        </div>
      </div>`;
    }).join("");
    const sun = sunPower(), u = used();
    const tokens = Array.from({ length: sun + S.useBattery }, (_, i) =>
      `<span class="token ${i >= sun ? "batt" : ""} ${i < u ? "used" : ""}">${I(i >= sun ? "battery-medium" : "zap")}</span>`).join("");
    render(consoleView(`
      <section class="panel">
        <div class="plan-head">
          <div><span class="label">Power plan · ${dayName()} ${S.day}</span><h2>Share your power</h2></div>
        </div>
        <div class="reservoir">
          <div class="tokens" aria-hidden="true">${tokens || `<span class="muted">No power today!</span>`}</div>
          <div class="left-count ${p.left === 0 ? "zero" : ""}"><b>${p.left}</b><span>left to share</span></div>
          <div class="reservoir-meta">
            <span>${I("sun")} ${sun} from the Sun${T.powerDelta ? ` (${sign(T.powerDelta)} from today's events)` : ""}</span>
            <span class="batt-ctl">${I("battery-medium")} Use battery
              <button class="step mini" data-batt="-1" aria-label="Use less battery" ${S.useBattery <= 0 ? "disabled" : ""}>${I("minus")}</button>
              <b class="mono">${S.useBattery}</b>
              <button class="step mini plus" data-batt="1" aria-label="Use more battery" ${S.useBattery >= S.battery ? "disabled" : ""}>${I("plus")}</button>
              <span class="muted small">${S.battery} stored</span></span>
            ${p.left > 0 ? `<span class="muted small">Leftover power charges the battery.</span>` : ""}
          </div>
        </div>
        ${T.storm && T.warned ? `<div class="callout" style="margin-top:14px">${I("sun")} Storm today! Each shield power blocks 20% of the storm.</div>` : ""}
        <div class="systems">${rows}</div>
        ${S.day === DAYS && S.alloc.comms < 1 && S.stored + p.made > 0 ? `<div class="callout" style="margin-top:14px">${I("radio-tower")} Last ${S.place.dayWord}! With the radio off, your science will never reach Earth.</div>` : ""}
        <div class="actions" style="margin-top:20px"><button class="btn go lg" data-go="endday">${I("check")} End ${S.place.dayWord} ${S.day}</button></div>
      </section>`));
  }

  /* ---------- 4. End of day ---------- */
  function endDay() {
    const T = S.today, a = { ...S.alloc }, p = preview();
    const changes = [];
    const add = (icon, color, what, v, why) => changes.push({ icon, color, what, v, why });

    S.air = clamp(S.air + p.life, 0, 100);
    add("wind", "var(--sky)", "Air & Water", p.life, a.life < 3 ? `Life support only had ${a.life} power (it needs 3).` : a.life > 3 ? "Extra power refilled the tanks." : "Life support ran normally.");

    S.food = clamp(S.food + p.food, 0, 100);
    add("sprout", "var(--leaf)", "Food", p.food, `The crew ate 10. The greenhouse grew ${a.green * 5}.`);

    S.health = clamp(S.health + p.radiation, 0, 100);
    add("shield", "var(--rose)", "Crew Health", p.radiation, `Space radiation today: ${p.rad}. Your shield blocked ${Math.min(p.rad, p.shield)}.`);
    if (p.shield > 0) S.stats.shieldDays++;

    if (T.storm && T.warned) {
      S.health = clamp(S.health + p.storm, 0, 100);
      S.stats.stormDamage += -p.storm;
      add("sun", "var(--coral)", "Solar storm", p.storm, `Level ${T.storm.level} storm. Your shield blocked ${Math.min(100, p.shield * 20)}%${T.stormFactor < 1 ? ", and the shelter cut it in half" : ""}.`);
      S.log.push({ day: S.day, text: `Solar storm with warning (${sign(p.storm)} health)` });
    }

    S.stored += p.made;
    if (p.made) add("flask-conical", "var(--lilac)", "Science data", p.made, `The lab collected ${p.made} data.`);

    if (a.comms >= 1) {
      S.stats.commsDays++;
      const sentNow = S.stored;
      S.sent += sentNow; S.stored = 0;
      add("send", "var(--mint)", "Sent to Earth", sentNow, sentNow ? `Your data is safe on Earth! It took ${delayText()} to arrive.` : "Nothing to send, but Earth can still reach you.");
      const next = S.stormByDay[S.day + 1];
      if (next) {
        S.warned[S.day + 1] = true; S.stats.warnings++;
        S.inbox.push({ icon: "triangle-alert", cls: "warn", from: "Space weather warning", text: `Scientists saw a [[CME]] leave the Sun. It will reach you today! (This message took ${delayText()} to arrive.)` });
      } else if (S.day < DAYS) {
        S.inbox.push({ icon: "earth", text: rand(D.earthTips).replace(/^Mission Control says: /, "") });
      }
    } else {
      add("radio", "var(--ink-3)", "Radio off", 0, "No data was sent, and Earth could not send you any messages.");
    }

    const left = Math.max(0, p.left);
    S.battery = p.batteryAfter;
    if (S.useBattery || left) add("battery-medium", "var(--mint)", "Battery", left - S.useBattery, `Used ${S.useBattery}, stored ${left} unused power (max ${BATTERY_MAX}).`);

    S.stats.powerUsed += used();
    S.lastShield = p.shield;
    S.useBattery = 0;
    S.stats.lowAir = Math.min(S.stats.lowAir, S.air);
    S.stats.lowFood = Math.min(S.stats.lowFood, S.food);
    S.history.push({ day: S.day, air: S.air, food: S.food, health: S.health });
    T.changes = changes;
    if (checkFail()) return;
    report();
  }

  function report() {
    const T = S.today, last = S.day >= DAYS;
    const cls = v => (v > 0 ? "good" : v < 0 ? "bad" : "neutral");
    render(consoleView(`
      <section class="panel" style="display:grid;gap:16px">
        <div><span class="label">End of ${S.place.dayWord} report</span><h2>${dayName()} ${S.day} complete</h2></div>
        <ul class="telemetry">${T.changes.map(c => `
          <li><span class="t-ic" style="color:${c.color}">${I(c.icon)}</span>
            <span class="t-what">${c.what}</span>
            <span class="t-val ${cls(c.v)}">${c.v ? sign(c.v) : "—"}</span>
            <span class="t-why">${fill(c.why)}</span></li>`).join("")}
        </ul>
        <aside class="note-card"><span class="badge">${I("orbit")}</span><div><span class="label">Did you know?</span><p>${fill(rand(S.place.facts))}</p></div></aside>
        <div class="actions">
          <button class="btn primary lg" data-go="${last ? "finish" : "next"}">${last ? `${I("flag")} See mission results` : `${I("moon-star")} Sleep · start ${S.place.dayWord} ${S.day + 1}`}</button>
        </div>
      </section>`));
    speak(`End of ${S.place.dayWord} ${S.day}.`);
  }

  function checkFail() {
    if (S.air <= 0 || S.food <= 0 || S.health <= 0) { results(false); return true; }
    return false;
  }

  /* ---------- 5. Results ---------- */
  function chart() {
    const W = 560, H = 220, padL = 30, padR = 12, padT = 16, padB = 28;
    const x = d => padL + (d / DAYS) * (W - padL - padR);
    const y = v => H - padB - (v / 100) * (H - padT - padB);
    const line = k => `<polyline class="ln ${k}" points="${S.history.map(h => `${x(h.day).toFixed(1)},${y(h[k]).toFixed(1)}`).join(" ")}"/>`;
    const grid = [0, 50, 100].map(v => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 4}">${v}</text>`).join("");
    const days = Array.from({ length: DAYS + 1 }, (_, d) => `<text x="${x(d) - 3}" y="${H - 8}">${d}</text>`).join("");
    const bands = Object.keys(S.stormByDay).map(Number).filter(d => d <= S.day)
      .map(d => `<rect class="storm-band" x="${x(d - 1)}" y="${padT}" width="${x(1) - x(0)}" height="${H - padT - padB}" rx="6"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Chart of air and water, food and crew health over the mission">
      ${bands}${grid}${days}${line("air")}${line("food")}${line("health")}</svg>`;
  }

  function patch(stars) {
    const moon = S.placeId === "moon";
    const col = moon ? "#CFCBEA" : "#FF7A45";
    const sky = moon ? "#1d1650" : "#6B2B4A";
    const starPath = window.ICONS.star;
    const starsSvg = [0, 1, 2].map(i => `<g transform="translate(${80 + i * 20} 150) scale(.8)" fill="${i < stars ? "#FFC23D" : "none"}" stroke="${i < stars ? "#FFC23D" : "#8f86c4"}" stroke-width="2">${starPath}</g>`).join("");
    const label = `JUNIOR ASTRONAUT · ${S.place.name.toUpperCase()} · TEAM PHEONIX · 2026 · `;
    return `<svg class="patch" viewBox="0 0 220 220" role="img" aria-label="Mission patch with ${stars} of 3 stars">
      <defs><path id="ringPath" d="M110,110 m-86,0 a86,86 0 1,1 172,0 a86,86 0 1,1 -172,0"/><clipPath id="patchClip"><circle cx="110" cy="110" r="70"/></clipPath></defs>
      <circle cx="110" cy="110" r="108" fill="${col}"/>
      <circle cx="110" cy="110" r="100" fill="#120e30"/>
      <text class="ring-text"><textPath href="#ringPath" textLength="535" lengthAdjust="spacing">${label}</textPath></text>
      <g clip-path="url(#patchClip)">
        <rect width="220" height="220" fill="${sky}"/>
        <circle cx="70" cy="70" r="1.6" fill="#fff"/><circle cx="150" cy="60" r="1.2" fill="#fff"/><circle cx="120" cy="84" r="1" fill="#fff"/><circle cx="88" cy="100" r="1.2" fill="#fff"/>
        ${moon ? `<circle cx="146" cy="82" r="13" fill="#2F7BFF"/><path d="M137 78c4-5 10-4 12 1s-2 7 1 10-5 7-9 3-8-11-4-14z" fill="#4FD18B"/>`
               : `<circle cx="146" cy="82" r="9" fill="#FFF4D6"/><circle cx="146" cy="82" r="18" fill="#FFF4D6" opacity=".15"/>`}
        <circle cx="110" cy="252" r="128" fill="${col}"/>
        <path d="M88 128 a22 22 0 0 1 44 0z" fill="#fff"/><rect x="128" y="118" width="26" height="10" rx="5" fill="#fff"/>
        <circle cx="104" cy="118" r="3" fill="#FFC23D"/><circle cx="116" cy="118" r="3" fill="#FFC23D"/>
        <g transform="translate(60 112) skewX(-14)"><rect width="18" height="11" rx="1" fill="#2B3FA8"/></g>
        ${starsSvg}
      </g>
      <circle cx="110" cy="110" r="70" fill="none" stroke="${col}" stroke-width="4"/>
    </svg>`;
  }

  function results(success) {
    const st = S.stats;
    const why = S.air <= 0 ? "ran out of air and water" : S.food <= 0 ? "ran out of food" : "got too much radiation";
    const lowest = Math.min(S.air, S.food, S.health);
    const crit = [success, success && S.sent >= 100, success && lowest >= 40];
    const stars = crit.filter(Boolean).length;
    const days = success ? DAYS : S.day;
    const storms = Object.entries(S.stormByDay).map(([d, s]) => ({ d: Number(d), s })).filter(o => o.d <= S.day);
    const lesson = (ic, color, title, text) => `<div class="lesson"><span class="t-ic" style="color:${color};background:color-mix(in srgb, ${color} 16%, transparent)">${I(ic)}</span><div><b>${title}</b><p>${text}</p></div></div>`;
    const crit3 = (on, text) => `<li><span class="star ${on ? "on" : ""}">${I("star")}</span>${text}</li>`;
    render(`<div class="stage">
      <section class="panel results-hero">
        ${patch(stars)}
        <div>
          <span class="label">${success ? "Mission complete" : "Mission ended early"} · ${S.place.name}</span>
          <h1>${success ? (stars === 3 ? "Perfect mission, Commander!" : "Your crew made it home!") : "The crew had to fly home"}</h1>
          <p class="muted">${success
            ? `Your crew lived at the ${S.place.name} for ${DAYS} ${S.place.dayWord}s.`
            : `On ${S.place.dayWord} ${S.day} the crew ${why}. They flew home safely; real missions have backup plans too. Try a new strategy!`}</p>
          <ul class="criteria">
            ${crit3(crit[0], `Keep the crew safe for all ${DAYS} ${S.place.dayWord}s`)}
            ${crit3(crit[1], `Send 100+ science data to Earth <span class="muted">(you sent ${S.sent})</span>`)}
            ${crit3(crit[2], `Finish with every meter at 40 or more`)}
          </ul>
        </div>
      </section>
      ${S.stored ? `<div class="callout">${I("radio")} ${S.stored} science data never reached Earth, because the radio was off at the end.</div>` : ""}
      <div class="grid-2">
        <section class="panel">
          <span class="label">Telemetry</span><h2>Your base over time</h2>
          <div class="chart-wrap">${chart()}</div>
          <div class="legend"><span><i style="background:var(--sky)"></i>Air &amp; Water</span><span><i style="background:var(--leaf)"></i>Food</span><span><i style="background:var(--rose)"></i>Crew Health</span><span><i style="background:rgba(255,93,93,.4);height:10px"></i>Solar storm</span></div>
        </section>
        <section class="panel">
          <span class="label">Debrief</span><h2>What you practised</h2>
          <div class="lessons">
            ${lesson("wind", "var(--sky)", "Life support", `Your lowest Air & Water was ${st.lowAir}. Machines that recycle air and water need steady power.`)}
            ${lesson("shield", "var(--rose)", "Radiation shielding", `${storms.length} solar storm${storms.length === 1 ? "" : "s"}, ${st.warnings} warning${st.warnings === 1 ? "" : "s"}, ${st.surprises} surprise${st.surprises === 1 ? "" : "s"}. Storms took ${st.stormDamage} health.`)}
            ${lesson("zap", "var(--sun)", "Power budgeting", `You shared ${st.powerUsed} power over ${days} ${S.place.dayWord}s. Power for one system is power another system doesn't get.`)}
            ${lesson("sprout", "var(--leaf)", "Food production", `Your lowest food was ${st.lowFood}. The greenhouse needs power every ${S.place.dayWord}.`)}
            ${lesson("radio-tower", "var(--mint)", "Communication delay", `Radio on for ${st.commsDays} of ${days} ${S.place.dayWord}s. Messages took ${delayText()} each way${S.placeId === "mars" ? ", so on Mars you often had to decide alone." : "."}`)}
          </div>
        </section>
      </div>
      <div class="grid-2">
        <section class="panel">
          <span class="label">Mission log</span><h2>Your decisions</h2>
          <ol class="log">${S.log.map(l => `<li><span>${S.place.dayWord.toUpperCase()} ${l.day}</span><div>${l.text}</div></li>`).join("")}</ol>
        </section>
        <section class="panel">
          <span class="label">NASA DONKI</span><h2>Real storms in this mission</h2>
          <ul class="storms-used">${storms.map(o => `<li><b>${dayName()} ${o.d}:</b> ${o.s.source === "practice" ? "Practice storm (no NASA data loaded)"
            : `CME on ${esc(o.s.date)}, ${o.s.speed.toLocaleString()} km/s, level ${o.s.level} · ${o.s.source === "live" ? "live" : "archived"} NASA data${o.s.link ? ` · <a href="${esc(o.s.link)}" target="_blank" rel="noopener">record</a>` : ""}`}</li>`).join("") || "<li>No storms reached you this time.</li>"}</ul>
        </section>
      </div>
      <div class="actions">
        <button class="btn primary lg" data-start="${S.placeId}">${I("rocket")} Play again</button>
        <button class="btn lg" data-start="${S.placeId === "moon" ? "mars" : "moon"}">${I("orbit")} Try ${S.placeId === "moon" ? "Mars" : "the Moon"}</button>
        <button class="btn ghost" data-go="home">${I("house")} Main menu</button>
      </div>
    </div>`);
    speak(success ? `Mission complete! You earned ${stars} stars.` : `Mission ended early. The crew ${why}.`);
  }

  /* ================= INPUT ================= */
  document.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("term")) return showTerm(t.dataset.term);
    if (t.id === "popup-close") return hideTerm();
    if (t.id === "btn-home") return home();
    if (t.id === "btn-read") {
      readAloud = !readAloud;
      t.setAttribute("aria-pressed", readAloud);
      t.innerHTML = `${I(readAloud ? "volume-2" : "volume-x")}<span class="txt">Read aloud: ${readAloud ? "on" : "off"}</span>`;
      if (!readAloud && "speechSynthesis" in window) speechSynthesis.cancel(); else speak("Read aloud is on.");
      return;
    }
    if (t.dataset.start) return newGame(t.dataset.start);
    if (t.dataset.choice) return pickChoice(Number(t.dataset.choice));
    if (t.dataset.inc || t.dataset.dec || t.dataset.batt) {
      const sel = t.dataset.inc ? `[data-inc="${t.dataset.inc}"]` : t.dataset.dec ? `[data-dec="${t.dataset.dec}"]` : `[data-batt="${t.dataset.batt}"]`;
      if (t.dataset.inc) { if (preview().left > 0 && S.alloc[t.dataset.inc] < MAX_UNITS) S.alloc[t.dataset.inc]++; }
      else if (t.dataset.dec) { if (S.alloc[t.dataset.dec] > 0) S.alloc[t.dataset.dec]--; }
      else S.useBattery = clamp(S.useBattery + Number(t.dataset.batt), 0, S.battery);
      const y = window.scrollY;
      plan();
      window.scrollTo(0, y);
      const b = app.querySelector(sel);
      if (b && !b.disabled) b.focus({ preventScroll: true });
      return;
    }
    const screens = {
      home, choose, howto, glossary, sources,
      event: eventScreen, plan, endday: endDay,
      next: () => { S.day++; startDay(); },
      finish: () => results(true)
    };
    const go = screens[t.dataset.go];
    if (go) go();
  });

  // keyboard: A/B/C or 1/2/3 to pick a choice
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") return hideTerm();
    if (!popup.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const idx = { a: 0, b: 1, c: 2, 1: 0, 2: 1, 3: 2 }[e.key.toLowerCase()];
    if (idx !== undefined && app.querySelector(`[data-choice="${idx}"]`)) pickChoice(idx);
  });

  /* ---------- glossary popup ---------- */
  const popup = document.getElementById("popup");
  function showTerm(term) {
    const key = Object.keys(D.glossary).find(k => k.toLowerCase() === term.toLowerCase());
    popup.querySelector("h3").textContent = cap(term);
    popup.querySelector("p").textContent = key ? D.glossary[key] : "No explanation yet.";
    popup.hidden = false;
    popup.querySelector("#popup-close").focus();
    speak(`${term}. ${key ? D.glossary[key] : ""}`);
  }
  function hideTerm() { popup.hidden = true; }

  /* ---------- start ---------- */
  document.getElementById("btn-read").innerHTML = `${I("volume-x")}<span class="txt">Read aloud: off</span>`;
  document.getElementById("brand-mark").innerHTML = I("rocket");
  home();
  Donki.load().then(() => {
    const chip = document.getElementById("data-chip");
    if (chip) chip.innerHTML = dataChip();
  });
})();
