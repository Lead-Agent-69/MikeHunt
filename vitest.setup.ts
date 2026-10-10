// Polite mode is ON by default in production. Adapter unit tests mock `fetch` to exercise their
// parsers, so the suite runs them on the legacy path unless a test opts in (polite tests set it).
process.env.SCRAPER_POLITE_MODE ??= "0";
