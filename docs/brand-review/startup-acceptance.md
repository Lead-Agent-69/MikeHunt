# Startup acceptance audit

**Status: not implemented / not validated. No eligible shared blocking client
initialization stage was found. This is an explicit absence finding, not a pass
for the first-session startup-animation requirement.**

Reviewed application-code commit: `03612d61761820a5bedd762d15037d990df1ea61` on
`codex/dh-brand-review` (draft PR #636). The follow-up changes documentation only.
No splash, startup timer, first-session storage key, new loading boundary, or
content delay was added. This finding is scoped to the reviewed branding branch;
it does not assert that later changes on main have the same architecture.

## Architecture inspected

| Surface                                                             | Actual loading behavior                                                                                                           | Startup consequence                                                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/layout.tsx`                                                    | Renders children inside network, SWR, responsive, error, and native-scroll wrappers; theme is resolved synchronously before paint | No shared async boot barrier or usable-content-ready callback                                                                                    |
| `app/(dashboard)/layout.tsx`                                        | Renders TopNav, WorkspaceNav, children through DiscoverySaveProvider, BottomNav, and overlays synchronously                       | Navigation and route content are not held behind a startup state                                                                                 |
| `app/(dashboard)/loading.tsx`                                       | **Absent**                                                                                                                        | There is no existing group-level loading component to integrate with                                                                             |
| Root `app/loading.tsx`                                              | **Absent**                                                                                                                        | No root loading component provides a first-session startup lifecycle                                                                             |
| Existing route `loading.tsx` files                                  | Skeletons for discover, find, fleet, map, and deal/[id]                                                                           | Genuine route-segment Suspense fallbacks; these are route loading, can recur on navigation, and do not identify a first-session application boot |
| `components/layout/TopNav.tsx`                                      | Local Suspense fallback still renders a header and home link                                                                      | Header fallback does not block the entire dashboard                                                                                              |
| NetworkProvider, SWRProvider, ResponsiveProvider, LenisSmoothScroll | Return their children without waiting for network probes or device detection; native scrolling is a passthrough                   | Async effects are not a reason to hide usable children                                                                                           |
| DiscoverySaveProvider / useDealerId                                 | Identity and saved-state requests inform account/save controls; provider still returns children                                   | Account readiness is not global content readiness                                                                                                |
| PWARegister / analytics / install UI                                | Registration and analytics run in effects; optional update/install UI is separate                                                 | Service-worker readiness does not block app content                                                                                              |
| `app/(dashboard)/market/layout.tsx` and market page                 | Layout returns children; page exposes its workspace while local initialization and inventory requests control result loading      | Inventory readiness must not become a whole-app splash gate                                                                                      |
| FlipDeskGate                                                        | Selected flip-tool route content can be withheld while desk access/preferences resolve; shared shell is outside that gate         | A genuine route-specific access wait, not shared startup initialization                                                                          |
| `components/ui/mobile-ux.tsx` MobileSplashScreen                    | Exported helper with a caller-supplied visible prop; repository search finds its declaration only                                 | Not integrated; has no 1300 ms limit, first-session guard, or usable-content lifecycle                                                           |

There **are** genuine blocking waits. In particular, `app/page.tsx` awaits a
server-side account lookup before choosing the landing page or redirect to
`/market`. Server response/redirect readiness is not a client-side startup owner
that can reliably stop an animation when the destination becomes usable. It is
not evidence that all initialization is non-blocking.

The installed Next.js 16 loading guide explains that a loading file wraps its
segment's page/children in Suspense while shared layouts remain interactive. A
route fallback unmounting is a route-ready event, not proof that identity,
preferences, data, or a hypothetical global startup are all finished.

## Requirement-by-requirement status

| Requirement                                           | Current acceptance                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Animate only a genuine blocking first-session startup | Not implemented: no eligible shared client stage with authoritative pending and usable-content signals found |
| Stop animation within 1300 ms                         | Not implemented / not tested; no startup cap exists                                                          |
| End immediately on usable content                     | Not implemented / not tested for startup; ordinary request-loader settlement tests do not prove this         |
| Skip repeat sessions/navigation                       | Not implemented / not tested; no startup session guard exists                                                |
| Do not add a fake splash or delay content             | Preserved: no runtime changes in this follow-up                                                              |
| Reduced-motion startup behavior                       | Not independently implemented / validated; shared request-loader reduced-motion coverage is separate         |

The existing request loader's **200 ms** visual anti-flash threshold, **1000 ms**
compact-to-requested-size threshold, and **4.8-second** repeating visual loop are
request feedback. They must not be presented as the requested **1300 ms** capped,
first-session startup animation. MobileSplashScreen being exported also does not
satisfy integration or acceptance.

## If a genuine startup owner is introduced later

Bind the visual only to that owner's real blocking state and authoritative
usable-content/failure/unmount signals. A first-session guard must prevent repeat
startup treatment. Stop the visual immediately when content is usable or on
failure, and cap animation at 1300 ms without delaying content delivery. If real
work remains after the cap, retain truthful neutral pending feedback; a timer
must not announce success or expose unavailable content. Reduced motion should
remain static. Verify early completion, the cap, failure/unmount, repeat visits,
and storage-unavailable behavior against the actual owner.

## Evidence and validation scope

`startup-acceptance.json` records the reviewed runtime commit, source Git blob
identifiers, exact existing route loading paths, and explicit false startup
acceptance flags. Source searches covered layouts, providers, loading files,
MobileSplashScreen call sites, startup/session guards, and identity consumers.

The prior full gate passed on runtime commit `03612d61`: 5887 tests in 776 files,
typecheck, lint, and default production build. Those checks validate the branding
and request-loader implementation, **not startup acceptance**. This follow-up
changes Markdown/JSON only; formatting, JSON parsing, absence/source-reference
checks, and a documentation-only diff check are appropriate. No application code
or new tests were added, so no new full-gate run is claimed.

PR #636 remains draft and review-only. No merge, deployment, or ADB action.
