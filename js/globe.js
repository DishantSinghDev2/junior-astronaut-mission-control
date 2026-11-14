/*
  3D GLOBE — spin Mars or the Moon and pick a real landing site.
  Uses three.js and real planet maps from Solar System Scope (CC BY 4.0, based on NASA imagery).
  Site markers sit at REAL latitude/longitude.
*/
window.Globe = (() => {
  let renderer, scene, camera, planet, glow, raf, host, pins, body, sites, onPick;
  let rotY = 0, rotX = 0.25, drag = null, spin = true, zoomIn = null;

  /* ---------- seeded value noise ---------- */
  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
  function makeNoise(seed, gw, gh) {
    const r = rng(seed), g = Array.from({ length: gw * gh }, r);
    const at = (x, y) => g[((y % gh + gh) % gh) * gw + ((x % gw + gw) % gw)];
    const sm = t => t * t * (3 - 2 * t);
    return (u, v) => { // u,v in grid units; wraps
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = sm(u - x0), fy = sm(v - y0);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  function fbm(n, u, v, oct) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(u * f, v * f); a *= 0.5; f *= 2; } return s; }

  function paint(kind) {
    const W = 1024, H = 512;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(W, H), d = img.data;
    const n1 = makeNoise(kind === "mars" ? 7 : 21, 16, 8), n2 = makeNoise(kind === "mars" ? 99 : 5, 64, 32);
    const pal = kind === "mars"
      ? { lo: [120, 46, 22], mid: [196, 92, 48], hi: [232, 150, 96] }
      : { lo: [70, 72, 82], mid: [150, 152, 160], hi: [205, 206, 212] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x / W) * 16, v = (y / H) * 8;
      let t = fbm(n1, u, v, 4) * 0.75 + fbm(n2, u * 1.0, v * 1.0, 2) * 0.35;
      t = Math.max(0, Math.min(1, (t - 0.25) * 1.6));
      const c = t < 0.5 ? mix(pal.lo, pal.mid, t * 2) : mix(pal.mid, pal.hi, (t - 0.5) * 2);
      const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const r = rng(kind === "mars" ? 3 : 11);
    // craters
    const count = kind === "mars" ? 140 : 420;
    for (let k = 0; k < count; k++) {
      const x = r() * W, y = 30 + r() * (H - 60), rad = Math.pow(r(), 3) * (kind === "mars" ? 18 : 26) + 2;
      ctx.fillStyle = `rgba(0,0,0,${0.18 + r() * 0.12})`; ctx.beginPath(); ctx.ellipse(x, y, rad, rad, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.10 + r() * 0.1})`; ctx.beginPath(); ctx.ellipse(x - rad * 0.2, y - rad * 0.2, rad * 0.7, rad * 0.7, 0, 0, 7); ctx.fill();
    }
    if (kind === "mars") {
      // Valles Marineris: long canyon south of the equator, west longitudes
      ctx.strokeStyle = "rgba(70,24,12,.55)"; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(W * (1 - 110 / 360) - W / 2, H * 0.53);
      for (let i = 0; i <= 12; i++) ctx.lineTo(W * ((-110 + i * 5.5 + 180) / 360), H * (0.53 + Math.sin(i) * 0.008));
      ctx.stroke();
      // polar caps
      [[0, 26], [H, 18]].forEach(([y0, h]) => {
        for (let x = 0; x < W; x += 4) {
          const hh = h + 10 * Math.sin(x / 37) + 6 * Math.sin(x / 13);
          ctx.fillStyle = "rgba(245,240,235,.95)";
          ctx.fillRect(x, y0 === 0 ? 0 : H - hh, 4, hh);
        }
      });
    } else {
      // lunar maria (dark seas)
      [[0.55, 0.42, 90, 60], [0.62, 0.35, 70, 40], [0.45, 0.48, 60, 40], [0.33, 0.4, 110, 70]].forEach(([x, y, w, h]) => {
        ctx.fillStyle = "rgba(40,40,52,.45)"; ctx.beginPath(); ctx.ellipse(x * W, y * H, w, h, 0.3, 0, 7); ctx.fill();
      });
    }
    return cv;
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  function latLon(lat, lon, rad) {
    const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th));
  }

  function open(container, opts) {
    host = container; body = opts.body; sites = opts.sites; onPick = opts.onPick;
    host.innerHTML = `<canvas class="globe-cv"></canvas><div class="pins"></div><p class="globe-hint">Drag to spin · tap a pin</p>`;
    if (!window.THREE) { host.innerHTML = `<p class="muted">3D view could not load (no internet?). Pick a site from the list.</p>`; return; }
    const cv = host.querySelector(".globe-cv"); pins = host.querySelector(".pins");
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100); camera.position.set(0, 0, 4.2);
    // real planet maps (Solar System Scope, CC BY 4.0, made from NASA spacecraft imagery)
    const tex = new THREE.TextureLoader().load(`assets/img/2k_${body}.jpg`);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    scene.add(planet);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.MeshBasicMaterial({ color: body === "mars" ? 0xff8a50 : 0x8899cc, transparent: true, opacity: body === "mars" ? 0.12 : 0.04, side: THREE.BackSide }));
    scene.add(atm); glow = atm;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xfff1dd, 1.25); sun.position.set(-3, 1.5, 3); scene.add(sun);
    // stars
    const sg = new THREE.BufferGeometry(), pts = [];
    const r = rng(5); for (let i = 0; i < 600; i++) { const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(20 + r() * 10); pts.push(v.x, v.y, v.z); }
    sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 })));
    // pins
    sites.forEach(s => {
      s.pos = latLon(s.lat, s.lon, 1.01);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd54a }));
      dot.position.copy(s.pos); planet.add(dot);
    });
    pins.innerHTML = sites.map((s, i) => `<button class="pin" data-site="${i}"><i></i><span>${s.name}</span></button>`).join("");
    rotY = -(sites[0].lon + 90) * Math.PI / 180; rotX = sites[0].lat * Math.PI / 180 * 0.6;
    spin = true; zoomIn = null;
    cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, ry: rotY, rx: rotX }; spin = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", e => { if (!drag) return; rotY = drag.ry + (e.clientX - drag.x) * 0.008; rotX = Math.max(-1.3, Math.min(1.3, drag.rx + (e.clientY - drag.y) * 0.008)); });
    cv.addEventListener("pointerup", () => (drag = null));
    pins.addEventListener("click", e => { const b = e.target.closest(".pin"); if (b) onPick(sites[+b.dataset.site], +b.dataset.site); });
    resize(); window.addEventListener("resize", resize);
    loop();
  }

  function focus(i) { const s = sites[i]; spin = false; zoomIn = { ry: -(s.lon + 90) * Math.PI / 180, rx: s.lat * Math.PI / 180 }; }
  function landAnim() { return new Promise(res => { zoomIn = zoomIn || { ry: rotY, rx: rotX }; zoomIn.land = performance.now(); zoomIn.res = res; }); }

  function resize() {
    if (!renderer || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (spin) rotY += 0.0025;
    if (zoomIn) {
      rotY += (zoomIn.ry - rotY) * 0.08; rotX += (zoomIn.rx - rotX) * 0.08;
      if (zoomIn.land) {
        const k = Math.min(1, (performance.now() - zoomIn.land) / 1400);
        camera.position.z = 4.2 - 3.0 * k * k;
        if (k >= 1 && zoomIn.res) { const r = zoomIn.res; zoomIn.res = null; r(); }
      }
    }
    planet.rotation.set(rotX, rotY, 0, "XYZ");
    renderer.render(scene, camera);
    // place HTML pins
    const w = host.clientWidth, h = host.clientHeight;
    const camDir = camera.position.clone().normalize();
    sites.forEach((s, i) => {
      const wp = s.pos.clone().applyEuler(planet.rotation);
      const el = pins.children[i]; if (!el) return;
      const vis = wp.clone().normalize().dot(camDir) > 0.15;
      const p = wp.clone().project(camera);
      el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px)`;
      el.style.opacity = vis ? 1 : 0; el.style.pointerEvents = vis ? "auto" : "none";
    });
  }
  function close() {
    cancelAnimationFrame(raf); raf = null;
    window.removeEventListener("resize", resize);
    if (renderer) { renderer.dispose(); renderer = null; }
    host = null;
  }
  return { open, close, focus, landAnim, paint };
})();
