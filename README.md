# 🚀 Junior Astronaut – Mission Control

**Team Pheonix · NASA Space Apps Challenge 2026 · Challenge: "Build a Junior Astronaut Mission Trainer"**

A browser game for kids aged 7–12. You run a base on the **Moon** or **Mars** for 8 days (sols).
Every day you solve one problem and share a small amount of power between 5 systems.
Every choice has a benefit **and** a cost. Solar storms in the game come from **real NASA DONKI space-weather records**.

No download, no login, no account. It works in any modern browser, on phones too.

---

## ▶️ How to run it

| Way | Steps |
|---|---|
| **Quickest** | Double-click `index.html`. (Live NASA data may be blocked from `file://`; the game then uses the archived NASA data.) |
| **Local server** (best for testing) | `node tools/serve.js` → open http://localhost:8080 |
| **GitHub Pages** (for judges) | Push this folder to a GitHub repo → *Settings → Pages → Deploy from branch → main / root*. Your link will be `https://<username>.github.io/<repo>/` |

## 🎮 How the game works

Each day has 4 steps:

1. **Morning briefing**: messages from Earth, late answers, surprise storms.
2. **Event card**: a problem with 2–3 choices. Each choice shows ✅ what's good and ⚠️ what it costs.
3. **Power plan**: share the day's ⚡ between Life Support, Greenhouse, Radiation Shield, Radio and Science Lab. Unused power charges the battery.
4. **Day report**: every change in the meters, and why it happened.

Only **3 meters** are shown (NASA's advice: 2–3 core resources work better than 5–6):
🫁 Air & Water · 🥕 Food · ❤️ Crew Health. If one reaches 0, the mission ends (the crew flies home safely).

**Stars:** ⭐ survive 8 days · ⭐ send 100+ science data to Earth · ⭐ finish with every meter ≥ 40.

## 🧩 How the 5 NASA mission constraints are gameplay (not just labels)

| Constraint | What the player actually does |
|---|---|
| **Life support** | Life Support needs 3 ⚡ per day. Less → air & water drops 8 per missing ⚡. Events: water recycler clog, air leak, MOXIE oxygen maker (Mars). |
| **Radiation shielding** | Daily radiation (Moon 2, Mars 1, because Mars' thin air blocks a little). Each shield ⚡ blocks 1 point and 20% of a storm. Storm choices: shelter (no science), keep working (more science, more radiation), or use battery for shields. |
| **Power budgeting** | ~8–9 ⚡ per day, but the basics already cost 6. Every ⚡ given to one system is taken from another. Dust storms, lunar shadows, and dusty panels cut power. Battery saves power for bad days. |
| **Food production** | The crew eats 10 food per day; each greenhouse ⚡ grows 5. Events: mold, perchlorate soil (Mars), supply rocket choice. |
| **Communication delay** | Moon: answers from Earth arrive in 1.3 s, so "Ask Mission Control" fixes problems the same day. Mars: messages take minutes each way (estimated for the real date), so expert help comes **next sol** while the problem keeps hurting. The radio also needs power: no radio = no storm warnings, and science that never reaches Earth doesn't count. |

**Replayability:** random event order, random storm days, different real NASA storms each game, two bases with different rules.

## 🛰️ NASA data used

| Source | How it's used | Live or static? |
|---|---|---|
| **DONKI CME API** (`api.nasa.gov/DONKI/CME`) | Real Coronal Mass Ejections become the game's solar storms (each mission: 1 live CME + 1 archived big storm from the 2024–25 solar maximum). CME **speed** sets storm level (<1000 km/s = 1, 1000–1999 = 2, ≥2000 = 3), and a **linked SEP event** (radiation storm) adds +1. Speed is also used to show how many hours the CME would take to reach the Moon or Mars. | **Live** (last 60 days) when possible. Otherwise the **archived** copy in `js/donki-archive.js`. Every storm card shows a 🟢 LIVE or 🗄️ ARCHIVED badge. |
| **NASA planetary facts** | Moon/Mars light delay, sol length, gravity, Mars' 43% sunlight → power differences between bases. Mars delay is estimated from Earth and Mars orbits for today's date. | Static facts |
| **NASA mission findings** | Each event card shows a true fact plus its source (ISS water recycling, Veggie, Apollo dust, LCROSS ice, Artemis south pole, Opportunity dust storm, MOXIE, Phoenix perchlorate). | Static facts |
| **OSDR** | *Not used yet.* Next step: use radiation dosimetry / astronaut health data to tune the Crew Health meter. | — |

Simplification we tell players about: a real CME only hits a planet if it is aimed that way. The game asks "what if a storm this strong hit our base?"

Game numbers (like "10 food per day") are simplified for play. We never present them as NASA statistics.

### Refreshing the archived NASA data
```bash
python3 tools/fetch_donki_archive.py            # uses DEMO_KEY (only ~10 requests/hour)
python3 tools/fetch_donki_archive.py YOUR_KEY   # free key from https://api.nasa.gov
```
Note: DONKI allows at most **60 days per request**. In Nov 2026 the DONKI **FLR (flare)** endpoint on api.nasa.gov returned 404 errors, so we use the **CME** endpoint, with SEP links taken from each CME's linked events.

### API key
`js/config.js` uses `DEMO_KEY` (about 10 requests per hour). For the demo, get a free key at https://api.nasa.gov (1,000/hour) and paste it into `js/config.js`.
Live results are cached for 1 hour in the browser tab, so each player uses only 1 request.

## 📁 Files

```
index.html               page structure
css/style.css            look and feel (kid-friendly, big buttons, works on phones)
js/config.js             API key + mission settings
js/icons.js              icon set (Lucide, ISC license)
js/scene.js              hand-drawn SVG Moon/Mars base illustrations
js/data-events.js        all events, choices, facts, glossary (edit this to add content!)
js/donki.js              NASA DONKI loader + Mars radio-delay calculator
js/donki-archive.js      archived real DONKI data (made by the tool below)
js/game.js               game rules and screens
tools/fetch_donki_archive.py   saves real DONKI data for offline use
tools/serve.js           tiny local web server for testing
```

## 🎨 Design
Flat illustrated space art (hand-built SVG scenes, no image files), tactile "press-down" buttons, ring gauges and mono "mission console" readouts.
Fonts: Bricolage Grotesque (headings), Nunito (body), Space Mono (data), from Google Fonts. Icons: [Lucide](https://lucide.dev) (ISC license).

## ♿ Accessibility
Simple English · tap any underlined word for a kid-friendly explanation · 🔊 Read-aloud button (uses the browser's voice) · big buttons and keyboard support · works on phones · respects "reduce motion".

## ✏️ How to add a new event
Open `js/data-events.js`, copy one event block, and change the text and `effects`. The list of effect keys is at the top of the file. Make sure **every choice has a cost**: NASA asks for no "free" safe option.

---
Made by Team Pheonix with AI-assisted coding. Every team member should read, test, and understand the code before submitting. Not an official NASA product.
