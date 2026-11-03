# Source availability

All implemented production adapters remain registered and enabled. Repeated failures must never permanently disable a source or remove it from future discovery. Registry consistency tests enforce this default for every adapter.

Failures retain their counters, timestamps and run history. Existing circuit breakers and bounded cross-run cooldowns control retries; they do not change source availability. On startup, current registry configuration takes precedence over legacy persisted enable/disable flags. A stored failure-induced off switch must not survive a release indefinitely.

The admin source action resets cooldowns. Permanent per-source disable requests are rejected after the existing authorization gate. Global collection pause, authentication, access checks, request pacing and storage/write limits remain available and unchanged. Reset confirmation requires an actual successful state save.

Availability is not verified output. A source can be available for selection while requiring credentials, an inventory URL, a current feed, or recovery from an access error. Unconfigured adapters must not return a successful empty inventory merely because setup is missing. Directory entries and enabled counts are never claims of working coverage, new cars, permitted access or profitable inventory.

Unattended CI and sweep candidate lists are execution policies, not a source deletion list. Do not add an authenticated or unconfigured adapter to an automatic run just to increase the enabled count. Preserve truthful source status and receipts separately from registration.
