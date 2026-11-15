/* AI-assisted: this file was written with help from Claude (Anthropic), directed and reviewed by Team Pheonix. See AI-DISCLOSURE.md. */
/*
  SUN WATCH — an interactive look at REAL NASA DONKI CMEs.
  Each dot is a real Coronal Mass Ejection. Drag the time slider (or press Play)
  and watch each one travel outward at its measured speed. When does it pass the
  Moon (1 AU from the Sun) and Mars (about 1.52 AU)? Tap a dot to see its record.
*/
window.SunWatch = (() => {
  const AU_KM = 149597870.7;
  const MAX_AU = 1.7, MAX_H = 100;
  const X0 = 70, X1 = 860;
  const xFor = au => X0 + (Math.min(au, MAX_AU) / MAX_AU) * (X1 - X0);
  const auAt = (speed, hours) => (speed * hours * 3600) / AU_KM;
  const hoursTo = (speed, au) => Math.round((au * AU_KM) / speed / 3600);
  const levelColor = l => (l >= 3 ? "#ff4d4d" : l === 2 ? "#ff6b35" : "#ffd54a");

  let root, list, hours = 0, playing = null, sel = 0, tab = "live", opts = {};

  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function pickList() {
    const st = Donki.state;
    const live = st.live.slice(0, 12).map(s => ({ ...s, source: "live" }));
    const arch = st.archive.slice().sort((a, b) => b.speed - a.speed).slice(0, 12);
    if (tab === "live" && !live.length) tab = "archive";
    let l = tab === "live" ? live : arch;
    if (opts.storm && opts.storm.source !== "practice" && !l.some(s => s.id === opts.storm.id)) l = [opts.storm, ...l].slice(0, 12);
    return l;
  }

  function open(container, o = {}) {
    root = container; opts = o; hours = o.storm ? 0 : 24; sel = 0;
    tab = Donki.state.live.length ? "live" : "archive";
    list = pickList();
    if (o.storm) { const i = list.findIndex(s => s.id === o.storm.id); sel = i >= 0 ? i : 0; }
    render();
  }

  function render() {
    const place = opts.placeId === "mars" ? "Mars" : "Moon";
    const rows = list.length;
    const rowH = Math.max(18, Math.min(26, 230 / Math.max(1, rows)));
    const top = 46, svgH = top + rows * rowH + 34;
    const moonX = xFor(1), marsX = xFor(1.524);
    const reachedMoon = list.filter(s => auAt(s.speed, hours) >= 1).length;
    const reachedMars = list.filter(s => auAt(s.speed, hours) >= 1.524).length;
    const s = list[sel];

    const dots = list.map((c, i) => {
      const y = top + i * rowH + rowH / 2;
      const au = auAt(c.speed, hours);
      const x = xFor(au);
      const mine = opts.storm && c.id === opts.storm.id;
      return `<g class="sw-row ${i === sel ? "on" : ""}" data-i="${i}" tabindex="0" role="button" aria-label="CME ${esc(c.date)}, ${c.speed} kilometres per second">
        <rect x="${X0 - 60}" y="${y - rowH / 2}" width="${X1 - X0 + 100}" height="${rowH}" class="sw-hit"/>
        <text x="${X0 - 58}" y="${y + 4}" class="sw-date">${esc(c.date.slice(5))}</text>
        <line x1="${X0}" y1="${y}" x2="${x}" y2="${y}" stroke="${levelColor(c.level)}" stroke-opacity=".35" stroke-width="${i === sel ? 4 : 2}" stroke-linecap="round"/>
        <circle cx="${x}" cy="${y}" r="${i === sel ? 8 : 5.5}" fill="${levelColor(c.level)}" ${mine ? 'stroke="#fff" stroke-width="2"' : ""}/>
        ${au > MAX_AU ? `<text x="${X1 + 6}" y="${y + 4}" class="sw-date">→</text>` : ""}
        ${mine ? `<text x="${Math.min(x + 12, X1 - 70)}" y="${y - 7}" class="sw-mine">YOUR STORM</text>` : ""}
      </g>`;
    }).join("");

    root.innerHTML = `
      <div class="sw-main">
        <div class="sw-tabs" role="tablist">
          <button class="chip-btn ${tab === "live" ? "on" : ""}" data-tab="live" ${Donki.state.live.length ? "" : "disabled"}>Last 60 days ${Donki.state.live.length ? "· Live" : "· offline"}</button>
          <button class="chip-btn ${tab === "archive" ? "on" : ""}" data-tab="archive">Biggest storms 2024–25 · Archived</button>
        </div>
        <svg class="sw-svg" viewBox="0 0 ${X1 + 40} ${svgH}" role="img" aria-label="Real CMEs travelling from the Sun toward the Moon and Mars">
          <defs><radialGradient id="swSun"><stop offset="0" stop-color="#fff2a8"/><stop offset=".6" stop-color="#ffb020"/><stop offset="1" stop-color="#ff6b35"/></radialGradient></defs>
          <circle cx="${X0 - 4}" cy="${top - 18}" r="16" fill="url(#swSun)"/>
          <text x="${X0 + 18}" y="${top - 13}" class="sw-axis">Sun</text>
          <line x1="${moonX}" y1="${top - 30}" x2="${moonX}" y2="${svgH - 26}" class="sw-line moon"/>
          <line x1="${marsX}" y1="${top - 30}" x2="${marsX}" y2="${svgH - 26}" class="sw-line mars"/>
          <circle cx="${moonX}" cy="${top - 18}" r="9" fill="#cfd3e6"/><circle cx="${moonX + 7}" cy="${top - 24}" r="5" fill="#4c8dff"/>
          <text x="${moonX + 16}" y="${top - 13}" class="sw-axis">Earth &amp; Moon · 1 AU</text>
          <circle cx="${marsX}" cy="${top - 18}" r="8" fill="#e0704a"/>
          <text x="${marsX + 14}" y="${top - 13}" class="sw-axis">Mars · 1.52 AU</text>
          ${dots}
          <text x="${X0}" y="${svgH - 8}" class="sw-axis">distance from the Sun →</text>
        </svg>
        <div class="sw-time">
          <button class="btn-secondary sm" data-play>${playing ? "Pause" : "Play"}</button>
          <input type="range" min="0" max="${MAX_H}" step="1" value="${hours}" aria-label="Hours since the CMEs left the Sun" data-hours>
          <span class="sw-clock"><b>${hours}</b> hours</span>
        </div>
        <p class="sw-sum">After <b>${hours} hours</b>: <b>${reachedMoon}</b> of ${rows} CMEs have reached the Moon, <b>${reachedMars}</b> have reached Mars.</p>
        ${s ? `<div class="sw-card">
          <div class="sw-card-top"><b>CME · ${esc(s.date)} ${s.time ? esc(s.time) + " UTC" : ""}</b>
            <span class="badge ${s.source === "live" ? "live" : "arch"}">${s.source === "live" ? "Live NASA data" : "Archived NASA data"}</span></div>
          <div class="sw-stats">
            <div><span>Speed</span><b>${s.speed.toLocaleString()} km/s</b></div>
            <div><span>Storm level</span><b style="color:${levelColor(s.level)}">${s.level} of 3</b></div>
            <div><span>Reaches Moon</span><b>~${hoursTo(s.speed, 1)} h</b></div>
            <div><span>Reaches Mars</span><b>~${hoursTo(s.speed, 1.524)} h</b></div>
          </div>
          <p class="muted small">${s.hasSep ? "DONKI linked this CME to a radiation storm (SEP) — extra dangerous. " : ""}Real CMEs slow down a little as they travel, and only hit a planet if aimed that way. ${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">Open the DONKI record</a>` : ""}</p>
        </div>` : `<p class="muted">No NASA CME data could be loaded.</p>`}
      </div>`;
  }

  function onClick(e) {
    if (!root || !root.contains(e.target)) return;
    const row = e.target.closest(".sw-row");
    if (row) { sel = +row.dataset.i; render(); return; }
    const tb = e.target.closest("[data-tab]");
    if (tb && !tb.disabled) { tab = tb.dataset.tab; list = pickList(); sel = 0; render(); return; }
    if (e.target.closest("[data-play]")) {
      if (playing) { clearInterval(playing); playing = null; render(); return; }
      if (hours >= MAX_H) hours = 0;
      playing = setInterval(() => {
        hours = Math.min(MAX_H, hours + 1);
        if (hours >= MAX_H) { clearInterval(playing); playing = null; }
        render();
      }, 70);
      render();
    }
  }
  function onInput(e) {
    if (!root || !root.contains(e.target) || !e.target.matches("[data-hours]")) return;
    hours = +e.target.value;
    const v = e.target; render();
    const nv = root.querySelector("[data-hours]"); if (nv) nv.focus();
  }
  function onKey(e) {
    const row = e.target.closest && e.target.closest(".sw-row");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sel = +row.dataset.i; render(); }
  }
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKey);

  function close() { if (playing) clearInterval(playing); playing = null; root = null; }

  return { open, close, hoursTo };
})();
