/*
  NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)
  We use real Coronal Mass Ejections (CMEs) to create the game's solar storms:
    - CME speed (km/s)  -> storm strength (level 1, 2 or 3)
    - linked SEP event  -> +1 level (SEP = radiation storm of fast particles)
    - speed + distance  -> how many hours the CME would need to reach the Moon or Mars
  First we try LIVE data (last ~60 days). If that fails, we use the ARCHIVED file
  js/donki-archive.js (real DONKI data saved earlier). We always tell the player which one.
*/
window.Donki = (() => {
  const AU_KM = 149597870.7;
  const CACHE_KEY = "donki-live-v1";

  function levelFor(speed, hasSep) {
    let level = speed >= 2000 ? 3 : speed >= 1000 ? 2 : 1;
    if (hasSep) level = Math.min(3, level + 1);
    return level;
  }

  // Turn one raw DONKI CME record into a simple game storm (or null if no speed)
  function fromRawCME(cme, sourceLabel) {
    const analyses = cme.cmeAnalyses || [];
    const best = analyses.find(a => a.isMostAccurate) || analyses[0];
    if (!best || !best.speed) return null;
    const linked = (cme.linkedEvents || []).map(e => e.activityID);
    const hasSep = linked.some(id => id.includes("-SEP-"));
    const hasFlare = linked.some(id => id.includes("-FLR-"));
    return {
      id: cme.activityID,
      date: (cme.startTime || "").slice(0, 10),
      time: (cme.startTime || "").slice(11, 16),
      speed: Math.round(best.speed),
      type: best.type || "",
      hasSep, hasFlare,
      link: cme.link || "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
      level: levelFor(best.speed, hasSep),
      source: sourceLabel
    };
  }

  function fmt(d) { return d.toISOString().slice(0, 10); }

  async function fetchLive() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < 3600e3) return cached.storms;
    } catch (e) { /* storage blocked: ignore */ }

    const end = new Date();
    const start = new Date(end.getTime() - CONFIG.LIVE_DAYS_BACK * 86400e3);
    const url = `https://api.nasa.gov/DONKI/CME?startDate=${fmt(start)}&endDate=${fmt(end)}&api_key=${encodeURIComponent(CONFIG.NASA_API_KEY)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);   // NASA's API is sometimes slow
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("DONKI answered " + res.status);
    const raw = await res.json();
    const storms = raw.map(c => fromRawCME(c, "live"))
      .filter(s => s && s.speed >= 500)
      .sort((a, b) => b.speed - a.speed);
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), storms })); } catch (e) {}
    return storms;
  }

  function archived() {
    const a = window.DONKI_ARCHIVE;
    if (!a || !a.storms) return [];
    return a.storms.map(s => ({ ...s, level: levelFor(s.speed, s.hasSep), source: "archive" }));
  }

  const state = { status: "loading", live: [], archive: archived(), error: null, fetchedAt: null };

  async function load() {
    try {
      state.live = await fetchLive();
      state.status = state.live.length ? "live" : "live-empty";
      state.fetchedAt = new Date();
    } catch (e) {
      state.status = "archive";
      state.error = e.message || String(e);
    }
    return state;
  }

  // Pick n storms for a mission: 1 LIVE storm (what the Sun is doing now) when available,
  // the rest from the ARCHIVE (big storms of the 2024–2025 solar maximum).
  function pickStorms(n) {
    const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
    const live = shuffle(state.live.slice(0, 15)).slice(0, 1);
    const arch = shuffle(state.archive);
    const picked = shuffle([...live, ...arch].slice(0, n));
    while (picked.length < n) {
      // No NASA data at all (offline AND archive missing): clearly marked practice storm.
      picked.push({ id: "practice", date: "", speed: 900, level: 2, hasSep: false, source: "practice", link: "" });
    }
    return picked;
  }

  function hoursToTravel(speedKmS, distanceAU) {
    return Math.round(distanceAU * AU_KM / speedKmS / 3600);
  }

  return { load, state, pickStorms, hoursToTravel, levelFor };
})();

/* Earth–Mars radio delay for today, estimated from simple circular planet orbits. */
window.Comms = {
  marsDistanceAU(date) {
    const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400e3;  // days since J2000
    const rad = Math.PI / 180;
    const earthLon = (100.464 + 0.9856091 * d) * rad;
    const marsLon = (355.433 + 0.5240329 * d) * rad;
    const re = 1.0, rm = 1.5237;
    return Math.sqrt(re * re + rm * rm - 2 * re * rm * Math.cos(earthLon - marsLon));
  },
  marsDelayMinutes(date) {
    const au = this.marsDistanceAU(date);
    return Math.round(au * 149597870.7 / 299792.458 / 60);
  }
};
