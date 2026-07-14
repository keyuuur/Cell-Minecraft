# Build a Living Cell — LLM Project Handoff

Last updated: 2026-07-14

## 1. Project purpose and classroom audience

**Build a Living Cell** is a bounded, Minecraft-inspired formative Biology game for first-time ninth-grade learners using school iPads in landscape. Students build a plant cell, inspect the visible contribution of each required component, and restore the cell after a reduced-water-availability challenge. It is not comprehensive Unit 1 mastery or an infinite sandbox.

## 2. Authoritative curriculum sources and Unit 1 boundary

Curriculum authority, in order:

1. `Biology Games/BIOLOGY CONTEXT/BIOLOGY_CONTEXT_INDEX.md`
2. `Biology Games/BIOLOGY CONTEXT/[SHARED] 2025 Unit 1 Notes.pptx`
3. The shared Unit 1 assessment and study-guide bundle in `Biology Games/BIOLOGY CONTEXT`
4. The approved implementation plan

Required structures are exactly: cell wall, cell membrane, cytoplasm, nucleus, ribosomes, mitochondria, chloroplasts, and large central vacuole. The nuclear membrane appears within the nucleus visual but is not separately built or scored.

Out of scope: ER, Golgi apparatus, lysosomes, centrioles, vesicles, cytoskeleton, peroxisomes, osmosis terminology, hypertonic/hypotonic conditions, plasmolysis, ATP-transfer detail, limiting factors, equations, and Unit 2 reaction content. Drought is described as a homeostasis challenge, not as the plant's internal negative-feedback loop.

## 3. Locked product and technical decisions

- Public title: **Build a Living Cell**. Public repository: `Cell-Minecraft`.
- Mission duration: 15 minutes of active, visible gameplay. Pauses, hidden tabs, reload recovery, and orientation interruption do not consume active time.
- Identity: first name, last initial, and period 1–7; private session and attempt IDs are generated locally.
- Primary target: school iPad in landscape, approximately 1024 × 768.
- Stack: Vite, React, TypeScript, Babylon.js, Zustand, IndexedDB, Google Apps Script/Sheets, and Vercel.
- React owns screens and HUD; Babylon owns the stable scene and frame loop; pure TypeScript owns rules, scoring, and serializable state.
- Fixed `24 × 24 × 12` chamber, typed occupancy data, batched/instanced boundary visuals, broad placement zones, and no general chunk engine.
- Eight visible function-evidence events must be earned in the chamber. Opening Overview never awards function points.
- Corrections restore full credit; hints do not deduct points; impossible placement is blocked immediately.
- Rubric: boundary 15, required structures 30, placement/context 15, activation/functions 20, drought recovery 15, final stability 5.
- Dedicated teacher-owned Sheet with append-only raw submissions and a derived best-results view.
- No multiplayer, combat, infinite terrain, crafting tree, accounts, leaderboard, App Store build, PWA, advanced organelles, or third-party analytics.
- The project is independent and uses original procedural visuals. It does not copy Minecraft branding or assets.

## 4. Superseded decisions

- 2026-07-13: The tentative public title “CellCraft” was replaced by “Build a Living Cell” to avoid confusion with an existing educational game.
- 2026-07-13: Repository creation is no longer open; the public repository is `https://github.com/keyuuur/Cell-Minecraft`.
- 2026-07-13: Broad organelle coverage was narrowed to the eight structures in the teacher's Unit 1 boundary.
- 2026-07-13: Function credit from an Overview checklist was rejected. Evidence now comes from nearby, in-world inspection and visible system changes.
- 2026-07-13: A submitted grade is now an immutable snapshot. Post-submission practice cannot change the recorded outcome.

## 5. Verified repository, branch, commit, and deployment state

- Repository: `https://github.com/keyuuur/Cell-Minecraft`
- Active local branch: `codex/build-a-living-cell`
- Verified base commit: `e968008`
- Verified implementation commit: `e69f8d9` (`Build playable Unit 1 cell mission`).
- Upstream: `origin/codex/build-a-living-cell` exists and tracks the local branch. The implementation and handoff checkpoints were successfully pushed on 2026-07-13.
- Vercel: project `cell-minecraft` is connected to `keyuuur/Cell-Minecraft` through the existing GitHub integration under the `keyur159263-5904's projects` Hobby team. `https://cell-minecraft.vercel.app` was created from the guidance-only `main` branch and is not an accepted game deployment. A new `codex/build-a-living-cell` push is being used to trigger the real preview.
- Google backend: Apps Script source and operator runbook are complete, but no live Sheet or Apps Script deployment is verified. The connected Google tool is signed into `keyur159263@gmail.com`; the requested `PatelK07@gmail.com` account is not present in Chrome's account chooser. No Sheet was created in the wrong account.

