# LLM Cross-Review Log

Rolling working memory for critique exchanged between the LLMs working on this
project (currently Claude and Codex/ChatGPT). This is **not** a durable
decision record — it is scratch memory for recent back-and-forth review. Any
finding that turns into a locked decision, a rejected approach, or an open
risk worth remembering long-term must be promoted into
`LLM_PROJECT_HANDOFF.md` (sections 3, 4, 8, or 9) at the time it is written.
Do not rely on this file to remember anything permanently.

## How this file works

- **Rolling window:** keeps the most recent 30 turns. When a 31st turn is
  added, delete the oldest turn, regardless of which LLM wrote it. Turns do
  not need to split evenly between LLMs — whoever is actively working adds
  turns.
- **One turn = one dated entry by one LLM covering one review pass** — not
  one per file touched or per comment. Keep it to a review pass on a
  meaningful chunk of work (a commit, a phase, a route, a specific concern).
- **Turn numbers never reset or get reused**, even as old turns are deleted,
  so "Turn 47" always means the same review later on. Track the running
  counter below and increment it every time a turn is added.
- **Newest turn goes at the top** of the log, directly under the counter.
  Whoever opens this file should see the latest exchange first without
  scrolling past 29 older entries. Delete from the bottom when trimming to 30.
- **Keep entries compact.** A handful of bullets, not a full report. This
  file should stay fast to read at the start of a session.
- **Promote, then note it.** If a turn produces something durable, write it
  into `LLM_PROJECT_HANDOFF.md` first, then set this entry's Status to
  `promoted to handoff (section X)` so the next reader knows it already lives
  somewhere permanent.

## Running counter

Next turn number to use: **19**

## Entry template

```
### Turn N — YYYY-MM-DD — Author (model)
**Reviewed:** commit SHA / route / phase / file(s)
**Context:** one sentence on what this turn covers
**Findings:**
- finding one
- finding two
**Status:** open / acknowledged / resolved / promoted to handoff (section X)
```

## Log

### Turn 18 — 2026-07-23 — Codex (Sol)

**Reviewed:** exact automated/emulated RC candidate `0dc576c9e164b7b5b48136943df4426fe5a47bde`, GitHub CI run `30004127847`, and protected Preview deployment `5571750039`
**Context:** Coordinator closeout after Keyur superseded the excessive three-local-matrix requirement and the bounded exact-CI/Preview gate passed.
**Findings:**

- The candidate is pushed and exact-SHA CI passed the full quality/build job plus one complete one-worker, zero-retry `test:e2e:rc` browser matrix. The earlier failed and later stopped local matrices are uncounted and invalid.
- The protected Preview passed signed-in 1024 × 768 startup/lazy-load smoke with its embedded exact SHA, usable private identification, zero console errors, and no pre-mission canvas/Babylon load. This is not a full Preview mission or backend result.
- Independent Architecture/Skeptical, Playtest/QA, and UX/Biology/Classroom reviewers returned GO for the bounded automated/emulated checkpoint with no new P0–P2 Biology issue.
- V2 runtime delivery/receipt wiring, Sheet migration, Apps Script deployment, synthetic backend adversarial/load tests, full protected-Preview mission E2E, Production, physical iPad, school-network, accessibility-device, and classroom-pilot gates remain open.

**Status:** promoted to handoff (sections 4–10)

### Turn 17 — 2026-07-22 — Codex (Sol)

**Reviewed:** exact Phase 4 built-performance/accessibility source and evidence commit `b71005303aa265e89ccb4c7f4df48e8842e9589b`
**Context:** Coordinator closeout after exact-SHA built-server evidence, original-resolution inspection, and final Sol/Terra re-gates.
**Findings:**

- `npm run check` passed 39 files / 253 tests, five original glTF checks, the Production build, and the 42-file static JavaScript closure budget. The accepted one-worker, zero-retry matrix passed Chromium Standard, emulated-WebKit Low, ordinary-route instrumentation isolation, and terminal context loss.
- Both redacted manifests bind the exact application/harness SHA, Git tree, source scope, and deterministic built-output digest. All 18 screenshot hashes recompute; every original was inspected individually with no identity, transient ID, clipping, overlap, unreadable state, or Biology-scope defect.
- Initial review blockers on Overview bounds, graphics-loss timing, hardcoded semantic gates, PNG-byte naming, incomplete provenance, and JavaScript-only budget wording were corrected. A later apparent clipping finding was retracted after original files proved the combined viewer preview was the artifact.
- Automated frame intervals remain concerning observational evidence, not a physical-iPad failure or 30 FPS pass. Physical Safari, multitouch, school Wi-Fi, thermal/soak, hardware keyboard, assistive technology, and student completion remain external gates; protected Preview/backend release-candidate work is next and was not started.

