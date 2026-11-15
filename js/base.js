/* BASE KIT — builds the long modular outpost (habitat tubes, geodesic dome, corridors) with walk-in interiors.
   Everything is procedural (canvas textures + boxes/cylinders) plus CC0 Kenney props for furniture.
   World units: 1 astronaut = 84 units tall (≈1.8 m), so 1 m ≈ 47 units. */
window.BaseKit = (function () {
  const T = () => window.THREE;
  const WALL_H = 140, WALL_T = 14, DOOR_W = 112, DOOR_H = 118;

  /* ---------- layout (world units) ---------- */
  const SPINE_Y = 1150, SOUTH_Y = 1720;
  const MODS = [
    { id: "quarters", kind: "hab",     label: "CREW QUARTERS",   x: 760,  y: SPINE_Y, w: 340, d: 230, doors: [{ s: "E" }, { s: "W" }] },
    { id: "c1",       kind: "corr",    label: "",                x: 990,  y: SPINE_Y, w: 120, d: 112, doors: [{ s: "E" }, { s: "W" }] },
    { id: "green",    kind: "green",   label: "GREENHOUSE",      x: 1300, y: SPINE_Y, w: 500, d: 260, doors: [{ s: "E" }, { s: "W" }, { s: "N", off: -110 }] },
    { id: "c2",       kind: "corr",    label: "",                x: 1600, y: SPINE_Y, w: 100, d: 112, doors: [{ s: "E" }, { s: "W" }] },
    { id: "dome",     kind: "dome",    label: "MISSION CONTROL", x: 1900, y: SPINE_Y, r: 250, doors: [{ a: 180 }, { a: 0 }, { a: 90 }, { a: 270 }] },
    { id: "c3",       kind: "corr",    label: "",                x: 2210, y: SPINE_Y, w: 120, d: 112, doors: [{ s: "E" }, { s: "W" }] },
    { id: "lab",      kind: "lab",     label: "SCIENCE LAB",     x: 2480, y: SPINE_Y, w: 420, d: 250, doors: [{ s: "W" }, { s: "N", off: 100 }] },
    { id: "c4",       kind: "corr",    label: "",                x: 1900, y: 1440, w: 112, d: 120, vert: true, doors: [{ s: "N" }, { s: "S" }] },
    { id: "shelter",  kind: "shelter", label: "STORM SHELTER",   x: 1900, y: SOUTH_Y, w: 300, d: 280, doors: [{ s: "N" }, { s: "W" }, { s: "E" }, { s: "S", off: 70 }] },
    { id: "c5",       kind: "corr",    label: "",                x: 1700, y: SOUTH_Y, w: 100, d: 112, doors: [{ s: "E" }, { s: "W" }] },
    { id: "life",     kind: "life",    label: "LIFE SUPPORT",    x: 1480, y: SOUTH_Y, w: 340, d: 250, doors: [{ s: "E" }, { s: "W" }, { s: "S", off: -60 }] },
    { id: "c6",       kind: "corr",    label: "",                x: 1262, y: SOUTH_Y, w: 100, d: 112, doors: [{ s: "E" }, { s: "W" }] },
    { id: "shield",   kind: "shield",  label: "SHIELD GENERATOR", x: 1030, y: SOUTH_Y, w: 360, d: 250, doors: [{ s: "E" }, { s: "S", off: 40 }] },
    { id: "c7",       kind: "corr",    label: "",                x: 2120, y: SOUTH_Y, w: 100, d: 112, doors: [{ s: "E" }, { s: "W" }] },
    { id: "garage",   kind: "garage",  label: "ROVER GARAGE",    x: 2440, y: SOUTH_Y, w: 540, d: 300, doors: [{ s: "W" }, { s: "E", w: 190 }] }
  ];
  const SOLAR = [[1010, 700], [1190, 700], [1370, 700], [1010, 880], [1190, 880], [1370, 880]];
  const STATIONS = {   // where crew stand for each job (inside the rooms)
    green:  { x: 1300, y: SPINE_Y + 40 }, life: { x: 1480, y: SOUTH_Y - 30 }, shield: { x: 1030, y: SOUTH_Y - 20 }, lab: { x: 2480, y: SPINE_Y + 30 },
    command: { x: 1900, y: SPINE_Y + 20 }, rest: { x: 760, y: SPINE_Y + 20 }, garage: { x: 2330, y: SOUTH_Y + 20 }, shelter: { x: 1900, y: SOUTH_Y }
  };

  /* ---------- procedural textures ---------- */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new (T().CanvasTexture)(c); t.wrapS = t.wrapT = T().RepeatWrapping; t.anisotropy = 4; t.encoding = T().sRGBEncoding; if (repeat) t.repeat.set(repeat[0], repeat[1]); return t;
  }
  const cache = {};
  function hullTex(tone) {
    const k = "hull" + tone; if (cache[k]) return cache[k];
    return (cache[k] = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = tone === "dark" ? "#8d939c" : "#eceff2"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(120,90,60,${Math.random() * 0.05})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 0, 7); g.fill(); }
      g.strokeStyle = "rgba(70,78,90,.55)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = "rgba(60,66,76,.6)"; for (let x = 8; x < w; x += 128) for (let y = 8; y < h; y += 64) { g.fillRect(x, y, 3, 3); g.fillRect(x + 112, y, 3, 3); }
    }));
  }
  function floorTex() {
    if (cache.floor) return cache.floor;
    return (cache.floor = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = "#4a4f58"; g.fillRect(0, 0, w, h); g.strokeStyle = "#2c3038"; g.lineWidth = 2;
      for (let i = -h; i < w + h; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
      g.strokeStyle = "#6b717c"; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    }));
  }
  function labelTex(text, bg) {
    return canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = bg || "#1b2a44"; g.fillRect(0, 0, w, h); g.strokeStyle = "#ff8a2a"; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = "#ffffff"; g.font = "bold 26px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2);
    });
  }
  const mats = {
    hull: (w, h, tone) => { const t = hullTex(tone).clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, w / 190), Math.max(1, h / 150)); return new (T().MeshStandardMaterial)({ map: t, roughness: 0.55, metalness: 0.25 }); },
    floor: (w, d) => { const t = floorTex().clone(); t.needsUpdate = true; t.repeat.set(w / 60, d / 60); return new (T().MeshStandardMaterial)({ map: t, roughness: 0.7, metalness: 0.4 }); },
    glass: () => new (T().MeshStandardMaterial)({ color: 0x0b1a2c, emissive: 0x1d5a96, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.7 }),
    frame: () => new (T().MeshStandardMaterial)({ color: 0xff8a2a, roughness: 0.5, metalness: 0.2, emissive: 0x552200, emissiveIntensity: 0.3 }),
    plain: (c, r = 0.6, m = 0.2) => new (T().MeshStandardMaterial)({ color: c, roughness: r, metalness: m }),
    glow: c => new (T().MeshBasicMaterial)({ color: c })
  };

  /* ---------- build ---------- */
  function build(ctx) {
    const { THREE, K, groupWorld, model, solids, add } = ctx;
    const out = { mods: [], stations: STATIONS, solar: SOLAR, doors: [] };
    const V = (x, y, h = 0) => new THREE.Vector3(x * K, h * K, y * K);   // h is in world units too
    const box = (w, h, d, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w * K, h * K, d * K), m); me.castShadow = true; me.receiveShadow = true; return me; };
    const solidBox = (x, y, w, h) => solids.push({ box: true, x: x - w / 2, y: y - h / 2, w, h });

    function module(sp) {
      const g = new THREE.Group(); g.position.copy(V(sp.x, sp.y, 0));
      const mod = { id: sp.id, kind: sp.kind, x: sp.x, y: sp.y, w: sp.w, d: sp.d, r: sp.r, g, wallMats: [], roofMats: [], a: 1, tgt: 1, bounds: null };
      const walls = new THREE.Group(), roof = new THREE.Group(); g.add(walls, roof);
      const tone = sp.kind === "garage" || sp.kind === "shelter" ? "dark" : "light";
      const addWall = (m, lx, ly, w, h, d, ph = 0, ghost = true) => { const me = box(w, h, d, m); me.position.set(lx * K, (ph + h / 2) * K, ly * K); walls.add(me); if (ghost) mod.wallMats.push(m); return me; };
      if (sp.kind === "dome") return dome(sp, mod, g, walls, roof);
      const w = sp.w, d = sp.d, wh = WALL_H;
      // floor
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w * K, d * K), mats.floor(w, d)); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.012; fl.receiveShadow = true; g.add(fl);
      const doorOf = s => (sp.doors || []).find(q => q.s === s);
      const wallLine = (s) => {   // a wall along x (N/S) or along y (W/E) with an optional door gap
        const horizontal = s === "N" || s === "S", len = horizontal ? w : d, door = doorOf(s), off = door ? door.off || 0 : 0, dw = door ? door.w || DOOR_W : 0;
        const c = horizontal ? (s === "N" ? -d / 2 : d / 2) : (s === "W" ? -w / 2 : w / 2);
        const segs = door ? [[-len / 2, off - dw / 2], [off + dw / 2, len / 2]] : [[-len / 2, len / 2]];
        segs.forEach(([a, b]) => {
          const L = b - a; if (L < 4) return; const mid = (a + b) / 2, m = mats.hull(L, wh, tone);
          if (horizontal) { addWall(m, mid, c, L, wh, WALL_T); solidBox(sp.x + mid, sp.y + c, L, WALL_T + 6); }
          else { addWall(m, c, mid, WALL_T, wh, L); solidBox(sp.x + c, sp.y + mid, WALL_T + 6, L); }
        });
        if (door) {   // lintel + frame
          const lm = mats.hull(dw, wh - DOOR_H, tone), fm = mats.frame();
          if (horizontal) { addWall(lm, off, c, dw, wh - DOOR_H, WALL_T, DOOR_H); [-1, 1].forEach(q => addWall(fm, off + q * (dw / 2 + 3), c, 6, DOOR_H, WALL_T + 4, 0, false)); addWall(fm, off, c, dw + 12, 6, WALL_T + 4, DOOR_H, false); out.doors.push({ x: sp.x + off, y: sp.y + c, s, mod: sp.id }); }
          else { addWall(lm, c, off, WALL_T, wh - DOOR_H, dw, DOOR_H); [-1, 1].forEach(q => addWall(fm, c, off + q * (dw / 2 + 3), WALL_T + 4, DOOR_H, 6, 0, false)); addWall(fm, c, off, WALL_T + 4, 6, dw + 12, DOOR_H, false); out.doors.push({ x: sp.x + c, y: sp.y + off, s, mod: sp.id }); }
        }
        // window band on long solid walls
        if (!door && len > 220) { const gm = mats.glass(), n = Math.floor(len / 130); for (let i = 0; i < n; i++) { const o = -len / 2 + (i + 0.5) * (len / n); if (horizontal) addWall(gm, o, c + (s === "N" ? -WALL_T / 2 - 1 : WALL_T / 2 + 1), 70, 34, 2, 82); else addWall(gm, c + (s === "W" ? -WALL_T / 2 - 1 : WALL_T / 2 + 1), o, 2, 34, 70, 82); } }
      };
      ["N", "S", "W", "E"].forEach(wallLine);
      // roof: half-cylinder vault along the long axis (corridors and rooms) with end caps
      const alongX = !sp.vert, R = (alongX ? d : w) / 2, len = alongX ? w : d;
      const rm = mats.hull(len, R * 3, tone); mod.roofMats.push(rm);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R * K, R * K, len * K, 28, 1, true, 0, Math.PI), rm); cyl.material.side = THREE.DoubleSide; cyl.castShadow = true; cyl.receiveShadow = true;
      cyl.rotation.set(0, 0, Math.PI / 2);
      const holder = new THREE.Group(); holder.add(cyl); if (!alongX) holder.rotation.y = Math.PI / 2; holder.position.set(0, wh * K, 0); roof.add(holder);
      [-1, 1].forEach(q => { const cm = mats.hull(R * 2, R, tone); mod.roofMats.push(cm); const cap = new THREE.Mesh(new THREE.CircleGeometry(R * K, 28, 0, Math.PI), cm); cm.side = THREE.DoubleSide; cap.castShadow = true; if (alongX) { cap.rotation.y = q * Math.PI / 2; cap.position.set(q * (len / 2 - 1) * K, wh * K, 0); } else { cap.rotation.y = q > 0 ? 0 : Math.PI; cap.position.set(0, wh * K, q * (len / 2 - 1) * K); } roof.add(cap); });
      // roof details: label plate, hatch, vent
      if (sp.label) { const lb = new THREE.Mesh(new THREE.PlaneGeometry(120 * K, 30 * K), new THREE.MeshBasicMaterial({ map: labelTex(sp.label) })); lb.position.set(0, (wh - 6) * K, (d / 2 + WALL_T / 2 + 1.5) * K); walls.add(lb); mod.wallMats.push(lb.material); }
      mod.bounds = { x0: sp.x - w / 2, x1: sp.x + w / 2, y0: sp.y - d / 2, y1: sp.y + d / 2 };
      groupWorld.add(g); out.mods.push(mod);
      mod.walls = walls; mod.roof = roof;
      return mod;
    }

    function dome(sp, mod, g, walls, roof) {
      const R = sp.r;
      // raised platform + base ring wall with door gaps
      const plat = new THREE.Mesh(new THREE.CylinderGeometry((R + 55) * K, (R + 70) * K, 16 * K, 40), mats.plain(0x9aa0a8, 0.8, 0.3)); plat.position.y = 8 * K; plat.receiveShadow = true; plat.castShadow = true; g.add(plat);
      const fl = new THREE.Mesh(new THREE.CircleGeometry((R + 50) * K, 40), mats.floor(R * 2, R * 2)); fl.rotation.x = -Math.PI / 2; fl.position.y = 16.5 * K; g.add(fl);
      const N = 34, doorA = (sp.doors || []).map(q => q.a);
      const segLen = (2 * Math.PI * R) / N;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 360, diff = Math.min(...doorA.map(da => Math.abs(((a - da + 540) % 360) - 180)));
        const isGap = doorA.some(da => Math.abs(((a - da + 540) % 360) - 180) < 15) ? false : null;
        const ang = (a * Math.PI) / 180, px = Math.cos(ang) * R, py = Math.sin(ang) * R;
        const nearDoor = doorA.some(da => { const dd = Math.abs(((a - da + 540) % 360) - 180); return dd < 19; });
        if (nearDoor) continue;
        const m = mats.hull(segLen, 60, "light"); const me = box(segLen + 1, 70, WALL_T, m); me.position.set(px * K, (16 + 35) * K, py * K); me.rotation.y = -ang + Math.PI / 2; walls.add(me); mod.wallMats.push(m);
        solids.push({ x: sp.x + px, y: sp.y + py, r: segLen / 2 + 4 });
      }
      // glass geodesic dome
      const hemi = new THREE.SphereGeometry(R * K, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe2ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      const shell = new THREE.Mesh(hemi, glass); shell.position.y = 70 * K; roof.add(shell); mod.roofMats.push(glass);
      const ribMat = new THREE.LineBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.95 }); mod.roofMats.push(ribMat);
      const ribs = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R * K * 1.004, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)), ribMat); ribs.position.y = 70 * K; roof.add(ribs);
      // antenna masts like the reference
      [[-90, 40, 520], [120, -60, 470]].forEach(([ax, ay, hh]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * K, 2.2 * K, hh * K, 8), mats.plain(0xd0d4da, 0.4, 0.6)); m.position.set(ax * K, (hh / 2 + 70) * K, ay * K); m.castShadow = true; roof.add(m); });
      mod.bounds = { x0: sp.x - R, x1: sp.x + R, y0: sp.y - R, y1: sp.y + R, circle: true };
      groupWorld.add(g); out.mods.push(mod); mod.walls = walls; mod.roof = roof;
      return mod;
    }

    MODS.forEach(module);

    /* ---------- furniture and equipment ---------- */
    const FURN = new THREE.Group(); groupWorld.add(FURN);
    function prop(name, size, x, y, rot = 0, lift = 0, solid) {
      const m = model(name, size, { rot }); m.position.copy(V(x, y, lift)); FURN.add(m);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (solid) solidBox(x, y, solid[0], solid[1]); return m;
    }
    function pbox(w, h, d, x, y, color, lift = 0, solid = true, rough = 0.6, metal = 0.2) {
      const m = box(w, h, d, mats.plain(color, rough, metal)); m.position.copy(V(x, y, lift + h / 2)); FURN.add(m); if (solid) solidBox(x, y, w, d); return m;
    }
    const screen = (x, y, w, h, lift, rot, col = 0x39c6ff) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w * K, h * K), mats.glow(col)); p.position.copy(V(x, y, lift)); p.rotation.y = rot; FURN.add(p); return p; };
    function cyl(r, h, x, y, color, lift = 0, solid = true, metal = 0.5) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r * K, r * K, h * K, 18), mats.plain(color, 0.35, metal)); m.position.copy(V(x, y, lift + h / 2)); m.castShadow = true; FURN.add(m); if (solid) solids.push({ x, y, r: r + 4 }); return m; }
    const bunk = (x, y, rot) => { const g = new THREE.Group(); g.position.copy(V(x, y, 0)); g.rotation.y = rot; [0, 62].forEach(h => { const b = box(120, 8, 56, mats.plain(0x35557c, 0.8, 0)); b.position.y = (28 + h) * K; g.add(b); const pi = box(40, 10, 40, mats.plain(0xdfe6f0, 0.9, 0)); pi.position.set(-38 * K, (36 + h) * K, 0); g.add(pi); }); [-58, 58].forEach(px => [-26, 26].forEach(pz => { const p = box(4, 100, 4, mats.plain(0x9aa4b0, 0.4, 0.6)); p.position.set(px * K, 50 * K, pz * K); g.add(p); })); FURN.add(g); const c = Math.cos(rot), s = Math.sin(rot); solidBox(x, y, Math.abs(120 * c) + Math.abs(56 * s), Math.abs(120 * s) + Math.abs(56 * c)); };
    const locker = (x, y, c = 0x6a7684) => pbox(36, 110, 30, x, y, c, 0, true, 0.5, 0.5);
    const planter = (x, y, w, d, seed) => {
      pbox(w, 22, d, x, y, 0x3a2a1e, 0, true, 0.95, 0);
      const g = new THREE.Group(); g.position.copy(V(x, y, 22)); FURN.add(g);
      for (let i = 0; i < Math.floor(w / 18); i++) for (let j = 0; j < Math.floor(d / 22); j++) { const h = 24 + ((i * 7 + j * 13 + seed) % 5) * 7, m = new THREE.Mesh(new THREE.ConeGeometry(7 * K, h * K, 6), mats.plain(i % 2 ? 0x3ea84a : 0x59c05a, 0.8, 0)); m.position.set((-w / 2 + 10 + i * 18) * K, h / 2 * K, (-d / 2 + 11 + j * 22) * K); g.add(m); }
      const lamp = box(w, 3, 8, mats.glow(0xff7be0)); lamp.position.copy(V(x, y, 96)); FURN.add(lamp);
    };
    const rack = (x, y, w, rot = 0) => { pbox(w, 120, 34, x, y, 0x4b5563, 0, true, 0.5, 0.5); for (let i = 0; i < Math.floor(w / 26); i++) screen(x - w / 2 + 14 + i * 26, y + (rot ? -18 : 18), 14, 8, 80 + (i % 3) * 14, rot ? Math.PI : 0, i % 2 ? 0x3dff8a : 0x39c6ff); };
    const P2 = (m, ox, oy) => ({ x: m.x + ox, y: m.y + oy });

    const M = id => MODS.find(m => m.id === id);
    // QUARTERS: bunks, lockers, table
    { const m = M("quarters"); [-120, -40, 40].forEach(ox => bunk(m.x + ox, m.y - 80, 0)); [-120, -40, 40].forEach(ox => bunk(m.x + ox, m.y + 82, 0)); locker(m.x + 140, m.y - 90); locker(m.x + 140, m.y - 50); pbox(40, 60, 40, m.x + 125, m.y + 10, 0x7b6a52, 0, true); }
    // GREENHOUSE: planter rows, grow lamps, tank, water pipes
    { const m = M("green"); [-170, -60, 50, 160].forEach((ox, i) => { planter(m.x + ox, m.y - 75, 90, 50, i); planter(m.x + ox, m.y + 75, 90, 50, i + 3); }); cyl(26, 90, m.x - 215, m.y, 0x9fc4de, 0); prop("pipe_ring", 70, m.x + 205, m.y + 5, 0, 0); }
    // LAB: benches, computers, microscope, rock racks
    { const m = M("lab"); pbox(260, 80, 46, m.x - 20, m.y - 85, 0xb9c2cc, 0, true, 0.4, 0.6); pbox(180, 80, 46, m.x - 20, m.y + 85, 0xb9c2cc, 0, true, 0.4, 0.6); [-120, -40, 40, 110].forEach((ox, i) => prop("desk_computerScreen", 52, m.x + ox - 20, m.y - 85, 0, 80)); cyl(9, 26, m.x - 80, m.y + 85, 0xcfd6dd, 80, false); cyl(6, 20, m.x - 40, m.y + 85, 0x4cc0ff, 80, false); [0, 1, 2].forEach(i => pbox(24, 14, 24, m.x + 170, m.y - 70 + i * 18, 0x8a5a3a, 0, false)); rack(m.x + 185, m.y + 20, 100, 0); prop("desk_chair", 34, m.x - 20, m.y - 45, Math.PI); prop("desk_chair", 34, m.x - 20, m.y + 45, 0); }
    // LIFE SUPPORT: tanks, generators, pipes
    { const m = M("life"); [-110, -50].forEach(ox => cyl(30, 110, m.x + ox, m.y - 70, 0xaed0e6, 0)); cyl(30, 110, m.x + 10, m.y - 70, 0xe8d8a0, 0); prop("machine_generator", 100, m.x + 100, m.y - 75, 0, 0, [100, 56]); prop("machine_barrel", 70, m.x + 100, m.y + 75, 0, 0, [62, 56]); prop("pipe_straight", 80, m.x - 60, m.y + 85, 0, 60); rack(m.x - 80, m.y + 92, 110, 1); }
    // SHIELD: coils and capacitor banks
    { const m = M("shield"); [-110, 0, 110].forEach((ox, i) => { cyl(24, 90, m.x + ox, m.y - 55, 0x3c4a60, 0); const r = new THREE.Mesh(new THREE.TorusGeometry(30 * K, 3 * K, 8, 24), mats.glow(0x39c6ff)); r.position.copy(V(m.x + ox, m.y - 55, 98)); r.rotation.x = Math.PI / 2; FURN.add(r); }); prop("machine_wirelessCable", 120, m.x - 30, m.y + 80, 0, 0, [110, 60]); rack(m.x + 120, m.y + 90, 100, 1); }
    // SHELTER: reinforced bunks, supply crates
    { const m = M("shelter"); bunk(m.x - 90, m.y - 95, 0); bunk(m.x + 70, m.y - 95, 0); bunk(m.x - 90, m.y + 70, 0); locker(m.x + 120, m.y + 0, 0x8a5a3a); locker(m.x + 120, m.y + 40, 0x8a5a3a); prop("barrels", 60, m.x + 100, m.y - 20, 0, 0, [50, 40]); }
    // GARAGE: pad (the rover charger), tool bench, spare craft
    { const m = M("garage"); prop("platform_small", 200, m.x - 60, m.y, 0, 0); pbox(150, 70, 40, m.x + 20, m.y - 125, 0x77808c, 0, true, 0.5, 0.6); prop("craft_cargoA", 150, m.x + 190, m.y + 95, Math.PI / 2, 0, [140, 90]); [0, 1, 2].forEach(i => prop("barrel", 36, m.x - 220 + i * 26, m.y + 120, 0, 0, [24, 24])); rack(m.x - 230, m.y - 130, 90, 0); }
    // DOME: command table, consoles in a ring, big screens, chairs
    { const m = M("dome"); const cx = m.x, cy = m.y; const tb = new THREE.Mesh(new THREE.CylinderGeometry(55 * K, 60 * K, 34 * K, 24), mats.plain(0x2c3a4e, 0.4, 0.5)); tb.position.copy(V(cx, cy, 33)); tb.castShadow = true; FURN.add(tb); solids.push({ x: cx, y: cy, r: 66 }); const holo = new THREE.Mesh(new THREE.SphereGeometry(18 * K, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4cc0ff, transparent: true, opacity: 0.55, wireframe: true })); holo.position.copy(V(cx, cy, 78)); holo.userData.holo = true; FURN.add(holo); out.holo = holo;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5, rx = cx + Math.cos(a) * 170, ry = cy + Math.sin(a) * 170; if (Math.abs(Math.cos(a)) > 0.93 || Math.abs(Math.sin(a)) > 0.93) continue; prop("desk_computer", 70, rx, ry, -a + Math.PI / 2, 0, [70, 40]); prop("desk_computerScreen", 70, rx - Math.cos(a) * 14, ry - Math.sin(a) * 14, -a - Math.PI / 2, 38); prop("desk_chair", 34, rx - Math.cos(a) * 52, ry - Math.sin(a) * 52, -a, 0); }
      [[0, -215], [-190, -110], [190, -110]].forEach(([ox, oy]) => screen(cx + ox, cy + oy, 120, 70, 130, Math.atan2(-ox, -oy) + Math.PI, 0x2a8bff)); }
    // outside: solar farm, radio dish array, parked vehicles
    SOLAR.forEach(([x, y], i) => { out.solarPos = out.solarPos || []; out.solarPos.push({ x, y }); });
    return out;
  }

  /* roof/wall fade: ghost a module when the player is inside it or it blocks the camera */
  function update(out, camera, P, dt) {
    if (!out) return;
    const px = P.x, py = P.y;
    out.mods.forEach(m => {
      const b = m.bounds; if (!b) return;
      let inside;
      if (b.circle) inside = Math.hypot(px - m.x, py - m.y) < m.r - 8; else inside = px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1;
      let block = false;
      if (!inside && camera) {   // camera ray (x,z) crosses the module footprint close to the player
        const cx = camera.position.x / 0.01, cy = camera.position.z / 0.01, dx = px - cx, dy = py - cy, n = 14;
        for (let i = 1; i < n; i++) { const t = i / n, x = cx + dx * t, y = cy + dy * t; if (b.circle ? Math.hypot(x - m.x, y - m.y) < m.r : (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) { block = Math.hypot(px - m.x, py - m.y) < Math.max(m.w || 0, m.r || 0) * 1.1 + 160 && camera.position.y > 0.5; break; } }
      }
      m.tgt = inside ? 0.0 : block ? 0.12 : 1;
      m.a += (m.tgt - m.a) * Math.min(1, dt * 7);
      const wa = inside ? Math.max(0.16, m.a) : m.a, ra = m.a;
      m.wallMats.forEach(x => { const o = x.opacity !== undefined ? wa : 1; x.transparent = wa < 0.99; x.opacity = wa; x.depthWrite = wa > 0.99; });
      m.roofMats.forEach(x => { const base = x.userData && x.userData.base !== undefined ? x.userData.base : (x._b !== undefined ? x._b : (x._b = x.opacity === undefined || x.opacity === 1 ? 1 : x.opacity)); x.transparent = true; x.opacity = base * ra; x.depthWrite = ra > 0.99 && base === 1; });
      m.roof.visible = ra > 0.02;
    });
    if (out.holo) out.holo.rotation.y += dt * 0.8;
  }
  function roomAt(out, x, y) { if (!out) return null; for (const m of out.mods) { const b = m.bounds; if (!b) continue; if (b.circle ? Math.hypot(x - m.x, y - m.y) < m.r - 8 : (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) return m.id; } return null; }
  return { build, update, roomAt, MODS, SOLAR, STATIONS, DOOR_W };
})();
