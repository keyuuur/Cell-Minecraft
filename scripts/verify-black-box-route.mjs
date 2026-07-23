import { readFile } from 'node:fs/promises';

const files = ['e2e/mission-black-box.spec.ts', 'e2e/helpers/visibleStudentControls.ts'];
const forbidden = [
  ['internal mission attributes', /data-mission-/i],
  ['test-mode URL', /\?test=1/i],
  ['IndexedDB access', /indexedDB/i],
  ['Zustand access', /zustand|useIntegratedGameStore/i],
  ['development stage tools', /Advance test stage|Set active timer to limit/i],
  ['gameplay state evaluation', /page\.evaluate/i],
  ['scene/controller bridge access', /bridge|sceneController|controllerRef/i],
];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) throw new Error(`BLACK_BOX_BOUNDARY_VIOLATION:${file}:${label}`);
  }
}

process.stdout.write(`Verified visible-only black-box boundary across ${files.length} files.\n`);
