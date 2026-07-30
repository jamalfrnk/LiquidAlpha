import { describe, it, expect } from 'vitest';
import { canTransitionOrder, isOrderTerminal, canTransitionPosition, type OrderStatus } from './stateMachine';

describe('canTransitionOrder', () => {
  it('allows the normal happy path: submitted -> acknowledged -> filled', () => {
    expect(canTransitionOrder('SUBMITTED', 'ACKNOWLEDGED')).toBe(true);
    expect(canTransitionOrder('ACKNOWLEDGED', 'FILLED')).toBe(true);
  });

  it('allows a market order to fill directly from submitted', () => {
    expect(canTransitionOrder('SUBMITTED', 'FILLED')).toBe(true);
  });

  it('rejects going backwards out of a terminal state', () => {
    expect(canTransitionOrder('FILLED', 'ACKNOWLEDGED')).toBe(false);
    expect(canTransitionOrder('CANCELLED', 'SUBMITTED')).toBe(false);
  });

  it('rejects skipping straight to filled from cancel-pending in favor of an explicit resolution', () => {
    expect(canTransitionOrder('CANCEL_PENDING', 'CANCELLED')).toBe(true);
    expect(canTransitionOrder('CANCEL_PENDING', 'FILLED')).toBe(true); // an in-flight fill can still beat the cancel
    expect(canTransitionOrder('CANCEL_PENDING', 'ACKNOWLEDGED')).toBe(false);
  });

  it('every terminal state has no outgoing transitions at all', () => {
    const terminal: OrderStatus[] = ['FILLED', 'CANCELLED', 'REJECTED', 'FAILED'];
    for (const status of terminal) {
      expect(isOrderTerminal(status)).toBe(true);
      expect(canTransitionOrder(status, 'SUBMITTED')).toBe(false);
    }
  });
});

describe('canTransitionPosition', () => {
  it('allows OPEN -> CLOSED and OPEN -> LIQUIDATED', () => {
    expect(canTransitionPosition('OPEN', 'CLOSED')).toBe(true);
    expect(canTransitionPosition('OPEN', 'LIQUIDATED')).toBe(true);
  });

  it('rejects any transition out of a terminal position state', () => {
    expect(canTransitionPosition('CLOSED', 'OPEN')).toBe(false);
    expect(canTransitionPosition('LIQUIDATED', 'OPEN')).toBe(false);
  });
});
