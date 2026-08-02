(function () {
  const STORAGE_KEY = 'keep-that-idea-panels-v1';
  const LEGACY_KEY = 'think-build-notes-content';
  const MAX_PANELS = 4;

  const panelsEl = document.getElementById('panels');
  const addPanelBtn = document.getElementById('addPanelBtn');
  const panelCountEl = document.getElementById('panelCount');
  const clearBtn = document.getElementById('clearBtn');
  const saveNotesBtn = document.getElementById('saveNotesBtn');
  const datetimeEl = document.getElementById('datetime');

  const saveDialog = document.getElementById('saveDialog');
  const panelChecklist = document.getElementById('panelChecklist');
  const saveAsMdBtn = document.getElementById('saveAsMd');
  const saveAsHtmlBtn = document.getElementById('saveAsHtml');
  const cancelSaveBtn = document.getElementById('cancelSave');

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
    // migrate legacy single-note storage if present
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

  function updateToolbarState() {
    const count = panels.length;
    if (isMobile) {
      addPanelBtn.disabled = true;
      panelCountEl.textContent = '1 panel (mobile)';
    } else {
      addPanelBtn.disabled = count >= MAX_PANELS;
      panelCountEl.textContent = count + ' / ' + MAX_PANELS + ' panels';
    }
  }

  function renderPanels() {
    panelsEl.innerHTML = '';
    const shown = visiblePanels();
    shown.forEach((panel, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'panel' + (panel.id === activePanelId ? ' active' : '');
      wrap.dataset.id = panel.id;

      const head = document.createElement('div');
      head.className = 'panel-head';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = 'panel ' + (idx + 1);
      head.appendChild(label);

      if (!isMobile && panels.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'panel-remove';
        removeBtn.type = 'button';
        removeBtn.title = 'Remove this panel';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => removePanel(panel.id));
        head.appendChild(removeBtn);
      }

      wrap.appendChild(head);

      const textarea = document.createElement('textarea');
      textarea.className = 'notes';
      textarea.spellcheck = false;
      textarea.value = panel.content;
      const placeholders = [
        '# Every breakthrough\n\nwas once just an idea.',
        '# Ideas get sharper\n\nthe moment they land on the page.',
        '# The best ideas\n\ncome unexpected.',
        '# Coming back to an old idea\n\ncan change everything.'
      ];
      textarea.placeholder = placeholders[idx] || '# One more thought\n\nis one more thought closer.';

      textarea.addEventListener('input', () => {
        panel.content = textarea.value;
        debouncedSave();
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
    const idx = panels.indexOf(panel) + 1;
    const confirmed = confirm('Clear panel ' + idx + '? This cannot be undone.');
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

  // Minimal fallback converter, used only if the CDN parser fails to load.
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
      downloadFile(content, 'notes.md', 'text/markdown;charset=utf-8');
    } else {
      const body = selectedPanels
        .map(p => markdownToHtml(p.content || ''))
        .join('\n<hr class="section-divider">\n');
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>notes</title>
<style>
  body {
    margin: 0;
    padding: 40px 24px;
    max-width: 760px;
    margin-inline: auto;
    background: #ffffff;
    color: #111111;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.6;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.5em; color: #0a0a0a; }
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
      downloadFile(html, 'notes.html', 'text/html;charset=utf-8');
    }
  }

  saveNotesBtn.addEventListener('click', () => {
    openSaveDialog();
  });

  // --- Save dialog ---
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
        span.textContent = 'panel ' + (idx + 1) + (panel.content.trim() ? '' : ' (empty)');
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

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideSaveDialog();
  });

  addPanelBtn.addEventListener('click', addPanel);

  // --- Responsive mode switching ---
  function applyResponsiveMode() {
    const nowMobile = detectMobile();
    if (nowMobile !== isMobile) {
      isMobile = nowMobile;
      renderPanels();
    }
  }
  window.addEventListener('resize', applyResponsiveMode);

  // --- Clock ---
  function updateDateTime() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const tz = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    datetimeEl.innerHTML = `${yyyy}-${mm}-${dd} <span class="time">${hh}:${mi}:${ss}</span> ${tz}`;
  }
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // --- Init ---
  isMobile = detectMobile();
  loadPanels();
  activePanelId = panels[0].id;
  renderPanels();
  const firstTextarea = panelsEl.querySelector('textarea.notes');
  if (firstTextarea) firstTextarea.focus();
})();