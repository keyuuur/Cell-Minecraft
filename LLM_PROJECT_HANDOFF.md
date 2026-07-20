# Build a Living Cell — LLM Project Handoff

Last updated: 2026-07-19

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
- The approved presentation target is a bright, bounded voxel construction yard around the fixed chamber. First-person walking and drag-look, a center crosshair, an original visible builder pick, ray-targeted mining, a physical pickup, a nine-slot hotbar, and target-based placement are required gameplay verbs.
- The first voxel checkpoint is an isolated, non-scoring proof route. It does not collect identity, run the graded timer, write IndexedDB mission state, submit results, or alter the existing verified mission state.
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
- 2026-07-19: The accepted dark laboratory, smooth procedural-organelles, proximity-depot interaction, and "no fourth visual pass" posture were superseded for presentation quality. They remain historical functional evidence only and are not evidence that the game meets its Minecraft-inspired gameplay target.

## 5. Verified repository, branch, commit, and deployment state

- Repository: `https://github.com/keyuuur/Cell-Minecraft`
- Active local branch: `codex/build-a-living-cell`
- Voxel-rebuild strategy baseline: local HEAD and upstream both matched `494ec1387ae58bbc6f4d314cfe0bd1e0d8fc2a7a` (`docs: close UI rollout`) before Phase 0.
- Phase 0 strategy-reset start: `132c73ca83be94e0927bd827a173d1f63f4019bc` (`docs: start voxel gameplay rebuild`).
- Phase 0 final planning checkpoint: `7bcc7cf` (`docs: checkpoint voxel rebuild phase 0`).
- Phase 1 working base: local HEAD and upstream both matched `f10a9473c16f0e6c32f47f289ff7ec9303267f4b` (`Sync local changes to GitHub`). That earlier authorized checkpoint includes `AGENTS.md` and `KEYUR_WORKFLOW.md`; Phase 1 did not modify either file.
- Phase 1 isolated-proof implementation checkpoint: pending the commit created from this passed gate. The follow-up handoff checkpoint must record its exact SHA before closeout.
- Verified base commit: `e968008`
- Verified implementation commit: `e69f8d9` (`Build playable Unit 1 cell mission`).
- Verified release-test checkpoint: `15fe51f` (`Add protected preview verification`).
- Verified live-backend runtime fix: `a1f01d8` (`fix: load Vercel submission validation at runtime`).
- Upstream: `origin/codex/build-a-living-cell` exists and tracks the local branch. Production remains unpromoted.
- Five-run UI rollout upstream checkpoint: `f5d6446` (`docs: verify counted Run 3 report`). It follows Visual Pass 2 implementation/evidence commit `505fba0`, Run 2 delivery checkpoint `60d42fb`, and retains application baseline `43ebed6`.
- Counted Run 3 used app and evidence SHA `505fba00236dad6d3303d0a50d3d73fd89c84eb1`. Its verified report checkpoint is pushed, and Email 3 was sent once to the authenticated school-domain self-address with the verified PDF attached.
- Visual Pass 2 accessibility-correction commit: `01dd4463af0d1835d3301cb29f1a472a398cb8c7` (`fix: validate accessible touch HUD`). Counted Run 4 used this exact committed app/evidence SHA. Reporting checkpoint `9a25e58` (`docs: verify counted Run 4 report`) is pushed, and Email 4 was sent once to the authenticated school-domain self-address with the verified PDF attached.
- Run 4 delivery checkpoint: `1adb34a79f55665e74d8902f6904492adec85412` (`docs: record Run 4 report delivery`) is pushed and is the verified upstream base for Visual Pass 3.
- Visual Pass 3 UI candidate commit: `7257ad13abe194fcf2a875fbb9b2bd5fbbbf7bee` (`feat: complete visual pass 3 candidate`). Final protected-Preview evidence-harness commit: `1e0b68b4b93eb557588b1184b122f8800c82653e` (`test: preserve raw preview test flag`), which contains the unchanged verified UI candidate plus the complete privacy, freshness, idempotency, Preview-only safety, accurate target-labeling, bounded visible-control navigation, exact raw-boolean capture, and server-forced Preview test-classification sequence. Use `1e0b68b4b93eb557588b1184b122f8800c82653e` as the evidence SHA for counted Run 5. A later handoff-only checkpoint may be the Preview's tested app SHA without changing this evidence SHA.
- Counted Run 5 used exact protected-Preview application SHA `f64fb5301d16f2275d4fc35297d1e4ed2ed3d9f5` and evidence SHA `1e0b68b4b93eb557588b1184b122f8800c82653e`. The run, live synthetic receipt, duplicate idempotency probe, private-Sheet verification, original-resolution image review, independent swarm gate, and 19-page report inspection passed. Reporting checkpoint `762a621` was pushed, and Email 5 was sent once to the authenticated school-domain self-address with the verified PDF attached. This completes counted runs 5 of 5, visual passes 3 of 3, and rollout emails 5 of 6.
- Final-audit working base: local HEAD and upstream both matched `c67fed01e854a9c7814222f8c3541e9d99e290fc` (`docs: record Run 5 report delivery`) before the final-audit source and handoff checkpoint.
- Final-audit source/checklist checkpoint `3b9d8e89029404579bdd9671ce70ab675084048e` (`docs: complete final rollout audit`) and report-verification checkpoint `66be2c8` (`docs: verify final rollout report`) are pushed. The final 20-page audit packet was regenerated from the exact source checkpoint and the verified Run 5 report, rendered back to PNG, and inspected. Report SHA-256: `5cdb200dd3ece22fa687a870073209f35609d4436b4833f56e77b462207324e8`; file size: 7,134,517 bytes.
- Email 6 was sent once from the authenticated school-domain account to its verified self-address with the final audit PDF attached. Sent Mail now contains exactly six rollout emails, each with one PDF attachment. The Five-Run, Three-Pass Swarm UI Rollout is complete: 5 of 5 counted runs, 3 of 3 visual passes, and 6 of 6 emails.
- Vercel: project `cell-minecraft` is connected to `keyuuur/Cell-Minecraft` through the existing GitHub integration. The Production deployment was created from the guidance-only `main` branch and is not an accepted game deployment. A protected `codex/build-a-living-cell` Preview from `a1f01d8` was previously verified Ready. Its exact private URL, Apps Script URL, and proxy key are intentionally omitted; the backend values are Sensitive and Preview-only. Production was not configured or promoted.
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

