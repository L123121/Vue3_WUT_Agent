import { describe, it, expect } from 'vitest';
import { sha256, DEFAULT_PASSWORD_HASH } from '../utils/crypto.js';

describe('sha256', () => {
  it('hashes "123456" to the default hash', async () => {
    const hash = await sha256('123456');
    expect(hash).toBe(DEFAULT_PASSWORD_HASH);
  });

  it('returns 64-char hex string', async () => {
    const hash = await sha256('test');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await sha256('abc');
    const h2 = await sha256('def');
    expect(h1).not.toBe(h2);
  });

  it('is deterministic', async () => {
    const h1 = await sha256('same');
    const h2 = await sha256('same');
    expect(h1).toBe(h2);
  });

  it('handles empty string', async () => {
    const hash = await sha256('');
    expect(hash).toHaveLength(64);
  });
});
