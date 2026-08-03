(function () {
  const STORAGE_KEY = 'keep-that-idea-panels-v1';
  const LEGACY_KEY = 'think-build-notes-content';
  const INTRO_KEY = 'keep-that-idea-seen-intro';
  const MAX_PANELS = 4;

  const panelsEl = document.getElementById('panels');
  const addPanelBtn = document.getElementById('addPanelBtn');
  const wordCountEl = document.getElementById('wordCount');
  const clearBtn = document.getElementById('clearBtn');
  const saveNotesBtn = document.getElementById('saveNotesBtn');

  const saveDialog = document.getElementById('saveDialog');
  const panelChecklist = document.getElementById('panelChecklist');
  const saveAsMdBtn = document.getElementById('saveAsMd');
  const saveAsHtmlBtn = document.getElementById('saveAsHtml');
  const cancelSaveBtn = document.getElementById('cancelSave');

  const introDialog = document.getElementById('introDialog');
  const closeIntroBtn = document.getElementById('closeIntro');

  let panels = [];
  let activePanelId = null;
  let isMobile = false;
  let idCounter = 1;

  function nextId() { return 'p' + (idCounter++); }

  function detectMobile() {
    return window.matchMedia('(max-width: 700px)').matches;
  }

  function loadPanels() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          idCounter = 1;
          panels = parsed.map(p => ({ id: nextId(), content: p.content || '' }));
          return;
        }
      } catch (e) { /* fall through */ }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    panels = [{ id: nextId(), content: legacy || '' }];
  }

  function savePanels() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panels.map(p => ({ content: p.content }))));
    } catch (e) { /* storage full or unavailable */ }
  }

  let saveTimeout;
  function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(savePanels, 200);
  }

  function visiblePanels() {
    return isMobile ? panels.slice(0, 1) : panels;
  }

  // Count real words — ignore markdown and most punctuation
  function countWords(text) {
    if (!text || !text.trim()) return 0;

    const cleaned = text
      // remove markdown headings
      .replace(/^#{1,6}\s+/gm, '')
      // remove bold / italic / code / strikethrough markers
      .replace(/(\*\*|__|\*|_|`+|~~)/g, '')
      // turn [text](url) into just text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // turn most remaining punctuation into spaces (keep apostrophes & hyphens)
      .replace(/[^\w\s'-]/g, ' ')
      // collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return 0;
    return cleaned.split(' ').filter(Boolean).length;
  }

  function updateWordCount() {
    const total = panels.reduce((sum, p) => sum + countWords(p.content), 0);
    if (total === 0) {
      wordCountEl.textContent = 'you’ve written 0 words so far';
    } else if (total === 1) {
      wordCountEl.textContent = 'you’ve written 1 word so far';
    } else {
      wordCountEl.textContent = 'you’ve written ' + total + ' words so far';
    }
  }

  function updateToolbarState() {
    if (isMobile) {
      addPanelBtn.disabled = true;
    } else {
      addPanelBtn.disabled = panels.length >= MAX_PANELS;
    }
    updateWordCount();
  }

  function renderPanels() {
    panelsEl.innerHTML = '';
    const shown = visiblePanels();
    shown.forEach((panel, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'panel' + (panel.id === activePanelId ? ' active' : '');
      wrap.dataset.id = panel.id;

      if (!isMobile && panels.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'panel-remove';
        removeBtn.type = 'button';
        removeBtn.title = 'Close this page';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => removePanel(panel.id));
        wrap.appendChild(removeBtn);
      }

      const textarea = document.createElement('textarea');
      textarea.className = 'notes';
      textarea.spellcheck = false;
      textarea.value = panel.content;

      const placeholders = [
        'Every breakthrough was once just an idea…',
        'Ideas get sharper the moment they land on the page…',
        'The best ones usually arrive when you’re not looking…',
        'Coming back to an old thought can change everything…'
      ];
      textarea.placeholder = placeholders[idx] || 'One more thought is one more thought closer…';

      textarea.addEventListener('input', () => {
        panel.content = textarea.value;
        debouncedSave();
        updateWordCount();
      });

      textarea.addEventListener('focus', () => {
        activePanelId = panel.id;
        panelsEl.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        wrap.classList.add('active');
      });

      wrap.appendChild(textarea);
      panelsEl.appendChild(wrap);
    });

    updateToolbarState();
  }

  function addPanel() {
    if (isMobile || panels.length >= MAX_PANELS) return;
    const panel = { id: nextId(), content: '' };
    panels.push(panel);
    activePanelId = panel.id;
    savePanels();
    renderPanels();
    const textareas = panelsEl.querySelectorAll('textarea.notes');
    if (textareas.length) textareas[textareas.length - 1].focus();
  }

  function removePanel(id) {
    if (panels.length <= 1) return;
    const idx = panels.findIndex(p => p.id === id);
    if (idx === -1) return;
    panels.splice(idx, 1);
    if (activePanelId === id) {
      activePanelId = panels[0].id;
    }
    savePanels();
    renderPanels();
  }

  function activePanel() {
    return panels.find(p => p.id === activePanelId) || panels[0];
  }

  // --- Clear ---
  clearBtn.addEventListener('click', () => {
    const panel = activePanel();
    if (!panel || panel.content.trim() === '') return;
    const confirmed = confirm('Clear this page? The words will be gone for good.');
    if (confirmed) {
      panel.content = '';
      savePanels();
      renderPanels();
    }
  });

  // --- Markdown -> HTML ---
  function markdownToHtml(md) {
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(md || '');
    }
    return simpleMarkdownToHtml(md || '');
  }

  function simpleMarkdownToHtml(md) {
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = escape(md).split('\n');
    let html = '';
    let inList = false;
    let inCode = false;
    for (let line of lines) {
      if (line.trim().startsWith('```')) {
        html += inCode ? '</pre>' : '<pre>';
        inCode = !inCode;
        continue;
      }
      if (inCode) { html += line + '\n'; continue; }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        if (inList) { html += '</ul>'; inList = false; }
        const level = heading[1].length;
        html += `<h${level}>${inline(heading[2])}</h${level}>`;
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>';
        continue;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim() === '') { html += ''; continue; }
      html += '<p>' + inline(line) + '</p>';
    }
    if (inList) html += '</ul>';
    return html;

    function inline(text) {
      return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    }
  }

  // --- Download helpers ---
  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function performDownload(format, selectedPanels) {
    if (!selectedPanels.length) return;
    if (format === 'md') {
      const content = selectedPanels.map(p => p.content || '').join('\n\n---\n\n');
      downloadFile(content, 'my-writing.md', 'text/markdown;charset=utf-8');
    } else {
      const body = selectedPanels
        .map(p => markdownToHtml(p.content || ''))
        .join('\n<hr class="section-divider">\n');
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>my writing</title>
<style>
  body {
    margin: 0;
    padding: 40px 24px;
    max-width: 760px;
    margin-inline: auto;
    background: #ffffff;
    color: #2e2e2c;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.6;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.5em; color: #1a1a1a; }
  h1 { font-size: 2em; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.2em; }
  p { margin: 0.8em 0; }
  ul, ol { margin: 0.8em 0; padding-left: 1.6em; }
  li { margin: 0.3em 0; }
  code { background: #f2f2f2; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f2f2f2; padding: 12px 14px; border-radius: 4px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0.8em 0; padding: 0.2em 1em; border-left: 3px solid #ddd; color: #444; }
  a { color: #0b5fff; }
  .section-divider { border: none; border-top: 1px solid #e0e0e0; margin: 2.5em 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
      downloadFile(html, 'my-writing.html', 'text/html;charset=utf-8');
    }
  }

  function openSaveDialog() {
    panelChecklist.innerHTML = '';
    if (panels.length > 1) {
      panels.forEach((panel, idx) => {
        const id = 'chk-' + panel.id;
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = true;
        input.id = id;
        input.dataset.id = panel.id;
        const span = document.createElement('span');
        span.textContent = 'page ' + (idx + 1) + (panel.content.trim() ? '' : ' (empty)');
        label.appendChild(input);
        label.appendChild(span);
        panelChecklist.appendChild(label);
      });
    }
    saveDialog.classList.add('visible');
  }

  function hideSaveDialog() { saveDialog.classList.remove('visible'); }

  function getSelectedPanels() {
    const boxes = panelChecklist.querySelectorAll('input[type="checkbox"]');
    if (!boxes.length) return panels.slice(0, 1);
    const ids = Array.from(boxes).filter(b => b.checked).map(b => b.dataset.id);
    return panels.filter(p => ids.includes(p.id));
  }

  saveNotesBtn.addEventListener('click', openSaveDialog);

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      openSaveDialog();
    }
    if (e.key === 'Escape') {
      if (introDialog.classList.contains('visible')) hideIntro();
      else hideSaveDialog();
    }
  });

  saveAsMdBtn.addEventListener('click', () => {
    performDownload('md', getSelectedPanels());
    hideSaveDialog();
  });
  saveAsHtmlBtn.addEventListener('click', () => {
    performDownload('html', getSelectedPanels());
    hideSaveDialog();
  });
  cancelSaveBtn.addEventListener('click', hideSaveDialog);
  saveDialog.addEventListener('click', e => { if (e.target === saveDialog) hideSaveDialog(); });

  addPanelBtn.addEventListener('click', addPanel);

  // --- Intro ---
  function showIntro() {
    introDialog.classList.add('visible');
  }

  function hideIntro() {
    introDialog.classList.remove('visible');
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch (e) { /* ignore */ }
  }

  function shouldShowIntro() {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch (e) {
      return true;
    }
  }

  closeIntroBtn.addEventListener('click', hideIntro);
  introDialog.addEventListener('click', e => {
    if (e.target === introDialog) hideIntro();
  });

    // Re-open intro anytime
  const aboutBtn = document.getElementById('aboutBtn');
  aboutBtn.addEventListener('click', e => {
    e.preventDefault();
    showIntro();
  });

  // --- Responsive ---
  function applyResponsiveMode() {
    const nowMobile = detectMobile();
    if (nowMobile !== isMobile) {
      isMobile = nowMobile;
      renderPanels();
    }
  }
  window.addEventListener('resize', applyResponsiveMode);

  // --- Init ---
  isMobile = detectMobile();
  loadPanels();
  activePanelId = panels[0].id;
  renderPanels();
  const firstTextarea = panelsEl.querySelector('textarea.notes');
  if (firstTextarea) firstTextarea.focus();

  if (shouldShowIntro()) {
    setTimeout(showIntro, 80);
  }
})();