### Voxel rebuild Phase 1 verified 2026-07-19

- The isolated `/?proof=voxel` development route branches before the graded `App` module loads. It uses React-local and pure TypeScript in-memory state only; it creates no IndexedDB database, browser storage, cookie, student identity, timer, score, submission queue, or `/api` request.
- The route presents a bright bounded voxel yard, block path, plant-cell construction frame, center crosshair, original first-person builder pick, real five-unit ray targeting, visible mining progress, physical pickup, nine-slot hotbar, target-only placement, removal, recollection, and repair.
- Production excludes the proof JS/CSS bundle. A production build request to `?proof=voxel` renders the safe unavailable screen with no canvas; the ordinary graded startup screen remains unchanged.
- Original-resolution evidence under ignored `output/playwright/voxel-proof-2026-07-19/` contains 15 final PNGs plus browser traces. It covers opening, mining, drop, collection, invalid and valid placement, Pause, installed wall, removal, recollection, repair, 1024 × 680 touch-only completion, safe WebGL loss, and held-joystick Pause recovery. These are voxel-rebuild proof artifacts, not a sixth counted rollout run.
- The 1024 × 768 keyboard + drag-look route and 1024 × 680 touch-only joystick route both completed through visible controls. Compact layout had zero document overflow and no control smaller than 56 × 56.
- Pause/resume clears keyboard, mining, pointer, and joystick state at both boundaries. A pointer held on the joystick before Pause cannot restart movement after Resume. WebGL context loss permanently stops gameplay input until reload.
- `npm run check` passed formatting, ESLint, TypeScript, 47 Vitest/component/API tests, and the production build.
- The existing graded mission regression suite discovered 32 cases: 28 passed across desktop Chromium and emulated iPad landscape, while four explicitly configured live/visual-rollout cases were skipped. No graded mission, persistence, backend, or deployment source was changed.
- Independent Visual/Game Loop, Technical/QA, Biology/Classroom Fit, Student UX, and Skeptical re-gates returned **GO with no mandatory finding** after correcting the compact disclaimer, exact Unit 1 wall wording, held-item inventory sync, paused/stopped keyboard handling, and held-joystick recovery.
- This is browser emulation, not physical school-iPad evidence. No Preview or Production deployment was created or promoted in Phase 1.

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
- All 12 original PNGs were inspected at original resolution and are usable. A later original-resolution source review corrected the earlier “oversized ribosome” attribution: the prominent occluder was the near-camera nuclear shell/scene framing, not ribosome scale. This did not invalidate Run 2.
- The 13-page mobile report `output/pdf/build-a-living-cell-ui-rollout-run-02-visual-pass-1.pdf` was generated from the verified manifest, rendered back to 13 PNGs, and inspected page by page. Text extraction and raw-pixel checks confirmed accurate Run 2 labeling, matching evidence SHA, no clipping, no black-box corruption, and no stale baseline wording. Report SHA-256: `b948646176843b72c86a473904dd7b99e3fbc032e1e12cf0fb7ae18fa87c252e`.
- Independent Playtest/QA, Student UX/Visual Direction, and Classroom Fit reviewers returned **GO with no mandatory findings**. Their shared later-pass findings were near-camera scene occlusion, weak distant depot/structure labels, scene wayfinding, and dense Overview layout; these do not invalidate Run 2.
- Reporting gate passed: report-generator and handoff checkpoint `95b5ed9` was committed and pushed before Email 2. The verified PDF was attached to one successful school-domain self-send. Do not rerun or recount Run 2, and do not resend Emails 1 or 2.

### Visual Pass 2 candidate - verified 2026-07-16

- Status: **passed the local candidate gate for counted Run 3**. This is not a counted run. Counters remain 2 of 5 runs, 1 of 3 completed visual passes, and 2 of 6 emails until the committed Run 3 evidence and report pass.
- Scope completed: active paired depots and raised `NEXT` billboards; actionable next-depot HUD priority; selected/installed/repair hotbar states; named valid/blocked placement zones with shape, pattern, and text cues; structure-specific Unit 1 function feedback; cumulative organelle rendering; distinct translucent outer wall panels with opaque braces versus a thin inner double membrane; recognizable procedural silhouettes; visible hydration/drought/recovery states; and boundary-specific collection instructions.
- The real-control driver now records two hashed placement appendices in addition to the required 12 core PNGs. It also supports an uncounted Run 3 reload profile, frames both required structure pairs and the vacuole before/after evidence, and records three graphics-context checks.
- Final uncounted calibration: `output/playwright/ui-rollout-2026-07-16/02-pass-2/calibration-t/`, local desktop Chromium emulation at 1024 x 768 with Keyboard + Touch. It reached 100% in one fresh context with mission-ready time 584 ms, 12 core PNGs, two diagnostic PNGs, zero hash mismatches, a redacted manifest, no page/console errors, and exactly one accepted intercepted synthetic submission.
- Semantic gates passed: visible Pause/Resume; a paused save followed by a 3.5-second recovery-screen dwell with at most one second of display rounding; restored objective, grade, 38% function state, Keyboard + Touch profile, absent joystick, fresh keyboard movement, and healthy graphics; blocked-to-valid movement; Remove/replace/reinspect full-credit recovery; all eight Inspect + Interact events; and drought/recovery.
- Final independent visual, Playtest/QA, and classroom/Biology reviewers all returned **GO** after earlier NO-GO findings were corrected. The accepted corrections were cumulative rendering, actionable next cues, placement appendices, reload-test sensitivity, unobstructed vacuole evidence, and wall/membrane collection copy.
- Verification passed: formatting, lint, TypeScript, 43/43 unit/component/API tests, production build, and the complete 12/12 Chromium mission matrix. Emulation is not physical-iPad evidence.

