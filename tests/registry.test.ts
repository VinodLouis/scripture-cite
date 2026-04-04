// ============================================================
// Tests: ScriptureRegistry
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScriptureRegistry } from "../src/registry.js";
import { ScriptureError } from "../src/types.js";
import type { ScriptureData } from "../src/types.js";

const BIBLE_DATA: ScriptureData = {
  meta: { source: "bible", version: "KJV", lang: "en" },
  verses: {
    genesis: {
      "1": { "1": "In the beginning God created the heaven and the earth." },
      "2": { "7": "And the LORD God formed man of the dust of the ground." },
    },
    john: {
      "3": { "16": "For God so loved the world..." },
    },
  },
};

const QURAN_DATA: ScriptureData = {
  meta: { source: "quran", version: "Sahih International", lang: "en" },
  verses: {
    "1": { "1": "In the name of Allah, the Entirely Merciful, the Especially Merciful." },
    "2": { "255": "Allah - there is no deity except Him..." },
  },
};

const GITA_DATA: ScriptureData = {
  meta: { source: "gita", version: "BGAS", lang: "en" },
  verses: {
    "2": { "47": "You have a right to perform your prescribed duty..." },
    "18": { "66": "Abandon all varieties of religion and just surrender unto Me." },
  },
};

describe("ScriptureRegistry", () => {
  beforeEach(() => {
    ScriptureRegistry.clear();
  });

  // ── Registration ────────────────────────────────────────────

  describe("register()", () => {
    it("registers bible data", () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      expect(ScriptureRegistry.isRegistered("bible")).toBe(true);
    });

    it("registers quran data", () => {
      ScriptureRegistry.register("quran", QURAN_DATA);
      expect(ScriptureRegistry.isRegistered("quran")).toBe(true);
    });

    it("overwrites previous registration", () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      const newData: ScriptureData = {
        ...BIBLE_DATA,
        meta: { ...BIBLE_DATA.meta, version: "NIV" },
      };
      ScriptureRegistry.register("bible", newData);
      expect(ScriptureRegistry.getMeta("bible")?.version).toBe("NIV");
    });
  });

  // ── O(1) Resolve ────────────────────────────────────────────

  describe("resolve()", () => {
    it("resolves bible verse (book + chapter + verse) in O(1)", async () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      const v = await ScriptureRegistry.resolve("bible", "1", "1", "genesis");
      expect(v.text).toBe("In the beginning God created the heaven and the earth.");
      expect(v.book).toBe("genesis");
      expect(v.chapter).toBe("1");
      expect(v.verse).toBe("1");
    });

    it("resolves quran verse (chapter + verse, no book)", async () => {
      ScriptureRegistry.register("quran", QURAN_DATA);
      const v = await ScriptureRegistry.resolve("quran", "1", "1");
      expect(v.text).toBe("In the name of Allah, the Entirely Merciful, the Especially Merciful.");
      expect(v.book).toBeUndefined();
    });

    it("resolves gita verse (chapter + verse, no book)", async () => {
      ScriptureRegistry.register("gita", GITA_DATA);
      const v = await ScriptureRegistry.resolve("gita", "2", "47");
      expect(v.text).toContain("right to perform your prescribed duty");
    });

    it("throws VERSE_NOT_FOUND for missing verse", async () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      await expect(
        ScriptureRegistry.resolve("bible", "99", "99", "genesis")
      ).rejects.toMatchObject({ code: "VERSE_NOT_FOUND" });
    });

    it("throws SOURCE_NOT_REGISTERED for unknown source", async () => {
      await expect(
        ScriptureRegistry.resolve("unknown-source", "1", "1")
      ).rejects.toMatchObject({ code: "SOURCE_NOT_REGISTERED" });
    });

    it("includes meta in resolved verse", async () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      const v = await ScriptureRegistry.resolve("bible", "3", "16", "john");
      expect(v.meta.version).toBe("KJV");
      expect(v.meta.source).toBe("bible");
    });
  });

  // ── Sync Resolve ────────────────────────────────────────────

  describe("resolveSync()", () => {
    it("returns verse if already loaded", () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      const v = ScriptureRegistry.resolveSync("bible", "1", "1", "genesis");
      expect(v?.text).toBeTruthy();
    });

    it("returns undefined for unregistered source", () => {
      const v = ScriptureRegistry.resolveSync("bible", "1", "1", "genesis");
      expect(v).toBeUndefined();
    });
  });

  // ── URL Registration ─────────────────────────────────────────

  describe("registerFromUrl()", () => {
    it("fetches and registers data from URL", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(BIBLE_DATA),
      } as Response);

      await ScriptureRegistry.registerFromUrl("bible", "https://example.com/bible.json");
      expect(ScriptureRegistry.isRegistered("bible")).toBe(true);
      vi.restoreAllMocks();
    });

    it("deduplicates concurrent URL fetches", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(BIBLE_DATA) } as Response);
      });

      await Promise.all([
        ScriptureRegistry.registerFromUrl("bible", "https://example.com/bible.json"),
        ScriptureRegistry.registerFromUrl("bible", "https://example.com/bible.json"),
        ScriptureRegistry.registerFromUrl("bible", "https://example.com/bible.json"),
      ]);
      expect(callCount).toBe(1);
      vi.restoreAllMocks();
    });

    it("throws DATA_FETCH_FAILED for non-ok response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
      await expect(
        ScriptureRegistry.registerFromUrl("bible", "https://example.com/missing.json")
      ).rejects.toMatchObject({ code: "DATA_FETCH_FAILED" });
      vi.restoreAllMocks();
    });
  });

  // ── Meta ────────────────────────────────────────────────────

  describe("getMeta()", () => {
    it("returns meta for registered source", () => {
      ScriptureRegistry.register("quran", QURAN_DATA);
      const meta = ScriptureRegistry.getMeta("quran");
      expect(meta?.version).toBe("Sahih International");
    });

    it("returns undefined for unregistered source", () => {
      expect(ScriptureRegistry.getMeta("nonexistent")).toBeUndefined();
    });
  });

  // ── Unregister ──────────────────────────────────────────────

  describe("unregister()", () => {
    it("removes a registered source", () => {
      ScriptureRegistry.register("bible", BIBLE_DATA);
      ScriptureRegistry.unregister("bible");
      expect(ScriptureRegistry.isRegistered("bible")).toBe(false);
    });
  });

  // ── Custom Source ────────────────────────────────────────────

  describe("custom sources", () => {
    it("supports custom scripture source registration", async () => {
      const custom: ScriptureData = {
        meta: { source: "torah", version: "JPS 1917", lang: "en" },
        verses: {
          bereshit: { "1": { "1": "In the beginning God created the heaven and the earth." } },
        },
      };
      ScriptureRegistry.setHasBook("torah", true);
      ScriptureRegistry.register("torah", custom);
      const v = await ScriptureRegistry.resolve("torah", "1", "1", "bereshit");
      expect(v.text).toContain("In the beginning");
    });
  });
});