**Status:** promoted to handoff (sections 5–12)

### Turn 16 — 2026-07-22 — Codex (Sol)

**Reviewed:** Phase 4 runtime/presentation foundation source checkpoint `580055ae7e4b33dd08716a4e526ae572286061f3` and final Chromium Standard / emulated-WebKit Low routes
**Context:** Coordinator closeout after dependency remediation, original-resolution label correction, and independent Sol QA re-gate.
**Findings:**

- The checkpoint closes the true lazy Production boundary, single interruption/input/render authority, effective quality and reduced motion, pure camera clearance, cutaway Overview, corrected active labels, structure cues, and guarded original glTF lifecycle with loader-free Low fallback.
- `npm run check` passed 38 files / 249 tests, five asset checks, the Production build, and the lazy-boundary guard. Both fresh full classroom routes reached immutable 100% results, terminal context loss passed 2/2, Standard loaded exactly five local models, and Low requested none.
- Independent Sol review initially retained one P2 mirrored/upside-down active supply label. The coordinator corrected Y-only billboarding and texture mapping using original PNG evidence; the final re-gate returned GO with no P0/P1 blocker and the P2 resolved.
- No external state changed. Built-server performance instrumentation, wider accessibility-state evidence, protected Preview/backend work, and physical-iPad testing remain separate later gates.

**Status:** promoted to handoff (sections 5–12)

### Turn 15 — 2026-07-22 — Codex (Sol)

**Reviewed:** Phase 4 dependency review of source `e159319899e2fecde34e75bd5fd18cd1ea412ed5`, built artifact, and 12 original classroom-route PNGs
**Context:** Coordinator synthesis of independent Sol architecture/accessibility/performance, Sol Biology/UX/visual/classroom, and Terra Playtest/QA passes.
**Findings:**

- Phase 4 is NO-GO until the Production lazy boundary, single interruption authority, complete input/render suspension, effective reduced-motion/quality propagation, pure camera clearance, and prefab asset lifecycle are corrected; the current build preloads Babylon before Start Mission.
- Original-resolution evidence confirms mandatory visual work: reversed and inactive billboards, obstructed Overview/HUD, camera-vacuole crowding, and mitochondria/chloroplast cues that depend too heavily on color.
- No reviewer found a Biology, privacy, scoring, or mission-completion P0. The coordinator preserved the eight-component Unit 1 boundary and moved asset/glTF work after lifecycle and Low-mode foundations.

**Status:** promoted to handoff (sections 7–9)

### Turn 14 — 2026-07-22 — Codex (Sol)

**Reviewed:** clean integrated-mission checkpoint `4a57ed1571b72ad76433d9ed552bfa6988d082f2`, current Phase 4 brief, and the intentional guidance/handoff changes
**Context:** Coordinator reconciliation before beginning Biology, UX, accessibility, visual, and performance remediation.
**Findings:**

- The formerly uncommitted `src/App.tsx`, submission, contract, persistence, runtime, and classroom-flow work is now the pushed integrated mission checkpoint; live Git shows no uncommitted application source to re-review or restage.
- Original-resolution evidence and the first independent Phase 4 QA pass agree on the bounded correction order: front-facing world labels, a deliberate cutaway Overview, placement/camera clearance, color-independent mitochondria/chloroplast cues, compact-height HUD work, and reduced-motion/input-clear proof.
- `LLM_PROJECT_HANDOFF.md` already carries the durable Phase 4 scope, visual/performance risks, external physical-iPad boundary, and protected-Preview/backend sequencing. `AGENTS.md`, `CLAUDE.md`, and this rolling log remain intentional user-owned working files outside source commits.

**Status:** promoted to handoff (sections 7–9)

### Turn 13 — 2026-07-22 — Codex (Sol)

**Reviewed:** integrated classroom-mission source checkpoint `e159319899e2fecde34e75bd5fd18cd1ea412ed5`
**Context:** Coordinator provenance review after the scoped source/handoff commit and before the exact-SHA closeout push.
**Findings:**

- The commit contains the intended 25 application, test, browser-route, style, and durable-handoff files only. User-owned `AGENTS.md`, `CLAUDE.md`, and this rolling log remain outside the commit.
- The committed source exactly matches the candidate that passed 35 files / 233 tests, the Production build, two fresh locally queued 100% classroom routes, the 4/4 proof/context-loss matrix, original-resolution review, and final Sol/Terra source re-gates.
- The dependency-correct next phase is Biology/UX/accessibility/visual/performance remediation. V2 delivery, Preview/backend mutation, Production promotion, and physical-device claims remain out of this checkpoint.