### Counted UI rollout Run 3 - verified 2026-07-16

- Status: **passed and counted as 3 of 5**. Visual passes remain 1 of 3 until Run 4 validates Visual Pass 2. Email 3 was sent successfully with the verified PDF; rollout emails are 3 of 6.
- Application and evidence commit: `505fba00236dad6d3303d0a50d3d73fd89c84eb1`.
- Profile: local desktop Chromium browser emulation, 1024 x 768, Keyboard + Touch, standard settings. This is not physical-iPad evidence.
- Evidence: `output/playwright/ui-rollout-2026-07-16/02-pass-2/run-03-counted/` contains 12 usable core PNGs for the required 11 panels, two diagnostic placement appendices, and a redacted `run.json`. All 14 SHA-256 hashes match, and the evidence contains no identity, attempt/session ID, recipient, private URL, token, credential, or student data.
- Real-control and semantic gates passed at 100%: visible Pause/Resume; paused reload recovery without inactive-time loss; blocked-to-valid placement through movement; Remove/replace/reinspect with restored full credit; all eight nearby Inspect + Interact events; drought observation; external-water restoration; and recovery.
- Submission and graphics gates passed: exactly one intercepted synthetic request returned an accepted receipt; three explicit graphics-context checks passed; page-error and console-error lists are empty. Mission-ready time was 627 ms.
- All 14 original PNGs were inspected and approved. Independent Playtest/QA, Classroom/Biology, and Student UX/Visual Direction reviewers returned **GO with no mandatory findings**. The accepted Panel 5 edge crop is aesthetic and does not invalidate the evidence.
- The 15-page mobile report `output/pdf/build-a-living-cell-ui-rollout-run-03-visual-pass-2-candidate.pdf` was rendered back to 15 PNGs and inspected page by page at original resolution. Re-encoding and source-PNG checks confirmed that apparent black regions in multi-image previews were viewer artifacts, not source defects. The report has no clipping, overlap, missing text, black boxes, or unreadable report content. File size: 1,813,171 bytes. Report SHA-256: `5373c1b31727a032c6c0cf4f0da584ec738cc377d53cd4ae4744df6cd79b82bd`.
- Reporting gate passed: report-generator and handoff checkpoint `f5d6446` was committed and pushed before Email 3. The verified PDF was attached to one successful school-domain self-send. Do not rerun or recount Run 3, and do not resend Email 3.

### Visual Pass 2 validation and counted UI rollout Run 4 - verified 2026-07-16

- Status: **passed Visual Pass 2 as 2 of 3 and counted Run 4 as 4 of 5**. Email 4 was sent successfully with the verified PDF; rollout emails are 4 of 6.
- Application and evidence commit: `01dd4463af0d1835d3301cb29f1a472a398cb8c7`.
- Profile: local iPad-landscape WebKit browser emulation, 1024 x 680, Touch Only, large text, high contrast, reduced motion, and mute. This is not physical-iPad evidence.
- Evidence: `output/playwright/ui-rollout-2026-07-16/02-pass-2/run-04-counted/` contains 12 usable core PNGs for the required 11 panels, four diagnostic appendices, and a redacted `run.json`. All 16 SHA-256 hashes match; the manifest contains no identity, attempt/session ID, recipient, private URL, token, credential, or student data.
- Accessibility and layout gates passed: critical targets are at least 56px; high-contrast primary actions meet the 4.5:1 text-contrast check; long structure labels fit; selected hotbar items scroll into view; contextual action names match visible actions; dialogs, prompts, joystick, hotbar, and action controls do not overlap; and the completed Submit action remains center-hit-testable.
- Real-control and semantic gates passed at 100%: visible Touch Only tutorial interactions, Pause/Resume active-time control, blocked-to-valid placement, Remove/replace/reinspect with restored full credit, all eight nearby Inspect + Interact evidence events, drought observation, external-water restoration, and recovery.
- Submission and graphics gates passed: exactly one intercepted synthetic request returned a matching accepted receipt while keeping the transient attempt ID out of evidence; three explicit WebGL/WebGL2 context checks passed; page-error and console-error lists are empty. Mission-ready time was 1,855 ms.
- Independent Playtest/QA, Student UX/Visual Direction, Classroom Fit, Biology/Learning Content, Game Loop, Deployment/Ops, and Skeptical review lanes all returned **GO with no mandatory findings** after inspecting the original evidence. Apparent black or missing-text patches in multi-image previews disappeared on original-file reopening and were confirmed as viewer artifacts.
- The 17-page mobile report `output/pdf/build-a-living-cell-ui-rollout-run-04-visual-pass-2-validation.pdf` was rendered back to 17 PNGs and inspected page by page at original resolution. It has no clipping, overlap, missing report text, black boxes, or unreadable content. Report SHA-256: `dc10e3e635c0a776bc6e411db8bdd58e627dc7df5d12fbc38e2babcb00499c2a`.
- Reporting gate passed: correction and reporting checkpoints `01dd446` and `9a25e58` were pushed before Email 4. The verified PDF was attached to one successful school-domain self-send. Do not rerun or recount Run 4, and do not resend Email 4.

### Visual Pass 3 local candidate - verified 2026-07-16

