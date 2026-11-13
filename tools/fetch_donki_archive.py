#!/usr/bin/env python3
"""
Save REAL NASA DONKI CME data into js/donki-archive.js, so the game still has
real solar storms when the live API cannot be reached.

Usage (from the project folder):
    python3 tools/fetch_donki_archive.py              # uses DEMO_KEY (10 requests/hour)
    python3 tools/fetch_donki_archive.py YOUR_KEY     # free key from https://api.nasa.gov

DONKI allows at most 60 days per request, so we ask for a few 60-day windows
during busy times on the Sun (solar maximum, 2024-2025).
"""
import json, sys, time, urllib.request, datetime, pathlib

KEY = sys.argv[1] if len(sys.argv) > 1 else "DEMO_KEY"
WINDOWS = [
    ("2024-05-01", "2024-06-29"),   # May 2024: the strongest geomagnetic storm in 20 years
    ("2024-09-01", "2024-10-30"),   # Oct 2024: X9.0 flare and fast CMEs
    ("2025-01-01", "2025-02-28"),
    ("2025-05-01", "2025-06-29"),
]
MIN_SPEED = 600
KEEP_PER_WINDOW = 8
OUT = pathlib.Path(__file__).resolve().parent.parent / "js" / "donki-archive.js"


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode())


storms = []
for start, end in WINDOWS:
    url = f"https://api.nasa.gov/DONKI/CME?startDate={start}&endDate={end}&api_key={KEY}"
    try:
        raw = get(url)
    except Exception as e:
        print("Skipped", start, end, "->", e)
        continue
    found = []
    for c in raw:
        analyses = c.get("cmeAnalyses") or []
        best = next((a for a in analyses if a.get("isMostAccurate")), analyses[0] if analyses else None)
        if not best or not best.get("speed") or best["speed"] < MIN_SPEED:
            continue
        linked = [e["activityID"] for e in (c.get("linkedEvents") or [])]
        found.append({
            "id": c["activityID"],
            "date": c["startTime"][:10],
            "time": c["startTime"][11:16],
            "speed": round(best["speed"]),
            "type": best.get("type", ""),
            "hasSep": any("-SEP-" in i for i in linked),
            "hasFlare": any("-FLR-" in i for i in linked),
            "link": c.get("link", ""),
        })
    found.sort(key=lambda s: -s["speed"])
    storms += found[:KEEP_PER_WINDOW]
    print(f"{start}..{end}: {len(raw)} CMEs, kept {len(found[:KEEP_PER_WINDOW])}")
    time.sleep(1)

if not storms:
    sys.exit("No data saved (API limit or network problem). Try again later or use your own API key.")

data = {
    "savedOn": datetime.date.today().isoformat(),
    "source": "NASA DONKI CME API (api.nasa.gov/DONKI/CME), archived copy",
    "storms": storms,
}
OUT.write_text(
    "/* REAL NASA DONKI data, saved by tools/fetch_donki_archive.py. This is ARCHIVED data, not live. */\n"
    "window.DONKI_ARCHIVE = " + json.dumps(data, indent=1) + ";\n"
)
print("Saved", len(storms), "storms to", OUT)
