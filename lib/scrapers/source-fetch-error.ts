/** An incomplete source read. Retrying the entire scrape can repeat a blocked request. */
export class SourceFetchError extends Error {}
