# QA booking regression audit — 28 September 2026

Baseline: main `0b715730ae367d8b377f8afe4c6d1d7425386948`.
Reviewed all 56 contiguous `qa:` commits from `802e9a92` through the baseline, against parent `b86a080f548f3db7c12e8653c1ded235893e3415`. This is the QA update sequence, not a claim to have audited every historical feature commit.

## Findings and behavior

The new public/admin working-hours gates made the strict personal-shift parser decisive. The old free-text form could store `9 AM - 9 PM`, `09:00 - 21:00`, dotted AM/PM, or blank hours. These records could show an active/available barber but yield zero customer slots. Tests reproduce this against main; the user's private browser storage was not available to confirm which legacy value their profile contains.

The fix accepts unambiguous legacy formats. Blank personal hours inherit salon hours. Explicit invalid, reversed or overnight personal ranges remain unavailable. Salon hours, full service duration, leave, specialties, booking window and conflicts are still enforced. Stored appointments and profiles are not rewritten.

Admin rescheduling now previews the saved assigned barber, matching the save action. Assignment remains a separate Update action. Admin creation waits for service and barber selection and starts on the permitted minimum date. Single-person empty availability no longer says “simultaneous.”

Related defects found during scenario testing: greedy parallel Any Barber assignment missed valid specialist combinations; sequential/calendar slots were rounded from midnight rather than salon opening; a second customer-side booking cache kept cancelled slots blocked; legacy weekday restore could lose saved closures; invalid saved intervals produced fractional slots; weekly status filtering was absent; closed custom-service bookings could be repriced; malformed dates/times could normalize into real appointments. Some of these predate QA and were exposed by the expanded checks.

## Validation

- `npm run test:qa`: 54 deterministic scenarios against actual application classes with a fixed clock and isolated localStorage. On unchanged main, the initial suite had 15 failing cases out of 33; a later cancellation test reproduced an additional failure.
- `npm run build`: Angular production compilation and template/type checking.
- `npm run test:ui`: Playwright on the production build, 1440px and 390px viewports. Customer confirmation, admin creation/conflict filtering, parallel specialist matching, custom home request, and all nine admin routes; checks runtime errors and page overflow. Screenshots are retained by the PR workflow.
- PR workflow validation is authoritative for the final commit. See its result before merging.

The test harness does not mock scheduling logic. It loads actual service/component methods; browser checks cover their compiled Angular integration. Test fixtures are isolated and never touch the user's saved bookings.

## Commit-by-commit review

“Retained” means reviewed and kept; it does not claim exhaustive tests for every input or device. The checks listed distinguish static review from executable scenarios.

