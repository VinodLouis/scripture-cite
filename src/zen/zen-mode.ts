// ============================================================
// scripture-cite — Zen Mode
// Dual-backend in-browser LLM with automatic fallback:
//
//  1. WebGPU  → WebLLM (@mlc-ai/web-llm)
//              Best quality, GPU-accelerated
//              Requires: Chrome 113+, Edge 113+
//
//  2. WASM    → Transformers.js (@huggingface/transformers)
//              CPU fallback, works everywhere
//              Slower but universal
//
// Backend is chosen automatically; no config needed.
// Both load lazily from CDN — zero bundle cost unless used.
//
// Recommended models:
//   WebGPU default : Qwen2.5-0.5B-Instruct-q4f16_1-MLC      (~400 MB VRAM)
//   WebGPU mid     : Qwen2.5-1.5B-Instruct-q4f16_1-MLC      (~1 GB VRAM)
//   WebGPU quality : Phi-3.5-mini-instruct-q4f16_1-MLC      (~2.4 GB VRAM)
//   WASM fallback  : Qwen2.5-0.5B-Instruct (ONNX int8)       (~350 MB RAM)
//   WASM alt       : TinyLlama-1.1B-Chat-v1.0 (ONNX q4)      (~600 MB RAM)
// ============================================================

import type {
  ResolvedVerse,
  ZenExplanation,
  ZenStatus,
  ZenConfig,
} from '../types.js';
import { ScriptureError } from '../types.js';
import { ScriptureConfigSingleton } from '../config.js';

// ── CDN URLs ─────────────────────────────────────────────────

const WEBLLM_ESM_URL =
  'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/lib/index.min.js';

const TRANSFORMERS_ESM_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.min.js';

/** WASM fallback model — small, fast, ONNX int8 quantised */
const WASM_FALLBACK_MODEL = 'Xenova/Qwen2.5-0.5B-Instruct';

// ── Backend Types ─────────────────────────────────────────────

type ZenBackend = 'webgpu' | 'wasm' | null;

interface WebLLMEngine {
  chat: {
    completions: {
      create(opts: {
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
      }): Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
}

interface WebLLMModule {
  CreateMLCEngine(
    model: string,
    opts?: {
      initProgressCallback?: (p: { progress: number; text: string }) => void;
    },
  ): Promise<WebLLMEngine>;
}

// Transformers.js pipeline function signature
type TransformersPipeline = (
  prompt: string,
  opts: {
    max_new_tokens: number;
    temperature: number;
    do_sample: boolean;
    repetition_penalty: number;
  },
) => Promise<
  Array<{ generated_text: string | Array<{ role: string; content: string }> }>
>;

interface TransformersModule {
  pipeline(
    task: string,
    model: string,
    opts?: {
      dtype?: string;
      progress_callback?: (p: {
        status: string;
        progress?: number;
        file?: string;
      }) => void;
    },
  ): Promise<TransformersPipeline>;
}

// ── State ─────────────────────────────────────────────────────

let _backend: ZenBackend = null;
let _enginePromise: Promise<void> | null = null;
let _webllmEngine: WebLLMEngine | null = null;
let _wasmPipeline: TransformersPipeline | null = null;
let _loadedModel: string | null = null;
let _status: ZenStatus = 'idle';

/** Per-verse explanation cache (survives model restarts) */
const _cache = new Map<string, string>();

// ── Helpers ───────────────────────────────────────────────────

function cacheKey(v: ResolvedVerse): string {
  return `${v.source}:${v.book ?? ''}:${v.chapter}:${v.verse}`;
}

function _tokenSet(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function _overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) {
    if (b.has(item)) common += 1;
  }
  return common / Math.max(1, Math.min(a.size, b.size));
}

function _isLowValueExplanation(
  verseText: string,
  explanation: string,
): boolean {
  const text = explanation.trim();
  if (!text) return true;

  // Too short usually means no explanation.
  if (text.length < 90) return true;

  const verseTokens = _tokenSet(verseText);
  const explanationTokens = _tokenSet(text);
  const overlap = _overlapRatio(verseTokens, explanationTokens);

  const hasInterpretiveCue =
    /means|teaches|invites|suggests|implies|highlights|reveals|calls|shows/i.test(
      text,
    );

  // If it mostly reuses verse wording and lacks interpretive language,
  // treat it as low-value paraphrase and retry once.
  return overlap >= 0.6 && !hasInterpretiveCue;
}

/** Detect WebGPU support reliably */
async function hasWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    // Actually request an adapter — `gpu` existing doesn't mean it works
    const adapter = await (
      navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }
    ).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

