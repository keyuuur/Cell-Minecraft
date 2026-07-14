# Results backend setup

This folder is a Google Apps Script web app that writes to a dedicated private spreadsheet. Do not publish the Sheet or place its ID, the web-app URL, or the proxy key in Git.

1. Create or link an Apps Script project and copy `Code.gs` plus `appsscript.json` into it.
2. Run `setupSubmissionDestination()` once as the teacher account. Keep the returned Sheet private.
3. Generate a long random proxy key and run `configureProxyKey(theKey)` once.
4. Run `runSyntheticTest()` and confirm it returns a score of 100.
5. Deploy as a web app: execute as the deploying teacher; allow anonymous access because the Vercel proxy is the public caller.
6. Configure Vercel server-only environment variables `APPS_SCRIPT_SUBMISSION_URL` and `APPS_SCRIPT_PROXY_KEY`. Never prefix either with `VITE_`.
7. Submit synthetic `isTest=true` payloads first. Confirm duplicate attempt IDs create one raw row and that test rows never appear in `BestResults`.

`RawSubmissions` is append-only. `BestResults` keeps the highest score for assignment + period + normalized first name + last initial. That grouping is not a unique student identifier and can merge classmates with the same name and initial; `attemptId` remains the canonical idempotency key.

`RawSubmissions` is the committed source of truth. If `BEST_RESULTS_REBUILD_REQUIRED` appears in Script Properties, run `rebuildBestResults()`; it regenerates the derived table from raw rows without changing submissions. The session-based cache limit is only best-effort abuse deterrence because callers can create new session IDs. Monitor unexpected row-volume spikes and disable the web deployment if abuse is suspected.
