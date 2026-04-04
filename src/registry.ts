// ============================================================
// scripture-cite — Scripture Registry
// O(1) verse lookup via pre-built flat index maps
// ============================================================

import type {
  ScriptureData,
  RegistryEntry,
  ResolvedVerse,
  ScriptureMeta,
} from './types.js';
import { ScriptureError } from './types.js';
import { ScriptureSource } from './enums.js';
import { ScriptureConfigSingleton } from './config.js';

// ── Key builders ────────────────────────────────────────────
// Bible:      "genesis:1:1"
// Quran/Gita: "1:1"

function makeKey(chapter: string, verse: string, book?: string): string {
  return book ? `${book}:${chapter}:${verse}` : `${chapter}:${verse}`;
}

/** Flatten nested verse map into a single Map for O(1) lookup */
function buildIndex(
  data: ScriptureData,
  hasBook: boolean,
): Map<string, string> {
  const index = new Map<string, string>();

  if (hasBook) {
    // Bible: { book: { chapter: { verse: text } } }
    const bookMap = data.verses as Record<
      string,
      Record<string, Record<string, string>>
    >;
    for (const [book, chapters] of Object.entries(bookMap)) {
      for (const [chapter, verses] of Object.entries(chapters)) {
        for (const [verse, text] of Object.entries(verses)) {
          index.set(makeKey(chapter, verse, book), text);
        }
      }
    }
  } else {
    // Quran / Gita: { chapter: { verse: text } }
    const chapterMap = data.verses as Record<string, Record<string, string>>;
    for (const [chapter, verses] of Object.entries(chapterMap)) {
      for (const [verse, text] of Object.entries(verses)) {
        index.set(makeKey(chapter, verse), text);
      }
    }
  }

  return index;
}

// ── Registry Singleton ──────────────────────────────────────

class ScriptureRegistryClass {
  private readonly _store = new Map<string, RegistryEntry>();
  private readonly _pending = new Map<string, Promise<void>>();
  /** Promise for an in-progress registerDefaults() call (dedupe) */
  private _defaultsPromise: Promise<void> | undefined;

  /** Sources that use a book dimension */
  private readonly _hasBook = new Set<string>([ScriptureSource.BIBLE]);

  /**
   * Register a scripture data object directly.
   * Use this to provide bundled or custom JSON at runtime.
   */
  register(source: string, data: ScriptureData): void {
    const hasBook = this._hasBook.has(source);
    const index = buildIndex(data, hasBook);
    this._store.set(source, { data, index, meta: data.meta });
  }

  /**
   * Register from a URL (lazy fetch). The fetch is deduplicated —
   * multiple calls for the same source only fire one request.
   */
  async registerFromUrl(source: string, url: string): Promise<void> {
    if (this._store.has(source)) return;
    if (this._pending.has(source)) return this._pending.get(source)!;

    const promise = (async () => {
      const res = await fetch(url);
      if (!res.ok)
        throw new ScriptureError(
          'DATA_FETCH_FAILED',
          `HTTP ${res.status} for ${url}`,
        );
      const data = (await res.json()) as ScriptureData;
      this.register(source, data);
    })();

    this._pending.set(source, promise);
    try {
      await promise;
    } catch (err) {
      this._pending.delete(source);
      throw new ScriptureError('DATA_FETCH_FAILED', String(err));
    } finally {
      this._pending.delete(source);
    }
  }

