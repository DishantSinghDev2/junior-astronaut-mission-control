/*
  SETTINGS
  NASA_API_KEY: "DEMO_KEY" works but only allows about 10 requests per hour per computer.
  Get a free personal key (1,000 requests/hour) at https://api.nasa.gov and paste it here.
*/
window.CONFIG = {
  NASA_API_KEY: "DEMO_KEY",
  LIVE_DAYS_BACK: 59,      // DONKI allows at most 60 days per request
  MISSION_DAYS: 8,
  STORMS_PER_MISSION: 2
};
