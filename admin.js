/* =========================================================================
   Anur Qoradalov — Riyaziyyat Jurnalı — Admin Panel
   Dynamic type-based editor + GitHub REST API commit workflow.
   Token, owner, repo, branch, and paths are stored in localStorage only.
   ========================================================================= */

(function () {
  'use strict';

  var LS_KEYS = {
    token: 'rj-gh-token', owner: 'rj-gh-owner', repo: 'rj-gh-repo',
    branch: 'rj-gh-branch', path: 'rj-gh-path', pdfDir: 'rj-gh-pdfdir'
  };

  var TYPE_LABELS = {
    problems: 'Solved Problem', stories: 'Math Insight', code_animations: 'Codes',
    youtube: 'YouTube Video', pdf: 'PDF Document'
  };

  var state = {
    data: { meta: {}, problems: [], stories: [], code_animations: [], youtube: [], pdf: [] },
    dataSha: null,
    staged: [],              // list of {action:'upsert'|'delete', type, id}
    editing: null,           // {type, id} or null for new
    tags: [],
    stagedPdf: null,         // {name, base64, mime}
    connected: false
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheEls();
    bindNav();
    bindSettings();
    bindEditor();
    bindStageBar();
    loadSettingsFromStorage();
    loadLocalDataFallback();
    renderItemsTable();
    onTypeChange();

    els.itemsSearch.addEventListener('input', renderItemsTable);
    els.itemsTypeFilter.addEventListener('change', renderItemsTable);
  }

  function cacheEls() {
    els.navBtns = document.querySelectorAll('.admin-nav-btn');
    els.panels = document.querySelectorAll('.admin-panel');
    els.connStatus = document.getElementById('connStatus');
    els.connLabel = document.getElementById('connLabel');

    els.itemsTable = document.getElementById('itemsTable');
    els.itemsSearch = document.getElementById('itemsSearch');
    els.itemsTypeFilter = document.getElementById('itemsTypeFilter');

    els.editorHeading = document.getElementById('editorHeading');
    els.typeSelect = document.getElementById('typeSelect');
    els.fTitle = document.getElementById('f_title');
    els.typeFields = document.getElementById('typeFields');
    els.fDate = document.getElementById('f_date');
    els.tagInput = document.getElementById('tagInput');
    els.fTagEntry = document.getElementById('f_tagEntry');
    els.cancelEditBtn = document.getElementById('cancelEditBtn');
    els.saveItemBtn = document.getElementById('saveItemBtn');

    els.sToken = document.getElementById('s_token');
    els.sOwner = document.getElementById('s_owner');
    els.sRepo = document.getElementById('s_repo');
    els.sBranch = document.getElementById('s_branch');
    els.sPath = document.getElementById('s_path');
    els.sPdfDir = document.getElementById('s_pdfDir');
    els.testConnBtn = document.getElementById('testConnBtn');
    els.clearTokenBtn = document.getElementById('clearTokenBtn');

    els.stageBar = document.getElementById('stageBar');
    els.stageCount = document.getElementById('stageCount');
    els.copyJsonBtn = document.getElementById('copyJsonBtn');
    els.commitBtn = document.getElementById('commitBtn');
    els.toast = document.getElementById('toast');
  }

  /* ---------------------------------------------------------------------
     Panel navigation
     ------------------------------------------------------------------- */

  function bindNav() {
    els.navBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { showPanel(btn.dataset.panel); });
    });
  }

  function showPanel(name) {
    els.navBtns.forEach(function (b) { b.classList.toggle('is-active', b.dataset.panel === name); });
    els.panels.forEach(function (p) { p.classList.toggle('is-active', p.id === 'panel-' + name); });
    if (name === 'items') renderItemsTable();
  }

  /* ---------------------------------------------------------------------
     Settings: load/save + connection test
     ------------------------------------------------------------------- */

  function loadSettingsFromStorage() {
    els.sToken.value = localStorage.getItem(LS_KEYS.token) || '';
    els.sOwner.value = localStorage.getItem(LS_KEYS.owner) || '';
    els.sRepo.value = localStorage.getItem(LS_KEYS.repo) || '';
    els.sBranch.value = localStorage.getItem(LS_KEYS.branch) || 'main';
    els.sPath.value = localStorage.getItem(LS_KEYS.path) || 'data.json';
    els.sPdfDir.value = localStorage.getItem(LS_KEYS.pdfDir) || 'assets/pdf/';
  }

  function saveSettingsToStorage() {
    localStorage.setItem(LS_KEYS.token, els.sToken.value.trim());
    localStorage.setItem(LS_KEYS.owner, els.sOwner.value.trim());
    localStorage.setItem(LS_KEYS.repo, els.sRepo.value.trim());
    localStorage.setItem(LS_KEYS.branch, els.sBranch.value.trim() || 'main');
    localStorage.setItem(LS_KEYS.path, els.sPath.value.trim() || 'data.json');
    localStorage.setItem(LS_KEYS.pdfDir, els.sPdfDir.value.trim() || 'assets/pdf/');
  }

  function ghConfig() {
    return {
      token: localStorage.getItem(LS_KEYS.token) || '',
      owner: localStorage.getItem(LS_KEYS.owner) || '',
      repo: localStorage.getItem(LS_KEYS.repo) || '',
      branch: localStorage.getItem(LS_KEYS.branch) || 'main',
      path: localStorage.getItem(LS_KEYS.path) || 'data.json',
      pdfDir: localStorage.getItem(LS_KEYS.pdfDir) || 'assets/pdf/'
    };
  }

  function bindSettings() {
    els.testConnBtn.addEventListener('click', function () {
      saveSettingsToStorage();
      testConnection();
    });
    els.clearTokenBtn.addEventListener('click', function () {
      localStorage.removeItem(LS_KEYS.token);
      els.sToken.value = '';
      setConnected(false, 'Token cleared');
    });
  }

  function setConnected(ok, label) {
    state.connected = ok;
    els.connStatus.classList.toggle('is-connected', ok);
    els.connLabel.textContent = label;
  }

  async function testConnection() {
    var cfg = ghConfig();
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      setConnected(false, 'Missing token, owner, or repo');
      showToast('Fill in token, owner, and repository name first.', true);
      return;
    }
    setConnected(false, 'Connecting…');
    try {
      var res = await fetch('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo, {
        headers: ghHeaders(cfg.token)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setConnected(true, 'Connected to ' + cfg.owner + '/' + cfg.repo);
      showToast('Connected successfully.', false, true);
      await pullRemoteData(cfg);
    } catch (err) {
      setConnected(false, 'Connection failed');
      showToast('Could not connect: ' + err.message, true);
    }
  }

  function ghHeaders(token, extra) {
    var h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    if (extra) Object.assign(h, extra);
    return h;
  }

  async function pullRemoteData(cfg) {
    try {
      var res = await fetch(
        'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path + '?ref=' + cfg.branch,
        { headers: ghHeaders(cfg.token) }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      state.dataSha = json.sha;
      var decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
      var parsed = JSON.parse(decoded);
      applyRemoteData(parsed);
      showToast('Loaded current data.json from GitHub.', false, true);
    } catch (err) {
      showToast('Could not fetch data.json from repo (' + err.message + '). Using local copy.', true);
    }
  }

  function applyRemoteData(parsed) {
    state.data.meta = parsed.meta || state.data.meta;
    state.data.problems = parsed.problems || [];
    state.data.stories = parsed.stories || [];
    state.data.code_animations = parsed.code_animations || [];
    state.data.youtube = parsed.youtube || [];
    state.data.pdf = parsed.pdf || [];
    renderItemsTable();
  }

  function loadLocalDataFallback() {
    fetch('data.json', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (json) {
      if (json && state.staged.length === 0) applyRemoteData(json);
    }).catch(function () { /* ignore — repo may not have this file locally yet */ });
  }

  /* ---------------------------------------------------------------------
     Items table
     ------------------------------------------------------------------- */

  function flattenItems() {
    var out = [];
    Object.keys(TYPE_LABELS).forEach(function (type) {
      (state.data[type] || []).forEach(function (item) {
        out.push({ type: type, item: item });
      });
    });
    out.sort(function (a, b) { return (b.item.date || '').localeCompare(a.item.date || ''); });
    return out;
  }

  function renderItemsTable() {
    var q = (els.itemsSearch.value || '').trim().toLowerCase();
    var typeFilter = els.itemsTypeFilter.value;
    var rows = flattenItems().filter(function (r) {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!q) return true;
      return (r.item.title || '').toLowerCase().indexOf(q) !== -1;
    });

    els.itemsTable.innerHTML = '';
    if (!rows.length) {
      els.itemsTable.innerHTML = '<p class="field-hint">No items yet. Use "Add New Item" to create one.</p>';
      return;
    }

    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML =
        '<span class="item-row-kind">' + TYPE_LABELS[r.type].split(' ')[0] + '</span>' +
        '<span class="item-row-title"></span>' +
        '<span class="item-row-date">' + escapeHtml(r.item.date || '') + '</span>' +
        '<span class="item-row-actions">' +
        '<button type="button" data-act="edit" title="Edit">✎</button>' +
        '<button type="button" data-act="delete" class="danger" title="Delete">🗑</button>' +
        '</span>';
      row.querySelector('.item-row-title').textContent = r.item.title || 'Untitled';
      row.querySelector('[data-act="edit"]').addEventListener('click', function () { openEditor(r.type, r.item.id); });
      row.querySelector('[data-act="delete"]').addEventListener('click', function () { deleteItem(r.type, r.item.id); });
      els.itemsTable.appendChild(row);
    });
  }

  function deleteItem(type, id) {
    if (!confirm('Remove this item from the list? This stages a delete — commit to make it permanent.')) return;
    state.data[type] = state.data[type].filter(function (i) { return i.id !== id; });
    stageChange('delete', type, id);
    renderItemsTable();
  }

  /* ---------------------------------------------------------------------
     Editor: dynamic fields per content type
     ------------------------------------------------------------------- */

  function bindEditor() {
    els.typeSelect.addEventListener('change', onTypeChange);
    els.cancelEditBtn.addEventListener('click', function () { resetEditor(); showPanel('items'); });
    els.saveItemBtn.addEventListener('click', saveItemFromForm);

    els.fTagEntry.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(els.fTagEntry.value);
        els.fTagEntry.value = '';
      }
    });

    document.querySelector('[data-panel="editor"]').addEventListener('click', function () {
      if (!state.editing) resetEditor();
    });
  }

  function onTypeChange() {
    renderTypeFields(els.typeSelect.value, {});
  }

  function renderTypeFields(type, data) {
    var html = '';
    if (type === 'problems') {
      html =
        fieldRow('Course', 'f_course', data.course, 'e.g. Differensial Tənliklər') +
        textareaField('Question (LaTeX)', 'f_question', data.question_latex, 'e.g. Filippov № 64 şərti…') +
        '<div class="latex-preview" id="previewQuestion"></div>' +
        textareaField('Solution (LaTeX)', 'f_solution', data.solution_latex, 'Tam həll, addım-addım…') +
        '<div class="latex-preview" id="previewSolution"></div>' +
        fieldRow('Bibliography (optional)', 'f_bib', data.bibliography, 'e.g. Filippov, A. F. — Задачник по дифференциальным уравнениям, № 64.');
    } else if (type === 'stories') {
      html =
        textareaField('Content', 'f_content', data.content, 'Məqalə mətni…') +
        fieldRow('Image URL', 'f_image', data.image, 'assets/img/… or https://…');
    } else if (type === 'code_animations') {
      html =
        '<div class="field-group"><label class="field-label">Language</label>' +
        '<select id="f_language" class="admin-input">' +
        ['Manim', 'Python', 'MATLAB', 'C++', 'Other'].map(function (l) {
          return '<option value="' + l + '"' + (data.language === l ? ' selected' : '') + '>' + l + '</option>';
        }).join('') + '</select></div>' +
        textareaField('Code snippet', 'f_snippet', data.code_snippet, 'Paste the code to display…') +
        fieldRow('Animation URL (video)', 'f_animurl', data.animation_url, 'YouTube / mp4 link') +
        fieldRow('GitHub URL', 'f_githuburl', data.github_url, 'https://github.com/…');
    } else if (type === 'youtube') {
      html =
        fieldRow('Video URL', 'f_videourl', data.video_url, 'https://youtu.be/…') +
        '<div class="latex-preview" id="ytPreview" style="font-family:var(--font-ui);font-size:12.5px;">Paste a link to preview the thumbnail.</div>' +
        textareaField('Description', 'f_ytdesc', data.description, 'Qısa təsvir…');
    } else if (type === 'pdf') {
      html =
        fieldRow('PDF URL / path', 'f_pdfurl', data.pdf_url, 'assets/pdf/… or https://…') +
        '<div class="dropzone" id="pdfDropzone">Drag a PDF here, or <strong>click to choose a file</strong> — staged for upload on commit.<input type="file" id="pdfFileInput" accept="application/pdf" hidden></div>' +
        fieldRow('Custom thumbnail URL (optional)', 'f_pdfthumb', data.custom_thumbnail, 'assets/img/…') +
        fieldRow('Course', 'f_pdfcourse', data.course, 'e.g. Kompleks Analiz');
    }
    els.typeFields.innerHTML = html;

    if (type === 'problems') {
      bindLatexPreview('f_question', 'previewQuestion');
      bindLatexPreview('f_solution', 'previewSolution');
    }
    if (type === 'youtube') bindYoutubePreview();
    if (type === 'pdf') bindPdfDropzone();
  }

  function fieldRow(label, id, value, placeholder) {
    return '<div class="field-group"><label class="field-label">' + label + '</label>' +
      '<input type="text" id="' + id + '" class="admin-input" value="' + escapeAttr(value || '') + '" placeholder="' + escapeAttr(placeholder || '') + '"></div>';
  }

  function textareaField(label, id, value, placeholder) {
    return '<div class="field-group"><label class="field-label">' + label + '</label>' +
      '<textarea id="' + id + '" class="admin-input" placeholder="' + escapeAttr(placeholder || '') + '">' + escapeHtml(value || '') + '</textarea></div>';
  }

  function bindLatexPreview(fieldId, previewId) {
    var field = document.getElementById(fieldId);
    var preview = document.getElementById(previewId);
    var render = function () {
      if (!window.katex) { preview.textContent = field.value; return; }
      try { katex.render(field.value || '', preview, { throwOnError: false, displayMode: true }); }
      catch (e) { preview.textContent = field.value; }
    };
    field.addEventListener('input', debounce(render, 180));
    render();
  }

  function bindYoutubePreview() {
    var field = document.getElementById('f_videourl');
    var preview = document.getElementById('ytPreview');
    var render = function () {
      var id = extractYouTubeId(field.value);
      if (id) {
        preview.innerHTML = '<img src="https://img.youtube.com/vi/' + id + '/hqdefault.jpg" style="width:160px;border-radius:6px;display:block;" alt="">';
      } else {
        preview.textContent = 'Paste a link to preview the thumbnail.';
      }
    };
    field.addEventListener('input', debounce(render, 180));
    render();
  }

  function bindPdfDropzone() {
    var zone = document.getElementById('pdfDropzone');
    var input = document.getElementById('pdfFileInput');
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-drag'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('is-drag'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('is-drag');
      if (e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0], zone);
    });
    input.addEventListener('change', function () {
      if (input.files[0]) handlePdfFile(input.files[0], zone);
    });
  }

  function handlePdfFile(file, zone) {
    if (file.type !== 'application/pdf') { showToast('Please choose a PDF file.', true); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      state.stagedPdf = { name: file.name, base64: base64 };
      zone.innerHTML = 'Staged: <strong>' + escapeHtml(file.name) + '</strong> — will upload on commit. Click to replace.';
      var urlField = document.getElementById('f_pdfurl');
      if (urlField && !urlField.value) urlField.value = ghConfig().pdfDir.replace(/\/?$/, '/') + file.name;
    };
    reader.readAsDataURL(file);
  }

  /* ---- tags ---- */

  function addTag(raw) {
    var t = raw.trim().replace(/,$/, '');
    if (!t || state.tags.indexOf(t) !== -1) return;
    state.tags.push(t);
    renderTagChips();
  }

  function renderTagChips() {
    Array.prototype.forEach.call(els.tagInput.querySelectorAll('.tag-chip'), function (c) { c.remove(); });
    state.tags.forEach(function (t) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = '<span></span><button type="button" aria-label="Remove">×</button>';
      chip.querySelector('span').textContent = t;
      chip.querySelector('button').addEventListener('click', function () {
        state.tags = state.tags.filter(function (x) { return x !== t; });
        renderTagChips();
      });
      els.tagInput.insertBefore(chip, els.fTagEntry);
    });
  }

  /* ---- open / reset / save ---- */

  function openEditor(type, id) {
    var item = (state.data[type] || []).find(function (i) { return i.id === id; });
    if (!item) return;
    state.editing = { type: type, id: id };
    els.editorHeading.textContent = 'Edit — ' + (item.title || '');
    els.typeSelect.value = type;
    els.typeSelect.disabled = true;
    els.fTitle.value = item.title || '';
    els.fDate.value = item.date || '';
    state.tags = (item.tags || []).slice();
    renderTypeFields(type, item);
    renderTagChips();
    showPanel('editor');
  }

  function resetEditor() {
    state.editing = null;
    state.tags = [];
    state.stagedPdf = null;
    els.editorHeading.textContent = 'Add New Item';
    els.typeSelect.disabled = false;
    els.typeSelect.value = 'problems';
    els.fTitle.value = '';
    els.fDate.value = '';
    renderTagChips();
    renderTypeFields('problems', {});
  }

  function saveItemFromForm() {
    var type = els.typeSelect.value;
    var title = els.fTitle.value.trim();
    if (!title) { showToast('Title is required.', true); return; }

    var id = state.editing ? state.editing.id : genId(type);
    var base = { id: id, title: title, date: els.fDate.value || '', tags: state.tags.slice() };
    var item;

    if (type === 'problems') {
      item = Object.assign(base, {
        course: val('f_course'), question_latex: val('f_question'),
        solution_latex: val('f_solution'), bibliography: val('f_bib')
      });
    } else if (type === 'stories') {
      item = Object.assign(base, { content: val('f_content'), image: val('f_image') });
    } else if (type === 'code_animations') {
      item = Object.assign(base, {
        language: val('f_language'), code_snippet: val('f_snippet'),
        animation_url: val('f_animurl'), github_url: val('f_githuburl')
      });
    } else if (type === 'youtube') {
      item = Object.assign(base, { video_url: val('f_videourl'), description: val('f_ytdesc') });
    } else if (type === 'pdf') {
      item = Object.assign(base, {
        pdf_url: val('f_pdfurl'), custom_thumbnail: val('f_pdfthumb'), course: val('f_pdfcourse')
      });
    }

    if (state.editing && state.editing.type !== type) {
      state.data[state.editing.type] = state.data[state.editing.type].filter(function (i) { return i.id !== state.editing.id; });
    }

    var list = state.data[type];
    var idx = list.findIndex(function (i) { return i.id === id; });
    if (idx !== -1) list[idx] = item; else list.push(item);

    stageChange('upsert', type, id);
    showToast('Staged locally — commit to publish.', false, true);
    resetEditor();
    showPanel('items');
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function genId(type) {
    var prefix = { problems: 'prb', stories: 'sty', code_animations: 'cda', youtube: 'ytb', pdf: 'pdf' }[type] || 'itm';
    return prefix + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------------------------------------------------------------
     Staging + commit
     ------------------------------------------------------------------- */

  function stageChange(action, type, id) {
    state.staged = state.staged.filter(function (s) { return !(s.type === type && s.id === id); });
    state.staged.push({ action: action, type: type, id: id });
    updateStageBar();
  }

  function updateStageBar() {
    var n = state.staged.length;
    els.stageBar.hidden = n === 0;
    els.stageCount.textContent = n + (n === 1 ? ' staged change' : ' staged changes');
  }

  function bindStageBar() {
    els.copyJsonBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(JSON.stringify(buildOutputData(), null, 2))
        .then(function () { showToast('Copied data.json to clipboard.', false, true); })
        .catch(function () { showToast('Could not copy — clipboard blocked.', true); });
    });
    els.commitBtn.addEventListener('click', commitToGitHub);
  }

  function buildOutputData() {
    return {
      meta: Object.assign({}, state.data.meta, { updatedAt: new Date().toISOString() }),
      problems: state.data.problems,
      stories: state.data.stories,
      code_animations: state.data.code_animations,
      youtube: state.data.youtube,
      pdf: state.data.pdf
    };
  }

  async function commitToGitHub() {
    var cfg = ghConfig();
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      showToast('Set up GitHub Settings first (token, owner, repo).', true);
      showPanel('settings');
      return;
    }
    els.commitBtn.disabled = true;
    els.commitBtn.textContent = 'Committing…';
    try {
      if (state.stagedPdf) {
        await uploadPdf(cfg);
      }
      await commitDataJson(cfg);
      state.staged = [];
      state.stagedPdf = null;
      updateStageBar();
      showToast('Committed to GitHub. Pages will redeploy shortly.', false, true);
    } catch (err) {
      showToast('Commit failed: ' + err.message, true);
    } finally {
      els.commitBtn.disabled = false;
      els.commitBtn.textContent = 'Commit to GitHub';
    }
  }

  async function uploadPdf(cfg) {
    var path = cfg.pdfDir.replace(/\/?$/, '/') + state.stagedPdf.name;
    var body = { message: 'Upload PDF: ' + state.stagedPdf.name, content: state.stagedPdf.base64, branch: cfg.branch };
    var res = await fetch(
      'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path,
      { method: 'PUT', headers: ghHeaders(cfg.token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) }
    );
    if (!res.ok) { var e = await safeJson(res); throw new Error('PDF upload failed (' + res.status + ') ' + (e && e.message ? e.message : '')); }
  }

  async function commitDataJson(cfg) {
    var payload = JSON.stringify(buildOutputData(), null, 2);
    var contentB64 = btoa(unescape(encodeURIComponent(payload)));

    // Refresh SHA right before writing, in case the remote file changed.
    var sha = state.dataSha;
    try {
      var shaRes = await fetch(
        'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path + '?ref=' + cfg.branch,
        { headers: ghHeaders(cfg.token) }
      );
      if (shaRes.ok) { var shaJson = await shaRes.json(); sha = shaJson.sha; }
    } catch (e) { /* file may not exist yet — fine, sha stays undefined */ }

    var body = { message: 'Update data.json via admin panel', content: contentB64, branch: cfg.branch };
    if (sha) body.sha = sha;

    var res = await fetch(
      'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + cfg.path,
      { method: 'PUT', headers: ghHeaders(cfg.token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) }
    );
    if (!res.ok) { var e = await safeJson(res); throw new Error('HTTP ' + res.status + ' ' + (e && e.message ? e.message : '')); }
    var json = await res.json();
    state.dataSha = json.content ? json.content.sha : null;
  }

  async function safeJson(res) { try { return await res.json(); } catch (e) { return null; } }

  /* ---------------------------------------------------------------------
     Utils
     ------------------------------------------------------------------- */

  function extractYouTubeId(url) {
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/);
    return m ? m[1] : null;
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function showToast(msg, isError, isSuccess) {
    els.toast.textContent = msg;
    els.toast.className = 'toast' + (isError ? ' is-error' : isSuccess ? ' is-success' : '');
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { els.toast.hidden = true; }, 3600);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

})();
