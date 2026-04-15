// ============================================================
// scripture-cite — Web Component
// <scripture-cite source="bible" book="genesis" chapter="1" verse="1">
// ============================================================

import { ScriptureRegistry } from './registry.js';
import { ScriptureConfigSingleton } from './config.js';
import { ScriptureError } from './types.js';
import type { ResolvedVerse } from './types.js';

// Global single tooltip portal (shared by all instances)
let __sc_portal_el: HTMLElement | null = null;
let __sc_portal_listeners: {
  enter: EventListener;
  leave: EventListener;
} | null = null;

const SC_THEME_VARS = [
  '--sc-accent',
  '--sc-verse-font',
  '--sc-ref-font',
  '--sc-radius',
  '--sc-tooltip-bg',
  '--sc-tooltip-color',
  '--sc-shadow',
  '--sc-tooltip-max-width',
  '--sc-anim',
] as const;

const PORTAL_STYLES = /* css */ `
/* Portal styles (only tooltip-related rules) - high-specificity and important overrides */
.sc-tooltip-wrap {
  position: fixed !important;
  z-index: 2147483647 !important;
  width: max-content !important;
  box-sizing: border-box !important;
  pointer-events: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  transition: opacity var(--sc-anim,200ms) ease, transform var(--sc-anim,200ms) ease !important;
  transform: translateX(-50%) translateY(6px) !important;
}
.sc-tooltip-wrap.open { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; transform: translateX(-50%) translateY(0) !important; }
.sc-tooltip {
  display: block !important;
  max-width: min(var(--sc-tooltip-max-width, 420px), calc(100vw - 24px)) !important;
  box-sizing: border-box !important;
  background: var(--sc-tooltip-bg, #1a1208) !important;
  color: var(--sc-tooltip-color, #f5e6c8) !important;
  border-radius: var(--sc-radius,8px) !important;
  padding: 14px 16px !important;
  box-shadow: var(--sc-shadow, 0 8px 32px rgba(0,0,0,0.35)) !important;
  font-family: var(--sc-verse-font, Georgia, serif) !important;
  font-size: 0.9em !important;
  line-height: 1.65 !important;
  font-style: italic !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
.sc-tooltip-ref { display:block !important; font-family: var(--sc-ref-font, system-ui, sans-serif) !important; font-style: normal !important; font-size: 0.76em !important; color: var(--sc-accent,#8b6914) !important; font-weight:600 !important; margin-top:8px !important; letter-spacing:0.04em !important; text-transform:uppercase !important; }
/* Arrow: inline SVG triangle to ensure crisp rendering */
.sc-arrow {
  position: absolute !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: 18px !important;
  height: 8px !important;
  pointer-events: none !important;
  display: block !important;
}
.sc-tooltip-wrap[data-placement="top"] .sc-arrow { bottom: -6px !important; }
.sc-tooltip-wrap[data-placement="bottom"] .sc-arrow { top: -6px !important; }
.sc-arrow svg { display: block; width: 100%; height: 100%; }
.sc-arrow svg path { fill: var(--sc-tooltip-bg, #1a1208) !important; }
.sc-tooltip-wrap[data-placement="top"] .sc-arrow svg { transform: rotate(180deg); transform-origin: 50% 50%; }
/* Left / right arrow rotations */
.sc-tooltip-wrap[data-placement="left"] .sc-arrow { right: -6px !important; left: auto !important; }
.sc-tooltip-wrap[data-placement="right"] .sc-arrow { left: -9px !important; }
.sc-tooltip-wrap[data-placement="left"] .sc-arrow svg { transform: rotate(90deg); transform-origin: 50% 50%; }
.sc-tooltip-wrap[data-placement="right"] .sc-arrow svg { transform: rotate(-90deg); transform-origin: 50% 50%; }
/* Invisible bridge between trigger and portal to prevent flicker when moving cursor */
.sc-bridge {
  position: fixed !important;
  background: transparent !important;
  pointer-events: auto !important;
  z-index: 2147483646 !important;
}
`;

function ensurePortal(): HTMLElement {
  if (__sc_portal_el && document.body.contains(__sc_portal_el)) {
    return __sc_portal_el;
  }
  __sc_portal_el = null;
  const styleId = 'scripture-cite-portal-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = PORTAL_STYLES;
    document.head.appendChild(style);
  }
  // Remove any stray tooltip nodes left in the light DOM from earlier
  // renders (dev HMR or prior builds can leave nodes behind).
  const stray = document.querySelectorAll('.sc-tooltip-wrap, .sc-tooltip');
  for (const n of Array.from(stray)) {
    if (n.closest && n.closest('#scripture-cite-portal')) continue;
    // Only remove if it's attached to body (avoid touching unrelated nodes)
    if (document.body.contains(n)) n.remove();
  }

  const el = document.createElement('div');
  el.id = 'scripture-cite-portal';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  __sc_portal_el = el;
  return el;
}

function applyHostThemeToPortal(host: HTMLElement, target: HTMLElement): void {
  const computed = getComputedStyle(host);
  for (const cssVar of SC_THEME_VARS) {
    const value = computed.getPropertyValue(cssVar).trim();
    if (!value) continue;
    target.style.setProperty(cssVar, value);
  }
}

// ── Shadow DOM Styles ───────────────────────────────────────