- Status: **passed the local candidate gate for protected Preview and counted Run 5**. This is not a counted run. Counters remain 4 of 5 runs, 2 of 3 completed visual passes, and 4 of 6 emails until the exact committed Preview, real test submission, report, and Email 5 all pass.
- Final fully calibrated committed evidence base: `ea03886e0f22e4968f44c283c2c57f2d307728a6`. It contains the verified UI, protected-Preview cookie bootstrap, committed app/evidence/config freshness guards, page-wide transient WebGL context-loss listener, live-only exact-payload idempotency probe, redacted duplicate-receipt assertions, transient-payload clearing, file-scoped trace disabling, explicit Production-host rejection, a counted-Run-5-only live-submission guard, a counted-Run-5-requires-live guard, and a live-requires-protected-target guard. It is approved as the evidence SHA for protected-Preview verification and counted Run 5.
- Scope completed: action-first Overview states with expandable evidence; objective-specific three-level hints with no point deduction; an in-app early-submit confirmation that names incomplete rubric categories; completed-grade suppression of early submission; compact locked-result and delivery-status Results hierarchy; ungraded-practice-only objectives, hints, Overview, and Pause copy; responsive modal cohesion; and a completed-depot overlap fix that prioritizes an unobserved nearby structure for Interact.
- The tracked evidence driver now records four Pass 3 diagnostics in addition to the two placement diagnostics and 12 required core PNGs. It verifies completed-grade wording, hint progression, Pause, locked practice, and the unchanged 11-panel report contract.
- Uncounted calibration A reached the central vacuole but failed because a completed depot could intercept the visible structure-inspection cue. The interaction priority was corrected. Calibration B then passed but was superseded after reviewers found completed-grade and practice-copy contradictions. Calibration C passed but was superseded when the quality gate required a React hint-state refactor. None of A-C is counted or accepted as final candidate evidence.
- Final fresh calibration: `output/playwright/ui-rollout-2026-07-16/03-visual-pass-3/calibration-d/`, local iPad-landscape WebKit emulation at 1024 x 768 with Touch Only and standard settings. It completed the visible-control route at 100% in 4.3 minutes and produced 12 core PNGs for 11 panels plus six diagnostic PNGs and a redacted `run.json`.
- Calibration D integrity passed: 18/18 SHA-256 hashes match; no identity, attempt/session ID, recipient, private URL, token, credential, or student data appears; no intended source file is newer than the manifest finish; page and console error lists are empty; exactly one intercepted synthetic request returned a matching accepted receipt; and two explicit WebGL/WebGL2 context checks passed.
- All 18 original PNGs were inspected at original resolution by the coordinator and independent reviewers. The completed 100% Grade contains no early-submit action. Practice is explicitly ungraded, uses explore/repair language, retains the locked result, and contains no submission instruction. Hint, Pause, Overview, and Results remain readable with no mandatory visual finding.
- Verification passed after the final source change: `npm run check` with formatting, lint, TypeScript, 44/44 unit/component/API tests, and production build; report-generator Python compilation; `git diff --check`; the complete serial desktop Chromium mission matrix 14/14; and the complete serial iPad-WebKit matrix 14/14.
- Independent Student UX/Visual Direction, Classroom Fit, Biology/Learning Content, Game Loop, Playtest/QA, Deployment/Ops, and Skeptical review lanes returned **GO** after the two mandatory copy contradictions and the evidence-freshness issue were corrected. This evidence is browser emulation, not physical-iPad proof.
- Pre-Preview re-gate: independent QA and Deployment/Ops reviewers found that the visual driver validated the Vercel bypass host but did not install the bypass cookie in its fresh browser context. The driver was corrected to perform the protected-Preview bootstrap itself and fail closed unless the cookie is present. `7257ad13abe194fcf2a875fbb9b2bd5fbbbf7bee` remains the verified UI candidate but is superseded as the final evidence-driver SHA.
- Uncounted Calibration E completed the full post-`4eee6e0` route in 4.6 minutes, but Deployment/Ops then identified that the exact transient Run 5 payload had to remain in test memory long enough to prove backend idempotency without creating a second raw row. The live-only driver now retries that same payload once, requires the original accepted receipt fields, keeps the visible-page submission count at one, and writes no payload or ID to evidence. Calibration E was superseded, and Calibration F completed the required fresh route.
- Final fresh pre-Preview calibration: `output/playwright/ui-rollout-2026-07-16/03-visual-pass-3/calibration-f/`, executed from committed app/evidence SHA `6071fee98aca626b9ec46641782bed6da2d88609`. It completed the full visible Touch Only route in 4.2 minutes with 12 core PNGs for 11 panels plus six diagnostics. Integrity passed: 18/18 hashes, zero redaction hits, zero page/console errors, one accepted intercepted submission, two current-context checks, zero context-loss events, and no newer intended source. The coordinator inspected all 18 original PNGs at original resolution with no mandatory finding. This is uncounted local emulation and does not prove the live backend or a physical iPad.
- Calibration F's gameplay and evidence passed, but the final QA re-gate found that a failing raw duplicate-attempt assertion or retry trace could persist the transient ID/payload outside `run.json`. The evidence suite now disables traces, compares only redacted receipt-match booleans, and clears the in-memory payload immediately after the live retry. Calibration F is superseded as the final harness evidence; a fresh full calibration is required from the next committed SHA.
- Uncounted Calibration G failed before navigation because Playwright requires the evidence suite's trace override at file scope rather than inside the describe group. The override was moved to the supported top-level position. Calibration G produced no accepted evidence and performed no submission; a fresh Calibration H is required from the next committed SHA.
- Calibration H at `eeec2f9b7334a682ab949cccb242e294ac47629f` passed its complete local route, but Deployment/Ops then found that the bypass allowlist still admitted the Production hostname before the later synthetic-payload assertion. Calibration H was superseded. The committed evidence harness now rejects Production before any request and permits live submission only for counted Run 5.
- Calibration I at `17af812a13c6a1683ede7df7d60e19759f1bf6fd` passed its complete local route, but QA then found that counted Run 5 could still begin in intercepted-local mode and that live mode could be requested without a protected Preview target. Calibration I was superseded. The committed evidence harness now also requires counted Run 5 to be live and live mode to have the approved protected target plus bypass secret before test execution.
- Final fresh local gate: `output/playwright/ui-rollout-2026-07-16/03-visual-pass-3/calibration-j/`, executed from committed app/evidence SHA `ea03886e0f22e4968f44c283c2c57f2d307728a6`. It completed the full visible Touch Only route in 4.1 minutes with 12 core PNGs for 11 panels plus six diagnostics. Integrity passed: 18/18 SHA-256 hashes, zero sensitive-pattern hits, zero page/console errors, one accepted intercepted submission, two current-context checks, zero context-loss events, no trace archive, and no intended source newer than the manifest finish. Four negative preflights fail closed before test execution: Production target, non-Run-5 live mode, Run 5 without live mode, and live Run 5 without a protected target. The coordinator inspected all 15 changed original PNGs at original resolution; the remaining three exactly match already approved Calibration I originals. There is no clipping, overlap, missing text, black boxes, or mandatory visual finding. Calibration J is uncounted local emulation and does not prove the live backend or a physical iPad.
- Protected-Preview accessibility gate: `output/playwright/ui-rollout-2026-07-16/03-visual-pass-3/preview-accessibility-stabilized/`, executed from exact committed app/evidence SHA `4b1678d583e90274989e691235efd81ec371fbb4` against its Ready protected Preview after GitHub's Vercel check passed. The pre-production Vercel Toolbar is Off so its unused feedback script cannot conflict with the app Content Security Policy; the Production toolbar setting and Production deployment remain untouched. The 1024 x 680 Touch Only profile visibly applied large text, high contrast, reduced motion, and mute. It completed the full route in 3.5 minutes with 12 core PNGs plus eight diagnostics. Integrity passed: protected-Preview target label, 20/20 SHA-256 hashes, 13 semantic assertions, zero sensitive-pattern hits, zero page/console errors, one accepted intercepted-only submission, three graphics checks, zero context-loss events, and no trace archive. This is uncounted browser emulation, not a physical-iPad result.
- Superseded Preview attempts remain uncounted: an exact-Preview route first exposed the Vercel Toolbar CSP error; the next clean route passed but exposed a manifest target-label defect; a later exact-SHA route exposed the fixed-duration vacuole-inspection flake. The Toolbar was disabled only for pre-production, the manifest now keys its target to the authenticated Preview, and vacuole evidence now uses the bounded Recenter plus visible Inspect-label route. A counted-Run-5 preflight without Git on the isolated runner path stopped before browser launch, and the following attempt was stopped before submission when Deployment/Ops required this durable checkpoint first. Live Sheet verification confirmed both attempts left the backend unchanged.
- A later uncounted live attempt reached a 100% result and accepted receipt but stopped before the duplicate probe because the harness incorrectly expected the production-shaped browser payload to carry `isTest=true`. The authenticated Sheet proved the Preview proxy correctly forced the stored row to `IsTest=TRUE`, and `BestResults` remained empty. The append-only synthetic row is preserved without identifiers. QA and Deployment/Ops approved the corrected trust-boundary assertion: the browser field must be exactly false, the non-production proxy forces true before Apps Script, and the external Sheet gate proves stored classification and exclusion. The private pre-run baseline is now two raw test rows and zero best rows.

