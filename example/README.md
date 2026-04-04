# Example — scripture-cite

This folder contains a demo page showing basic usage with literal `<scripture-cite>` markup.

Quick steps:

1. Build the library so `dist/scripture-cite.js` is generated:

```bash
npm run build
```

2. Serve the example folder (recommended) and open `http://localhost:8000`:

```bash
cd example
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Notes:

- The demo imports the ESM bundle from `../dist/scripture-cite.js` and renders actual `<scripture-cite>` tags from a template so the markup mirrors real usage.
- The demo uses `ScriptureConfigure({ loadDefaults: true, zen: { enabled: true } })` to register the bundled sample JSONs and expose the zen-mode button. You can instead call `ScriptureRegistry.register()` or `ScriptureConfigure({ dataUrl: '...' })` to supply your own data.
- Zen prompt behavior is configurable too. For example, you can override it with `ScriptureConfigure({ zen: { enabled: true, systemPrompt: 'Explain context, meaning, cross-reference, and relevance today.' } })`.
- The page now includes additional sections for attribute-level configuration samples (`no-ref`, `loading`, inline override) and copy-ready global `ScriptureConfigure(...)` presets.
