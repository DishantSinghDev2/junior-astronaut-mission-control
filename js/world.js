/*
  LUNAR OUTPOST — 3D world (three.js) with professional CC0 assets:
    Kenney "Space Kit" (base modules, rover, dishes, machines, rocks, craters, crystals, rocket parts)
    Quaternius "Astronaut" (rigged + animated: Idle / Walk / Run / Interact / Wave) and "Solar Panel".
  Gameplay logic stays on the ground plane (x, y in "world units"). The player sees it through a
  third-person orbit camera (drag to look around, Q / R to rotate) under a realistic sky:
  black Moon sky with stars and a real Earth map, or a butterscotch Mars sky, a low harsh sun,
  and Poly Haven CC0 ground textures.

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
    "astronaut", "solar_panel",
    "nasa_lm", "nasa_viking", "nasa_pers", "nasa_hdu1", "nasa_ingen", "nasa_dsn34"];
  const PAL = {
    mars: {
      sky: [[0, "#8f6f62"], [0.30, "#bf906c"], [0.47, "#e3b58c"], [0.5, "#e8bb93"], [0.52, "#c98f66"], [1, "#a87850"]],
      fog: 0xe0ad84, fogNear: 28, fogFar: 125, stars: false,
      tex: "mars", tint: 0xffffff, ground: [[176, 78, 42], [214, 118, 70], [132, 52, 28]],
      rock: 0xa4482a, rockTrack: 0x8a3b22, rockDark: 0x6e2a16,
      sunColor: 0xffe2c2, sunI: 3.1, sunDir: [-6, 6.2, 8], hemiSky: 0xffc9a0, hemiGround: 0x5a3020, hemiI: 0.5, exposure: 0.8
    },
    moon: {
      sky: [[0, "#000003"], [0.4, "#03040c"], [0.5, "#0a0d1e"], [0.52, "#000"], [1, "#000"]],
      fog: 0x070914, fogNear: 45, fogFar: 170, stars: true,
      tex: "moon", tint: 0xe4e7f2, ground: [[104, 106, 118], [140, 142, 154], [76, 78, 92]],
      rock: 0x8a8d9c, rockTrack: 0x70738a, rockDark: 0x4b4e60,
      sunColor: 0xfff3e0, sunI: 3.8, sunDir: [-6, 5, 8], hemiSky: 0x7f93cc, hemiGround: 0x2a2c38, hemiI: 0.3, exposure: 0.85
    }
  };

  let renderer, scene, camera, sun, hemi, clock, cv, host, labelEl, guideEl, miniEl, mctx, fxEl, joyEl;
  const proto = {};
  let animClips = [];
  let handlers = {}, place = "mars", pal;
  let P, rover, objects = [], solids = [], rocks = [], groupWorld, samplesGroup, partGroup, sampleMeshes = new Map(), panelMeshes = [];
  let playerRig, crew = [], roverMesh, shelterMesh, ringMesh, miniImg;
  let t = 0, holdProg = 0, holdId = null, actLatch = false, cine = null;
  // third-person orbit camera (yaw 0 = camera south of the player looking north)
  let camYaw = 0, camPitch = 0.42, camDist = 4.6, cY = 0, cP = 0.9, cD = 10.4, focusV = null, heroPos = null, heroLook = null, heroMode = false;
  let skyDome, starPts, earthMesh, sunSprite, baseGround, overlayGround, bluePoint, amberPoint, scatter = [], occl = [];
  const occRay = new THREE.Raycaster();
  const texCache = {};
  let vw = 800, vh = 600, parts = [];
  let jumpLatch = false, beacons = [], suit = 0xff6b35, pod = null, podOn = false;
  const remotes = new Map();
  const keys = { up: false, down: false, left: false, right: false, act: false, jump: false, camL: false, camR: false };
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
        g.scene.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = true; o.receiveShadow = true;
          if (o.material.name === "_defaultMat") { o.material = new THREE.MeshPhysicalMaterial({ color: 0xa9d8ff, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }); o.castShadow = false; }
          else if (o.material.metalness !== undefined && !n.startsWith("nasa_")) { o.material.envMapIntensity = 1.0; o.material.metalness = Math.min(o.material.metalness, 0.75); o.material.roughness = Math.min(o.material.roughness, 0.55); }
        });
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 700);
    hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.05); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
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
    inner.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });   // own materials, so each building can fade on its own
    if (opts.tint) inner.traverse(o => {
      if (!o.isMesh) return;
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
  function put(obj, x, y, h = 0) {
    obj.position.set(x * K, h, y * K); groupWorld.add(obj);
    const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
    if (sz.y > 0.35 && sz.y < 20) {
      const mats = []; obj.traverse(o => { if (o.isMesh) mats.push(o.material); });
      occl.push({ g: obj, x: obj.position.x, z: obj.position.z, cy: sz.y / 2, r: Math.max(sz.x, sz.z) / 2, fade: 1, mats, base: mats.map(m => m.opacity), baseT: mats.map(m => m.transparent) });
    }
    return obj;
  }
  const noShadow = o => { o.traverse(m => { if (m.isMesh) m.castShadow = false; }); return o; };
  function rockTint() { return { rock: pal.rock, rockTrack: pal.rockTrack, rockDark: pal.rockDark }; }

  function reset(placeId, site) {
    place = placeId; pal = PAL[placeId];
    const seed = (site && site.seed) || 1234, r = rngFrom(seed);
    if (groupWorld) scene.remove(groupWorld);
    groupWorld = new THREE.Group(); scene.add(groupWorld); pod = null; podOn = false;
    scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
    hemi.color.setHex(pal.hemiSky); hemi.groundColor.setHex(pal.hemiGround); hemi.intensity = pal.hemiI;
    sun.color.setHex(pal.sunColor); sun.intensity = pal.sunI;
    renderer.toneMappingExposure = pal.exposure;
    objects = []; solids = []; rocks = []; parts = []; sampleMeshes.clear(); panelMeshes = []; scatter = []; occl = [];
    focusV = null; heroPos = null; heroMode = false; camYaw = 0; camPitch = 0.42;
    buildEnv();
    scene.environment = makeEnv(renderer);
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
    put(model("nasa_hdu1", 190, { rot: 0.4 }), 2100, 1130); solidBox(2100, 1130, 170, 170);
    put(model("desk_computer", 70, { rot: Math.PI }), 2100, 1240);
    add({ id: "life", kind: "life", x: 2110, y: 1420, r: 170, label: "Life Support" });
    put(model("machine_generatorLarge", 150, { rot: -Math.PI / 2 }), 2080, 1420); solidBox(2080, 1420, 150, 120);
    put(model("machine_barrelLarge", 95), 2200, 1440); solidCircle(2200, 1440, 45);
    add({ id: "shield", kind: "shield", x: 1500, y: 1430, r: 170, label: "Shield Generator" });
    put(model("machine_wireless", 150, { rot: Math.PI / 2 }), 1500, 1430); solidBox(1500, 1430, 120, 150);
    add({ id: "shelter", kind: "shelter", x: 1800, y: 1660, r: 170, label: "Storm Shelter" });
    shelterMesh = put(model("hangar_roundA", 260), 1800, 1660);
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
    put(model("nasa_dsn34", 250, { rot: -2.4 }), 2440, 1120); solidCircle(2440, 1120, 80);
    if (placeId === "mars") put(model("nasa_ingen", 60, { rot: 1.2 }), 1960, 380);
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
    const rk = new THREE.Group(); rk.add(model(place === "mars" ? "nasa_viking" : "nasa_lm", 170, { rot: 0.6 }));
    rk.rotation.z = 0.1; put(rk, 440, 2240); solidCircle(440, 2240, 85);
    // light beacons over the four remote mission spots, so you can spot them from far away
    beacons = [];
    [["weather", 0x4cc0ff], ["ice", 0x9fe3ff], ["relay", 0xffc94a], ["lander", 0xb07cff]].forEach(([id, col]) => {
      const o = objects.find(q => q.id === id), g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 16, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 8;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      g.add(beam, ring); g.position.copy(v3(o.x, o.y, 0)); groupWorld.add(g); beacons.push({ id, g, beam, ring });
    });
    // rocks, boulders and craters (away from the base, outposts and roads)
    const clear = [{ x: 1800, y: 1350, r: 760 }, ...objects.filter(o => o.far || o.kind === "dish" || o.kind === "pad").map(o => ({ x: o.x, y: o.y, r: 260 }))];
    const ok = (x, y, rad) => x > 80 && y > 80 && x < W - 80 && y < H - 80 && clear.every(c => Math.hypot(c.x - x, c.y - y) > c.r + rad);
    const kinds = ["rock", "rock_largeA", "rock_largeB", "meteor_detailed"];
    for (let k = 0; k < 120; k++) { const x = r() * W, y = r() * H, rad = 14 + r() * 22; if (ok(x, y, rad)) { const m = put(model(kinds[k % 4], rad * 2.2, { tint: rockTint(), rot: r() * 6 }), x, y); scatter.push({ m, x, y }); rocks.push({ x, y, r: rad }); } }
    for (let k = 0; k < 24; k++) { const x = r() * W, y = r() * H, rad = 70 + r() * 80; if (ok(x, y, rad + 60)) { const m = put(model(kinds[1 + (k % 2)], rad * 2.3, { tint: rockTint(), rot: r() * 6 }), x, y); scatter.push({ m, x, y }); rocks.push({ x, y, r: rad, big: true }); } }
    for (let k = 0; k < 60; k++) { const x = r() * W, y = r() * H; if (ok(x, y, 30)) noShadow(put(model("rocks_smallA", 60 + r() * 60, { tint: rockTint(), rot: r() * 6 }), x, y)); }
    for (let k = 0; k < 18; k++) { const x = r() * W, y = r() * H, s = 160 + r() * 260; if (ok(x, y, 0)) noShadow(put(model(k % 2 ? "crater" : "craterLarge", s, { tint: rockTint(), rot: r() * 6 }), x, y, -0.01)); }
    rocks.forEach(k => solids.push({ x: k.x, y: k.y, r: k.r * 0.85, low: k.r < 30 }));
    buildNav();

    samplesGroup = new THREE.Group(); groupWorld.add(samplesGroup);
    partGroup = new THREE.Group(); groupWorld.add(partGroup);
    playerRig = rig(suit); groupWorld.add(playerRig.obj);
    remotes.forEach(r => remoteBuild(r));
    ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.85 }));
    ringMesh.rotation.x = -Math.PI / 2; groupWorld.add(ringMesh);
    crew = [[1650, 1520, 0x4c8dff], [1960, 1530, 0x2ecc71], [1650, 1280, 0xff6bd5]].map(([x, y, c]) => {
      const rg = rig(c); groupWorld.add(rg.obj);
      return { rig: rg, x, y, face: 0, tx: null, ty: null, wait: Math.random() * 3, home: { x, y }, stuck: 0 };
    });
    roverMesh = model("nasa_pers", 150); groupWorld.add(roverMesh);
    P = { x: 1800, y: 1480, z: 0, vz: 0, face: 0, moving: false, target: null, inRover: false };
    rover = { x: 2380, y: 1640, a: -Math.PI / 2, battery: 100, speed: 0 };
    holdProg = 0; holdId = null; cine = null; focusV = null;
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

  /* ---------------- sky, Earth, stars, ground ---------------- */
  function loadTex(path, srgb) {
    if (!texCache[path]) { const t = new THREE.TextureLoader().load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; texCache[path] = t; }
    return texCache[path];
  }
  const sunDirV = () => new THREE.Vector3(...pal.sunDir).normalize();
  function buildEnv() {
    [skyDome, starPts, earthMesh, sunSprite, bluePoint, amberPoint].forEach(o => o && scene.remove(o));
    const c = document.createElement("canvas"); c.width = 8; c.height = 256; const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 256); pal.sky.forEach(([p, col]) => gr.addColorStop(p, col));
    g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(100, 28, 18), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    skyDome.renderOrder = -10; scene.add(skyDome);
    starPts = null; earthMesh = null; earthGlow = null; sunSprite = null;
    if (pal.stars) {
      const r = rngFrom(77), N = 1600, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { let x, y, z, l; do { x = r() * 2 - 1; y = r() * 2 - 0.08; z = r() * 2 - 1; l = Math.hypot(x, y, z); } while (l > 1 || l < 0.2); pos.set([x / l * 96, y / l * 96, z / l * 96], i * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      starPts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
      starPts.renderOrder = -9; scene.add(starPts);
      earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 36), new THREE.MeshBasicMaterial({ map: loadTex("assets/img/2k_earth.jpg", true), color: 0xd8dde8, fog: false, depthWrite: false }));
      earthMesh.scale.setScalar(11); earthMesh.renderOrder = -8; scene.add(earthMesh);
    } else {
      const gc = document.createElement("canvas"); gc.width = gc.height = 128; const gg = gc.getContext("2d");
      const rg = gg.createRadialGradient(64, 64, 2, 64, 64, 64); rg.addColorStop(0, "rgba(255,246,225,1)"); rg.addColorStop(0.12, "rgba(255,230,190,.9)"); rg.addColorStop(1, "rgba(255,200,140,0)");
      gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128);
      sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), fog: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
      sunSprite.scale.setScalar(26); sunSprite.renderOrder = -8; scene.add(sunSprite);
    }
    // warm/cool accent lights around the base so it feels inhabited
    bluePoint = new THREE.PointLight(0x4aa8ff, 1.6, 7, 1.6); bluePoint.position.set(15.0, 1.4, 11.9); scene.add(bluePoint);
    amberPoint = new THREE.PointLight(0xffb45a, 1.4, 6, 1.6); amberPoint.position.set(18.0, 1.2, 12.0); scene.add(amberPoint);
  }
  // reflection map for the metal buildings, generated from this world's sky, sun and Earth
  function makeEnv(rend) {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(skyDome.geometry, skyDome.material));
    const sd = sunDirV().multiplyScalar(80);
    const sunM = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.sunColor).multiplyScalar(place === "moon" ? 14 : 9), fog: false }));
    sunM.position.copy(sd); es.add(sunM);
    if (earthMesh) { const e = new THREE.Mesh(earthMesh.geometry, earthMesh.material); e.scale.setScalar(11); e.position.set(Math.sin(0.62) * Math.cos(0.30) * 86, Math.sin(0.30) * 86, -Math.cos(0.62) * Math.cos(0.30) * 86); es.add(e); }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.ground[1][0] / 255, pal.ground[1][1] / 255, pal.ground[1][2] / 255).multiplyScalar(0.55), side: THREE.DoubleSide }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1; es.add(ground);
    const pm = new THREE.PMREMGenerator(rend);
    const tex = pm.fromScene(es, 0.03).texture; pm.dispose();
    return tex;
  }
  // keep the sky locked to the camera (it is infinitely far away)
  function syncEnv(cam) {
    const p = cam.position;
    skyDome.position.copy(p);
    if (starPts) starPts.position.copy(p);
    if (earthMesh) {
      const d = new THREE.Vector3(Math.sin(0.62) * Math.cos(0.30), Math.sin(0.30), -Math.cos(0.62) * Math.cos(0.30)).multiplyScalar(86);
      earthMesh.position.copy(p).add(d); earthMesh.rotation.y = 0.9 + t * 0.004;
    }
    if (sunSprite) sunSprite.position.copy(p).add(sunDirV().multiplyScalar(92));
  }

  function paintGround(seed) {
    const r = rngFrom(seed + 1);
    // minimap picture (colours from the palette)
    const gw = 380, gh = 274, mc = document.createElement("canvas"); mc.width = gw; mc.height = gh;
    const mg = mc.getContext("2d"), img = mg.createImageData(gw, gh), d = img.data;
    const grid = Array.from({ length: 24 * 18 }, r);
    const vn = (u, v) => { const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (x, y) => grid[Math.min(17, y) * 24 + Math.min(23, x)]; return at(x0, y0) * (1 - sx) * (1 - sy) + at(x0 + 1, y0) * sx * (1 - sy) + at(x0, y0 + 1) * (1 - sx) * sy + at(x0 + 1, y0 + 1) * sx * sy; };
    const [g1, g2, g3] = pal.ground;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = Math.max(0, Math.min(1, (vn((x / gw) * 22, (y / gh) * 16) - 0.3) * 2)), col = k < 0.5 ? mix(g3, g1, k * 2) : mix(g1, g2, (k - 0.5) * 2), i = (y * gw + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    mg.putImageData(img, 0, 0);
    mg.strokeStyle = "rgba(0,0,0,.14)"; mg.lineWidth = 2; mg.setLineDash([2, 3]);
    [[1800, 300], [3240, 1000], [3150, 2230], [440, 2240]].forEach(([x, y]) => { const f = gw / W; mg.beginPath(); mg.moveTo(2380 * f, 1640 * f); mg.quadraticCurveTo(((2380 + x) / 2 + 120) * f, ((1640 + y) / 2) * f, x * f, y * f); mg.stroke(); });
    miniImg = mc;

    // real ground: big tiled Poly Haven texture, with a painted overlay for dark patches and rover tracks
    const map = loadTex(`assets/img/${pal.tex}_diff.jpg`, true), nor = loadTex(`assets/img/${pal.tex}_nor.jpg`, false);
    [map, nor].forEach(t => t.repeat.set(70, 70));
    baseGround = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), new THREE.MeshStandardMaterial({ map, normalMap: nor, normalScale: new THREE.Vector2(1.4, 1.4), color: pal.tint, roughness: 1, metalness: 0 }));
    baseGround.rotation.x = -Math.PI / 2; baseGround.position.set(W * K / 2, -0.02, H * K / 2); baseGround.receiveShadow = true; groupWorld.add(baseGround);
    const oc = document.createElement("canvas"); oc.width = 1024; oc.height = 740; const og = oc.getContext("2d"), f = 1024 / W;
    for (let k = 0; k < 150; k++) { const x = r() * 1024, y = r() * 740, rad = 30 + r() * 110, gr = og.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${0.10 + r() * 0.12})`); gr.addColorStop(1, "rgba(0,0,0,0)"); og.fillStyle = gr; og.beginPath(); og.arc(x, y, rad, 0, 7); og.fill(); }
    og.strokeStyle = "rgba(0,0,0,.22)"; og.lineWidth = 5; og.lineCap = "round"; og.setLineDash([2, 9]);
    [[1800, 300], [3240, 1000], [3150, 2230], [440, 2240]].forEach(([x, y]) => { og.beginPath(); og.moveTo(2380 * f, 1640 * f); og.quadraticCurveTo(((2380 + x) / 2 + 120) * f, ((1640 + y) / 2) * f, x * f, y * f); og.stroke(); });
    const otex = new THREE.CanvasTexture(oc); otex.anisotropy = 4;
    overlayGround = new THREE.Mesh(new THREE.PlaneGeometry(W * K, H * K), new THREE.MeshBasicMaterial({ map: otex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    overlayGround.rotation.x = -Math.PI / 2; overlayGround.position.set(W * K / 2, -0.012, H * K / 2); groupWorld.add(overlayGround);
  }
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

  /* ---------------- input ---------------- */
  function bindInput() {
    const map = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", e: "act", E: "act", " ": "jump", Enter: "act", q: "camL", Q: "camL", r: "camR", R: "camR" };
    window.addEventListener("keydown", e => {
      const k = map[e.key]; if (!k || !running()) return;
      if (e.target && e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
      keys[k] = true; if (k !== "act" && k !== "camL" && k !== "camR") { P.target = null; P.path = null; }
    });
    window.addEventListener("keyup", e => { const k = map[e.key]; if (k) keys[k] = false; });
    window.addEventListener("blur", () => Object.keys(keys).forEach(k => (keys[k] = false)));
    // drag = look around, tap/click = walk there; on phones the left half is a joystick
    let drag = null;
    cv.addEventListener("pointerdown", e => {
      if (!P || !running()) return;
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (e.pointerType === "touch" && sx < vw * 0.5) { joy.on = true; joy.id = e.pointerId; joy.ox = sx; joy.oy = sy; joy.x = joy.y = 0; cv.setPointerCapture(e.pointerId); P.target = null; P.path = null; return; }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx, sy, moved: false, yaw: camYaw, pitch: camPitch };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", e => {
      if (joy.on && e.pointerId === joy.id) {
        const r = cv.getBoundingClientRect(); let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy;
        const m = Math.hypot(dx, dy), max = 50; if (m > max) { dx *= max / m; dy *= max / m; }
        joy.x = dx / max; joy.y = dy / max; return;
      }
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
        if (drag.moved) { camYaw = drag.yaw - dx * 0.006; camPitch = Math.max(0.16, Math.min(1.2, drag.pitch + dy * 0.004)); }
      }
    });
    const end = e => {
      if (e.pointerId === joy.id && joy.on) { joy.on = false; joy.x = joy.y = 0; }
      if (drag && e.pointerId === drag.id) {
        if (!drag.moved && e.type === "pointerup" && running()) { const hit = groundPoint(drag.sx, drag.sy); if (hit) goTo(hit.x, hit.y); }
        drag = null;
      }
    };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    cv.addEventListener("wheel", e => { if (!running()) return; e.preventDefault(); camDist = Math.max(2.6, Math.min(8, camDist + e.deltaY * 0.004)); }, { passive: false });
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
      else if (Math.hypot(s.x - x, s.y - y) < s.r + rad) { if (s.low && self === undefined && P && P.z > 0.45) continue; return true; }
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
    if (!cine) camYaw += ((keys.camR ? 1 : 0) - (keys.camL ? 1 : 0)) * 1.8 * dt;
    if (ix || iy) { const c = Math.cos(camYaw), sn = Math.sin(camYaw), rx = ix * c + iy * sn, rz = -ix * sn + iy * c; ix = rx; iy = rz; }   // keys move relative to the camera
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
    // jumping: gravity is the real Moon / Mars value (scaled so a hop lasts a second or two)
    const gJ = place === "mars" ? 9.2 : 4.0;
    if (!cine && !P.inRover && keys.jump && P.z <= 0 && !jumpLatch) {
      P.vz = 3.2; P.z = 0.001; jumpLatch = true; for (let i = 0; i < 6; i++) puff(P.x + (Math.random() - 0.5) * 30, P.y + (Math.random() - 0.5) * 30, 0.35, undefined, 0.8, 0.5);
      handlers.jump && handlers.jump("up");
    }
    if (!keys.jump) jumpLatch = false;
    if (P.z > 0 || P.vz > 0) {
      P.vz -= gJ * dt; P.z += P.vz * dt;
      if (P.z <= 0) { P.z = 0; P.vz = 0; for (let i = 0; i < 9; i++) puff(P.x + (Math.random() - 0.5) * 40, P.y + (Math.random() - 0.5) * 40, 0.4, undefined, 0.9, 0.6); handlers.jump && handlers.jump("land"); }
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
    if (v.relayBroken && Math.random() < dt * 3) puff(3150, 2230, 0.3, 0xff5a3a, 0.8, 1.6);
    if (!v.partTaken && Math.random() < dt * 2) puff(440 + (Math.random() - 0.5) * 40, 2240, 0.5, 0x8a8fa8, 1.6, 1.0);
    if (Math.random() < dt * 2.5) puff(3240 + (Math.random() - 0.5) * 120, 1000 + (Math.random() - 0.5) * 120, 0.18, 0xbfe8ff, 1.1, 1.3);
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
  function puff(x, y, size = 0.4, color, life = 0.9, rise = 0.6, h = 0.08) {
    if (!partGroup || parts.length > 260) return;
    const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: color || (place === "mars" ? 0xd28a5c : 0xc9cbd6), transparent: true, depthWrite: false, opacity: 0.8 });
    const s = new THREE.Sprite(mat); s.position.copy(v3(x, y, h)); s.scale.setScalar(size * 0.5); partGroup.add(s);
    const pt = { sprite: s, life: 1, max: life, size, rise, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3 }; parts.push(pt); return pt;
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
  const wrapA = a => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  function updateCamera(dt, v) {
    let tY = camYaw, tP = camPitch, tD = camDist * (P && P.inRover ? 1.7 : 1) * (vw < 700 ? 1.3 : 1), fh = 0.62;
    if (cine && !cine.pos) { tY = cine.yaw || 0; tP = cine.pitch ?? 0.907; tD = cine.dist ?? 10.4 / (cine.zoom || 1); fh = 0; }
    const k = Math.min(1, dt * (cine ? 1.6 : 6));
    if (cine && cine.jump && !cine.jumped) { cY = tY; cP = tP; cD = tD; focusV = null; heroPos = null; cine.jumped = true; }
    cY += wrapA(tY - cY) * k; cP += (tP - cP) * k; cD += (tD - cD) * k;
    if (cine && cine.pos) {   // fixed cinematic camera (title screen)
      const wp = new THREE.Vector3(cine.pos.x * K, cine.pos.h, cine.pos.y * K), wl = new THREE.Vector3(cine.look.x * K, cine.look.h, cine.look.y * K);
      if (!heroPos) { heroPos = wp.clone(); heroLook = wl.clone(); }
      const kk = Math.min(1, dt * (cine.speed || 1.5)); heroPos.lerp(wp, kk); heroLook.lerp(wl, kk);
      const sway = Math.sin(t * 0.25) * 0.05;
      camera.position.set(heroPos.x + sway, heroPos.y, heroPos.z); camera.lookAt(heroLook);
      camera.fov += ((cine.fov || 40) - camera.fov) * k; camera.updateProjectionMatrix();
      lightAt(heroLook, 10, v);
    } else {
      const f = camFocus(), wantF = v3(f.x, f.y, fh + (f === P ? (P.z || 0) * 0.55 : 0));
      if (!focusV) focusV = wantF.clone();
      focusV.lerp(wantF, Math.min(1, dt * (cine ? (cine.speed || 1.2) : 10)));
      const cp = Math.cos(cP);
      camera.position.set(focusV.x + Math.sin(cY) * cp * cD, focusV.y + Math.sin(cP) * cD, focusV.z + Math.cos(cY) * cp * cD);
      camera.lookAt(focusV);
      fadeOccluders(dt);
      if (camera.fov !== 40) { camera.fov += (40 - camera.fov) * k; camera.updateProjectionMatrix(); }
      lightAt(focusV, Math.max(7, cD * 0.95), v);
    }
    syncEnv(camera);
    camYawShown = cY;
  }
  let camYawShown = 0;
  // buildings between the camera and the astronaut turn see-through
  const segTmp = new THREE.Vector3();
  function fadeOccluders(dt) {
    const a = camera.position, b = focusV, ab = segTmp.copy(b).sub(a), len = ab.length(); if (len < 0.01) return;
    const hit = new Set(), cand = [];
    if (!cine) for (const o of occl) {
      const px = o.x - a.x, py = o.cy - a.y, pz = o.z - a.z;
      const tt = Math.max(0, Math.min(1, (px * ab.x + py * ab.y + pz * ab.z) / (len * len)));
      const dx = px - ab.x * tt, dy = py - ab.y * tt, dz = pz - ab.z * tt;
      if (dx * dx + dy * dy + dz * dz < (o.r + 0.3) * (o.r + 0.3)) cand.push(o);
    }
    if (cand.length) {   // test feet, chest and head so a low dome in front of the astronaut still counts
      const gs = cand.map(c => c.g);
      for (const hh of [0.1, 0.5, 0.9]) {
        const tgt = new THREE.Vector3(b.x, hh, b.z), dir = tgt.clone().sub(a), l2 = dir.length();
        occRay.set(a, dir.normalize()); occRay.far = l2 - 0.2;
        occRay.intersectObjects(gs, true).forEach(h => { let n = h.object; while (n && !cand.some(c => c.g === n)) n = n.parent; const c = cand.find(c => c.g === n); if (c) hit.add(c); });
      }
    }
    for (const o of occl) {
      const want = hit.has(o) ? 0.14 : (o.g === shelterMesh && where() === "shelter") ? 0.35 : 1, nf = o.fade + (want - o.fade) * Math.min(1, dt * 9);
      if (Math.abs(nf - o.fade) < 0.002 && o.fade === want) continue;
      o.fade = Math.abs(nf - want) < 0.01 ? want : nf;
      o.mats.forEach((m, i) => { m.opacity = o.base[i] * o.fade; m.transparent = o.fade < 0.995 || o.baseT[i]; m.depthWrite = o.fade > 0.6; });
    }
  }
  // sun follows the camera focus so shadows stay crisp where you are looking
  function lightAt(target, reach, v) {
    const sd = sunDirV();
    sun.position.copy(target).addScaledVector(sd, 24); sun.target.position.copy(target);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
    const dusk = (v && v.dusk) || 0;
    sun.intensity = pal.sunI * (1 - dusk * 0.7); hemi.intensity = pal.hemiI * (1 - dusk * 0.3);
    sun.color.setHex(v && v.storm ? 0xffa060 : pal.sunColor).lerp(new THREE.Color(0x7fa0ff), dusk * 0.6);
  }
  function draw() {
    if (!renderer || !P) return;
    const dt = Math.min(0.05, clock.getDelta());
    const v = handlers.view();
    placeRig(playerRig, P.x, P.y, P.face, heroMode ? ((t % 14) < 2.6 && t > 3 ? "Wave" : "Idle") : P.z > 0.05 ? "Wave" : holdId ? "Interact" : P.moving ? "Run" : "Idle", dt, P.z || 0);
    playerRig.obj.visible = !P.inRover && where() !== "shelter" && !podOn;
    ringMesh.visible = playerRig.obj.visible && !cine; ringMesh.position.copy(v3(P.x, P.y, 0.02)); ringMesh.scale.setScalar((1 + Math.sin(t * 4) * 0.06) / (1 + (P.z || 0) * 0.8));
    crew.forEach(c => placeRig(c.rig, c.x, c.y, c.face, c.moving ? "Walk" : c.act && (c.actT -= dt) > 0 ? c.act : "Idle", dt));
    roverMesh.position.copy(v3(rover.x, rover.y, rover.speed > 5 ? Math.abs(Math.sin(t * 18)) * 0.012 : 0));
    roverMesh.rotation.y = -rover.a + Math.PI / 2;
    syncSamples(v.samples || []);
    sampleMeshes.forEach((m, s) => { m.rotation.y += dt * 1.2; m.position.y = 0.05 + Math.sin(t * 3 + s.x) * 0.03; });
    const dustCol = new THREE.Color(place === "mars" ? 0xb5683e : 0x9a9aa6);
    panelMeshes.forEach((m, i) => { const d = (v.dust || [])[i] || 0; m.traverse(o => { if (o.isMesh && o.userData.base) o.material.color.copy(o.userData.base).lerp(dustCol, d * 0.85); }); });
    updateCamera(dt, v);
    renderer.render(scene, camera);
    beacons.forEach(b => {
      const o = objects.find(q => q.id === b.id), near = Math.hypot(o.x - P.x, o.y - P.y) < 220, tgt = v.guide && v.guide.id === b.id;
      b.g.visible = !near && !cine; b.beam.material.opacity = tgt ? 0.34 + Math.sin(t * 4) * 0.08 : 0.13; b.ring.scale.setScalar(1 + (tgt ? Math.sin(t * 4) * 0.08 : 0)); b.ring.material.opacity = tgt ? 0.8 : 0.35;
    });
    remotesDraw(dt); flameTick(dt);
    overlays(v);
  }
  function placeRig(r, x, y, face, anim, dt, z = 0) {
    r.obj.position.copy(v3(x, y, 0)); r.obj.position.y += z;
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
  function toScreen(x, y, h = 0) { const p = v3(x, y, h).project(camera); const behind = p.z > 1; let nx = p.x, ny = p.y; if (behind) { nx = -nx; ny = -ny; } return { x: (nx * 0.5 + 0.5) * vw, y: (-ny * 0.5 + 0.5) * vh, behind }; }

  function overlays(v) {
    const o = cine ? null : nearest(), pr = o ? prompt(o) : null;
    if (o && pr) {
      const s = toScreen(o.x, o.y, o.kind === "rover" ? 0.7 : 1.4);
      labelEl.hidden = s.behind;
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
        const ex = Math.max(m, Math.min(vw - m, cx + Math.cos(a) * vw)), tp = document.querySelector(".h-tasks"), top = tp ? tp.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 44 : m + 150,
          mt = document.querySelector(".h-meters"), bot = mt ? mt.getBoundingClientRect().top - host.getBoundingClientRect().top - 44 : vh - m - 140,
          ey = Math.max(top, Math.min(bot, cy + Math.sin(a) * vh));
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
    const fa = Math.atan2(-Math.cos(camYawShown), -Math.sin(camYawShown));
    mctx.fillStyle = "rgba(255,255,255,.28)"; mctx.beginPath(); mctx.moveTo(mx(P.x), my(P.y)); mctx.arc(mx(P.x), my(P.y), 42, fa - 0.55, fa + 0.55); mctx.closePath(); mctx.fill();
    mctx.fillStyle = "#ff6b35"; mctx.beginPath(); mctx.arc(mx(P.x), my(P.y), 7, 0, 7); mctx.fill(); mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.stroke();
  }

  /* ---------------- title-screen hero shot + thumbnails ---------------- */
  // The astronaut stands in front of the dome with Earth overhead (like a game title screen).
  const HERO = {
    title: { pos: { x: 1150, y: 2000, h: 0.8 }, look: { x: 1580, y: 1200, h: 1.6 }, fov: 44 },
    card: { pos: { x: 1160, y: 2020, h: 1.0 }, look: { x: 1620, y: 1250, h: 1.4 }, fov: 52 }
  };
  function hero(on) {
    heroMode = !!on;
    if (!P) return;
    playerRig.obj.scale.setScalar(on ? 1.55 : 1);
    crew.forEach(c => (c.rig.obj.visible = !on));
    if (on) {
      P.x = 1305; P.y = 1742; P.face = -0.5; P.moving = false; P.target = null; P.path = null;
      rover.x = 1150; rover.y = 1480; rover.a = -0.75; rover.speed = 0;
      scatter.forEach(o => { o.m.visible = Math.hypot(o.x - 1250, o.y - 1850) > 420 && Math.hypot(o.x - 1560, o.y - 1450) > 250; });
    } else {
      scatter.forEach(o => (o.m.visible = true));
    }
  }
  function texturesReady(maxMs = 5000) {
    const t0 = performance.now();
    return new Promise(res => { const chk = () => { const ok = Object.values(texCache).every(t => t.image && (t.image.complete !== false) && (t.image.width || t.image.videoWidth)); if (ok || performance.now() - t0 > maxMs) res(); else setTimeout(chk, 60); }; chk(); });
  }
  let snapR = null;
  async function snapshot(placeId, seed, w, h) {
    if (!snapR) { snapR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); snapR.shadowMap.enabled = true; snapR.shadowMap.type = THREE.PCFSoftShadowMap; snapR.outputEncoding = THREE.sRGBEncoding; snapR.toneMapping = THREE.ACESFilmicToneMapping; }
    snapR.setSize(w, h, false);
    reset(placeId, { seed }); hero(true);
    await texturesReady();
    placeRig(playerRig, P.x, P.y, P.face, "Wave", 0.7);
    roverMesh.position.copy(v3(rover.x, rover.y, 0)); roverMesh.rotation.y = -rover.a + Math.PI / 2; ringMesh.visible = false;
    const c = HERO.card, cam = new THREE.PerspectiveCamera(c.fov, w / h, 0.1, 700);
    cam.position.set(c.pos.x * K, c.pos.h, c.pos.y * K); cam.lookAt(c.look.x * K, c.look.h, c.look.y * K);
    cam.updateMatrixWorld(); syncEnv(cam); lightAt(new THREE.Vector3(c.look.x * K, 0, c.look.y * K), 10, null);
    snapR.toneMappingExposure = pal.exposure;
    const mainEnv = scene.environment; scene.environment = makeEnv(snapR);
    snapR.render(scene, cam);
    scene.environment = mainEnv;
    const url = snapR.domElement.toDataURL("image/jpeg", 0.88);
    P = null;
    return url;
  }

  /* ---------------- teammates (multiplayer avatars) ---------------- */
  function remoteBuild(r) {
    if (!groupWorld) return;
    r.rig = rig(r.suit); groupWorld.add(r.rig.obj);
    r.rov = model("rover", 150); r.rov.visible = false; groupWorld.add(r.rov);
    if (!r.tag && host) { r.tag = document.createElement("div"); r.tag.className = "rtag"; host.appendChild(r.tag); }
    if (r.tag) { r.tag.style.setProperty("--c", "#" + r.suit.toString(16).padStart(6, "0")); r.tag.textContent = r.name; }
  }
  const remote = {
    add(id, info) {
      let r = remotes.get(id);
      if (!r) { r = { id, name: info.name, suit: info.suit, x: 1800, y: 1500, z: 0, face: 0, anim: "Idle", inRover: false, t: null, say: "", sayT: 0, rig: null, rov: null, tag: null }; remotes.set(id, r); remoteBuild(r); }
      else if (r.suit !== info.suit || r.name !== info.name) { r.name = info.name; r.suit = info.suit; if (r.rig) { groupWorld.remove(r.rig.obj); r.rig = rig(r.suit); groupWorld.add(r.rig.obj); } if (r.tag) { r.tag.style.setProperty("--c", "#" + r.suit.toString(16).padStart(6, "0")); r.tag.textContent = r.name; } }
    },
    update(id, s) { const r = remotes.get(id); if (r) { r.t = s; if (!r.seen) { r.seen = true; r.x = s.x; r.y = s.y; } } },
    say(id, text) { const r = remotes.get(id); if (r) { r.say = text; r.sayT = 4; } },
    remove(id) { const r = remotes.get(id); if (!r) return; if (groupWorld) { r.rig && groupWorld.remove(r.rig.obj); r.rov && groupWorld.remove(r.rov); } r.tag && r.tag.remove(); remotes.delete(id); },
    clear() { [...remotes.keys()].forEach(k => remote.remove(k)); },
    get count() { return remotes.size; },
    list() { return [...remotes.values()].map(r => ({ id: r.id, name: r.name, suit: r.suit, x: r.x, y: r.y })); }
  };
  function remotesDraw(dt) {
    remotes.forEach(r => {
      if (!r.rig) remoteBuild(r);
      const s = r.t; if (s) {
        const k = Math.min(1, dt * 9);
        r.x += (s.x - r.x) * k; r.y += (s.y - r.y) * k; r.z += ((s.z || 0) - r.z) * k; r.face = s.face; r.anim = s.anim; r.inRover = !!s.inRover;
        if (r.rov) { r.rov.position.copy(v3(s.rx !== undefined ? s.rx : r.x, s.ry !== undefined ? s.ry : r.y, 0)); r.rov.rotation.y = -(s.ra || 0) + Math.PI / 2; r.rov.visible = !!s.inRover; }
      }
      r.rig.obj.visible = !r.inRover;
      placeRig(r.rig, r.x, r.y, r.face, r.sayT > 0 && r.say ? "Wave" : r.anim, dt, r.z);
      if (r.sayT > 0) r.sayT -= dt;
      if (r.tag) {
        const sc = toScreen(r.x, r.y, 1.25 + r.z); r.tag.hidden = sc.behind;
        r.tag.style.transform = `translate(${sc.x}px, ${sc.y}px) translate(-50%, -100%)`;
        const txt = r.sayT > 0 && r.say ? `${r.name}: ${r.say}` : r.name; if (r.tag._t !== txt) { r.tag.textContent = txt; r.tag._t = txt; }
        r.tag.classList.toggle("say", r.sayT > 0);
      }
    });
  }
  function localState() {
    if (!P) return null;
    return { x: Math.round(P.x), y: Math.round(P.y), z: +(P.z || 0).toFixed(2), face: +P.face.toFixed(2), inRover: P.inRover, rov: true, rx: Math.round(rover.x), ry: Math.round(rover.y), ra: +rover.a.toFixed(2),
      anim: P.z > 0.05 ? "Wave" : holdId ? "Interact" : P.moving ? "Run" : "Idle" };
  }
  /* ---------------- landing cinematic: a real lander (Apollo LM / Viking) with a rocket plume ---------------- */
  let flame = null, flameCore = null, flameLight = null, flameOn = 0, podKeep = false;
  function podBuild() {
    pod = new THREE.Group();
    pod.add(model(place === "mars" ? "nasa_viking" : "nasa_lm", 170));
    const gc = document.createElement("canvas"); gc.width = 4; gc.height = 64; const gg = gc.getContext("2d"), gr = gg.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,1)"); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 64);
    const gtex = new THREE.CanvasTexture(gc);
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, map: gtex, transparent: true, opacity: o * 1.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.9, 20, 1, true), mat(0xff8a2c, 0.3)); flame.rotation.x = Math.PI; flame.position.y = 0.5 - 0.95;
    flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.1, 16, 1, true), mat(0xbfdcff, 0.6)); flameCore.rotation.x = Math.PI; flameCore.position.y = 0.5 - 0.55;
    flameLight = new THREE.PointLight(0xffa24a, 0, 9); flameLight.position.y = 0.2;
    pod.add(flame, flameCore, flameLight); groupWorld.add(pod); podKeep = false;
  }
  function setPod(on, x, y, h, fire, hide = true) {
    if (on && !pod) podBuild();
    podOn = !!on && hide; if (!pod) return;
    pod.visible = !!on || podKeep; if (on) pod.position.copy(v3(x, y, h));
    flameOn = fire ? 1 : 0;
    if (on && fire && h < 6) { const k = 1 - h / 6; for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, p = puff(x + Math.cos(a) * 40, y + Math.sin(a) * 40, 0.9 + Math.random() * 0.6, undefined, 1.4, 0.15, 0.1 + Math.random() * 0.2); if (p) { p.vx = Math.cos(a) * (2.2 + k * 3); p.vz = Math.sin(a) * (2.2 + k * 3); } } }
  }
  function podStay(x, y) { podKeep = true; podOn = false; flameOn = 0; if (pod) { pod.visible = true; } solids.push({ x, y, r: 70 }); }
  function flameTick(dt) {
    if (!pod || !flame) return;
    const f = flameOn, fl = 0.85 + Math.sin(t * 55) * 0.1 + Math.random() * 0.08;
    flame.visible = flameCore.visible = f > 0; flame.scale.set(1 + Math.sin(t * 31) * 0.06, fl, 1); flameCore.scale.set(1, fl * 0.95, 1);
    flameLight.intensity = f * (3.2 + Math.random() * 0.8);
  }
  function podShrink() {}
  return {
    remote, localState, setPod, podStay, podShrink, snapshot, hero, HERO, texturesReady,
    setQuality(q) { if (!renderer) return; sun.castShadow = q === "high"; renderer.setPixelRatio(q === "high" ? Math.min(2, window.devicePixelRatio || 1) : 1); resize(); },
    setSuit(c) { suit = c; if (playerRig && groupWorld) { const o = playerRig.obj, pos = o.position.clone(), ry = o.rotation.y, sc = o.scale.x, vis = o.visible; groupWorld.remove(o); playerRig = rig(c); playerRig.obj.position.copy(pos); playerRig.obj.rotation.y = ry; playerRig.obj.scale.setScalar(sc); playerRig.obj.visible = vis; groupWorld.add(playerRig.obj); } },
    get yaw() { return camYaw; },
    preload, init, reset, step, draw, resize, keys, burst, where, nearest, current,
    get camera() { return camera; }, get player() { return P; }, get rover() { return rover; }, get objects() { return objects; },
    obj: id => objects.find(o => o.id === id),
    setTarget(x, y) { if (!P) return; if (x === null) { P.target = null; P.path = null; } else goTo(x, y); },
    setCine(c) { cine = c; if (c && c.jump) { focusV = null; heroPos = null; } },
    driveRover(x, y) { rover.auto = { x, y }; },
    walkTo(x, y) { if (x === null) { if (P) { P.target = null; P.path = null; } return; } goTo(x, y); },
    free: (x, y) => !collide(x, y, 22),
    roomAt: () => null,
    W, H
  };
})();
