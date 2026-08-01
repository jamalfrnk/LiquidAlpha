import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requestContext, REQUEST_ID_HEADER, RESPONSE_REQUEST_ID_HEADER } from './requestContext';

function mockReqRes(incomingRequestId?: string) {
  const headers: Record<string, string> = incomingRequestId ? { [REQUEST_ID_HEADER]: incomingRequestId } : {};
  const setHeader = vi.fn();
  const req = { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe('requestContext', () => {
  it('generates a fresh request ID when none was provided', () => {
    const { req, res, setHeader } = mockReqRes();
    const next = vi.fn();

    requestContext(req, res, next);

    expect(req.requestId).toBeTruthy();
    expect(setHeader).toHaveBeenCalledWith(RESPONSE_REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses an incoming X-Request-Id header instead of generating a new one', () => {
    const { req, res, setHeader } = mockReqRes('client-supplied-id-123');
    const next = vi.fn();

    requestContext(req, res, next);

    expect(req.requestId).toBe('client-supplied-id-123');
    expect(setHeader).toHaveBeenCalledWith(RESPONSE_REQUEST_ID_HEADER, 'client-supplied-id-123');
  });

  it('generates two different IDs across two requests with no incoming header', () => {
    const first = mockReqRes();
    const second = mockReqRes();
    requestContext(first.req, first.res, vi.fn());
    requestContext(second.req, second.res, vi.fn());

    expect(first.req.requestId).not.toBe(second.req.requestId);
  });
});
