/*
  SETTINGS
  NASA_API_KEY: our team key from https://api.nasa.gov (free; meant to be used in public web pages).
  If it ever stops working, "DEMO_KEY" also works but only allows about 10 requests per hour.
*/
window.CONFIG = {
  NASA_API_KEY: "GzCRNDJLBDpQnffJq7MnBTPCjQprqBqL68pGk6pC",
  LIVE_DAYS_BACK: 59,      // DONKI allows at most 60 days per request
  MISSION_DAYS: 8,
  STORMS_PER_MISSION: 2
};
