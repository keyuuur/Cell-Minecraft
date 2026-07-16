# Build a Living Cell — LLM Project Handoff

Last updated: 2026-07-16

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
- 2026-07-14: The earlier plan to use a personal Gmail account was superseded. The project has no personal Gmail account; the dedicated Sheet and Apps Script backend are owned by the school-domain Google Workspace account.

## 5. Verified repository, branch, commit, and deployment state

- Repository: `https://github.com/keyuuur/Cell-Minecraft`
- Active local branch: `codex/build-a-living-cell`
- Verified base commit: `e968008`
- Verified implementation commit: `e69f8d9` (`Build playable Unit 1 cell mission`).
- Verified release-test checkpoint: `15fe51f` (`Add protected preview verification`).
- Verified live-backend runtime fix: `a1f01d8` (`fix: load Vercel submission validation at runtime`).
- Upstream: `origin/codex/build-a-living-cell` exists and tracks the local branch. The live-backend runtime fix was pushed on 2026-07-14. Unrelated local edits to `AGENTS.md` and `KEYUR_WORKFLOW.md` remain outside project commits.
- Five-run UI rollout remote checkpoint: `95b5ed9` (`docs: verify counted Run 2 report`). It follows Visual Pass 1 implementation commit `55b8677`, evidence checkpoint `21c26fd`, harness commits `c7fabd8` and `5d37e28`, counted Run 1 commit `b7456af`, and retains application baseline `43ebed6`. The user-owned `AGENTS.md` and `KEYUR_WORKFLOW.md` edits remain unstaged and excluded.
- Vercel: project `cell-minecraft` is connected to `keyuuur/Cell-Minecraft` through the existing GitHub integration. `https://cell-minecraft.vercel.app` was created from the guidance-only `main` branch and is not an accepted game deployment. The protected `codex/build-a-living-cell` preview from `a1f01d8` is Ready at `https://cell-minecraft-git-codex-buil-5bd946-keyur159263-5904s-projects.vercel.app`. Its Apps Script URL and proxy key are Sensitive, Preview-only environment values; Production was not configured or promoted.
- Google backend: the school-owned Sheet `Build a Living Cell - Results` is private to the owner and contains only `RawSubmissions` and `BestResults`. The matching Apps Script backend is deployed as a web app that executes as the owner and accepts anonymous requests while enforcing the proxy key and payload validation. No Google Sheet ID, Apps Script deployment URL, proxy key, account credentials, or other backend secret is stored in this handoff.

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

### Verified 2026-07-14

- Existing GitHub-to-Vercel integration successfully created the `cell-minecraft` project and a Ready preview from release-test commit `15fe51f` on `codex/build-a-living-cell`.
- Signed-in Chrome completed the live identification, real control-practice, Babylon scene-load, timer-start, and mission-HUD flow. Development-only stage controls remained absent even with `?test=1`.
- Anonymous Chromium and iPad-WebKit reached Vercel login instead of the app. This is a Deployment Protection gate, not an application failure.
- A project-scoped Vercel automation bypass was created for testing without changing Vercel Authentication or the account's existing shareable link. Its value was not committed or logged.
- The reusable `E2E_BASE_URL` and environment-only automation-bypass path passed the `@live` production-safe startup test against the protected preview in desktop Chromium and iPad-landscape WebKit: 2/2 passed.
- Local format, lint, typecheck, 36 tests, and production build pass.
- GitHub Actions run `29338255839` passed both the quality/build job and the complete local-server browser job for `15fe51f`.
- After the fresh `15fe51f` Vercel deployment reached Ready, the protected `@live` test passed again in both configured browser profiles: 2/2 passed.
- The first live `/api/submit` check exposed an ESM runtime import failure in Vercel. Adding the required `.js` extension to the validation-module import fixed the first broken boundary; the full local gate then passed again: formatting, lint, typecheck, 36/36 tests, and production build.
- GitHub pushed `a1f01d8`; the connected Vercel project automatically produced a Ready Preview deployment from that commit.
- GitHub Actions run `29344698527` passed for `a1f01d8`.
- Live synthetic accepted/idempotency test passed through Preview `/api/submit` -> Apps Script -> private Sheet. The first request returned HTTP 200 with an accepted receipt. Repeating the same `attemptId` returned the original accepted receipt and server timestamp.
- Sheet verification showed one 18-column raw data row, score 100, and `IsTest=TRUE`. `BestResults` remained header-only with zero data rows, proving that the Preview-forced test flag and test-row exclusion worked. No real student data was submitted.

### Counted UI rollout Run 1 — verified 2026-07-16

