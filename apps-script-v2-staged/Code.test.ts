import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildForwardedSubmissionPayloadV2 } from '../src/backend/submissionV2.server';
import { canonicalizeForwardedSubmissionPayloadV2 } from '../src/contracts/submissionV2';
import { completeClientSubmissionV2 } from '../src/contracts/submissionV2.fixtures';
import type {
  ClientSubmissionPayloadV2,
  ForwardedSubmissionPayloadV2,
  SubmissionReceipt,
} from '../src/types/game';

const RAW_V1_HEADERS = [
  'ServerTimestamp',
  'AttemptId',
  'SessionId',
  'AssignmentId',
  'AssignmentVersion',
  'GameVersion',
  'FirstName',
  'LastInitial',
  'Period',
  'Score',
  'Completed',
  'Early',
  'Timeout',
  'ActiveTimeSeconds',
  'HintsUsed',
  'Objectives',
  'IsTest',
  'ReceiptJson',
];
const RAW_HEADERS = RAW_V1_HEADERS.concat([
  'ContractVersion',
  'PayloadDigest',
  'SourceEnvironment',
]);
const BEST_V1_HEADERS = [
  'StudentKey',
  'AssignmentId',
  'Period',
  'FirstName',
  'LastInitial',
  'BestScore',
  'Completed',
  'ServerTimestamp',
  'AttemptId',
];
const BEST_HEADERS = [
  'SessionKey',
  'AssignmentId',
  'Period',
  'FirstName',
  'LastInitial',
  'BestScore',
  'Completed',
  'ServerTimestamp',
  'AttemptId',
  'AssignmentVersion',
  'SessionId',
  'GameVersion',
  'IdentitySessionCount',
  'AmbiguousIdentity',
];

class FakeRange {
  constructor(
    private readonly sheet: FakeSheet,
    private readonly row: number,
    private readonly column: number,
    private readonly rowCount: number,
    private readonly columnCount: number,
  ) {}

  getValues(): unknown[][] {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from(
        { length: this.columnCount },
        (_, columnOffset) =>
          this.sheet.rows[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? '',
      ),
    );
  }

  setValues(values: unknown[][]): this {
    if (this.sheet.failNextSet) {
      this.sheet.failNextSet = false;
      throw new Error('SIMULATED_SHEET_WRITE_FAILURE');
    }
    if (values.length !== this.rowCount || values.some((row) => row.length !== this.columnCount)) {
      throw new Error('RANGE_SHAPE_MISMATCH');
    }
    values.forEach((sourceRow, rowOffset) => {
      const rowIndex = this.row - 1 + rowOffset;
      this.sheet.rows[rowIndex] ??= [];
      sourceRow.forEach((value, columnOffset) => {
        this.sheet.rows[rowIndex][this.column - 1 + columnOffset] = value;
      });
    });
    return this;
  }

  clearContent(): this {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      const rowIndex = this.row - 1 + rowOffset;
      this.sheet.rows[rowIndex] ??= [];
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        this.sheet.rows[rowIndex][this.column - 1 + columnOffset] = '';
      }
    }
    return this;
  }
}

class FakeSheet {
  rows: unknown[][];
  failNextSet = false;

  constructor(
    readonly name: string,
    headers: string[],
    rows: unknown[][] = [],
  ) {
    this.rows = [structuredClone(headers), ...structuredClone(rows)];
  }

  getName(): string {
    return this.name;
  }

  getLastRow(): number {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index]?.some((value) => value !== '' && value !== undefined)) return index + 1;
    }
    return 0;
  }

  getLastColumn(): number {
    return this.rows.reduce((maximum, row) => {
      for (let index = row.length - 1; index >= 0; index -= 1) {
        if (row[index] !== '' && row[index] !== undefined) return Math.max(maximum, index + 1);
      }
      return maximum;
    }, 0);
  }

  getRange(row: number, column: number, rowCount: number, columnCount: number): FakeRange {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  appendRow(row: unknown[]): void {
    this.rows.push(structuredClone(row));
  }
}

class FakeSpreadsheet {
  constructor(private readonly sheets: Map<string, FakeSheet>) {}

  getSheetByName(name: string): FakeSheet | null {
    return this.sheets.get(name) ?? null;
  }
}