Record the handoff-checkpoint commit, upstream branch, and deployment URL after each succeeds.

## 6. Completed phases with test evidence

### Locally implemented

- **Phase 1 — Handoff and scaffold:** pinned application/test packages, CI, branding, non-affiliation language, archive, and active handoff.
- **Phase 2 — Technical proof:** one stable Babylon controller, fixed chamber, hybrid input, touch-only joystick, place/remove feedback, overview, recenter, diagnostics, Low mode, and a `32 × 32 × 20` stress scene.
- **Phase 3 — Vertical slice:** boundary, nucleus, vacuole, cytoplasm context, drought/turgor behavior, hints, scoring, autosave, timeout, and practice.
- **Phase 4 — Complete Unit 1 mission:** all eight approved structures, full progression, eight visible function-evidence events, hydrated baseline, separated drought observation/diagnosis/recovery, accessibility settings, and original low-poly procedural visuals.
- **Phase 5 — Classroom layer:** identification, periods 1–7, active timer, unlimited fresh attempts, checkpoint grade, confirmed early submission, immutable results, and ungraded practice.
- **Phase 6 — Backend and resilience, local code:** validated submission contract, atomic save/queue preparation, reload-safe retry, idempotent Apps Script writes, append-only raw results, recoverable best-result reconciliation, formula-prefix neutralization, and test-row exclusion.

### Verified 2026-07-13

- `npm run check`: passed formatting, lint, TypeScript, 36 Vitest/component/API tests, and production build.
- Production build: passed. Main UI bundle was 248.18 kB minified / 76.36 kB gzip; lazy Babylon bundle was 1,442.19 kB / 333.62 kB gzip.
- Browser suite: 11/11 scenarios passed in isolated desktop Chromium and 11/11 passed in isolated emulated iPad WebKit. Coverage includes full mission, reload recovery, production-safe tooling, manual queue/retry, cross-student online queue replay, permanent rejection recovery, early submission, drought sequence, touch layout, accommodation settings, and active-attempt recovery.
- GitHub Actions run `29308606509`: passed both the quality/build job and the full Chromium + iPad-WebKit browser job on the pushed implementation checkpoint. This run is the remote CI evidence for the application code.
- Visual inspection: tutorial practice and the iPad-sized HUD were inspected in a real browser; controls are physical practice actions rather than checklist acknowledgements.

These are desktop/emulation results. They do not satisfy the physical-school-iPad or real-school-network gates.

## 7. Current active phase and exact remaining work

Active phase: **release-readiness checkpoint and external integration**.

Remaining work, in order:

1. When Vercel credentials are available, create and verify a preview; record its URL and live smoke result.
2. When Google write authorization is available, create the dedicated results Sheet, deploy Apps Script, set the Vercel environment variables, and run synthetic receipt/idempotency/best-result tests.
3. Complete the physical-device and classroom checks in `docs/CLASSROOM_RELEASE_CHECKLIST.md`.
4. Replace procedural prototype organelles with optimized original glTF prefabs and add optional original audio only after the hard physical-iPad performance gate passes. No audio may carry unique information.
5. Promote to production only after the external gates pass.

## 8. Known risks, failures, and blockers

- **Google account/authorization blocker:** the Drive connector is authenticated as `keyur159263@gmail.com`, not the requested results owner. Chrome offers `patelk07@psdr3.org` but does not currently offer `PatelK07@gmail.com`. The requested Gmail account must be added or the intended owner corrected before creating the Sheet. No Sheet, Apps Script deployment, or student submission was created.
- **Vercel deployment state:** the GitHub integration removed the local-token blocker. The project exists, but `main` contains no application code; the feature-branch preview and live smoke test are still required before this gate passes.
- **Physical-device blocker:** no actual school iPad evidence exists for load time, sustained 30 FPS, simultaneous move/look/interact, orientation/background recovery, Low mode, or 20-minute WebGL soak.
- **School-network blocker:** school Wi-Fi load time and live Apps Script receipt behavior are unverified.
- **Classroom-evidence blocker:** the 80% independent completion and 70% active-gameplay-time acceptance targets require real student playtesting.
- **Payload risk:** Babylon is isolated in a lazy bundle but remains the largest download. Low mode and real-device evidence are mandatory before release.
- **Rate limiting:** Apps Script rate limiting is best effort, not an authentication boundary. Assignment tokens remain routing data rather than secrets.
- **Asset gate:** current visuals are original, efficient procedural low-poly assets. Optimized original glTF prefabs and optional audio remain a post-device-gate release task.

## 9. Swarm review findings and coordinator decisions

Independent read-only reviewers cover Biology/learning evidence, classroom game fit, and technical/release safety. The coordinator owns synthesis and implementation.

Corrections implemented from the first review:

