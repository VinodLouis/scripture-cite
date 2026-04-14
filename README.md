# scripture-cite

> Zero-dependency TypeScript web component library for inline & tooltip scripture citations — Bible, Quran, and Bhagavad Gita.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-green)](package.json)
[![Web Component](https://img.shields.io/badge/Web%20Component-Custom%20Element-orange)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)

---

## Features

| Feature                     | Description                                         |
| --------------------------- | --------------------------------------------------- |
| 📖 **Multi-scripture**      | Bible (KJV/NIV/etc.), Quran, Bhagavad Gita          |
| 🏷️ **Type-safe enums**      | `BibleBook`, `QuranSurah`, `GitaChapter` — no typos |
| ⚡ **O(1) verse lookup**    | Pre-built flat index Map, zero iteration            |
| 🎨 **Inline & Tooltip**     | Two display modes with smart positioning            |
| 🧩 **Web Component**        | Works with React, Vue, Angular, or vanilla HTML     |
| 🎭 **Themeable**            | CSS custom properties, full color control           |
| 📦 **Bring your own data**  | Register custom JSON or fetch from URL              |
| ✦ **Zen Mode** _(optional)_ | In-browser LLM explanations via WebLLM/WebGPU       |
| 🦥 **Lazy loading**         | IntersectionObserver for off-screen elements        |
| 🔒 **Zero dependencies**    | No runtime deps — Zen mode loads LLM dynamically    |

---

## Quick Start

### Install

```bash
npm install scripture-cite
```

### Usage

```html
<!-- Bible: source + book + chapter + verse -->
<scripture-cite
  source="bible"
  book="genesis"
  chapter="1"
  verse="1"
></scripture-cite>

<!-- Quran: no book needed -->
<scripture-cite source="quran" chapter="1" verse="1"></scripture-cite>

<!-- Gita: no book needed -->
<scripture-cite source="gita" chapter="2" verse="47"></scripture-cite>

<!-- Custom trigger text (tooltip mode) -->
<scripture-cite source="bible" book="john" chapter="3" verse="16">
  The most famous verse
</scripture-cite>
```

For a fuller demo, see the example page in [example/index.html](example/index.html), which renders literal `<scripture-cite>` tags and includes zen mode.

### Runtime Notes

- Core component features (inline/tooltip, registry, theming) run in modern browsers with Web Components support.
- Zen mode prefers WebGPU (best experience), then falls back to WASM/Transformers.js when WebGPU is unavailable.
- First zen use may require a model download; subsequent runs are cached by the browser.

## API At A Glance

- `ScriptureConfigure(config)` sets global defaults, theme, data loading, and Zen behavior.
- `ScriptureReady()` waits for the custom element definition and upgrades existing tags.
- `ScriptureRegistry` registers verse data, resolves verses, and loads bundled defaults or remote JSON.
- `initZenEngine()` pre-warms the model engine when you want to hide first-use latency.
- `explainVerse()` generates a verse explanation programmatically.

---

## Registering Data

The library ships **without** verse data to keep the bundle tiny. You bring your data.

### Option A — Register directly (bundled JSON)

```typescript
import { ScriptureRegistry, ScriptureSource } from 'scripture-cite';
import bibleData from './data/bible.json';

ScriptureRegistry.register(ScriptureSource.BIBLE, bibleData);
```

### Option B — Auto-fetch from URL

```typescript
import { ScriptureConfigure } from 'scripture-cite';

// Library will fetch /verses/bible.json, /verses/quran.json etc. on demand
ScriptureConfigure({ dataUrl: '/verses' });
```

### Option C — Register from URL explicitly

```typescript
await ScriptureRegistry.registerFromUrl(
  'bible',
  'https://cdn.example.com/kjv.json',
);
```

### Option D — Load bundled defaults (opt-in)

```typescript
import { ScriptureRegistry, ScriptureSource } from 'scripture-cite';

// Lazily imports and registers the library's bundled sample JSONs
// (bible, quran, gita). Only run this when you explicitly want the
// small sample datasets available in-browser.
await ScriptureRegistry.registerDefaults();

// Or load only the Bible sample:
await ScriptureRegistry.registerDefaults([ScriptureSource.BIBLE]);
```

---

## JSON Data Format

```json
{
  "meta": {
    "source": "bible",
    "version": "KJV",
    "lang": "en",
    "direction": "ltr",
    "attribution": "King James Version — Public Domain"
  },
  "verses": {
    "genesis": {
      "1": {
        "1": "In the beginning God created the heaven and the earth.",
        "2": "And the earth was without form, and void..."
      }
    }
  }
}
```

**For Quran and Gita** (no book dimension):

```json
{
  "meta": { "source": "quran", "version": "Sahih International", "lang": "en" },
  "verses": {
    "1": {
      "1": "In the name of Allah, the Entirely Merciful...",
      "2": "All praise is due to Allah, Lord of the worlds."
    }
  }
}
```

> **Lookup path:**  
> Bible → `verses[book][chapter][verse]`  
> Quran/Gita → `verses[chapter][verse]`

See [`data/format.schema.json`](./data/format.schema.json) for the full JSON Schema.  
See [`data/*.sample.json`](./data/) for example files you can extend.

---

## Display Modes

### Tooltip (default)

The element renders its children (or the reference if no children) as a clickable trigger. On hover/focus, a styled tooltip appears with the verse text.

```html
<scripture-cite source="bible" book="psalms" chapter="23" verse="1">
  The Shepherd's Psalm
</scripture-cite>
```

You can control the tooltip placement per-element using the `placement` attribute. Values: `north`, `south`, `east`, `west`.

```html
<!-- Open above the trigger -->
<scripture-cite
  source="bible"
  book="john"
  chapter="3"
  verse="16"
  placement="north"
>
  John 3:16
</scripture-cite>

<!-- Open to the right of the trigger -->
<scripture-cite source="gita" chapter="2" verse="47" placement="east">
  Gita 2:47 — hover
</scripture-cite>
```

### Inline

Renders the verse text directly in the document flow with a reference label.

```html
<scripture-cite
  source="quran"
  chapter="2"
  verse="286"
  mode="inline"
></scripture-cite>
```

### Global default mode

```typescript
ScriptureConfigure({ defaultMode: 'inline' });
```

### `ScriptureReady` for imperative flows

If you query or mutate elements from script, wait until custom element upgrade is complete:

```typescript
import { ScriptureReady } from 'scripture-cite';

await ScriptureReady();
document.querySelector('scripture-cite')?.setAttribute('verse', '2');
```

---

## Type-Safe Enums

Use enums in TypeScript to eliminate typos at build time:

```typescript
import {
  ScriptureSource,
  BibleBook,
  QuranSurah,
  GitaChapter,
} from 'scripture-cite';

// Use as attribute values — the enum values ARE the attribute strings
const el = document.createElement('scripture-cite');
el.setAttribute('source', ScriptureSource.BIBLE); // "bible"
el.setAttribute('book', BibleBook.GENESIS); // "genesis"
el.setAttribute('chapter', '1');
el.setAttribute('verse', '1');

// Or use in registry calls
const verse = await ScriptureRegistry.resolve(
  ScriptureSource.QURAN,
  QuranSurah.AR_RAHMAN, // "55"
  '13',
);
```

All 66 Bible books, 114 Quran surahs, and 18 Gita chapters are included.

---

## Global Configuration

```typescript
import { ScriptureConfigure } from 'scripture-cite';

ScriptureConfigure({
  defaultMode: 'tooltip', // "inline" | "tooltip"
  dataUrl: '/static/verses', // auto-fetch source JSONs from here
  // `loadDefaults` can be `true` (load all bundled samples), `false` (none),
  // or an array of source ids to load only specific defaults, e.g. ['bible'].
  // Example: `loadDefaults: true` or `loadDefaults: ['bible']`.
  loadDefaults: true,

  theme: {
    accentColor: '#8b6914',
    verseFont: 'Georgia, serif',
    refFont: 'system-ui, sans-serif',
    borderRadius: '8px',
    tooltipBg: '#1a1208',
    tooltipColor: '#f5e6c8',
    inlineColor: '#3d2b00',
    inlineBg: '#fdf6e3',
    tooltipShadow: '0 8px 32px rgba(0,0,0,0.35)',
    tooltipMaxWidth: '420px',
    animDuration: '200ms',
  },

  onError: (err) => console.error('Scripture error:', err.code, err.message),
});
```

### CSS Custom Properties

You can also override via CSS on any element or `:root`:

```css
:root {
  --sc-accent: #6b4c9a;
  --sc-tooltip-bg: #1e1b2e;
  --sc-tooltip-color: #e8dff5;
  --sc-inline-bg: #f3eeff;
  --sc-radius: 12px;
}
```

#### Style Preset Examples

```css
.theme-royal {
  --sc-accent: #3f2e89;
  --sc-tooltip-bg: #16132a;
  --sc-tooltip-color: #ece7ff;
  --sc-inline-bg: #eee9ff;
  --sc-inline-color: #2c1d66;
}

.theme-sage {
  --sc-accent: #2b6b4f;
  --sc-tooltip-bg: #11261d;
  --sc-tooltip-color: #dbf5e8;
  --sc-inline-bg: #eaf8f1;
  --sc-inline-color: #1f4d38;
  --sc-radius: 14px;
}
```

```html
<scripture-cite
  class="theme-royal"
  source="bible"
  book="john"
  chapter="3"
  verse="16"
>
  Royal styled tooltip
</scripture-cite>

<scripture-cite
  source="quran"
  chapter="1"
  verse="1"
  mode="inline"
  style="--sc-accent:#005f73; --sc-inline-bg:#e0fbfc; --sc-inline-color:#003845"
></scripture-cite>
```

---

## Element Attributes

| Attribute | Required   | Values                 | Description                                   |
| --------- | ---------- | ---------------------- | --------------------------------------------- |
| `source`  | ✅         | `bible` `quran` `gita` | Scripture source                              |
| `book`    | Bible only | e.g. `genesis`         | Book name (not needed for Quran/Gita)         |
| `chapter` | ✅         | `"1"` – `"150"`        | Chapter number                                |
| `verse`   | ✅         | `"1"` – `"176"`        | Verse number                                  |
| `mode`    | –          | `inline` `tooltip`     | Display mode (global default if omitted)      |
| `zen`     | –          | `true`                 | Enable Zen explanation UI (tooltip or inline) |
| `no-ref`  | –          | –                      | Hide reference label                          |
| `loading` | –          | `eager` `lazy`         | Force load strategy (tooltip=lazy by default) |

---

## Events

```typescript
const el = document.querySelector('scripture-cite');

el.addEventListener('scripture-resolved', (e) => {
  console.log(e.detail); // ResolvedVerse { text, source, book, chapter, verse, meta }
});

el.addEventListener('scripture-error', (e) => {
  console.error(e.detail); // ScriptureError
});

el.addEventListener('scripture-zen', (e) => {
  console.log(e.detail); // { verse: ResolvedVerse, explanation: string }
});
```

---

## Custom Source Registration

You can register any scripture source — the library is not limited to Bible/Quran/Gita:

```typescript
import { ScriptureRegistry } from 'scripture-cite';

// Register Torah with book dimension
ScriptureRegistry.setHasBook('torah', true);
ScriptureRegistry.register('torah', {
  meta: { source: 'torah', version: 'JPS 1917', lang: 'en' },
  verses: {
    bereshit: { '1': { '1': 'In the beginning God created...' } },
  },
});
```

```html
<scripture-cite
  source="torah"
  book="bereshit"
  chapter="1"
  verse="1"
></scripture-cite>
```

---

## ✦ Zen Mode (Optional Feature)

Zen mode adds an in-browser LLM explanation to any verse. It uses [WebLLM](https://github.com/mlc-ai/web-llm) running on **WebGPU** when available, with a WASM fallback path for broader compatibility.

Zen is loaded lazily. The first zen click starts the model download and the tooltip shows progress. The component now also prewarms on hover/focus of the Zen button and shows a small status hint so users know when the model is still loading.

### Model Choices

Pick the smallest model that gives you acceptable output quality:

| Model                               | Tradeoff                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | Default; very small and fast, but explanation quality is lower     |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | Good balance of size and reasoning quality                         |
| `Phi-3.5-mini-instruct-q4f16_1-MLC` | Best quality here, but heaviest download and slowest first load    |
| `TinyLlama-1.1B-Chat-v1.0`          | Lightweight fallback style model if you prefer a smaller footprint |

If WebGPU is unavailable, the library can fall back to the smaller WASM/Transformers.js path.

### Enable Zen Mode

The Zen explanation prompt is configurable. If you do not pass `systemPrompt`, the library uses the built-in default. You can override it globally through `ScriptureConfigure(...)`.

```typescript
ScriptureConfigure({
  zen: {
    enabled: true,
    model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', // default
    systemPrompt:
      'Explain the verse with literary context, theological meaning, one interpretive nuance, and one modern-day implication.', // optional override
    onProgress: (pct, text) => console.log(`${pct}% — ${text}`),
  },
});
```

Example override with a custom prompt:

```typescript
ScriptureConfigure({
  zen: {
    enabled: true,
    systemPrompt:
      'Write 7-10 complete sentences in one paragraph: context, theological meaning, one interpretive nuance, and practical relevance today. Avoid repetition and end with a complete sentence.',
  },
});
```

```html
<!-- Add zen attribute to element -->
<scripture-cite source="gita" chapter="2" verse="47" zen="true">
  The Duty Verse
</scripture-cite>
```

The example page in [example/index.html](example/index.html) enables zen in `ScriptureConfigure(...)` so the button is visible in the browser demo, and it shows Bible, Quran, and Gita zen samples.

A **✦ Zen Explain** button appears in tooltip mode and inline mode. In inline mode it expands a collapsible explanation block below the verse. First click downloads the model (one-time), subsequent clicks are instant (cached).

Hovering or focusing the button starts a background prewarm, which makes the eventual click feel much smoother.

### Zen Formatting & Safety

Zen explanations are rendered safely:

- HTML from model output is escaped (not executed).
- A small Markdown subset is supported for readability: `**bold**`, `*italic*`, and line breaks.
- This keeps output expressive while preventing unsafe rich content injection.

### Programmatic API

```typescript
import { initZenEngine, explainVerse } from 'scripture-cite';

// Pre-warm the engine
await initZenEngine((status) => console.log('Model:', status));

// Explain a resolved verse
const result = await explainVerse(resolvedVerse);
console.log(result.explanation);
```

---

## Troubleshooting

1. Error: source not registered

Call `ScriptureRegistry.register(...)`, `ScriptureRegistry.registerDefaults(...)`, or configure `dataUrl` before resolving verses.

2. Tooltip style/class not reflected in tooltip popup

Use CSS variables on the host element or class. Tooltip content renders through a portal and now mirrors host `--sc-*` variables.

3. Zen feels slow on first click

This is expected while model assets download. Use the default lightweight model (`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`) and prewarm by hovering/focusing the Zen button.

4. Zen output looks too generic

Provide a custom `zen.systemPrompt` and keep it verse-specific. The built-in generation flow now requests longer analysis, retries with stricter decoding when quality is low, and filters repetitive/truncated output.

---

## Framework Examples

### React

```tsx
import 'scripture-cite'; // auto-registers <scripture-cite>
import { ScriptureRegistry, ScriptureSource, BibleBook } from 'scripture-cite';
import bibleKJV from './data/bible.json';

ScriptureRegistry.register(ScriptureSource.BIBLE, bibleKJV);

export function BibleVerse() {
  return (
    <p>
      As it is written:{' '}
      <scripture-cite
        source={ScriptureSource.BIBLE}
        book={BibleBook.JOHN}
        chapter="3"
        verse="16"
        mode="inline"
      />
    </p>
  );
}
```

### Vue

```vue
<template>
  <scripture-cite source="quran" chapter="55" verse="13" />
</template>

<script setup>
import 'scripture-cite';
import { ScriptureRegistry } from 'scripture-cite';
import quranData from './data/quran.json';
ScriptureRegistry.register('quran', quranData);
</script>
```

### Vanilla HTML

```html
<script type="module">
  import {
    ScriptureRegistry,
    ScriptureConfigure,
  } from 'https://unpkg.com/scripture-cite';

  ScriptureConfigure({ dataUrl: '/verses' });
</script>

<scripture-cite
  source="bible"
  book="genesis"
  chapter="1"
  verse="1"
></scripture-cite>
```

---

## Testing

```bash
npm test           # Run tests
npm run test:watch # Watch mode
npm run test:coverage
```

## Production Checklist

Before publishing:

1. Run `npm test` and ensure all tests pass.
2. Run `npm run build` to generate ESM, UMD, and TypeScript declaration files.
3. Verify `dist/` contains `scripture-cite.js`, `scripture-cite.umd.cjs`, and `dist/types/index.d.ts`.
4. Confirm your data strategy is configured (`register(...)`, `registerDefaults(...)`, or `dataUrl`).
5. If Zen is enabled in production, choose a model size appropriate for your audience and bandwidth.

---

## Building

```bash
npm run build      # ESM + UMD bundles → dist/
npm run typecheck  # Strict TypeScript check
```

### Output

| File                          | Format  | Use                            |
| ----------------------------- | ------- | ------------------------------ |
| `dist/scripture-cite.js`      | ESM     | Bundlers (Vite, webpack, etc.) |
| `dist/scripture-cite.umd.cjs` | UMD     | CDN script tags                |
| `dist/types/`                 | `.d.ts` | TypeScript consumers           |

---

## Architecture

```
src/
├── enums.ts        # ScriptureSource, BibleBook (66), QuranSurah (114), GitaChapter (18)
├── types.ts        # ScriptureData, ResolvedVerse, ScriptureConfig, ZenConfig, …
├── config.ts       # Global config singleton with CSS var injection
├── registry.ts     # O(1) verse registry (flat Map index, dedup fetch, URL support)
├── component.ts    # <scripture-cite> Web Component (Shadow DOM, tooltip, inline)
├── zen/
│   └── zen-mode.ts # Optional WebLLM bridge (dynamic import, model cache)
└── index.ts        # Public API & auto-registration
```

**Verse lookup is O(1):** on registration, all verses are indexed into a flat `Map<string, string>` where keys are `"book:chapter:verse"` (Bible) or `"chapter:verse"` (Quran/Gita). Subsequent lookups are a single `Map.get()` call.

---

## License

MIT
