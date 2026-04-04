// ============================================================
// Tests: Integration — Full Pipeline
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScriptureRegistry } from '../src/registry.js';
import { ScriptureConfigure } from '../src/index.js';
import { ScriptureConfigSingleton } from '../src/config.js';
import {
  BibleBook,
  QuranSurah,
  GitaChapter,
  ScriptureSource,
} from '../src/enums.js';
import { ScriptureError } from '../src/types.js';
import type { ScriptureData } from '../src/types.js';

const FULL_BIBLE: ScriptureData = {
  meta: { source: 'bible', version: 'KJV', lang: 'en' },
  verses: {
    [BibleBook.GENESIS]: { '1': { '1': 'In the beginning...' } },
    [BibleBook.PSALMS]: { '23': { '1': 'The LORD is my shepherd...' } },
    [BibleBook.JOHN]: { '3': { '16': 'For God so loved the world...' } },
  },
};

const FULL_QURAN: ScriptureData = {
  meta: { source: 'quran', version: 'Sahih International', lang: 'en' },
  verses: {
    [QuranSurah.AL_FATIHA]: { '1': 'In the name of Allah...' },
    [QuranSurah.AR_RAHMAN]: {
      '13': 'So which of the favors of your Lord would you deny?',
    },
  },
};

const FULL_GITA: ScriptureData = {
  meta: { source: 'gita', version: 'BGAS', lang: 'en' },
  verses: {
    [GitaChapter.CH_2]: { '47': 'You have a right to your duties...' },
    [GitaChapter.CH_18]: { '66': 'Abandon all varieties of religion...' },
  },
};

describe('Integration: Enum → Registry → Resolve', () => {
  beforeEach(() => {
    ScriptureRegistry.clear();
    ScriptureRegistry.register(ScriptureSource.BIBLE, FULL_BIBLE);
    ScriptureRegistry.register(ScriptureSource.QURAN, FULL_QURAN);
    ScriptureRegistry.register(ScriptureSource.GITA, FULL_GITA);
  });

  it('resolves all three sources using enum values as keys', async () => {
    const bible = await ScriptureRegistry.resolve(
      ScriptureSource.BIBLE,
      '1',
      '1',
      BibleBook.GENESIS,
    );
    expect(bible.text).toBe('In the beginning...');

    const quran = await ScriptureRegistry.resolve(
      ScriptureSource.QURAN,
      QuranSurah.AL_FATIHA,
      '1',
    );
    expect(quran.text).toContain('In the name of Allah');

    const gita = await ScriptureRegistry.resolve(
      ScriptureSource.GITA,
      GitaChapter.CH_2,
      '47',
    );
    expect(gita.text).toContain('right to your duties');
  });

  it('uses enum values directly as lookup keys (no extra normalization)', async () => {
    // Enum values ARE the keys — no transformation should be needed
    expect(BibleBook.GENESIS).toBe('genesis');
    expect(QuranSurah.AL_FATIHA).toBe('1');
    expect(GitaChapter.CH_18).toBe('18');
  });

  it('returns consistent meta across calls', async () => {
    const v1 = await ScriptureRegistry.resolve(
      ScriptureSource.BIBLE,
      '1',
      '1',
      BibleBook.GENESIS,
    );
    const v2 = await ScriptureRegistry.resolve(
      ScriptureSource.BIBLE,
      '23',
      '1',
      BibleBook.PSALMS,
    );
    expect(v1.meta.version).toBe(v2.meta.version);
  });

  it('throws typed ScriptureError on missing verse', async () => {
    try {
      await ScriptureRegistry.resolve(
        ScriptureSource.BIBLE,
        '999',
        '999',
        BibleBook.GENESIS,
      );
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScriptureError);
      expect((e as ScriptureError).code).toBe('VERSE_NOT_FOUND');
    }
  });
});

describe('Integration: ScriptureConfigure', () => {
  it('applies global config and preserves unset defaults', () => {
    ScriptureConfigure({
      defaultMode: 'inline',
      theme: { accentColor: '#purple' },
    });
    expect(ScriptureConfigSingleton.defaultMode).toBe('inline');
    expect(ScriptureConfigSingleton.theme.accentColor).toBe('#purple');
    expect(ScriptureConfigSingleton.theme.borderRadius).toBe('8px');
  });

  it('zen config merges correctly', () => {
    ScriptureConfigure({ zen: { enabled: true } });
    expect(ScriptureConfigSingleton.zen.enabled).toBe(true);
    expect(ScriptureConfigSingleton.zen.model).toContain(
      'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    );
  });
});