- Moved all function evidence from an Overview button list into nearby in-world inspection; removal clears the matching evidence.
- Split hydrated baseline, drought observation, water-station diagnosis/repair, and recovery verification into separate player actions.
- Made the Function status derive from all eight approved structures.
- Replaced tutorial acknowledgements with actual movement, interaction, placement, drag-look, and recenter practice before the timer starts.
- Reoriented the opening toward the active wall depot, dimmed inactive depots, and added valid/invalid placement footprints.
- Preserved an immutable submitted-score snapshot and added a clear practice exit.
- Added Escape handling, opener-focus restoration, non-tabbable canvas behavior, and an iPad accommodation-layout test.
- Made submission save + queue preparation atomic, preserved rejected and pending attempts across reload and ordinary reset, and added automatic/manual retry.
- Made Apps Script raw acceptance survive best-view update failure with later reconciliation.
- Tightened version/outcome validation and added direct Vercel-handler tests.
- Changed reconnect handling to replay the entire persisted delivery queue, even after a shared iPad has been reset for a different student. UI state is changed only when a receipt matches the current attempt.

Final re-gate results:

- **Biology/learning evidence: GO.** All prior learning-evidence findings were resolved. The reviewer found one unreachable legacy bypass method; it was removed before the final checks.
- **Classroom game fit: GO for code.** The reviewer verified real control practice, spatial function inspection, active-depot guidance, placement feedback, immutable results, practice exit, modal keyboard behavior, and the iPad accommodation matrix. Physical classroom release remains conditional on real-device/network/student evidence.
- **Technical release: GO for scoped commit/push.** The final cross-student queue flaw was corrected, its requested regression passes in both browser profiles, and the coordinator reran the isolated full browser gate: 22/22 passed. Live backend, Vercel, network, and physical-device gates remain external blockers rather than code blockers.

## 10. Future phase sequence and acceptance gates

1. **Local release candidate:** green checks, browser flows, swarm re-gate, committed and pushed.
2. **Preview:** live Vercel smoke, production-safe tooling check, and diagnostics.
3. **Backend:** dedicated Sheet, Apps Script deployment, environment configuration, synthetic accepted/duplicate/rejected/retry checks, and test-row exclusion.
4. **Physical device:** oldest available iPad load/soak, typical iPad ≥30 FPS, touch-only simultaneous control, orientation/background/reload recovery, and Low mode.
5. **Classroom pilot:** ≥80% complete without teacher rescue, ≥70% of time in game actions, drought recovery discoverable, and no names on public/projector surfaces.
6. **Asset/audio release pass:** optimized original glTF prefabs and optional nonessential original sound, constrained by physical-device measurements.
7. **Production:** promote only when all applicable gates are recorded as passed.

Failed gates trigger correction and retest. No user approval is needed between these steps. Missing credentials, physical-device evidence, school-network evidence, or a required architecture/data-destination expansion are external blockers.

## 11. Backend/data destination status

- Browser contract: implemented with versioned payloads, identity limits, attempt/session IDs, rubric breakdown, outcome flags, active time, hint data, versions, and `isTest`.
- IndexedDB: versioned save envelope, migrations, five-second/event autosave, atomic queue preparation, queue replay, diagnostic export, and safe reset.
- Same-origin Vercel proxy: implemented at `/api/submit`; preview and live Apps Script transport are unverified.
- Apps Script: source, validation, idempotency, locking, append-only `RawSubmissions`, derived `BestResults`, duplicate receipt recovery, reconciliation, sanitization, and runbook are implemented.
- Dedicated Sheet and deployed web app: blocked by missing Google Drive write authorization.
- Vercel environment values: not configured because no live Apps Script URL/token exists.
- No real student data has been submitted. All automated payloads are synthetic and marked `isTest=true`.

## 12. Restart instructions for a new LLM/Codex instance

1. Read current user instructions, the nearest `AGENTS.md`, `KEYUR_WORKFLOW.md`, and this file completely.
2. Verify `git status`, current branch, HEAD/upstream, package lock, tests, GitHub Actions, deployment URLs, and backend state. Never trust stale prose over live evidence.
3. Read the archived planning handoff only when a historical decision is missing here.
4. Resume at the first unchecked item in section 7. Use read → plan → implement → test.
5. In swarm mode, keep one implementation owner and independent read-only reviewers; route disagreement through the coordinator.
6. After a passed gate, update sections 5–11 before commit/push. Rewrite current state and retain replaced decisions only in the short dated log.
7. Never record credentials, OAuth details, student submissions, private names, or machine-local configuration.

### Source-of-truth order

1. Current user instruction
2. Applicable `AGENTS.md` and `KEYUR_WORKFLOW.md`
3. Verified repository, test, and deployment evidence
4. This current handoff
5. Archived planning documents and older notes

If this handoff conflicts with verified code or test evidence, correct it at the same checkpoint.