// ── Backend Loaders ───────────────────────────────────────────

async function loadWebGPUBackend(
  model: string,
  cfg: Required<ZenConfig>,
): Promise<void> {
  const mod = (await import(/* @vite-ignore */ WEBLLM_ESM_URL)) as WebLLMModule;

  _webllmEngine = await mod.CreateMLCEngine(model, {
    initProgressCallback: ({ progress, text }) => {
      cfg.onProgress(Math.round(progress * 100), text);
    },
  });

  _backend = 'webgpu';
  _loadedModel = model;
}

async function loadWASMBackend(cfg: Required<ZenConfig>): Promise<void> {
  const wasmModel = WASM_FALLBACK_MODEL;
  cfg.onProgress(0, 'Loading WASM engine (Transformers.js)…');

  const mod = (await import(
    /* @vite-ignore */ TRANSFORMERS_ESM_URL
  )) as TransformersModule;

  _wasmPipeline = await mod.pipeline('text-generation', wasmModel, {
    dtype: 'q4', // int4 quantisation — smallest footprint (~350 MB)
    progress_callback: ({ status, progress, file }) => {
      if (status === 'progress' && progress !== undefined) {
        cfg.onProgress(
          Math.round(progress),
          `Downloading ${file ?? wasmModel} — ${Math.round(progress)}%`,
        );
      }
    },
  });

  _backend = 'wasm';
  _loadedModel = wasmModel;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Initialise the best available LLM engine.
 * - Tries WebGPU (WebLLM) first for speed and quality
 * - Falls back to WASM (Transformers.js) transparently
 * - Deduplicates concurrent calls — safe to call multiple times
 */
export async function initZenEngine(
  onStatusChange?: (s: ZenStatus) => void,
): Promise<void> {
  // Already initialised
  if (_backend !== null && (_webllmEngine !== null || _wasmPipeline !== null)) {
    onStatusChange?.('ready');
    return;
  }

  // Already in progress — join the existing promise
  if (_enginePromise !== null) {
    _status = 'loading-model';
    onStatusChange?.('loading-model');
    await _enginePromise;
    onStatusChange?.('ready');
    return;
  }

  _status = 'loading-model';
  onStatusChange?.('loading-model');

  const cfg = ScriptureConfigSingleton.zen;

  _enginePromise = (async () => {
    const gpuAvailable = await hasWebGPU();

    if (gpuAvailable) {
      try {
        cfg.onProgress(0, 'Initialising WebGPU engine…');
        await loadWebGPUBackend(cfg.model, cfg);
        return; // success
      } catch (err) {
        // Log and fall through to WASM
        console.warn(
          '[scripture-cite] WebGPU backend failed, switching to WASM fallback.',
          err,
        );
        _webllmEngine = null;
        _backend = null;
      }
    } else {
      cfg.onProgress(0, 'WebGPU not available — using WASM fallback…');
    }

    // WASM fallback (always works)
    await loadWASMBackend(cfg);
  })();

  try {
    await _enginePromise;
    _status = 'ready';
    onStatusChange?.('ready');
    try {
      (globalThis as any).__SCRIPTURE_CITE_ZEN_READY = true;
    } catch (e) {
      // ignore
    }
  } catch (err) {
    _status = 'error';
    _enginePromise = null;
    onStatusChange?.('error');
    try {
      (globalThis as any).__SCRIPTURE_CITE_ZEN_READY = false;
    } catch (e) {}
    throw new ScriptureError(
      'ZEN_LOAD_FAILED',
      `Failed to load any LLM backend: ${String(err)}`,
    );
  }
}

/**
 * Generate a zen explanation for a verse.
 * Results are cached — calling twice for the same verse is instant.
 */
export async function explainVerse(
  verse: ResolvedVerse,
  onStatusChange?: (s: ZenStatus) => void,
): Promise<ZenExplanation> {
  if (!ScriptureConfigSingleton.zen.enabled) {
    throw new ScriptureError(
      'ZEN_NOT_AVAILABLE',
      'Zen mode is not enabled. Set zen.enabled = true in ScriptureConfigure().',
    );
  }

  // Serve from cache
  const key = cacheKey(verse);
  if (_cache.has(key)) {
    return {
      verse,
      explanation: _cache.get(key)!,
      model: _loadedModel ?? ScriptureConfigSingleton.zen.model,
    };
  }

  // Ensure engine is loaded
  await initZenEngine(onStatusChange);

  _status = 'generating';
  onStatusChange?.('generating');

  const ref = verse.book
    ? `${verse.book} ${verse.chapter}:${verse.verse}`
    : `${verse.source} ${verse.chapter}:${verse.verse}`;

  const systemPrompt = ScriptureConfigSingleton.zen.systemPrompt;
  const userPrompt = `Explain this scripture verse from ${ref} (${verse.meta.version}):\n\n"${verse.text}"`;

  try {
    let explanation = await _generateWithBackend(systemPrompt, userPrompt);

    if (_isLowValueExplanation(verse.text, explanation)) {
      const retryPrompt =
        `Your previous answer was too close to the verse text or otherwise low-value. ` +
        `Produce a revised explanation that MUST include the following sections (short, factual):\n` +
        `1) Context: one sentence placing the verse in the immediate chapter/section.\n` +
        `2) Interpretation: 2-3 concise sentences explaining the verse's meaning (avoid praise/epithets).\n` +
        `3) Practical implication: one concrete modern-day application (one sentence).\n` +
        `4) Cross-reference: at most one short reference (book chapter:verse) and one sentence explaining the connection.\n` +
        `If there is textual uncertainty, state it briefly. Do not paraphrase the verse; focus on interpretation, context, and relevance.\n\n` +
        `Verse (${ref}, ${verse.meta.version}):\n"${verse.text}"`;
      explanation = await _generateWithBackend(systemPrompt, retryPrompt);
    }

    _cache.set(key, explanation);
    _status = 'ready';
    onStatusChange?.('ready');

    return { verse, explanation, model: _loadedModel! };
  } catch (err) {
    _status = 'error';
    onStatusChange?.('error');
    throw new ScriptureError(
      'ZEN_LOAD_FAILED',
      `Generation failed: ${String(err)}`,
    );
  }
}

async function _generateWithBackend(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (_backend === 'webgpu' && _webllmEngine) {
    return _runWebGPU(systemPrompt, userPrompt);
  }
  if (_backend === 'wasm' && _wasmPipeline) {
    return _runWASM(systemPrompt, userPrompt);
  }
  throw new Error('No backend available after init — this is a bug.');
}

// ── Runner: WebGPU ────────────────────────────────────────────

async function _runWebGPU(system: string, user: string): Promise<string> {
  const resp = await _webllmEngine!.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
    max_tokens: 200,
  });
  return resp.choices[0]?.message?.content?.trim() ?? '';
}