  private async tryImportJson(path: string): Promise<any> {
    try {
      const url = new URL(path, import.meta.url).href;
      // Try import with JSON import assertion
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const mod = await import(url, { assert: { type: 'json' } });
      return mod.default ?? mod;
    } catch (e) {
      // ignore
    }

    try {
      const url = new URL(path, import.meta.url).href;
      const mod = await import(url);
      return mod.default ?? mod;
    } catch (e) {
      // ignore
    }

    const url = new URL(path, import.meta.url).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed for ${url}`);
    return res.json();
  }

  /**
   * Auto-load from configured dataUrl if set.
   * Falls back to throwing SOURCE_NOT_REGISTERED.
   */
  async ensureLoaded(source: string): Promise<void> {
    if (this._store.has(source)) return;
    // If a global defaults registration is in progress, wait for it —
    // registerDefaults() will populate `_store` for bundled sources.
    if (this._defaultsPromise) {
      await this._defaultsPromise;
      if (this._store.has(source)) return;
    }

    // If consumer requested loadDefaults via global config but config
    // code hasn't started registerDefaults yet, kick it off now and wait.
    const ld = ScriptureConfigSingleton.loadDefaults;
    if (ld) {
      const toLoad = Array.isArray(ld) ? ld : undefined;
      await this.registerDefaults(toLoad);
      if (this._store.has(source)) return;
    }

    const base = ScriptureConfigSingleton.dataUrl;
    if (base) {
      const url = `${base.replace(/\/$/, '')}/${source}.json`;
      await this.registerFromUrl(source, url);
      return;
    }

    throw new ScriptureError(
      'SOURCE_NOT_REGISTERED',
      `Scripture source "${source}" is not registered. ` +
        `Call ScriptureRegistry.register("${source}", data) or set ScriptureConfigure({ dataUrl: "..." }).`,
      { source },
    );
  }

  /**
   * Resolve a verse to its text. Returns a ResolvedVerse or throws.
   */
  async resolve(
    source: string,
    chapter: string,
    verse: string,
    book?: string,
  ): Promise<ResolvedVerse> {
    await this.ensureLoaded(source);

    const entry = this._store.get(source)!;
    const key = makeKey(chapter, verse, book);
    const text = entry.index.get(key);

    if (text === undefined) {
      throw new ScriptureError(
        'VERSE_NOT_FOUND',
        `Verse not found: ${source} ${book ? book + ' ' : ''}${chapter}:${verse}`,
        { source, book, chapter, verse, key },
      );
    }

    return {
      text,
      source: source as ScriptureSource,
      ...(book !== undefined ? { book } : {}),
      chapter,
      verse,
      meta: entry.meta,
    };
  }

  /** Synchronous lookup (only works if already loaded) */
  resolveSync(
    source: string,
    chapter: string,
    verse: string,
    book?: string,
  ): ResolvedVerse | undefined {
    const entry = this._store.get(source);
    if (!entry) return undefined;
    const key = makeKey(chapter, verse, book);
    const text = entry.index.get(key);
    if (text === undefined) return undefined;
    return {
      text,
      source: source as ScriptureSource,
      ...(book !== undefined ? { book } : {}),
      chapter,
      verse,
      meta: entry.meta,
    };
  }

  /** Check if a source has been registered */
  isRegistered(source: string): boolean {
    return this._store.has(source);
  }

  /** Get metadata for a registered source */
  getMeta(source: string): ScriptureMeta | undefined {
    return this._store.get(source)?.meta;
  }

  /** Mark a source as requiring a book dimension (default: only Bible) */
  setHasBook(source: string, value: boolean): void {
    if (value) this._hasBook.add(source);
    else this._hasBook.delete(source);
  }

  /**
   * Register bundled default sample JSONs lazily.
   * If `sources` is omitted, registers `bible`, `quran`, and `gita` defaults.
   */
  async registerDefaults(sources?: string[]): Promise<void> {
    if (this._defaultsPromise) return this._defaultsPromise;
    this._defaultsPromise = (async () => {
      const map: Record<string, string> = {
        [ScriptureSource.BIBLE]: '../data/bible.sample.json',
        [ScriptureSource.QURAN]: '../data/quran.sample.json',
        [ScriptureSource.GITA]: '../data/gita.sample.json',
      };

      const keys = sources && sources.length ? sources : Object.keys(map);

      for (const s of keys) {
        if (this._store.has(s)) continue;

        const path = map[s];
        if (!path) continue;

        try {
          // Resolve absolute URL relative to this module so fetch/import work
          // regardless of the document base.
          const url = new URL(path, import.meta.url).href;

          // First try fetch (works with typical static servers)
          let data: any | undefined;
          try {
            const resp = await fetch(url, { cache: 'no-cache' });
            if (resp.ok) data = await resp.json();
          } catch (e) {
            /* ignore and fall back to import */
          }

          if (!data) {
            try {
              // Try import with assertion first (browser/bundler friendly)
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const mod = await import(/* @vite-ignore */ url, {
                assert: { type: 'json' },
              });
              data = mod && mod.default ? mod.default : mod;
            } catch (e) {
              // Plain dynamic import fallback
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const mod = await import(url);
              data = mod && mod.default ? mod.default : mod;
            }
          }

          if (!data) throw new Error('no-data');

          this.register(s, data as ScriptureData);
        } catch (err) {
          throw new ScriptureError(
            'DEFAULT_LOAD_FAILED',
            `Failed to load default data for ${s}: ${String(err)}`,
          );
        }
      }
    })();

    try {
      await this._defaultsPromise;
    } finally {
      this._defaultsPromise = undefined;
    }
  }

  /** Remove a registered source */
  unregister(source: string): void {
    this._store.delete(source);
    this._pending.delete(source);
  }

  /** Clear all registrations (useful for testing) */
  clear(): void {
    this._store.clear();
    this._pending.clear();
  }
}

export const ScriptureRegistry = new ScriptureRegistryClass();
