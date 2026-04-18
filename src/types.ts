// ============================================================
// scripture-cite — Types & Interfaces
// ============================================================

import type {
  ScriptureSource,
  BibleBook,
  QuranSurah,
  GitaChapter,
} from './enums.js';

// ── Verse Map Structure ─────────────────────────────────────
// O(1) lookup: verses[book?][chapter][verse]

/** Chapter-to-verse map */
export type VerseMap = Record<string, Record<string, string>>;

/** Book-to-chapter-to-verse map (Bible) */
export type BookVerseMap = Record<string, VerseMap>;

/** Scripture data file format */
export interface ScriptureData {
  meta: ScriptureMeta;
  /** For Bible: { book: { chapter: { verse: text } } }
   *  For Quran/Gita: { chapter: { verse: text } } */
  verses: BookVerseMap | VerseMap;
}

export interface ScriptureMeta {
  source: string;
  version: string;
  lang: string;
  direction?: 'ltr' | 'rtl';
  attribution?: string;
}

// ── Resolved Verse ──────────────────────────────────────────

export interface ResolvedVerse {
  text: string;
  source: ScriptureSource;
  book?: string;
  chapter: string;
  verse: string;
  meta: ScriptureMeta;
}

// ── Component Attributes ────────────────────────────────────

export interface ScriptureCiteAttributes {
  source: string;
  book?: string;
  chapter: string;
  verse: string;
  mode?: 'inline' | 'tooltip';
  zen?: boolean;
  related?: boolean | '1' | '2';
  loading?: 'eager' | 'lazy';
  'no-ref'?: boolean;
}

export interface ZenProviderRequest {
  verse: ResolvedVerse;
  reference: string;
  systemPrompt: string;
  userPrompt: string;
}

export type ZenExplanationProvider = (
  request: ZenProviderRequest,
) => Promise<string> | string;

// ── Global Configuration ────────────────────────────────────

export interface ScriptureTheme {
  /** Primary accent color */
  accentColor?: string;
  /** Font family for verse text */
  verseFont?: string;
  /** Font family for reference label */
  refFont?: string;
  /** Border radius for tooltip/card */
  borderRadius?: string;
  /** Tooltip background */
  tooltipBg?: string;
  /** Tooltip text color */
  tooltipColor?: string;
  /** Inline verse text color */
  inlineColor?: string;
  /** Inline verse background */
  inlineBg?: string;
  /** Shadow for tooltip */
  tooltipShadow?: string;
  /** Max width of tooltip */
  tooltipMaxWidth?: string;
  /** Animation duration */
  animDuration?: string;
}

export interface ZenConfig {
  /** Enable zen mode (loads LLM on first use) */
  enabled: boolean;
  /**
   * WebLLM model ID — used when WebGPU is available.
   * Default:      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" (~400 MB VRAM, fastest)
   * Mid-size:     "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" (~1 GB VRAM)
   * High quality: "Phi-3.5-mini-instruct-q4f16_1-MLC" (~2.4 GB VRAM)
   *
   * When WebGPU is NOT available, the library automatically falls back to
   * WASM via Transformers.js using "Xenova/Qwen2.5-0.5B-Instruct" (ONNX int8, ~350 MB RAM).
   * This fallback is automatic — no configuration needed.
   */
  model?: string;
  /** Custom system prompt for explanations */
  systemPrompt?: string;
  /** Custom CDN for WebLLM (defaults to jsDelivr) */
  webLLMCdn?: string;
  /** Called during model download with (percentComplete 0–100, statusText) */
  onProgress?: (progress: number, text: string) => void;
  /** Explanation provider mode: local model (default) or custom provider callback */
  provider?: 'local' | 'custom';
  /** Custom explanation provider callback (for API-backed or static responses) */
  customProvider?: ZenExplanationProvider | null;
  /** Max number of cached zen explanations in memory */
  cacheMaxEntries?: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

export interface ScriptureConfig {
  theme?: ScriptureTheme;
  zen?: ZenConfig;
  /**
   * Default display mode for all elements (can be overridden per element)
   * @default "tooltip"
   */
  defaultMode?: 'inline' | 'tooltip';
  /**
   * Custom base URL for fetching verse JSON files
   * If set, the library will fetch from: `${dataUrl}/${source}.json`
   */
  dataUrl?: string;
  /** Called when a verse lookup fails */
  onError?: (err: ScriptureError) => void;
  /** Locale for number/text formatting */
  locale?: string;
  /**
   * When true, the library will lazily import and register the bundled
   * sample JSONs for `bible`, `quran`, and `gita`. Can also supply an
   * array of source ids to load only specific defaults.
   */
  loadDefaults?: boolean | string[];
}

// ── Error Types ─────────────────────────────────────────────

export type ScriptureErrorCode =
  | 'SOURCE_NOT_REGISTERED'
  | 'VERSE_NOT_FOUND'
  | 'INVALID_ATTRIBUTES'
  | 'ZEN_NOT_AVAILABLE'
  | 'ZEN_LOAD_FAILED'
  | 'DATA_FETCH_FAILED'
  | 'DEFAULT_LOAD_FAILED';

export class ScriptureError extends Error {
  constructor(
    public readonly code: ScriptureErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ScriptureError';
  }
}

// ── Registry Types ──────────────────────────────────────────

export interface RegistryEntry {
  data: ScriptureData;
  /** Flattened fast-path index: "book:chapter:verse" | "chapter:verse" → text */
  index: Map<string, string>;
  meta: ScriptureMeta;
}

// ── Zen Mode Types ──────────────────────────────────────────

export type ZenStatus =
  | 'idle'
  | 'loading-model'
  | 'ready'
  | 'generating'
  | 'error';

export interface ZenExplanation {
  verse: ResolvedVerse;
  explanation: string;
  model: string;
}

/** Internal event dispatched by the component */
export interface ScriptureVerseEvent {
  verse: ResolvedVerse;
}

export interface ScriptureZenEvent {
  verse: ResolvedVerse;
  explanation: string;
}