### Visual Pass 3 validation and counted UI rollout Run 5 - verified 2026-07-16

- Status: **passed Visual Pass 3 as 3 of 3 and counted Run 5 as 5 of 5**. Email 5 was sent successfully with the verified PDF; rollout emails are 5 of 6.
- Application commit: `f64fb5301d16f2275d4fc35297d1e4ed2ed3d9f5`. Evidence harness commit: `1e0b68b4b93eb557588b1184b122f8800c82653e`.
- Profile: exact Ready protected Vercel Preview, iPad-landscape WebKit browser emulation, 1024 x 768, Touch Only, standard settings. This is not physical-iPad evidence.
- Evidence: `output/playwright/ui-rollout-2026-07-16/03-visual-pass-3/run-05-counted-verified/` contains 12 core PNGs for the required 11 report panels, six diagnostic appendices, and a redacted `run.json`. All 18 SHA-256 hashes match; the evidence contains no identity, attempt/session ID, recipient, private URL, token, credential, or student data.
- Real-control and semantic gates passed at 100% in 4.3 minutes: actual Touch Only tutorial practice; visible Pause/Resume with stopped active time; blocked-to-valid placement through visible movement; Remove/replace/reinspect with restored full credit; all eight nearby Inspect + Interact evidence events; objective-aware hints; locked ungraded practice; drought observation; external-water restoration; recovery; and visible final submission.
- Submission and graphics gates passed: the production-shaped browser made exactly one submission request and received an accepted receipt; the Preview proxy forced test classification; retrying the exact transient payload returned the original receipt without a second page submission; two explicit graphics-context checks passed with zero losses; and page/console error lists are empty.
- Authenticated Sheet verification passed: exactly three append-only `RawSubmissions` rows exist, all three are test rows, the newest row is completed at 100%, the next raw row remains empty after the duplicate probe, and `BestResults` has zero data rows. No real student data was submitted.
- The coordinator inspected all 18 original PNGs at original resolution. The accepted partial hotbar edge remains an intentional horizontal-scroll affordance; there is no clipping, overlap, missing report text, black-box corruption, or mandatory visual finding.
- Independent Playtest/QA, Deployment/Ops, Biology/Learning Content, Classroom Fit, Game Loop, Student UX/Visual Direction, and Skeptical review lanes all returned **GO with no mandatory findings**. They retained the physical school-iPad, Safari/WebGL soak, multitouch, orientation/background, school-Wi-Fi, hardware-keyboard, and student-completion gates.
- The 19-page mobile report `output/pdf/build-a-living-cell-ui-rollout-run-05-visual-pass-3-final-preview.pdf` was rendered back to 19 PNGs and inspected page by page at original resolution. It has no clipping, overlap, missing text, black boxes, or unreadable content. Report SHA-256: `0542a759c587dd03d30f643732424c9a20f99db3a15c5a25574063070f754318`.

### Final Five-Run, Three-Pass rollout audit - verified 2026-07-16