**Status:** promoted to handoff (sections 5–12)

### Turn 12 — 2026-07-22 — Codex (Sol)

**Reviewed:** uncommitted integrated classroom-mission local-gate candidate, full quality gate, two real `/` classroom routes, dual-engine proof/context-loss matrix, and 12 original PNGs
**Context:** Coordinator closeout after the atomic `/` cutover, repeated architecture/Biology/UX/QA challenge passes, and fresh Chromium plus emulated-WebKit evidence.
**Findings:**

- The ordinary route now uses one canonical voxel runtime with V3 per-attempt persistence, identity-safe recovery/handoff, active timing, immutable grade-plus-local-V2-queue finalization, Results, fresh attempts, and practice; V2 transport remains disconnected from the deployed V1 backend.
- Independent review exposed and the coordinator corrected timeout retry loops, Results-action failures, modal/background input, parent-timer scene failure, partial attempt creation, wrong/stale identity handoff, and editable identity during lookup. Final Sol Architecture, Sol Biology/UX/Classroom, and Terra QA re-gates returned GO with no P0/P1 blocker.
- `npm run check` passed 35 files / 233 tests and the Production build. Fresh zero-retry classroom routes reached one locally queued 100% grade in Chromium and emulated WebKit; the proof/context-loss matrix passed 4/4. Original inspection retains mirrored billboards, Overview/HUD and vacuole/camera occlusion, and structure differentiation as the next bounded P2 work.
- No Preview, Sheet, Apps Script, Production, email, student-data, or V2 transport state changed. Physical Safari/iPad, multitouch, school Wi-Fi, thermal/soak, hardware-keyboard, assistive-technology, and student-pilot gates remain external.

**Status:** promoted to handoff (sections 5–12)

### Turn 11 — 2026-07-22 — Codex (Sol)

**Reviewed:** current uncommitted integrated-classroom candidate in `src/voxel/`, `src/game/VoxelMissionScene.ts`, `src/persistence/v3.ts`, `src/state/integratedGameStore.ts`, and identification/tutorial UI
**Context:** Coordinator review after the first water-loop, completion-lock, V3 finalization, and shared-iPad UI integration chunk, before route cutover or a passing gate.
**Findings:**

- Water reduction, drought diagnosis, water restoration, and stable recovery now live in the canonical voxel runtime; supply prompts are suppressed while a pickup, carried module, uninspected module, or correction has priority.
- A recovered Overview now records evidence only. Explicit Submit is the sole proposed grade-lock boundary, and the new coordinator-owned finalization path is intended to save the immutable grade and V2 queue entry before exposing Results or later-attempt controls.
- The candidate remains incomplete and unverified: tutorial tests, TypeScript, persistence-finalization tests, the ordinary `/` integration, visible-control browser routes, and independent re-gates still must pass. The legacy route and all live external services remain unchanged.

**Status:** promoted to handoff (sections 3 and 8)

### Turn 10 — 2026-07-22 — Codex (Sol)

**Reviewed:** pushed Data Safety source checkpoint `d7d828e0fa7220cca1189e622ac3dd5aed63c371`
**Context:** Coordinator provenance check after the scoped implementation commit and GitHub push.
**Findings:**

- The pushed commit contains the intended persistence, validation, staged Contract-V2/Apps-Script, tests, bounded browser-timeout, and durable-handoff files only.
- User-owned `AGENTS.md`, `CLAUDE.md`, and this rolling log remain outside the commit; the live Vercel function and deployed Apps Script source remain unchanged.
- The exact source retains the green 31-file/204-test quality gate and 28/28 one-worker, zero-retry Chromium/WebKit regression, so the dependency-correct next phase is the atomic integrated classroom mission.

**Status:** promoted to handoff (sections 5, 7, and 10)

### Turn 9 — 2026-07-22 — Codex (Sol)

**Reviewed:** final uncommitted Data Safety candidate, 31-file/204-test quality gate, zero-retry Chromium/WebKit legacy regression, and independent Sol/Terra re-gates
**Context:** Coordinator closeout after adversarial persistence, shared-iPad, receipt, staged-backend, and test-isolation corrections.
**Findings:**

