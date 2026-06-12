import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useLazyload } from '../composables/useLazyload.js';

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let observerCallback = null;

class MockIntersectionObserver {
  constructor(cb) {
    observerCallback = cb;
    this.observe = mockObserve;
    this.disconnect = mockDisconnect;
  }
}

beforeEach(() => {
  mockObserve.mockClear();
  mockDisconnect.mockClear();
  observerCallback = null;
  globalThis.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  delete globalThis.IntersectionObserver;
});

const mountWithLazyload = (options = {}) => {
  let composableResult;
  const TestComponent = defineComponent({
    setup() {
      composableResult = useLazyload(options);
      return composableResult;
    },
    template: '<div ref="targetRef"></div>',
  });

  mount(TestComponent);
  return { ...composableResult };
};

describe('useLazyload', () => {
  it('returns targetRef and isVisible', () => {
    const { targetRef, isVisible } = mountWithLazyload();
    expect(targetRef).toBeDefined();
    expect(isVisible.value).toBe(false);
  });

  it('creates IntersectionObserver on mount', () => {
    mountWithLazyload();
    expect(observerCallback).toBeTruthy();
  });

  it('becomes visible when intersecting', () => {
    const { isVisible } = mountWithLazyload();
    observerCallback([{ isIntersecting: true }]);
    expect(isVisible.value).toBe(true);
  });

  it('stays invisible when not intersecting in once mode', () => {
    const { isVisible } = mountWithLazyload({ once: true });
    observerCallback([{ isIntersecting: false }]);
    expect(isVisible.value).toBe(false);
  });

  it('disconnects after first intersection in once mode', () => {
    mountWithLazyload({ once: true });
    observerCallback([{ isIntersecting: true }]);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('does not disconnect in continuous mode', () => {
    mountWithLazyload({ once: false });
    observerCallback([{ isIntersecting: true }]);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