- Status: **complete**. Counted runs are 5 of 5, visual passes are 3 of 3, and all 6 rollout emails are verified sent with one correct PDF attachment each. The final report was regenerated and inspected against its exact committed audit checkpoint before Email 6.
- Local automated gate passed: formatting, lint, TypeScript, 44 of 44 Vitest/component/API tests, and the production build. The main UI bundle is 258.95 kB / 79.11 kB gzip; the lazy Babylon bundle remains 1,442.19 kB / 333.62 kB gzip and is retained as a physical-device measurement gate.
- Full local Playwright gate passed 28 of 28 applicable browser scenarios in desktop Chromium and emulated iPad WebKit. Four environment-dependent `@live`/visual-rollout cases were intentionally skipped because their protected target and counted-run variables were not supplied to the ordinary matrix. The four evidence-driver fail-closed preflights also passed: Production forbidden, live restricted to Run 5, Run 5 requires live mode, and live mode requires the protected target plus bypass.
- Evidence integrity passed across all five counted manifests: 60 core PNGs represent 55 report panels, 12 diagnostic PNGs produce 72 total images, all 72 SHA-256 hashes match, page/console error lists are empty, graphics gates passed with zero context loss, and each run made exactly one visible-page submission. All manifests explicitly mark `physicalDeviceEvidence=false`.
- Report integrity passed across the five run reports: 77 rendered pages were checked, with no sensitive-pattern hits, replacement glyphs, clipping, overlap, missing text, black-box corruption, or unreadable report content. Original-resolution review was used to resolve preview-viewer artifacts rather than treating them as source defects.
- Deployment/backend gate remains valid: the exact counted Run 5 application SHA `f64fb5301d16f2275d4fc35297d1e4ed2ed3d9f5` is a Ready protected Preview, not Production. Runtime/UI source is unchanged from the exact protected accessibility gate at `4b1678d583e90274989e691235efd81ec371fbb4`. The private Sheet still has three raw synthetic rows, all test-classified, no duplicate fourth row, and zero best-result rows.
- Delivery integrity passed: Sent Mail contains exactly five rollout self-sends before the final audit, each with one PDF attachment. No prior run email needs to be retried or resent.
- Baseline-versus-final review at matching 1024 x 768 Touch Only standard settings found clearer identification, touch tutorial, HUD hierarchy, objective/depot guidance, function-specific evidence, Overview, vacuole/turgor feedback, drought/recovery chain, and locked Results/practice state. The mission still uses real navigation, gathering, placement, correction, inspection/interaction, removal/rebuilding, and system repair rather than quiz interruption.
- Biology/classroom scope passed: exactly the approved eight structures, cytoplasm as a fill state, wall outside membrane, both chloroplasts and mitochondria required, Unit 1 function language, drought as a homeostasis challenge, and no ER, Golgi, Unit 2 terminology, or ordinary quiz interruptions.
- Final Playtest/QA, Classroom Fit, Deployment/Ops, Skeptical, Biology/Learning Content, Student UX/HUD, Visual Direction, and Game Loop review lanes returned **GO with no remaining P0-P2 finding**. The initial QA P2 was a stale backend checklist description; it was corrected to distinguish the production-shaped client flag from Preview proxy-forced test classification and to leave live negative/retry/concurrency gates unchecked.
- Direct GitHub CLI status refresh returned transient HTTP 503 responses during the audit. Deployment/Ops independently observed the remote `verify` and `browser-tests` checks green, and the complete local automated/browser gates passed. Treat the CLI 503 as an availability note rather than a product-test failure.
- Final report verification passed: `output/pdf/build-a-living-cell-ui-rollout-final-audit.pdf` has 20 letter-sized pages and SHA-256 `5cdb200dd3ece22fa687a870073209f35609d4436b4833f56e77b462207324e8`. The new cover was inspected at original resolution with no clipping, overlap, missing text, black boxes, or unreadable content. A fresh same-renderer comparison proved pages 2-20 pixel-identical to the 19-page verified Run 5 source report. Text extraction found no email address, public/private URL, attempt/session ID, proxy key, Sheet ID, Apps Script URL, or replacement glyph.

## 7. Current active phase and exact remaining work

Active phase: **Approved voxel-adventure rebuild — Phase 1 isolated gameplay proof complete; Phase 2 voxel foundation not started**.

The previous Five-Run, Three-Pass rollout is complete and none of its runs or six emails should be repeated. Its Biology, scoring, persistence, backend, accessibility, and classroom-flow evidence remains historical functional evidence.

Phase 1 passed its code, production-isolation, real-control browser, original-resolution visual, Unit 1 Biology, classroom-fit, touch-recovery, graphics-loss, and independent swarm gates. The graded mission and backend remain preserved.

The next bounded work, when resumed, is Phase 2:

1. Extract pure world, block, inventory, pickup, and target-placement models from the disposable proof without coupling them to the graded store.
2. Add a tested voxel grid raycast, collision and auto-step, target-face placement, pooled pickups, and regional dirty-mesh updates without building a general chunk engine.
3. Design the future save-schema adapter before any proof state enters IndexedDB.
4. Preserve the Phase 1 first-person presentation, Unit 1 metaphor safeguards, input-reset behavior, 56 px controls, production isolation, and original assets.
5. Keep Production unpromoted. Phase 2 must pass its own code, browser, visual, Biology, classroom, and skeptical gates before the boundary vertical slice begins.

## 8. Known risks, failures, and blockers