interface ScriptApi {
  V2_RAW_HEADERS: string[];
  V2_BEST_HEADERS: string[];
  canonicalForwardedSubmissionV2_: (payload: ForwardedSubmissionPayloadV2) => string;
  digestForwardedSubmissionV2_: (payload: ForwardedSubmissionPayloadV2) => string;
  scoreObjectivesV2_: (
    objectives: ForwardedSubmissionPayloadV2['objectives'],
    completed: boolean,
  ) => ForwardedSubmissionPayloadV2['score'];
  bestRowsFromRawV2_: (rows: unknown[][]) => unknown[][];
  replaceBestRowsV2_: (sheet: FakeSheet, rows: unknown[][]) => void;
  doPost: (event: { postData: { contents: string } }) => FakeTextOutput;
  migrateSubmissionDestinationV2: () => unknown;
  setupSubmissionDestination: () => unknown;
}

class FakeTextOutput {
  constructor(readonly text: string) {}
  setMimeType(): this {
    return this;
  }
}

interface Harness {
  api: ScriptApi;
  raw: FakeSheet;
  best: FakeSheet;
  properties: Map<string, string>;
}

function createHarness(rawHeaders = RAW_HEADERS, bestHeaders = BEST_HEADERS): Harness {
  const raw = new FakeSheet('RawSubmissions', rawHeaders);
  const best = new FakeSheet('BestResults', bestHeaders);
  const properties = new Map<string, string>([
    ['SPREADSHEET_ID', 'configured-school-sheet'],
    ['PROXY_KEY', 'p'.repeat(24)],
  ]);
  const cache = new Map<string, string>();
  const scriptProperties = {
    getProperty: (key: string) => properties.get(key) ?? null,
    setProperty: (key: string, value: string) => properties.set(key, value),
    deleteProperty: (key: string) => properties.delete(key),
  };
  const context = createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    Array,
    RegExp,
    Error,
    PropertiesService: { getScriptProperties: () => scriptProperties },
    SpreadsheetApp: {
      openById: (id: string) => {
        if (id !== 'configured-school-sheet') throw new Error('WRONG_SPREADSHEET');
        return new FakeSpreadsheet(
          new Map([
            ['RawSubmissions', raw],
            ['BestResults', best],
          ]),
        );
      },
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key: string) => cache.get(key) ?? null,
        put: (key: string, value: string) => cache.set(key, value),
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm: string, value: string) =>
        Array.from(createHash('sha256').update(value, 'utf8').digest(), (byte) =>
          byte > 127 ? byte - 256 : byte,
        ),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text: string) => new FakeTextOutput(text),
    },
  });
  for (const file of ['ContractV2.gs', 'Code.gs']) {
    runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { api: context as unknown as ScriptApi, raw, best, properties };
}

function receipt(output: FakeTextOutput): SubmissionReceipt {
  return JSON.parse(output.text) as SubmissionReceipt;
}

function event(payload: ForwardedSubmissionPayloadV2) {
  return {
    postData: { contents: JSON.stringify({ proxyKey: 'p'.repeat(24), submission: payload }) },
  };
}

async function forwarded(
  overrides: Partial<ClientSubmissionPayloadV2> = {},
  environment: 'production' | 'preview' = 'preview',
) {
  return buildForwardedSubmissionPayloadV2(
    { ...completeClientSubmissionV2(), ...overrides },
    environment,
  );
}

