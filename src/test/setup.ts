import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// API du navigateur absentes de jsdom mais utilisées par les composants Radix (shadcn/ui).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
if (!('hasPointerCapture' in Element.prototype))
  Object.assign(Element.prototype, { hasPointerCapture: () => false });
if (!('releasePointerCapture' in Element.prototype))
  Object.assign(Element.prototype, { releasePointerCapture: () => {} });
if (!('scrollIntoView' in Element.prototype)) Object.assign(Element.prototype, { scrollIntoView: () => {} });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
