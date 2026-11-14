/* Squad play: browsers connect directly (WebRTC) through PeerJS's free public broker.
   No account, no chat text: only a call sign, a suit colour, positions and 4 preset quick-chat lines are shared. */
window.MP = (function () {
  const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", PRE = "lop-";
  let peer = null, role = "off", code = "", myId = "", info = { name: "Commander", suit: 0xff6b35 }, hostConn = null;
  const conns = new Map(), roster = [], H = {};
  const on = (t, f) => ((H[t] = H[t] || []).push(f));
  const emit = (t, d) => (H[t] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });
  const mkCode = () => Array.from({ length: 5 }, () => CH[Math.floor(Math.random() * CH.length)]).join("");
  const available = () => typeof window.Peer === "function";

  function setRoster(list) { roster.length = 0; list.forEach(p => roster.push(p)); emit("roster", roster); }
  function bcast(msg, except) { conns.forEach((c, id) => { if (id !== except && c.open) c.send(msg); }); }
  function reset() { try { peer && peer.destroy(); } catch (e) {} peer = null; conns.clear(); hostConn = null; role = "off"; code = ""; myId = ""; setRoster([]); }

  function host(i, cb) {
    if (!available()) return cb("Multiplayer library did not load. Check your connection.");
    reset(); info = i; let tries = 0;
    const attempt = () => {
      code = mkCode();
      peer = new window.Peer(PRE + code.toLowerCase());
      peer.on("open", id => { role = "host"; myId = id; setRoster([{ id, name: info.name, suit: info.suit, host: true }]); cb(null, code); });
      peer.on("error", e => { if (e.type === "unavailable-id" && tries++ < 4) { try { peer.destroy(); } catch (x) {} attempt(); } else cb("Could not open a squad (" + (e.type || e) + ").", null); });
      peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });
      peer.on("connection", c => {
        if (conns.size >= 3) { c.on("open", () => { c.send({ t: "full" }); setTimeout(() => c.close(), 300); }); return; }
        c.on("open", () => conns.set(c.peer, c));
        c.on("data", m => hostData(c, m));
        c.on("close", () => dropPeer(c.peer)); c.on("error", () => dropPeer(c.peer));
      });
    };
    attempt();
  }
  function hostData(c, m) {
    if (!m || !m.t) return;
    if (m.t === "hello") {
      const p = { id: c.peer, name: String(m.info.name || "Astronaut").slice(0, 14), suit: m.info.suit | 0 };
      if (!roster.some(r => r.id === p.id)) roster.push(p);
      bcast({ t: "roster", list: roster }); emit("roster", roster);
    } else if (m.t === "state") { emit("state", { id: c.peer, s: m.s }); bcast({ t: "state", id: c.peer, s: m.s }, c.peer); }
    else if (m.t === "say") { emit("say", { id: c.peer, k: m.k }); bcast({ t: "say", id: c.peer, k: m.k }, c.peer); }
    else if (m.t === "suit") { const r = roster.find(x => x.id === c.peer); if (r) { r.suit = m.suit | 0; bcast({ t: "roster", list: roster }); emit("roster", roster); } }
  }
  function dropPeer(id) { conns.delete(id); const i = roster.findIndex(r => r.id === id); if (i >= 0) { roster.splice(i, 1); bcast({ t: "roster", list: roster }); emit("roster", roster); emit("left", id); } }

  function join(c0, i, cb) {
    if (!available()) return cb("Multiplayer library did not load. Check your connection.");
    reset(); info = i; code = c0.toUpperCase().trim(); let done = false;
    const fin = err => { if (done) return; done = true; if (err) { reset(); cb(err); } else cb(null); };
    peer = new window.Peer();
    peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });
    const to = setTimeout(() => fin("No squad found with that code."), 9000);
    peer.on("error", e => { clearTimeout(to); fin(e.type === "peer-unavailable" ? "No squad found with that code." : "Connection problem (" + (e.type || e) + ")."); });
    peer.on("open", id => {
      myId = id; const c = peer.connect(PRE + code.toLowerCase(), { reliable: true }); hostConn = c;
      c.on("open", () => { role = "guest"; c.send({ t: "hello", info }); clearTimeout(to); fin(null); });
      c.on("data", guestData);
      c.on("close", () => { if (role === "guest") { reset(); emit("closed", "The host left the squad."); } });
    });
  }
  function guestData(m) {
    if (!m || !m.t) return;
    if (m.t === "roster") setRoster(m.list);
    else if (m.t === "state") emit("state", { id: m.id, s: m.s });
    else if (m.t === "say") emit("say", { id: m.id, k: m.k });
    else if (m.t === "start") emit("start", m);
    else if (m.t === "full") { reset(); emit("closed", "That squad is full (4 players)."); }
  }
  function sendState(s) { if (role === "host") bcast({ t: "state", id: myId, s }); else if (role === "guest" && hostConn && hostConn.open) hostConn.send({ t: "state", s }); }
  function say(k) { emit("say", { id: myId, k }); if (role === "host") bcast({ t: "say", id: myId, k }); else if (role === "guest" && hostConn && hostConn.open) hostConn.send({ t: "say", k }); }
  function start(msg) { if (role === "host") bcast(Object.assign({ t: "start" }, msg)); }
  function setSuit(c) { info.suit = c; const me = roster.find(r => r.id === myId); if (me) me.suit = c; if (role === "host") bcast({ t: "roster", list: roster }); else if (role === "guest" && hostConn && hostConn.open) hostConn.send({ t: "suit", suit: c }); emit("roster", roster); }
  return { host, join, leave: reset, sendState, say, start, setSuit, on, get role() { return role; }, get code() { return code; }, get id() { return myId; }, get roster() { return roster; }, get ready() { return available(); } };
})();