- **Live backend residual gate:** private Sheet creation, Apps Script deployment, Preview configuration, accepted receipt, duplicate idempotency, and test-row exclusion are verified. Live rejected/retry/concurrency cases remain before real-student use.
- **Vercel student-device access blocker:** the preview is Ready, and protected Playwright testing now passes without making the preview public or replacing the Hobby account's existing share link. A separate supervised access route is still required for the physical school iPad.
- **Physical-device blocker:** no actual school iPad evidence exists for load time, sustained 30 FPS, simultaneous move/look/interact, orientation/background recovery, Low mode, or 20-minute WebGL soak.
- **School-network blocker:** school Wi-Fi load time and live Apps Script receipt behavior are unverified.
- **Classroom-evidence blocker:** the 80% independent completion and 70% active-gameplay-time acceptance targets require real student playtesting.
- **Payload risk:** Babylon is isolated in a lazy bundle but remains the largest download. Low mode and real-device evidence are mandatory before release.
- **Rate limiting:** Apps Script rate limiting is best effort, not an authentication boundary. Assignment tokens remain routing data rather than secrets.
- **Shared-iPad privacy risk:** a pending delivery necessarily preserves the earlier attempt payload, including its student identity, until a receipt arrives. Before classroom use, verify that starting a new student session cannot display or attach that prior identity while background delivery continues.
- **Voxel-proof isolation constraint:** Phase 1 verified no mission store, save envelope, payload, timer, identity, IndexedDB, or backend mutation. Phase 2 must preserve that boundary until an explicit, versioned integration adapter is tested.
- **Visual-direction constraint:** Phase 1 passed the bright first-person block-building gate. Later phases must preserve it rather than collapsing back into the superseded dark laboratory or a decorative-pickaxe overlay.
- **Biology-metaphor risk:** mining is limited to clearly labeled model-building supplies. Organelles are not ores, cytoplasm is not a mineable solid, and no recipe represents real cell construction.
- **Asset gate:** all block textures, tool geometry, UI, sounds, and future prefabs must be original. Optional audio and optimized assets remain constrained by physical-device measurements.

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
- **2026-07-16 counted Run 2 checkpoint:** Playtest/QA, Student UX/Visual Direction, and Classroom Fit independently approved the 12 original PNGs, redacted manifest, and verified 13-page report. All returned GO with no mandatory findings. The coordinator accepted the then-observed near-camera occlusion, distant depot/structure labels, chamber wayfinding, placement/function feedback, and drought/recovery cues as bounded Visual Pass 2 work; the later “oversized ribosome” attribution was corrected. Dense Overview layout remains bounded to Visual Pass 3.
- **2026-07-16 Visual Pass 2 candidate checkpoint:** visual, Playtest/QA, and classroom/Biology reviewers independently inspected source, the redacted `calibration-t` manifest, and all 14 original PNGs. Initial NO-GO findings identified disappearing prior structures, stale `Observed` wayfinding, missing placement appendices, an under-sensitive reload timer test, obstructed vacuole evidence, and contradictory wall-placement copy. The coordinator corrected each finding and reran the entire fresh real-control calibration. All three final re-gates returned GO. Lower-priority Overview/stuck-prompt density and contextual action accessible names remain assigned to the later accessibility/Pass 3 work.
- **2026-07-16 counted Run 3 checkpoint:** Playtest/QA, Classroom/Biology, Student UX/Visual Direction, and Skeptical reviewers independently approved the committed-sha manifest, all 14 original evidence PNGs, and the 15-page rendered report. All returned GO with no mandatory evidence or report findings. The coordinator accepted the Panel 5 edge crop as non-blocking, standardized the report's Keyboard + Touch label, and retained Overview density, contextual accessible action names, modal stuck-prompt overlap, and minor hotbar polish for Run 4/Visual Pass 3.
- **2026-07-16 counted Run 4 checkpoint:** Playtest/QA, Deployment/Ops, Student UX/Visual Direction, Classroom Fit, Biology/Learning Content, Game Loop, and Skeptical review lanes independently approved the committed-sha manifest, all 16 original evidence PNGs, and the accessibility profile. All returned GO with no P0-P2 blocker. The coordinator accepted partial edge hotbar items as an intentional horizontal-scroll affordance and retained only the approved Visual Pass 3 screen-cohesion scope. Emulated WebKit evidence remains explicitly distinct from physical school-iPad proof.
- **2026-07-16 Visual Pass 3 local checkpoint:** Student UX/Visual Direction, Classroom Fit, Biology/Learning Content, Game Loop, Playtest/QA, Deployment/Ops, and Skeptical lanes reviewed the candidate in read-only mode. Initial NO-GO findings identified a completed 100% Grade mislabeled as early submission, practice surfaces that still instructed submission, a React state-reset lint violation, and stale evidence after each correction. The coordinator hid early submission after mission completion, made objective/hints/Pause/Overview practice-specific, replaced the effect-driven hint reset with objective-keyed derived progress, and reran the entire fresh real-control calibration. All final re-gates returned GO on Calibration D with no mandatory finding.
- **2026-07-16 Visual Pass 3 evidence-hardening checkpoint:** Playtest/QA and Deployment/Ops reviewers independently found and closed protected-Preview cookie bootstrap, app/evidence/config freshness, WebGL context-loss, exact-payload idempotency, raw-ID failure-output, trace-persistence, Production-host, non-Run-5 live-submission, Run-5-without-live, and live-without-target risks. Calibration J at `ea03886e0f22e4968f44c283c2c57f2d307728a6` passed the complete local real-control route and original-resolution visual inspection. This is a local-emulation GO for push and protected Preview, not physical-iPad proof.
- **2026-07-16 protected-Preview accessibility checkpoint:** Playtest/QA returned GO on exact SHA `4b1678d583e90274989e691235efd81ec371fbb4`, including 20/20 hashes, protected-target labeling, zero errors, zero context loss, and the visible-control vacuole correction. Deployment/Ops returned NO-GO only on checkpoint order, requiring this handoff and the live Sheet baselines to be committed before enabling the counted backend run. The coordinator stopped the in-progress attempt before submission, verified the Sheet stayed at one raw test row and zero best rows, and accepted the stricter ordering gate.
- **2026-07-16 Preview test-classification checkpoint:** Playtest/QA and Deployment/Ops independently confirmed that `api/submit.ts` is the authoritative trust boundary: production-shaped client input remains false while non-production forwarding is forced true. The deployed Sheet proved the accepted uncounted row was stored as test data and excluded from `BestResults`. After requiring exact raw-boolean preservation and an explicit fresh-browser-context gate, both reviewers returned GO for evidence SHA `1e0b68b4b93eb557588b1184b122f8800c82653e`, a fresh exact-Preview run, and the updated two-raw/zero-best baseline; no backend code change, deletion, or identifier persistence is permitted.
- **2026-07-16 counted Run 5 checkpoint:** Playtest/QA, Deployment/Ops, Biology/Learning Content, Classroom Fit, Game Loop, Student UX/Visual Direction, and Skeptical lanes approved the exact protected-Preview manifest and all 18 original PNGs. The coordinator accepted the run at app SHA `f64fb5301d16f2275d4fc35297d1e4ed2ed3d9f5` with evidence SHA `1e0b68b4b93eb557588b1184b122f8800c82653e`: one accepted visible submission, exact-payload original-receipt idempotency, three raw test rows, no fourth duplicate row, zero best-result rows, zero errors, and zero WebGL loss. All lanes explicitly retained physical-device and classroom gates.
- **2026-07-16 final rollout audit:** Playtest/QA, Classroom Fit, Deployment/Ops, Skeptical, Biology/Learning Content, Student UX/HUD, Visual Direction, and Game Loop lanes independently reviewed the completed run set, original-resolution baseline/final evidence, reports, automated tests, deployment/backend posture, and remaining release gates. QA's only initial P2 was a stale classroom-release checklist description of test classification; the coordinator corrected it to document the production-shaped client plus Preview proxy-forced `isTest=true` behavior and to leave unproved live failure cases open. The QA re-gate and every other lane returned **GO with no P0-P2 finding**. No fourth visual pass is authorized or needed from emulated evidence; physical-device and student evidence remain external gates.
- **2026-07-19 voxel-rebuild planning checkpoint:** Visual/Game Loop, Gameplay/Frontend and iPad QA, Biology/Classroom Fit, Student UX, and Skeptical lanes independently agreed that the laboratory cannot be cosmetically polished into the approved target. The coordinator locked a separate proof route so the verified mission remains intact. The proof requires real crosshair targeting, a functional original builder pick, visible mining progress, a physical drop, collection, compact hotbar feedback, target-based placement, and a remove/collect/replace repair loop. Cosmetic pickaxe overlays, proximity collection, player-foot placement, copied Minecraft assets, organelle ores, chunk streaming, crafting, combat, and block grinding are rejection cases.
- **2026-07-19 voxel Phase 1 checkpoint:** Visual/Game Loop, Technical/QA, Biology/Classroom Fit, Student UX, and Skeptical lanes independently inspected current source and all original PNG evidence. Initial mandatory findings identified a hidden compact-height fictional-model disclaimer, wall wording that blurred membrane and wall functions, a held item after inventory reached zero, paused/stopped keyboard capture, and a held joystick surviving Pause. The coordinator corrected each issue and reran the complete keyboard/drag-look and touch-only routes plus targeted Pause and context-loss regressions. Every final lane returned **GO with no mandatory finding**. The large diagonal anchor wireframe remains a nonblocking Phase 2 refinement; original-resolution inspection, not composite-viewer artifacts, remains authoritative.