- Status: **passed and counted as 1 of 5**. Visual passes remain 0 of 3. Email 1 was sent successfully with the verified PDF; rollout emails are 1 of 6.
- Application baseline: `43ebed6fe7658ea476c5a58b143a8c288ce0db73`. Evidence harness: `5d37e28bd22921348cd6ba770d52cea65a856be0`.
- Profile: local iPad-landscape WebKit browser emulation, 1024 × 768, Touch Only, standard settings. This is not physical-iPad evidence.
- Evidence: `output/playwright/ui-rollout-2026-07-15/00-baseline/run-01-counted/` contains 12 original PNGs for the required 11 report panels plus a redacted `run.json`. All listed SHA-256 hashes match; no identity, attempt/session ID, recipient, private URL, token, credential, or student data is recorded.
- Real-control gates passed: visible tutorial practice, Pause/Resume with stable active time, Remove/replace/reinspect with full-credit restoration, nearby Inspect + Interact function evidence, drought/recovery, and visible final submission.
- Submission gate passed through a local synthetic intercept: exactly one request, a nonempty transient attempt ID held only in memory, completed status, score 100, and a matching accepted receipt. No external Sheet row was created by Run 1.
- Graphics gate passed two explicit live WebGL/WebGL2 context checks with no context-loss overlay. No page errors, unapproved console errors, or failed semantic gates were recorded. Mission-ready time was 1,813 ms.
- The 13-page mobile report `output/pdf/build-a-living-cell-ui-rollout-run-01-baseline.pdf` was rendered back to PNG and every page was inspected at original resolution. It has no clipping, overlap, missing report text, black boxes, or unreadable report content. Apparent black regions in multi-image previews were viewer delta artifacts, not source-file defects.
- Checkpoint verification: formatting, lint, TypeScript, 36/36 unit/component/API tests, and production build passed. The complete desktop Chromium mission matrix passed 11/11. A three-worker WebKit run saturated the emulated renderer to 0–7 FPS and timed out three cases; the required isolated iPad-landscape matrix then passed 11/11 with one worker, confirming resource contention rather than a mission failure.

### Visual Pass 1 - verified 2026-07-16

- Status: **passed as visual pass 1 of 3**. Counted runs remain 1 of 5 and rollout emails remain 1 of 6 until counted Run 2 succeeds.
- Scope completed: readable identification readiness and disabled state, compact 1024 x 680 tutorial, explicit selected-control cue, visible drag-look affordance, 56px critical controls, separated HUD/hotbar/action lanes, accurate Inspect + Interact instructions, and pointer cleanup after lost capture or interruption.
- The HUD now emphasizes exactly one immediate action: Interact while an actionable depot or unobserved structure is nearby, Place while a module is selected, and no primary action for established cytoplasm, collected depots, or already-observed structures.
- Uncounted calibration `pass-1-regate-14` completed at 100% in local iPad-landscape WebKit emulation at 1024 x 680 with Touch Only. It produced 12 original PNGs for 11 report panels and a redacted `run.json`; all hashes match.
- Calibration semantics passed visible Pause/Resume active-time control, Remove/replace/reinspect full-credit restoration, all eight Inspect/Interact function events, drought and recovery, exactly one accepted intercepted submission, and two graphics-context checks. Mission-ready time was 909 ms; page and console error lists were empty.
- Original PNGs were inspected at original resolution. Pixel-level checks and three independent reviewers confirmed that black delta patches in the image viewer were preview artifacts, not source-PNG defects.
- Verification passed: `npm run check` with 39/39 unit/component/API tests and production build; the complete serial iPad-WebKit mission matrix passed 12/12. The two backend-flow cases that had timed out under earlier parallel resource saturation also passed 2/2 in isolation.
- Independent Student UX, Classroom Fit, and Playtest/QA re-gates all returned **GO with no mandatory findings**. This evidence is browser emulation, not physical-iPad proof.

### Counted UI rollout Run 2 - verified 2026-07-16

