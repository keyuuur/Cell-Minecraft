import { readFile } from 'node:fs/promises';

const files = ['e2e/mission-black-box.spec.ts', 'e2e/helpers/visibleStudentControls.ts'];
const forbidden = [
  ['internal mission attributes', /data-mission-/i],
  ['test-mode URL', /\?test=1/i],
  ['IndexedDB access', /indexedDB/i],
  ['Zustand access', /zustand|useIntegratedGameStore/i],
  ['development stage tools', /Advance test stage|Set active timer to limit/i],
  ['gameplay state evaluation', /page\.evaluate/i],
  ['cross-context binding', /exposeBinding|exposeFunction/i],
  ['scene/controller bridge access', /bridge|sceneController|controllerRef/i],
];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) throw new Error(`BLACK_BOX_BOUNDARY_VIOLATION:${file}:${label}`);
  }

  if (file === 'e2e/mission-black-box.spec.ts') {
    const declaredTests = [...source.matchAll(/\ntest\('/g)].map((match) => match.index ?? -1);
    const releaseRoute = source.indexOf("test('@release-blackbox ");
    if (releaseRoute < 0 || declaredTests.at(-1) !== releaseRoute - 1) {
      throw new Error('BLACK_BOX_ROUTE_MUST_REMAIN_LAST_FOR_WORKER_BROWSER_CLEANUP');
    }
  }
}

process.stdout.write(`Verified visible-only black-box boundary across ${files.length} files.\n`);
