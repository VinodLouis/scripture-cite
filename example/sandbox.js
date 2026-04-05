// Sandbox script for interactive configuration of scripture-cite
import('../dist/scripture-cite.js')
  .then(async (api) => {
    const {
      ScriptureConfigure,
      clearZenCache,
      ScriptureRegistry,
      ScriptureReady,
      initZenEngine,
    } = api;

    const samplesEl = document.getElementById('samples');
    const modeSel = document.getElementById('mode');
    const zenChk = document.getElementById('zen');
    const accent = document.getElementById('accent');
    const loadDefaults = document.getElementById('loadDefaults');
    const applyBtn = document.getElementById('apply');
    const recreateBtn = document.getElementById('recreate');
    const statusBanner = document.getElementById('statusBanner');
    const tooltipBg = document.getElementById('tooltipBg');
    const tooltipMaxWidth = document.getElementById('tooltipMaxWidth');
    const inlineBg = document.getElementById('inlineBg');
    const inlineColor = document.getElementById('inlineColor');
    const bibleBook = document.getElementById('bibleBook');
    const bibleChapter = document.getElementById('bibleChapter');
    const bibleVerse = document.getElementById('bibleVerse');
    const quranChapter = document.getElementById('quranChapter');
    const quranVerse = document.getElementById('quranVerse');
    const gitaChapter = document.getElementById('gitaChapter');
    const gitaVerse = document.getElementById('gitaVerse');
    const zenEditorMount = document.getElementById('zenEditor');
    const zenPreview = document.getElementById('zenPreview');
    const DEFAULT_ZEN_PROMPT_TEXT =
      'You are a careful, concise scripture explainer. ' +
      'Explain only the provided verse in 4-6 clear sentences using neutral, explanatory language. ' +
      'Stay grounded in the verse text, avoid generic boilerplate, and do not use headings or bullet points.';
    const zenPromptFallback = document.createElement('textarea');
    zenPromptFallback.id = 'zenPromptFallback';
    zenPromptFallback.style.display = 'none';
    zenPromptFallback.value = DEFAULT_ZEN_PROMPT_TEXT;
    document.body.appendChild(zenPromptFallback);

    const DEFAULT_ZEN_HTML = `
      <p>${DEFAULT_ZEN_PROMPT_TEXT}</p>
    `;

    let zenEditorHtml = DEFAULT_ZEN_HTML;
    let loadedSettingsSnapshot = null;
    let statusHideTimer = null;

    const FALLBACK_SCRIPTURE_CHOICES = {
      bible: {
        books: {
          john: { 3: ['16'] },
          genesis: { 1: ['1', '2', '3'] },
        },
      },
      quran: {
        chapters: {
          1: ['1', '2', '3', '4', '5', '6', '7'],
          2: ['1', '255'],
        },
      },
      gita: {
        chapters: {
          1: ['1', '2'],
          2: ['47'],
        },
      },
    };

    let scriptureChoices = FALLBACK_SCRIPTURE_CHOICES;

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function plainTextToHtml(value) {
      return String(value)
        .split(/\n+/)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('');
    }

    function htmlToPlainText(html) {
      const scratch = document.createElement('div');
      scratch.innerHTML = html;
      return (scratch.innerText || scratch.textContent || '').trim();
    }

    function setZenPreview(html) {
      if (zenPreview) zenPreview.innerHTML = html;
    }

    function getZenPromptText() {
      const content = zenEditorMount?.querySelector('.pell-content');
      const liveHtml = content?.innerHTML?.trim();
      return htmlToPlainText(
        liveHtml || zenEditorHtml || zenPromptFallback.value,
      );
    }

    function setZenPromptHtml(html) {
      zenEditorHtml = html;
      if (zenEditorMount) {
        const content = zenEditorMount.querySelector('.pell-content');
        if (content) content.innerHTML = html;
      }
      setZenPreview(html);
    }

    function showStatus(message, kind = 'success') {
      if (!statusBanner) return;
      if (statusHideTimer) {
        clearTimeout(statusHideTimer);
        statusHideTimer = null;
      }
      statusBanner.textContent = message;
      statusBanner.className = `status-banner show ${kind}`;

      // Keep info/status-in-progress visible until replaced.
      if (kind === 'info') return;

      const hideAfterMs = kind === 'error' ? 7000 : 3000;
      statusHideTimer = setTimeout(() => {
        if (!statusBanner) return;
        statusBanner.className = 'status-banner';
        statusBanner.textContent = '';
        statusHideTimer = null;
      }, hideAfterMs);
    }

    function sortMixedKeys(a, b) {
      const na = Number(a);
      const nb = Number(b);
      const aIsNum = Number.isFinite(na);
      const bIsNum = Number.isFinite(nb);
      if (aIsNum && bIsNum) return na - nb;
      if (aIsNum && !bIsNum) return -1;
      if (!aIsNum && bIsNum) return 1;
      return String(a).localeCompare(String(b));
    }

    async function loadScriptureChoices() {
      try {
        const [bible, quran, gita] = await Promise.all([
          fetch('../data/bible.sample.json').then((r) => r.json()),
          fetch('../data/quran.sample.json').then((r) => r.json()),
          fetch('../data/gita.sample.json').then((r) => r.json()),
        ]);

        const bibleBooks = {};
        const rawBibleBooks = bible?.verses || {};
        for (const [book, chapters] of Object.entries(rawBibleBooks)) {
          const chapterMap = chapters || {};
          bibleBooks[book] = {};
          for (const [chapter, verses] of Object.entries(chapterMap)) {
            const verseKeys = Object.keys(verses || {}).sort(sortMixedKeys);
            bibleBooks[book][chapter] = verseKeys;
          }
        }

        const buildChapterMap = (raw) => {
          const out = {};
          for (const [chapter, verses] of Object.entries(raw || {})) {
            out[chapter] = Object.keys(verses || {}).sort(sortMixedKeys);
          }
          return out;
        };

        scriptureChoices = {
          bible: { books: bibleBooks },
          quran: { chapters: buildChapterMap(quran?.verses) },
          gita: { chapters: buildChapterMap(gita?.verses) },
        };
      } catch (e) {
        scriptureChoices = FALLBACK_SCRIPTURE_CHOICES;
        showStatus(
          'Using fallback verse options (catalog fetch failed).',
          'error',
        );
      }
    }

    function setSelectOptions(selectEl, values, preferred) {
      if (!selectEl) return;
      selectEl.innerHTML = '';
      for (const value of values) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        selectEl.appendChild(opt);
      }
      if (preferred && values.includes(preferred)) {
        selectEl.value = preferred;
      } else if (values[0]) {
        selectEl.value = values[0];
      }
    }

    function refreshBibleOptions(preferred = {}) {
      const books = Object.keys(scriptureChoices.bible.books).sort(
        sortMixedKeys,
      );
      setSelectOptions(
        bibleBook,
        books,
        preferred.book || bibleBook?.value || 'john',
      );

      const selectedBook = bibleBook?.value || books[0];
      const chapters = Object.keys(
        scriptureChoices.bible.books[selectedBook] || {},
      ).sort(sortMixedKeys);
      setSelectOptions(
        bibleChapter,
        chapters,
        preferred.chapter || bibleChapter?.value || '3',
      );

      const selectedChapter = bibleChapter?.value || chapters[0];
      const verses =
        scriptureChoices.bible.books[selectedBook]?.[selectedChapter] || [];
      setSelectOptions(
        bibleVerse,
        verses,
        preferred.verse || bibleVerse?.value || '16',
      );
    }

    function refreshQuranOptions(preferred = {}) {
      const chapters = Object.keys(scriptureChoices.quran.chapters).sort(
        sortMixedKeys,
      );
      setSelectOptions(
        quranChapter,
        chapters,
        preferred.chapter || quranChapter?.value || '1',
      );
      const selectedChapter = quranChapter?.value || chapters[0];
      const verses = scriptureChoices.quran.chapters[selectedChapter] || [];
      setSelectOptions(
        quranVerse,
        verses,
        preferred.verse || quranVerse?.value || '1',
      );
    }

    function refreshGitaOptions(preferred = {}) {
      const chapters = Object.keys(scriptureChoices.gita.chapters).sort(
        sortMixedKeys,
      );
      setSelectOptions(
        gitaChapter,
        chapters,
        preferred.chapter || gitaChapter?.value || '2',
      );
      const selectedChapter = gitaChapter?.value || chapters[0];
      const verses = scriptureChoices.gita.chapters[selectedChapter] || [];
      setSelectOptions(
        gitaVerse,
        verses,
        preferred.verse || gitaVerse?.value || '47',
      );
    }

    function currentSampleVerses() {
      const bb = bibleBook?.value || 'john';
      const bc = bibleChapter?.value || '3';
      const bv = bibleVerse?.value || '16';
      const qc = quranChapter?.value || '1';
      const qv = quranVerse?.value || '1';
      const gc = gitaChapter?.value || '2';
      const gv = gitaVerse?.value || '47';

      return [
        {
          source: 'bible',
          book: bb,
          chapter: bc,
          verse: bv,
          label: `Bible ${bb.charAt(0).toUpperCase() + bb.slice(1)} ${bc}:${bv}`,
        },
        {
          source: 'quran',
          chapter: qc,
          verse: qv,
          label: `Quran ${qc}:${qv}`,
        },
        {
          source: 'gita',
          chapter: gc,
          verse: gv,
          label: `Gita ${gc}:${gv}`,
        },
      ];
    }

    function readLibrarySettingsSnapshot() {
      try {
        const cfgSingleton = api.ScriptureConfigSingleton;
        const theme = cfgSingleton.theme;
        const zenCfg = cfgSingleton.zen;

        return {
          mode: cfgSingleton.defaultMode || 'tooltip',
          accentColor: theme.accentColor,
          tooltipBg: theme.tooltipBg,
          tooltipMaxWidth: theme.tooltipMaxWidth,
          inlineBg: theme.inlineBg,
          inlineColor: theme.inlineColor,
          loadDefaults: !!cfgSingleton.loadDefaults,
          zenEnabled: !!zenCfg.enabled,
          zenSystemPrompt: zenCfg.systemPrompt || '',
        };
      } catch (e) {
        // ignore - fallback to the current UI state
        return null;
      }
    }

    function applySettingsSnapshot(snapshot) {
      if (!snapshot) return;

      if (modeSel) modeSel.value = snapshot.mode || modeSel.value;
      if (accent && snapshot.accentColor) accent.value = snapshot.accentColor;
      if (tooltipBg && snapshot.tooltipBg) tooltipBg.value = snapshot.tooltipBg;
      if (tooltipMaxWidth && snapshot.tooltipMaxWidth) {
        tooltipMaxWidth.value = String(
          parseInt(snapshot.tooltipMaxWidth, 10) || 420,
        );
      }
      if (inlineBg && snapshot.inlineBg) inlineBg.value = snapshot.inlineBg;
      if (inlineColor && snapshot.inlineColor)
        inlineColor.value = snapshot.inlineColor;
      if (loadDefaults) loadDefaults.checked = !!snapshot.loadDefaults;
      if (zenChk) zenChk.checked = !!snapshot.zenEnabled;
      if (snapshot.zenSystemPrompt)
        setZenPromptHtml(plainTextToHtml(snapshot.zenSystemPrompt));

      refreshBibleOptions({
        book: snapshot.bibleBook,
        chapter: snapshot.bibleChapter,
        verse: snapshot.bibleVerse,
      });
      refreshQuranOptions({
        chapter: snapshot.quranChapter,
        verse: snapshot.quranVerse,
      });
      refreshGitaOptions({
        chapter: snapshot.gitaChapter,
        verse: snapshot.gitaVerse,
      });

      updateControlVisibility();
    }

    function captureCurrentSettingsSnapshot() {
      return {
        mode: modeSel?.value || 'tooltip',
        accentColor: accent?.value || '',
        tooltipBg: tooltipBg?.value || '',
        tooltipMaxWidth: tooltipMaxWidth?.value
          ? `${tooltipMaxWidth.value}px`
          : '',
        inlineBg: inlineBg?.value || '',
        inlineColor: inlineColor?.value || '',
        loadDefaults: !!loadDefaults?.checked,
        zenEnabled: !!zenChk?.checked,
        zenSystemPrompt: getZenPromptText(),
        bibleBook: bibleBook?.value || 'john',
        bibleChapter: bibleChapter?.value || '3',
        bibleVerse: bibleVerse?.value || '16',
        quranChapter: quranChapter?.value || '1',
        quranVerse: quranVerse?.value || '1',
        gitaChapter: gitaChapter?.value || '2',
        gitaVerse: gitaVerse?.value || '47',
      };
    }

    function initZenEditor() {
      if (!zenEditorMount || !window.pell) {
        if (zenEditorMount) {
          zenEditorMount.innerHTML = '';
          const fallback = document.createElement('textarea');
          fallback.rows = 6;
          fallback.style.width = '100%';
          fallback.style.minHeight = '180px';
          fallback.style.border = '0';
          fallback.style.padding = '14px';
          fallback.style.boxSizing = 'border-box';
          fallback.style.font =
            "400 0.96rem/1.6 Georgia,'Times New Roman',serif";
          fallback.value = zenPromptFallback.value;
          fallback.addEventListener('input', () => {
            zenEditorHtml = plainTextToHtml(fallback.value);
            setZenPreview(zenEditorHtml);
          });
          zenEditorMount.appendChild(fallback);
        }
        setZenPreview(plainTextToHtml(zenPromptFallback.value));
        return;
      }

      window.pell.init({
        element: zenEditorMount,
        actions: ['bold', 'italic', 'underline', 'olist', 'ulist', 'link'],
        onChange: (html) => {
          zenEditorHtml = html;
          setZenPreview(html);
        },
        defaultParagraphSeparator: 'p',
        styleWithCSS: false,
        classes: {
          actionbar: 'pell-actionbar',
          button: 'pell-button',
          content: 'pell-content',
        },
      });

      const content = zenEditorMount.querySelector('.pell-content');
      if (content) {
        const initialHtml = zenEditorHtml || DEFAULT_ZEN_HTML;
        content.innerHTML = initialHtml;
        zenEditorHtml = content.innerHTML;
        setZenPreview(zenEditorHtml);
      }
    }

    function createSampleElements(mode, zen) {
      const created = [];
      samplesEl.innerHTML = '';
      for (const s of currentSampleVerses()) {
        const el = document.createElement('scripture-cite');
        el.setAttribute('source', s.source);
        if (s.book) el.setAttribute('book', s.book);
        el.setAttribute('chapter', s.chapter);
        el.setAttribute('verse', s.verse);
        // explicit per-element mode uses selected mode so preview matches
        el.setAttribute('mode', mode);
        // In the sandbox we want deterministic, immediate rendering.
        // Force eager load so first paint doesn't depend on intersection timing.
        el.setAttribute('loading', 'eager');
        if (zen) el.setAttribute('zen', '');
        el.textContent = `${s.label} — preview`;
        samplesEl.appendChild(el);
        created.push(el);
      }
      return created;
    }

    function recreatePreviewFromControls() {
      createSampleElements(modeSel.value, zenChk.checked);
      showStatus('Preview updated from selected verses.', 'success');
    }

    function waitForSamplesSettled(elements, timeoutMs = 5000) {
      const settled = elements.map(
        (el) =>
          new Promise((resolve) => {
            let done = false;
            const finish = (state) => {
              if (done) return;
              done = true;
              resolve(state);
            };

            const onResolved = () => finish('resolved');
            const onError = () => finish('error');

            el.addEventListener('scripture-resolved', onResolved, {
              once: true,
            });
            el.addEventListener('scripture-error', onError, { once: true });

            setTimeout(() => finish('timeout'), timeoutMs);
          }),
      );

      return Promise.all(settled);
    }

    async function applyConfigFromUI() {
      showStatus('Applying configuration...', 'info');
      const tooltipWidthValue = tooltipMaxWidth?.value
        ? `${tooltipMaxWidth.value}px`
        : undefined;
      const cfg = {
        defaultMode: modeSel.value,
        theme: {
          accentColor: accent?.value,
          tooltipBg: tooltipBg?.value,
          inlineBg: inlineBg?.value,
          inlineColor: inlineColor?.value,
          tooltipMaxWidth: tooltipWidthValue,
        },
        zen: { enabled: !!zenChk.checked, systemPrompt: getZenPromptText() },
        loadDefaults: loadDefaults.checked ? true : undefined,
      };

      ScriptureConfigure(cfg);
      if (clearZenCache) {
        await clearZenCache();
      }

      if (cfg.loadDefaults) {
        try {
          await ScriptureRegistry.registerDefaults();
        } catch (e) {
          throw new Error(`Failed to register defaults: ${String(e)}`);
        }
      }

      if (cfg.zen.enabled) {
        // prewarm the zen engine to make first use faster
        try {
          await initZenEngine(() => {});
        } catch (e) {
          // ignore — engine may be unavailable in some environments
        }
      }

      // Recreate example elements so mode/zen reflect the new config
      const created = createSampleElements(modeSel.value, zenChk.checked);
      const outcomesPromise = waitForSamplesSettled(created);
      await ScriptureReady();
      const outcomes = await outcomesPromise;
      const errorCount = outcomes.filter((s) => s === 'error').length;
      const timeoutCount = outcomes.filter((s) => s === 'timeout').length;

      if (errorCount > 0 || timeoutCount > 0) {
        const parts = [];
        if (errorCount > 0) parts.push(`${errorCount} error`);
        if (timeoutCount > 0) parts.push(`${timeoutCount} timeout`);
        throw new Error(
          `Preview did not resolve cleanly (${parts.join(', ')})`,
        );
      }

      loadedSettingsSnapshot = captureCurrentSettingsSnapshot();
      showStatus('Configuration applied.', 'success');
    }

    // Show/hide controls depending on mode and zen
    const tooltipControls = document.getElementById('tooltipControls');
    const inlineControls = document.getElementById('inlineControls');
    const zenControls = document.getElementById('zenControls');

    function updateControlVisibility() {
      const mode = modeSel.value;
      if (tooltipControls)
        tooltipControls.style.display = mode === 'tooltip' ? '' : 'none';
      if (inlineControls)
        inlineControls.style.display = mode === 'inline' ? '' : 'none';
      if (zenControls) zenControls.style.display = zenChk.checked ? '' : 'none';
    }

    modeSel.addEventListener('change', updateControlVisibility);
    zenChk.addEventListener('change', updateControlVisibility);

    await loadScriptureChoices();
    refreshBibleOptions();
    refreshQuranOptions();
    refreshGitaOptions();

    bibleBook?.addEventListener('change', () => {
      refreshBibleOptions();
      recreatePreviewFromControls();
    });
    bibleChapter?.addEventListener('change', () => {
      refreshBibleOptions();
      recreatePreviewFromControls();
    });
    bibleVerse?.addEventListener('change', recreatePreviewFromControls);
    quranChapter?.addEventListener('change', () => {
      refreshQuranOptions();
      recreatePreviewFromControls();
    });
    quranVerse?.addEventListener('change', recreatePreviewFromControls);
    gitaChapter?.addEventListener('change', () => {
      refreshGitaOptions();
      recreatePreviewFromControls();
    });
    gitaVerse?.addEventListener('change', recreatePreviewFromControls);

    // Capture the visible defaults first so the initial Apply keeps them.
    // Important: do not override from the singleton's default config here,
    // because that default has loadDefaults disabled.
    loadedSettingsSnapshot = captureCurrentSettingsSnapshot();

    initZenEditor();

    // Ensure control visibility initial state
    updateControlVisibility();

    // Initial setup
    applyBtn.addEventListener('click', applyConfigFromUI);
    recreateBtn.addEventListener('click', () => {
      applySettingsSnapshot(loadedSettingsSnapshot);
      createSampleElements(modeSel.value, zenChk.checked);
      showStatus('Examples reset to loaded settings.', 'success');
    });

    // Apply initial config (load defaults + theme)
    try {
      await applyConfigFromUI();
      showStatus('Configuration loaded from library defaults.', 'success');
    } catch (err) {
      showStatus(`Failed to apply configuration: ${String(err)}`, 'error');
      throw err;
    }
  })
  .catch((err) => console.error('Failed to load scripture-cite bundle:', err));
