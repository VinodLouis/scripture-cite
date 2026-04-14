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
  if (text.length < 150) return true;

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

function _normaliseSentenceKey(sentence: string): string {
  return sentence
    .replace(/^\s*\d+[\.)]\s*/, '')
    .replace(/^\s*[-*]\s*/, '')
    .toLowerCase()
    .replace(/["'“”‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _isNearDuplicateSentence(a: string, b: string): boolean {
  const aTokens = _tokenSet(a);
  const bTokens = _tokenSet(b);
  if (aTokens.size < 8 || bTokens.size < 8) return false;
  return _overlapRatio(aTokens, bTokens) >= 0.8;
}

function _hasDegenerateRepetition(explanation: string): boolean {
  const text = explanation.trim();
  if (!text) return true;

  // Check repeated full sentences.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentenceCounts = new Map<string, number>();
  for (const sentence of sentences) {
    const key = _normaliseSentenceKey(sentence);
    if (!key) continue;
    const next = (sentenceCounts.get(key) ?? 0) + 1;
    sentenceCounts.set(key, next);
    if (next >= 2 && key.split(' ').length >= 5) {
      return true;
    }
  }

  // If many sentences collapse to a small set after normalisation,
  // treat as looped/degenerate text.
  if (
    sentences.length >= 6 &&
    sentenceCounts.size <= Math.ceil(sentences.length / 2)
  ) {
    return true;
  }

  // Detect repeated quoted chunks (common failure mode in numbered outputs).
  const quotePattern = /["“]([^"”]{20,})["”]/g;
  const quoteCounts = new Map<string, number>();
  for (const match of text.matchAll(quotePattern)) {
    const key = _normaliseSentenceKey(match[1] ?? '');
    if (!key) continue;
    const next = (quoteCounts.get(key) ?? 0) + 1;
    quoteCounts.set(key, next);
    if (next >= 2) return true;
  }

  // Check repeated 3-gram phrases.
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (words.length < 18) return false;

  const ngramCounts = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i += 1) {
    const gram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    const next = (ngramCounts.get(gram) ?? 0) + 1;
    ngramCounts.set(gram, next);
    if (next >= 4) return true;
  }

  return false;
}

function _hasIncompleteTail(explanation: string): boolean {
  const text = explanation.trim();
  if (!text) return true;
  if (!/[.!?]$/.test(text)) return true;

  // Guard against awkward clipped endings such as "... to be with his".
  return /\b(the|a|an|to|and|or|of|in|with|for|his|her|their)\s*[.!?]$/i.test(
    text,
  );
}

function _postProcessExplanation(explanation: string): string {
  const raw = explanation.replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Remove duplicate sentences to avoid visible looping output.
  const seen = new Set<string>();
  const deduped: string[] = [];
  const dedupedForSimilarity: string[] = [];
  for (const sentence of sentences) {
    const key = _normaliseSentenceKey(sentence);
    if (!key || seen.has(key)) continue;

    // Also remove near-duplicate rephrasings that are not exact text matches.
    if (
      dedupedForSimilarity.some((prev) =>
        _isNearDuplicateSentence(prev, sentence),
      )
    ) {
      continue;
    }

    seen.add(key);
    const cleaned = sentence.replace(/^\s*\d+[\.)]\s*/, '').trim();
    deduped.push(cleaned);
    dedupedForSimilarity.push(cleaned);
  }

  let text = deduped.join(' ').trim();

  // If response is clipped, keep only complete-sentence prefix.
  if (text && !/[.!?]$/.test(text)) {
    const lastBoundary = Math.max(
      text.lastIndexOf('.'),
      text.lastIndexOf('!'),
      text.lastIndexOf('?'),
    );
    text = lastBoundary > 0 ? text.slice(0, lastBoundary + 1).trim() : text;
  }

  return text;
}

function _isPoorQualityExplanation(
  verseText: string,
  explanation: string,
): boolean {
  return (
    _isLowValueExplanation(verseText, explanation) ||
    _hasDegenerateRepetition(explanation) ||
    _hasIncompleteTail(explanation)
  );
}

