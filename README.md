# Build a Living Cell

A bounded, Minecraft-inspired construction mission for ninth-grade Biology. Students build a plant cell, observe how its structures affect the system, diagnose water loss, and restore stability.

The public classroom title is **Build a Living Cell**. This is an independent educational project. It is not an official Minecraft product, is not approved by or associated with Mojang or Microsoft, and uses no copied Minecraft assets, logos, fonts, sounds, icons, or interface art.

## Local setup

```powershell
npm install
npm run dev
```

Open the address printed by Vite. Add `?test=1` to expose labeled, ungraded test controls in a non-production build.

## Quality checks

```powershell
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

## Project boundaries

- Eight required structures only: cell wall, cell membrane, cytoplasm, nucleus, ribosomes, mitochondria, chloroplasts, and large central vacuole.
- No accounts, multiplayer, combat, infinite terrain, crafting tree, leaderboard, PWA, or advanced organelles.
- Student identity is limited to first name, last initial, and period.
- Local progress is kept in IndexedDB. Classroom submissions use the same-origin `/api/submit` endpoint when the Apps Script destination is configured.

See [LLM_PROJECT_HANDOFF.md](./LLM_PROJECT_HANDOFF.md) for the live project state and restart instructions.
Use [docs/CLASSROOM_RELEASE_CHECKLIST.md](./docs/CLASSROOM_RELEASE_CHECKLIST.md) for the physical-iPad, backend, classroom-pilot, and production gates.