- Shared exact queue and receipt validators now prevent malformed, mismatched, wrong-key, or status-inconsistent data from settling accountable work across both legacy V1 and staged V2 paths.
- Save high-water tracking, active-pointer identity checks, reset epochs, and the locked-grade durability rule close the reviewed timer/hint regression, prior-student disclosure, late-write, and grade-loss paths.
- Contract V2 and the rollback-safe Apps Script migration pass local parity/idempotency/header tests but remain staged and unwired; no Preview, Sheet, Apps Script deployment, Production, or student-data state changed.
- `npm run check` passed 31 Vitest files / 204 tests and the Production build; the fresh full browser gate passed 28/28 across Chromium and emulated-iPad WebKit with one worker and zero retries. All three final independent reviewers returned GO with no P0/P1 blocker.

**Status:** promoted to handoff (sections 3, 5–11)

### Turn 8 — 2026-07-21 — Codex (Sol)

**Reviewed:** corrected V3 persistence candidate, 37-test focused gate, and independent Sol data/privacy plus Terra adversarial-QA re-gates
**Context:** Coordinator challenge pass after the initial six test failures were repaired and the nominal focused suite turned green.
**Findings:**

- Both reviewers rejected the green suite as incomplete: malformed or mismatched transport responses could synthesize terminal rejection and delete a valid queued grade, while a newer mission revision could still regress timer or hints.
- New Student hid only the active pointer while resume scanned every retained attempt, so another student sharing the limited identity tuple could discover prior work; resume must be an atomic identity-checked active-pointer transaction.
- Invalid attempt/queue records were silently filtered, V1/V2 raw keys could collide, and a 15-second lease could expire before an unconstrained network request ended.
- The coordinator accepted server-receipt-only settlement, revision-independent monotonic progress, corrupt-record quarantine, namespaced local keys, deadline/reset-epoch protection, and recoverable DB opening as mandatory corrections; no external state changed.

**Status:** promoted to handoff (sections 3, 7–9)

### Turn 7 — 2026-07-21 — Codex (Sol)

**Reviewed:** uncommitted Data Safety candidate in `src/types/game.ts`, `src/persistence/db.ts`, `src/persistence/schema.ts`, `src/persistence/v3.ts`, and `src/persistence/v3.test.ts`
**Context:** Coordinator review of the first isolated V3 persistence/queue foundation after Sol data/backend and Terra persistence-QA passes.
**Findings:**

- The accepted boundary is one non-destructive IndexedDB version upgrade: legacy saves stay quarantined, while per-attempt records, active metadata, leased V2 queues, and receipts share one atomic teacher-reset boundary.
- Identity matching remains in memory after entry; New Student hides the active attempt without deleting attempts or pending delivery, and the ordinary `/` plus live V1 backend remain untouched until atomic integration.
- The first focused run passed 31 of 37 tests but failed six because fixtures used regressive active/queue times and rejection settlement could write a timestamp older than the grade lock; the candidate is not committable yet.
- A true module-level replay single-flight and the staged, unwired Contract-V2/backend adversarial matrix are still required; no route, Sheet, Apps Script, Vercel, Production, or student-data state changed.

**Status:** promoted to handoff (sections 3, 7–9)

### Turn 6 — 2026-07-21 — Codex (Sol)

**Reviewed:** exact Phase 4.5 commit `d7a5c030f39b01af3ff99b99e54d1faff8e6da25`, two engine routes, two manifests, and 26 original PNGs
**Context:** Coordinator closeout review after fresh exact-SHA evidence, original-resolution inspection, and independent Sol visual plus Terra QA re-gates.
**Findings:**

- Chromium and emulated iPad-landscape WebKit each completed the one-runtime route with one worker and zero retries; both packets contain the exact 13-image sequence, matching hashes, zero errors/storage/API traffic, and no sensitive data.
- Removal lowered the model score, replacement alone restored only placement credit, and reinspection restored 80/80; terminal graphics loss froze later visible-input mutation in both engines.
- Mirrored rear billboards and dense Overview/HUD occlusion are genuine P2 source defects assigned to the later visual/accessibility phase, while emulated FPS counters remain a warning rather than physical-iPad evidence.
- Independent reviewers returned GO with no P0/P1 Phase 4.5 blocker; the dependency-correct next phase is per-attempt persistence, shared-iPad privacy, and immutable submission safety.

**Status:** promoted to handoff (sections 5–10)

### Turn 5 — 2026-07-21 — Codex (Sol)

**Reviewed:** uncommitted Phase 4.5 source candidate, dual-engine calibration routes, production isolation, and evidence-provenance guard
**Context:** Coordinator review of the unified-runtime candidate after Sol gameplay/architecture and Terra QA final re-gates.
**Findings:**

