# Platform and Navigation Audit

October 4, 2026. Configuration improvements are local; no containers were rebuilt or restarted.

## Docker

- Running local scraper, Redis and FlareSolverr reported healthy. Redis PING checked separately.
- Both Compose files validate with `config --quiet`.
- Production Compose previously published Redis on all host interfaces. Redis and the auxiliary service now bind to loopback only.
- Production dependents now wait for service health, and worker/scraper/web use init processes.
- App Docker build uses the lockfile with npm ci. Public Supabase build arguments are wired into Next's build stage; no service-role credential is accepted as a build argument.
- Production Docker image rebuild/startup remains unverified. Changes are not applied to the healthy running local fleet.
- Scraper image still needs a dedicated review of browser-version alignment, immutable image pinning, authorized source policy, execution mode and scoped queue lifecycle. Existing production scraper still runs its legacy cycle entry point; do not claim it is scope-only.
- Resource limits and log rotation on production Compose, non-root browser worker permissions, build size reduction, deployment health endpoints and graceful worker shutdown remain follow-ups.

## Framework Alignment

Installed: Next 16.3.7, React/React DOM 18.3.1, eslint-config-next 15.1.0.
Registry observed during this audit: Next 16.3.8, React 19.3.0.
No dependency versions changed. Next's current App Router guidance uses React 19 features; React and tooling alignment is an integration migration, not a cosmetic version bump. Verify maps, motion, authentication, SSR, lint configuration and production build before rollout.

References: https://nextjs.org/docs/app/guides/upgrading/version-16 ; https://docs.docker.com/compose/how-tos/startup-order/

## Navigation

- Desktop and mobile already share the core navigation registry; no new parallel menu system added.
- Desktop links now expose active-page semantics and icon links accessible names.
- Mobile retains five primary destinations, safe-area dock padding and target sizes. Dock animation and haptic feedback now honor system reduced motion.
- Account menu exposes Activity on both layouts and Auction Lane on mobile; keyboard activation verified at 390px.
- Dev-tool overlay can intercept clicks in local development. Production has no Next dev tool; keyboard activation confirmed the app menu itself works.
- Mobile primary navigation still lacks a clear Auction context highlight, and secondary workflow discoverability needs page-level review.
- Settings retains mixed save semantics and a sticky save bar. Separate location preferences can disagree with default market; consolidation of those concepts remains required.

## Product Maturity

The stack supports a polished product, but latest versions alone do not establish one. Remaining release gates include source detail correctness, normal/admin authentication validation, inspection evidence persistence, evaluation consistency, outcome calibration and full responsive task coverage. See product-completion-backlog.md and mobile-interaction-audit.md.
