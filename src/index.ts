// ============================================================
// scripture-cite — Public API
// Zero-dependency scripture citation web component library
// ============================================================

// ── Core Exports ─────────────────────────────────────────────
export {
  ScriptureSource,
  DisplayMode,
  BibleBook,
  QuranSurah,
  GitaChapter,
} from './enums.js';
export type { VerseNumber, ChapterNumber } from './enums.js';

export type {
  ScriptureData,
  ScriptureMeta,
  ResolvedVerse,
  ScriptureConfig,
  ScriptureTheme,
  ZenConfig,
  ZenStatus,
  ZenExplanation,
  RegistryEntry,
  ScriptureErrorCode,
} from './types.js';

export { ScriptureError } from './types.js';

// ── Registry ──────────────────────────────────────────────────
export { ScriptureRegistry } from './registry.js';

// ── Configuration ─────────────────────────────────────────────
export { ScriptureConfigSingleton } from './config.js';

// ── Web Component ─────────────────────────────────────────────
export { ScriptureCiteElement, defineScriptureCite } from './component.js';

// ── Zen (optional, lazy) ──────────────────────────────────────
// Expose lazy wrappers so the heavy `zen-mode` implementation is only
// loaded when the consumer actually uses Zen features. We keep a tiny
// in-module cache for status/backend so `getZenStatus()` remains cheap
// and synchronous after the wrapper has been used.
import type { ResolvedVerse, ZenExplanation, ZenStatus } from './types.js';

let _zenStatus: ZenStatus = 'idle';
let _zenBackend: 'webgpu' | 'wasm' | null = null;

export function getZenStatus(): ZenStatus {
  return _zenStatus;
}

export function getZenBackend(): 'webgpu' | 'wasm' | null {
  return _zenBackend;
}

export async function initZenEngine(
  onStatusChange?: (s: ZenStatus) => void,
): Promise<void> {
  const mod = await import('./zen/zen-mode.js');
  // Mirror status updates into our local cache and forward to caller
  const wrappedCb = (s: ZenStatus) => {
    _zenStatus = s;
    onStatusChange?.(s);
  };
  await mod.initZenEngine(wrappedCb);
  // update backend/status cache after initialisation
  try {
    _zenBackend = mod.getZenBackend();
    _zenStatus = mod.getZenStatus();
  } catch (e) {
    // ignore — keep defaults
  }
}

export async function explainVerse(
  verse: ResolvedVerse,
  onStatusChange?: (s: ZenStatus) => void,
): Promise<ZenExplanation> {
  const mod = await import('./zen/zen-mode.js');
  const wrappedCb = (s: ZenStatus) => {
    _zenStatus = s;
    onStatusChange?.(s);
  };
  const res = await mod.explainVerse(verse, wrappedCb);
  try {
    _zenStatus = mod.getZenStatus();
    _zenBackend = mod.getZenBackend();
  } catch (e) {}
  return res;
}

export async function resetZenEngine(): Promise<void> {
  const mod = await import('./zen/zen-mode.js');
  mod.resetZenEngine();
  _zenBackend = null;
  _zenStatus = 'idle';
}

export async function clearZenCache(): Promise<void> {
  const mod = await import('./zen/zen-mode.js');
  mod.clearZenCache();
}

// ── Public API sugar ──────────────────────────────────────────

import type { ScriptureConfig } from './types.js';
import { ScriptureConfigSingleton } from './config.js';
import { defineScriptureCite } from './component.js';

/**
 * Configure the library globally.
 *
 * Must be called BEFORE the first <scripture-cite> element is parsed.
 * With bundlers: call it at the top of your entry file, before rendering.
 * With CDN <script type="module">: placement before body content guarantees
 * ordering because ES modules are always deferred.
 *
 * @example
 * ScriptureConfigure({
 *   defaultMode: "tooltip",
 *   theme: { accentColor: "#6b4c9a" },
 *   zen: { enabled: true },
 *   dataUrl: "/static/scripture",
 * });
 */
export function ScriptureConfigure(config: ScriptureConfig): void {
  ScriptureConfigSingleton.configure(config);
}

/**
 * Returns a Promise that resolves once the <scripture-cite> element is
 * defined and all existing instances in the document have been upgraded.
 *
 * Use this if you query scripture-cite elements imperatively and need to
 * be sure they are fully initialised:
 *
 * @example
 * await ScriptureReady();
 * const el = document.querySelector('scripture-cite');
 * el.setAttribute('verse', '2');  // safe — element is upgraded
 */
export async function ScriptureReady(
  tagName = 'scripture-cite',
): Promise<void> {
  if (typeof customElements === 'undefined') return;
  // whenDefined resolves as soon as the constructor is registered.
  await customElements.whenDefined(tagName);
  // upgradeElement flushes all pending upgrades synchronously so any
  // elements already in the DOM are fully constructed before we return.
  // This is a no-op for elements upgraded during normal registration.
  if (typeof document !== 'undefined') {
    document
      .querySelectorAll(tagName)
      .forEach((el) => customElements.upgrade(el));
  }
}

// ── Auto-register element on import ──────────────────────────
//
// ES module evaluation is always deferred (spec §16.2.1) — the script
// runs only after the document is parsed, which means:
//   • All static <scripture-cite> tags exist in the DOM as HTMLElement
//     stubs before this line executes.
//   • customElements.define() triggers synchronous upgrade of every
//     existing stub, calling the constructor + attributeChangedCallback
//     + connectedCallback in document order.
//   • The _pendingAttributeChange guard in the component handles the case
//     where attributeChangedCallback fires before connectedCallback during
//     this upgrade sweep.
//
// For dynamically created elements (document.createElement / innerHTML)
// the element is upgraded immediately at define() time if already in DOM,
// or at insertAdjacentHTML / appendChild time if added later.
//
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  defineScriptureCite();
}
