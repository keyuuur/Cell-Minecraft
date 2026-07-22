# Apps Script V2 — staged only

This directory is a local, non-deployed Contract-V2 candidate. It is not the
currently deployed Apps Script project and must not be copied or deployed
until the Data Safety local gate, explicit existing-Sheet verification, and
protected-Preview cutover gate all pass.

Safety boundaries:

- Runtime `doPost` opens only the already configured school-owned spreadsheet.
- Runtime code verifies exact `RawSubmissions` and `BestResults` headers and
  fails closed. It never creates, deletes, repairs, migrates, or rebinds a
  spreadsheet or sheet.
- `setupSubmissionDestination()` is idempotent verification only; it creates
  nothing.
- `migrateSubmissionDestinationV2()` is a separate explicit operation. It
  accepts only the exact V1 header shape, refuses any non-test raw row or any
  existing BestResults data row, appends the three approved raw headers, and
  installs the derived V2 BestResults header. Historical raw row contents are
  not rewritten.
- Contract V2 requires the proxy-owned environment/test classification,
  canonical SHA-256 digest, server-recomputed rubric score, composite
  idempotency, first-identity session binding, and session-based BestResults.
- Production remains unconfigured and unpromoted.

Future external gate:

1. Verify the authenticated school-domain account and exact existing Sheet.
2. Back up and inspect headers and every unexpected/non-test row.
3. Run the explicit in-place migration only if the gate permits it.
4. Deploy a new Apps Script version and connect only a protected Vercel Preview.
5. Run accepted, exact duplicate, altered duplicate, malformed, interrupted,
   concurrency, deterministic rebuild, and test-exclusion probes.
6. Stop and roll back on any identity, header, row-count, or destination drift.
