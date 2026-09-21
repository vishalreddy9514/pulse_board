import '@testing-library/jest-dom/vitest';

// Recharts measures its container before rendering; jsdom reports zero for
// every box, so ResponsiveContainer needs a size stubbed in or charts render
// empty under test.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as never);
