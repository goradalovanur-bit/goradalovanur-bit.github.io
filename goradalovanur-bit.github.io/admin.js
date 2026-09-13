/* =========================================================================
   Content Admin Engine — GitHub Pages CMS
   Features: Local item staging, LaTeX Math live preview, YouTube & PDF support,
             GitHub REST API integration, one-click JSON payload export.
   ========================================================================= */

(function () {
  'use strict';

  var LS_SETTINGS = 'admin-settings';
  var LS_THEME = 'theme';
  var GH_API = 'https://api.github.com';

  var TYPE_LABEL = {
    problem: 'Problem',
    insight: 'Insight',
    code: 'Code',
    youtube: 'Video',
    pdf: 'PDF',
    latex: 'Problem',
    link: 'Link'
  };

  var state = {
    settings: loadSettings(),
    items: [],
    siteMeta: {},
    dataSha: null,
    editingId: null,
    tags: [],
    pendingPdf: null,
    dirty: false,
    isConnected: false
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    initTheme();
    bindNavEvents();
    bindSettingsForm();
    bindItemForm();
    bindPdfDrop();
    bindTagInput();
    bindCommitBar();
    populateSettingsForm();
    await loadInitialData();
  }

  function cacheElements() {
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
    els.fThumbUrl = document.getElementById('f-thumb-url');
    els.fProblemPdfUrl = document.getElementById('f-problem-pdf-url');
    els.fQuestion = document.getElementById('f-question-latex');
    els.fSolution = document.getElementById('f-solution-latex');
    els.fSubject = document.getElementById('f-subject-tag');
    els.fInsight = document.getElementById('f-insight-content');
    els.fLanguage = document.getElementById('f-language');
    els.fCode = document.getElementById('f-code-snippet');
    els.fVideoUrl = document.getElementById('f-video-url');
    els.fDate = document.getElementById('f-date');
    els.fTagsInput = document.getElementById('f-tags-input');
    els.tagInputRow = document.getElementById('tagInputRow');
    els.questionPreview = document.getElementById('questionPreview');
    els.solutionPreview = document.getElementById('solutionPreview');
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

  /* =========================================================================
     Theme Toggle
     ========================================================================= */

  function initTheme() {
    var stored = localStorage.getItem(LS_THEME);
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var current = stored || (prefersDark ? 'dark' : 'light');
    applyTheme(current);

    var toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var active = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var next = active === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try {
          localStorage.setItem(LS_THEME, next);
        } catch (e) {}
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* =========================================================================
     Settings Management
     ========================================================================= */

  function loadSettings() {
    var defaults = {
      token: '',
      owner: 'goradalovanur-bit',
      repo: 'goradalovanur-bit.github.io',
      branch: 'main',
      dataPath: 'data.json',
      assetPath: 'assets/pdf/'
    };

    try {
      var raw = localStorage.getItem(LS_SETTINGS);
      if (!raw) return defaults;
      return Object.assign(defaults, JSON.parse(raw));
    } catch (e) {
      return defaults;
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
    } catch (e) {}
  }

  function populateSettingsForm() {
    els.sToken.value = state.settings.token || '';
    els.sOwner.value = state.settings.owner || '';
    els.sRepo.value = state.settings.repo || '';
    els.sBranch.value = state.settings.branch || 'main';
    els.sDatapath.value = state.settings.dataPath || 'data.json';
    els.sAssetpath.value = state.settings.assetPath || 'assets/pdf/';
    if (els.pdfAssetPathHint) {
      els.pdfAssetPathHint.textContent = state.settings.assetPath || 'assets/pdf/';
    }
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
      if (els.pdfAssetPathHint) {
        els.pdfAssetPathHint.textContent = state.settings.assetPath;
      }

      toast('info', 'Testing connection…', 'Verifying token and repository access.');
      var ok = await testConnection();
      if (ok) {
        await loadInitialData(true);
      }
    });

    els.togglePw.addEventListener('click', function () {
      els.sToken.type = els.sToken.type === 'password' ? 'text' : 'password';
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

    var res = await fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify(body)
    });
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
      var res = await fetch(GH_API + '/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo), {
        headers: ghHeaders()
      });
      if (!res.ok) throw new Error(await ghErrorMessage(res));

      var repo = await res.json();
      var canPush = repo.permissions && (repo.permissions.push || repo.permissions.admin);
      if (!canPush) {
        setConnStatus('error', 'Connected, but no write permissions');
        toast('error', 'Limited access', 'Token can read repository but lacks write access.');
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

  /* =========================================================================
     Data Loading & Normalization
     ========================================================================= */

  async function loadInitialData(forceRemote) {
    if (hasCredentials()) {
      var ok = await testConnection();
      if (ok || forceRemote) {
        try {
          var file = await ghGetFile(state.settings.dataPath);
          if (file) {
            var parsed = JSON.parse(file.content);
            state.siteMeta = parsed.meta || {};
            state.items = normalizeItems(parsed.items || []);
            state.dataSha = file.sha;
            state.dirty = false;
            updateCommitBar();
            renderItemsTable();
            toast('success', 'Content loaded', 'Loaded ' + state.items.length + ' items from GitHub.');
            return;
          }
          toast('info', 'No data.json found', 'Starting from an empty list — it will be created on first commit.');
          state.items = [];
          state.dataSha = null;
          renderItemsTable();
          return;
        } catch (err) {
          toast('error', 'Could not load data.json', err.message);
        }
      }
    }

    try {
      var res = await fetch('data.json', { cache: 'no-store' });
      if (res.ok) {
        var data = await res.json();
        state.siteMeta = data.meta || {};
        state.items = normalizeItems(data.items || []);
        renderItemsTable();
        toast('info', 'Read-only preview', 'Loaded local data.json. Connect GitHub Settings to enable commits.');
      }
    } catch (e) {}
  }

  function normalizeItems(rawItems) {
    return rawItems
      .map(function (item) {
        var type = item.type === 'latex' ? 'problem' : (item.type || 'insight');
        return {
          id: item.id || genId(),
          type: type,
          title: item.title || '',
          description: item.description || '',
          url: item.url || item.youtube_url || item.pdf_url || '',
          youtube_url: item.youtube_url || (type === 'youtube' ? item.url : '') || '',
          pdf_url: item.pdf_url || (type === 'pdf' ? item.url : '') || '',
          video_url: item.video_url || '',
          custom_thumbnail_url: item.custom_thumbnail_url || '',
          content: item.content || item.content_markdown_or_html || '',
          question_latex: item.question_latex || (type === 'problem' ? item.content : '') || '',
          solution_latex: item.solution_latex || '',
          subject_tag: item.subject_tag || '',
          language: item.language || '',
          code_snippet: item.code_snippet || (type === 'code' ? item.content : '') || '',
          date: item.date || '',
          tags: Array.isArray(item.tags) ? item.tags : [],
          meta: item.meta || {}
        };
      })
      // Strictly sort by date reverse-chronologically
      .sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
      });
  }

  function genId() {
    return 'itm_' + Math.random().toString(36).slice(2, 9);
  }

  /* =========================================================================
     Navigation
     ========================================================================= */

  function bindNavEvents() {
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

  /* =========================================================================
     Items Table View
     ========================================================================= */

  function renderItemsTable() {
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
        var summary = item.description || item.subject_tag || item.language || '';

        row.innerHTML =
          '<div><span class="tag type-' + item.type + '">' + (TYPE_LABEL[item.type] || item.type) + '</span></div>' +
          '<div><div class="it-title">' + escapeHtml(item.title) + '</div><div class="it-desc">' + escapeHtml(summary) + '</div></div>' +
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

  function deleteItem(id) {
    var item = state.items.find(function (i) { return i.id === id; });
    if (!item) return;
    if (!confirm('Delete "' + item.title + '"? This will take effect on next commit.')) return;

    state.items = state.items.filter(function (i) { return i.id !== id; });
    state.dirty = true;
    renderItemsTable();
    updateCommitBar();
    toast('info', 'Item removed', '"' + item.title + '" will be deleted upon commit.');
  }

  /* =========================================================================
     Form & Editor Handling
     ========================================================================= */

  function bindItemForm() {
    els.fType.addEventListener('change', function () {
      updateTypeFields(els.fType.value);
      renderLatexLive();
    });

    els.fQuestion.addEventListener('input', debounce(renderLatexLive, 200));
    els.fSolution.addEventListener('input', debounce(renderLatexLive, 200));

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

  function latexDocToHtml(src) {
    if (!src) return '';
    var text = String(src).replace(/\r\n/g, '\n');
    text = text.replace(/\\section\*\{([^}]*)\}/g, '<h2 class="latex-section">$1</h2>');
    text = text.replace(/\\subsection\*\{([^}]*)\}/g, '<h3 class="latex-subsection">$1</h3>');
    text = text.replace(/\\section\{([^}]*)\}/g, '<h2 class="latex-section">$1</h2>');
    text = text.replace(/\\subsection\{([^}]*)\}/g, '<h3 class="latex-subsection">$1</h3>');

    return text.split(/\n{2,}/).map(function (chunk) {
      if (/^<h[23]/.test(chunk.trim())) return chunk;
      return '<p>' + chunk.replace(/\n/g, ' ') + '</p>';
    }).join('');
  }

  function renderLatexLive() {
    fillPreview(els.questionPreview, els.fQuestion.value, 'Question preview');
    fillPreview(els.solutionPreview, els.fSolution.value, 'Solution preview');
  }

  function fillPreview(el, src, placeholder) {
    src = (src || '').trim();
    if (!src) {
      el.innerHTML = '<span class="ph">' + placeholder + '</span>';
      return;
    }
    el.innerHTML = latexDocToHtml(src);
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise([el]).catch(function () {});
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
      els.fType.value = ['problem', 'insight', 'code', 'pdf', 'youtube'].indexOf(item.type) >= 0 ? item.type : 'insight';
      els.fTitle.value = item.title;
      els.fDesc.value = item.description;
      els.fDate.value = item.date;
      els.fYoutubeUrl.value = item.youtube_url || item.url || '';
      els.fPdfUrl.value = item.pdf_url || (item.type === 'pdf' ? item.url : '') || '';
      els.fThumbUrl.value = item.custom_thumbnail_url || '';
      els.fProblemPdfUrl.value = item.pdf_url || '';
      els.fQuestion.value = item.question_latex || '';
      els.fSolution.value = item.solution_latex || '';
      els.fSubject.value = item.subject_tag || '';
      els.fInsight.value = item.content || '';
      els.fLanguage.value = item.language || '';
      els.fCode.value = item.code_snippet || '';
      els.fVideoUrl.value = item.video_url || '';
      state.tags = item.tags.slice();
    } else {
      els.editorHeading.textContent = 'Add New Item';
      els.itemForm.reset();
      els.fId.value = '';
      els.fType.value = 'problem';
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
    if (!title) {
      toast('error', 'Title required', 'Give this item a title before saving.');
      return;
    }

    var item = {
      id: els.fId.value || genId(),
      type: type,
      title: title,
      description: els.fDesc.value.trim(),
      date: els.fDate.value || new Date().toISOString().slice(0, 10),
      tags: state.tags.slice(),
      url: '',
      youtube_url: '',
      pdf_url: '',
      video_url: '',
      custom_thumbnail_url: '',
      content: '',
      question_latex: '',
      solution_latex: '',
      subject_tag: '',
      language: '',
      code_snippet: '',
      meta: {}
    };

    if (type === 'youtube') {
      item.youtube_url = els.fYoutubeUrl.value.trim();
      item.url = item.youtube_url;
      if (!item.youtube_url) {
        toast('error', 'YouTube URL required', 'Enter a valid video link.');
        return;
      }
    } else if (type === 'pdf') {
      item.pdf_url = els.fPdfUrl.value.trim();
      if (state.pendingPdf) {
        item.pdf_url = normalizeFolder(state.settings.assetPath) + state.pendingPdf.fileName;
        els.fPdfUrl.value = item.pdf_url;
      }
      item.url = item.pdf_url;
      item.custom_thumbnail_url = els.fThumbUrl.value.trim();
      if (!item.pdf_url) {
        toast('error', 'PDF required', 'Upload a file or enter an existing path.');
        return;
      }
    } else if (type === 'problem') {
      item.question_latex = els.fQuestion.value.trim();
      item.solution_latex = els.fSolution.value.trim();
      item.subject_tag = els.fSubject.value.trim();
      if (els.fProblemPdfUrl.value.trim()) {
        item.pdf_url = els.fProblemPdfUrl.value.trim();
      }
      if (item.subject_tag && item.tags.indexOf(item.subject_tag) === -1) {
        item.tags.push(item.subject_tag);
      }
      if (!item.question_latex) {
        toast('error', 'Question required', 'Enter the problem statement in LaTeX.');
        return;
      }
    } else if (type === 'insight') {
      item.content = els.fInsight.value.trim();
      if (!item.content) {
        toast('error', 'Content required', 'Write the insight content.');
        return;
      }
    } else if (type === 'code') {
      item.language = els.fLanguage.value.trim();
      item.code_snippet = els.fCode.value.trim();
      item.video_url = els.fVideoUrl.value.trim();
      if (item.language && item.tags.indexOf(item.language) === -1) {
        item.tags.push(item.language);
      }
      if (!item.code_snippet && !item.video_url) {
        toast('error', 'Code or video required', 'Add a snippet and/or a video URL.');
        return;
      }
    }

    var existingIdx = state.items.findIndex(function (i) { return i.id === item.id; });
    if (existingIdx >= 0) {
      state.items[existingIdx] = item;
    } else {
      state.items.push(item);
    }

    state.dirty = true;
    renderItemsTable();
    updateCommitBar();
    toast('success', existingIdx >= 0 ? 'Item updated' : 'Item added', '"' + title + '" will be included on next commit.');
    switchView('items');
  }

  /* =========================================================================
     Tag Input
     ========================================================================= */

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
      chip.innerHTML = escapeHtml(tag) +
        '<button type="button" aria-label="Remove tag"><svg aria-hidden="true"><use href="#i-close"/></svg></button>';

      chip.querySelector('button').addEventListener('click', function () {
        state.tags = state.tags.filter(function (t) { return t !== tag; });
        renderTagChips();
      });

      els.tagInputRow.insertBefore(chip, els.fTagsInput);
    });
  }

  /* =========================================================================
     PDF File Drop
     ========================================================================= */

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
      toast('error', 'Not a PDF', 'Please select a .pdf document.');
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

  /* =========================================================================
     Commit Bar & Payload Export
     ========================================================================= */

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

  function serializeItem(item) {
    var out = {
      id: item.id,
      type: item.type,
      title: item.title,
      date: item.date,
      tags: item.tags || []
    };

    if (item.description) out.description = item.description;

    if (item.type === 'problem') {
      out.question_latex = item.question_latex;
      out.solution_latex = item.solution_latex;
      out.subject_tag = item.subject_tag;
      if (item.pdf_url) out.pdf_url = item.pdf_url;
    } else if (item.type === 'insight') {
      out.content = item.content;
    } else if (item.type === 'code') {
      out.language = item.language;
      out.code_snippet = item.code_snippet;
      if (item.video_url) out.video_url = item.video_url;
    } else if (item.type === 'pdf') {
      out.pdf_url = item.pdf_url || item.url;
      if (item.custom_thumbnail_url) out.custom_thumbnail_url = item.custom_thumbnail_url;
    } else if (item.type === 'youtube') {
      out.youtube_url = item.youtube_url || item.url;
    }

    return out;
  }

  function buildPayload() {
    var meta = Object.assign({}, state.siteMeta, {
      schemaVersion: '2.0.0',
      updatedAt: new Date().toISOString()
    });

    // Strictly sort items reverse-chronologically before saving
    var sorted = state.items.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    return {
      meta: meta,
      items: sorted.map(serializeItem)
    };
  }

  function copyJsonPayload() {
    var json = JSON.stringify(buildPayload(), null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json)
        .then(function () { toast('success', 'Copied', 'data.json payload copied to clipboard.'); })
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
    try {
      document.execCommand('copy');
      toast('success', 'Copied', 'data.json payload copied to clipboard.');
    } catch (e) {
      toast('error', 'Copy failed', 'Please copy manually from settings.');
    }
    document.body.removeChild(ta);
  }

  async function commitToGitHub() {
    if (!hasCredentials()) {
      toast('error', 'Not connected', 'Add GitHub Token and Repository in Settings, or use Copy JSON.');
      switchView('settings');
      return;
    }

    els.commitBtn.disabled = true;
    var originalText = els.commitBtn.innerHTML;
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
      var contentBase64 = utf8ToBase64(JSON.stringify(payload, null, 2) + '\n');
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
      els.commitBtn.innerHTML = originalText;
    }
  }

  /* =========================================================================
     Toast Notifications
     ========================================================================= */

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

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

})();
