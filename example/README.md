# Example — scripture-cite

This folder contains two demo pages:

- `example.html` — sectioned cookbook with side-by-side output and code snippets.
- `index.html` — interactive sandbox to tune config and preview behavior live.

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

Then open either:

- `http://localhost:8000/example.html`
- `http://localhost:8000/index.html`

Notes:

- Both demos import the ESM bundle from `../dist/scripture-cite.js`.
- The examples use `ScriptureConfigure({ loadDefaults: true, zen: { enabled: true } })` so bundled sample data and zen controls are available immediately.
- You can swap to your own data via `ScriptureRegistry.register(...)` or `ScriptureConfigure({ dataUrl: '...' })`.

What `example.html` now showcases:

- Tooltip mode, inline mode, placement options, and zen mode
- Attribute samples (`no-ref`, `loading`, mode overrides)
- Style/theming samples
- Global config examples
- Zen prompt override example
- Custom zen provider configuration example

What `index.html` sandbox now includes:

- Mode toggle (`tooltip` / `inline`)
- Theme controls (accent, tooltip/inline colors, responsive tooltip width)
- Zen enable toggle
- Zen provider selector (`local model` / `custom callback`)
- Custom zen response template for callback mode
- Live sample verse selectors (Bible/Quran/Gita)

Custom Zen provider behavior in sandbox:

- In `custom` provider mode, the sandbox wires `zen.customProvider` internally.
- The sandbox exposes the provider as a code editor so you can fetch any API, parse any response shape, or return a static answer.
- The function receives the full Zen request object and must return a string or promise of a string.