- Status: **passed and counted as 2 of 5**. Visual passes remain 1 of 3. Email 2 was sent successfully with the verified PDF; rollout emails are 2 of 6.
- Application commit: `55b8677e0ef8abfc5120063d779e049cc2b834ff`. Evidence harness commit: `21c26fd5993f5ac594aaeb4d2d869b2a1d22d8fd`.
- Profile: local iPad-landscape WebKit browser emulation, 1024 x 680, Touch Only, standard settings. This is not physical-iPad evidence.
- Evidence: `output/playwright/ui-rollout-2026-07-15/01-visual-pass-1/run-02-counted/` contains 12 usable original PNGs for the required 11 report panels plus a redacted `run.json`. Every listed SHA-256 hash matches the corresponding PNG, and the evidence contains no identity, attempt/session ID, recipient, private URL, token, credential, or student data.
- Real-control and semantic gates passed at 100%: visible tutorial practice, Pause/Resume with stable active time, Remove/replace/reinspect with restored full credit, all eight nearby Inspect + Interact function-evidence events, drought observation, external-water restoration, recovery, and visible final submission.
- Submission and graphics gates passed: exactly one intercepted synthetic request returned an accepted receipt; two explicit WebGL/WebGL2 context checks passed; page-error and console-error lists are empty. Mission-ready time was 3,350 ms.
- All 12 original PNGs were inspected at original resolution and are usable. The intentionally oversized ribosome remains a known Visual Pass 2 finding rather than a Run 2 evidence defect.
- The 13-page mobile report `output/pdf/build-a-living-cell-ui-rollout-run-02-visual-pass-1.pdf` was generated from the verified manifest, rendered back to 13 PNGs, and inspected page by page. Text extraction and raw-pixel checks confirmed accurate Run 2 labeling, matching evidence SHA, no clipping, no black-box corruption, and no stale baseline wording. Report SHA-256: `b948646176843b72c86a473904dd7b99e3fbc032e1e12cf0fb7ae18fa87c252e`.
- Independent Playtest/QA, Student UX/Visual Direction, and Classroom Fit reviewers returned **GO with no mandatory findings**. Their shared later-pass findings are the oversized ribosome, weak distant depot/structure labels, scene wayfinding, and dense Overview layout; these do not invalidate Run 2.
- Reporting gate passed: report-generator and handoff checkpoint `95b5ed9` was committed and pushed before Email 2. The verified PDF was attached to one successful school-domain self-send. Do not rerun or recount Run 2, and do not resend Emails 1 or 2.

## 7. Current active phase and exact remaining work

Active phase: **Five-Run, Three-Pass Swarm UI Rollout - Visual Pass 2 implementation and counted Run 3 candidate**.

Remaining rollout work, in order:

1. Visual Pass 2 and counted Runs 3–4: improve chamber wayfinding, module selection, placement, structure-specific function evidence, drought/recovery cues, and accessibility validation; correct only Run 3 failures before Run 4.
2. Visual Pass 3 and counted Run 5: polish dialogs, Overview, hints, grade breakdown, pause, results, practice, delivery status, and cohesion; verify the protected Preview and real synthetic backend path without promoting Production.
3. Complete the final swarm audit, final handoff/commit/push, and Email 6.
4. After the rollout, retain the pre-release external gates: live negative/retry/concurrency backend cases, shared-iPad pending-identity privacy, supervised physical-iPad access, physical device/network/student evidence, and post-device-gate asset/audio work.

## 8. Known risks, failures, and blockers

- **Live backend residual gate:** private Sheet creation, Apps Script deployment, Preview configuration, accepted receipt, duplicate idempotency, and test-row exclusion are verified. Live rejected/retry/concurrency cases remain before real-student use.
- **Vercel student-device access blocker:** the preview is Ready, and protected Playwright testing now passes without making the preview public or replacing the Hobby account's existing share link. A separate supervised access route is still required for the physical school iPad.
- **Physical-device blocker:** no actual school iPad evidence exists for load time, sustained 30 FPS, simultaneous move/look/interact, orientation/background recovery, Low mode, or 20-minute WebGL soak.
- **School-network blocker:** school Wi-Fi load time and live Apps Script receipt behavior are unverified.
- **Classroom-evidence blocker:** the 80% independent completion and 70% active-gameplay-time acceptance targets require real student playtesting.
- **Payload risk:** Babylon is isolated in a lazy bundle but remains the largest download. Low mode and real-device evidence are mandatory before release.
- **Rate limiting:** Apps Script rate limiting is best effort, not an authentication boundary. Assignment tokens remain routing data rather than secrets.
- **Shared-iPad privacy risk:** a pending delivery necessarily preserves the earlier attempt payload, including its student identity, until a receipt arrives. Before classroom use, verify that starting a new student session cannot display or attach that prior identity while background delivery continues.
- **Asset gate:** current visuals are original, efficient procedural low-poly assets. Optimized original glTF prefabs and optional audio remain a post-device-gate release task.
- **Run 1 baseline scene findings:** generic function feedback, oversized/ambiguous ribosome geometry, and faint or occluded depot labels are deferred to Visual Pass 2. The text-heavy Overview and slightly tall Results screen are bounded Visual Pass 3 targets.

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
- **2026-07-14 backend swarm checkpoint:** Biology/content review found the synthetic payload stayed inside the approved eight-structure Unit 1 scope. Deployment review approved the private school-owned Sheet, Preview-only secrets, and original-receipt idempotency rule. Classroom review approved synthetic-only testing but kept real-student release blocked on the shared-iPad pending-identity risk and physical classroom evidence.
- **2026-07-16 counted Run 1 checkpoint:** independent QA and Student UX reviewers approved the 12 original PNGs and redacted manifest as the required 11-panel baseline. Both prioritized the same Pass 1 corrections: hotbar/action separation, a compact landscape tutorial, a readable period selector, direct Inspect + Interact guidance, and 56px critical controls. They rejected apparent multi-image black-patch artifacts after inspecting original PNGs. Lower-priority structure identity, depot readability, function-specific cues, and Overview density remain assigned to their approved later passes.
- **2026-07-16 Visual Pass 1 checkpoint:** Student UX, Classroom Fit, and Playtest/QA independently inspected the completed 1024 × 680 calibration, original PNGs, manifest, and action hierarchy. All three returned GO with no mandatory findings. The coordinator accepted the single-primary-action rule, completed-depot/observed-state copy, compact tutorial, 56px targets, and visible modal scrolling. Scene identity, depot legibility, function-specific feedback, and Overview/Results density remain bounded to Passes 2 and 3.
- **2026-07-16 counted Run 2 checkpoint:** Playtest/QA, Student UX/Visual Direction, and Classroom Fit independently approved the 12 original PNGs, redacted manifest, and verified 13-page report. All returned GO with no mandatory findings. The coordinator accepted oversized ribosome scale, distant depot/structure labels, chamber wayfinding, placement/function feedback, and drought/recovery cues as bounded Visual Pass 2 work; dense Overview layout remains bounded to Visual Pass 3.

