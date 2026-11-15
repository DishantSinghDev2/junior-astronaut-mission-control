# 🚀 Lunar Outpost

**Team Pheonix · NASA Space Apps Challenge 2026 · Challenge: "Build a Junior Astronaut Mission Trainer"**

**Play it:** https://dishantsinghdev2.github.io/junior-astronaut-mission-control/

A browser game for kids aged 7–12. You walk an astronaut around a base on the **Moon** or **Mars** for 8 days.
Fix machines, clean dusty solar panels, grow food, collect rocks, and run to the storm shelter when a **real NASA solar storm** is coming.
No download, no login. Works with a keyboard, a mouse, or touch.

---

## 🎮 How to play

A short cinematic story (narrated, with music) plays first, then you pick **Moon or Mars**, spin a **3D globe** to choose a **real landing site**, and land.

You control an astronaut in a **third-person 3D world**: a black Moon sky with stars and a real Earth map (or a butterscotch Mars sky), a low harsh sun with long shadows, real rocky ground textures and metal reflections. Buildings between the camera and you turn see-through.

| Action | Keyboard | Mouse / touch |
|---|---|---|
| Move | W A S D / arrow keys (relative to the camera) | Click/tap the ground (it finds a path around buildings) · on phones drag the left half |
| Look around | Drag with the mouse · Q / R · mouse wheel zooms | Drag the right half of the screen |
| Use / drive / exit rover | E or Enter | Big orange USE button |
| Jump (real Moon / Mars gravity) | Space | JUMP button |
| Quick chat in a squad | 1 2 3 4 | Emoji buttons |
| Pick which task the arrow points to | — | Tap a task in the list |

Keep **Life Support**, **Power** and **Shielding** above zero for 8 sols (90 seconds each).

Each sol has a **task list**, like a mission checklist: scrub dusty solar panels (drag mini-game), repair wiring (wire mini-game), harvest the greenhouse, collect glowing rock samples, study them in the Lab, beam data home from the Radio Dish, and **drive the rover** to far outposts (Weather Station, Ice Drill, Relay Tower, Old Lander). When a **real NASA solar storm** is coming, run into the **Storm Shelter** dome.

## 🛰️ How NASA data is used *in the gameplay*

| NASA data | What it does in the game |
|---|---|
| **DONKI CME API** (live, last 60 days) + an archived copy of the big 2024–25 storms | Every solar storm is a **real Coronal Mass Ejection**. Its **speed** sets the strength (level 1–3, +1 if DONKI linked a radiation storm/SEP). Speed ÷ distance (1 AU for the Moon, 1.52 AU for Mars) = real travel time. **1 real hour = 0.5 game seconds**, so a fast real CME gives you less time to reach the shelter. |
| **Sun Watch** (the red Alert button) | An interactive chart of real DONKI CMEs. Drag a time slider and watch them travel at their measured speeds; see when each one passes the Moon and Mars; tap one for its date, speed and DONKI link. |
| **Gravity** (NASA fact sheets) | Jump physics use real gravity: Moon 1.62 m/s², Mars 3.71 m/s². Moon jumps go about 2.3× higher and float longer. |
| **Radio delay** | Moon: 1.3 s. Mars: estimated for **today's real Earth–Mars distance** from planet orbits. Asking Mission Control on Mars makes you wait that many seconds (1 real minute = 1 game second) while your base keeps running. |
| **Sunlight** | Mars gets ~43% of Earth's sunlight, so the Mars base makes less power and gets dustier (Opportunity, 2018). |
| **Mission facts** | Event cards cite real NASA findings: ISS water recycling, Veggie, Apollo dust, LCROSS ice, Artemis south pole, MOXIE, Phoenix perchlorate. |
| **OSDR** | Not used yet (shown honestly as "Game simulation" on the sources page). Next step: radiation dosimetry for crew health. |

Every storm card shows whether its data is **Live** or **Archived**. Game numbers (meter rates) are simplified for play.

### Refreshing the archived NASA data
```bash
python3 tools/fetch_donki_archive.py YOUR_KEY
```
DONKI allows at most 60 days per request. The FLR (flare) endpoint returned 404 in Nov 2026, so we use CMEs (with linked SEP events).

