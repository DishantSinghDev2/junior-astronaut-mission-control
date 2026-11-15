/* AI-assisted: this file was written with help from Claude (Anthropic), directed and reviewed by Team Pheonix. See AI-DISCLOSURE.md. */
/* LIVE NASA IMAGES AND DATA used in the game.
   - Mars 2020 raw images feed (mars.nasa.gov): the newest pictures Perseverance sent home.
   - EPIC on DSCOVR (epic.gsfc.nasa.gov): today's picture of Earth. - SDO (sdo.gsfc.nasa.gov): today's Sun.
   - NASA Image and Video Library (images-api.nasa.gov): a real photo of each landing site.
   Pictures are shown unchanged with their credit. If a service is offline the last good answer is shown, marked "Archived".
   AI-assisted: written with help from Claude (Anthropic). */
window.NasaLive = (function () {
  const LS = "lo-nasa-cache-v2";
  const cache = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch (e) {} };
  async function jget(url, ms = 9000) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function viaCache(key, fn) {
    try { const v = await fn(); v.live = true; v.at = Date.now(); cache[key] = v; save(); return v; }
    catch (e) { const c = cache[key]; return c ? { ...c, live: false } : null; }
  }
  const mars = () => viaCache("mars2020", async () => {
    const j = await jget("https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=60&page=0&order=sol+desc&search=&&&&condition_2=1:sol:gte");
    const want = ["MCZ", "NAVCAM", "HAZCAM", "SHERLOC", "SKYCAM", "WATSON"], seen = new Set(), items = [];
    (j.images || []).forEach(im => {
      const f = im.image_files || {}, u = f.large || f.medium || f.small; if (!u || /thumbnail/i.test(u)) return;
      const cam = ((im.camera || {}).instrument || "").replace(/_(LEFT|RIGHT)$/i, "");
      if (seen.has(cam) || !want.some(w => cam.toUpperCase().includes(w))) return; seen.add(cam);
      items.push({ url: u, cam: (im.camera && (im.camera.instrument || "")) || cam, sol: im.sol, date: im.date_taken_utc, caption: im.caption || im.title || "", link: im.link || "https://mars.nasa.gov/mars2020/multimedia/raw-images/" });
    });
    if (!items.length) throw new Error("no images");
    return { sol: items[0].sol, items: items.slice(0, 3) };
  });
  const earth = () => viaCache("epic", async () => {
    const j = await jget("https://epic.gsfc.nasa.gov/api/natural"); const a = j[0]; if (!a) throw new Error("none");
    const d = a.date.split(" ")[0].split("-");
    return { url: `https://epic.gsfc.nasa.gov/archive/natural/${d[0]}/${d[1]}/${d[2]}/jpg/${a.image}.jpg`, date: a.date, caption: a.caption || "Earth, as seen by DSCOVR EPIC from a million miles away" };
  });
  const sun = () => ({ url: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg?t=" + Math.floor(Date.now() / 600000), caption: "The Sun right now, seen by NASA's Solar Dynamics Observatory (304 Å). Bright loops are where solar storms start.", live: true });
  const QUERY = { jezero: "jezero crater", gale: "gale crater mars", acidalia: "acidalia planitia", utopia: "utopia planitia", shackleton: "shackleton crater lunar south pole", tranquility: "apollo 11 tranquility base landing site" };
  const photo = id => viaCache("lib-" + id, async () => {
    const j = await jget("https://images-api.nasa.gov/search?media_type=image&q=" + encodeURIComponent(QUERY[id] || id));
    const it = (j.collection.items || []).find(i => i.links && i.links[0] && i.data && i.data[0]);
    if (!it) throw new Error("none"); const d = it.data[0];
    return { url: it.links[0].href.replace("~thumb", "~small"), title: d.title, center: d.center || "NASA", id: d.nasa_id, link: "https://images.nasa.gov/details/" + d.nasa_id };
  });
  return { mars, earth, sun, photo, cache };
})();
