import { apiRequest } from '../../lib/api';
import type { AuthUser, Chain } from './types';

export function fetchMe(): Promise<{ user: AuthUser }> {
  return apiRequest('GET', '/api/auth/me');
}

export function requestNonce(address: string, chain: Chain): Promise<{ message: string; expiresAt: string }> {
  return apiRequest('POST', '/api/auth/nonce', { address, chain });
}

export function verifySignature(address: string, chain: Chain, signature: string): Promise<{ user: AuthUser }> {
  return apiRequest('POST', '/api/auth/verify', { address, chain, signature });
}

export function logout(): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/auth/logout');
}
