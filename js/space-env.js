/* AI-assisted: this file was written with help from Claude (Anthropic), directed and reviewed by Team Pheonix. See AI-DISCLOSURE.md. */
/* SPACE ENVIRONMENT — real conditions for today, computed from published orbital formulas (no API needed).
   Mars: solar longitude Ls and declination (Allison & McEwen 2000, the Mars24 algorithm), Mars Sol Date, local mean solar time.
   Moon: age, phase, Earth's phase seen from the Moon, local Sun elevation from the sub-solar longitude.
   Sunrise / sunset come from the site's latitude and the Sun's declination, so every site has its own real day.
   AI-assisted: written with help from Claude (Anthropic); formulas checked against NASA/GISS Mars24 notes. */
window.SpaceEnv = (function () {
  const R = Math.PI / 180, J2000 = 2451545.0;
  const jd = d => d.getTime() / 86400000 + 2440587.5;
  const mod = (a, n) => ((a % n) + n) % n, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PHASES = ["New Moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full Moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  function moon(date) {
    const P = 29.530588853, A = mod(jd(date) - 2451550.1, P), k = A / P;
    return { age: A, illum: (1 - Math.cos(2 * Math.PI * k)) / 2, earthIllum: (1 + Math.cos(2 * Math.PI * k)) / 2, subLon: 180 - 360 * k, waxing: A < P / 2, name: PHASES[Math.round(k * 8) % 8] };
  }
  function mars(date) {
    const d = jd(date) - J2000, M = mod(19.3871 + 0.52402075 * d, 360), Mr = M * R, afms = 270.3863 + 0.52403840 * d;
    const dnu = (10.691 + 3.0e-7 * d) * Math.sin(Mr) + 0.623 * Math.sin(2 * Mr) + 0.050 * Math.sin(3 * Mr) + 0.005 * Math.sin(4 * Mr) + 0.0005 * Math.sin(5 * Mr);
    const Ls = mod(afms + dnu, 360), decl = Math.asin(Math.sin(25.19 * R) * Math.sin(Ls * R)) / R;
    const jdTT = jd(date) + 69.184 / 86400, msd = (jdTT - 2405522.0028779) / 1.0274912517;
    const season = Ls < 90 ? "Northern spring" : Ls < 180 ? "Northern summer" : Ls < 270 ? "Northern autumn" : "Northern winter";
    const myr = Math.floor((msd - 34.0 * 0 - 0) / 668.5921) ;   // not shown; kept for reference
    return { Ls, decl, msd, mtc: mod(msd, 1) * 24, season, perseveranceSol: Math.floor((date.getTime() - Date.UTC(2021, 1, 18, 20, 55)) / 88775244), curiositySol: Math.floor((date.getTime() - Date.UTC(2012, 7, 6, 5, 17)) / 88775244) };
  }
  const hh = h => { h = mod(h, 24); const H = Math.floor(h), M = Math.round((h - H) * 60); return String(M === 60 ? H + 1 : H).padStart(2, "0") + ":" + String(M === 60 ? 0 : M).padStart(2, "0"); };
  /* everything about one landing site today */
  function forSite(placeId, site, date) {
    date = date || new Date();
    const phi = site.lat, out = { placeId, lat: phi, lon: site.lon, date };
    if (placeId === "mars") {
      const m = mars(date); Object.assign(out, { mars: m, decl: m.decl });
      const ct = -Math.tan(phi * R) * Math.tan(m.decl * R);
      out.polar = ct >= 1 ? "night" : ct <= -1 ? "day" : null;
      out.H0 = ct >= 1 ? 0.3 : ct <= -1 ? Math.PI : Math.acos(ct);
      out.daylight = out.polar === "night" ? 0 : out.polar === "day" ? 1 : out.H0 / Math.PI;
      out.lmst = mod(m.mtc + site.lon / 15, 24);
      const Hnow = (out.lmst - 12) * 15 * R; out.sunElNow = Math.asin(Math.sin(phi * R) * Math.sin(m.decl * R) + Math.cos(phi * R) * Math.cos(m.decl * R) * Math.cos(Hnow)) / R;
      out.sunrise = 12 - out.daylight * 12; out.sunset = 12 + out.daylight * 12;
      out.maxEl = 90 - Math.abs(phi - m.decl); out.dayLen = 24.6597;
    } else {
      const mo = moon(date), decl = 1.54 * Math.sin(2 * Math.PI * (jd(date) - J2000) / 365.25 + 1);
      Object.assign(out, { moon: mo, decl, earthIllum: mo.earthIllum });
      const ct = -Math.tan(phi * R) * Math.tan(decl * R);
      out.H0 = ct >= 1 ? 1.5 : ct <= -1 ? Math.PI : Math.acos(ct);
      out.daylight = site.lit || (out.polar ? 0.5 : out.H0 / Math.PI);   // site.lit: published share of time the rim is sunlit
      const hnow = (mo.subLon - site.lon) * R; out.sunElNow = Math.asin(Math.sin(phi * R) * Math.sin(decl * R) + Math.cos(phi * R) * Math.cos(decl * R) * Math.cos(hnow)) / R;
      out.maxEl = Math.max(1.6, 90 - Math.abs(phi - decl)); out.dayLen = 29.530588853 * 24;
    }
    out.isDayNow = out.sunElNow > 0;
    return out;
  }
  /* Sun on a game day: u = 0..1 -> elevation, azimuth and how dusky it is */
  function sunAt(env, u) {
    const phi = env.lat * R, d = env.decl * R, ur = 0.04, us = 0.62 + 0.30 * clamp((env.daylight - 0.35) / 0.5, 0, 1);
    let el, p = clamp((u - ur) / (us - ur), 0, 1);
    if (u < ur) el = -8 * (1 - u / ur);
    else if (u <= us) { const H = -env.H0 + 2 * env.H0 * p; el = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)) / R; el = Math.max(el, env.placeId === "moon" ? 0.4 : 0.6); }
    else el = -16 * ((u - us) / (1 - us));
    const mid = env.lat >= env.decl ? 180 : 0, az = mod(90 + (mid === 180 ? 180 * p : -180 * p), 360);
    const dusk = clamp(1 - (el + 10) / 32, 0, 1), light = el <= -3 ? 0 : (0.2 + 0.8 * Math.pow(clamp(el / 28, 0, 1), 0.55)) * clamp((el + 3) / 6, 0, 1);
    return { el, az, dusk, light, night: el < -3, us };
  }
  /* human-readable lines for the "today" cards */
  function describe(env) {
    const L = [];
    if (env.placeId === "mars") {
      const m = env.mars;
      L.push(["Mars date", `Sol date ${m.msd.toFixed(1)} · season ${m.season} (Ls ${m.Ls.toFixed(0)}°)`]);
      L.push(["Perseverance", `Landed Feb 18 2021 · today is about sol ${m.perseveranceSol}; Curiosity about sol ${m.curiositySol}`]);
      L.push(["Local time here", `${hh(env.lmst)} Mars solar time · ${env.isDayNow ? "Sun is up" : "it is night"} (Sun ${env.sunElNow.toFixed(0)}° above the horizon)`]);
      L.push(["Sunrise and sunset", env.polar === "night" ? "Polar night: the Sun stays below the horizon" : env.polar === "day" ? "Polar day: the Sun does not set" : `Sunrise ${hh(env.sunrise)} · sunset ${hh(env.sunset)} · day ${(env.daylight * 24.66).toFixed(1)} h of a 24.66 h sol`]);
      L.push(["Sky colours", "Mars skies are butterscotch by day, but the sky around the setting Sun glows blue (fine dust scatters blue light forwards)."]);
    } else {
      const mo = env.moon;
      L.push(["Moon today", `${mo.name} · ${Math.round(mo.illum * 100)}% lit as seen from Earth · age ${mo.age.toFixed(1)} days`]);
      L.push(["Earth in your sky", `Earth looks about ${Math.round(mo.earthIllum * 100)}% lit (the opposite of the Moon's phase)`]);
      L.push(["Sun right now here", `${env.isDayNow ? "Daytime" : "Lunar night"} at this site · Sun ${env.sunElNow.toFixed(0)}° from the horizon (sub-solar longitude ${mo.subLon.toFixed(0)}°)`]);
      L.push(["Daylight", env.lat < -85 ? "Near the pole the Sun never climbs above about 2°: shadows are huge. Some rim spots are sunlit most of the time." : `A lunar day lasts about 29.5 Earth days: about ${Math.round(env.daylight * 354)} hours of sunlight.`]);
    }
    return L;
  }
  return { moon, mars, forSite, sunAt, describe, hh };
})();
