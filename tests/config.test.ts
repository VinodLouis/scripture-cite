// ============================================================
// Tests: Config
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptureConfigSingleton } from '../src/config.js';

describe('ScriptureConfigSingleton', () => {
  beforeEach(() => {
    // Reset to defaults by calling configure with empty object
    ScriptureConfigSingleton.configure({});
  });

  it('has sensible default theme', () => {
    const t = ScriptureConfigSingleton.theme;
    expect(t.accentColor).toBe('#8b6914');
    expect(t.verseFont).toContain('Georgia');
    expect(t.borderRadius).toBe('8px');
    expect(t.tooltipMaxWidth).toBe('420px');
  });

  it('merges theme overrides with defaults', () => {
    ScriptureConfigSingleton.configure({ theme: { accentColor: '#ff0000' } });
    expect(ScriptureConfigSingleton.theme.accentColor).toBe('#ff0000');
    expect(ScriptureConfigSingleton.theme.borderRadius).toBe('8px'); // default preserved
  });

  it('has sensible default zen config', () => {
    const z = ScriptureConfigSingleton.zen;
    expect(z.enabled).toBe(false);
    expect(z.model).toContain('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    expect(typeof z.systemPrompt).toBe('string');
  });

  it('merges zen overrides with defaults', () => {
    ScriptureConfigSingleton.configure({
      zen: { enabled: true, model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' },
    });
    expect(ScriptureConfigSingleton.zen.enabled).toBe(true);
    expect(ScriptureConfigSingleton.zen.model).toBe(
      'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    );
  });

  it('defaults mode to tooltip', () => {
    expect(ScriptureConfigSingleton.defaultMode).toBe('tooltip');
  });

  it('respects configured default mode', () => {
    ScriptureConfigSingleton.configure({ defaultMode: 'inline' });
    expect(ScriptureConfigSingleton.defaultMode).toBe('inline');
  });

  it('stores dataUrl', () => {
    ScriptureConfigSingleton.configure({ dataUrl: '/verses' });
    expect(ScriptureConfigSingleton.dataUrl).toBe('/verses');
  });

  it('stores onError callback', () => {
    const cb = () => {};
    ScriptureConfigSingleton.configure({ onError: cb });
    expect(ScriptureConfigSingleton.onError).toBe(cb);
  });
});
