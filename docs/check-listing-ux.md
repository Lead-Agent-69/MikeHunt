# Check any listing — UX spec (`/find`)

Builds on #254. One input, one answer. Component: `components/intelligence/CheckAnyListing.tsx`.
Same card order and wording as the deal-page advisor card (May, #266/#267).

## Card hierarchy (result)

1. **Verdict pill = the heading (`h3`)** — icon + word: Buy (✓) · Wait (clock) · Pass (✕) ·
   Not enough data yet (!) · Not live (pause). The word is always `--t1`; colour only tints the
   icon and the pill fill. Pass is neutral (grey pill, red-tinted icon). Takes focus on a result.
2. **One primary number** — "Buy at or under $X" (`text-3xl`). Only when `maxBuy.value` exists.
3. **Headline** — the engine's one sentence (personal desk prefixes the price rating, e.g. "Good price ·").
4. **Vehicle line** — year make model trim · miles · asking price · state · listing freshness label.
5. **Secondary (max two)** — Fair value (with the middle-half range when the engine has it);
   Profit · sell in {state} (flip desk only, when `profit.net` exists). Missing values are omitted.
6. **Why** — `<details>` (44px summary): reasons, fair-value basis line, confidence, comp counts, assumptions.

## States

| State                | What shows                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty (before input) | Input + Check button and one helper line: what to paste, and that the answer is Buy, Wait or Pass. No sample numbers.                                                                           |
| Loading              | Button "Checking…" (disabled, `aria-busy`); `LoadingState` "Checking this listing…" (one `role=status`) where the card goes.                                                                    |
| Not enough data yet  | Verdict pill "Not enough data yet", headline, vehicle line, "No price is shown until enough comparable cars are tracked…", Why open by default. No Buy ≤, fair value or profit.                 |
| Not live             | Verdict pill "Not live" (neutral); the engine's numbers stay visible with its "price may not be buyable" headline.                                                                              |
| Error                | `InlineError` (PageStates). 5xx, 429, bad body or offline: message + "Try again" (re-runs the last query; takes focus). Other 4xx (bad link, missing price/model): message only; focus returns to the input. |

## Honesty

- Stored comparable asks are "recent asking prices", never "live asks" (component and the engine's Why/basis strings).
- "Not live" only describes the listing's own freshness state from the engine.
- Personal desk shows verdict, Buy ≤ (fair value where the car is) and fair value; profit/resale stay flip-only (#254 `readForDesk`).

## 390px

- Form stacks: full-width input (16px text so iOS does not zoom), full-width 44px button; side by side from `sm`.
- Card: pill, primary number on its own line, secondary numbers in a 2-column grid. No horizontal overflow.

## Accessibility

- Real `<label>` (visually hidden) + `aria-describedby` to the helper text.
- Polite `aria-live` region: "Checking this listing…", then e.g. "Verdict: Buy. Buy at or under $11,400. …", or the error.
- Focus moves to the verdict heading (visible ring) on a result; back to the input on a fixable 4xx.
- AA: text uses `--t1/--t2/--t3`; icon tints ≥3:1 on light and dark surfaces. Primary button `--t1` on `--s0`.
- Input, button, Why summary and Try again are ≥44px.
