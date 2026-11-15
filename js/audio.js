/*
  SOUND — ElevenLabs narration + music (files in assets/audio), plus small UI sound effects
  made with the Web Audio API (no files needed). Voice lines duck the music while they play.
*/
window.Sound = (() => {
  const FILES = {
    intro: "assets/audio/intro.mp3",
    lobby: "assets/audio/music-lobby.mp3",
    drop: "assets/audio/music-drop.mp3",
    explore: "assets/audio/music-explore.mp3",
    storm: "assets/audio/music-storm.mp3",
    "vo-storm": "assets/audio/vo-storm.mp3",
    "vo-morning": "assets/audio/vo-morning.mp3",
    "vo-win": "assets/audio/vo-win.mp3",
    "vo-lose": "assets/audio/vo-lose.mp3",
    "vo-stormover": "assets/audio/vo-stormover.mp3"
  };
  let muted = false;
  try { muted = localStorage.getItem("lo-muted") === "1"; } catch (e) {}
  const els = {};
  let current = null, musicVol = 0.32, sfxVol = 0.9, voiceEl = null, ac = null;
  try { const m = parseFloat(localStorage.getItem("lo-mvol")), v = parseFloat(localStorage.getItem("lo-svol")); if (m >= 0) musicVol = m; if (v >= 0) sfxVol = v; } catch (e) {}

  function el(name) {
    if (!els[name]) { const a = new Audio(FILES[name]); a.preload = "auto"; els[name] = a; }
    return els[name];
  }
  function fade(a, to, ms = 900) {
    if (!a) return;
    const from = a.volume, t0 = performance.now();
    clearInterval(a._fade);
    a._fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(a._fade); if (to === 0) a.pause(); }
    }, 40);
  }
  function music(name) {
    if (current === name) return;
    const prev = current && el(current);
    current = name;
    if (prev) fade(prev, 0);
    if (!name || muted) return;
    const a = el(name); a.loop = name !== "drop"; a.currentTime = name === "drop" ? 0 : a.currentTime; a.volume = 0;
    a.play().then(() => fade(a, voiceEl ? musicVol * 0.35 : musicVol)).catch(() => {});
  }
  function voice(name, onEnd) {
    if (muted) { onEnd && setTimeout(onEnd, 10); return null; }
    if (voiceEl) { voiceEl.pause(); }
    const a = el(name); a.currentTime = 0; a.volume = 1; voiceEl = a;
    if (current) fade(el(current), musicVol * 0.35, 300);
    a.onended = () => { if (voiceEl === a) voiceEl = null; if (current && !muted) fade(el(current), musicVol, 700); onEnd && onEnd(); };
    a.play().catch(() => { voiceEl = null; onEnd && onEnd(); });
    return a;
  }
  function stopVoice() { if (voiceEl) { voiceEl.pause(); voiceEl = null; if (current && !muted) fade(el(current), musicVol, 500); } }

  // ---- synth sound effects ----
  function ctx() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ac; }
  function tone(f, dur, type = "sine", vol = 0.12, slide = 0, delay = 0) {
    const c = ctx(); if (!c || muted) return; vol *= sfxVol;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const SFX = {
    click: () => tone(660, 0.08, "triangle", 0.08),
    pick: () => { tone(880, 0.09, "triangle", 0.1); tone(1320, 0.12, "triangle", 0.08, 0, 0.07); },
    done: () => { tone(523, 0.12, "triangle", 0.1); tone(659, 0.12, "triangle", 0.1, 0, 0.1); tone(784, 0.2, "triangle", 0.1, 0, 0.2); },
    task: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "square", 0.05, 0, i * 0.09)); },
    alarm: () => { for (let i = 0; i < 3; i++) { tone(880, 0.18, "sawtooth", 0.06, -200, i * 0.35); tone(660, 0.18, "sawtooth", 0.05, -150, i * 0.35 + 0.18); } },
    error: () => tone(180, 0.25, "square", 0.07, -60),
    door: () => tone(220, 0.3, "sine", 0.09, 220),
    engine: () => tone(110, 0.4, "sawtooth", 0.04, 60),
    wire: () => tone(1000, 0.06, "square", 0.05),
    gain: () => { tone(740, 0.1, "triangle", 0.06); tone(988, 0.14, "triangle", 0.05, 0, 0.07); },
    loss: () => { tone(220, 0.22, "sawtooth", 0.05, -90); },
    thrust: () => { const c = ctx(); if (!c || muted) return; const len = c.sampleRate * 5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let lp = 0; for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.06; d[i] = lp * 3; }
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = buf; f.type = "lowpass"; f.frequency.value = 420; const t0 = c.currentTime; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 * sfxVol, t0 + 0.8); g.gain.setValueAtTime(0.5 * sfxVol, t0 + 3.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.9); s.connect(f).connect(g).connect(c.destination); s.start(t0); },
    jump: () => { tone(300, 0.28, "sine", 0.1, 420); tone(620, 0.2, "triangle", 0.05, 300, 0.05); },
    land: () => { tone(140, 0.14, "sine", 0.12, -60); tone(90, 0.2, "triangle", 0.08, -30, 0.02); }
  };
  function sfx(n) { try { SFX[n] && SFX[n](); } catch (e) {} }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem("lo-muted", m ? "1" : "0"); } catch (e) {}
    if (m) { Object.values(els).forEach(a => a.pause()); voiceEl = null; }
    else if (current) { const n = current; current = null; music(n); }
  }
  function unlock() { const c = ctx(); if (c && c.state === "suspended") c.resume(); }

  function setMusicVol(v) { musicVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem("lo-mvol", musicVol); } catch (e) {} if (current && !muted) { const a = el(current); a.volume = voiceEl ? musicVol * 0.35 : musicVol; } }
  function setSfxVol(v) { sfxVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem("lo-svol", sfxVol); } catch (e) {} }
  return { setMusicVol, setSfxVol, get musicVol() { return musicVol; }, get sfxVol() { return sfxVol; }, music, voice, stopVoice, sfx, setMuted, get muted() { return muted; }, unlock, el };
})();
