import { describe, it, expect, beforeEach } from 'vitest';
import { useCryptoStore } from '../src/store/cryptoContext.js';

describe('cryptoStore state machine', () => {
  beforeEach(() => {
    useCryptoStore.setState({ state: { status: 'locked' } });
  });

  it('starts locked', () => {
    expect(useCryptoStore.getState().state).toEqual({ status: 'locked' });
  });

  it('lock() returns to locked from any state', () => {
    useCryptoStore.getState().setUnlocked(new Uint8Array(64), new Uint8Array(32));
    useCryptoStore.getState().lock();
    expect(useCryptoStore.getState().state).toEqual({ status: 'locked' });
  });

  it('setUnlocking() transitions to unlocking', () => {
    useCryptoStore.getState().setUnlocking();
    expect(useCryptoStore.getState().state).toEqual({ status: 'unlocking' });
  });

  it('setUnlockError() carries the error string in unlocking', () => {
    useCryptoStore.getState().setUnlockError('wrong password');
    const s = useCryptoStore.getState().state;
    expect(s.status).toBe('unlocking');
    if (s.status === 'unlocking') expect(s.error).toBe('wrong password');
  });

  it('setUnlocked() carries privateKey + publicKey', () => {
    const sk = new Uint8Array(64).fill(1);
    const pk = new Uint8Array(32).fill(2);
    useCryptoStore.getState().setUnlocked(sk, pk);
    const s = useCryptoStore.getState().state;
    expect(s.status).toBe('unlocked');
    if (s.status === 'unlocked') {
      expect(s.privateKey).toBe(sk);
      expect(s.publicKey).toBe(pk);
    }
  });

  it('discriminated union narrows correctly', () => {
    const s = useCryptoStore.getState().state;
    if (s.status === 'unlocked') {
      // @ts-expect-error - privateKey must exist on unlocked
      const _ok: Uint8Array = s.privateKey;
      void _ok;
    }
    expect(s.status).toBe('locked');
  });
});
