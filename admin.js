/* =========================================================================
   Anur Qoradalov — Admin Workflow (5 content types)
   Local editing + GitHub REST API commit workflow.
   ========================================================================= */

(function () {
  'use strict';

  var LS_SETTINGS = 'dg-admin-settings';
  var LS_THEME = 'dg-theme';
  var GH_API = 'https://api.github.com';

  // Maps the editor's "content type" value to the data.json array it lives in.
  var TYPE_TO_ARRAY = { problem: 'problems', story: 'stories', code: 'code_animations', youtube: 'youtube', pdf: 'pdf' };
  var TYPE_LABEL = { problem: 'Problem', story: 'Insight', code: 'Code', youtube: 'YouTube', pdf: 'PDF' };

  var state = {
    settings: loadSettings(),
    raw: { problems: [], stories: [], code_animations: [], youtube: [], pdf: [] },
    dataSha: null,
    editingId: null,
    editingType: null,
    tags: [],
    pendingPdf: null,
    dirty: false,
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
    els.fSourceType = document.getElementById('f-sourcetype');
    els.fType = document.getElementById('f-type');
    els.fTitle = document.getElementById('f-title');
    els.fDate = document.getElementById('f-date');
    els.fTagsInput = document.getElementById('f-tags-input');
    els.tagInputRow = document.getElementById('tagInputRow');
    els.cancelEditBtn = document.getElementById('cancelEditBtn');

    // problem
    els.fCourseProblem = document.getElementById('f-course-problem');
    els.fQuestion = document.getElementById('f-question');
    els.fSolution = document.getElementById('f-solution');
    els.questionPreview = document.getElementById('questionPreview');
    els.solutionPreview = document.getElementById('solutionPreview');

    // story
    els.fContent = document.getElementById('f-content');
    els.contentPreview = document.getElementById('contentPreview');
    els.fImage = document.getElementById('f-image');

    // code
    els.fLanguage = document.getElementById('f-language');
    els.fCodeSnippet = document.getElementById('f-code-snippet');
    els.fAnimationUrl = document.getElementById('f-animation-url');
    els.fGithubUrl = document.getElementById('f-github-url');

    // youtube
    els.fVideoUrl = document.getElementById('f-video-url');
    els.fYtDesc = document.getElementById('f-yt-desc');

    // pdf
    els.pdfDrop = document.getElementById('pdfDrop');
    els.pdfFileInput = document.getElementById('pdfFileInput');
    els.pdfFileName = document.getElementById('pdfFileName');
    els.pdfAssetPathHint = document.getElementById('pdfAssetPathHint');
    els.fPdfUrl = document.getElementById('f-pdf-url');
    els.fPdfThumb = document.getElementById('f-pdf-thumb');
    els.fCoursePdf = document.getElementById('f-course-pdf');

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
     Settings
     ------------------------------------------------------------------- */

  function loadSettings() {
    var defaults = { token: '', owner: '', repo: '', branch: 'main', dataPath: 'data.json', assetPath: 'assets/pdf/' };
    try {
      var raw = localStorage.getItem(LS_SETTINGS);
      if (!raw) return defaults;
      return Object.assign(defaults, JSON.parse(raw));
    } catch (e) { return defaults; }
  }

  function saveSettings(s) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }

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
     GitHub REST API helpers
     ------------------------------------------------------------------- */

  function ghHeaders() {
    return { Authorization: 'Bearer ' + state.settings.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
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
    } catch (e) { return 'HTTP ' + res.status; }
  }

  function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

  async function testConnection() {
    if (!hasCredentials()) { setConnStatus('idle', 'Not connected'); state.isConnected = false; return false; }
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
     Loading data
     ------------------------------------------------------------------- */

  async function loadInitialData(forceRemote) {
    if (hasCredentials()) {
      var ok = await testConnection();
      if (ok || forceRemote) {
        try {
          var file = await ghGetFile(state.settings.dataPath);
          if (file) {
            var parsed = JSON.parse(file.content);
            applyRaw(parsed);
            state.dataSha = file.sha;
            state.dirty = false;
            updateCommitBar();
            renderItems();
            toast('success', 'Content loaded', 'Loaded content from GitHub.');
            return;
          } else {
            toast('info', 'No data.json found', 'Starting from an empty set — it will be created on first commit.');
            applyRaw({});
            state.dataSha = null;
            renderItems();
            return;
          }
        } catch (err) {
          toast('error', 'Could not load data.json', err.message);
        }
      }
    }
    try {
      var res = await fetch('data.json', { cache: 'no-store' });
      if (res.ok) {
        var data = await res.json();
        applyRaw(data);
        renderItems();
        toast('info', 'Read-only preview', 'Loaded local data.json for preview. Connect GitHub Settings to enable commits.');
      }
    } catch (e) { /* start empty */ }
  }

  function applyRaw(data) {
    state.raw = {
      problems: normalizeArr(data.problems),
      stories: normalizeArr(data.stories),
      code_animations: normalizeArr(data.code_animations),
      youtube: normalizeArr(data.youtube),
      pdf: normalizeArr(data.pdf)
    };
  }

  function normalizeArr(arr) { return Array.isArray(arr) ? arr : []; }

  function genId() { return 'itm_' + Math.random().toString(36).slice(2, 9); }

  /* ---------------------------------------------------------------------
     Nav
     ------------------------------------------------------------------- */

  function bindNav() {
    els.navBtns.forEach(function (btn) { btn.addEventListener('click', function () { switchView(btn.dataset.view); }); });
    els.newItemBtn.addEventListener('click', function () { openEditor(null, null); });
    els.refreshItemsBtn.addEventListener('click', function () { loadInitialData(true); });
    els.cancelEditBtn.addEventListener('click', function () { switchView('items'); });
  }

  function switchView(view) {
    els.navBtns.forEach(function (b) { b.classList.toggle('is-active', b.dataset.view === view); });
    document.querySelectorAll('.admin-view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === view); });
  }

  /* ---------------------------------------------------------------------
     Unified item list (for the table)
     ------------------------------------------------------------------- */

  function buildUnifiedList() {
    var out = [];
    state.raw.problems.forEach(function (p) { out.push({ sourceType: 'problem', id: p.id, title: p.title, date: p.date, raw: p }); });
    state.raw.stories.forEach(function (s) { out.push({ sourceType: 'story', id: s.id, title: s.title, date: s.date, raw: s }); });
    state.raw.code_animations.forEach(function (c) { out.push({ sourceType: 'code', id: c.id, title: c.title, date: c.date, raw: c }); });
    state.raw.youtube.forEach(function (y) { out.push({ sourceType: 'youtube', id: y.id, title: y.title, date: y.date, raw: y }); });
    state.raw.pdf.forEach(function (d) { out.push({ sourceType: 'pdf', id: d.id, title: d.title, date: d.date, raw: d }); });
    return out;
  }

  function renderItems() {
    var list = buildUnifiedList().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    els.itemRows.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'item-row';
      empty.innerHTML = '<div class="mono" style="grid-column:1/-1;color:var(--ink-faint);">No items yet — add your first one.</div>';
      els.itemRows.appendChild(empty);
      return;
    }
    list.forEach(function (item) {
      var desc = item.raw.description || item.raw.content || item.raw.course || item.raw.language || '';
      var row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML =
        '<div><span class="tag t-' + item.sourceType + '">' + TYPE_LABEL[item.sourceType] + '</span></div>' +
        '<div><div class="it-title">' + escapeHtml(item.title) + '</div><div class="it-desc">' + escapeHtml(stripLatex(desc)) + '</div></div>' +
        '<div class="mono" style="font-size:0.8rem; color:var(--ink-faint);">' + (item.date || '—') + '</div>' +
        '<div class="it-actions">' +
        '<button class="icon-btn" data-action="edit" data-id="' + item.id + '" data-type="' + item.sourceType + '" aria-label="Edit"><svg aria-hidden="true"><use href="#i-edit"/></svg></button>' +
        '<button class="icon-btn danger" data-action="delete" data-id="' + item.id + '" data-type="' + item.sourceType + '" aria-label="Delete"><svg aria-hidden="true"><use href="#i-trash"/></svg></button>' +
        '</div>';
      els.itemRows.appendChild(row);
    });

    els.itemRows.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditor(btn.dataset.id, btn.dataset.type); });
    });
    els.itemRows.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteItem(btn.dataset.id, btn.dataset.type); });
    });
  }

  function stripLatex(str) { return String(str || '').replace(/\$\$?[^$]*\$\$?/g, '').replace(/#{1,4}\s?/g, '').slice(0, 90); }
  function escapeHtml(str) { var div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

  function deleteItem(id, sourceType) {
    var arrKey = TYPE_TO_ARRAY[sourceType];
    var arr = state.raw[arrKey];
    var item = arr.find(function (i) { return i.id === id; });
    if (!item) return;
    if (!confirm('Delete "' + item.title + '"? This cannot be undone once committed.')) return;
    state.raw[arrKey] = arr.filter(function (i) { return i.id !== id; });
    state.dirty = true;
    renderItems();
    updateCommitBar();
    toast('info', 'Item removed', '"' + item.title + '" will be deleted once you commit.');
  }

  /* ---------------------------------------------------------------------
     Rich-text mini formatter (mirrors app.js) for live previews
     ------------------------------------------------------------------- */

  function escapeHtmlText(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inlineFormat(text) { return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
  function formatRichText(raw) {
    var escaped = escapeHtmlText(raw || '');
    var blocks = escaped.split(/\n\s*\n/);
    return blocks.map(function (block) {
      var trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.indexOf('### ') === 0) return '<h4>' + inlineFormat(trimmed.slice(4)) + '</h4>';
      return '<p>' + inlineFormat(trimmed).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function renderMathIn(el) {
    if (window.renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false
      });
    }
  }
  function livePreview(textarea, previewEl) {
    var val = textarea.value.trim();
    if (!val) { previewEl.innerHTML = '<span class="ph">Live preview appears here</span>'; return; }
    previewEl.innerHTML = formatRichText(val);
    renderMathIn(previewEl);
  }

  /* ---------------------------------------------------------------------
     Editor form
     ------------------------------------------------------------------- */

  function bindItemForm() {
    els.fType.addEventListener('change', function () { updateTypeFields(els.fType.value); });
    els.fQuestion.addEventListener('input', function () { livePreview(els.fQuestion, els.questionPreview); });
    els.fSolution.addEventListener('input', function () { livePreview(els.fSolution, els.solutionPreview); });
    els.fContent.addEventListener('input', function () { livePreview(els.fContent, els.contentPreview); });

    els.itemForm.addEventListener('submit', function (e) {
      e.preventDefault();
      saveItemFromForm();
    });

    updateTypeFields('problem');
  }

  function updateTypeFields(type) {
    document.querySelectorAll('.type-fields').forEach(function (group) {
      group.classList.toggle('is-active', group.dataset.typeFields === type);
    });
  }

  function openEditor(id, sourceType) {
    state.editingId = id;
    state.editingType = sourceType;
    state.pendingPdf = null;
    els.pdfFileName.textContent = '';
    els.pdfFileInput.value = '';

    if (id && sourceType) {
      var arr = state.raw[TYPE_TO_ARRAY[sourceType]];
      var item = arr.find(function (i) { return i.id === id; });
      if (!item) return;
      els.editorHeading.textContent = 'Edit Item';
      els.fId.value = item.id;
      els.fSourceType.value = sourceType;
      els.fType.value = sourceType;
      els.fTitle.value = item.title || '';
      els.fDate.value = item.date || '';
      state.tags = (item.tags || []).slice();

      els.fCourseProblem.value = ''; els.fQuestion.value = ''; els.fSolution.value = '';
      els.fContent.value = ''; els.fImage.value = '';
      els.fLanguage.value = 'Manim'; els.fCodeSnippet.value = ''; els.fAnimationUrl.value = ''; els.fGithubUrl.value = '';
      els.fVideoUrl.value = ''; els.fYtDesc.value = '';
      els.fPdfUrl.value = ''; els.fPdfThumb.value = ''; els.fCoursePdf.value = '';

      if (sourceType === 'problem') {
        els.fCourseProblem.value = item.course || '';
        els.fQuestion.value = item.question_latex || '';
        els.fSolution.value = item.solution_latex || '';
      } else if (sourceType === 'story') {
        els.fContent.value = item.content || '';
        els.fImage.value = item.image || '';
      } else if (sourceType === 'code') {
        els.fLanguage.value = item.language || 'Manim';
        els.fCodeSnippet.value = item.code_snippet || '';
        els.fAnimationUrl.value = item.animation_url || '';
        els.fGithubUrl.value = item.github_url || '';
      } else if (sourceType === 'youtube') {
        els.fVideoUrl.value = item.video_url || '';
        els.fYtDesc.value = item.description || '';
      } else if (sourceType === 'pdf') {
        els.fPdfUrl.value = item.pdf_url || '';
        els.fPdfThumb.value = item.custom_thumbnail || '';
        els.fCoursePdf.value = item.course || '';
      }
    } else {
      els.editorHeading.textContent = 'Add New Item';
      els.itemForm.reset();
      els.fId.value = '';
      els.fSourceType.value = '';
      els.fType.value = 'problem';
      els.fDate.value = new Date().toISOString().slice(0, 10);
      state.tags = [];
    }

    updateTypeFields(els.fType.value);
    livePreview(els.fQuestion, els.questionPreview);
    livePreview(els.fSolution, els.solutionPreview);
    livePreview(els.fContent, els.contentPreview);
    renderTagChips();
    switchView('editor');
  }

  function saveItemFromForm() {
    var type = els.fType.value;
    var title = els.fTitle.value.trim();
    if (!title) { toast('error', 'Title required', 'Give this item a title before saving.'); return; }

    var record = {
      id: els.fId.value || genId(),
      title: title,
      date: els.fDate.value || new Date().toISOString().slice(0, 10),
      tags: state.tags.slice()
    };

    if (type === 'problem') {
      var q = els.fQuestion.value.trim(), s = els.fSolution.value.trim();
      if (!q || !s) { toast('error', 'Question and solution required', 'Both fields must be filled in.'); return; }
      record.course = els.fCourseProblem.value.trim();
      record.question_latex = q;
      record.solution_latex = s;
    } else if (type === 'story') {
      var c = els.fContent.value.trim();
      if (!c) { toast('error', 'Content required', 'Write the story content.'); return; }
      record.content = c;
      record.image = els.fImage.value.trim();
    } else if (type === 'code') {
      var snippet = els.fCodeSnippet.value.trim();
      if (!snippet) { toast('error', 'Code required', 'Paste the code snippet.'); return; }
      record.language = els.fLanguage.value;
      record.code_snippet = snippet;
      record.animation_url = els.fAnimationUrl.value.trim();
      record.github_url = els.fGithubUrl.value.trim();
    } else if (type === 'youtube') {
      var url = els.fVideoUrl.value.trim();
      if (!url) { toast('error', 'YouTube URL required', 'Paste a video link.'); return; }
      record.video_url = url;
      record.description = els.fYtDesc.value.trim();
    } else if (type === 'pdf') {
      var pdfUrl = els.fPdfUrl.value.trim();
      if (state.pendingPdf) {
        pdfUrl = normalizeFolder(state.settings.assetPath) + state.pendingPdf.fileName;
        els.fPdfUrl.value = pdfUrl;
      }
      if (!pdfUrl) { toast('error', 'PDF required', 'Upload a file or enter an existing path.'); return; }
      record.pdf_url = pdfUrl;
      record.custom_thumbnail = els.fPdfThumb.value.trim();
      record.course = els.fCoursePdf.value.trim();
    }

    // If editing and the content type changed, remove from the old array first.
    if (state.editingId && state.editingType && state.editingType !== type) {
      var oldArrKey = TYPE_TO_ARRAY[state.editingType];
      state.raw[oldArrKey] = state.raw[oldArrKey].filter(function (i) { return i.id !== state.editingId; });
    }

    var arrKey = TYPE_TO_ARRAY[type];
    var arr = state.raw[arrKey];
    var existingIdx = arr.findIndex(function (i) { return i.id === record.id; });
    if (existingIdx >= 0) arr[existingIdx] = record;
    else arr.push(record);

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
        if (val && state.tags.indexOf(val) === -1) { state.tags.push(val); renderTagChips(); }
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
     PDF upload (staged for commit)
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
    if (file.type !== 'application/pdf') { toast('error', 'Not a PDF', 'Please choose a .pdf file.'); return; }
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

  function totalItemCount() {
    return state.raw.problems.length + state.raw.stories.length + state.raw.code_animations.length +
      state.raw.youtube.length + state.raw.pdf.length;
  }

  function updateCommitBar() {
    els.commitBar.style.display = state.dirty ? 'flex' : 'none';
    els.commitBarText.textContent = state.dirty
      ? 'You have unsaved local changes (' + totalItemCount() + ' items total).'
      : '';
  }

  function buildPayload() {
    return {
      meta: { schemaVersion: '2.0.0', siteTitle: 'Anur Qoradalov', updatedAt: new Date().toISOString() },
      problems: state.raw.problems,
      stories: state.raw.stories,
      code_animations: state.raw.code_animations,
      youtube: state.raw.youtube,
      pdf: state.raw.pdf
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
        await ghPutFile(assetPath, state.pendingPdf.base64, 'Add asset: ' + state.pendingPdf.fileName, existing ? existing.sha : undefined);
        toast('success', 'PDF uploaded', assetPath);
        state.pendingPdf = null;
      }

      var payload = buildPayload();
      var contentBase64 = utf8ToBase64(JSON.stringify(payload, null, 2));
      var result = await ghPutFile(state.settings.dataPath, contentBase64, 'Update content: ' + totalItemCount() + ' items', state.dataSha || undefined);

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
