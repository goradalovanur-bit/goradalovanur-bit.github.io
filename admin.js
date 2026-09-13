/* =========================================================================
   Digital Garden — Admin Workflow
   Local editing of items + GitHub REST API commit workflow.
   ========================================================================= */

(function () {
  'use strict';

  var LS_SETTINGS = 'dg-admin-settings';
  var LS_THEME = 'dg-theme';

  var GH_API = 'https://api.github.com';

  var state = {
    settings: loadSettings(),
    items: [],
    dataSha: null,          // blob sha of data.json on GitHub, needed to update it
    editingId: null,        // id of item currently open in the editor, or null for "new"
    tags: [],                // tags currently in the tag-input for the open editor
    pendingPdf: null,        // { fileName, base64, mime } queued for upload on commit
    dirty: false,            // true once local items diverge from last-loaded remote state
    isConnected: false
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    initTheme();
    bindNav();
    bindSettingsForm();
    bindItemForm();
    bindPdfDrop();
    bindTagInput();
    bindCommitBar();

    populateSettingsForm();
    await loadInitialData();
  }

  function cacheEls() {
    els.navBtns = document.querySelectorAll('.admin-nav-btn');
    els.views = document.querySelectorAll('.admin-view');
    els.itemRows = document.getElementById('itemRows');
    els.newItemBtn = document.getElementById('newItemBtn');
    els.refreshItemsBtn = document.getElementById('refreshItemsBtn');

    els.itemForm = document.getElementById('itemForm');
    els.editorHeading = document.getElementById('editorHeading');
    els.fId = document.getElementById('f-id');
    els.fType = document.getElementById('f-type');
    els.fTitle = document.getElementById('f-title');
    els.fDesc = document.getElementById('f-desc');
    els.fYoutubeUrl = document.getElementById('f-youtube-url');
    els.fPdfUrl = document.getElementById('f-pdf-url');
    els.fLatex = document.getElementById('f-latex');
    els.fLinkUrl = document.getElementById('f-link-url');
    els.fLinkLabel = document.getElementById('f-link-label');
    els.fSourceUrl = document.getElementById('f-source-url');
    els.fSourceLabel = document.getElementById('f-source-label');
    els.fDate = document.getElementById('f-date');
    els.fTagsInput = document.getElementById('f-tags-input');
    els.tagInputRow = document.getElementById('tagInputRow');
    els.latexPreview = document.getElementById('latexPreview');
    els.cancelEditBtn = document.getElementById('cancelEditBtn');

    els.pdfDrop = document.getElementById('pdfDrop');
    els.pdfFileInput = document.getElementById('pdfFileInput');
    els.pdfFileName = document.getElementById('pdfFileName');
    els.pdfAssetPathHint = document.getElementById('pdfAssetPathHint');

    els.settingsForm = document.getElementById('settingsForm');
    els.sToken = document.getElementById('s-token');
    els.sOwner = document.getElementById('s-owner');
    els.sRepo = document.getElementById('s-repo');
    els.sBranch = document.getElementById('s-branch');
    els.sDatapath = document.getElementById('s-datapath');
    els.sAssetpath = document.getElementById('s-assetpath');
    els.togglePw = document.getElementById('togglePw');
    els.clearTokenBtn = document.getElementById('clearTokenBtn');

    els.connStatus = document.getElementById('connStatus');
    els.connStatusText = document.getElementById('connStatusText');

    els.commitBar = document.getElementById('commitBar');
    els.commitBarText = document.getElementById('commitBarText');
    els.commitBtn = document.getElementById('commitBtn');
    els.copyPayloadBtn = document.getElementById('copyPayloadBtn');

    els.toastStack = document.getElementById('toastStack');
  }

  /* ---------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------- */

  function initTheme() {
    var toggle = document.getElementById('themeToggle');
    var stored = localStorage.getItem(LS_THEME);
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(stored || (prefersDark ? 'dark' : 'light'));
    toggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(LS_THEME, next);
    });
  }

  function applyTheme(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  /* ---------------------------------------------------------------------
     Settings (persisted in localStorage)
     ------------------------------------------------------------------- */

  function loadSettings() {
    var defaults = { token: '', owner: '', repo: '', branch: 'main', dataPath: 'data.json', assetPath: 'assets/pdf/' };
    try {
      var raw = localStorage.getItem(LS_SETTINGS);
      if (!raw) return defaults;
      return Object.assign(defaults, JSON.parse(raw));
    } catch (e) {
      return defaults;
    }
  }

  function saveSettings(s) {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
  }

  function populateSettingsForm() {
    els.sToken.value = state.settings.token || '';
    els.sOwner.value = state.settings.owner || '';
    els.sRepo.value = state.settings.repo || '';
    els.sBranch.value = state.settings.branch || 'main';
    els.sDatapath.value = state.settings.dataPath || 'data.json';
    els.sAssetpath.value = state.settings.assetPath || 'assets/pdf/';
    els.pdfAssetPathHint.textContent = state.settings.assetPath || 'assets/pdf/';
  }

  function bindSettingsForm() {
    els.settingsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      state.settings = {
        token: els.sToken.value.trim(),
        owner: els.sOwner.value.trim(),
        repo: els.sRepo.value.trim(),
        branch: els.sBranch.value.trim() || 'main',
        dataPath: els.sDatapath.value.trim() || 'data.json',
        assetPath: normalizeFolder(els.sAssetpath.value.trim() || 'assets/pdf/')
      };
      saveSettings(state.settings);
      els.pdfAssetPathHint.textContent = state.settings.assetPath;
      toast('info', 'Testing connection…', 'Checking token and repository access.');
      await testConnection();
      if (state.isConnected) await loadInitialData(true);
    });

    els.togglePw.addEventListener('click', function () {
      var isPw = els.sToken.type === 'password';
      els.sToken.type = isPw ? 'text' : 'password';
    });

    els.clearTokenBtn.addEventListener('click', function () {
      state.settings.token = '';
      els.sToken.value = '';
      saveSettings(state.settings);
      setConnStatus('idle', 'Not connected');
      toast('info', 'Token cleared', 'You can still edit locally and copy the JSON payload.');
    });
  }

  function normalizeFolder(p) {
    p = p.replace(/^\/+/, '');
    if (p && !p.endsWith('/')) p += '/';
    return p;
  }

  function hasCredentials() {
    var s = state.settings;
    return !!(s.token && s.owner && s.repo);
  }

  /* ---------------------------------------------------------------------
     GitHub REST API helpers (Contents API)
     ------------------------------------------------------------------- */

  function ghHeaders() {
    return {
      Authorization: 'Bearer ' + state.settings.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function ghContentsUrl(path) {
    var s = state.settings;
    return GH_API + '/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo) +
      '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(s.branch);
  }

  async function ghGetFile(path) {
    var res = await fetch(ghContentsUrl(path), { headers: ghHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await ghErrorMessage(res));
    var json = await res.json();
    var content = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
    return { content: content, sha: json.sha };
  }

  async function ghGetFileRaw(path) {
    // For binary/base64-agnostic existence checks (e.g. PDFs) — returns sha only if present.
    var res = await fetch(ghContentsUrl(path), { headers: ghHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await ghErrorMessage(res));
    var json = await res.json();
    return { sha: json.sha };
  }

  async function ghPutFile(path, base64Content, message, sha) {
    var s = state.settings;
    var url = GH_API + '/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo) +
      '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    var body = { message: message, content: base64Content, branch: s.branch };
    if (sha) body.sha = sha;
    var res = await fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await ghErrorMessage(res));
    return res.json();
  }

  async function ghErrorMessage(res) {
    try {
      var j = await res.json();
      return (j && j.message) ? (res.status + ': ' + j.message) : ('HTTP ' + res.status);
    } catch (e) {
      return 'HTTP ' + res.status;
    }
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function testConnection() {
    if (!hasCredentials()) {
      setConnStatus('idle', 'Not connected');
      state.isConnected = false;
      return false;
    }
    try {
      var s = state.settings;
      var res = await fetch(GH_API + '/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo), { headers: ghHeaders() });
      if (!res.ok) throw new Error(await ghErrorMessage(res));
      var repo = await res.json();
      var canPush = repo.permissions && (repo.permissions.push || repo.permissions.admin);
      if (!canPush) {
        setConnStatus('error', 'Connected, but no write access');
        toast('error', 'Limited access', 'This token can read the repo but may not be able to push commits.');
        state.isConnected = false;
        return false;
      }
      setConnStatus('connected', 'Connected to ' + s.owner + '/' + s.repo);
      toast('success', 'Connected', 'Token verified with write access to ' + s.owner + '/' + s.repo + '.');
      state.isConnected = true;
      return true;
    } catch (err) {
      setConnStatus('error', 'Connection failed');
      toast('error', 'Could not connect', err.message);
      state.isConnected = false;
      return false;
    }
  }

  function setConnStatus(kind, text) {
    els.connStatus.classList.remove('is-connected', 'is-error');
    if (kind === 'connected') els.connStatus.classList.add('is-connected');
    if (kind === 'error') els.connStatus.classList.add('is-error');
    els.connStatusText.textContent = text;
  }

  /* ---------------------------------------------------------------------
     Loading data (GitHub if connected, else local data.json for preview)
     ------------------------------------------------------------------- */

  async function loadInitialData(forceRemote) {
    if (hasCredentials()) {
      var ok = await testConnection();
      if (ok || forceRemote) {
        try {
          var file = await ghGetFile(state.settings.dataPath);
          if (file) {
            var parsed = JSON.parse(file.content);
            state.items = normalizeItems(parsed.items || []);
            state.dataSha = file.sha;
            state.dirty = false;
            updateCommitBar();
            renderItems();
            toast('success', 'Content loaded', 'Loaded ' + state.items.length + ' items from GitHub.');
            return;
          } else {
            toast('info', 'No data.json found', 'Starting from an empty list — it will be created on first commit.');
            state.items = [];
            state.dataSha = null;
            renderItems();
            return;
          }
        } catch (err) {
          toast('error', 'Could not load data.json', err.message);
        }
      }
    }
    // Fallback: local file preview only, no push target.
    try {
      var res = await fetch('data.json', { cache: 'no-store' });
      if (res.ok) {
        var data = await res.json();
        state.items = normalizeItems(data.items || []);
        renderItems();
        toast('info', 'Read-only preview', 'Loaded local data.json for preview. Connect GitHub Settings to enable commits.');
      }
    } catch (e) { /* no local file available either — start empty */ }
  }

  function normalizeItems(rawItems) {
    return rawItems.map(function (item) {
      return {
        id: item.id || genId(),
        type: item.type || 'link',
        title: item.title || '',
        description: item.description || '',
        url: item.url || '',
        content: item.content || '',
        date: item.date || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        meta: item.meta || {}
      };
    });
  }

  function genId() {
    return 'itm_' + Math.random().toString(36).slice(2, 9);
  }

  /* ---------------------------------------------------------------------
     Nav: switching between Items / Editor / Settings views
     ------------------------------------------------------------------- */

  function bindNav() {
    els.navBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { switchView(btn.dataset.view); });
    });
    els.newItemBtn.addEventListener('click', function () { openEditor(null); });
    els.refreshItemsBtn.addEventListener('click', function () { loadInitialData(true); });
    els.cancelEditBtn.addEventListener('click', function () { switchView('items'); });
  }

  function switchView(view) {
    els.navBtns.forEach(function (b) { b.classList.toggle('is-active', b.dataset.view === view); });
    els.views.forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === view); });
  }

  /* ---------------------------------------------------------------------
     Item list rendering
     ------------------------------------------------------------------- */

  var TYPE_LABEL = { youtube: 'Video', pdf: 'PDF', latex: 'LaTeX', link: 'Link' };

  function renderItems() {
    els.itemRows.innerHTML = '';
    if (!state.items.length) {
      var empty = document.createElement('div');
      empty.className = 'item-row';
      empty.innerHTML = '<div class="mono" style="grid-column:1/-1;color:var(--ink-faint);">No items yet — add your first one.</div>';
      els.itemRows.appendChild(empty);
      return;
    }
    state.items
      .slice()
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })
      .forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div><span class="tag type-' + item.type + '">' + (TYPE_LABEL[item.type] || item.type) + '</span></div>' +
          '<div><div class="it-title">' + escapeHtml(item.title) + '</div><div class="it-desc">' + escapeHtml(item.description || '') + '</div></div>' +
          '<div class="mono" style="font-size:0.82rem; color:var(--ink-faint);">' + (item.date || '—') + '</div>' +
          '<div class="it-actions">' +
          '<button class="icon-btn" data-action="edit" data-id="' + item.id + '" aria-label="Edit"><svg aria-hidden="true"><use href="#i-edit"/></svg></button>' +
          '<button class="icon-btn danger" data-action="delete" data-id="' + item.id + '" aria-label="Delete"><svg aria-hidden="true"><use href="#i-trash"/></svg></button>' +
          '</div>';
        els.itemRows.appendChild(row);
      });

    els.itemRows.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditor(btn.dataset.id); });
    });
    els.itemRows.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteItem(btn.dataset.id); });
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function deleteItem(id) {
    var item = state.items.find(function (i) { return i.id === id; });
    if (!item) return;
    if (!confirm('Delete "' + item.title + '"? This cannot be undone once committed.')) return;
    state.items = state.items.filter(function (i) { return i.id !== id; });
    state.dirty = true;
    renderItems();
    updateCommitBar();
    toast('info', 'Item removed', '"' + item.title + '" will be deleted once you commit.');
  }

  /* ---------------------------------------------------------------------
     Editor form
     ------------------------------------------------------------------- */

  function bindItemForm() {
    els.fType.addEventListener('change', function () {
      updateTypeFields(els.fType.value);
      if (els.fType.value === 'latex') renderLatexLive();
    });
    els.fLatex.addEventListener('input', renderLatexLive);

    els.itemForm.addEventListener('submit', function (e) {
      e.preventDefault();
      saveItemFromForm();
    });

    updateTypeFields('youtube');
  }

  function updateTypeFields(type) {
    document.querySelectorAll('.type-fields').forEach(function (group) {
      group.classList.toggle('is-active', group.dataset.typeFields === type);
    });
  }

  function renderLatexLive() {
    var src = els.fLatex.value.trim();
    if (!src) {
      els.latexPreview.innerHTML = '<span class="ph">Live preview appears here</span>';
      return;
    }
    if (!window.katex) {
      els.latexPreview.innerHTML = '<span class="ph">Loading renderer…</span>';
      return;
    }
    try {
      katex.render(src, els.latexPreview, { throwOnError: false, displayMode: true });
    } catch (e) {
      els.latexPreview.innerHTML = '<span class="ph">Could not render — check LaTeX syntax</span>';
    }
  }

  function openEditor(id) {
    state.editingId = id;
    state.pendingPdf = null;
    els.pdfFileName.textContent = '';
    els.pdfFileInput.value = '';

    if (id) {
      var item = state.items.find(function (i) { return i.id === id; });
      if (!item) return;
      els.editorHeading.textContent = 'Edit Item';
      els.fId.value = item.id;
      els.fType.value = item.type;
      els.fTitle.value = item.title;
      els.fDesc.value = item.description;
      els.fDate.value = item.date;
      els.fYoutubeUrl.value = item.type === 'youtube' ? item.url : '';
      els.fPdfUrl.value = item.type === 'pdf' ? item.url : '';
      els.fLatex.value = item.type === 'latex' ? item.content : '';
      els.fLinkUrl.value = item.type === 'link' ? item.url : '';
      els.fLinkLabel.value = item.meta.linkLabel || '';
      els.fSourceUrl.value = item.meta.sourceUrl || '';
      els.fSourceLabel.value = item.meta.sourceLabel || '';
      state.tags = item.tags.slice();
    } else {
      els.editorHeading.textContent = 'Add New Item';
      els.itemForm.reset();
      els.fId.value = '';
      els.fType.value = 'youtube';
      els.fDate.value = new Date().toISOString().slice(0, 10);
      state.tags = [];
    }

    updateTypeFields(els.fType.value);
    renderLatexLive();
    renderTagChips();
    switchView('editor');
  }

  function saveItemFromForm() {
    var type = els.fType.value;
    var title = els.fTitle.value.trim();
    if (!title) { toast('error', 'Title required', 'Give this item a title before saving.'); return; }

    var url = '', content = '', meta = {};

    if (type === 'youtube') {
      url = els.fYoutubeUrl.value.trim();
      if (!url) { toast('error', 'YouTube URL required', 'Paste a video link.'); return; }
    } else if (type === 'pdf') {
      url = els.fPdfUrl.value.trim();
      if (state.pendingPdf) {
        url = normalizeFolder(state.settings.assetPath) + state.pendingPdf.fileName;
        els.fPdfUrl.value = url;
      }
      if (!url) { toast('error', 'PDF required', 'Upload a file or enter an existing path.'); return; }
    } else if (type === 'latex') {
      content = els.fLatex.value.trim();
      if (!content) { toast('error', 'LaTeX source required', 'Enter the formula to render.'); return; }
    } else if (type === 'link') {
      url = els.fLinkUrl.value.trim();
      if (!url) { toast('error', 'Link URL required', 'Paste the destination URL.'); return; }
      meta.linkLabel = els.fLinkLabel.value.trim();
    }

    if (els.fSourceUrl.value.trim()) {
      meta.sourceUrl = els.fSourceUrl.value.trim();
      meta.sourceLabel = els.fSourceLabel.value.trim() || 'Source';
    }

    var item = {
      id: els.fId.value || genId(),
      type: type,
      title: title,
      description: els.fDesc.value.trim(),
      url: url,
      content: content,
      date: els.fDate.value || new Date().toISOString().slice(0, 10),
      tags: state.tags.slice(),
      meta: meta
    };

    var existingIdx = state.items.findIndex(function (i) { return i.id === item.id; });
    if (existingIdx >= 0) state.items[existingIdx] = item;
    else state.items.push(item);

    state.dirty = true;
    renderItems();
    updateCommitBar();
    toast('success', existingIdx >= 0 ? 'Item updated' : 'Item added', '"' + title + '" will be included in the next commit.');
    switchView('items');
  }

  /* ---------------------------------------------------------------------
     Tags
     ------------------------------------------------------------------- */

  function bindTagInput() {
    els.fTagsInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var val = els.fTagsInput.value.trim().replace(/,$/, '');
        if (val && state.tags.indexOf(val) === -1) {
          state.tags.push(val);
          renderTagChips();
        }
        els.fTagsInput.value = '';
      } else if (e.key === 'Backspace' && !els.fTagsInput.value && state.tags.length) {
        state.tags.pop();
        renderTagChips();
      }
    });
  }

  function renderTagChips() {
    els.tagInputRow.querySelectorAll('.tag-chip').forEach(function (chip) { chip.remove(); });
    state.tags.forEach(function (tag) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = escapeHtml(tag) + '<button type="button" aria-label="Remove tag"><svg aria-hidden="true"><use href="#i-close"/></svg></button>';
      chip.querySelector('button').addEventListener('click', function () {
        state.tags = state.tags.filter(function (t) { return t !== tag; });
        renderTagChips();
      });
      els.tagInputRow.insertBefore(chip, els.fTagsInput);
    });
  }

  /* ---------------------------------------------------------------------
     PDF upload (drag/drop + click), staged for commit
     ------------------------------------------------------------------- */

  function bindPdfDrop() {
    els.pdfDrop.addEventListener('click', function () { els.pdfFileInput.click(); });
    els.pdfDrop.addEventListener('dragover', function (e) { e.preventDefault(); els.pdfDrop.classList.add('is-drag'); });
    els.pdfDrop.addEventListener('dragleave', function () { els.pdfDrop.classList.remove('is-drag'); });
    els.pdfDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.pdfDrop.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0]);
    });
    els.pdfFileInput.addEventListener('change', function () {
      if (els.pdfFileInput.files[0]) handlePdfFile(els.pdfFileInput.files[0]);
    });
  }

  function handlePdfFile(file) {
    if (file.type !== 'application/pdf') {
      toast('error', 'Not a PDF', 'Please choose a .pdf file.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      state.pendingPdf = { fileName: sanitizeFileName(file.name), base64: base64 };
      els.pdfFileName.textContent = state.pendingPdf.fileName + ' — ' + Math.round(file.size / 1024) + ' KB (staged)';
      els.fPdfUrl.value = normalizeFolder(state.settings.assetPath) + state.pendingPdf.fileName;
    };
    reader.readAsDataURL(file);
  }

  function sanitizeFileName(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-');
  }

  /* ---------------------------------------------------------------------
     Commit bar + commit workflow
     ------------------------------------------------------------------- */

  function bindCommitBar() {
    els.commitBtn.addEventListener('click', commitToGitHub);
    els.copyPayloadBtn.addEventListener('click', copyJsonPayload);
  }

  function updateCommitBar() {
    els.commitBar.style.display = state.dirty ? 'flex' : 'none';
    els.commitBarText.textContent = state.dirty
      ? 'You have unsaved local changes (' + state.items.length + ' items).'
      : '';
  }

  function buildPayload() {
    return {
      meta: {
        schemaVersion: '1.0.0',
        siteTitle: 'Anur Qoradalov — Digital Garden',
        updatedAt: new Date().toISOString()
      },
      items: state.items
    };
  }

  function copyJsonPayload() {
    var json = JSON.stringify(buildPayload(), null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json)
        .then(function () { toast('success', 'Copied', 'data.json payload copied to your clipboard.'); })
        .catch(function () { fallbackCopy(json); });
    } else {
      fallbackCopy(json);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('success', 'Copied', 'data.json payload copied to your clipboard.'); }
    catch (e) { toast('error', 'Copy failed', 'Select and copy the JSON manually.'); }
    document.body.removeChild(ta);
  }

  async function commitToGitHub() {
    if (!hasCredentials()) {
      toast('error', 'Not connected', 'Add a GitHub token and repository in Settings first, or use Copy JSON as a fallback.');
      switchView('settings');
      return;
    }

    els.commitBtn.disabled = true;
    var originalLabel = els.commitBtn.innerHTML;
    els.commitBtn.innerHTML = '<span class="spinner"></span> Committing…';

    try {
      if (state.pendingPdf) {
        toast('info', 'Uploading PDF…', state.pendingPdf.fileName);
        var assetPath = normalizeFolder(state.settings.assetPath) + state.pendingPdf.fileName;
        var existing = await ghGetFileRaw(assetPath).catch(function () { return null; });
        await ghPutFile(
          assetPath,
          state.pendingPdf.base64,
          'Add asset: ' + state.pendingPdf.fileName,
          existing ? existing.sha : undefined
        );
        toast('success', 'PDF uploaded', assetPath);
        state.pendingPdf = null;
      }

      var payload = buildPayload();
      var contentBase64 = utf8ToBase64(JSON.stringify(payload, null, 2));
      var result = await ghPutFile(
        state.settings.dataPath,
        contentBase64,
        'Update content: ' + payload.items.length + ' items',
        state.dataSha || undefined
      );

      state.dataSha = result.content ? result.content.sha : null;
      state.dirty = false;
      updateCommitBar();
      toast('success', 'Committed', 'data.json updated on ' + state.settings.branch + '. GitHub Pages will redeploy shortly.');
    } catch (err) {
      toast('error', 'Commit failed', err.message);
    } finally {
      els.commitBtn.disabled = false;
      els.commitBtn.innerHTML = originalLabel;
    }
  }

  /* ---------------------------------------------------------------------
     Toasts
     ------------------------------------------------------------------- */

  var ICONS = { success: '#i-check', error: '#i-alert', info: '#i-info' };

  function toast(kind, title, message) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.innerHTML =
      '<svg aria-hidden="true"><use href="' + (ICONS[kind] || ICONS.info) + '"/></svg>' +
      '<span class="toast-msg"><strong>' + escapeHtml(title) + '</strong>' + (message ? escapeHtml(message) : '') + '</span>' +
      '<button class="toast-close" aria-label="Dismiss"><svg aria-hidden="true"><use href="#i-close"/></svg></button>';
    el.querySelector('.toast-close').addEventListener('click', function () { el.remove(); });
    els.toastStack.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 6000);
  }

})();
