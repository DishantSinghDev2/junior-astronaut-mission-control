/*
  LUNAR OUTPOST — the playable world (HTML canvas).
  A side view of the outpost. The astronaut walks, jumps and works at stations.

  Physics: jump speed is the same everywhere, but gravity is REAL:
    Moon 1.62 m/s², Mars 3.71 m/s² (NASA fact sheets) -> Moon jumps go ~2.3x higher and float longer.

  The game (game.js) supplies handlers:
    view()                 -> numbers the drawing needs (meters, dust, broken machines...)
    prompt(station)        -> { text, hold, continuous, enabled } or null
    done(station)          -> a hold action finished
    hold(station, dt)      -> called every frame while a continuous action is held
    pickup(sample)         -> astronaut touched a rock sample
*/
window.World = (() => {
  const H = 460;               // world height (units)
  const GROUND = 380;          // y of the ground
  const W = 2720;              // world width
  const HAB_L = 560, HAB_R = 1770, HAB_TOP = GROUND - 210;
  const PLAYER_H = 62;
  const JUMP_V = 230;          // units/s
  const G_SCALE = 100;         // m/s² -> units/s²
  const WALK = 250;

  const STATIONS = [
    { id: "panel0", kind: "panel", x: 120, out: true, label: "Solar panel", idx: 0 },
    { id: "panel1", kind: "panel", x: 265, out: true, label: "Solar panel", idx: 1 },
    { id: "panel2", kind: "panel", x: 410, out: true, label: "Solar panel", idx: 2 },
    { id: "life", kind: "life", x: 690, label: "Life Support" },
    { id: "green", kind: "green", x: 925, label: "Greenhouse" },
    { id: "shield", kind: "shield", x: 1160, label: "Shield Generator" },
    { id: "shelter", kind: "shelter", x: 1395, label: "Storm Shelter" },
    { id: "lab", kind: "lab", x: 1630, label: "Science Lab" },
    { id: "dish", kind: "dish", x: 2010, out: true, label: "Radio Dish" }
  ];
  const WALLS = [808, 1043, 1278, 1513];   // room dividers inside the habitat

  let cv, ctx, dpr = 1, scale = 1, viewW = 900, camX = 0, topPad = 0, botPad = 0;
  const MIN_VIEW = 1040;     // always show at least this much of the world
  let place = "moon";
  let P = null;
  const keys = { left: false, right: false, jump: false, act: false };
  let jumpLatch = false, actLatch = false;
  let handlers = {};
  let t = 0;
  let parts = [];
  let holdProg = 0, holdId = null;
  let stars = [];

  /* ---------------- setup ---------------- */
  function init(canvas, h) {
    cv = canvas; ctx = cv.getContext("2d"); handlers = h;
    const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);
    stars = Array.from({ length: 140 }, () => ({ x: r() * 1800, y: r() * 300, s: r() * 1.4 + 0.4, tw: r() * 6 }));
    resize();
    window.addEventListener("resize", resize);
    bindInput();
  }

  function reset(placeId) {
    place = placeId;
    P = { x: 1160, y: GROUND, vy: 0, onGround: true, face: 1, walk: 0, target: null, speedMul: 1, carrying: 0 };
    parts = []; holdProg = 0; holdId = null;
  }

  function resize() {
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(rect.width * dpr));
    cv.height = Math.max(1, Math.round(rect.height * dpr));
    const narrow = rect.width < 700;
    scale = Math.min(rect.height / H, rect.width / (narrow ? 560 : MIN_VIEW));
    viewW = rect.width / scale;
    const extra = rect.height / scale - H;   // spare height when the canvas is tall
    topPad = narrow ? extra * 0.3 : extra;   // phones: most spare space becomes ground (room for touch buttons)
    botPad = extra - topPad;
  }

  /* ---------------- input ---------------- */
  function bindInput() {
    const map = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "jump", w: "jump", W: "jump", " ": "jump", e: "act", E: "act", Enter: "act" };
    window.addEventListener("keydown", e => {
      const k = map[e.key];
      if (!k || !active()) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
      keys[k] = true; if (k === "left" || k === "right") P.target = null;
    });
    window.addEventListener("keyup", e => { const k = map[e.key]; if (k) keys[k] = false; });
    window.addEventListener("blur", () => Object.keys(keys).forEach(k => (keys[k] = false)));
    // tap / click the world to walk there
    cv.addEventListener("pointerdown", e => {
      if (!P) return;
      const rect = cv.getBoundingClientRect();
      const wx = camX + (e.clientX - rect.left) / scale;
      P.target = Math.max(20, Math.min(W - 20, wx));
    });
  }
  const active = () => !!P && handlers.isRunning && handlers.isRunning();

  /* ---------------- helpers ---------------- */
  const inside = x => x > HAB_L && x < HAB_R;
  const isOutside = () => P && !inside(P.x);
  function roomOf(x) {
    if (!inside(x)) return x < HAB_L ? "outside-left" : "outside-right";
    const st = STATIONS.filter(s => !s.out).reduce((a, s) => (Math.abs(s.x - x) < Math.abs(a.x - x) ? s : a));
    return st.id;
  }
  function nearStation() {
    let best = null, bd = 80;
    for (const s of STATIONS) {
      const d = Math.abs(s.x - P.x);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function burst(kind, x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 60;
      parts.push({ kind, x, y, vx: Math.cos(a) * sp, vy: kind === "dust" ? -Math.abs(Math.sin(a) * sp * 0.6) : Math.sin(a) * sp, life: 1, max: 0.6 + Math.random() * 0.8 });
    }
  }

  /* ---------------- simulation ---------------- */
  function step(dt) {
    if (!P) return;
    t += dt;
    const v = handlers.view();
    const g = (place === "moon" ? 1.62 : 3.71) * G_SCALE;
    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (!dir && P.target !== null) {
      const d = P.target - P.x;
      if (Math.abs(d) < 6) P.target = null; else dir = Math.sign(d);
    }
    const sp = WALK * (v.speedMul || 1);
    P.x = Math.max(20, Math.min(W - 20, P.x + dir * sp * dt));
    if (dir) { P.face = dir; P.walk += dt * 10; } else P.walk *= 0.8;

    if (keys.jump && !jumpLatch && P.onGround) { P.vy = -JUMP_V; P.onGround = false; jumpLatch = true; }
    if (!keys.jump) jumpLatch = false;
    if (!P.onGround) {
      P.vy += g * dt; P.y += P.vy * dt;
      if (inside(P.x) && P.y - PLAYER_H < HAB_TOP + 14) { P.y = HAB_TOP + 14 + PLAYER_H; P.vy = Math.max(P.vy, 0); }
      if (P.y >= GROUND) { P.y = GROUND; P.vy = 0; P.onGround = true; if (!inside(P.x)) burst("dust", P.x, GROUND, 8); }
    }

    // samples
    (v.samples || []).forEach(s => {
      if (!s.taken && Math.abs(s.x - P.x) < 26 && P.y > GROUND - 30) handlers.pickup(s);
    });

    // station actions
    const st = nearStation();
    const pr = st ? handlers.prompt(st) : null;
    if (st && pr && pr.enabled && keys.act && !actLatch) {
      if (holdId !== st.id) { holdId = st.id; holdProg = 0; }
      if (pr.continuous) { handlers.hold(st, dt); holdProg = (holdProg + dt) % 1; }
      else {
        holdProg += dt;
        if (holdProg >= pr.hold) { holdProg = 0; actLatch = true; handlers.done(st); }
      }
    } else if (!keys.act) { holdProg = 0; holdId = null; actLatch = false; }

    // ambient particles
    if (v.broken && Math.random() < dt * 6) burst("smoke", 690 + (Math.random() - 0.5) * 40, GROUND - 120, 1);
    if (v.leakAt) { const s = STATIONS.find(x => x.id === v.leakAt); if (s && Math.random() < dt * 14) burst("air", s.x + 50, HAB_TOP + 26, 1); }
    if (v.storm > 0 && Math.random() < dt * 40 * v.storm) parts.push({ kind: "ray", x: camX + Math.random() * viewW * 1.4, y: -10, vx: -260, vy: 420, life: 1, max: 1.4 });
    if (v.sending && Math.random() < dt * 4) parts.push({ kind: "wave", x: 2010 - 30, y: GROUND - 205, vx: -40, vy: -60, life: 1, max: 1.6 });

    parts.forEach(p => {
      p.life -= dt / p.max; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "dust") p.vy += g * 0.25 * dt;
      if (p.kind === "smoke" || p.kind === "air") p.vy -= 10 * dt;
    });
    parts = parts.filter(p => p.life > 0 && (p.kind !== "ray" || p.y < GROUND));

    camX = Math.max(0, Math.min(W - viewW, P.x - viewW / 2));
    if (viewW >= W) camX = (W - viewW) / 2;
  }

  /* ---------------- drawing ---------------- */
  const C = {
    moon: { sky1: "#05081f", sky2: "#1a1652", far: "#3b3f6e", ground1: "#d9dce6", ground2: "#9aa0b4", rock: "#7d8399" },
    mars: { sky1: "#1d1030", sky2: "#c0603f", far: "#8a3a2e", ground1: "#d9673a", ground2: "#a6421f", rock: "#7a2f1a" }
  };
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function font(px, w = 600) { ctx.font = `${w} ${px}px Fredoka, Nunito, sans-serif`; }

  function draw() {
    if (!ctx || !P) return;
    const v = handlers.view();
    const pal = C[place];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = cv.width / dpr, ch = cv.height / dpr;

    // sky (screen space)
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0, pal.sky1); sky.addColorStop(1, pal.sky2);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);

    ctx.save(); ctx.scale(scale, scale); ctx.translate(0, topPad);
    // stars (parallax)
    stars.forEach(s => {
      const x = ((s.x - camX * 0.1) % 1800 + 1800) % 1800;
      if (place === "mars" && s.y > 120) return;
      if (topPad > 0) { ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.5; ctx.fillRect(x, s.y - 300, s.s, s.s); }
      ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.8 + s.tw));
      ctx.fillStyle = "#fff"; ctx.fillRect(x, s.y, s.s, s.s);
    });
    ctx.globalAlpha = 1;
    // Earth or Sun
    const bx = viewW * 0.78 - camX * 0.04;
    if (place === "moon") {
      const eg = ctx.createRadialGradient(bx - 14, 66, 6, bx, 80, 44);
      eg.addColorStop(0, "#9fd6ff"); eg.addColorStop(1, "#2a6fd6");
      ctx.fillStyle = "rgba(124,196,255,.15)"; ctx.beginPath(); ctx.arc(bx, 80, 62, 0, 7); ctx.fill();
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(bx, 80, 42, 0, 7); ctx.fill();
      ctx.fillStyle = "#4fd18b"; ctx.beginPath(); ctx.ellipse(bx - 10, 74, 14, 9, 0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx + 14, 94, 9, 6, -0.4, 0, 7); ctx.fill();
    } else {
      const sg = ctx.createRadialGradient(bx, 110, 2, bx, 110, 60);
      sg.addColorStop(0, "rgba(255,244,214,1)"); sg.addColorStop(0.2, "rgba(255,227,163,.6)"); sg.addColorStop(1, "rgba(255,179,107,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(bx, 110, 60, 0, 7); ctx.fill();
    }
    // dust storm haze
    if (v.haze) { ctx.fillStyle = `rgba(200,110,60,${0.35 * v.haze})`; ctx.fillRect(0, -topPad, viewW, H + topPad); }

    // far hills (parallax)
    ctx.fillStyle = pal.far;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= viewW + 40; x += 40) {
      const wx = x + camX * 0.4;
      ctx.lineTo(x, GROUND - 40 - 26 * Math.sin(wx / 210) - 14 * Math.sin(wx / 77));
    }
    ctx.lineTo(viewW, H); ctx.fill();

    ctx.translate(-camX, 0);
    // ground
    const gg = ctx.createLinearGradient(0, GROUND, 0, H);
    gg.addColorStop(0, pal.ground1); gg.addColorStop(1, pal.ground2);
    ctx.fillStyle = gg; ctx.fillRect(camX - 10, GROUND, viewW + 20, H - GROUND + botPad + 2);
    ctx.fillStyle = pal.rock; ctx.globalAlpha = 0.35;
    for (let x = Math.floor(camX / 160) * 160; x < camX + viewW + 160; x += 160) {
      ctx.beginPath(); ctx.ellipse(x + 40, GROUND + 30 + (x % 3) * 8, 26, 5, 0, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // shield bubble
    const sa = 0.05 + (v.shield / 100) * 0.22 + (v.storm ? 0.12 * Math.abs(Math.sin(t * 6)) : 0);
    ctx.strokeStyle = `rgba(255,107,53,${sa + 0.15})`; ctx.fillStyle = `rgba(255,107,53,${sa * 0.35})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse((HAB_L + HAB_R) / 2, GROUND, (HAB_R - HAB_L) / 2 + 40, 270, 0, Math.PI, 0); ctx.fill(); ctx.stroke();

    drawHabitat(v);
    STATIONS.forEach(s => drawStation(s, v));
    (v.samples || []).forEach(s => { if (!s.taken) drawSample(s.x); });

    // particles behind player
    parts.forEach(p => drawPart(p));
    drawPlayer(v);

    // prompt
    const st = nearStation();
    const pr = st ? handlers.prompt(st) : null;
    if (st && pr) drawPrompt(st, pr);

    // storm tint + warning
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.storm) { ctx.fillStyle = `rgba(255,90,40,${0.10 + 0.08 * Math.sin(t * 5)})`; ctx.fillRect(0, 0, cw, ch); }
    ctx.restore();
  }

  function drawHabitat(v) {
    const y = HAB_TOP, h = GROUND - HAB_TOP;
    // hull
    ctx.fillStyle = "#e8ecf5"; rr(HAB_L - 14, y - 14, HAB_R - HAB_L + 28, h + 14, 56); ctx.fill();
    ctx.fillStyle = "#c9cfe2"; ctx.fillRect(HAB_L - 14, GROUND - 16, HAB_R - HAB_L + 28, 16);
    // interior cutaway
    ctx.fillStyle = "#16205a"; rr(HAB_L, y, HAB_R - HAB_L, h, 44); ctx.fill();
    const tint = { life: "#183a6e", green: "#1b4a3c", shield: "#4a2a2a", shelter: "#173a5c", lab: "#2c2266" };
    STATIONS.filter(s => !s.out).forEach((s, i) => {
      const l = i === 0 ? HAB_L : WALLS[i - 1], r = i === 4 ? HAB_R : WALLS[i];
      ctx.fillStyle = tint[s.kind]; ctx.globalAlpha = 0.55;
      ctx.save(); rr(HAB_L, y, HAB_R - HAB_L, h, 44); ctx.clip(); ctx.fillRect(l, y, r - l, h); ctx.restore();
      ctx.globalAlpha = 1;
      // label
      font(13, 700); ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.textAlign = "center";
      ctx.fillText(s.label.toUpperCase(), (l + r) / 2, y + 26);
      // leak alarm
      if (v.leakAt === s.id) {
        ctx.fillStyle = Math.sin(t * 10) > 0 ? "#ff4d4d" : "#7a1f1f";
        ctx.beginPath(); ctx.arc(s.x + 50, y + 22, 7, 0, 7); ctx.fill();
      }
    });
    // floor
    ctx.fillStyle = "#2b3672"; ctx.fillRect(HAB_L + 6, GROUND - 10, HAB_R - HAB_L - 12, 10);
    // walls
    ctx.fillStyle = "#c9cfe2";
    WALLS.forEach(x => { ctx.fillRect(x - 4, y + 40, 8, h - 40 - 70); });
    // airlocks
    [HAB_L, HAB_R].forEach(x => {
      ctx.fillStyle = "#ffd54a"; ctx.fillRect(x - 7, GROUND - 92, 14, 82);
      ctx.fillStyle = "#1c2a6b";
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 7, GROUND - 86 + i * 20, 14, 8);
    });
  }

  function drawStation(s, v) {
    const x = s.x, gy = GROUND;
    ctx.save();
    switch (s.kind) {
      case "panel": {
        const dust = (v.dust || [0, 0, 0])[s.idx];
        ctx.fillStyle = "#8f96b8"; ctx.fillRect(x - 3, gy - 70, 6, 70);
        ctx.translate(x, gy - 78); ctx.transform(1, 0, -0.35, 1, 0, 0);
        ctx.fillStyle = "#2b4bc4"; rr(-50, -40, 100, 44, 4); ctx.fill();
        ctx.strokeStyle = "#6d8af0"; ctx.lineWidth = 1.5;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-50 + i * 25, -40); ctx.lineTo(-50 + i * 25, 4); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-50, -18); ctx.lineTo(50, -18); ctx.stroke();
        if (dust > 0.02) { ctx.fillStyle = place === "moon" ? `rgba(170,165,160,${dust * 0.9})` : `rgba(190,95,50,${dust * 0.9})`; rr(-50, -40, 100, 44, 4); ctx.fill(); }
        else { ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(-40, -36, 18, 6); }
        break;
      }
      case "life": {
        const lvl = v.life / 100;
        [-34, 6].forEach((dx, i) => {
          ctx.fillStyle = "#0d1640"; rr(x + dx, gy - 130, 30, 110, 12); ctx.fill();
          ctx.fillStyle = "#7cc4ff"; const hh = 104 * lvl; rr(x + dx + 3, gy - 23 - hh, 24, hh, 10); ctx.fill();
          if (!v.broken) { ctx.fillStyle = "rgba(255,255,255,.6)"; const by = gy - 30 - ((t * 30 + i * 40) % Math.max(10, hh - 10)); ctx.beginPath(); ctx.arc(x + dx + 15, by, 3, 0, 7); ctx.fill(); }
        });
        ctx.fillStyle = v.broken ? (Math.sin(t * 10) > 0 ? "#ff4d4d" : "#5a1a1a") : "#2ecc71";
        ctx.beginPath(); ctx.arc(x + 54, gy - 120, 7, 0, 7); ctx.fill();
        break;
      }
      case "green": {
        // lamp glow
        if (v.lamps) { const lg = ctx.createRadialGradient(x, gy - 150, 4, x, gy - 150, 110); lg.addColorStop(0, "rgba(255,120,220,.35)"); lg.addColorStop(1, "rgba(255,120,220,0)"); ctx.fillStyle = lg; ctx.fillRect(x - 110, gy - 190, 220, 180); }
        ctx.fillStyle = "#e8ecf5"; ctx.fillRect(x - 70, gy - 156, 140, 6);
        ctx.fillStyle = "#6b4a2b"; rr(x - 72, gy - 46, 144, 26, 6); ctx.fill();
        const gr = v.growth || 0;
        for (let i = 0; i < 4; i++) {
          const px = x - 54 + i * 36, hgt = 14 + 46 * gr;
          ctx.strokeStyle = "#5ee08a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, gy - 46); ctx.lineTo(px, gy - 46 - hgt); ctx.stroke();
          ctx.fillStyle = "#3fbf6a";
          ctx.beginPath(); ctx.ellipse(px - 8, gy - 46 - hgt * 0.6, 9 * (0.5 + gr / 2), 5, -0.5, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.ellipse(px + 8, gy - 46 - hgt * 0.8, 9 * (0.5 + gr / 2), 5, 0.5, 0, 7); ctx.fill();
          if (gr >= 1) { ctx.fillStyle = "#ff6b6b"; ctx.beginPath(); ctx.arc(px, gy - 50 - hgt, 6 + Math.sin(t * 4 + i), 0, 7); ctx.fill(); }
        }
        break;
      }
      case "shield": {
        const k = v.shield / 100;
        const glow = ctx.createRadialGradient(x, gy - 100, 4, x, gy - 100, 90);
        glow.addColorStop(0, `rgba(255,107,53,${0.15 + k * 0.5})`); glow.addColorStop(1, "rgba(255,107,53,0)");
        ctx.fillStyle = glow; ctx.fillRect(x - 90, gy - 190, 180, 180);
        ctx.fillStyle = "#c9cfe2"; rr(x - 26, gy - 150, 52, 140, 14); ctx.fill();
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i / 5 < k ? "#ff6b35" : "#55607f";
          rr(x - 32, gy - 140 + i * 24, 64, 10, 5); ctx.fill();
        }
        if (v.boosting) { ctx.strokeStyle = "#ffd54a"; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(x - 20 + Math.random() * 40, gy - 160 - i * 6 - Math.random() * 20); ctx.stroke(); }
        break;
      }
      case "shelter": {
        ctx.fillStyle = "#2f74c0";
        for (let i = 0; i < 4; i++) { rr(x - 92, gy - 150 + i * 34, 22, 30, 6); ctx.fill(); rr(x + 70, gy - 150 + i * 34, 22, 30, 6); ctx.fill(); }
        ctx.fillStyle = "#e8ecf5"; rr(x - 60, gy - 42, 120, 16, 6); ctx.fill();
        font(12, 700); ctx.textAlign = "center"; ctx.fillStyle = v.storm || v.stormSoon ? (Math.sin(t * 8) > 0 ? "#ffd54a" : "#ff6b35") : "#7cc4ff";
        ctx.fillText(v.storm || v.stormSoon ? "SHELTER HERE!" : "WATER WALLS", x, gy - 160);
        break;
      }
      case "lab": {
        ctx.fillStyle = "#e8ecf5"; ctx.fillRect(x - 70, gy - 70, 140, 8);
        ctx.fillStyle = "#8f96b8"; ctx.fillRect(x - 64, gy - 62, 6, 52); ctx.fillRect(x + 58, gy - 62, 6, 52);
        ctx.fillStyle = "#0d1640"; rr(x - 40, gy - 150, 80, 54, 8); ctx.fill();
        ctx.fillStyle = "#a08cff"; font(14, 700); ctx.textAlign = "center";
        ctx.fillText(`${v.carrying || 0} ROCK${v.carrying === 1 ? "" : "S"}`, x, gy - 125);
        ctx.fillStyle = "#ffd54a"; font(11, 700); ctx.fillText(`DATA ${v.stored || 0}`, x, gy - 108);
        ctx.fillStyle = "#c9cfe2"; ctx.fillRect(x + 20, gy - 100, 8, 30); ctx.beginPath(); ctx.arc(x + 24, gy - 104, 8, 0, 7); ctx.fill();
        break;
      }
      case "dish": {
        ctx.fillStyle = "#8f96b8"; ctx.fillRect(x - 5, gy - 150, 10, 150);
        ctx.fillRect(x - 30, gy - 10, 60, 10);
        ctx.translate(x, gy - 160); ctx.rotate(-0.6);
        ctx.fillStyle = "#e8ecf5"; ctx.beginPath(); ctx.ellipse(0, 0, 50, 16, 0, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = "#e8ecf5"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -26); ctx.stroke();
        ctx.fillStyle = v.sending ? "#ffd54a" : "#ff4d4d"; ctx.beginPath(); ctx.arc(0, -28, 4, 0, 7); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  function drawSample(x) {
    ctx.fillStyle = place === "moon" ? "#5d6380" : "#6b2a14";
    ctx.beginPath(); ctx.ellipse(x, GROUND - 6, 14, 9, 0, 0, 7); ctx.fill();
    const s = 4 + 3 * Math.abs(Math.sin(t * 3 + x));
    ctx.fillStyle = "#ffd54a";
    ctx.beginPath(); ctx.moveTo(x + 6, GROUND - 26 - s); ctx.lineTo(x + 8, GROUND - 26); ctx.lineTo(x + 6, GROUND - 26 + s); ctx.lineTo(x + 4, GROUND - 26); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 6 - s, GROUND - 26); ctx.lineTo(x + 6, GROUND - 28); ctx.lineTo(x + 6 + s, GROUND - 26); ctx.lineTo(x + 6, GROUND - 24); ctx.fill();
  }

  function drawPart(p) {
    ctx.globalAlpha = Math.max(0, p.life);
    if (p.kind === "dust") { ctx.fillStyle = place === "moon" ? "#c8ccd8" : "#d9875a"; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); }
    else if (p.kind === "smoke") { ctx.fillStyle = "#8a8fa8"; ctx.beginPath(); ctx.arc(p.x, p.y, 8 * (1.5 - p.life), 0, 7); ctx.fill(); }
    else if (p.kind === "air") { ctx.strokeStyle = "#cfe6ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 5 * (1.6 - p.life), 0, 7); ctx.stroke(); }
    else if (p.kind === "spark") { ctx.fillStyle = "#ffd54a"; ctx.fillRect(p.x, p.y, 3, 3); }
    else if (p.kind === "ray") { ctx.strokeStyle = "rgba(255,200,80,.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 20, p.y - 32); ctx.stroke(); }
    else if (p.kind === "wave") { ctx.strokeStyle = "#ffd54a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 16 * (2 - p.life), -2.2, -0.8); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(v) {
    const x = P.x, y = P.y;
    ctx.save(); ctx.translate(x, y); ctx.scale(P.face, 1);
    const sw = Math.sin(P.walk) * (P.onGround ? 0.6 : 0.2);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, (GROUND - y) + 2, 16, 4, 0, 0, 7); ctx.fill();
    // legs
    [[-6, sw], [6, -sw]].forEach(([lx, a]) => {
      ctx.save(); ctx.translate(lx, -24); ctx.rotate(a);
      ctx.fillStyle = "#e9ecf7"; rr(-5, 0, 10, 24, 4); ctx.fill();
      ctx.fillStyle = "#55607f"; rr(-6, 18, 13, 7, 3); ctx.fill();
      ctx.restore();
    });
    // backpack
    ctx.fillStyle = "#c9cfe2"; rr(-20, -52, 10, 28, 4); ctx.fill();
    // body
    ctx.fillStyle = "#f4f6ff"; rr(-13, -52, 26, 30, 9); ctx.fill();
    ctx.fillStyle = "#ff6b35"; ctx.fillRect(-2, -46, 10, 4);
    ctx.fillStyle = "#7cc4ff"; ctx.fillRect(-2, -40, 10, 3);
    // arm
    ctx.save(); ctx.translate(2, -46); ctx.rotate(-sw * 0.8 + (holdId ? -1.1 + Math.sin(t * 18) * 0.25 : 0));
    ctx.fillStyle = "#e9ecf7"; rr(-4, 0, 8, 20, 4); ctx.fill(); ctx.restore();
    // carried rocks
    for (let i = 0; i < (v.carrying || 0); i++) { ctx.fillStyle = place === "moon" ? "#5d6380" : "#6b2a14"; ctx.beginPath(); ctx.ellipse(14, -26 - i * 7, 6, 4, 0, 0, 7); ctx.fill(); }
    // helmet
    ctx.fillStyle = "#f4f6ff"; ctx.beginPath(); ctx.arc(0, -63, 14, 0, 7); ctx.fill();
    const vis = ctx.createLinearGradient(0, -70, 10, -56); vis.addColorStop(0, "#ffd54a"); vis.addColorStop(1, "#ff6b35");
    ctx.fillStyle = vis; rr(-2, -71, 14, 15, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(2, -68, 4, 3);
    ctx.restore();
  }

  function drawPrompt(s, pr) {
    const txt = pr.text;
    font(14, 700);
    const w = ctx.measureText(txt).width + (pr.enabled ? 52 : 24);
    const x = s.x - w / 2, y = (s.out ? GROUND - 250 : HAB_TOP + 36);
    ctx.fillStyle = pr.enabled ? "#1c2a6b" : "rgba(28,42,107,.85)"; rr(x, y, w, 34, 12); ctx.fill();
    ctx.strokeStyle = pr.enabled ? "#ffd54a" : "#4a5aa8"; ctx.lineWidth = 2; rr(x, y, w, 34, 12); ctx.stroke();
    ctx.textAlign = "left"; ctx.fillStyle = pr.enabled ? "#fff" : "#b8c0e8";
    if (pr.enabled) {
      ctx.fillStyle = "#ff6b35"; rr(x + 8, y + 7, 22, 20, 6); ctx.fill();
      ctx.fillStyle = "#1a0d00"; font(13, 700); ctx.textAlign = "center"; ctx.fillText("E", x + 19, y + 22);
      ctx.textAlign = "left"; ctx.fillStyle = "#fff"; font(14, 700); ctx.fillText(txt, x + 38, y + 22);
      if (holdId === s.id && !pr.continuous && pr.hold) {
        ctx.fillStyle = "#2ecc71"; rr(x + 6, y + 28, (w - 12) * Math.min(1, holdProg / pr.hold), 4, 2); ctx.fill();
      }
    } else ctx.fillText(txt, x + 12, y + 22);
  }

  return {
    init, reset, step, draw, resize, keys, burst,
    get player() { return P; }, STATIONS, isOutside, roomOf, GROUND, HAB_TOP,
    setTarget(x) { if (P) P.target = x; }
  };
})();
