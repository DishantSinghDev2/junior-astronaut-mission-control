/*
  MINI-GAMES
  scrub(container, opts, onDone): wipe dust off a solar panel by dragging (or hold E/Space to auto-scrub)
  wires(container, opts, onDone): connect matching coloured wires (tap left, then right — or drag)
*/
window.Mini = (() => {
  let cleanup = null;
  function stop() { if (cleanup) { cleanup(); cleanup = null; } }

  function scrub(root, opts, onDone) {
    stop();
    const W = 460, H = 240;
    root.innerHTML = `<div class="mini">
      <h2>Scrub the solar panel</h2>
      <p class="muted">Drag across the panel to wipe off the ${opts.place === "mars" ? "red Mars" : "grey Moon"} dust. <span class="kbd">Hold E</span> works too.</p>
      <div class="scrub-wrap"><canvas width="${W}" height="${H}" class="scrub" aria-label="Dusty solar panel. Drag to clean."></canvas></div>
      <div class="mini-bar"><i id="scrub-bar"></i></div>
      <div class="mini-foot"><span id="scrub-pct">0% clean</span><button class="btn-secondary sm" data-mini="cancel">Cancel</button></div>
    </div>`;
    const cv = root.querySelector("canvas"), c = cv.getContext("2d");
    const dust = document.createElement("canvas"); dust.width = W; dust.height = H;
    const d = dust.getContext("2d");
    const col = opts.place === "mars" ? [176, 92, 52] : [160, 160, 170];
    d.fillStyle = `rgb(${col})`; d.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { d.fillStyle = `rgba(${col.map(v => v + (Math.random() * 50 - 25))},.9)`; d.beginPath(); d.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 8, 0, 7); d.fill(); }
    function drawPanel() {
      c.fillStyle = "#1c2f8f"; c.fillRect(0, 0, W, H);
      c.strokeStyle = "#7d97ff"; c.lineWidth = 2;
      for (let x = 0; x <= W; x += W / 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (let y = 0; y <= H; y += H / 3) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.fillStyle = "rgba(255,255,255,.15)"; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.4, 0); c.lineTo(0, H * 0.6); c.fill();
      c.drawImage(dust, 0, 0);
    }
    let down = false, last = null, finished = false;
    function wipe(x, y) {
      d.globalCompositeOperation = "destination-out";
      d.lineWidth = 46; d.lineCap = "round";
      d.beginPath(); d.moveTo(last ? last.x : x, last ? last.y : y); d.lineTo(x, y); d.stroke();
      d.globalCompositeOperation = "source-over";
      last = { x, y }; drawPanel();
    }
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    cv.addEventListener("pointerdown", e => { down = true; last = null; cv.setPointerCapture(e.pointerId); const p = pos(e); wipe(p.x, p.y); });
    cv.addEventListener("pointermove", e => { if (down) { const p = pos(e); wipe(p.x, p.y); } });
    cv.addEventListener("pointerup", () => { down = false; last = null; });
    let auto = false, ax = 0, ay = 20, dir = 1;
    const kd = e => { if (["e", "E", " ", "Enter"].includes(e.key)) { auto = true; e.preventDefault(); } };
    const ku = e => { if (["e", "E", " ", "Enter"].includes(e.key)) { auto = false; last = null; } };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    const timer = setInterval(() => {
      if (auto) for (let k = 0; k < 2; k++) { ax += dir * 30; if (ax > W || ax < 0) { dir *= -1; ay += 40; last = null; if (ay > H) ay = 20; } wipe(ax, ay); }
      const px = d.getImageData(0, 0, W, H).data; let left = 0;
      for (let i = 3; i < px.length; i += 64) if (px[i] > 40) left++;
      const pct = Math.round(100 - (left / (px.length / 64)) * 100);
      const bar = root.querySelector("#scrub-bar"), lab = root.querySelector("#scrub-pct");
      if (bar) bar.style.width = pct + "%"; if (lab) lab.textContent = `${pct}% clean`;
      if (pct >= 88 && !finished) { finished = true; Sound.sfx("done"); setTimeout(() => { stop(); onDone(true); }, 350); }
    }, 120);
    drawPanel();
    cleanup = () => { clearInterval(timer); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }

  function wires(root, opts, onDone) {
    stop();
    const colors = [["#ff4d4d", "Red"], ["#ffd54a", "Yellow"], ["#4c8dff", "Blue"], ["#ff6bd5", "Pink"]];
    const right = colors.map((c, i) => i).sort(() => Math.random() - 0.5);
    const W = 420, H = 280, ys = i => 45 + i * 63;
    let sel = null, links = {}, drag = null;
    root.innerHTML = `<div class="mini">
      <h2>${opts.title || "Fix the wiring"}</h2>
      <p class="muted">Connect each wire to the socket of the same colour. Tap a wire, then its socket (or drag).</p>
      <div class="wires-wrap"><svg viewBox="0 0 ${W} ${H}" class="wires" role="group" aria-label="Wire repair panel"></svg></div>
      <div class="mini-foot"><span id="wire-st">0 of 4 connected</span><button class="btn-secondary sm" data-mini="cancel">Cancel</button></div>
    </div>`;
    const svg = root.querySelector("svg");
    function render() {
      const lines = Object.entries(links).map(([l, r]) => `<path d="M60 ${ys(+l)} C 200 ${ys(+l)}, 220 ${ys(right.indexOf(+r))}, 360 ${ys(right.indexOf(+r))}" stroke="${colors[l][0]}" stroke-width="12" fill="none" stroke-linecap="round"/>`).join("");
      const dl = drag ? `<path d="M60 ${ys(drag.i)} L ${drag.x} ${drag.y}" stroke="${colors[drag.i][0]}" stroke-width="12" stroke-linecap="round" opacity=".8"/>` : "";
      svg.innerHTML = `<rect width="${W}" height="${H}" rx="18" fill="#0d1640"/>${lines}${dl}
        ${colors.map((c, i) => `<g class="wire-l ${sel === i ? "sel" : ""} ${links[i] !== undefined ? "done" : ""}" data-l="${i}" tabindex="0" role="button" aria-label="${c[1]} wire">
          <rect x="14" y="${ys(i) - 16}" width="50" height="32" rx="8" fill="${c[0]}" stroke="#fff" stroke-width="${sel === i ? 4 : 0}"/></g>`).join("")}
        ${right.map((ci, j) => `<g class="wire-r" data-r="${ci}" tabindex="0" role="button" aria-label="${colors[ci][1]} socket">
          <rect x="356" y="${ys(j) - 16}" width="50" height="32" rx="8" fill="#1b2a6b" stroke="${colors[ci][0]}" stroke-width="5"/>
          <circle cx="381" cy="${ys(j)}" r="7" fill="${colors[ci][0]}"/></g>`).join("")}`;
      root.querySelector("#wire-st").textContent = `${Object.keys(links).length} of 4 connected`;
    }
    function connect(l, r) {
      if (l === r) { links[l] = r; Sound.sfx("wire"); if (Object.keys(links).length === 4) { Sound.sfx("done"); setTimeout(() => { stop(); onDone(true); }, 400); } }
      else { Sound.sfx("error"); svg.classList.remove("shake"); void svg.getBBox(); svg.classList.add("shake"); }
      sel = null; render();
    }
    const svgPt = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    svg.addEventListener("pointerdown", e => {
      const l = e.target.closest(".wire-l"), r = e.target.closest(".wire-r");
      if (l && links[+l.dataset.l] === undefined) { sel = +l.dataset.l; const p = svgPt(e); drag = { i: sel, ...p }; svg.setPointerCapture(e.pointerId); render(); }
      else if (r && sel !== null) connect(sel, +r.dataset.r);
    });
    svg.addEventListener("pointermove", e => { if (drag) { Object.assign(drag, svgPt(e)); render(); } });
    svg.addEventListener("pointerup", e => {
      if (!drag) return;
      const p = svgPt(e), j = right.findIndex((_, k) => Math.abs(p.y - ys(k)) < 26 && p.x > 330);
      const i = drag.i; drag = null;
      if (j >= 0) connect(i, right[j]); else render();
    });
    svg.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault();
      const l = e.target.closest(".wire-l"), r = e.target.closest(".wire-r");
      if (l && links[+l.dataset.l] === undefined) { sel = +l.dataset.l; render(); svg.querySelector(".wire-r")?.focus(); }
      else if (r && sel !== null) connect(sel, +r.dataset.r);
    });
    render();
    cleanup = () => {};
  }
  return { scrub, wires, stop };
})();