## 10. Future phase sequence and acceptance gates

1. **Phase 1 — isolated voxel proof (complete locally):** bright bounded yard, real first-person controls, target outline, original visible pick, mine/drop/collect/hotbar/place/remove/replace loop, original-resolution evidence, and swarm re-gate.
2. **Phase 2 — voxel foundation:** pure world/block/inventory models, tested grid raycast, collision and auto-step, regional dirty-mesh renderer, target-face placement, pooled pickups, and save-schema planning without a general chunk engine.
3. **Phase 3 — boundary vertical slice:** voxel plant-cell foundation, six outer wall modules, six inner membrane modules, cytoplasm fill, invalid correction, scoring adapter, and real-control browser evidence.
4. **Phase 4 — complete structure mission:** original voxel prefabs for nucleus, ribosomes, mitochondria, chloroplasts, and central vacuole with in-world Unit 1 function evidence.
5. **Phase 5 — drought and classroom integration:** reversible vacuole/turgor/wilt sequence, minimal HUD, real-world tutorial, accessibility, timer, hints, results, persistence migration, and backend compatibility.
6. **Phase 6 — release candidate:** complete Chromium/WebKit matrices, protected Preview, backend regression, swarm audit, and new voxel-rebuild evidence packet.
7. **Physical device and classroom:** oldest available iPad load/soak, typical iPad ≥30 FPS, touch-only simultaneous control, orientation/background/reload recovery, school Wi-Fi, hardware keyboard, ≥80% independent completion, ≥70% active game actions, and discoverable drought recovery.
8. **Production:** promote only when all applicable gates are recorded as passed.

Failed gates trigger correction and retest. No user approval is needed between these steps. Missing credentials, physical-device evidence, school-network evidence, or a required architecture/data-destination expansion are external blockers.

## 11. Backend/data destination status

- Browser contract: implemented with versioned payloads, identity limits, attempt/session IDs, rubric breakdown, outcome flags, active time, hint data, versions, and `isTest`.
- IndexedDB: versioned save envelope, migrations, five-second/event autosave, atomic queue preparation, queue replay, diagnostic export, and safe reset.
- Same-origin Vercel proxy: implemented at `/api/submit`; protected Preview-to-Apps-Script transport returned a valid accepted receipt after the ESM import fix.
- Apps Script: source, validation, idempotency, locking, append-only `RawSubmissions`, derived `BestResults`, duplicate receipt recovery, reconciliation, sanitization, and runbook are implemented.
- Dedicated Sheet and deployed web app: live under the school-domain owner. The Sheet is private and has only `RawSubmissions` and `BestResults`; the web app executes as the owner and accepts anonymous requests guarded by the proxy key and validation.
- Vercel environment values: Apps Script URL and proxy key are configured as Sensitive and Preview-only. Production remains unconfigured.
- Live evidence: three append-only synthetic raw rows exist after the backend setup, one safe uncounted Preview attempt, and counted Run 5. All are `IsTest=TRUE`; the counted Run 5 duplicate retry returned the original receipt without a fourth row; and `BestResults` has zero data rows.
- No real student data has been submitted. Live and automated payloads are synthetic; Preview forces `isTest=true`.

## 12. Restart instructions for a new LLM/Codex instance

1. Read current user instructions, the nearest `AGENTS.md`, `KEYUR_WORKFLOW.md`, and this file completely.
2. Verify `git status`, current branch, HEAD/upstream, package lock, tests, GitHub Actions, deployment URLs, and backend state. Never trust stale prose over live evidence.
3. Read the archived planning handoff only when a historical decision is missing here.
4. Resume with voxel-rebuild Phase 2 as recorded in section 7. Do not rebuild or recount the passed Phase 1 proof unless its source changes. The Five-Run, Three-Pass rollout remains complete historical functional evidence at 5/5 counted runs, 3/3 visual passes, and 6/6 verified emails; do not rerun, recount, or resend it. The active presentation target is the bounded first-person voxel experience. Use read → plan → implement → test.
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
