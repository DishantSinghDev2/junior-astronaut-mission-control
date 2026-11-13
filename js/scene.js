/*
  Hand-built SVG landscapes for the Moon base and Mars outpost.
  scene("moon") or scene("mars") returns an <svg> string.
*/
window.scene = (() => {
  // deterministic "random" so stars don't jump around between screens
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

  function stars(n, seed, maxY) {
    const r = rng(seed);
    let s = "";
    for (let i = 0; i < n; i++) {
      const x = (r() * 800).toFixed(1), y = (r() * maxY).toFixed(1), rad = (r() * 1.3 + 0.3).toFixed(2);
      const tw = r() < 0.18 ? ` class="tw" style="animation-delay:${(r() * 4).toFixed(2)}s"` : "";
      s += `<circle cx="${x}" cy="${y}" r="${rad}" fill="#fff" opacity="${(r() * 0.6 + 0.3).toFixed(2)}"${tw}/>`;
    }
    return s;
  }

  function base(x, y, c) {
    // c = palette for the habitat
    return `
    <g transform="translate(${x} ${y})">
      <!-- solar array -->
      <g transform="translate(-150 -8)">
        ${[0, 46, 92].map(dx => `
          <line x1="${dx + 18}" y1="0" x2="${dx + 18}" y2="-26" stroke="${c.metal}" stroke-width="3"/>
          <g transform="translate(${dx} -52) skewX(-14)">
            <rect width="40" height="26" rx="2" fill="${c.panel}"/>
            <path d="M0 9h40M0 17h40M13 0v26M27 0v26" stroke="${c.panelLine}" stroke-width="1.2"/>
            <rect width="40" height="26" rx="2" fill="url(#shine)" opacity=".5"/>
          </g>`).join("")}
      </g>
      <!-- tunnel + module -->
      <rect x="-30" y="-26" width="70" height="20" rx="10" fill="${c.hull2}"/>
      <rect x="30" y="-40" width="74" height="34" rx="17" fill="${c.hull}"/>
      <rect x="44" y="-30" width="12" height="9" rx="3" fill="#FFC23D" class="glow"/>
      <rect x="62" y="-30" width="12" height="9" rx="3" fill="#FFC23D" class="glow"/>
      <rect x="80" y="-30" width="12" height="9" rx="3" fill="#FFC23D" opacity=".5"/>
      <!-- dome -->
      <path d="M-78 -6 a52 52 0 0 1 104 0z" fill="${c.hull}"/>
      <path d="M-78 -6 a52 52 0 0 1 104 0z" fill="url(#domeShade)"/>
      <path d="M-62 -6 a36 36 0 0 1 72 0" stroke="${c.rib}" stroke-width="3" fill="none"/>
      <path d="M-26 -58 v52" stroke="${c.rib}" stroke-width="3"/>
      <circle cx="-44" cy="-30" r="7" fill="#FFC23D" class="glow"/>
      <circle cx="-8" cy="-30" r="7" fill="#FFC23D" class="glow"/>
      <rect x="-34" y="-20" width="16" height="14" rx="3" fill="${c.rib}"/>
      <!-- antenna -->
      <line x1="96" y1="-40" x2="104" y2="-78" stroke="${c.metal}" stroke-width="3"/>
      <path d="M86 -86 a22 22 0 0 0 34 18z" fill="${c.hull}"/>
      <circle cx="104" cy="-80" r="3" fill="#FF5D5D" class="blink"/>
      <!-- ground shadow -->
      <ellipse cx="-10" cy="-4" rx="190" ry="7" fill="#000" opacity=".22"/>
    </g>`;
  }

  function rover(x, y, body, wheel) {
    // outer <g> places the rover; inner <g> is animated (a CSS transform would replace the SVG one)
    return `<g transform="translate(${x} ${y})"><g class="rover">
      <rect x="-22" y="-20" width="44" height="12" rx="4" fill="${body}"/>
      <line x1="12" y1="-20" x2="16" y2="-34" stroke="${body}" stroke-width="3"/>
      <rect x="10" y="-40" width="14" height="8" rx="2" fill="${body}"/>
      <circle cx="-15" cy="-4" r="6" fill="${wheel}"/><circle cx="0" cy="-4" r="6" fill="${wheel}"/><circle cx="15" cy="-4" r="6" fill="${wheel}"/>
    </g></g>`;
  }

  const defs = `
    <defs>
      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="domeShade" x1="0" y1="0" x2="1" y2="0"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
      <radialGradient id="earthGlow"><stop offset=".6" stop-color="#4CC3FF" stop-opacity=".45"/><stop offset="1" stop-color="#4CC3FF" stop-opacity="0"/></radialGradient>
      <radialGradient id="sunGlow"><stop offset="0" stop-color="#FFF4D6" stop-opacity=".9"/><stop offset=".25" stop-color="#FFE3A3" stop-opacity=".5"/><stop offset="1" stop-color="#FFB36B" stop-opacity="0"/></radialGradient>
      <linearGradient id="marsSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B1036"/><stop offset=".55" stop-color="#6B2B4A"/><stop offset="1" stop-color="#E07A4F"/></linearGradient>
      <linearGradient id="moonSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D0A24"/><stop offset="1" stop-color="#231B57"/></linearGradient>
      <clipPath id="earthClip"><circle cx="0" cy="0" r="34"/></clipPath>
    </defs>`;

  function moon() {
    const c = { hull: "#EEEAFF", hull2: "#CFC8F2", rib: "#B5ACE6", metal: "#8F88C2", panel: "#2B3FA8", panelLine: "#6D82F0" };
    return `<svg class="scene" viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" role="img" aria-label="A Moon base with solar panels. Earth hangs in the black sky.">
      ${defs}
      <rect width="800" height="360" fill="url(#moonSky)"/>
      ${stars(110, 7, 250)}
      <g transform="translate(690 74)">
        <circle r="70" fill="url(#earthGlow)"/>
        <g clip-path="url(#earthClip)">
          <circle r="34" fill="#2F7BFF"/>
          <path d="M-30 -12c8-10 22-8 26 2s-4 14 2 22-10 16-20 8-16-24-8-32z" fill="#4FD18B"/>
          <path d="M6 -30c10 2 22 10 24 20s-10 4-14 12-12-4-10-14-8-16 0-18z" fill="#4FD18B"/>
          <path d="M-20 -28c10-6 30-4 36 0" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
          <path d="M-6 22c10 0 20-4 26-10" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
          <circle cx="16" cy="6" r="38" fill="#0D0A24" opacity=".45"/>
        </g>
      </g>
      <path d="M0 250 Q120 205 240 232 T470 222 T800 238 V360 H0z" fill="#3A3570"/>
      <path d="M0 282 Q160 252 330 270 T640 262 T800 276 V360 H0z" fill="#5C578F"/>
      <ellipse cx="560" cy="300" rx="46" ry="8" fill="#4A4580"/>
      <ellipse cx="150" cy="292" rx="30" ry="6" fill="#4A4580"/>
      ${base(350, 282, c)}
      ${rover(620, 300, "#EEEAFF", "#2B2560")}
      <path d="M0 316 Q200 300 420 312 T800 306 V360 H0z" fill="#8984BD"/>
      <ellipse cx="250" cy="334" rx="58" ry="10" fill="#736EA8"/>
      <ellipse cx="250" cy="331" rx="46" ry="6" fill="#6560A0"/>
      <ellipse cx="690" cy="342" rx="34" ry="7" fill="#736EA8"/>
    </svg>`;
  }

  function mars() {
    const c = { hull: "#FFF1E6", hull2: "#F2CDB5", rib: "#E3A98A", metal: "#9C5A4A", panel: "#2B3FA8", panelLine: "#6D82F0" };
    return `<svg class="scene" viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" role="img" aria-label="A Mars outpost on red dunes under a dusty orange sky.">
      ${defs}
      <rect width="800" height="360" fill="url(#marsSky)"/>
      ${stars(60, 11, 120)}
      <circle cx="170" cy="150" r="60" fill="url(#sunGlow)"/>
      <circle cx="170" cy="150" r="9" fill="#FFF4D6"/>
      <circle cx="600" cy="60" r="5" fill="#C9A99A"/>
      <circle cx="680" cy="96" r="3" fill="#C9A99A"/>
      <path d="M0 230 L90 196 L150 214 L240 170 L330 220 L420 206 L520 230 L620 190 L720 222 L800 210 V360 H0z" fill="#8A3A3E"/>
      <path d="M0 270 Q150 236 300 258 T600 248 T800 262 V360 H0z" fill="#B5503F"/>
      ${base(380, 280, c)}
      ${rover(620, 298, "#FFF1E6", "#5A2430")}
      <path d="M0 304 Q180 286 400 300 T800 294 V360 H0z" fill="#D9714A"/>
      <path d="M0 336 Q240 318 520 332 T800 330 V360 H0z" fill="#EB8A5C"/>
      <ellipse cx="140" cy="318" rx="16" ry="7" fill="#A8483A"/>
      <ellipse cx="520" cy="344" rx="22" ry="8" fill="#C45E43"/>
      <ellipse cx="720" cy="314" rx="10" ry="5" fill="#A8483A"/>
    </svg>`;
  }

  return place => (place === "mars" ? mars() : moon());
})();

