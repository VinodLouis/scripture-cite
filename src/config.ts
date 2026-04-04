// ============================================================
// scripture-cite — Global Configuration Singleton
// ============================================================

import type { ScriptureConfig, ScriptureTheme, ZenConfig } from './types.js';

const DEFAULT_THEME: Required<ScriptureTheme> = {
  accentColor: '#8b6914',
  verseFont: "Georgia, 'Times New Roman', serif",
  refFont: 'system-ui, sans-serif',
  borderRadius: '8px',
  tooltipBg: '#1a1208',
  tooltipColor: '#f5e6c8',
  inlineColor: '#3d2b00',
  inlineBg: '#fdf6e3',
  tooltipShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
  tooltipMaxWidth: '420px',
  animDuration: '200ms',
};

const DEFAULT_ZEN: Required<ZenConfig> = {
  enabled: false,
  model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  systemPrompt:
    'You are a careful, context-aware scripture explainer. For any provided verse you must: ' +
    '1) Give one short contextual note (1 sentence) explaining where this verse sits in the immediate chapter or section. ' +
    '2) Provide a concise interpretation of the verse (2-3 sentences) focused on meaning, not praise or repeated epithets. ' +
    '3) Give one concrete, modern-day practical implication (1 sentence) that follows directly from the interpretation. ' +
    '4) Provide at most one short cross-reference (book chapter:verse) and explain in one sentence why it connects. ' +
    '5) If there is genuine textual uncertainty or multiple plausible readings, state it briefly. ' +
    'Use neutral, explanatory language (avoid devotional language or long lists of titles). Keep the full output to no more than 6 short sentences. ' +
    'Do not simply paraphrase the verse; focus on interpretation, context, cross-reference, and relevance.',
  webLLMCdn: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest',
  onProgress: () => {},
};

class ScriptureConfigManager {
  private _config: ScriptureConfig = {
    defaultMode: 'tooltip',
    theme: { ...DEFAULT_THEME },
    zen: { ...DEFAULT_ZEN },
  };

  /** Merge user config with defaults */
  configure(config: ScriptureConfig): void {
    this._config = {
      ...this._config,
      ...config,
      theme: { ...DEFAULT_THEME, ...this._config.theme, ...config.theme },
      zen: { ...DEFAULT_ZEN, ...this._config.zen, ...config.zen },
    };
    this._applyThemeToDocument();

    // If the consumer opted into loading bundled sample JSONs, do so now.
    // Use a dynamic import to avoid a circular static import between
    // `config` and `registry` modules.
    if (config.loadDefaults) {
      const toLoad = Array.isArray(config.loadDefaults)
        ? config.loadDefaults
        : undefined;
      (async () => {
        try {
          const mod = await import('./registry.js');
          await mod.ScriptureRegistry.registerDefaults(toLoad);
        } catch (err) {
          // If user provided onError handler, call it; otherwise swallow
          // the error to avoid breaking app startup.
          try {
            this._config.onError?.(new Error(String(err)) as unknown as any);
          } catch {}
        }
      })();
    }
  }

  get theme(): Required<ScriptureTheme> {
    return {
      ...DEFAULT_THEME,
      ...this._config.theme,
    } as Required<ScriptureTheme>;
  }

  get zen(): Required<ZenConfig> {
    return { ...DEFAULT_ZEN, ...this._config.zen } as Required<ZenConfig>;
  }

  get defaultMode(): 'inline' | 'tooltip' {
    return this._config.defaultMode ?? 'tooltip';
  }

  get dataUrl(): string | undefined {
    return this._config.dataUrl;
  }

  get loadDefaults(): ScriptureConfig['loadDefaults'] {
    return this._config.loadDefaults;
  }

  get onError(): ScriptureConfig['onError'] {
    return this._config.onError;
  }

  get locale(): string {
    return this._config.locale ?? navigator?.language ?? 'en';
  }

  /** Inject CSS custom properties onto :root for global theming */
  private _applyThemeToDocument(): void {
    if (typeof document === 'undefined') return;
    const t = this.theme;
    const root = document.documentElement;
    const vars: Record<string, string> = {
      '--sc-accent': t.accentColor,
      '--sc-verse-font': t.verseFont,
      '--sc-ref-font': t.refFont,
      '--sc-radius': t.borderRadius,
      '--sc-tooltip-bg': t.tooltipBg,
      '--sc-tooltip-color': t.tooltipColor,
      '--sc-inline-color': t.inlineColor,
      '--sc-inline-bg': t.inlineBg,
      '--sc-shadow': t.tooltipShadow,
      '--sc-tooltip-max-width': t.tooltipMaxWidth,
      '--sc-anim': t.animDuration,
    };
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
  }
}

// Singleton export
export const ScriptureConfigSingleton = new ScriptureConfigManager();