### API key
`js/config.js` holds the team's free api.nasa.gov key. It's visible in the page source; that's normal for NASA open-data keys, which only control rate limits. If it stops working, use `DEMO_KEY` or a new free key.

## ▶️ Running locally
```bash
node tools/serve.js
```
Then open http://localhost:8080.

## 🔁 Updating the live site
Bump the `?v=` number on the script and style links in `index.html` (e.g. `?v=4` → `?v=5`), then commit and push. GitHub Pages caches files for 10 minutes.

## 📁 Files
```
index.html              page shell (menus, game view, modals)
css/style.css           design from the team's UI PDF (navy cards, Fredoka, orange buttons)
js/config.js            API key + mission settings
js/data-events.js       places, decision cards, facts, glossary  ← edit to add content
js/world.js             3D world (three.js): models, animation, camera, pathfinding, minimap
js/game.js              rules, tasks, storms, events, story cutscene, HUD and screens
js/globe.js             3D landing-site globe
js/minigames.js         panel-scrub and wire-repair mini-games
js/audio.js             ElevenLabs narration/music + sound effects
assets/                 3D models, planet maps, audio (see assets/CREDITS.md)
js/sunwatch.js          interactive NASA CME radar
js/donki.js             live DONKI loader + Mars radio-delay calculator
js/donki-archive.js     archived real DONKI data
tools/                  archive fetcher + tiny local server
```

---
Made by Team Pheonix with AI-assisted coding. Every team member should read, test, and understand the code before submitting. Not an official NASA product.

## Tutorial video

`assets/video/how-to-play.mp4` (1 min 07 s, 1280x720) is a narrated how-to-play video. Its footage is rendered by the game's own 3D engine; the callouts are drawn on top, and the voice-over is ElevenLabs (Atlas). It opens from the title menu: **Watch tutorial**.

## New in this version

- **Jump** with the real gravity of the place (Moon 1/6 g, Mars 0.38 g): small rocks can be hopped over.
- **Gains and losses** are always visible: floating +/- numbers, rising/falling arrows on the meters, a red flash on damage, a "Gained and lost" ledger at the end and a "Why you lost" tip.
- **Mission spots** (Weather Station, Ice Drill, Relay Tower, Old Lander) have light beacons, a discovery card that shows reward and cost, and real logic: the Weather Station turns real DONKI data into a **storm forecast** (+8 s warning), the Ice Drill costs power, the Relay gives early warnings.
- **Coach tips** walk a new player through move, look, jump, use and the meters (skippable).
- **My astronaut**: pick a suit colour and call sign (saved).
- **Squad lobby and multiplayer** (up to 4): create a squad, share the 5-letter code, see each other, 4 preset chat lines, same storm schedule. Uses PeerJS (MIT) and its free public relay; only call sign, colour and position are shared.
- **BGMI-style start**: lobby, countdown and a drop-pod descent with an altitude read-out, then touchdown.
- **New ElevenLabs music**: lobby, exploration, storm and drop tracks, with separate music / effects volume sliders.
- A small **watermark** (Lunar Outpost · Team Pheonix) on every screen.

## Update: realism, long missions and languages

- **Real NASA hardware**: Apollo Lunar Module (and Viking lander on Mars) for the landing, Perseverance as the rover, the Habitat Demonstration Unit as the science lab, a Deep Space Network 34 m antenna as the radio dish, Ingenuity on Mars. See `assets/CREDITS.md`.
- **New landing**: your lander descends with a plume, kicks up dust and stays on the ground as your landing pad.
- **Long missions**: choose Short (8), Standard (14) or Expedition (24) sols. Life gets a little harder every sol, later sols have 4-5 tasks, chapters mark the story, and **Research and upgrades** (spend science after each sol) keep long runs interesting. 9 more real-fact events (22 total).
- **Auto-save and Continue**: the title screen offers "Continue" with your sol number.
- **Languages**: English and Hindi (हिन्दी). Switch from the title menu or Settings. Add a language by writing `js/lang-xx.js` (see `js/lang-hi.js`). Story narration and the longer event paragraphs stay in English for now.
- Fix: an invisible damage-flash overlay had blocked mouse and touch input.
