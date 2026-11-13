/*
  GAME DATA — places, mission events, glossary.
  This is plain JSON-style data wrapped in `window.GAME_DATA = {...}` so the game
  also works when you double-click index.html (browsers block fetch() of .json files
  opened from disk). To add an event, copy one block and change the text/effects.

  "base" effects always happen; "effects" happen for the chosen option.
  Effect keys you can use inside "effects":
    air, food, health      -> change that meter right now (+ or -)
    science                -> add science data (it still has to be SENT by radio)
    battery                -> change stored battery power
    fromBattery            -> move up to N power from the battery into today
    powerToday             -> change power available today
    shieldBonus            -> free shield units today
    noScience: true        -> lab makes no data today
    stormFactor            -> multiply today's storm radiation (0.5 = half)
    solarTemp: {delta, days}   -> solar power change for some days
    solarForever           -> solar power change for rest of mission
    radiationForever       -> daily radiation change for rest of mission
    later: {days, effects, msg} -> something that happens on a later day
  Text helpers: {day} = "day" or "sol", {delay} = radio delay, [[term]] = glossary word.
*/
window.GAME_DATA = {
  places: {
    moon: {
      id: "moon",
      name: "Moon Base",
      dayWord: "day",
      solar: 9,
      radiation: 2,
      gravity: "about 1/6 of Earth's",
      blurb: "Build near the Moon's south pole, where Artemis astronauts plan to explore. Lots of sunlight, but no air to block radiation.",
      delayText: "1.3 seconds",
      facts: [
        "Radio signals take about 1.3 seconds to travel between Earth and the Moon.",
        "The Moon has no air and no global magnetic field, so nothing blocks radiation from space.",
        "Moon gravity is about 1/6 of Earth's. You could jump 6 times higher!"
      ]
    },
    mars: {
      id: "mars",
      name: "Mars Outpost",
      dayWord: "sol",
      solar: 8,
      radiation: 1,
      gravity: "about 38% of Earth's",
      blurb: "Mars gets less than half the sunlight Earth gets, and messages to Earth take minutes. Its thin air blocks a little radiation.",
      delayText: "{marsDelay}",
      facts: [
        "A day on Mars is called a [[sol]]. It is 24 hours, 39 minutes and 35 seconds long.",
        "Mars gets only about 43% of the sunlight Earth gets, so solar panels make less power.",
        "Radio signals take between about 3 and 22 minutes to go one way between Earth and Mars."
      ]
    }
  },

  events: [
    {
      id: "water_recycler",
      place: "both",
      icon: "recycle",
      cat: "life",
      title: "The water recycler is clogged!",
      text: "The machine that cleans and reuses water has stopped. Without it, the crew must use water from the tanks.",
      fact: "The Space Station recycles about 98% of its water — even sweat and urine become clean drinking water!",
      source: "NASA, 2023 (ISS water recovery milestone)",
      choices: [
        {
          label: "Fix it ourselves",
          good: "Recycler works again today",
          cost: "Crew is busy: −10 science data, −5 air & water",
          effects: { science: -10, air: -5 },
          result: "The crew took the recycler apart and cleaned it. Messy, but it works!"
        },
        {
          label: "Ask Mission Control for help",
          ask: true,
          good: "Experts on Earth know the trick",
          cost: "Radio uses 1 ⚡ today. Messages take {delay} each way",
          moon: {
            effects: { powerToday: -1 },
            result: "Earth answered in just 1.3 seconds! The fix worked right away."
          },
          mars: {
            effects: { powerToday: -1, air: -12, later: { days: 1, effects: { air: 6 }, msg: "Earth's answer about the water recycler arrived! It works perfectly now (+6 air & water)." } },
            result: "Your question flies to Earth at the speed of light — but Mars is so far away that it takes {delay}. Then the experts need time to test a fix, and their answer must fly back. It will arrive next sol. Until then, you use tank water (−12 air & water)."
          }
        },
        {
          label: "Use the backup water tanks",
          good: "No crew time or power needed",
          cost: "−15 air & water from the reserves",
          effects: { air: -15 },
          result: "You switched to the backup tanks. Easy — but those tanks are now much lower."
        }
      ]
    },
    {
      id: "plant_mold",
      place: "both",
      icon: "bug",
      cat: "food",
      title: "Mold in the greenhouse!",
      text: "Fuzzy mold is growing on the lettuce. Too much water and not enough moving air can cause it.",
      fact: "In 2016, astronaut Scott Kelly saved moldy zinnia flowers on the Space Station by drying them and giving them more air flow. They bloomed!",
      source: "NASA Veggie experiment",
      choices: [
        {
          label: "Pull out the sick plants",
          good: "Mold is gone fast, no power needed",
          cost: "−15 food",
          effects: { food: -15 },
          result: "You removed the moldy plants. The rest of the greenhouse is safe, but you lost food."
        },
        {
          label: "Turn up fans and lights",
          good: "Most plants are saved",
          cost: "Uses 2 ⚡ today, −3 food",
          effects: { powerToday: -2, food: -3 },
          result: "Dry air and bright lights stopped the mold. Only a few leaves were lost."
        },
        {
          label: "Ask Earth's plant experts",
          ask: true,
          good: "Expert advice saves every plant",
          cost: "Radio uses 1 ⚡ today. Messages take {delay} each way",
          moon: {
            effects: { powerToday: -1 },
            result: "The plant scientists answered in 1.3 seconds. Every plant was saved!"
          },
          mars: {
            effects: { powerToday: -1, food: -10, later: { days: 1, effects: { food: 5 }, msg: "Earth's plant experts replied! Their tip helped the greenhouse grow back a little (+5 food)." } },
            result: "Messages take {delay} each way, and the experts need time to study your photos. While you wait for the answer, the mold keeps spreading (−10 food). The reply comes next sol."
          }
        }
      ]
    },
    {
      id: "battery_hot",
      place: "both",
      icon: "thermometer-sun",
      cat: "power",
      title: "A battery is overheating!",
      text: "One of the base batteries is getting too hot. Hot batteries can be dangerous.",
      fact: "Spacecraft batteries are carefully kept at safe temperatures with heaters, radiators and fans.",
      source: "NASA spacecraft engineering",
      choices: [
        {
          label: "Unplug the battery",
          good: "Totally safe",
          cost: "All saved battery power is lost",
          effects: { battery: -99 },
          result: "You unplugged it. Safe! But your saved energy is gone."
        },
        {
          label: "Cool it with extra fans",
          good: "You keep your saved power",
          cost: "Uses 2 ⚡ today",
          effects: { powerToday: -2 },
          result: "The fans cooled the battery down. Your saved energy is safe."
        }
      ]
    },
    {
      id: "rover_find",
      place: "both",
      icon: "telescope",
      cat: "science",
      title: "The rover found something exciting!",
      textMoon: "The rover's camera spotted shiny frost at the edge of a dark crater. It might be water ice!",
      textMars: "The rover found layered rocks that might have formed in an ancient lake.",
      factMoon: "In 2009, NASA's LCROSS mission found water ice in a dark crater near the Moon's south pole.",
      factMars: "NASA's Perseverance rover collects rock samples in Jezero Crater, which was a lake billions of years ago.",
      source: "NASA LCROSS / Mars 2020 Perseverance",
      choices: [
        {
          label: "Drive the rover far to study it",
          good: "+25 science data",
          cost: "Rover uses 2 ⚡ today",
          effects: { science: 25, powerToday: -2 },
          result: "Amazing discovery! The rover took close-up pictures and measurements."
        },
        {
          label: "Take photos from far away",
          good: "+8 science data, no extra power",
          cost: "Much less science",
          effects: { science: 8 },
          result: "The photos are a bit blurry, but scientists will still learn something."
        },
        {
          label: "Park the rover and save power",
          good: "+2 ⚡ goes into the battery",
          cost: "No discovery today",
          effects: { battery: 2 },
          result: "The rover rests. The mystery will have to wait."
        }
      ]
    },
    {
      id: "supply_ship",
      place: "both",
      icon: "package",
      cat: "supply",
      title: "A supply rocket is coming!",
      text: "There is only room for ONE extra thing on the rocket. What should it bring?",
      fact: "Every kilogram launched into space costs a lot of fuel and money, so planners choose cargo very carefully.",
      source: "NASA mission planning",
      choices: [
        {
          label: "Food crates",
          good: "+25 food",
          cost: "No new equipment",
          effects: { food: 25 },
          result: "Yum! Fresh food packs arrived. Everyone is happy."
        },
        {
          label: "An extra solar panel",
          good: "+1 ⚡ every {day} for the rest of the mission",
          cost: "No extra food or shielding",
          effects: { solarForever: 1 },
          result: "The crew set up the new solar panel. More power every {day}!"
        },
        {
          label: "Radiation shield blocks",
          good: "Daily radiation goes down by 1 for the rest of the mission",
          cost: "No extra food or power",
          effects: { radiationForever: -1 },
          result: "The crew stacked the shield blocks around the sleeping area. Safer nights!"
        }
      ]
    },
    {
      id: "exercise",
      place: "both",
      icon: "dumbbell",
      cat: "crew",
      title: "Muscles are getting weak!",
      textMoon: "In the Moon's low gravity (about 1/6 of Earth's), muscles and bones don't work as hard, so they get weaker.",
      textMars: "In Mars gravity (about 38% of Earth's), muscles and bones don't work as hard, so they get weaker.",
      fact: "Astronauts on the Space Station exercise about 2 hours every day to keep their muscles and bones strong.",
      source: "NASA Human Research Program",
      choices: [
        {
          label: "Exercise for 2 hours",
          good: "+8 crew health",
          cost: "Less time for work: −10 science data",
          effects: { health: 8, science: -10 },
          result: "Running on the treadmill and lifting weights — the crew feels strong!"
        },
        {
          label: "Skip exercise today",
          good: "More time for work",
          cost: "−6 crew health",
          effects: { health: -6 },
          result: "More work got done, but the crew feels stiff and tired."
        }
      ]
    },
    {
      id: "lunar_dust",
      place: "moon",
      icon: "cloud-fog",
      cat: "power",
      title: "Moon dust on the solar panels!",
      text: "The rover kicked up dust and it stuck to the solar panels. Dusty panels make less power.",
      fact: "Moon dust is sharp like tiny bits of glass because there is no wind or water to smooth it. Apollo astronauts found it stuck to everything!",
      source: "NASA Apollo missions",
      choices: [
        {
          label: "Moonwalk to clean the panels",
          good: "Full power stays",
          cost: "Outside means more radiation: −4 crew health",
          effects: { health: -4 },
          result: "The astronauts brushed off the panels in their spacesuits. Shiny again!"
        },
        {
          label: "Leave the dust",
          good: "Crew stays safe inside",
          cost: "−2 ⚡ for 3 days",
          effects: { solarTemp: { delta: -2, days: 3 } },
          result: "The dusty panels will make less power for a few days."
        }
      ]
    },
    {
      id: "micrometeorite",
      place: "moon",
      icon: "sparkles",
      cat: "life",
      title: "A tiny space rock hit the base!",
      text: "A space rock smaller than a grain of rice made a tiny hole in one module. Air is leaking out slowly!",
      fact: "The Moon has no air, so even tiny space rocks (micrometeorites) hit the ground at full speed.",
      source: "NASA Moon facts",
      choices: [
        {
          label: "Patch the hole now",
          good: "No more leak",
          cost: "Uses 1 ⚡ and −10 science data (crew is busy)",
          effects: { powerToday: -1, science: -10 },
          result: "The crew found the hole and sealed it with a patch. Good as new!"
        },
        {
          label: "Close the door to that module",
          good: "Quick and easy",
          cost: "Air in that room is lost: −10 air & water",
          effects: { air: -10 },
          result: "You shut the hatch. The leak stopped, but some air was lost."
        }
      ]
    },
    {
      id: "lunar_shadow",
      place: "moon",
      icon: "mountain",
      cat: "power",
      title: "A shadow is moving over the base!",
      text: "A mountain's shadow will cover your solar panels today. You get 4 less ⚡ unless you use your battery.",
      base: { powerToday: -4 },
      fact: "Near the Moon's south pole, some high ridges get sunlight most of the time. That's one reason Artemis plans to explore there.",
      source: "NASA Artemis",
      choices: [
        {
          label: "Use battery power",
          good: "Today's power stays normal",
          cost: "Battery drops by up to 4",
          effects: { fromBattery: 4 },
          result: "The battery filled the gap. But it's now lower for future emergencies."
        },
        {
          label: "Live with less power today",
          good: "Battery stays full",
          cost: "−4 ⚡ today",
          effects: {},
          result: "It will be a tight power day. Choose carefully!"
        }
      ]
    },
    {
      id: "dust_storm",
      place: "mars",
      icon: "cloud-fog",
      cat: "power",
      title: "A dust storm is coming!",
      text: "Red dust is filling the sky and blocking the Sun. Solar panels will make 3 less ⚡ for 2 sols.",
      base: { solarTemp: { delta: -3, days: 2 } },
      fact: "In 2018, a dust storm covered ALL of Mars. NASA's solar-powered Opportunity rover went to sleep and never woke up.",
      source: "NASA Opportunity mission",
      choices: [
        {
          label: "Use the battery to keep going",
          good: "Battery fills the gap for 2 sols",
          cost: "Battery drops by up to 6",
          effects: { fromBattery: 3, later: { days: 1, effects: { fromBattery: 3 }, msg: "The battery is covering for the dusty sky again today." } },
          result: "The battery covers the missing power. Let's hope no other emergency comes!"
        },
        {
          label: "Turn off greenhouse lamps",
          good: "Lamps off saves the 3 missing ⚡ for 2 sols",
          cost: "Plants get dark: −12 food",
          effects: { food: -12, solarTemp: { delta: 3, days: 2 } },
          result: "The plants are in the dark for a while. Some of them didn't make it."
        },
        {
          label: "Ride out the storm",
          good: "Keep battery and plants",
          cost: "−3 ⚡ for 2 sols",
          effects: {},
          result: "Dark skies ahead. You'll have less power for 2 sols."
        }
      ]
    },
    {
      id: "dust_devil",
      place: "mars",
      icon: "tornado",
      cat: "science",
      title: "A dust devil is spinning nearby!",
      text: "A whirlwind of dust is spinning across the plain. It might blow dust off your solar panels!",
      fact: "Wind gusts sometimes cleaned the dusty solar panels of NASA's Spirit and Opportunity rovers, giving them more power.",
      source: "NASA Mars Exploration Rovers",
      choices: [
        {
          label: "Go outside and study it",
          good: "+15 science data",
          cost: "More radiation outside: −3 crew health",
          effects: { science: 15, health: -3 },
          result: "Great measurements of Mars wind! The crew comes back a bit dusty."
        },
        {
          label: "Stay in and let it clean the panels",
          good: "+2 ⚡ today from clean panels",
          cost: "No new science",
          effects: { powerToday: 2 },
          result: "Whoosh! The dust devil cleaned the panels. Extra power today."
        }
      ]
    },
    {
      id: "moxie",
      place: "mars",
      icon: "wind",
      cat: "life",
      title: "Make oxygen from Mars air?",
      text: "Mars air is mostly carbon dioxide. Your oxygen maker can turn it into oxygen, but it needs a lot of power.",
      fact: "MOXIE, an experiment on NASA's Perseverance rover, made 122 grams of oxygen from Mars air — about what a small dog breathes in 10 hours.",
      source: "NASA Perseverance MOXIE, 2023",
      choices: [
        {
          label: "Run the oxygen maker",
          good: "+15 air & water",
          cost: "Uses 2 ⚡ today",
          effects: { air: 15, powerToday: -2 },
          result: "The oxygen maker hummed all sol. Fresh oxygen!"
        },
        {
          label: "Not today",
          good: "Keep your power for other systems",
          cost: "No extra oxygen",
          effects: {},
          result: "You saved the power for something else."
        }
      ]
    },
    {
      id: "perchlorate",
      place: "mars",
      icon: "test-tube",
      cat: "food",
      title: "Mars soil is bad for plants!",
      text: "Tests show the soil has a salt called perchlorate. It's harmful to plants and people.",
      fact: "In 2008, NASA's Phoenix lander discovered perchlorate salts in Mars soil.",
      source: "NASA Phoenix Mars Lander",
      choices: [
        {
          label: "Wash the soil with water",
          good: "+10 food later from healthy plants",
          cost: "−8 air & water",
          effects: { air: -8, later: { days: 1, effects: { food: 10 }, msg: "The plants in the washed soil are growing well (+10 food)." } },
          result: "The washed soil is safe now. The new plants need a sol to grow."
        },
        {
          label: "Grow plants in water only",
          good: "+6 food, no soil needed",
          cost: "Pumps use 2 ⚡ today",
          effects: { food: 6, powerToday: -2 },
          result: "Hydroponics! The plant roots hang in water full of nutrients."
        },
        {
          label: "Don't plant today",
          good: "No water or power used",
          cost: "−8 food",
          effects: { food: -8 },
          result: "No new plants today. The food store gets lower."
        }
      ]
    }
  ],

  earthTips: [
    "Mission Control says: Great job keeping the radio on! Your science is safe on Earth.",
    "Mission Control says: Remember — unused power charges your battery.",
    "Mission Control says: Astronauts wear radiation badges called dosimeters to count their radiation.",
    "Mission Control says: Scientists are watching the Sun with spacecraft like SOHO and SDO for you.",
    "Mission Control says: Your families say hello!"
  ],

  glossary: {
    sol: "A sol is one day on Mars. It lasts 24 hours, 39 minutes and 35 seconds — a bit longer than an Earth day.",
    radiation: "Invisible energy from the Sun and deep space. A little is OK, but too much can make astronauts sick. Earth's air and magnetic field protect us; the Moon and Mars don't have that protection.",
    "radiation dose": "How much radiation a person's body has soaked up. Astronauts wear radiation badges (dosimeters) to measure it, and NASA sets a safe limit.",
    dosimeter: "A small radiation badge that measures how much radiation an astronaut gets.",
    CME: "A Coronal Mass Ejection: a giant cloud of hot gas and magnetic field thrown out by the Sun. Most take 1 to 3 days to reach Earth.",
    "solar storm": "When the Sun throws out lots of energy and particles (like a flare or CME). It can raise radiation and disturb radios.",
    SEP: "Solar Energetic Particles: super-fast particles from the Sun. They can arrive in under an hour and are the most dangerous part of a solar storm for astronauts.",
    microgravity: "Floating in space, like on the Space Station. On the Moon (1/6 gravity) and Mars (38% gravity) there is some gravity, but much less than on Earth.",
    "communication delay": "Radio messages travel at the speed of light, but space is huge! Moon messages take 1.3 seconds; Mars messages take 3 to 22 minutes one way.",
    "life support": "Machines that make air to breathe, clean water, and keep the base warm.",
    "power budget": "Deciding how to share a limited amount of electricity between systems — like sharing pocket money.",
    greenhouse: "A room where plants grow under lamps to make food for the crew."
  }
};