- The central-vacuole route must approach from the right lane and aim at the floor's top surface; the former left lane intersected the nucleus proxy, while aiming at the floor-cell center could select an earlier neighboring voxel.
- Boundary/player overlap must fail both before command mutation and during independent snapshot validation so neither placement nor restored state can put a wall through the player.
- Calibration passed the quality, continuous Chromium/WebKit, context-loss, legacy-route, and executable-bundle-isolation checks, but accepted evidence must wait for a clean source/harness commit and fresh exact-SHA capture.
- The corrected evidence guard binds the full app and harness scopes to commits, rejects scoped staged/modified/untracked files, and requires the exact ordered 13-image hash set; all final reviewers returned GO with no remaining P0/P1 blocker.

**Status:** promoted to handoff (sections 3, 5, and 7–9)

### Turn 4 — 2026-07-21 — Codex (Sol)

**Reviewed:** uncommitted Phase 4.5 runtime work in `src/contracts/`, `src/voxel/missionDefinition.ts`, `src/voxel/missionWorld.ts`, `src/voxel/missionRuntime.ts`, and `src/game/VoxelMissionScene.ts`
**Context:** Coordinator review of the first unified-runtime implementation chunk after independent Sol architecture/gameplay and Terra QA passes.
**Findings:**

- The legacy structure scene cannot become the integrated authority; the accepted path uses one canonical snapshot/runtime, current-revision crosshair targets, and separate derived render versus collision/raycast queries.
- The original two-dimensional prefab rules could seal the chamber or make later required structures impossible to place, so explicit height, continuous player overlap, reachable inspection/egress, and completable-layout checks are now mandatory.
- The pure runtime and Babylon scene remain uncommitted and cannot pass Phase 4.5 until the React route, zero-storage/API observation, context-loss freeze, continuous Chromium/WebKit visible-control route, and independent re-gates pass.

**Status:** promoted to handoff (sections 3 and 7–9)

### Turn 3 — 2026-07-21 — Codex (Sol)

**Reviewed:** pushed Phase 0 source `b4acbcaa408a5debdab7a69b47fa60803481911d` and handoff checkpoint `176f84760393fcf41b05375e2302b84d455fa499`
**Context:** Coordinator closeout of the contract-freeze phase before any unified-runtime mutation.
**Findings:**

- The pushed branch contains only the intended contract, scoring, legacy-isolation, and durable-handoff changes; the user-owned guidance and rolling-log files were preserved outside those commits.
- Phase 0's full local gate and independent reviews remain valid on the committed source, so Phase 4.5 runtime unification is now the dependency-correct next implementation stage.
- No Preview, Apps Script, Sheet, Production, or student-data state changed during this checkpoint.

**Status:** promoted to handoff (sections 5 and 10)

### Turn 2 — 2026-07-21 — Codex (Sol)

**Reviewed:** remediation Phase 0 contract-freeze source commit `b4acbcaa408a5debdab7a69b47fa60803481911d`
**Context:** Final coordinator review after independent Sol architecture/data and Terra adversarial-QA re-gates.
**Findings:**

- The sole mission aggregate, chamber-compatible prefab rules, conserved module ledger, revision-bound intent commands, strict V2 classification, immutable grade/practice contract, canonical V2 score, and verified digest boundary now satisfy the Phase 0 gate.
- All initial reviewer blockers were corrected; `npm run check` passes 25 test files / 123 tests and the production build, and both final independent reviewers returned GO with no actionable P0–P2 finding.
- Legacy V1 partial-score drift, altered-duplicate mutation, shared-device reset limitations, and physical/classroom gates remain explicit future work rather than being hidden by the contract freeze.

**Status:** promoted to handoff (sections 5–11)

### Turn 1 — 2026-07-21 — Codex (Sol)

**Reviewed:** uncommitted remediation Phase 0 contracts in `src/App.tsx`, `src/backend/submissions.ts`, `src/contracts/`, `src/data/assignment.ts`, `src/persistence/`, and `src/types/game.ts`
**Context:** Review of the contract-freeze candidate before its first implementation checkpoint.
**Findings:**

- The future aggregate correctly isolates the legacy V2/V1 route, but it still duplicates proof-runtime inventory and pickup state beside mission state and therefore is not yet a sole authority.
- V3 validation must bind graded outcome, score, mission revision, active time, completion lock, exact accessibility settings, exact hint keys, and boundary-removal correction state before the schema is safe to freeze.
- Focused formatting, lint, type, and contract/persistence tests pass, but the corrected invariants and their negative tests remain mandatory before commit.
  **Status:** promoted to handoff (sections 8–9)