// ── Runner: WASM ──────────────────────────────────────────────

async function _runWASM(system: string, user: string): Promise<string> {
  // Transformers.js uses chat-template formatted messages
  const prompt = `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;

  const output = await _wasmPipeline!(prompt, {
    max_new_tokens: 180,
    temperature: 0.7,
    do_sample: true,
    repetition_penalty: 1.3,
  });

  const raw = output[0]?.generated_text;
  if (typeof raw === 'string') {
    // Strip the prompt prefix from the output
    return raw.slice(prompt.length).trim();
  }
  // Some versions return message array — get last assistant message
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    if (last && typeof last === 'object' && 'content' in last) {
      return (last as { content: string }).content.trim();
    }
  }
  return '';
}

// ── Utilities ─────────────────────────────────────────────────

export function getZenStatus(): ZenStatus {
  return _status;
}

export function getZenBackend(): ZenBackend {
  return _backend;
}

/** Clear engine state — forces re-initialisation on next use */
export function resetZenEngine(): void {
  _webllmEngine = null;
  _wasmPipeline = null;
  _enginePromise = null;
  _loadedModel = null;
  _backend = null;
  _status = 'idle';
  _cache.clear();
  try {
    (globalThis as any).__SCRIPTURE_CITE_ZEN_READY = false;
  } catch (e) {}
}

/** Clear only the explanation cache (keeps engine loaded) */
export function clearZenCache(): void {
  _cache.clear();
}