## 10. Future phase sequence and acceptance gates

1. **Local release candidate:** green checks, browser flows, swarm re-gate, committed and pushed.
2. **Preview:** live Vercel smoke, production-safe tooling check, and diagnostics.
3. **Backend, core path passed:** dedicated private Sheet, Apps Script deployment, Preview-only environment configuration, synthetic accepted/duplicate checks, one-row persistence, and test-row exclusion. Live rejected/retry/concurrency checks remain.
4. **Physical device:** oldest available iPad load/soak, typical iPad ≥30 FPS, touch-only simultaneous control, orientation/background/reload recovery, and Low mode.
5. **Classroom pilot:** ≥80% complete without teacher rescue, ≥70% of time in game actions, drought recovery discoverable, and no names on public/projector surfaces.
6. **Asset/audio release pass:** optimized original glTF prefabs and optional nonessential original sound, constrained by physical-device measurements.
7. **Production:** promote only when all applicable gates are recorded as passed.

Failed gates trigger correction and retest. No user approval is needed between these steps. Missing credentials, physical-device evidence, school-network evidence, or a required architecture/data-destination expansion are external blockers.

## 11. Backend/data destination status

- Browser contract: implemented with versioned payloads, identity limits, attempt/session IDs, rubric breakdown, outcome flags, active time, hint data, versions, and `isTest`.
- IndexedDB: versioned save envelope, migrations, five-second/event autosave, atomic queue preparation, queue replay, diagnostic export, and safe reset.
- Same-origin Vercel proxy: implemented at `/api/submit`; protected Preview-to-Apps-Script transport returned a valid accepted receipt after the ESM import fix.
- Apps Script: source, validation, idempotency, locking, append-only `RawSubmissions`, derived `BestResults`, duplicate receipt recovery, reconciliation, sanitization, and runbook are implemented.
- Dedicated Sheet and deployed web app: live under the school-domain owner. The Sheet is private and has only `RawSubmissions` and `BestResults`; the web app executes as the owner and accepts anonymous requests guarded by the proxy key and validation.
- Vercel environment values: Apps Script URL and proxy key are configured as Sensitive and Preview-only. Production remains unconfigured.
- Live evidence: one accepted synthetic row, one duplicate retry returning the original receipt without a second row, `IsTest=TRUE`, and zero `BestResults` data rows.
- No real student data has been submitted. Live and automated payloads are synthetic; Preview forces `isTest=true`.

## 12. Restart instructions for a new LLM/Codex instance

1. Read current user instructions, the nearest `AGENTS.md`, `KEYUR_WORKFLOW.md`, and this file completely.
2. Verify `git status`, current branch, HEAD/upstream, package lock, tests, GitHub Actions, deployment URLs, and backend state. Never trust stale prose over live evidence.
3. Read the archived planning handoff only when a historical decision is missing here.
4. Resume at the first unchecked item in section 7. Current counters are 2/5 counted runs, 1/3 visual passes, and 2/6 rollout emails. Counted Run 2 and Email 2 are complete; begin with Visual Pass 2 and do not rerun/recount completed runs or resend completed emails. Use read → plan → implement → test.
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
