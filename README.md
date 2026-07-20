# Build a Living Cell

A bounded, Minecraft-inspired construction mission for ninth-grade Biology. Students build a plant cell, observe how its structures affect the system, diagnose water loss, and restore stability.

The public classroom title is **Build a Living Cell**. This is an independent educational project. It is not an official Minecraft product, is not approved by or associated with Mojang or Microsoft, and uses no copied Minecraft assets, logos, fonts, sounds, icons, or interface art.

## Local setup

```powershell
npm install
npm run dev
```

Open the address printed by Vite. Add `?test=1` to expose labeled, ungraded test controls in a non-production build.

### Development-only voxel foundation check

The voxel rebuild includes an isolated first-person foundation check at:

```text
http://localhost:5173/?proof=voxel
```

The check is ungraded, keeps progress in memory only, collects no identity, and
does not load the mission store, IndexedDB saves, submission queue, or backend.
Its fixed `24 × 12 × 24` world drives collision, auto-step, grid raycasting,
target-face placement, pooled pickups, the nine-slot hotbar, and nine regional
meshes. A versioned future runtime snapshot is validated in pure TypeScript but
is not connected to IndexedDB. The route is available only from the Vite
development server; production builds show a safe “proof unavailable” page
instead.

## Quality checks

```powershell
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

To rerun the production-safe startup flow against a Vercel-protected preview instead of the local server, create a project-scoped **Protection Bypass for Automation** secret in Vercel and keep it only in your local environment:

```powershell
$env:E2E_BASE_URL="https://your-preview-url.vercel.app"
$env:VERCEL_AUTOMATION_BYPASS_SECRET="paste-the-test-only-secret-here"
npx playwright test -g "@live"
Remove-Item Env:E2E_BASE_URL
Remove-Item Env:VERCEL_AUTOMATION_BYPASS_SECRET
```

Never save or commit the bypass secret. This path leaves Vercel Authentication enabled and does not consume or replace the Hobby account's single shareable link.

## Project boundaries

- Eight required structures only: cell wall, cell membrane, cytoplasm, nucleus, ribosomes, mitochondria, chloroplasts, and large central vacuole.
- No accounts, multiplayer, combat, infinite terrain, crafting tree, leaderboard, PWA, or advanced organelles.
- Student identity is limited to first name, last initial, and period.
- Local progress is kept in IndexedDB. Classroom submissions use the same-origin `/api/submit` endpoint when the Apps Script destination is configured.

See [LLM_PROJECT_HANDOFF.md](./LLM_PROJECT_HANDOFF.md) for the live project state and restart instructions.
Use [docs/CLASSROOM_RELEASE_CHECKLIST.md](./docs/CLASSROOM_RELEASE_CHECKLIST.md) for the physical-iPad, backend, classroom-pilot, and production gates.