| Commit | QA change | Outcome / coverage |
|---|---|---|
| `0b715730` | protect barber availability and shift changes | Retained. Shared scheduling/shift regression tests; existing constraints retained. |
| `65b52729` | validate proposed barber shifts against appointments | Retained. Shared scheduling/shift regression tests; existing constraints retained. |
| `3e343cc9` | restore business hours by weekday key | Fixed: retain positional/labeled legacy weekday settings as well as keyed data. |
| `25057d64` | normalize booking service filter options | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `7590532c` | calculate barber load from actual shift capacity | Retained. Shared scheduling/shift regression tests; existing constraints retained. |
| `3b7d81ac` | expose validated barber shift window | Retained. Shared scheduling/shift regression tests; existing constraints retained. |
| `e66d5c10` | match multi-service bookings in service filter | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `74444018` | exclude elapsed appointments from customer next booking | Retained. Customer next-appointment, historical data and note-failure tests. |
| `1168357c` | respect personal shifts in schedule availability | Fixed: next-slot search shares the opening-time grid, excludes elapsed times and respects booking-date policy. |
| `ccba81b2` | fail closed on invalid barber working hours | Fixed compatibility: accept legacy unambiguous hours; invalid nonempty shifts still fail closed. |
| `bb5053a4` | preserve service literal types during restore | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `313e6fcf` | preserve barber literal types during restore | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `39d43177` | refresh time choices when barber changes | Fixed: independent assignment edits no longer clear the reschedule choice. |
| `2f6286df` | show only conflict-free barber time slots | Fixed: reschedule preview uses the same saved barber as the save action; creation waits for service and barber. |
| `a6dc578d` | expose barber slot availability for admin UI | Retained. Shared scheduling/shift regression tests; existing constraints retained. |
| `671f86f1` | handle settings and branding reset failures | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `1c6c22ee` | make settings reset atomic | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `b6fa1636` | normalize persisted barber state safely | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `5b3e609b` | normalize persisted service status safely | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `244eb334` | respect barber working hours in public booking | Retained. Shared scheduling/shift regression tests; existing constraints retained. |
| `b560fe3f` | enforce barber hours in booking mutations | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `7bea220d` | enforce barber working hours in scheduling | Fixed parser: optional minutes with AM/PM, dotted periods, 24-hour HH:mm, Unicode dash/to, blank inheritance. |
| `62525d0a` | use complete barber list in report filter | Retained. Static review of historical filter choices/export naming; reports route smoke test. |
| `4138094b` | keep historical barbers available in reports | Retained. Static review of historical filter choices/export naming; reports route smoke test. |
| `2bab0517` | report customer note save result correctly | Retained. Static review of historical filter choices/export naming; reports route smoke test. |
| `9840ea71` | handle customer note persistence failures | Retained. Customer next-appointment, historical data and note-failure tests. |
| `751d0385` | fix phase 1 anchors and messaging expectation | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `d5d01333` | fix phase 1 hero navigation and hours copy | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `7c041027` | show accurate public business-hours status | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `e7755f1e` | remove unnecessary optional chain warning | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `28776383` | fix narrowed booking status template check | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `b41cbcea` | fix edit barber photo build error | Retained. Static review of compression, face-check fallback and edit handler; production build and route smoke test. Real photo detection is not automated. |
| `6aefd6f7` | keep home service stepper spacing balanced | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `a2273208` | align stepper with home service flow | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `9e1a846f` | compress barber photos before local persistence | Retained. Static review of compression, face-check fallback and edit handler; production build and route smoke test. Real photo detection is not automated. |
| `21d7b175` | use complete filters and hide invalid status actions | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `aade10dd` | preserve historical booking filter options | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `ad0b2d65` | keep settings state atomic on save failure | Retained. Restore/save failure and existing-status review; no schema migration or data rewrite. |
| `2d47b291` | prevent duplicate barber identities | Retained. Upcoming appointment, identity, leave, specialty and shift guard tests. |
| `7cb8564e` | protect services used by upcoming bookings | Retained. Service mode, specialty synchronization and upcoming-booking guard tests. |
| `aa046116` | synchronize service changes with barber specialties | Retained. Service mode, specialty synchronization and upcoming-booking guard tests. |
| `0e88f287` | keep barber specialties synced with services | Retained. Service mode, specialty synchronization and upcoming-booking guard tests. |
| `71dcc388` | hide invalid booking actions for terminal states | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `193cd3b7` | align admin booking date and time options | Fixed: new admin booking initializes to minDate when same-day bookings are disabled. |
| `b5670cfa` | protect completed and cancelled bookings | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `ba31feee` | add custom home-service price control | Fixed: price control hidden for completed/cancelled bookings. |
| `9a3d2607` | manage custom home-service price in bookings | Fixed: terminal bookings cannot be repriced; amounts must be positive whole rupees. |
| `3515fae9` | require price before confirming custom home service | Retained. Customer/admin mutation, terminal status, custom-price and historical filter tests. |
| `762cd3ec` | make report export filename dynamic | Retained. Static review of historical filter choices/export naming; reports route smoke test. |
| `9b2e4cc8` | respect barber availability in schedule | Retained. Upcoming appointment, identity, leave, specialty and shift guard tests. |
| `9a0a288a` | clear expired barber leave automatically | Retained. Upcoming appointment, identity, leave, specialty and shift guard tests. |
| `ce28e53b` | keep customer next booking truly upcoming | Retained. Customer next-appointment, historical data and note-failure tests. |
| `53b9d3f2` | validate booking interval safely | Fixed restore compatibility: invalid/fractional saved intervals use 30-minute fallback. |
| `413858d3` | enforce booking window and past-time rules | Strengthened: impossible dates and malformed 12-hour times cannot roll into a valid appointment. |
| `c5165496` | correct salon mode selected state | Retained. Template/navigation/spacing review; production build and desktop/mobile route smoke tests. |
| `802e9a92` | keep salon and home service selections consistent | Retained. Service mode, specialty synchronization and upcoming-booking guard tests. |

## Existing limits

The app persists in localStorage. Availability is shared by screens in one app session, not centrally reserved across devices or independent browser sessions. This change does not add a backend or claim cross-device concurrency safety. Date/time arithmetic still follows the browser clock; the existing displayed timezone setting does not convert appointments. Messaging remains unconnected. Real-device photo detection and the user's private production data require separate verification. No Phase 3 redesign, new appointment statuses, phone-field rewrite, or deployment is included.

## Screenshot follow-up — 29 September 2026

The user's Add Barber screenshot exposed a missed template regression: the edit-photo field and its validation controls were inside Add Barber. They are now in Edit Barber; each modal has exactly one upload tied to its own form. Browser coverage now opens both modals, uploads an isolated image fixture, checks the manual face-confirmation gate, saves a new barber and changes an existing photo. This tests the fallback flow, not face-recognition accuracy.

A reproduced availability failure was stale records in an already-open customer tab after another admin tab changed hours. The booking component now reloads persisted barbers, services, settings and bookings on relevant localStorage events and window focus, reconciles its selections and regenerates slots without clearing contact details. This is same-origin browser-tab freshness, not a server reservation or cross-device synchronization guarantee.

The empty-slot message now differentiates invalid shifts, insufficient remaining duration before closing, unavailable services/barbers, closed dates and occupied slots. The provided booking screenshot alone does not establish which saved value caused that user's failure. The specific message and their selected date/hours are needed if it persists.

Cancelling a photo picker also preserves the previously selected/approved photo.

Follow-up suite: 60 regression scenarios and 32 browser scenarios, including both photo modals and cross-tab slot refresh at desktop/mobile sizes. See the latest PR workflow for the final result.
