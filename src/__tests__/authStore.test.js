import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth.store.js';

describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('starts unauthenticated', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.token).toBe('');
  });

  it('logs in with server token', () => {
    const store = useAuthStore();
    store.login({ name: 'Test' }, 'jwt-token-123');

    expect(store.isAuthenticated).toBe(true);
    expect(store.user.name).toBe('Test');
    expect(store.token).toBe('jwt-token-123');
    expect(store.isLocalAuth).toBe(false);
  });

  it('logs in with local auth when no token', () => {
    const store = useAuthStore();
    store.login({ name: 'Local' }, null);

    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toMatch(/^local_/);
    expect(store.isLocalAuth).toBe(true);
  });

  it('fills default college and grade', () => {
    const store = useAuthStore();
    store.login({ name: 'User' }, 'token');

    expect(store.user.college).toBe('计算机科学与技术学院');
    expect(store.user.grade).toBe('2021级');
  });

  it('overrides defaults with provided values', () => {
    const store = useAuthStore();
    store.login({ name: 'User', college: '理学院' }, 'token');

    expect(store.user.college).toBe('理学院');
  });

  it('logs out and clears state', () => {
    const store = useAuthStore();
    store.login({ name: 'Test' }, 'token');
    store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.token).toBe('');
    expect(store.isLocalAuth).toBe(false);
  });

  it('updates user profile', () => {
    const store = useAuthStore();
    store.login({ name: 'Old' }, 'token');
    store.updateUser({ name: 'New' });

    expect(store.user.name).toBe('New');
  });

  it('verifies password correctly', async () => {
    const store = useAuthStore();
    // Default password is 123456 (migrated from legacy or using default hash)
    const result = await store.verifyPassword('123456');
    expect(result).toBe(true);
  });

  it('rejects wrong password', async () => {
    const store = useAuthStore();
    const result = await store.verifyPassword('wrong');
    expect(result).toBe(false);
  });

  it('persists token to localStorage', () => {
    const store = useAuthStore();
    store.login({ name: 'Test' }, 'my-token');

    expect(localStorage.getItem('token')).toBe('my-token');
  });

  it('persists user to localStorage', () => {
    const store = useAuthStore();
    store.login({ name: 'Test' }, 'token');

    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.name).toBe('Test');
  });
});
