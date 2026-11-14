/*
  LUNAR OUTPOST — 3D world (three.js) with professional CC0 assets:
    Kenney "Space Kit" (base modules, rover, dishes, machines, rocks, craters, crystals, rocket parts)
    Quaternius "Astronaut" (rigged + animated: Idle / Walk / Run / Interact / Wave) and "Solar Panel".
  Gameplay stays 2D on the ground plane (x, y in "world units"); the camera looks down at an angle
  for a soft 3D feel with real shadows.

  game.js supplies handlers: isRunning(), view(), prompt(obj), done(obj), hold(obj, dt), pickup(sample), rover(inRover)
*/
window.World = (() => {
  const W = 3600, H = 2600, K = 0.01;          // 1 world unit = 0.01 three.js units
  const WALK = 190, DRIVE = 340;
  const BASE = { x: 1800, y: 1300 };
  const MODELS = ["rover", "hangar_largeA", "hangar_roundGlass", "hangar_roundA", "structure_detailed", "machine_generatorLarge",
    "machine_barrelLarge", "machine_wireless", "satelliteDish_large", "satelliteDish_detailed", "supports_high", "platform_large",
    "rock", "rock_largeA", "rock_largeB", "rocks_smallA", "meteor_detailed", "crater", "craterLarge", "rock_crystals",
    "rock_crystalsLargeA", "rocket_baseA", "rocket_fuelA", "rocket_topA", "rocket_finsA", "barrels", "desk_computer",
    "astronaut", "solar_panel"];
  const PAL = {
    mars: { sky: 0xe7b08a, fog: 0xe0a47c, ground: [[196, 98, 56], [226, 140, 90], [160, 72, 40]], rock: 0xa4482a, rockTrack: 0x8a3b22, rockDark: 0x6e2a16, hemiSky: 0xffe2c8, hemiGround: 0x7a3418 },
    moon: { sky: 0x0b0f2a, fog: 0x15183a, ground: [[104, 106, 118], [140, 142, 154], [76, 78, 92]], rock: 0x7d8090, rockTrack: 0x6e7182, rockDark: 0x4b4e60, hemiSky: 0xdfe6ff, hemiGround: 0x30324a }
  };

  let renderer, scene, camera, sun, hemi, clock, cv, host, labelEl, guideEl, miniEl, mctx, fxEl, joyEl;
  const proto = {};
  let animClips = [];
  let handlers = {}, place = "mars", pal;
  let P, rover, objects = [], solids = [], rocks = [], groupWorld, samplesGroup, partGroup, sampleMeshes = new Map(), panelMeshes = [];
  let playerRig, crew = [], roverMesh, shelterMesh, ringMesh, miniImg;
  let t = 0, holdProg = 0, holdId = null, actLatch = false, cine = null, zoom = 1, camPos = null;
  let vw = 800, vh = 600, parts = [];
  const keys = { up: false, down: false, left: false, right: false, act: false };
  const joy = { on: false, x: 0, y: 0, ox: 0, oy: 0, id: null };
  const v3 = (x, y, h = 0) => new THREE.Vector3(x * K, h, y * K);

  /* ---------------- loading ---------------- */
  function preload(onProgress) {
    const loader = new THREE.GLTFLoader();
    let done = 0;
    return Promise.all(MODELS.map(n => new Promise(res => {
      loader.load(`assets/models/${n}.glb`, g => {
        proto[n] = g.scene;
        if (n === "astronaut") animClips = g.animations;
        g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        done++; onProgress && onProgress(done / MODELS.length); res();
      }, undefined, () => { done++; onProgress && onProgress(done / MODELS.length); res(); });
    })));
  }

  /* ---------------- setup ---------------- */
  function init(canvas, h) {
    cv = canvas; handlers = h; host = cv.parentElement;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.05); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    clock = new THREE.Clock();
    const mk = cls => { const d = document.createElement("div"); d.className = cls; d.hidden = true; host.appendChild(d); return d; };
    fxEl = mk("w-fx"); fxEl.hidden = false; labelEl = mk("w-label"); guideEl = mk("w-guide"); joyEl = mk("w-joy");
    miniEl = document.createElement("canvas"); miniEl.className = "w-mini"; miniEl.width = 380; miniEl.height = 274; host.appendChild(miniEl); mctx = miniEl.getContext("2d");
    resize(); window.addEventListener("resize", resize);
    bindInput();
  }
  function resize() {
    if (!renderer) return;
    const r = cv.getBoundingClientRect();
    vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh; camera.updateProjectionMatrix();
  }

  /* ---------------- building the world ---------------- */
  function rngFrom(seed) { seed = Math.abs(seed | 0) % 2147483646 + 1; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
  function model(name, size, opts = {}) {
    const src = proto[name]; if (!src) return new THREE.Group();
    const inner = name === "astronaut" ? THREE.SkeletonUtils.clone(src) : src.clone(true);
    if (opts.tint) inner.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      const c = opts.tint[o.material.name]; if (c !== undefined) o.material.color.setHex(c);
      if (opts.emissive && opts.emissive[o.material.name]) { o.material.emissive = new THREE.Color(opts.emissive[o.material.name]); o.material.emissiveIntensity = 0.7; }
    });
    const box = new THREE.Box3().setFromObject(inner), s = box.getSize(new THREE.Vector3());
    const k = opts.byHeight ? (size * K) / s.y : (size * K) / Math.max(s.x, s.z);
    inner.scale.multiplyScalar(k);
    const b2 = new THREE.Box3().setFromObject(inner), c = b2.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -b2.min.y, -c.z);
    const g = new THREE.Group(); g.add(inner);
    if (opts.rot) g.rotation.y = opts.rot;
    return g;
  }
  function put(obj, x, y, h = 0) { obj.position.set(x * K, h, y * K); groupWorld.add(obj); return obj; }
  const noShadow = o => { o.traverse(m => { if (m.isMesh) m.castShadow = false; }); return o; };
  function rockTint() { return { rock: pal.rock, rockTrack: pal.rockTrack, rockDark: pal.rockDark }; }

  function reset(placeId, site) {
    place = placeId; pal = PAL[placeId];
    const seed = (site && site.seed) || 1234, r = rngFrom(seed);
    if (groupWorld) scene.remove(groupWorld);
    groupWorld = new THREE.Group(); scene.add(groupWorld);
    scene.background = new THREE.Color(pal.sky);
    scene.fog = new THREE.Fog(pal.fog, 14, 30);
    hemi.color.setHex(pal.hemiSky); hemi.groundColor.setHex(pal.hemiGround);
    objects = []; solids = []; rocks = []; parts = []; sampleMeshes.clear(); panelMeshes = [];
    paintGround(seed);

    const add = o => (objects.push(o), o);
    const solidBox = (x, y, w, h) => solids.push({ box: true, x: x - w / 2, y: y - h / 2, w, h });
    const solidCircle = (x, y, rr) => solids.push({ x, y, r: rr });
    // --- the base ---
    add({ id: "hub", kind: "hub", x: 1800, y: 1240, r: 0, label: "Base Hub" });
    put(model("hangar_largeA", 230), 1800, 1240); solidBox(1800, 1240, 150, 220);
    add({ id: "green", kind: "green", x: 1500, y: 1130, r: 200, label: "Greenhouse" });
    put(model("hangar_roundGlass", 250, { rot: Math.PI / 2 }), 1500, 1130); solidCircle(1500, 1130, 105);
    add({ id: "lab", kind: "lab", x: 2100, y: 1130, r: 170, label: "Science Lab" });
    put(model("structure_detailed", 170), 2100, 1130); solidBox(2100, 1130, 170, 170);
    put(model("desk_computer", 70, { rot: Math.PI }), 2100, 1240);
    add({ id: "life", kind: "life", x: 2110, y: 1420, r: 170, label: "Life Support" });
    put(model("machine_generatorLarge", 150, { rot: -Math.PI / 2 }), 2080, 1420); solidBox(2080, 1420, 150, 120);
    put(model("machine_barrelLarge", 95), 2200, 1440); solidCircle(2200, 1440, 45);
    add({ id: "shield", kind: "shield", x: 1500, y: 1430, r: 170, label: "Shield Generator" });
    put(model("machine_wireless", 150, { rot: Math.PI / 2 }), 1500, 1430); solidBox(1500, 1430, 120, 150);
    add({ id: "shelter", kind: "shelter", x: 1800, y: 1660, r: 170, label: "Storm Shelter" });
    shelterMesh = put(model("hangar_roundA", 260), 1800, 1660);
    shelterMesh.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });
    put(model("barrels", 80), 1990, 1600); solidCircle(1990, 1600, 35);
    // solar farm
    let i = 0;
    for (const px of [1000, 1180]) for (const py of [1080, 1250, 1420]) {
      add({ id: "panel" + i, kind: "panel", idx: i, x: px, y: py, r: 100, label: "Solar panel" });
      const m = put(model("solar_panel", 140, { rot: Math.PI }), px, py);
      m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.userData.base = o.material.color.clone(); } });
      panelMeshes[i] = m; solidBox(px, py, 120, 60); i++;
    }
    add({ id: "dish", kind: "dish", x: 2440, y: 1120, r: 140, label: "Radio Dish" });
    put(model("satelliteDish_large", 190, { rot: -2.4 }), 2440, 1120); solidCircle(2440, 1120, 70);
    add({ id: "pad", kind: "pad", x: 2380, y: 1640, r: 110, label: "Rover charger" });
    noShadow(put(model("platform_large", 190), 2380, 1640, -0.03));
    // remote outposts
    add({ id: "weather", kind: "weather", x: 1800, y: 300, r: 150, label: "Weather Station", far: true });
    put(model("supports_high", 110), 1800, 300); put(model("machine_wireless", 90), 1800, 300, 1.0);
    put(model("desk_computer", 60), 1880, 340); solidCircle(1800, 300, 60);
    add({ id: "ice", kind: "ice", x: 3240, y: 1000, r: 170, label: "Ice Drill", far: true });
    put(model("rock_crystalsLargeA", 230, { tint: { ...rockTint(), crystal: 0xbfe8ff }, emissive: { crystal: 0x4aa8ff } }), 3240, 1000); solidCircle(3240, 1000, 90);
    put(model("machine_barrelLarge", 90), 3110, 1070); put(model("supports_high", 80), 3110, 940);
    add({ id: "relay", kind: "relay", x: 3150, y: 2230, r: 150, label: "Relay Tower", far: true });
    put(model("supports_high", 130), 3150, 2230); put(model("satelliteDish_detailed", 110, { rot: 2.4 }), 3150, 2230, 1.3); solidCircle(3150, 2230, 60);
    add({ id: "lander", kind: "lander", x: 440, y: 2240, r: 170, label: "Old Lander", far: true });
    const rk = new THREE.Group();
    [["rocket_finsA", 150, 0], ["rocket_baseA", 140, 0.32], ["rocket_fuelA", 80, 1.55], ["rocket_topA", 80, 1.95]].forEach(([n, s, h]) => { const m = model(n, s); m.position.y = h; rk.add(m); });
    rk.rotation.z = 0.12; put(rk, 440, 2240); solidCircle(440, 2240, 80);
    // rocks, boulders and craters (away from the base, outposts and roads)
    const clear = [{ x: 1800, y: 1350, r: 760 }, ...objects.filter(o => o.far || o.kind === "dish" || o.kind === "pad").map(o => ({ x: o.x, y: o.y, r: 260 }))];
    const ok = (x, y, rad) => x > 80 && y > 80 && x < W - 80 && y < H - 80 && clear.every(c => Math.hypot(c.x - x, c.y - y) > c.r + rad);
    const kinds = ["rock", "rock_largeA", "rock_largeB", "meteor_detailed"];
    for (let k = 0; k < 120; k++) { const x = r() * W, y = r() * H, rad = 14 + r() * 22; if (ok(x, y, rad)) { put(model(kinds[k % 4], rad * 2.2, { tint: rockTint(), rot: r() * 6 }), x, y); rocks.push({ x, y, r: rad }); } }
    for (let k = 0; k < 24; k++) { const x = r() * W, y = r() * H, rad = 70 + r() * 80; if (ok(x, y, rad + 60)) { put(model(kinds[1 + (k % 2)], rad * 2.3, { tint: rockTint(), rot: r() * 6 }), x, y); rocks.push({ x, y, r: rad, big: true }); } }
    for (let k = 0; k < 60; k++) { const x = r() * W, y = r() * H; if (ok(x, y, 30)) noShadow(put(model("rocks_smallA", 60 + r() * 60, { tint: rockTint(), rot: r() * 6 }), x, y)); }
    for (let k = 0; k < 18; k++) { const x = r() * W, y = r() * H, s = 160 + r() * 260; if (ok(x, y, 0)) noShadow(put(model(k % 2 ? "crater" : "craterLarge", s, { tint: rockTint(), rot: r() * 6 }), x, y, -0.01)); }
    rocks.forEach(k => solids.push({ x: k.x, y: k.y, r: k.r * 0.85 }));
    buildNav();

    samplesGroup = new THREE.Group(); groupWorld.add(samplesGroup);
    partGroup = new THREE.Group(); groupWorld.add(partGroup);
    playerRig = rig(0xff6b35); groupWorld.add(playerRig.obj);
    ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.85 }));
    ringMesh.rotation.x = -Math.PI / 2; groupWorld.add(ringMesh);
    crew = [[1650, 1520, 0x4c8dff], [1960, 1530, 0x2ecc71], [1650, 1280, 0xff6bd5]].map(([x, y, c]) => {
      const rg = rig(c); groupWorld.add(rg.obj);
      return { rig: rg, x, y, face: 0, tx: null, ty: null, wait: Math.random() * 3, home: { x, y }, stuck: 0 };
    });
    roverMesh = model("rover", 150); groupWorld.add(roverMesh);
    P = { x: 1800, y: 1480, face: 0, moving: false, target: null, inRover: false };
    rover = { x: 2380, y: 1640, a: -Math.PI / 2, battery: 100, speed: 0 };
    holdProg = 0; holdId = null; cine = null; camPos = null;
  }

  function rig(accent) {
    // recolour the suit: white body, grey joints, coloured accent (orange for you, other colours for the crew)
    const obj = model("astronaut", 84, { byHeight: true, tint: { SciFi_Main: 0xf2f4fb, SciFi_MainDark: 0x7c86ad, SciFi_Light: 0xd9dff0, SciFi_Light_Accent: accent, Grey: 0x3a4166 } });
    const inner = obj.children[0];
    const mixer = new THREE.AnimationMixer(inner);
    const acts = {};
    animClips.forEach(c => { acts[c.name.split("|").pop()] = mixer.clipAction(c); });
    const r = { obj, mixer, acts, cur: null };
    play(r, "Idle");
    return r;
  }
  function play(r, name, fade = 0.25) {
    if (r.cur === name || !r.acts[name]) return;
    const next = r.acts[name], prev = r.cur && r.acts[r.cur];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    r.cur = name;
  }

  function paintGround(seed) {
    const gw = 900, gh = 650, c = document.createElement("canvas"); c.width = gw; c.height = gh;
    const g = c.getContext("2d"), img = g.createImageData(gw, gh), d = img.data, r = rngFrom(seed + 1);
    const grid = Array.from({ length: 40 * 30 }, r), grid2 = Array.from({ length: 120 * 90 }, r);
    const vn = (arr, cw, ch, u, v) => { const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (x, y) => arr[Math.min(ch - 1, y) * cw + Math.min(cw - 1, x)], a = at(x0, y0), b = at(x0 + 1, y0), cc = at(x0, y0 + 1), dd = at(x0 + 1, y0 + 1); return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + dd) * sx * sy; };
    const [g1, g2, g3] = pal.ground;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const n = vn(grid, 40, 30, (x / gw) * 38, (y / gh) * 28) * 0.8 + vn(grid2, 120, 90, (x / gw) * 110, (y / gh) * 85) * 0.2, k = Math.max(0, Math.min(1, (n - 0.3) * 2));
      const col = k < 0.5 ? mix(g3, g1, k * 2) : mix(g1, g2, (k - 0.5) * 2), i = (y * gw + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const soft = document.createElement("canvas"); soft.width = gw; soft.height = gh; const sg = soft.getContext("2d");
    sg.filter = "blur(4px)"; sg.drawImage(c, 0, 0); sg.filter = "none";
    sg.strokeStyle = "rgba(0,0,0,.08)"; sg.lineWidth = 3; sg.setLineDash([2, 3]);
    [[1800, 300], [3240, 1000], [3150, 2230], [440, 2240]].forEach(([x, y]) => { sg.beginPath(); sg.moveTo(2380 / 4, 1640 / 4); sg.quadraticCurveTo(((2380 + x) / 2 + 120) / 4, ((1640 + y) / 2) / 4, x / 4, y / 4); sg.stroke(); });
    miniImg = soft;
    const tex = new THREE.CanvasTexture(soft); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(W * K * 3, H * K * 3), new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${g3.join(",")})`), roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(W * K / 2, -0.03, H * K / 2); outer.receiveShadow = true; groupWorld.add(outer);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * K, H * K), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W * K / 2, -0.02, H * K / 2); ground.receiveShadow = true; groupWorld.add(ground);
  }
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

  /* ---------------- input ---------------- */
  function bindInput() {
    const map = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", e: "act", E: "act", " ": "act", Enter: "act" };
    window.addEventListener("keydown", e => {
      const k = map[e.key]; if (!k || !running()) return;
      if (e.target && e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
      keys[k] = true; if (k !== "act") { P.target = null; P.path = null; }
    });
    window.addEventListener("keyup", e => { const k = map[e.key]; if (k) keys[k] = false; });
    window.addEventListener("blur", () => Object.keys(keys).forEach(k => (keys[k] = false)));
    cv.addEventListener("pointerdown", e => {
      if (!P || !running()) return;
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (e.pointerType === "touch" && sx < vw * 0.5) { joy.on = true; joy.id = e.pointerId; joy.ox = sx; joy.oy = sy; joy.x = joy.y = 0; cv.setPointerCapture(e.pointerId); P.target = null; return; }
      const hit = groundPoint(sx, sy); if (hit) goTo(hit.x, hit.y);
    });
    cv.addEventListener("pointermove", e => {
      if (!joy.on || e.pointerId !== joy.id) return;
      const r = cv.getBoundingClientRect(); let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy;
      const m = Math.hypot(dx, dy), max = 50; if (m > max) { dx *= max / m; dy *= max / m; }
      joy.x = dx / max; joy.y = dy / max;
    });
    const end = e => { if (e.pointerId === joy.id) { joy.on = false; joy.x = joy.y = 0; } };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }
  const running = () => !!P && handlers.isRunning && handlers.isRunning();
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function groundPoint(sx, sy) {
    ray.setFromCamera(new THREE.Vector2((sx / vw) * 2 - 1, -(sy / vh) * 2 + 1), camera);
    const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(plane, p)) return null;
    return { x: p.x / K, y: p.z / K };
  }

  /* ---------------- geometry ---------------- */
  function where() {
    if (!P) return "outside";
    if (P.inRover) return "rover";
    if (Math.hypot(P.x - 1800, P.y - 1660) < 120) return "shelter";
    return Math.hypot(P.x - BASE.x, P.y - BASE.y) < 420 ? "hab" : "outside";
  }
  function collide(x, y, rad, self) {
    if (x < rad || y < rad || x > W - rad || y > H - rad) return true;
    for (const s of solids) {
      if (s.box) { if (x + rad > s.x && x - rad < s.x + s.w && y + rad > s.y && y - rad < s.y + s.h) return true; }
      else if (Math.hypot(s.x - x, s.y - y) < s.r + rad) return true;
    }
    if (self !== "rover" && P && !P.inRover && rover && Math.hypot(rover.x - x, rover.y - y) < 40 + rad) return true;
    return false;
  }
  function moveBody(b, dx, dy, rad, self) {
    if (!collide(b.x + dx, b.y, rad, self)) b.x += dx;
    if (!collide(b.x, b.y + dy, rad, self)) b.y += dy;
  }
  /* ---- navigation grid + A* pathfinding (so tap-to-walk goes around buildings) ---- */
  const G = 30, GW = Math.ceil(W / G), GH = Math.ceil(H / G);
  let nav = null;
  function buildNav() {
    nav = new Uint8Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) nav[gy * GW + gx] = collide(gx * G + G / 2, gy * G + G / 2, 18, "rover") ? 1 : 0;
  }
  function clearLine(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 12);
    for (let i = 1; i <= n; i++) if (collide(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, 16, "rover")) return false;
    return true;
  }
  function findPath(sx, sy, tx, ty) {
    if (clearLine(sx, sy, tx, ty)) return [{ x: tx, y: ty }];
    const cell = (x, y) => [Math.max(0, Math.min(GW - 1, Math.floor(x / G))), Math.max(0, Math.min(GH - 1, Math.floor(y / G)))];
    let [gx0, gy0] = cell(sx, sy), [gx1, gy1] = cell(tx, ty);
    // if the goal cell is inside something, aim for the nearest free cell
    if (nav[gy1 * GW + gx1]) {
      let best = null, bd = 1e9;
      for (let r = 1; r < 12 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = gx1 + dx, y = gy1 + dy; if (x < 0 || y < 0 || x >= GW || y >= GH || nav[y * GW + x]) continue;
        const dd = Math.hypot(x * G - sx, y * G - sy) * 0.1 + Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = [x, y]; }
      }
      if (!best) return null; [gx1, gy1] = best; tx = gx1 * G + G / 2; ty = gy1 * G + G / 2;
    }
    const N = GW * GH, gScore = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const start = gy0 * GW + gx0, goal = gy1 * GW + gx1, open = [start];
    gScore[start] = 0;
    const h = i => Math.hypot(i % GW - gx1, Math.floor(i / GW) - gy1);
    const fS = new Float32Array(N).fill(1e9); fS[start] = h(start);
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (fS[open[i]] < fS[open[bi]]) bi = i;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % GW, cy = Math.floor(cur / GW);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx; if (nav[ni] || closed[ni]) continue;
        if (dx && dy && (nav[cy * GW + nx] || nav[ny * GW + cx])) continue;
        const g2 = gScore[cur] + (dx && dy ? 1.414 : 1);
        if (g2 < gScore[ni]) { gScore[ni] = g2; from[ni] = cur; fS[ni] = g2 + h(ni); open.push(ni); }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const pts = []; for (let i = goal; i !== start && i >= 0; i = from[i]) pts.push({ x: (i % GW) * G + G / 2, y: Math.floor(i / GW) * G + G / 2 });
    pts.reverse(); pts.push({ x: tx, y: ty });
    // smooth: skip waypoints we can see past
    const out = []; let ax = sx, ay = sy, k = 0;
    while (k < pts.length) { let j = pts.length - 1; while (j > k && !clearLine(ax, ay, pts[j].x, pts[j].y)) j--; out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; k = j + 1; }
    return out;
  }
  function goTo(x, y) {
    if (!P) return;
    const path = findPath(P.x, P.y, x, y);
    P.path = path && path.length ? path : null;
    P.target = P.path ? P.path[0] : null;
  }

  // move toward (ix, iy); if blocked, try turning a little left/right so we slide around obstacles
  function steerMove(b, ix, iy, dist, rad, self) {
    const base = Math.atan2(iy, ix);
    for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.5708, -1.5708, 2.0, -2.0]) {
      const a = base + (b.steer && da ? da * Math.sign(b.steer) : da);
      const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist;
      if (!collide(b.x + dx, b.y + dy, rad, self)) { b.x += dx; b.y += dy; b.steer = da || b.steer * 0.9; return true; }
    }
    moveBody(b, ix * dist, iy * dist, rad, self);
    return false;
  }
  function nearest() {
    if (!P) return null;
    if (P.inRover) return { id: "rover", kind: "rover", x: rover.x, y: rover.y, label: "Rover" };
    let best = null, bd = Infinity;
    for (const o of objects) { if (!o.r) continue; const d = Math.hypot(o.x - P.x, o.y - P.y); if (d < o.r && d < bd) { bd = d; best = o; } }
    const rd = Math.hypot(rover.x - P.x, rover.y - P.y);
    if (rd < 95 && (!best || rd <= bd + 30 || best.kind === "pad")) return { id: "rover", kind: "rover", x: rover.x, y: rover.y, label: "Rover" };
    return best;
  }
  function prompt(o) {
    if (o.kind === "rover") {
      if (P.inRover) return { text: rover.battery <= 0 ? "Battery empty! Get out" : "Get out", tap: true, enabled: true };
      return { text: `Drive rover (${Math.round(rover.battery)}%)`, tap: true, enabled: true };
    }
    return handlers.prompt(o);
  }
  function current() { const o = nearest(); return o ? { o, pr: prompt(o), prog: holdId === o.id ? holdProg : 0 } : null; }

  /* ---------------- simulation ---------------- */
  function step(dt) {
    if (!P) return;
    t += dt;
    const v = handlers.view();
    let ix = cine ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joy.x, iy = cine ? 0 : (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + joy.y;
    if (!ix && !iy && P.target) {
      const tx = P.target.x - P.x, ty = P.target.y - P.y, d = Math.hypot(tx, ty);
      if (d < (P.inRover ? 30 : 12)) { if (P.path && P.path.length > 1) { P.path.shift(); P.target = P.path[0]; } else { P.target = null; P.path = null; } }
      else { ix = tx / d; iy = ty / d; }
    } else if (ix || iy) { P.target = null; P.path = null; }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    if (P.inRover) {
      if (m > 0.1 && rover.battery > 0) {
        const want = Math.atan2(iy, ix), da = ((want - rover.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        rover.a += Math.max(-3.5 * dt, Math.min(3.5 * dt, da));
        const sp = DRIVE * (v.roverMul || 1) * Math.max(0.25, Math.cos(da)) * Math.min(1, m);
        const bx = rover.x, by = rover.y;
        if (!steerMove(rover, Math.cos(rover.a), Math.sin(rover.a), sp * dt, 34, "rover")) rover.a += 0.04;
        const moved = Math.hypot(rover.x - bx, rover.y - by);
        rover.speed = moved / dt; if (moved < 0.2 && P.target) P.target = null;
        rover.battery = Math.max(0, rover.battery - moved * 0.012);
        if (moved > 1 && Math.random() < 0.5) puff(rover.x - Math.cos(rover.a) * 40, rover.y - Math.sin(rover.a) * 40, 0.5);
      } else rover.speed = 0;
      P.x = rover.x; P.y = rover.y;
    } else {
      const sp = WALK * (v.speedMul || 1);
      if (m > 0.05) {
        const bx = P.x, by = P.y;
        steerMove(P, ix, iy, sp * dt, 16);
        P.moving = Math.hypot(P.x - bx, P.y - by) > 0.5; if (!P.moving && P.target) { P.target = null; P.path = null; }
        P.face = Math.atan2(ix, iy);
        if (P.moving && where() === "outside" && Math.random() < dt * 5) puff(P.x, P.y + 6, 0.25);
      } else P.moving = false;
    }
    if (rover.auto && !P.inRover) {
      const dx = rover.auto.x - rover.x, dy = rover.auto.y - rover.y, d = Math.hypot(dx, dy);
      if (d < 12) { rover.auto = null; rover.speed = 0; }
      else {
        const want = Math.atan2(dy, dx), da = ((want - rover.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        rover.a += Math.max(-3 * dt, Math.min(3 * dt, da));
        const sp = DRIVE * 0.8 * Math.max(0.3, Math.cos(da));
        rover.x += Math.cos(rover.a) * sp * dt; rover.y += Math.sin(rover.a) * sp * dt; rover.speed = sp;
        if (Math.random() < 0.6) puff(rover.x - Math.cos(rover.a) * 40, rover.y - Math.sin(rover.a) * 40, 0.5);
      }
    }
    crew.forEach(c => {
      if (c.tx === null) {
        c.wait -= dt; c.moving = false;
        if (c.wait <= 0) { const a = Math.random() * 6.28, rr = 60 + Math.random() * 160; c.tx = c.home.x + Math.cos(a) * rr; c.ty = c.home.y + Math.sin(a) * rr; c.stuck = 0; }
        return;
      }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d < 6 || c.stuck > 1.2) { c.tx = null; c.wait = 2 + Math.random() * 4; c.act = Math.random() < 0.4 ? "Interact" : Math.random() < 0.25 ? "Wave" : null; c.actT = 1.8; return; }
      const bx = c.x, by = c.y; steerMove(c, dx / d, dy / d, 75 * dt, 16, "rover");
      if (Math.hypot(c.x - bx, c.y - by) < 0.3) c.stuck += dt;
      c.moving = true; c.face = Math.atan2(dx, dy);
    });
    if (!P.inRover && !cine) (v.samples || []).forEach(s => { if (!s.taken && Math.hypot(s.x - P.x, s.y - P.y) < 32) handlers.pickup(s); });

    const o = cine ? null : nearest(), pr = o ? prompt(o) : null;
    if (o && pr && pr.enabled && keys.act && !actLatch) {
      if (pr.tap) { actLatch = true; tap(o); }
      else {
        if (holdId !== o.id) { holdId = o.id; holdProg = 0; }
        if (pr.continuous) { handlers.hold(o, dt); holdProg = (holdProg + dt) % 1; }
        else { holdProg += dt; if (holdProg >= pr.hold) { holdProg = 0; actLatch = true; handlers.done(o); } }
      }
    } else if (!keys.act) { holdProg = 0; holdId = null; actLatch = false; }

    if (v.broken && Math.random() < dt * 4) puff(2080 + (Math.random() - 0.5) * 40, 1420, 0.6, 0x8a8fa8, 1.4);
    if (v.leakAt && Math.random() < dt * 8) { const lo = objects.find(x => x.id === v.leakAt); if (lo) puff(lo.x + (Math.random() - 0.5) * 60, lo.y + 60, 0.4, 0xdff0ff, 1); }
    if (v.storm && Math.random() < dt * 40) { const c = camFocus(); puff(c.x + (Math.random() - 0.5) * 1200, c.y + (Math.random() - 0.5) * 900, 0.3, 0xffb050, 0.6, 3); }
    if (v.sending && Math.random() < dt * 5) puff(2440, 1120, 0.35, 0xffd54a, 1, 2.2);
    updateParts(dt);
  }
  function tap(o) {
    if (o.kind === "rover") {
      if (P.inRover) {
        const spots = [[0, 70], [0, -70], [70, 0], [-70, 0], [70, 70], [-70, 70], [70, -70], [-70, -70]];
        P.inRover = false;
        for (const [dx, dy] of spots) if (!collide(rover.x + dx, rover.y + dy, 16)) { P.x = rover.x + dx; P.y = rover.y + dy; handlers.rover && handlers.rover(false); return; }
        P.inRover = true; return;
      }
      P.inRover = true; P.target = null; handlers.rover && handlers.rover(true); return;
    }
    handlers.done(o);
  }

  /* ---------------- soft particles ---------------- */
  let puffTex = null;
  function puffTexture() {
    if (puffTex) return puffTex;
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); puffTex = new THREE.CanvasTexture(c); return puffTex;
  }
  function puff(x, y, size = 0.4, color, life = 0.9, rise = 0.6) {
    if (!partGroup || parts.length > 260) return;
    const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: color || (place === "mars" ? 0xd28a5c : 0xc9cbd6), transparent: true, depthWrite: false, opacity: 0.8 });
    const s = new THREE.Sprite(mat); s.position.copy(v3(x, y, 0.08)); s.scale.setScalar(size * 0.5); partGroup.add(s);
    parts.push({ sprite: s, life: 1, max: life, size, rise, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3 });
  }
  function burst(kind, x, y, n = 10) { for (let i = 0; i < n; i++) puff(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 50, 0.25, kind === "spark" ? 0xffd54a : undefined, 0.7, 1.2); }
  function updateParts(dt) {
    parts.forEach(p => {
      p.life -= dt / p.max;
      p.sprite.position.y += p.rise * dt; p.sprite.position.x += p.vx * dt; p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(p.size * (0.5 + (1 - p.life) * 1.2)); p.sprite.material.opacity = Math.max(0, p.life) * 0.8;
    });
    parts = parts.filter(p => { if (p.life > 0) return true; partGroup.remove(p.sprite); p.sprite.material.dispose(); return false; });
  }

  /* ---------------- drawing ---------------- */
  const camFocus = () => (cine && cine.cam ? cine.cam : P);
  function draw() {
    if (!renderer || !P) return;
    const dt = Math.min(0.05, clock.getDelta());
    const v = handlers.view();
    placeRig(playerRig, P.x, P.y, P.face, holdId ? "Interact" : P.moving ? "Run" : "Idle", dt);
    playerRig.obj.visible = !P.inRover && where() !== "shelter";
    ringMesh.visible = playerRig.obj.visible && !cine; ringMesh.position.copy(v3(P.x, P.y, 0.02)); ringMesh.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    crew.forEach(c => placeRig(c.rig, c.x, c.y, c.face, c.moving ? "Walk" : c.act && (c.actT -= dt) > 0 ? c.act : "Idle", dt));
    roverMesh.position.copy(v3(rover.x, rover.y, rover.speed > 5 ? Math.abs(Math.sin(t * 18)) * 0.012 : 0));
    roverMesh.rotation.y = -rover.a + Math.PI / 2;
    const inS = where() === "shelter";
    shelterMesh.traverse(o => { if (o.isMesh) o.material.opacity += ((inS ? 0.35 : 1) - o.material.opacity) * 0.15; });
    syncSamples(v.samples || []);
    sampleMeshes.forEach((m, s) => { m.rotation.y += dt * 1.2; m.position.y = 0.05 + Math.sin(t * 3 + s.x) * 0.03; });
    const dustCol = new THREE.Color(place === "mars" ? 0xb5683e : 0x9a9aa6);
    panelMeshes.forEach((m, i) => { const d = (v.dust || [])[i] || 0; m.traverse(o => { if (o.isMesh && o.userData.base) o.material.color.copy(o.userData.base).lerp(dustCol, d * 0.85); }); });
    // camera: smooth follow (cinematic shots override)
    const f = camFocus();
    const zf = (1 / ((cine && cine.zoom) || 1)) * (vw < 700 ? 1.25 : 1);
    zoom += (zf - zoom) * Math.min(1, dt * (cine ? 1.2 : 4));
    const off = new THREE.Vector3(0, 8.2 * zoom, 6.4 * zoom);
    const want = v3(f.x, f.y, 0).add(off);
    if (!camPos) camPos = want.clone();
    camPos.lerp(want, Math.min(1, dt * (cine ? (cine.speed || 1.2) : 5)));
    camera.position.copy(camPos);
    const look = camPos.clone().sub(off);
    camera.lookAt(look);
    sun.position.copy(look).add(new THREE.Vector3(-5, 14, 6)); sun.target.position.copy(look);
    const sc = 9 * Math.max(1, zoom); Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc }); sun.shadow.camera.updateProjectionMatrix();
    const dusk = v.dusk || 0;
    sun.intensity = 1.35 - dusk * 0.8; hemi.intensity = 1.05 - dusk * 0.35;
    sun.color.setHex(v.storm ? 0xffa060 : 0xfff0dc).lerp(new THREE.Color(0x7fa0ff), dusk * 0.7);
    renderer.render(scene, camera);
    overlays(v);
  }
  function placeRig(r, x, y, face, anim, dt) {
    r.obj.position.copy(v3(x, y, 0));
    let d = face - r.obj.rotation.y; d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    r.obj.rotation.y += d * Math.min(1, dt * 10);
    if (anim) play(r, anim);
    r.mixer.update(dt);
  }
  function syncSamples(list) {
    list.forEach(s => {
      if (s.taken) return;
      if (!sampleMeshes.has(s)) {
        const m = model("rock_crystals", 70, { tint: { ...rockTint(), crystal: 0xb07cff }, emissive: { crystal: 0x7a3cff }, rot: Math.random() * 6 });
        m.position.copy(v3(s.x, s.y, 0.05)); samplesGroup.add(m); sampleMeshes.set(s, m);
      }
    });
    sampleMeshes.forEach((m, s) => { if (s.taken || !list.includes(s)) { samplesGroup.remove(m); sampleMeshes.delete(s); } });
  }
  function toScreen(x, y, h = 0) { const p = v3(x, y, h).project(camera); return { x: (p.x * 0.5 + 0.5) * vw, y: (-p.y * 0.5 + 0.5) * vh, behind: p.z > 1 }; }

  function overlays(v) {
    const o = cine ? null : nearest(), pr = o ? prompt(o) : null;
    if (o && pr) {
      const s = toScreen(o.x, o.y, o.kind === "rover" ? 0.7 : 1.4);
      labelEl.hidden = false;
      labelEl.className = "w-label" + (pr.enabled ? " on" : "");
      labelEl.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const prog = holdId === o.id && pr.hold && !pr.continuous ? Math.min(1, holdProg / pr.hold) : 0;
      const html = `${pr.enabled ? "<kbd>E</kbd>" : ""}<span>${pr.text}</span>${prog ? `<i style="width:${prog * 100}%"></i>` : ""}`;
      if (labelEl._h !== html) { labelEl.innerHTML = html; labelEl._h = html; }
    } else labelEl.hidden = true;
    const g = !cine && v.guide;
    if (g) {
      const s = toScreen(g.x, g.y, 1.2), m = 56;
      const inView = s.x > m && s.x < vw - m && s.y > m && s.y < vh - m && !s.behind;
      guideEl.hidden = false;
      if (inView) { guideEl.className = "w-guide over"; guideEl.style.transform = `translate(${s.x}px, ${s.y - 20 + Math.sin(t * 5) * 6}px) translate(-50%, -100%)`; if (guideEl._h !== "") { guideEl.innerHTML = ""; guideEl._h = ""; } }
      else {
        const cx = vw / 2, cy = vh / 2, a = Math.atan2(s.y - cy, s.x - cx);
        const ex = Math.max(m, Math.min(vw - m, cx + Math.cos(a) * vw)), ey = Math.max(vw < 700 ? 270 : m + 150, Math.min(vh - m - 140, cy + Math.sin(a) * vh));
        guideEl.className = "w-guide edge"; guideEl.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%)`;
        const html = `<b style="transform:rotate(${a.toFixed(2)}rad)">➤</b><small>${Math.round(Math.hypot(g.x - P.x, g.y - P.y) / 10)} m</small>`;
        if (guideEl._h !== html) { guideEl.innerHTML = html; guideEl._h = html; }
      }
    } else guideEl.hidden = true;
    fxEl.style.background = v.storm ? `rgba(255,90,40,${0.16 + 0.06 * Math.sin(t * 5)})` : v.haze ? `rgba(190,95,50,${0.35 * v.haze})` : "transparent";
    joyEl.hidden = !joy.on;
    if (joy.on) joyEl.style.cssText = `left:${joy.ox}px;top:${joy.oy}px;--jx:${joy.x * 50}px;--jy:${joy.y * 50}px`;
    miniEl.hidden = !!cine;
    if (!cine) drawMini(v);
  }
  function drawMini(v) {
    const mw = 380, mh = 274, mx = x => (x / W) * mw, my = y => (y / H) * mh;
    mctx.drawImage(miniImg, 0, 0, mw, mh);
    mctx.fillStyle = "rgba(0,0,0,.25)"; rocks.filter(k => k.big).forEach(k => { mctx.beginPath(); mctx.arc(mx(k.x), my(k.y), (k.r / W) * mw, 0, 7); mctx.fill(); });
    mctx.fillStyle = "#2b4bc4"; mctx.fillRect(mx(940), my(1040), mx(300), my(420));
    objects.forEach(o => { if (o.kind === "panel" || !o.r) return; mctx.fillStyle = "#ffffff"; mctx.beginPath(); mctx.arc(mx(o.x), my(o.y), o.far ? 6 : 4, 0, 7); mctx.fill(); });
    (v.samples || []).forEach(s => { if (!s.taken) { mctx.fillStyle = "#c39bff"; mctx.fillRect(mx(s.x) - 3, my(s.y) - 3, 6, 6); } });
    if (v.guide) { mctx.strokeStyle = "#ffd54a"; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(mx(v.guide.x), my(v.guide.y), 11 + Math.sin(t * 6) * 2, 0, 7); mctx.stroke(); }
    mctx.fillStyle = "#2ecc71"; mctx.fillRect(mx(rover.x) - 5, my(rover.y) - 5, 10, 10);
    mctx.fillStyle = "#ff6b35"; mctx.beginPath(); mctx.arc(mx(P.x), my(P.y), 7, 0, 7); mctx.fill(); mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.stroke();
  }

  // render a still picture of an outpost (used on the menu screens)
  let snapR = null;
  function snapshot(placeId, seed, w, h, hero) {
    if (!snapR) { snapR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); snapR.shadowMap.enabled = true; snapR.shadowMap.type = THREE.PCFSoftShadowMap; snapR.outputEncoding = THREE.sRGBEncoding; snapR.toneMapping = THREE.ACESFilmicToneMapping; snapR.toneMappingExposure = 1.35; }
    snapR.setSize(w, h, false);
    reset(placeId, { seed });
    rover.x = 2200; rover.y = 1560; rover.a = -0.6;
    draw0();
    const cam = new THREE.PerspectiveCamera(hero ? 34 : 30, w / h, 0.1, 120);
    if (hero) { cam.position.set(12.6, 7.4, 23.5); cam.lookAt(17.9, 0.2, 13.9); }
    else { cam.position.set(21.5, 5.2, 21.0); cam.lookAt(17.9, 0.3, 14.0); }
    sun.position.set(12, 14, 20); sun.target.position.set(18, 0, 14);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 }); sun.shadow.camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(pal.fog, 10, 26);
    snapR.render(scene, cam);
    const url = snapR.domElement.toDataURL("image/jpeg", 0.86);
    P = null;
    return url;
  }
  // pose characters once without advancing the game (for snapshots)
  function draw0() {
    placeRig(playerRig, 1760, 1500, 2.6, "Wave", 0.6);
    crew.forEach((c, i) => placeRig(c.rig, c.x, c.y, i, i === 1 ? "Interact" : "Walk", 0.4 + i * 0.3));
    roverMesh.position.copy(v3(rover.x, rover.y, 0)); roverMesh.rotation.y = -rover.a + Math.PI / 2;
    ringMesh.visible = false;
  }

  return {
    snapshot,
    preload, init, reset, step, draw, resize, keys, burst, where, nearest, current,
    get player() { return P; }, get rover() { return rover; }, get objects() { return objects; },
    obj: id => objects.find(o => o.id === id),
    setTarget(x, y) { if (!P) return; if (x === null) { P.target = null; P.path = null; } else goTo(x, y); },
    setCine(c) { cine = c; if (c && c.jump) camPos = null; },
    driveRover(x, y) { rover.auto = { x, y }; },
    walkTo(x, y) { if (x === null) { if (P) { P.target = null; P.path = null; } return; } goTo(x, y); },
    free: (x, y) => !collide(x, y, 22),
    roomAt: () => null,
    W, H
  };
})();
