// ============================================================
// Tests: Enums
// ============================================================
import { describe, it, expect } from "vitest";
import {
  ScriptureSource,
  DisplayMode,
  BibleBook,
  QuranSurah,
  GitaChapter,
} from "../src/enums.js";

describe("ScriptureSource", () => {
  it("has correct values", () => {
    expect(ScriptureSource.BIBLE).toBe("bible");
    expect(ScriptureSource.QURAN).toBe("quran");
    expect(ScriptureSource.GITA).toBe("gita");
  });

  it("has exactly 3 sources", () => {
    expect(Object.keys(ScriptureSource).length).toBe(3);
  });
});

describe("DisplayMode", () => {
  it("has inline and tooltip", () => {
    expect(DisplayMode.INLINE).toBe("inline");
    expect(DisplayMode.TOOLTIP).toBe("tooltip");
  });
});

describe("BibleBook", () => {
  it("has 66 books", () => {
    expect(Object.keys(BibleBook).length).toBe(66);
  });

  it("has correct values for key books", () => {
    expect(BibleBook.GENESIS).toBe("genesis");
    expect(BibleBook.REVELATION).toBe("revelation");
    expect(BibleBook.JOHN).toBe("john");
    expect(BibleBook.PSALMS).toBe("psalms");
    expect(BibleBook.FIRST_SAMUEL).toBe("1-samuel");
    expect(BibleBook.FIRST_CORINTHIANS).toBe("1-corinthians");
  });

  it("has all NT books", () => {
    const nt = [
      BibleBook.MATTHEW, BibleBook.MARK, BibleBook.LUKE, BibleBook.JOHN,
      BibleBook.ACTS, BibleBook.ROMANS, BibleBook.REVELATION,
    ];
    nt.forEach(b => expect(typeof b).toBe("string"));
  });
});

describe("QuranSurah", () => {
  it("has 114 surahs", () => {
    expect(Object.keys(QuranSurah).length).toBe(114);
  });

  it("maps to surah numbers as strings", () => {
    expect(QuranSurah.AL_FATIHA).toBe("1");
    expect(QuranSurah.AN_NAS).toBe("114");
    expect(QuranSurah.AL_IKHLAS).toBe("112");
    expect(QuranSurah.YA_SIN).toBe("36");
  });
});

describe("GitaChapter", () => {
  it("has 18 chapters", () => {
    expect(Object.keys(GitaChapter).length).toBe(18);
  });

  it("has correct chapter values", () => {
    expect(GitaChapter.CH_1).toBe("1");
    expect(GitaChapter.CH_18).toBe("18");
    expect(GitaChapter.CH_2).toBe("2");
  });
});
