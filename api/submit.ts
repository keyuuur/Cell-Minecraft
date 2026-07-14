import {
  validateContentLength,
  validatePayloadSize,
  validateSubmission,
  ValidationError,
} from './validation.js';
import type { SubmissionReceipt } from '../src/types/game';

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (value: SubmissionReceipt) => VercelResponse;
}

export const config = { maxDuration: 10 };

const RETRYABLE_CODES = new Set([
  'BACKEND_NOT_CONFIGURED',
  'BACKEND_UNAVAILABLE',
  'INVALID_UPSTREAM_RECEIPT',
  'RECEIPT_MISMATCH',
  'SERVER_BUSY',
]);

function receipt(
  response: VercelResponse,
  statusCode: number,
  value: SubmissionReceipt,
): VercelResponse {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(statusCode).json(value);
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return receipt(response, 405, {
      attemptId: '',
      status: 'rejected',
      serverTimestamp: new Date().toISOString(),
      errorCode: 'METHOD_NOT_ALLOWED',
    });
  }

  try {
    const contentType = request.headers['content-type'];
    const normalizedContentType = Array.isArray(contentType) ? contentType[0] : contentType;
    if (!normalizedContentType?.toLowerCase().includes('application/json')) {
      throw new ValidationError('UNSUPPORTED_CONTENT_TYPE');
    }
    const contentLength = request.headers['content-length'];
    validateContentLength(Array.isArray(contentLength) ? contentLength[0] : contentLength);
    validatePayloadSize(request.body);
    let parsedBody: unknown;
    try {
      parsedBody = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    } catch {
      throw new ValidationError('INVALID_JSON');
    }
    const validated = validateSubmission(parsedBody);
    const payload = {
      ...validated,
      isTest: process.env.VERCEL_ENV === 'production' ? validated.isTest : true,
    };
    const appsScriptUrl = process.env.APPS_SCRIPT_SUBMISSION_URL;
    const proxyKey = process.env.APPS_SCRIPT_PROXY_KEY;
    if (!appsScriptUrl || !proxyKey) throw new ValidationError('BACKEND_NOT_CONFIGURED');

    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, proxyKey }),
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const raw = await upstream.text();
    let upstreamReceipt: SubmissionReceipt;
    try {
      const candidate = JSON.parse(raw) as Partial<SubmissionReceipt>;
      if (
        typeof candidate.attemptId !== 'string' ||
        !['accepted', 'duplicate', 'rejected'].includes(candidate.status ?? '') ||
        typeof candidate.serverTimestamp !== 'string' ||
        (candidate.errorCode !== undefined && typeof candidate.errorCode !== 'string')
      ) {
        throw new Error('invalid receipt shape');
      }
      upstreamReceipt = candidate as SubmissionReceipt;
    } catch {
      throw new ValidationError('INVALID_UPSTREAM_RECEIPT');
    }
    if (upstreamReceipt.attemptId !== payload.attemptId) {
      throw new ValidationError('RECEIPT_MISMATCH');
    }
    if (upstreamReceipt.status === 'accepted' || upstreamReceipt.status === 'duplicate') {
      return receipt(response, 200, upstreamReceipt);
    }
    const upstreamCode = upstreamReceipt.errorCode ?? 'UPSTREAM_REJECTED';
    const upstreamStatus =
      upstreamCode === 'RATE_LIMITED' ? 429 : RETRYABLE_CODES.has(upstreamCode) ? 503 : 422;
    return receipt(response, upstreamStatus, upstreamReceipt);
  } catch (error) {
    const code = error instanceof ValidationError ? error.code : 'BACKEND_UNAVAILABLE';
    const statusCode = code === 'PAYLOAD_TOO_LARGE' ? 413 : RETRYABLE_CODES.has(code) ? 503 : 400;
    return receipt(response, statusCode, {
      attemptId:
        request.body && typeof request.body === 'object' && 'attemptId' in request.body
          ? String((request.body as { attemptId: unknown }).attemptId)
          : '',
      status: 'rejected',
      serverTimestamp: new Date().toISOString(),
      errorCode: code,
    });
  }
}
