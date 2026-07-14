import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './submit';

const objectives = {
  wallPanels: 6,
  membranePanels: 6,
  cytoplasm: true,
  nucleus: true,
  ribosomes: true,
  mitochondria: true,
  chloroplasts: true,
  centralVacuole: true,
  droughtDiagnosed: true,
  droughtObserved: true,
  recoveryRestored: true,
  effectCellWall: true,
  effectCellMembrane: true,
  effectCytoplasm: true,
  effectNucleus: true,
  effectRibosomes: true,
  effectMitochondria: true,
  effectChloroplasts: true,
  effectCentralVacuole: true,
};

const payload = {
  firstName: 'Test',
  lastInitial: 'S',
  period: 1,
  attemptId: 'attempt-1',
  sessionId: 'session-1',
  assignmentId: 'build-a-living-cell-unit1',
  assignmentVersion: 1,
  gameVersion: '0.1.0',
  score: { total: 1 },
  completed: true,
  early: false,
  timeout: false,
  activeTimeSeconds: 720,
  objectives,
  hintsUsed: { 1: 0, 2: 0, 3: 0 },
  isTest: false,
};

function responseDouble() {
  const result = { statusCode: 0, body: null as unknown };
  return {
    result,
    response: {
      setHeader: vi.fn(),
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(value: unknown) {
        result.body = value;
        return this;
      },
    },
  };
}

function request(body: unknown = payload) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  };
}

describe('Vercel submission proxy', () => {
  beforeEach(() => {
    vi.stubEnv('APPS_SCRIPT_SUBMISSION_URL', 'https://script.google.test/exec');
    vi.stubEnv('APPS_SCRIPT_PROXY_KEY', 'test-proxy-key-that-is-long-enough');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forces preview submissions to remain test rows', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    let forwarded: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, init: RequestInit) => {
        forwarded = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            attemptId: payload.attemptId,
            status: 'accepted',
            serverTimestamp: new Date().toISOString(),
          }),
          { status: 200 },
        );
      }),
    );
    const output = responseDouble();
    await handler(request(), output.response);
    expect(output.result.statusCode).toBe(200);
    expect(forwarded.isTest).toBe(true);
    expect(forwarded.proxyKey).toBe('test-proxy-key-that-is-long-enough');
  });

  it('returns a retryable service status for malformed or mismatched upstream receipts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));
    const malformed = responseDouble();
    await handler(request(), malformed.response);
    expect(malformed.result.statusCode).toBe(503);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            attemptId: 'different-attempt',
            status: 'accepted',
            serverTimestamp: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      ),
    );
    const mismatch = responseDouble();
    await handler(request(), mismatch.response);
    expect(mismatch.result.statusCode).toBe(503);
  });

  it('maps upstream rate limiting to 429 for the device retry queue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            attemptId: payload.attemptId,
            status: 'rejected',
            serverTimestamp: new Date().toISOString(),
            errorCode: 'RATE_LIMITED',
          }),
          { status: 200 },
        ),
      ),
    );
    const output = responseDouble();
    await handler(request(), output.response);
    expect(output.result.statusCode).toBe(429);
  });
});