const STYLES = /* css */ `
  :host {
    display: inline;
    position: relative;
    font-family: inherit;
  }

  /* ── Inline Mode ─────────────────────────── */
  .sc-inline {
    display: inline;
    font-family: var(--sc-verse-font, Georgia, serif);
    color: var(--sc-inline-color, #3d2b00);
    background: var(--sc-inline-bg, #fdf6e3);
    padding: 0.1em 0.35em;
    border-radius: calc(var(--sc-radius, 8px) * 0.5);
    border-left: 2px solid var(--sc-accent, #8b6914);
    font-style: italic;
    line-height: 1.6;
  }

  .sc-ref {
    font-family: var(--sc-ref-font, system-ui, sans-serif);
    font-style: normal;
    font-size: 0.78em;
    color: var(--sc-accent, #8b6914);
    font-weight: 600;
    margin-left: 0.4em;
    letter-spacing: 0.01em;
  }

  /* ── Tooltip Mode ────────────────────────── */
  .sc-trigger {
    display: inline;
    cursor: help;
    border-bottom: 1.5px dashed var(--sc-accent, #8b6914);
    text-decoration: none;
    color: inherit;
  }

  .sc-tooltip-wrap {
    position: fixed;
    z-index: 9999;
    left: 0;
    top: 0;
    width: max-content;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--sc-anim, 200ms) ease,
      transform var(--sc-anim, 200ms) ease,
      visibility 0ms linear var(--sc-anim, 200ms);
    transform: translateX(-50%) translateY(6px);
  }

  :host([data-open]) .sc-tooltip-wrap,
  .sc-tooltip-wrap.open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition:
      opacity var(--sc-anim, 200ms) ease,
      transform var(--sc-anim, 200ms) ease;
    transform: translateX(-50%) translateY(0);
  }

  .sc-tooltip {
    display: block;
    max-width: min(var(--sc-tooltip-max-width, 420px), calc(100vw - 24px));
    box-sizing: border-box;
    background: var(--sc-tooltip-bg, #1a1208);
    color: var(--sc-tooltip-color, #f5e6c8);
    border-radius: var(--sc-radius, 8px);
    padding: 14px 16px;
    box-shadow: var(--sc-shadow, 0 8px 32px rgba(0,0,0,0.35));
    font-family: var(--sc-verse-font, Georgia, serif);
    font-size: 0.9em;
    line-height: 1.65;
    font-style: italic;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  /* Arrow element (inline SVG triangle) */
  .sc-arrow {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 18px;
    height: 8px;
    pointer-events: none;
    display: block;
  }

  .sc-tooltip-wrap[data-placement="top"] .sc-arrow {
    bottom: -6px;
  }

  .sc-tooltip-wrap[data-placement="bottom"] .sc-arrow {
    top: -6px;
  }

  .sc-arrow svg { display:block; width:100%; height:100%; }
  .sc-arrow svg path { fill: var(--sc-tooltip-bg, #1a1208); }
  .sc-tooltip-wrap[data-placement="top"] .sc-arrow svg { transform: rotate(180deg); transform-origin: 50% 50%; }
  .sc-tooltip-wrap[data-placement="left"] .sc-arrow { right: -6px; left: auto; }
  .sc-tooltip-wrap[data-placement="right"] .sc-arrow { left: -9px; }
  .sc-tooltip-wrap[data-placement="left"] .sc-arrow svg { transform: rotate(90deg); transform-origin: 50% 50%; }
  .sc-tooltip-wrap[data-placement="right"] .sc-arrow svg { transform: rotate(-90deg); transform-origin: 50% 50%; }

  .sc-tooltip-ref {
    display: block;
    font-family: var(--sc-ref-font, system-ui, sans-serif);
    font-style: normal;
    font-size: 0.76em;
    color: var(--sc-accent, #8b6914);
    font-weight: 600;
    margin-top: 8px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* ── Loading ─────────────────────────────── */
  .sc-loading {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    vertical-align: middle;
    padding: 0 4px;
  }

  .sc-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--sc-accent, #8b6914);
    animation: sc-pulse 1.2s ease-in-out infinite;
  }

  .sc-dot:nth-child(2) { animation-delay: 0.2s; }
  .sc-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes sc-pulse {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* ── Error ───────────────────────────────── */
  .sc-error {
    color: #c0392b;
    font-size: 0.8em;
    font-style: normal;
    font-family: var(--sc-ref-font, system-ui, sans-serif);
  }

  /* ── Zen Mode ────────────────────────────── */
  .sc-zen-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    padding: 5px 10px;
    background: transparent;
    border: 1px solid var(--sc-accent, #8b6914);
    border-radius: calc(var(--sc-radius, 8px) * 0.6);
    color: var(--sc-accent, #8b6914);
    font-size: 0.72em;
    font-family: var(--sc-ref-font, system-ui, sans-serif);
    cursor: pointer;
    transition: background var(--sc-anim, 200ms), color var(--sc-anim, 200ms);
    letter-spacing: 0.04em;
    pointer-events: auto;
  }

  .sc-inline-zen {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-left: 0.45em;
    vertical-align: baseline;
  }

  .sc-inline-zen-btn {
    margin-top: 0;
    padding: 3px 8px;
    font-size: 0.68em;
  }

  .sc-inline-zen-body {
    display: block;
    flex-basis: 100%;
    margin-top: 6px;
  }

  .sc-inline-zen-body[hidden] {
    display: none !important;
  }

  .sc-inline-zen-body .sc-zen-explanation {
    margin-top: 0;
    padding: 8px 10px;
    border-top: 0;
    border-radius: calc(var(--sc-radius, 8px) * 0.6);
    background: var(--sc-inline-bg, #fdf6e3);
    color: var(--sc-inline-color, #3d2b00);
  }

  .sc-zen-btn:hover {
    background: var(--sc-accent, #8b6914);
    color: var(--sc-tooltip-bg, #1a1208);
  }

  .sc-zen-panel {
    margin-top: 10px;
  }

  .sc-zen-hint {
    margin-top: 6px;
    font-size: 0.72em;
    line-height: 1.4;
    font-style: normal;
    font-family: var(--sc-ref-font, system-ui, sans-serif);
    color: var(--sc-accent, #8b6914);
    opacity: 0.9;
  }

  .sc-zen-explanation {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255,255,255,0.12);
    font-style: normal;
    font-size: 0.88em;
    line-height: 1.6;
    color: var(--sc-tooltip-color, #f5e6c8);
    opacity: 0.9;
  }

  .sc-zen-progress {
    font-size: 0.72em;
    font-style: normal;
    font-family: var(--sc-ref-font, system-ui, sans-serif);
    color: var(--sc-accent, #8b6914);
    margin-top: 6px;
  }
`;

// ── Utility ──────────────────────────────────────────────────

function formatRef(v: ResolvedVerse): string {
  const src = v.source.charAt(0).toUpperCase() + v.source.slice(1);
  if (v.book) {
    const book = v.book
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `${book} ${v.chapter}:${v.verse}`;
  }
  return `${src} ${v.chapter}:${v.verse}`;
}

// ── Web Component ────────────────────────────────────────────

export class ScriptureCiteElement extends HTMLElement {
  private static _currentOpen: ScriptureCiteElement | null = null;
  static readonly observedAttributes = [
    'source',
    'book',
    'chapter',
    'verse',
    'mode',
    'placement',
    'zen',
    'no-ref',
    'loading',
  ] as const;