/* Planet globes for the base-picker cards */
window.planet = function (place) {
  if (place === "mars") return `<svg class="globe" viewBox="0 0 120 120" aria-hidden="true">
    <clipPath id="clipMars"><circle cx="60" cy="60" r="56"/></clipPath><g clip-path="url(#clipMars)">
    <circle cx="60" cy="60" r="56" fill="#E0704A"/>
    <path d="M8 46c20 6 40-4 60 2s30 6 46 0" stroke="#B9503A" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M10 76c24-4 40 6 64 0s24-4 36 2" stroke="#C85E42" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="60" cy="9" rx="20" ry="5" fill="#FFF1E6" opacity=".9"/>
    <circle cx="40" cy="62" r="5" fill="#B9503A"/>
    <circle cx="78" cy="34" r="3" fill="#B9503A"/>
    <circle cx="78" cy="74" r="56" fill="#1B1036" opacity=".35" transform="translate(16 12)"/></g></svg>`;
  return `<svg class="globe" viewBox="0 0 120 120" aria-hidden="true">
    <clipPath id="clipMoon"><circle cx="60" cy="60" r="56"/></clipPath><g clip-path="url(#clipMoon)">
    <circle cx="60" cy="60" r="56" fill="#CFCBEA"/>
    <circle cx="40" cy="44" r="12" fill="#ADA8D6"/><circle cx="40" cy="44" r="8" fill="#9C97CA"/>
    <circle cx="78" cy="76" r="15" fill="#ADA8D6"/><circle cx="78" cy="76" r="10" fill="#9C97CA"/>
    <circle cx="80" cy="34" r="6" fill="#ADA8D6"/><circle cx="36" cy="84" r="7" fill="#ADA8D6"/>
    <circle cx="94" cy="86" r="56" fill="#0D0A24" opacity=".35"/></g></svg>`;
};
