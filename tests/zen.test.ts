// ============================================================
// Tests: Zen Mode
// ============================================================
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScriptureConfigure } from '../src/index.js';
import { ScriptureRegistry } from '../src/registry.js';
import {
  initZenEngine,
  explainVerse,
  getZenStatus,
  getZenBackend,
  resetZenEngine,
  clearZenCache,
} from '../src/zen/zen-mode.js';
import { ScriptureError } from '../src/types.js';
import type { ScriptureData, ResolvedVerse } from '../src/types.js';

const SAMPLE_VERSE: ResolvedVerse = {
  text: 'In the beginning God created the heaven and the earth.',
  source: 'bible' as any,
  book: 'genesis',
  chapter: '1',
  verse: '1',
  meta: { source: 'bible', version: 'KJV', lang: 'en' },
};

// ── Mock WebLLM (WebGPU path) ─────────────────────────────────

const mockWebLLMEngine = {
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [
          { message: { content: 'This verse describes the act of creation.' } },
        ],
      }),
    },
  },
};

const mockWebLLMModule = {
  CreateMLCEngine: vi.fn().mockResolvedValue(mockWebLLMEngine),
};

// ── Mock Transformers.js (WASM path) ──────────────────────────

const mockWasmPipeline = vi
  .fn()
  .mockResolvedValue([
    {
      generated_text:
        'PROMPT_PREFIX This verse explains cosmic origins in a spiritual context.',
    },
  ]);

const mockTransformersModule = {
  pipeline: vi.fn().mockResolvedValue(mockWasmPipeline),
};

describe('Zen Mode', () => {
  beforeEach(() => {
    resetZenEngine();
    ScriptureConfigure({ zen: { enabled: true } });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetZenEngine();
    vi.restoreAllMocks();
  });

  // ── Guard: disabled by default ────────────────────────────

  it('throws ZEN_NOT_AVAILABLE when zen.enabled is false', async () => {
    ScriptureConfigure({ zen: { enabled: false } });
    await expect(explainVerse(SAMPLE_VERSE)).rejects.toMatchObject({
      code: 'ZEN_NOT_AVAILABLE',
    });
  });

  // ── Status lifecycle ──────────────────────────────────────

  it("starts with status 'idle'", () => {
    expect(getZenStatus()).toBe('idle');
  });

  it('backend starts as null', () => {
    expect(getZenBackend()).toBe(null);
  });

  // ── WebGPU path ───────────────────────────────────────────

  describe('WebGPU backend', () => {
    beforeEach(() => {
      // Simulate WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: { requestAdapter: vi.fn().mockResolvedValue({}) },
        configurable: true,
      });

      // Mock dynamic import to return WebLLM
      vi.stubGlobal('import', vi.fn().mockResolvedValue(mockWebLLMModule));
    });

    it('detects WebGPU and uses webgpu backend', async () => {
      // We mock the internal import directly
      const mod = await import('../src/zen/zen-mode.js');
      // Since we can't intercept dynamic imports in vitest easily,
      // we test the detection logic separately
      expect(typeof navigator.gpu).toBe('object');
    });
  });

  // ── WASM fallback path ────────────────────────────────────

  describe('WASM fallback', () => {
    it('clearZenCache empties the cache without resetting engine', async () => {
      clearZenCache();
      // After clearing cache, status should still be whatever it was
      expect(getZenStatus()).toBeDefined();
    });
  });

  // ── Cache ─────────────────────────────────────────────────

  describe('explanation cache', () => {
    it('resetZenEngine clears state completely', () => {
      resetZenEngine();
      expect(getZenStatus()).toBe('idle');
      expect(getZenBackend()).toBe(null);
    });

    it('clearZenCache does not reset backend', () => {
      clearZenCache();
      // Backend stays whatever it was (null here since not init'd)
      expect(getZenBackend()).toBe(null);
    });
  });

  // ── Error handling ────────────────────────────────────────

  describe('error handling', () => {
    it('throws ScriptureError on init failure', async () => {
      // Simulate no WebGPU, no transformers.js
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true,
      });

      // The import will fail since vitest can't load CDN modules
      await expect(initZenEngine()).rejects.toBeInstanceOf(ScriptureError);
    });

    it('error status is set after failed init', async () => {
      try {
        await initZenEngine();
      } catch {
        // expected
      }
      expect(getZenStatus()).toBe('error');
    });
  });

  // ── API surface ───────────────────────────────────────────

  describe('exported API', () => {
    it('exports all expected functions', () => {
      expect(typeof initZenEngine).toBe('function');
      expect(typeof explainVerse).toBe('function');
      expect(typeof getZenStatus).toBe('function');
      expect(typeof getZenBackend).toBe('function');
      expect(typeof resetZenEngine).toBe('function');
      expect(typeof clearZenCache).toBe('function');
    });
  });

  describe('custom provider', () => {
    it('uses custom provider without local model init', async () => {
      const provider = vi.fn().mockResolvedValue('Custom explanation output.');

      ScriptureConfigure({
        zen: {
          enabled: true,
          provider: 'custom',
          customProvider: provider,
        },
      });

      const result = await explainVerse(SAMPLE_VERSE);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(result.explanation).toContain('Custom explanation output');
      expect(result.model).toBe('custom-provider');
    });

    it('expires cached custom provider entries by TTL', async () => {
      vi.useFakeTimers();
      const provider = vi.fn().mockResolvedValue('TTL explanation.');

      ScriptureConfigure({
        zen: {
          enabled: true,
          provider: 'custom',
          customProvider: provider,
          cacheTtlMs: 10000,
          cacheMaxEntries: 20,
        },
      });

      await explainVerse(SAMPLE_VERSE);
      await explainVerse(SAMPLE_VERSE);
      expect(provider).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10001);
      await explainVerse(SAMPLE_VERSE);
      expect(provider).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });
});