  private _shadow: ShadowRoot;
  private _root!: HTMLElement;
  private _verse: ResolvedVerse | null = null;
  private _zenExplanation: string | null = null;
  private _zenStatus: import('./types.js').ZenStatus = 'idle';
  private _isOpen = false;
  private _abortController: AbortController | null = null;
  private _zenPrimePromise: Promise<void> | null = null;

  /**
   * Tracks whether attributeChangedCallback fired before connectedCallback.
   *
   * Race: The HTML parser can call attributeChangedCallback during the
   * upgrade of a pre-existing element (e.g. <scripture-cite> written in
   * static HTML) BEFORE connectedCallback fires — i.e. while isConnected
   * is still false. We buffer those changes here and flush in
   * connectedCallback so no attribute set during parsing is silently lost.
   */
  private _pendingAttributeChange = false;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this._shadow.appendChild(style);
    this._root = document.createElement('span');
    this._shadow.appendChild(this._root);
    // Render loading dots immediately so there is no flash of empty
    // content between parse time and connectedCallback.
    this._renderLoading();
  }

  // ── Lifecycle ──────────────────────────────────────────────

  connectedCallback(): void {
    // Flush any attribute changes buffered during the upgrade/parse race.
    this._pendingAttributeChange = false;
    this._init();
  }

  disconnectedCallback(): void {
    this._abortController?.abort();
    this._removeTooltipListeners();
  }

  attributeChangedCallback(): void {
    if (!this.isConnected) {
      // Not yet in the DOM — buffer the change.
      // connectedCallback will call _init() and pick up the latest attrs.
      this._pendingAttributeChange = true;
      return;
    }
    // Already live — re-render reactively.
    this._abortController?.abort();
    this._verse = null;
    this._zenExplanation = null;
    this._zenStatus = 'idle';
    this._init();
  }

  // ── Attribute Accessors ────────────────────────────────────

  private get _source(): string {
    return this.getAttribute('source')?.toLowerCase() ?? '';
  }

  private get _book(): string | undefined {
    return this.getAttribute('book')?.toLowerCase() || undefined;
  }

  private get _chapter(): string {
    return this.getAttribute('chapter') ?? '';
  }

  private get _verseAttr(): string {
    return this.getAttribute('verse') ?? '';
  }

  private get _mode(): 'inline' | 'tooltip' {
    const m = this.getAttribute('mode');
    if (m === 'inline' || m === 'tooltip') return m;
    return ScriptureConfigSingleton.defaultMode;
  }

  private get _placement(): string | null {
    const v = this.getAttribute('placement');
    return v ? v.toLowerCase() : null;
  }

  private get _zenEnabled(): boolean {
    return (
      this.hasAttribute('zen') &&
      this.getAttribute('zen') !== 'false' &&
      ScriptureConfigSingleton.zen.enabled
    );
  }

  private get _noRef(): boolean {
    return this.hasAttribute('no-ref');
  }

  // ── Init & Render ──────────────────────────────────────────

  private _init(): void {
    if (!this._source || !this._chapter || !this._verseAttr) {
      this._renderError('Missing required attributes: source, chapter, verse');
      return;
    }

    const isLazy =
      this.getAttribute('loading') === 'lazy' ||
      (this._mode === 'tooltip' && !this.hasAttribute('loading'));

    if (isLazy && !this._isIntersecting()) {
      this._renderLoading();
      this._observeIntersection();
    } else {
      this._loadAndRender();
    }
  }

  private _isIntersecting(): boolean {
    // For tooltip mode, only load when visible in viewport
    const rect = this.getBoundingClientRect();
    return rect.top < window.innerHeight + 300;
  }

  private _observeIntersection(): void {
    if (!('IntersectionObserver' in window)) {
      this._loadAndRender();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          io.disconnect();
          this._loadAndRender();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(this);
  }

  private async _loadAndRender(): Promise<void> {
    this._renderLoading();
    this._abortController = new AbortController();

    try {
      this._verse = await ScriptureRegistry.resolve(
        this._source,
        this._chapter,
        this._verseAttr,
        this._book,
      );
      this._render();
    } catch (err) {
      const msg =
        err instanceof ScriptureError ? err.message : 'Failed to load verse';
      ScriptureConfigSingleton.onError?.(err as ScriptureError);
      this._renderError(msg);
      this.dispatchEvent(
        new CustomEvent('scripture-error', { detail: err, bubbles: true }),
      );
    }
  }

  // ── Renderers ──────────────────────────────────────────────

  private _renderLoading(): void {
    this._root.innerHTML = /* html */ `
      <span class="sc-loading" aria-label="Loading verse…" aria-busy="true">
        <span class="sc-dot"></span>
        <span class="sc-dot"></span>
        <span class="sc-dot"></span>
      </span>`;
  }

  private _renderError(msg: string): void {
    this._root.innerHTML = /* html */ `
      <span class="sc-error" role="alert" title="${escapeHtml(msg)}">
        [scripture error]
      </span>`;
  }

  private _render(): void {
    if (!this._verse) return;

    if (this._mode === 'inline') {
      this._renderInline();
    } else {
      this._renderTooltip();
    }

    // Dispatch resolved event
    this.dispatchEvent(
      new CustomEvent('scripture-resolved', {
        detail: this._verse,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderInline(): void {
    const v = this._verse!;
    const zenBodyId = `zen-inline-${Math.random().toString(36).slice(2, 8)}`;
    const ref = this._noRef
      ? ''
      : `<span class="sc-ref">(${escapeHtml(formatRef(v))})</span>`;
    this._root.innerHTML = /* html */ `
      <span class="sc-inline" part="verse"
            role="text"
            aria-label="${escapeHtml(formatRef(v))}: ${escapeHtml(v.text)}">
        ${escapeHtml(v.text)}${ref}
      </span>
      ${
        this._zenEnabled
          ? `<span class="sc-inline-zen" part="inline-zen"><button class="sc-zen-btn sc-inline-zen-btn" type="button" aria-expanded="false" aria-controls="${zenBodyId}">✦ Zen Explain</button><span class="sc-inline-zen-body" id="${zenBodyId}" hidden></span></span>`
          : ''
      }`;

    if (this._zenEnabled) {
      const btn =
        this._shadow.querySelector<HTMLButtonElement>('.sc-inline-zen-btn');
      btn?.addEventListener('mouseenter', () => {
        void this._primeZen();
      });
      btn?.addEventListener('focus', () => {
        void this._primeZen();
      });
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        void this._toggleInlineZen();
      });
    }
  }

  private _renderTooltip(): void {
    const v = this._verse!;
    const slotContent = this.innerHTML.trim();
    const triggerText = slotContent || escapeHtml(formatRef(v));
    const zenBtnId = `zen-${Math.random().toString(36).slice(2, 8)}`;

    this._root.innerHTML = /* html */ `
      <span class="sc-trigger"
            role="button"
            tabindex="0"
            aria-label="View verse: ${escapeHtml(formatRef(v))}"
            aria-expanded="false"
            aria-haspopup="true"
            part="trigger">
        ${triggerText}
      </span>
      <span class="sc-tooltip-wrap" role="tooltip" part="tooltip-wrap">
        <span class="sc-tooltip" part="tooltip">
            ${escapeHtml(v.text)}
            ${this._noRef ? '' : `<span class="sc-tooltip-ref">${escapeHtml(formatRef(v))}</span>`}
            ${this._zenEnabled ? `<div class="sc-zen-panel" id="${zenBtnId}"><button class="sc-zen-btn" type="button">✦ Zen Explain</button><p class="sc-zen-hint">First use downloads the model.</p></div>` : ''}
          </span>
          <span class="sc-arrow" part="arrow" aria-hidden="true">
            <svg viewBox="0 0 18 8" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <path d="M0 8 L9 0 L18 8 Z" fill="var(--sc-tooltip-bg, #1a1208)" />
            </svg>
          </span>
      </span>`;

    this._attachTooltipListeners();

    // When using the shared portal, keep the shadow DOM tooltip hidden
    const shadowWrap =
      this._shadow.querySelector<HTMLElement>('.sc-tooltip-wrap');
    if (shadowWrap) {
      shadowWrap.style.display = 'none';
      shadowWrap.setAttribute('aria-hidden', 'true');
    }

    if (this._zenEnabled) {
      const btn = this._shadow.querySelector(
        '.sc-zen-btn',
      ) as HTMLButtonElement | null;
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._triggerZen();
      });
    }
  }

  // ── Tooltip Logic ──────────────────────────────────────────

  private _openTooltip(): void {
    const wrap = this._shadow.querySelector<HTMLElement>('.sc-tooltip-wrap');
    const trigger = this._shadow.querySelector<HTMLElement>('.sc-trigger');
    if (!wrap || !trigger) return;
    // Close any other open tooltip
    if (
      ScriptureCiteElement._currentOpen &&
      ScriptureCiteElement._currentOpen !== this
    ) {
      ScriptureCiteElement._currentOpen._closeTooltip();
    }

    trigger.setAttribute('aria-expanded', 'true');
    this.setAttribute('data-open', '');
    this._isOpen = true;

    // Use shared portal to render the tooltip so only one DOM node is visible
    const portal = ensurePortal();
    const inner =
      wrap.querySelector('.sc-tooltip')?.outerHTML ?? wrap.innerHTML;
    const container = document.createElement('div');
    container.className = 'sc-tooltip-wrap';
    container.setAttribute('role', 'tooltip');
    // Inject two arrow variants: a wide top/bottom SVG (18x8) and a tall
    // side SVG (8x18). We'll show the appropriate one after computing
    // placement so side arrows don't require rotation (avoids clipping).
    container.innerHTML = `${inner}
      <span class="sc-arrow sc-arrow-top" aria-hidden="true">
        <svg viewBox="0 0 18 8" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M0 8 L9 0 L18 8 Z" fill="var(--sc-tooltip-bg, #1a1208)"/>
        </svg>
      </span>
      <span class="sc-arrow sc-arrow-side" aria-hidden="true" style="display:none">
        <svg viewBox="0 0 8 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M0 9 L8 0 L8 18 Z" fill="var(--sc-tooltip-bg, #1a1208)"/>
        </svg>
      </span>`;
    // Replace any existing portal children to avoid duplicates/stacking
    portal.replaceChildren(container);
    // Defensive fallback: ensure the portal actually contains the tooltip wrap.
    // Some environments can prevent replaceChildren from taking effect; if
    // the wrap is not found, append the container explicitly.
    if (!portal.querySelector('.sc-tooltip-wrap')) {
      portal.appendChild(container);
    }

    // The tooltip is rendered in a body-level portal, so host-scoped CSS
    // variables (class or inline styles on <scripture-cite>) do not cascade
    // automatically. Mirror them onto the portal container.
    applyHostThemeToPortal(this, container);

    if (this._zenEnabled) {
      const portalZenBtn =
        container.querySelector<HTMLButtonElement>('.sc-zen-btn');
      portalZenBtn?.addEventListener('mouseenter', () => {
        void this._primeZen();
      });
      portalZenBtn?.addEventListener('focus', () => {
        void this._primeZen();
      });
      portalZenBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        void this._triggerZen();
      });
    }

    // Ensure the inline SVG arrow's path fill cannot be overridden by
    // portal stylesheet rules that use `!important`. Use inline style
    // with `important` so the arrow remains visible.
    try {
      const arrowEl = container.querySelector<HTMLElement>('.sc-arrow');
      const pathEl = container.querySelector<SVGPathElement>('svg path');
      if (pathEl) {
        pathEl.style.setProperty(
          'fill',
          'var(--sc-tooltip-bg, #1a1208)',
          'important',
        );
      }
      if (arrowEl) {
        arrowEl.style.setProperty('z-index', '2147483650', 'important');
        arrowEl.style.setProperty('display', 'block', 'important');
        arrowEl.style.setProperty('visibility', 'visible', 'important');
      }
    } catch (e) {
      // defensive: ignore if DOM isn't ready
    }

    const pWrap = container as HTMLElement;
    // prepare for measurement
    pWrap.classList.add('open');
    pWrap.style.visibility = 'hidden';
    pWrap.style.opacity = '0';
    // force reflow
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    pWrap.offsetHeight;

    // compute placement (supports optional `placement` attribute on the host)
    const trigRect = trigger.getBoundingClientRect();
    const wrapRect = pWrap.getBoundingClientRect();
    const centerX = trigRect.left + trigRect.width / 2;
    const gap = 10;
    const pad = 8; // keep tooltip slightly inset from edges

    const dir = this._placement; // accepts north|south|east|west or top|bottom|left|right
    const mapDir: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
      north: 'top',
      top: 'top',
      south: 'bottom',
      bottom: 'bottom',
      east: 'right',
      right: 'right',
      west: 'left',
      left: 'left',
    };

    let placement: 'top' | 'bottom' | 'left' | 'right';
    if (dir) {
      const mapped = mapDir[dir as keyof typeof mapDir];
      if (mapped) placement = mapped;
      else placement = trigRect.top >= wrapRect.height + gap ? 'top' : 'bottom';
    } else {
      // auto choose top or bottom as before
      placement = trigRect.top >= wrapRect.height + gap ? 'top' : 'bottom';
    }

    // Position the tooltip differently depending on placement
    let clampedCenter = Math.round(centerX);
    if (placement === 'top' || placement === 'bottom') {
      // center horizontally over trigger using translateX(-50%)
      pWrap.style.setProperty('transform', 'translateX(-50%)', 'important');
      const desiredLeft = Math.round(centerX);
      clampedCenter = Math.min(
        Math.max(desiredLeft, pad + Math.round(wrapRect.width / 2)),
        window.innerWidth - pad - Math.round(wrapRect.width / 2),
      );
      pWrap.style.left = `${clampedCenter}px`;

      let topPos =
        placement === 'top'
          ? Math.round(trigRect.top - wrapRect.height - gap)
          : Math.round(trigRect.bottom + gap);

      // Clamp top so the tooltip doesn't overflow viewport vertically
      const minTop = pad;
      const maxTop = window.innerHeight - pad - Math.round(wrapRect.height);
      topPos = Math.min(Math.max(topPos, minTop), Math.max(minTop, maxTop));
      pWrap.style.top = `${topPos}px`;
      pWrap.setAttribute('data-placement', placement);
    } else {
      // left or right placement: place tooltip to the side and vertically center
      // Ensure any translateX from stylesheet is removed so left/top are absolute
      pWrap.style.setProperty('transform', 'none', 'important');
      let leftPos =
        placement === 'left'
          ? Math.round(trigRect.left - wrapRect.width - gap)
          : Math.round(trigRect.right + gap);
      // Clamp left so tooltip stays in viewport
      leftPos = Math.min(
        Math.max(leftPos, pad),
        window.innerWidth - pad - Math.round(wrapRect.width),
      );
      pWrap.style.left = `${leftPos}px`;

      // Vertically center relative to trigger
      let topPos = Math.round(
        trigRect.top + (trigRect.height - wrapRect.height) / 2,
      );
      const minTop = pad;
      const maxTop = window.innerHeight - pad - Math.round(wrapRect.height);
      topPos = Math.min(Math.max(topPos, minTop), Math.max(minTop, maxTop));
      pWrap.style.top = `${topPos}px`;
      pWrap.setAttribute('data-placement', placement);
    }

    // Re-measure after positioning (width/height may change due to wrapping/clamping)
    const finalWrapRect = pWrap.getBoundingClientRect();
    // Choose the correct arrow variant for the computed placement so we avoid
    // rotating a small SVG (which caused clipping). Top/bottom use the wide
    // 18x8 SVG; left/right use the tall 8x18 SVG.
    let arrow: HTMLElement | null = null;
    const topArrow = pWrap.querySelector<HTMLElement>('.sc-arrow-top');
    const sideArrow = pWrap.querySelector<HTMLElement>('.sc-arrow-side');
    if (placement === 'top' || placement === 'bottom') {
      if (topArrow) {
        topArrow.style.setProperty('display', 'block', 'important');
        topArrow.style.setProperty('visibility', 'visible', 'important');
      }
      if (sideArrow)
        sideArrow.style.setProperty('display', 'none', 'important');
      arrow = topArrow;
    } else {
      if (sideArrow) {
        sideArrow.style.setProperty('display', 'block', 'important');
        sideArrow.style.setProperty('visibility', 'visible', 'important');
      }
      if (topArrow) topArrow.style.setProperty('display', 'none', 'important');
      arrow = sideArrow;
    }
    if (arrow) {
      if (placement === 'top' || placement === 'bottom') {
        const leftEdgeOfWrap =
          clampedCenter - Math.round(finalWrapRect.width / 2);
        let arrowLeft = centerX - leftEdgeOfWrap;
        // Clamp arrow inside the tooltip with 12px margin
        const minArrow = 12;
        const maxArrow = Math.max(12, Math.round(finalWrapRect.width - 12));
        arrowLeft = Math.min(
          Math.max(Math.round(arrowLeft), minArrow),
          maxArrow,
        );
        // Use setProperty with important so portal stylesheet rules don't override
        arrow.style.setProperty('left', `${arrowLeft}px`, 'important');
        arrow.style.setProperty('transform', 'translateX(-50%)', 'important');
        // clear any side positioning
        arrow.style.removeProperty('top');
        arrow.style.removeProperty('right');
      } else {
        // left/right: position arrow vertically centered on trigger
        const topEdgeOfWrap = finalWrapRect.top;
        const trigCenterY = trigRect.top + trigRect.height / 2;
        // ensure arrow is visible so we can measure its height
        arrow.style.setProperty('display', 'block', 'important');
        const arrowRect = arrow.getBoundingClientRect();
        const arrowHeight = Math.round(arrowRect.height) || 18;
        // desiredTipY is the y-coordinate (relative to wrap top) where the arrow tip should sit
        const desiredTipY = Math.round(trigCenterY - topEdgeOfWrap);
        // compute top of arrow box so its internal tip aligns with trigger center
        let arrowTop = Math.round(desiredTipY - arrowHeight / 2);
        const minArrow = 8;
        const maxArrow = Math.max(
          8,
          Math.round(finalWrapRect.height - 8 - arrowHeight),
        );
        const clampedArrowTop = Math.min(
          Math.max(arrowTop, minArrow),
          maxArrow,
        );
        arrow.style.setProperty('top', `${clampedArrowTop}px`, 'important');
        // remove any previous horizontal positioning and transforms
        arrow.style.removeProperty('left');
        arrow.style.removeProperty('right');
        arrow.style.removeProperty('transform');
        // set explicit side offset and svg rotation so the arrow sits flush
        if (placement === 'left') {
          // place arrow slightly outside the tooltip and ensure no stray transforms
          arrow.style.setProperty('right', '-6px', 'important');
          arrow.style.setProperty('left', 'auto', 'important');
          arrow.style.setProperty('transform', 'none', 'important');
          arrow.style.setProperty('display', 'block', 'important');
          arrow.style.setProperty('visibility', 'visible', 'important');
          arrow.style.setProperty('z-index', '2147483649', 'important');
          const svg = arrow.querySelector<SVGSVGElement>('svg');
          if (svg) {
            // for left placement, flip the side SVG to point right (mirror)
            svg.style.setProperty('transform', 'rotate(180deg)', 'important');
            svg.style.setProperty('transform-origin', '50% 50%', 'important');
            svg.style.setProperty('overflow', 'visible', 'important');
            svg.style.setProperty('width', '8px', 'important');
            svg.style.setProperty('height', '18px', 'important');
            arrow.style.setProperty('overflow', 'visible', 'important');
            arrow.style.setProperty('width', '8px', 'important');
            arrow.style.setProperty('height', '18px', 'important');
          }

          // Only show fallback triangle when the SVG is not visible
          try {
            const svgStyles = svg ? getComputedStyle(svg) : null;
            const svgRect = svg ? svg.getBoundingClientRect() : null;
            const svgVisible =
              !!svg &&
              svgStyles &&
              svgStyles.display !== 'none' &&
              svgStyles.visibility !== 'hidden' &&
              svgStyles.opacity !== '0' &&
              (svgRect?.width ?? 0) > 0;
            const existingFb =
              pWrap.querySelector<HTMLElement>('.sc-arrow-fallback');
            if (svgVisible) {
              if (existingFb) existingFb.remove();
            } else {
              let fb = existingFb as HTMLElement | null;
              if (!fb) {
                fb = document.createElement('div');
                fb.className = 'sc-arrow-fallback';
                fb.setAttribute('aria-hidden', 'true');
                fb.style.position = 'absolute';
                fb.style.pointerEvents = 'none';
                fb.style.zIndex = '2147483650';
                pWrap.appendChild(fb);
              }
              fb.style.right = '-8px';
              fb.style.left = 'auto';
              // position fallback so its tip (6px from top) aligns with desired tip
              fb.style.top = `${Math.round(desiredTipY - 6)}px`;
              fb.style.width = '0';
              fb.style.height = '0';
              fb.style.borderTop = '6px solid transparent';
              fb.style.borderBottom = '6px solid transparent';
              fb.style.borderLeft = '8px solid var(--sc-tooltip-bg, #1a1208)';
            }
          } catch (e) {}
        } else {
          // place arrow slightly outside the tooltip and ensure no stray transforms
          arrow.style.setProperty('left', '-6px', 'important');
          arrow.style.setProperty('right', 'auto', 'important');
          arrow.style.setProperty('transform', 'none', 'important');
          arrow.style.setProperty('display', 'block', 'important');
          arrow.style.setProperty('visibility', 'visible', 'important');
          arrow.style.setProperty('z-index', '2147483649', 'important');
          const svg = arrow.querySelector<SVGSVGElement>('svg');
          if (svg) {
            // side SVG is a right-pointing triangle by default; do not rotate for right placement
            svg.style.setProperty('transform', 'none', 'important');
            svg.style.setProperty('transform-origin', '50% 50%', 'important');
            svg.style.setProperty('overflow', 'visible', 'important');
            svg.style.setProperty('width', '8px', 'important');
            svg.style.setProperty('height', '18px', 'important');
            arrow.style.setProperty('overflow', 'visible', 'important');
            arrow.style.setProperty('width', '8px', 'important');
            arrow.style.setProperty('height', '18px', 'important');
          }

          // Only show fallback triangle when the SVG is not visible
          try {
            const svgStyles = svg ? getComputedStyle(svg) : null;
            const svgRect = svg ? svg.getBoundingClientRect() : null;
            const svgVisible =
              !!svg &&
              svgStyles &&
              svgStyles.display !== 'none' &&
              svgStyles.visibility !== 'hidden' &&
              svgStyles.opacity !== '0' &&
              (svgRect?.width ?? 0) > 0;
            const existingFb =
              pWrap.querySelector<HTMLElement>('.sc-arrow-fallback');
            if (svgVisible) {
              if (existingFb) existingFb.remove();
            } else {
              let fb = existingFb as HTMLElement | null;
              if (!fb) {
                fb = document.createElement('div');
                fb.className = 'sc-arrow-fallback';
                fb.setAttribute('aria-hidden', 'true');
                fb.style.position = 'absolute';
                fb.style.pointerEvents = 'none';
                fb.style.zIndex = '2147483650';
                pWrap.appendChild(fb);
              }
              fb.style.left = '-8px';
              fb.style.right = 'auto';
              // position fallback so its tip (6px from top) aligns with desired tip
              fb.style.top = `${Math.round(desiredTipY - 6)}px`;
              fb.style.width = '0';
              fb.style.height = '0';
              fb.style.borderTop = '6px solid transparent';
              fb.style.borderBottom = '6px solid transparent';
              fb.style.borderRight = '8px solid var(--sc-tooltip-bg, #1a1208)';
            }
          } catch (e) {}
        }
      }
    }

    // ensure arrow isn't clipped and portal can overflow (allow arrow to sit outside)
    pWrap.style.setProperty('overflow', 'visible', 'important');
    // reveal portal
    pWrap.style.visibility = '';
    pWrap.style.opacity = '';

    // Ensure arrow is above shadow and visible (in case of overlays)
    if (arrow) {
      arrow.style.setProperty('z-index', '2147483649', 'important');
    }

    // attach portal hover listeners so it stays open when moving between
    // trigger and the portal
    const onEnter = () => {
      if (this._hoverTimer) clearTimeout(this._hoverTimer);
    };
    const onLeave = () => {
      this._hoverTimer = setTimeout(() => this._closeTooltip(), 150);
    };
    pWrap.addEventListener('mouseenter', onEnter);
    pWrap.addEventListener('mouseleave', onLeave);
    __sc_portal_listeners = { enter: onEnter, leave: onLeave };

    // Create an invisible bridge between trigger and portal to avoid
    // a small gap causing immediate mouseleave -> flicker. The bridge
    // is removed when the tooltip closes.
    const existingBridge = document.getElementById('scripture-cite-bridge');
    if (existingBridge) existingBridge.remove();
    const bridge = document.createElement('div');
    bridge.id = 'scripture-cite-bridge';
    bridge.className = 'sc-bridge';
    document.body.appendChild(bridge);

    const placeBridge = () => {
      const trig = trigger.getBoundingClientRect();
      const wrapFinal = pWrap.getBoundingClientRect();
      // compute bounding box covering trigger and tooltip, add small padding
      const bLeft = Math.min(trig.left, wrapFinal.left);
      const bTop = Math.min(trig.top, wrapFinal.top);
      const bRight = Math.max(trig.right, wrapFinal.right);
      const bBottom = Math.max(trig.bottom, wrapFinal.bottom);
      const padBridge = 8;
      bridge.style.left = `${Math.floor(bLeft - padBridge)}px`;
      bridge.style.top = `${Math.floor(bTop - padBridge)}px`;
      bridge.style.width = `${Math.ceil(bRight - bLeft + padBridge * 2)}px`;
      bridge.style.height = `${Math.ceil(bBottom - bTop + padBridge * 2)}px`;
      bridge.style.opacity = '0.01';
    };
    placeBridge();
    // keep bridge position updated on resize/scroll
    const onBridgeReposition = () => placeBridge();
    window.addEventListener('resize', onBridgeReposition);
    window.addEventListener('scroll', onBridgeReposition, true);

    const bridgeEnter = () => {
      if (this._hoverTimer) clearTimeout(this._hoverTimer);
    };
    const bridgeLeave = () => {
      this._hoverTimer = setTimeout(() => this._closeTooltip(), 150);
    };
    bridge.addEventListener('mouseenter', bridgeEnter);
    bridge.addEventListener('mouseleave', bridgeLeave);

    // store bridge cleanup on the element so _closeTooltip can find it
    (pWrap as any)._bridgeCleanup = () => {
      bridge.removeEventListener('mouseenter', bridgeEnter);
      bridge.removeEventListener('mouseleave', bridgeLeave);
      window.removeEventListener('resize', onBridgeReposition);
      window.removeEventListener('scroll', onBridgeReposition, true);
      bridge.remove();
      // remove any fallback arrow we added
      try {
        const fb = pWrap.querySelector('.sc-arrow-fallback');
        if (fb) fb.remove();
      } catch (e) {}
    };

    ScriptureCiteElement._currentOpen = this;
  }

  private _closeTooltip(): void {
    const trigger = this._shadow.querySelector<HTMLElement>('.sc-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    this.removeAttribute('data-open');
    this._isOpen = false;

    if (__sc_portal_el) {
      const pWrap =
        __sc_portal_el.querySelector<HTMLElement>('.sc-tooltip-wrap');
      if (pWrap && __sc_portal_listeners) {
        pWrap.removeEventListener('mouseenter', __sc_portal_listeners.enter);
        pWrap.removeEventListener('mouseleave', __sc_portal_listeners.leave);
      }
      // run any bridge cleanup
      try {
        const pWrapLocal = __sc_portal_el.querySelector<HTMLElement>(
          '.sc-tooltip-wrap',
        ) as any;
        if (pWrapLocal && pWrapLocal._bridgeCleanup)
          pWrapLocal._bridgeCleanup();
      } catch (e) {
        // ignore
      }
      __sc_portal_el.innerHTML = '';
      __sc_portal_listeners = null;
    }
    if (ScriptureCiteElement._currentOpen === this)
      ScriptureCiteElement._currentOpen = null;
  }

  /** Flip tooltip to bottom if it would go off-screen top */
  private _smartPosition(wrap: HTMLElement): void {
    const trigger = this._shadow.querySelector<HTMLElement>('.sc-trigger');
    if (!trigger) return;

    const trigRect = trigger.getBoundingClientRect();
    const gap = 10;

    // Force layout so size is known after opening
    // (reading offsetHeight forces reflow)
    // Ensure the tooltip is visible so measurements are accurate
    wrap.style.visibility = 'hidden';
    wrap.style.opacity = '0';
    wrap.classList.add('open');
    // force reflow
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    wrap.offsetHeight;

    const wrapRect = wrap.getBoundingClientRect();
    const centerX = trigRect.left + trigRect.width / 2;

    // Prefer placing above; if not enough space, place below
    const enoughAbove = trigRect.top >= wrapRect.height + gap;

    wrap.style.left = `${Math.round(centerX)}px`;
    wrap.style.transform = 'translateX(-50%) translateY(0)';
    if (enoughAbove) {
      wrap.style.top = `${Math.round(trigRect.top - wrapRect.height - gap)}px`;
      wrap.setAttribute('data-placement', 'top');
    } else {
      wrap.style.top = `${Math.round(trigRect.bottom + gap)}px`;
      wrap.setAttribute('data-placement', 'bottom');
    }
    wrap.style.visibility = '';
    wrap.style.opacity = '';
  }

  private _hoverTimer: ReturnType<typeof setTimeout> | null = null;

  private _onMouseEnter = (): void => {
    if (this._hoverTimer) clearTimeout(this._hoverTimer);
    this._openTooltip();
  };

  private _onMouseLeave = (): void => {
    this._hoverTimer = setTimeout(() => this._closeTooltip(), 150);
  };

  private _onKeyDown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      ke.preventDefault();
      this._isOpen ? this._closeTooltip() : this._openTooltip();
    }
    if (ke.key === 'Escape') this._closeTooltip();
  };

  private _onClickOutside = (e: Event): void => {
    if (!this._isInteractiveClick(e)) this._closeTooltip();
  };

  private _isInteractiveClick(e: Event): boolean {
    const portalWrap =
      __sc_portal_el?.querySelector<HTMLElement>('.sc-tooltip-wrap');
    const bridge = document.getElementById('scripture-cite-bridge');
    const trigger = this._shadow.querySelector<HTMLElement>('.sc-trigger');
    const shadowWrap =
      this._shadow.querySelector<HTMLElement>('.sc-tooltip-wrap');
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];

    for (const item of path) {
      if (!(item instanceof Node)) continue;
      if (item === this) return true;
      if (trigger && trigger.contains(item)) return true;
      if (shadowWrap && shadowWrap.contains(item)) return true;
      if (portalWrap && portalWrap.contains(item)) return true;
      if (bridge && bridge.contains(item)) return true;
    }

    const target = e.target;
    if (target instanceof Node) {
      if (this.contains(target)) return true;
      if (portalWrap?.contains(target)) return true;
      if (bridge?.contains(target)) return true;
    }

    return false;
  }

  private _attachTooltipListeners(): void {
    const trigger = this._shadow.querySelector<HTMLElement>('.sc-trigger');
    if (!trigger) return;

    trigger.addEventListener('mouseenter', this._onMouseEnter);
    trigger.addEventListener('mouseleave', this._onMouseLeave);
    trigger.addEventListener('keydown', this._onKeyDown);
    trigger.addEventListener('focus', this._onMouseEnter);
    trigger.addEventListener('blur', this._onMouseLeave);
    document.addEventListener('click', this._onClickOutside, { capture: true });
  }

  private _removeTooltipListeners(): void {
    document.removeEventListener('click', this._onClickOutside, {
      capture: true,
    });
  }

  // ── Zen Mode ───────────────────────────────────────────────

  private _setZenHint(text: string): void {
    const hint =
      __sc_portal_el?.querySelector<HTMLElement>('.sc-zen-hint') ??
      this._shadow.querySelector<HTMLElement>('.sc-zen-hint');
    if (hint) hint.textContent = text;
  }

  private async _primeZen(): Promise<void> {
    if (!this._zenEnabled) return;
    if (this._zenPrimePromise) return this._zenPrimePromise;

    this._zenPrimePromise = (async () => {
      this._setZenHint('Preparing Zen model…');
      const { initZenEngine } = await import('./zen/zen-mode.js');
      await initZenEngine((status) => {
        const labels: Record<string, string> = {
          'loading-model': 'Downloading model…',
          generating: 'Generating explanation…',
          ready: 'Zen model ready',
          error: 'Zen model unavailable',
        };
        this._setZenHint(labels[status] ?? 'Preparing Zen model…');
      });
      this._setZenHint('Zen model ready');
    })().catch((err) => {
      this._zenPrimePromise = null;
      this._setZenHint(
        `Zen unavailable: ${String(err instanceof Error ? err.message : err)}`,
      );
      return undefined;
    });

    return this._zenPrimePromise;
  }

  private async _triggerZen(): Promise<void> {
    if (!this._verse) return;

    const container =
      __sc_portal_el?.querySelector<HTMLElement>('.sc-zen-btn')
        ?.parentElement ??
      this._shadow.querySelector<HTMLElement>('.sc-zen-btn')?.parentElement;
    if (!container) return;

    if (this._zenExplanation) {
      container.innerHTML = this._renderZenExplanation(this._zenExplanation);
      return;
    }

    void this._primeZen();
    container.innerHTML = /* html */ `<p class="sc-zen-progress">Loading model…</p>`;

    try {
      // Dynamic import to keep zen optional
      const { explainVerse } = await import('./zen/zen-mode.js');
      const result = await explainVerse(this._verse, (status) => {
        const el = container.querySelector<HTMLElement>('.sc-zen-progress');
        if (el) {
          const labels: Record<string, string> = {
            'loading-model': 'Downloading model (first time only)…',
            generating: 'Generating explanation…',
            ready: 'Done',
            error: 'Error loading model',
          };
          el.textContent = labels[status] ?? status;
        }
      });

      this._zenExplanation = result.explanation;
      container.innerHTML = this._renderZenExplanation(result.explanation);

      this.dispatchEvent(
        new CustomEvent('scripture-zen', {
          detail: { verse: this._verse, explanation: result.explanation },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      container.innerHTML = /* html */ `
        <p class="sc-zen-progress" style="color:#e74c3c">
          Zen unavailable: ${escapeHtml(String(err instanceof Error ? err.message : err))}
        </p>`;
    }
  }

  private async _toggleInlineZen(): Promise<void> {
    if (!this._verse) return;
    const btn =
      this._shadow.querySelector<HTMLButtonElement>('.sc-inline-zen-btn');
    const body = this._shadow.querySelector<HTMLElement>('.sc-inline-zen-body');
    if (!btn || !body) return;

    const open = !body.hasAttribute('hidden');
    if (open) {
      body.setAttribute('hidden', '');
      btn.textContent = '✦ Zen Explain';
      btn.setAttribute('aria-expanded', 'false');
      return;
    }

    btn.setAttribute('aria-expanded', 'true');
    body.removeAttribute('hidden');

    if (this._zenExplanation) {
      body.innerHTML = this._renderZenExplanation(this._zenExplanation);
      btn.textContent = '✦ Hide Zen';
      return;
    }

    void this._primeZen();
    btn.disabled = true;
    btn.textContent = '✦ Loading…';
    body.innerHTML = /* html */ `<p class="sc-zen-progress">Loading model…</p>`;

    try {
      const { explainVerse } = await import('./zen/zen-mode.js');
      const result = await explainVerse(this._verse, (status) => {
        const el = body.querySelector<HTMLElement>('.sc-zen-progress');
        if (el) {
          const labels: Record<string, string> = {
            'loading-model': 'Downloading model (first time only)…',
            generating: 'Generating explanation…',
            ready: 'Done',
            error: 'Error loading model',
          };
          el.textContent = labels[status] ?? status;
        }
      });

      this._zenExplanation = result.explanation;
      body.innerHTML = this._renderZenExplanation(result.explanation);
      btn.textContent = '✦ Hide Zen';

      this.dispatchEvent(
        new CustomEvent('scripture-zen', {
          detail: { verse: this._verse, explanation: result.explanation },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      body.innerHTML = /* html */ `
        <p class="sc-zen-progress" style="color:#e74c3c">
          Zen unavailable: ${escapeHtml(String(err instanceof Error ? err.message : err))}
        </p>`;
      btn.textContent = '✦ Zen Explain';
    } finally {
      btn.disabled = false;
    }
  }

  private _renderZenExplanation(text: string): string {
    return /* html */ `<div class="sc-zen-explanation">${renderZenRichText(text)}</div>`;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function renderZenRichText(str: string): string {
  // Keep model output safe by escaping first, then opt-in to a tiny markdown subset.
  let out = escapeHtml(str);

  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ with simple boundary guards.
  out = out.replace(
    /(^|[\s([{>])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=($|[\s)\]}<.,!?;:]))/g,
    '$1<em>$2</em>',
  );
  out = out.replace(
    /(^|[\s([{>])_(?!\s)([^_\n]+?)(?<!\s)_(?=($|[\s)\]}<.,!?;:]))/g,
    '$1<em>$2</em>',
  );

  // Preserve line breaks for multi-line explanations.
  out = out.replace(/\r\n|\r|\n/g, '<br />');
  return out;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Register custom element ──────────────────────────────────

const ELEMENT_TAG = 'scripture-cite';

export function defineScriptureCite(tagName = ELEMENT_TAG): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ScriptureCiteElement);
  }
}
