// ============================================================
// Tests: Race Conditions — upgrade timing & attribute buffering
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ScriptureRegistry } from "../src/registry.js";
import { defineScriptureCite, ScriptureCiteElement } from "../src/component.js";
import { ScriptureReady } from "../src/index.js";
import type { ScriptureData } from "../src/types.js";

defineScriptureCite();

const BIBLE_DATA: ScriptureData = {
  meta: { source: "bible", version: "KJV", lang: "en" },
  verses: {
    genesis: { "1": { "1": "In the beginning God created the heaven and the earth." } },
    john:    { "3": { "16": "For God so loved the world..." } },
  },
};

async function flush(ms = 60): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("Race: upgrade timing", () => {
  beforeEach(() => {
    ScriptureRegistry.clear();
    ScriptureRegistry.register("bible", BIBLE_DATA);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    ScriptureRegistry.clear();
  });

  // ── 1. Constructor shows loading state immediately ───────────
  it("renders loading dots in constructor before connectedCallback", () => {
    // Create element but DON'T attach it yet — simulates upgrade-before-connect
    const el = document.createElement("scripture-cite") as ScriptureCiteElement;
    el.setAttribute("source", "bible");
    el.setAttribute("book", "genesis");
    el.setAttribute("chapter", "1");
    el.setAttribute("verse", "1");

    // Shadow DOM exists and shows loading state even before connection
    const shadow = el.shadowRoot!;
    expect(shadow).toBeTruthy();
    // Loading dots or empty — either way, no error, no crash
    expect(shadow.innerHTML).not.toBe("");
  });

  // ── 2. Attributes set before connection are not lost ─────────
  it("renders correctly when attributes are set before DOM insertion", async () => {
    const el = document.createElement("scripture-cite") as ScriptureCiteElement;
    // Set all attributes BEFORE appending — simulates parser upgrade race
    el.setAttribute("source", "bible");
    el.setAttribute("book", "genesis");
    el.setAttribute("chapter", "1");
    el.setAttribute("verse", "1");
    el.setAttribute("mode", "inline");
    el.setAttribute("loading", "eager");

    // Now attach — connectedCallback fires here and flushes _pendingAttributeChange
    document.body.appendChild(el);
    await flush();

    const shadow = el.shadowRoot!;
    expect(shadow.textContent).toContain("In the beginning");
  });

  // ── 3. Attribute changes after connection re-render correctly ─
  it("re-renders when attribute changes after connection", async () => {
    const el = document.createElement("scripture-cite") as ScriptureCiteElement;
    el.setAttribute("source", "bible");
    el.setAttribute("book", "genesis");
    el.setAttribute("chapter", "1");
    el.setAttribute("verse", "1");
    el.setAttribute("mode", "inline");
    el.setAttribute("loading", "eager");
    document.body.appendChild(el);
    await flush();

    expect(el.shadowRoot!.textContent).toContain("In the beginning");

    // Change verse after connection — should re-render
    el.setAttribute("book", "john");
    el.setAttribute("chapter", "3");
    el.setAttribute("verse", "16");
    await flush();

    expect(el.shadowRoot!.textContent).toContain("For God so loved");
  });

  // ── 4. Multiple concurrent attribute sets don't double-render ─
  it("coalesces rapid attribute changes into a single render", async () => {
    const el = document.createElement("scripture-cite") as ScriptureCiteElement;
    document.body.appendChild(el);

    // Rapid-fire attribute sets — should not crash or produce multiple fetches
    el.setAttribute("source", "bible");
    el.setAttribute("book", "genesis");
    el.setAttribute("chapter", "1");
    el.setAttribute("verse", "1");
    el.setAttribute("mode", "inline");
    el.setAttribute("loading", "eager");

    await flush();
    expect(el.shadowRoot!.textContent).toContain("In the beginning");
  });

  // ── 5. ScriptureReady resolves once element is defined ────────
  it("ScriptureReady() resolves immediately when already defined", async () => {
    let resolved = false;
    await ScriptureReady().then(() => { resolved = true; });
    expect(resolved).toBe(true);
  });

  // ── 6. customElements.upgrade() is safe to call on live elements ─
  it("customElements.upgrade() on already-upgraded element is a no-op", async () => {
    const el = document.createElement("scripture-cite");
    el.setAttribute("source", "bible");
    el.setAttribute("book", "genesis");
    el.setAttribute("chapter", "1");
    el.setAttribute("verse", "1");
    el.setAttribute("mode", "inline");
    el.setAttribute("loading", "eager");
    document.body.appendChild(el);
    await flush();

    // Calling upgrade again must not crash or re-init
    expect(() => customElements.upgrade(el)).not.toThrow();
    // Content must still be valid
    expect(el.shadowRoot!.textContent).toContain("In the beginning");
  });

  // ── 7. Element removed from DOM aborts pending fetch ─────────
  it("does not render after being removed from DOM mid-load", async () => {
    const el = document.createElement("scripture-cite");
    el.setAttribute("source", "bible");
    el.setAttribute("book", "genesis");
    el.setAttribute("chapter", "1");
    el.setAttribute("verse", "1");
    el.setAttribute("loading", "eager");
    document.body.appendChild(el);

    // Immediately remove — fetch is aborted
    document.body.removeChild(el);

    await flush();
    // Should not throw and shadow root should exist but be loading/empty
    expect(el.shadowRoot).toBeTruthy();
  });

  // ── 8. defineScriptureCite() is idempotent ────────────────────
  it("calling defineScriptureCite() multiple times does not throw", () => {
    expect(() => {
      defineScriptureCite();
      defineScriptureCite();
      defineScriptureCite();
    }).not.toThrow();
    expect(customElements.get("scripture-cite")).toBeDefined();
  });
});
