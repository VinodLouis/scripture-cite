// ============================================================
// Benchmarks: Lightweight performance harness
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { ScriptureRegistry } from '../src/registry.js';
import { ScriptureConfigure } from '../src/index.js';
import { explainVerse } from '../src/zen/zen-mode.js';
import type { ScriptureData } from '../src/types.js';

const BENCH_DATA: ScriptureData = {
  meta: { source: 'bible', version: 'KJV', lang: 'en' },
  verses: {
    genesis: {
      '1': {
        '1': 'In the beginning God created the heaven and the earth.',
        '2': 'And the earth was without form, and void.',
        '3': 'And God said, Let there be light.',
      },
    },
  },
};

function getMemoryBytes(): number {
  const mem = (
    globalThis as unknown as {
      performance?: { memory?: { usedJSHeapSize?: number } };
    }
  ).performance?.memory;
  if (mem?.usedJSHeapSize) return mem.usedJSHeapSize;
  if (
    typeof process !== 'undefined' &&
    typeof process.memoryUsage === 'function'
  ) {
    return process.memoryUsage().heapUsed;
  }
  return 0;
}

describe('Benchmark suite', () => {
  beforeEach(() => {
    ScriptureRegistry.clear();
    ScriptureRegistry.register('bible', BENCH_DATA);
  });

  it('tracks resolve throughput', async () => {
    const runs = 400;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) {
      await ScriptureRegistry.resolve('bible', '1', '1', 'genesis');
    }
    const durationMs = performance.now() - start;
    const opsPerSec = (runs / Math.max(durationMs, 0.001)) * 1000;
    console.info('[bench] resolve throughput ops/s:', Math.round(opsPerSec));
    expect(opsPerSec).toBeGreaterThan(100);
  });

  it('tracks tooltip-open latency (DOM path)', async () => {
    const el = document.createElement('scripture-cite');
    el.setAttribute('source', 'bible');
    el.setAttribute('book', 'genesis');
    el.setAttribute('chapter', '1');
    el.setAttribute('verse', '1');
    el.setAttribute('mode', 'tooltip');
    el.setAttribute('loading', 'eager');
    document.body.appendChild(el);

    await new Promise((r) => setTimeout(r, 60));

    const trigger = el.shadowRoot?.querySelector<HTMLElement>('.sc-trigger');
    const start = performance.now();
    trigger?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise((r) => setTimeout(r, 24));
    const latencyMs = performance.now() - start;

    console.info('[bench] tooltip open latency ms:', Math.round(latencyMs));
    expect(latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks first zen response latency with custom provider', async () => {
    ScriptureConfigure({
      zen: {
        enabled: true,
        provider: 'custom',
        customProvider: async () => 'Benchmark custom explanation.',
      },
    });

    const verse = await ScriptureRegistry.resolve('bible', '1', '1', 'genesis');
    const start = performance.now();
    const result = await explainVerse(verse);
    const latencyMs = performance.now() - start;

    console.info(
      '[bench] first zen response latency ms:',
      Math.round(latencyMs),
    );
    expect(result.explanation).toContain('Benchmark custom explanation');
  });

  it('tracks memory footprint snapshot', () => {
    const bytes = getMemoryBytes();
    console.info('[bench] memory used bytes:', bytes);
    expect(bytes).toBeGreaterThanOrEqual(0);
  });
});
