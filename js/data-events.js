/*
  LUNAR OUTPOST — game data: places, events, facts, glossary.
  Wrapped in window.GAME_DATA so the game also works when index.html is opened from disk.

  Meters (0–100): life (Life Support), power (Power), shield (Shielding), food (Greenhouse).
  Choice fields:
    fx:    { life, power, shield, food, science }  -> applied right away (shown as chips)
    task:  "recycler" | "leak" | "dust" | "samples" -> creates a job the player must walk to and do
    mod:   { solarMul, speedMul, wearMul }          -> effect for the rest of the day (or mission with forever:true)
    risk:  text chip for a danger that comes later (e.g. "Storm hits harder")
  tip: index of the choice Mission Control recommends (Ask Mission Control halves its costs).
  Text helpers: {day} = "day"/"sol", [[word]] = tappable glossary word.
*/
window.GAME_DATA = {
  places: {
    moon: {
      id: "moon", name: "The Moon", short: "Moon outpost", dayWord: "day",
      tags: ["Short radio delay", "Easier"],
      line: "The Moon is about 3 days away by rocket.",
      gravity: 1.62,          // m/s², NASA Moon fact sheet
      gravityText: "1/6 of Earth's",
      solar: 1.1,             // power per second from clean panels
      dustRate: 0.005,        // how fast dust covers panels
      facts: [
        "Radio signals take about 1.3 seconds to travel between Earth and the Moon.",
        "The Moon has no air and no global magnetic field, so nothing blocks radiation from space.",
        "Moon gravity is about 1/6 of Earth's. Try jumping — you float!",
        "Moon dust is sharp like tiny bits of glass, because there is no wind or water to smooth it.",
        "Near the Moon's south pole, some high ridges get sunlight most of the time. Artemis plans to explore there."
      ]
    },
    mars: {
      id: "mars", name: "Mars", short: "Mars outpost", dayWord: "sol",
      tags: ["Long radio delay", "Harder"],
      line: "Messages to Mars can take many minutes.",
      gravity: 3.71,
      gravityText: "38% of Earth's",
      solar: 0.86,            // Mars gets ~43% of Earth's sunlight; the outpost brought bigger panels, but it's still less than the Moon
      dustRate: 0.007,
      facts: [
        "A day on Mars is called a [[sol]]. It is 24 hours, 39 minutes and 35 seconds long.",
        "Mars gets only about 43% of the sunlight Earth gets, so solar panels make less power.",
        "Radio signals take between about 3 and 22 minutes to go one way between Earth and Mars.",
        "Mars gravity is about 38% of Earth's. You can jump higher than on Earth, but not as high as on the Moon.",
        "In 2018 a dust storm covered all of Mars, and NASA's solar-powered Opportunity rover never woke up again."
      ]
    }
  },

  events: [
    {
      id: "water_recycler", place: "both", cat: "life", tip: 0,
      title: "The water recycler is clogged!",
      text: "The machine that cleans and reuses water has stopped. Without it, Life Support goes down.",
      fact: "The Space Station recycles about 98% of its water, even sweat and urine!",
      source: "NASA, 2023 — ISS water recovery",
      choices: [
        { label: "Fix it yourself", desc: "Walk to Life Support and repair it.", fx: { science: 0 }, task: "recycler", extra: ["Task: go fix it"],
          result: "Hurry to the Life Support room and hold the action button to fix the recycler." },
        { label: "Use the backup tanks", desc: "Easy, but the tanks run low.", fx: { life: -18 },
          result: "You switched to the backup tanks. No walking needed, but your water reserve dropped." }
      ]
    },
    {
      id: "plant_mold", place: "both", cat: "food", tip: 1,
      title: "Mold in the greenhouse!",
      text: "Fuzzy mold is growing on the lettuce. Too much water and not enough moving air can cause it.",
      fact: "In 2016, astronaut Scott Kelly saved moldy zinnia flowers on the Space Station by drying them and giving them more air.",
      source: "NASA Veggie experiment",
      choices: [
        { label: "Pull out the sick plants", desc: "The mold is gone fast.", fx: { food: -22 },
          result: "You removed the moldy plants. The rest are safe, but you lost food." },
        { label: "Turn up fans and lights", desc: "Save most of the plants.", fx: { power: -14, food: -5 },
          result: "Dry air and bright lights stopped the mold. Only a few leaves were lost." }
      ]
    },
    {
      id: "battery_hot", place: "both", cat: "power", tip: 1,
      title: "A battery is overheating!",
      text: "One of the base batteries is getting too hot. Hot batteries can be dangerous.",
      fact: "Spacecraft batteries are kept at safe temperatures with heaters, radiators and fans.",
      source: "NASA spacecraft engineering",
      choices: [
        { label: "Unplug the battery", desc: "Totally safe.", fx: { power: -22 },
          result: "You unplugged it. Safe — but that stored energy is gone." },
        { label: "Cool it with Life Support fans", desc: "Keep the energy.", fx: { power: -6, life: -8 },
          result: "The fans cooled the battery, but Life Support worked extra hard." }
      ]
    },
    {
      id: "rover_find", place: "both", cat: "science", tip: 0,
      title: "The rover spotted something!",
      textMoon: "The rover's camera saw shiny frost at the edge of a dark crater. It might be water ice!",
      textMars: "The rover found layered rocks that might have formed in an ancient lake.",
      factMoon: "In 2009, NASA's LCROSS mission found water ice in a dark crater near the Moon's south pole.",
      factMars: "NASA's Perseverance rover collects rock samples in Jezero Crater, which was a lake long ago.",
      source: "NASA LCROSS / Mars 2020 Perseverance",
      choices: [
        { label: "Go collect samples", desc: "New rocks appear outside. Bring them to the lab!", fx: { power: -6 }, task: "samples", extra: ["Task: collect rocks"],
          result: "Three new samples are waiting outside, past the radio dish. Go get them!" },
        { label: "Take photos from the base", desc: "Quick and safe.", fx: { science: 4 },
          result: "Blurry photos, but scientists still learned something." }
      ]
    },
    {
      id: "supply_ship", place: "both", cat: "supply", tip: 2,
      title: "A supply rocket is coming!",
      text: "There is only room for ONE extra thing. What should it bring?",
      fact: "Every kilogram launched into space costs a lot of fuel and money, so planners choose cargo very carefully.",
      source: "NASA mission planning",
      choices: [
        { label: "Food crates", desc: "Fill the greenhouse store.", fx: { food: 30 },
          result: "Fresh food packs arrived. Everyone is happy!" },
        { label: "An extra solar panel", desc: "+20% solar power for the rest of the mission.", fx: {}, mod: { solarMul: 1.2, forever: true }, extra: ["+20% Solar forever"],
          result: "The new panel is up. More power every {day}!" },
        { label: "Radiation shield blocks", desc: "Stronger walls.", fx: { shield: 20 }, mod: { wearMul: 0.5, forever: true }, extra: ["Shield wears slower"],
          result: "The crew stacked shield blocks around the base. Safer nights!" }
      ]
    },
    {
      id: "exercise", place: "both", cat: "crew", tip: 0,
      title: "Muscles are getting weak!",
      textMoon: "In the Moon's low gravity, muscles and bones don't work as hard, so they get weaker.",
      textMars: "In Mars' low gravity, muscles and bones don't work as hard, so they get weaker.",
      fact: "Astronauts on the Space Station exercise about 2 hours every day to keep their muscles and bones strong.",
      source: "NASA Human Research Program",
      choices: [
        { label: "Exercise for 2 hours", desc: "You'll move faster today.", fx: { power: -5 }, mod: { speedMul: 1.3 }, extra: ["Faster walking today"],
          result: "Treadmill time! Your astronaut feels strong and quick." },
        { label: "Skip exercise", desc: "Save the treadmill power.", fx: {}, mod: { speedMul: 0.7 }, extra: ["Slower walking today"],
          result: "Power saved, but your astronaut feels stiff and slow today." }
      ]
    },
    {
      id: "dust", place: "moon", cat: "power", tip: 0,
      title: "Moon dust on the solar panels!",
      text: "The rover kicked up dust and it stuck to every solar panel. Dusty panels make less power.",
      fact: "Apollo astronauts found Moon dust stuck to everything — suits, tools and equipment.",
      source: "NASA Apollo missions",
      choices: [
        { label: "Go clean the panels", desc: "Walk outside and brush them off.", fx: {}, task: "dust", extra: ["Task: clean 3 panels"],
          result: "Every panel is dusty. Head out the left airlock and clean them!" },
        { label: "Leave the dust", desc: "Stay inside, stay safe.", fx: {}, task: "dust", mod: { solarMul: 0.75 }, extra: ["−25% Solar today"],
          result: "The panels stay dusty. Less power today." }
      ]
    },
    {
      id: "micrometeorite", place: "moon", cat: "life", tip: 0,
      title: "A tiny space rock hit the base!",
      text: "A rock smaller than a grain of rice made a hole in one room. Air is leaking out!",
      fact: "The Moon has no air, so even tiny space rocks (micrometeorites) hit the ground at full speed.",
      source: "NASA Moon facts",
      choices: [
        { label: "Find and patch the hole", desc: "Air leaks until you fix it.", fx: {}, task: "leak", extra: ["Task: patch the leak"],
          result: "Follow the red warning light and hold the action button to patch it!" },
        { label: "Seal that room", desc: "Quick, but the air in it is lost.", fx: { life: -16 },
          result: "You shut the hatch. The leak stopped, but some air was lost." }
      ]
    },
    {
      id: "lunar_shadow", place: "moon", cat: "power", tip: 1,
      title: "A shadow is moving over the base!",
      text: "A mountain's shadow will cover the solar panels for the rest of the day.",
      fact: "Near the Moon's south pole the Sun stays low, so mountains cast very long shadows.",
      source: "NASA Artemis",
      choices: [
        { label: "Run everything normally", desc: "Less sunlight today.", fx: {}, mod: { solarMul: 0.5 }, extra: ["−50% Solar today"],
          result: "It will be a dark, low-power day. Watch your Power meter!" },
        { label: "Dim the greenhouse lamps", desc: "Save power, plants grow slower.", fx: { food: -10 }, mod: { solarMul: 0.8 }, extra: ["−20% Solar today"],
          result: "Plants rest in the dark. You saved some power." }
      ]
    },
    {
      id: "dust_storm", place: "mars", cat: "power", tip: 1,
      title: "A dust storm is coming!",
      text: "Red dust is filling the sky and blocking the Sun. Solar panels will make much less power today.",
      fact: "In 2018 a dust storm covered ALL of Mars. NASA's solar-powered Opportunity rover went to sleep and never woke up.",
      source: "NASA Opportunity mission",
      choices: [
        { label: "Ride it out", desc: "Keep everything running.", fx: {}, task: "dust", mod: { solarMul: 0.4 }, extra: ["−60% Solar today"],
          result: "Dark skies. Your panels are dusty, too!" },
        { label: "Turn off greenhouse lamps", desc: "Save power, lose some plants.", fx: { food: -15 }, task: "dust", mod: { solarMul: 0.6 }, extra: ["−40% Solar today"],
          result: "The plants are in the dark for a while. You'll need to clean the panels afterwards." }
      ]
    },
    {
      id: "dust_devil", place: "mars", cat: "science", tip: 1,
      title: "A dust devil is spinning nearby!",
      text: "A whirlwind of dust is crossing the plain. It might blow the dust off your solar panels!",
      fact: "Wind gusts sometimes cleaned the dusty solar panels of NASA's Spirit and Opportunity rovers.",
      source: "NASA Mars Exploration Rovers",
      choices: [
        { label: "Study it from outside", desc: "Great science, but more radiation.", fx: { science: 8, shield: -6 },
          result: "Great wind measurements! The crew came back a bit dusty." },
        { label: "Let it clean the panels", desc: "All panels become clean.", fx: {}, extra: ["Panels cleaned"], clean: true,
          result: "Whoosh! The dust devil cleaned every panel." }
      ]
    },
    {
      id: "moxie", place: "mars", cat: "life", tip: 0,
      title: "Make oxygen from Mars air?",
      text: "Mars air is mostly carbon dioxide. Your oxygen maker can turn it into oxygen, but it needs lots of power.",
      fact: "MOXIE, an experiment on NASA's Perseverance rover, made 122 grams of oxygen from Mars air.",
      source: "NASA Perseverance MOXIE, 2023",
      choices: [
        { label: "Run the oxygen maker", desc: "Fresh air for the crew.", fx: { life: 18, power: -18 },
          result: "The oxygen maker hummed all sol. Fresh air!" },
        { label: "Not today", desc: "Keep the power.", fx: {}, extra: ["No change"],
          result: "You kept the power for something else." }
      ]
    },
    {
      id: "perchlorate", place: "mars", cat: "food", tip: 1,
      title: "Mars soil is bad for plants!",
      text: "Tests show the soil has a salt called perchlorate. It's harmful to plants and people.",
      fact: "In 2008, NASA's Phoenix lander discovered perchlorate salts in Mars soil.",
      source: "NASA Phoenix Mars Lander",
      choices: [
        { label: "Wash the soil", desc: "Uses water from Life Support.", fx: { life: -10, food: 18 },
          result: "The washed soil is safe now. The plants love it." },
        { label: "Grow plants in water only", desc: "Hydroponics needs pumps.", fx: { power: -14, food: 14 },
          result: "Hydroponics! Plant roots hang in nutrient water." },
        { label: "Don't plant today", desc: "No water or power used.", fx: { food: -12 },
          result: "No new plants today. The food store gets lower." }
      ]
    }
  ],

  storm: {
    title: "Solar storm alert!",
    text: "A solar storm is coming. Space rays called [[radiation]] will reach the base soon.",
    fact: "Water is great at blocking radiation. Artemis astronauts in the Orion capsule can build a storm shelter by moving supply bags around themselves.",
    source: "NASA Artemis / Orion",
    tip: 0,
    choices: [
      { label: "Boost the shield", desc: "Use extra power to make the walls stronger.", fx: { shield: 25, power: -20 },
        result: "The shield generator is roaring. Now get your astronaut to the Shelter!" },
      { label: "Keep doing research", desc: "The science team keeps working.", fx: { science: 12 }, risk: "Storm hits harder", stormMul: 1.3,
        result: "Storm data is valuable — but the base isn't ready. Get to the Shelter!" },
      { label: "Keep the Earth link strong", desc: "Power goes to the radio.", fx: { science: 6, power: -12 }, risk: "Exact arrival time", link: true,
        result: "Earth will track the storm for you. Your science is safe on Earth." }
    ]
  },

  commander: "Commander Nova",

  glossary: {
    sol: "A sol is one day on Mars. It lasts 24 hours, 39 minutes and 35 seconds — a bit longer than an Earth day.",
    radiation: "Invisible energy from the Sun and deep space. A little is OK, but too much can make astronauts sick. Earth's air and magnetic field protect us; the Moon and Mars don't have that protection.",
    CME: "A Coronal Mass Ejection: a giant cloud of hot gas thrown out by the Sun. Most take 1 to 3 days to reach Earth.",
    SEP: "Solar Energetic Particles: super-fast particles from the Sun. They are the most dangerous part of a solar storm for astronauts.",
    gravity: "The pull that keeps your feet on the ground. The Moon's gravity is 1/6 of Earth's, and Mars' is 38%.",
    "communication delay": "Radio messages travel at the speed of light, but space is huge! Moon messages take 1.3 seconds; Mars messages take 3 to 22 minutes one way.",
    "life support": "Machines that make air to breathe, clean water, and keep the base warm.",
    shielding: "Walls and fields that block radiation. Water and thick walls make good shields.",
    greenhouse: "A room where plants grow under lamps to make food for the crew."
  }
};
