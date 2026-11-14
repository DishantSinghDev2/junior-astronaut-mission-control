# 🚀 Lunar Outpost

**Team Pheonix · NASA Space Apps Challenge 2026 · Challenge: "Build a Junior Astronaut Mission Trainer"**

**Play it:** https://dishantsinghdev2.github.io/junior-astronaut-mission-control/

A browser game for kids aged 7–12. You walk an astronaut around a base on the **Moon** or **Mars** for 8 days.
Fix machines, clean dusty solar panels, grow food, collect rocks, and run to the storm shelter when a **real NASA solar storm** is coming.
No download, no login. Works with a keyboard, a mouse, or touch.

---

## 🎮 How to play

| Action | Keyboard | Mouse / touch |
|---|---|---|
| Walk | ← → or A D | Tap where you want to go, or the ◀ ▶ buttons |
| Jump | Space or W | Jump button |
| Work at a machine | Hold E | Hold the orange E button |

Keep **Life Support**, **Power** and **Shielding** above zero for 8 days (a day lasts one minute).

| Station | What you do there |
|---|---|
| ☀️ Solar panels (outside, left) | Dust builds up and cuts power. Hold E to clean. |
| 🫁 Life Support | Fix the water recycler when it breaks. Hold E to turn Power into Life Support. |
| 🌱 Greenhouse | Plants grow with power. Harvest when ready, or the crew goes hungry. |
| 🛡️ Shield Generator | Hold E to turn Power into Shielding. |
| 🏠 Storm Shelter | Stand here when a solar storm hits: it blocks 70% of the radiation. |
| 🔬 Science Lab | Study rocks you collected outside. |
| 📡 Radio Dish (outside, right) | Send science to Earth. Keeping in touch gives you **earlier storm warnings**. |

Once a day, a decision card appears (pick one, then Confirm). Every choice has a gain **and** a cost.
**Ask Mission Control** costs 5 Power. Their reply halves the cost of the option they recommend, but you have to wait for it.

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
js/world.js             the playable canvas world: astronaut, physics, stations, drawing
js/game.js              rules, meters, storms, events, HUD and screens
js/sunwatch.js          interactive NASA CME radar
js/donki.js             live DONKI loader + Mars radio-delay calculator
js/donki-archive.js     archived real DONKI data
js/scene.js             Moon/Mars illustrations for the destination cards
tools/                  archive fetcher + tiny local server
```

---
Made by Team Pheonix with AI-assisted coding. Every team member should read, test, and understand the code before submitting. Not an official NASA product.
