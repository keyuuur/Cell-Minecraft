# Classroom Release Checklist

Use synthetic test identities only until the dedicated teacher-owned results Sheet and Apps Script endpoint have passed their transport checks. Record the device model, iPadOS version, browser version, date, network, and result for every physical test.

## Physical school iPad gate

- [ ] Open the Vercel preview on the oldest available student iPad in landscape.
- [ ] Reach playable movement within 10 seconds on school Wi-Fi.
- [ ] Confirm the typical student iPad sustains at least 30 FPS during construction and drought effects.
- [ ] Complete movement + drag-look + Interact with Keyboard + Touch.
- [ ] Complete movement + drag-look + Interact with Touch Only, including simultaneous joystick and look.
- [ ] Confirm the page does not scroll or zoom during gameplay and no held input becomes stuck.
- [ ] Test pause, background/foreground, blur, orientation change, and reload recovery without losing state or active time.
- [ ] Run the stress scene in Low mode and confirm the warning is understandable.
- [ ] Complete a 20-minute soak without a crash or WebGL context loss.
- [ ] Repeat with large text, high contrast, reduced motion, and mute enabled.

Before the physical test, run the `@live` Playwright gate against the exact Vercel preview URL in both configured browser profiles. Use a local `VERCEL_AUTOMATION_BYPASS_SECRET` so Vercel Authentication can remain enabled. This checks the production-safe identification, tutorial, scene-loading, and mission-start path without exposing development-only stage controls. It does not replace real touch, performance, school-network, orientation, backgrounding, or soak tests.

## Backend gate — synthetic data only

- [ ] Create a dedicated teacher-owned results spreadsheet.
- [ ] Deploy `apps-script/Code.gs` by following `apps-script/README.md`.
- [ ] Configure the Vercel environment values without committing them.
- [ ] Submit one `isTest=true` attempt through the Vercel preview and receive an accepted receipt.
- [ ] Retry the same `attemptId` and receive the original duplicate receipt with one raw row.
- [ ] Confirm test rows never enter `BestResults`.
- [ ] Verify malformed, oversized, formula-like, unknown-assignment, incompatible-version, and contradictory-outcome payloads are rejected or sanitized.
- [ ] Simulate an interrupted connection, reload, and confirm the queued result submits once.
- [ ] Confirm delivery failure never erases the completed result or diagnostic export.

## Classroom pilot gate

- [ ] Run a small first-time ninth-grade pilot without projecting student identity.
- [ ] At least 80% finish within 15 active minutes without teacher rescue.
- [ ] At least 70% of mission time is movement, construction, observation, or repair.
- [ ] Students discover drought recovery from earlier vacuole/turgor evidence.
- [ ] Students can explain, at Unit 1 depth, the visible role of each of the eight required structures.
- [ ] No projector/public surface shows student names or private attempt details.
- [ ] Teacher setup, retry, fresh-attempt, timeout, early-submit, and result-breakdown flows are practical within a class period.

## Production promotion

- [ ] Review the latest `LLM_PROJECT_HANDOFF.md` and confirm every blocker is resolved or explicitly accepted.
- [ ] Replace prototype procedural organelles with optimized original glTF prefabs, then rerun the full performance gate.
- [ ] If optional original audio is added, confirm mute works and no information is audio-only.
- [ ] Run `npm run check` and `npm run test:e2e` against the release commit.
- [ ] Promote the verified deployment and record the production URL and commit in the handoff.