function _buildSafeFallbackExplanation(
  verse: ResolvedVerse,
  ref: string,
): string {
  return (
    `In ${ref}, the text should be read in its immediate literary flow rather than as an isolated slogan. ` +
    `A careful theological reading asks what this line claims about God, humanity, duty, or moral order within the larger section. ` +
    `The verse often carries both a direct meaning for its original audience and an enduring principle that later readers apply with discernment. ` +
    `Interpretation can vary across traditions, so strong claims should stay anchored to the wording and context of this specific passage. ` +
    `A responsible modern application is to let this verse shape character and action without forcing it beyond its textual scope.`
  );
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
    const cached = _cache.get(key)!;
    const sanitized = _postProcessExplanation(cached);
    if (sanitized && sanitized !== cached) {
      _cache.set(key, sanitized);
    }
    return {
      verse,
      explanation: sanitized || cached,
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
    let explanation = await _generateWithBackend(
      systemPrompt,
      userPrompt,
      'balanced',
    );

    if (_isPoorQualityExplanation(verse.text, explanation)) {
      const retryPrompt =
        `Your previous answer was low quality (repetitive, incomplete, or too close to the verse). ` +
        `Rewrite it as one compact paragraph of exactly 7-10 complete sentences. ` +
        `Do not repeat phrases or sentences. Do not end mid-sentence.\n` +
        `Required content:\n` +
        `1) Context: 1-2 sentences placing the verse in immediate literary context.\n` +
        `2) Interpretation: 3-4 sentences explaining key theological meaning and important terms.\n` +
        `3) Interpretive diversity: one short sentence noting a major interpretive difference when relevant.\n` +
        `4) Practical implication: one concrete modern application sentence.\n` +
        `5) Optional cross-reference: at most one short reference if truly helpful.\n\n` +
        `Verse (${ref}, ${verse.meta.version}):\n"${verse.text}"`;
      explanation = await _generateWithBackend(
        systemPrompt,
        retryPrompt,
        'strict',
      );

      if (_isPoorQualityExplanation(verse.text, explanation)) {
        const finalPrompt =
          `Produce exactly 8 complete, non-repetitive sentences explaining this verse. ` +
          `No headings, no bullet points, no repeated wording, and finish cleanly.\n\n` +
          `Verse (${ref}, ${verse.meta.version}):\n"${verse.text}"`;
        explanation = await _generateWithBackend(
          systemPrompt,
          finalPrompt,
          'strict',
        );

        if (_isPoorQualityExplanation(verse.text, explanation)) {
          const lastChancePrompt =
            `Write one paragraph with exactly 7 complete sentences explaining this verse. ` +
            `Do NOT quote the verse directly. Do NOT number sentences. Do NOT repeat any phrase. ` +
            `Include context, theological meaning, and one practical implication.\n\n` +
            `Verse (${ref}, ${verse.meta.version}):\n"${verse.text}"`;
          explanation = await _generateWithBackend(
            systemPrompt,
            lastChancePrompt,
            'strict',
          );
        }
      }
    }

    explanation = _postProcessExplanation(explanation);

    if (_isPoorQualityExplanation(verse.text, explanation)) {
      explanation = _buildSafeFallbackExplanation(verse, ref);
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
  decodeMode: 'balanced' | 'strict',
): Promise<string> {
  if (_backend === 'webgpu' && _webllmEngine) {
    return _runWebGPU(systemPrompt, userPrompt, decodeMode);
  }
  if (_backend === 'wasm' && _wasmPipeline) {
    return _runWASM(systemPrompt, userPrompt, decodeMode);
  }
  throw new Error('No backend available after init — this is a bug.');
}

// ── Runner: WebGPU ────────────────────────────────────────────

async function _runWebGPU(
  system: string,
  user: string,
  decodeMode: 'balanced' | 'strict',
): Promise<string> {
  const strict = decodeMode === 'strict';
  const resp = await _webllmEngine!.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: strict ? 0.2 : 0.45,
    max_tokens: strict ? 320 : 360,
  });
  return resp.choices[0]?.message?.content?.trim() ?? '';
}

// ── Runner: WASM ──────────────────────────────────────────────

async function _runWASM(
  system: string,
  user: string,
  decodeMode: 'balanced' | 'strict',
): Promise<string> {
  const strict = decodeMode === 'strict';
  // Transformers.js uses chat-template formatted messages
  const prompt = `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;

  const output = await _wasmPipeline!(prompt, {
    max_new_tokens: strict ? 320 : 360,
    temperature: strict ? 0.2 : 0.45,
    do_sample: !strict,
    repetition_penalty: strict ? 1.75 : 1.45,
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