describe('staged Apps Script V2 contract', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('matches the TypeScript canonical digest and rubric score', async () => {
    const payload = await forwarded();
    expect(harness.api.canonicalForwardedSubmissionV2_(payload)).toBe(
      canonicalizeForwardedSubmissionPayloadV2(payload),
    );
    expect(harness.api.digestForwardedSubmissionV2_(payload)).toBe(payload.canonicalDigest);
    expect(harness.api.scoreObjectivesV2_(payload.objectives, true)).toEqual(payload.score);
    expect(
      harness.api.scoreObjectivesV2_(
        {
          ...payload.objectives,
          membranePanels: 0,
          cytoplasm: false,
          nucleus: false,
          ribosomes: false,
          mitochondria: false,
          chloroplasts: false,
          centralVacuole: false,
          droughtDiagnosed: false,
          droughtObserved: false,
          recoveryRestored: false,
          effectCellWall: false,
          effectCellMembrane: false,
          effectCytoplasm: false,
          effectNucleus: false,
          effectRibosomes: false,
          effectMitochondria: false,
          effectChloroplasts: false,
          effectCentralVacuole: false,
        },
        false,
      ).placementContext,
    ).toBe(0);
  });

  it('matches empty and partial golden scoring and digest vectors', async () => {
    const emptyObjectives = {
      wallPanels: 0,
      membranePanels: 0,
      cytoplasm: false,
      nucleus: false,
      ribosomes: false,
      mitochondria: false,
      chloroplasts: false,
      centralVacuole: false,
      droughtDiagnosed: false,
      droughtObserved: false,
      recoveryRestored: false,
      effectCellWall: false,
      effectCellMembrane: false,
      effectCytoplasm: false,
      effectNucleus: false,
      effectRibosomes: false,
      effectMitochondria: false,
      effectChloroplasts: false,
      effectCentralVacuole: false,
    };
    for (const objectives of [
      emptyObjectives,
      { ...emptyObjectives, wallPanels: 6, effectCellWall: true },
    ]) {
      const payload = await forwarded({
        objectives,
        completed: false,
        early: true,
        timeout: false,
      });
      expect(harness.api.scoreObjectivesV2_(objectives, false)).toEqual(payload.score);
      expect(harness.api.canonicalForwardedSubmissionV2_(payload)).toBe(
        canonicalizeForwardedSubmissionPayloadV2(payload),
      );
      expect(harness.api.digestForwardedSubmissionV2_(payload)).toBe(payload.canonicalDigest);
    }
  });

  it('accepts once, returns the immutable original receipt, and rejects an altered duplicate', async () => {
    const payload = await forwarded();
    const accepted = receipt(harness.api.doPost(event(payload)));
    expect(accepted.status).toBe('accepted');
    expect(harness.raw.getLastRow()).toBe(2);
    expect(receipt(harness.api.doPost(event(payload)))).toEqual(accepted);
    expect(harness.raw.getLastRow()).toBe(2);

    const altered = await forwarded({
      attemptId: payload.attemptId,
      activeTimeSeconds: payload.activeTimeSeconds + 1,
    });
    const conflict = receipt(harness.api.doPost(event(altered)));
    expect(conflict).toMatchObject({ status: 'rejected', errorCode: 'IDEMPOTENCY_CONFLICT' });
    expect(harness.raw.getLastRow()).toBe(2);
  });

  it('rejects session identity reuse without leaking or mutating the first row', async () => {
    const first = await forwarded({}, 'production');
    expect(receipt(harness.api.doPost(event(first))).status).toBe('accepted');
    const secondClient = completeClientSubmissionV2();
    secondClient.attemptId = 'attempt-session-conflict';
    secondClient.firstName = 'Different';
    const second = await buildForwardedSubmissionPayloadV2(secondClient, 'production');
    const rejected = receipt(harness.api.doPost(event(second)));
    expect(rejected).toMatchObject({
      status: 'rejected',
      errorCode: 'SESSION_IDENTITY_CONFLICT',
    });
    expect(harness.raw.getLastRow()).toBe(2);
  });

  it.each(['=', '+', '-', '@'])(
    'preserves session identity when a formula-prefix name begins with %s',
    async (prefix) => {
      const firstClient = completeClientSubmissionV2();
      firstClient.firstName = `${prefix}Student`;
      const first = await buildForwardedSubmissionPayloadV2(firstClient, 'production');
      expect(receipt(harness.api.doPost(event(first))).status).toBe('accepted');
      expect(String(harness.raw.rows[1][6])).toBe(`'${prefix}Student`);

      const nextClient = { ...firstClient, attemptId: `attempt-prefix-${prefix.charCodeAt(0)}` };
      const next = await buildForwardedSubmissionPayloadV2(nextClient, 'production');
      expect(receipt(harness.api.doPost(event(next))).status).toBe('accepted');
    },
  );

  it('keeps identical limited identities in separate session rows and flags ambiguity', async () => {
    const first = await forwarded({}, 'production');
    const secondClient = completeClientSubmissionV2();
    secondClient.attemptId = 'attempt-second-session';
    secondClient.sessionId = 'session-second-session';
    const second = await buildForwardedSubmissionPayloadV2(secondClient, 'production');
    expect(receipt(harness.api.doPost(event(first))).status).toBe('accepted');
    expect(receipt(harness.api.doPost(event(second))).status).toBe('accepted');
    const rows = harness.best.rows.slice(1, 3);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row[10])).toEqual(['session-contract-v2', 'session-second-session']);
    expect(rows.every((row) => row[12] === 2 && row[13] === true)).toBe(true);
  });

  it('excludes Preview test rows and fails closed on any header drift', async () => {
    const payload = await forwarded();
    expect(receipt(harness.api.doPost(event(payload))).status).toBe('accepted');
    expect(harness.best.getLastRow()).toBe(1);
    harness.raw.rows[0][1] = 'WrongAttemptHeader';
    const rejected = receipt(
      harness.api.doPost(event(await forwarded({ attemptId: 'attempt-header-drift' }))),
    );
    expect(rejected).toMatchObject({ status: 'rejected', errorCode: 'HEADER_MISMATCH' });
    expect(harness.raw.getLastRow()).toBe(2);
  });

  it('derives deterministic BestResults and restores prior rows after a write failure', async () => {
    const first = await forwarded({}, 'production');
    const secondClient = completeClientSubmissionV2();
    secondClient.attemptId = 'attempt-deterministic';
    secondClient.sessionId = 'session-deterministic';
    const second = await buildForwardedSubmissionPayloadV2(secondClient, 'production');
    harness.api.doPost(event(first));
    harness.api.doPost(event(second));
    const rawRows = harness.raw.rows.slice(1);
    expect(harness.api.bestRowsFromRawV2_(rawRows)).toEqual(
      harness.api.bestRowsFromRawV2_(structuredClone(rawRows).reverse()),
    );
    const prior = structuredClone(harness.best.rows);
    harness.best.failNextSet = true;
    expect(() => harness.api.replaceBestRowsV2_(harness.best, [[...prior[1]]])).toThrow(
      /SIMULATED_SHEET_WRITE_FAILURE/,
    );
    expect(harness.best.rows).toEqual(prior);
  });

  it('fails closed when raw history binds one session to multiple identities', async () => {
    const first = await forwarded({}, 'production');
    expect(receipt(harness.api.doPost(event(first))).status).toBe('accepted');
    const corrupt = structuredClone(harness.raw.rows[1]);
    corrupt[1] = 'attempt-corrupt-binding';
    corrupt[6] = 'Different';
    harness.raw.rows.push(corrupt);
    expect(() => harness.api.bestRowsFromRawV2_(harness.raw.rows.slice(1))).toThrow(
      /CORRUPT_SESSION_BINDING/,
    );
  });

  it('keeps setup read-only and migration explicit, idempotent, and test-row-only', () => {
    expect(harness.api.setupSubmissionDestination()).toMatchObject({ status: 'verified' });
    const legacy = createHarness(RAW_V1_HEADERS, BEST_V1_HEADERS);
    legacy.raw.appendRow([
      '2026-07-21T00:00:00.000Z',
      'legacy-attempt',
      'legacy-session',
      'build-a-living-cell-unit1',
      1,
      '0.1.0',
      'Test',
      'S',
      1,
      100,
      true,
      false,
      false,
      600,
      '{}',
      '{}',
      true,
      '{}',
    ]);
    const historical = structuredClone(legacy.raw.rows[1]);
    expect(legacy.api.migrateSubmissionDestinationV2()).toMatchObject({ status: 'verified' });
    expect(legacy.raw.rows[0]).toEqual(RAW_HEADERS);
    expect(legacy.best.rows[0]).toEqual(BEST_HEADERS);
    expect(legacy.raw.rows[1].slice(0, historical.length)).toEqual(historical);
    expect(legacy.api.migrateSubmissionDestinationV2()).toMatchObject({ status: 'verified' });
  });

  it('validates both legacy headers and rolls back a partial migration', () => {
    const drift = createHarness(RAW_V1_HEADERS, ['WrongBestHeader']);
    expect(() => drift.api.migrateSubmissionDestinationV2()).toThrow(/HEADER_MISMATCH/);
    expect(drift.raw.rows[0]).toEqual(RAW_V1_HEADERS);

    const partial = createHarness(RAW_V1_HEADERS, BEST_V1_HEADERS);
    partial.best.failNextSet = true;
    expect(() => partial.api.migrateSubmissionDestinationV2()).toThrow(
      /SIMULATED_SHEET_WRITE_FAILURE/,
    );
    expect(partial.raw.rows[0].slice(0, RAW_V1_HEADERS.length)).toEqual(RAW_V1_HEADERS);
    expect(partial.best.rows[0].slice(0, BEST_V1_HEADERS.length)).toEqual(BEST_V1_HEADERS);
    expect(partial.raw.getLastColumn()).toBe(RAW_V1_HEADERS.length);
    expect(partial.best.getLastColumn()).toBe(BEST_V1_HEADERS.length);
  });
});
