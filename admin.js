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
  var TYPE_TO_ARRAY = { problem: 'problems', story: 'stories', code: 'code_animations', youtube: 'youtube', pdf: 'pdf', course: 'courses' };
  var TYPE_LABEL = { problem: 'Problem', story: 'Essay', code: 'Code', youtube: 'YouTube', pdf: 'PDF', course: 'Course' };

  /* Default "Fields of Mathematics" — seeded into data.json's meta.fields
     the first time it's missing. From then on, the Fields view (dynamic
     create / edit / delete) is the source of truth; this constant is only
     ever used to seed or as an ultimate fallback. */
  var DEFAULT_FIELDS = [
    { slug: 'algebra', label: 'Algebra' },
    { slug: 'complex-analysis', label: 'Complex Analysis' },
    { slug: 'geometry', label: 'Geometry' },
    { slug: 'lebesgue-integral-and-measure', label: 'Lebesgue Integral & Measure' },
    { slug: 'mathematical-logic', label: 'Mathematical Logic' },
    { slug: 'mathematical-statistics', label: 'Mathematical Statistics' },
    { slug: 'numerical-analysis', label: 'Numerical Analysis' },
    { slug: 'ordinary-differential-equations', label: 'ODE' },
    { slug: 'partial-differential-equations', label: 'PDE' },
    { slug: 'probability', label: 'Probability' },
    { slug: 'real-analysis', label: 'Real Analysis' },
    { slug: 'topology', label: 'Topology' }
  ];
  var TAG_ACRONYMS = { ode: 'ODE', pde: 'PDE', la: 'LA' };

  function getFields() {
    if (!state.raw.meta.fields || !state.raw.meta.fields.length) state.raw.meta.fields = DEFAULT_FIELDS.slice();
    return state.raw.meta.fields;
  }

  function fieldMap() {
    var map = {};
    getFields().forEach(function (f) { map[f.slug] = f.label; });
    return map;
  }

  function formatTagLabel(raw) {
    var key = String(raw || '').trim().toLowerCase();
    if (!key) return '';
    var map = fieldMap();
    if (map[key]) return map[key];
    return key.split(/[\s\-_]+/).map(function (word) {
      if (!word) return '';
      if (TAG_ACRONYMS[word]) return TAG_ACRONYMS[word];
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function slugifyField(label) {
    return String(label || '').trim().toLowerCase()
      .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  var state = {
    settings: loadSettings(),
    raw: { problems: [], stories: [], code_animations: [], youtube: [], pdf: [], courses: [], meta: {} },
    dataSha: null,
    editingId: null,
    editingType: null,
    tags: [],
    storyImages: [],
    media: [],
    lessons: [],
    pendingPdf: null,
    pendingPdfThumb: null,
    pendingAvatar: null,
    pendingCourseCover: null,
    pendingUploads: [],
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
    bindPdfThumbDrop();
    bindStoryImages();
    bindAvatarUpload();
    bindTagInput();
    bindCommitBar();
    bindFieldsManager();
    bindMediaManager();
    bindCourseCoverDrop();
    bindLessonsEditor();
    bindCropper();

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
    els.pdfThumbDrop = document.getElementById('pdfThumbDrop');
    els.pdfThumbFileInput = document.getElementById('pdfThumbFileInput');
    els.pdfThumbFileName = document.getElementById('pdfThumbFileName');

    // story images
    els.storyImagesList = document.getElementById('storyImagesList');
    els.addStoryImageBtn = document.getElementById('addStoryImageBtn');

    // fields manager
    els.fieldsManagerList = document.getElementById('fieldsManagerList');
    els.newFieldLabel = document.getElementById('newFieldLabel');
    els.newFieldSlugPreview = document.getElementById('newFieldSlugPreview');
    els.addFieldBtn = document.getElementById('addFieldBtn');

    // universal media manager
    els.mediaManagerList = document.getElementById('mediaManagerList');
    els.mediaDropZone = document.getElementById('mediaDropZone');
    els.mediaFileInput = document.getElementById('mediaFileInput');
    els.addMediaUrlBtn = document.getElementById('addMediaUrlBtn');

    // course
    els.fCourseDesc = document.getElementById('f-course-desc');
    els.fCourseCoverUrl = document.getElementById('f-course-cover-url');
    els.fCourseField = document.getElementById('f-course-field');
    els.courseCoverDrop = document.getElementById('courseCoverDrop');
    els.courseCoverFileInput = document.getElementById('courseCoverFileInput');
    els.courseCoverFileName = document.getElementById('courseCoverFileName');
    els.lessonsEditorList = document.getElementById('lessonsEditorList');
    els.addLessonBtn = document.getElementById('addLessonBtn');

    // cropper
    els.cropperBackdrop = document.getElementById('cropperBackdrop');
    els.cropperStage = document.getElementById('cropperStage');
    els.cropperImg = document.getElementById('cropperImg');
    els.cropperSelection = document.getElementById('cropperSelection');
    els.cropperCancelBtn = document.getElementById('cropperCancelBtn');
    els.cropperApplyBtn = document.getElementById('cropperApplyBtn');

    // about page avatar
    els.avatarDrop = document.getElementById('avatarDrop');
    els.avatarFileInput = document.getElementById('avatarFileInput');
    els.avatarFileName = document.getElementById('avatarFileName');
    els.avatarPreview = document.getElementById('avatarPreview');
    els.sAvatarUrl = document.getElementById('s-avatar-url');

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
      pdf: normalizeArr(data.pdf),
      courses: normalizeArr(data.courses),
      meta: (data.meta && typeof data.meta === 'object') ? data.meta : {}
    };
    state.pendingAvatar = null;
    state.pendingUploads = [];
    getFields(); // seeds defaults into state.raw.meta.fields if missing
    if (els.sAvatarUrl) els.sAvatarUrl.value = state.raw.meta.avatarUrl || '';
    if (els.avatarFileName) els.avatarFileName.textContent = '';
    updateAvatarPreview();
    renderFieldsManagerList();
    refreshFieldDatalists();
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
    state.raw.courses.forEach(function (co) { out.push({ sourceType: 'course', id: co.id, title: co.title, date: co.date, raw: co }); });
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
        '<div class="mono" style="font-size:0.8rem; color:var(--ink-faint);">' + (item.date ? adminFormatDate(item.date) : '—') + '</div>' +
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

  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* 12-hour AM/PM timestamp formatting, mirrors app.js. Accepts both plain
     dates ("2026-09-14") and datetime-local values ("2026-09-14T21:30"). */
  function adminFormatDate(iso) {
    if (!iso) return '';
    var hasTime = /T\d{2}:\d{2}/.test(iso);
    var d = hasTime ? new Date(iso) : new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    var dateStr = MONTH_ABBR[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    if (!hasTime) return dateStr;
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    var hh = h12 < 10 ? '0' + h12 : '' + h12;
    var mm = m < 10 ? '0' + m : '' + m;
    return dateStr + ', ' + hh + ':' + mm + ' ' + ampm;
  }

  /* "YYYY-MM-DDTHH:MM" for a datetime-local input's default value. */
  function nowForDatetimeLocal() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* Ensures a stored date value is safe to drop into a datetime-local
     input (adds a T00:00 time part to legacy date-only values). */
  function toDatetimeLocalValue(stored) {
    if (!stored) return nowForDatetimeLocal();
    return /T\d{2}:\d{2}/.test(stored) ? stored.slice(0, 16) : stored + 'T00:00';
  }

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
    state.pendingPdfThumb = null;
    els.pdfFileName.textContent = '';
    els.pdfFileInput.value = '';
    if (els.pdfThumbFileName) els.pdfThumbFileName.textContent = '';
    if (els.pdfThumbFileInput) els.pdfThumbFileInput.value = '';
    state.storyImages = [];

    if (id && sourceType) {
      var arr = state.raw[TYPE_TO_ARRAY[sourceType]];
      var item = arr.find(function (i) { return i.id === id; });
      if (!item) return;
      els.editorHeading.textContent = 'Edit Item';
      els.fId.value = item.id;
      els.fSourceType.value = sourceType;
      els.fType.value = sourceType;
      els.fTitle.value = item.title || '';
      els.fDate.value = toDatetimeLocalValue(item.date);
      state.tags = (item.tags || []).slice();
      state.media = (item.media || []).map(function (m) {
        return { id: genId(), kind: m.kind || 'image', url: m.url || '', placement: m.placement || 'full', width: m.width || 100, caption: m.caption || '' };
      });

      els.fCourseProblem.value = ''; els.fQuestion.value = ''; els.fSolution.value = '';
      els.fContent.value = ''; els.fImage.value = '';
      els.fLanguage.value = 'Manim'; els.fCodeSnippet.value = ''; els.fAnimationUrl.value = ''; els.fGithubUrl.value = '';
      els.fVideoUrl.value = ''; els.fYtDesc.value = '';
      els.fPdfUrl.value = ''; els.fPdfThumb.value = ''; els.fCoursePdf.value = '';
      els.fCourseDesc.value = ''; els.fCourseCoverUrl.value = ''; els.fCourseField.value = '';
      state.pendingCourseCover = null;
      if (els.courseCoverFileName) els.courseCoverFileName.textContent = '';
      state.lessons = [];

      if (sourceType === 'problem') {
        els.fCourseProblem.value = item.course || '';
        els.fQuestion.value = item.question_latex || '';
        els.fSolution.value = item.solution_latex || '';
      } else if (sourceType === 'story') {
        els.fContent.value = item.content || '';
        els.fImage.value = item.image || '';
        state.storyImages = (item.images || []).map(function (img) {
          return { id: genId(), url: img.url || '', placement: img.placement || 'full', caption: img.caption || '' };
        });
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
      } else if (sourceType === 'course') {
        els.fCourseDesc.value = item.description || '';
        els.fCourseCoverUrl.value = item.cover_thumbnail || '';
        els.fCourseField.value = item.field || '';
        state.lessons = (item.lessons || []).map(function (l) {
          return {
            id: genId(), order: (l.order != null ? l.order : 1), title: l.title || '', description: l.description || '',
            video_url: l.video_url || '', pdf_url: l.pdf_url || '', github_url: l.github_url || '',
            code_snippet: l.code_snippet || '', thumbnail: l.thumbnail || ''
          };
        });
      }
    } else {
      els.editorHeading.textContent = 'Add New Item';
      els.itemForm.reset();
      els.fId.value = '';
      els.fSourceType.value = '';
      els.fType.value = 'problem';
      els.fDate.value = nowForDatetimeLocal();
      state.tags = [];
      state.media = [];
      state.lessons = [];
      state.pendingCourseCover = null;
      if (els.courseCoverFileName) els.courseCoverFileName.textContent = '';
    }

    updateTypeFields(els.fType.value);
    livePreview(els.fQuestion, els.questionPreview);
    livePreview(els.fSolution, els.solutionPreview);
    livePreview(els.fContent, els.contentPreview);
    renderTagChips();
    renderStoryImagesEditor();
    renderMediaManagerList();
    renderLessonsEditor();
    switchView('editor');
  }

  function saveItemFromForm() {
    var type = els.fType.value;
    var title = els.fTitle.value.trim();
    if (!title) { toast('error', 'Title required', 'Give this item a title before saving.'); return; }

    var record = {
      id: els.fId.value || genId(),
      title: title,
      date: els.fDate.value || nowForDatetimeLocal(),
      tags: state.tags.slice(),
      media: sanitizeMediaForSave(state.media)
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
      record.images = state.storyImages
        .filter(function (img) { return img.url && img.url.trim(); })
        .map(function (img) {
          return { url: img.url.trim(), placement: img.placement || 'full', caption: (img.caption || '').trim() };
        });
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
    } else if (type === 'course') {
      record.description = els.fCourseDesc.value.trim();
      record.cover_thumbnail = els.fCourseCoverUrl.value.trim();
      record.field = els.fCourseField.value.trim();
      record.lessons = state.lessons
        .filter(function (l) { return l.title && l.title.trim(); })
        .map(function (l) {
          return {
            id: l.id,
            order: Number(l.order) || 1,
            title: l.title.trim(),
            description: (l.description || '').trim(),
            video_url: (l.video_url || '').trim(),
            pdf_url: (l.pdf_url || '').trim(),
            github_url: (l.github_url || '').trim(),
            code_snippet: (l.code_snippet || '').trim(),
            thumbnail: (l.thumbnail || '').trim()
          };
        });
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
      chip.innerHTML = escapeHtml(formatTagLabel(tag)) + '<button type="button" aria-label="Remove tag"><svg aria-hidden="true"><use href="#i-close"/></svg></button>';
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
     PDF thumbnail upload (optional, staged for commit like the PDF itself)
     ------------------------------------------------------------------- */

  function bindPdfThumbDrop() {
    if (!els.pdfThumbDrop) return;
    els.pdfThumbDrop.addEventListener('click', function () { els.pdfThumbFileInput.click(); });
    els.pdfThumbDrop.addEventListener('dragover', function (e) { e.preventDefault(); els.pdfThumbDrop.classList.add('is-drag'); });
    els.pdfThumbDrop.addEventListener('dragleave', function () { els.pdfThumbDrop.classList.remove('is-drag'); });
    els.pdfThumbDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.pdfThumbDrop.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePdfThumbFile(e.dataTransfer.files[0]);
    });
    els.pdfThumbFileInput.addEventListener('change', function () {
      if (els.pdfThumbFileInput.files[0]) handlePdfThumbFile(els.pdfThumbFileInput.files[0]);
    });
  }

  function handlePdfThumbFile(file) {
    if (file.type.indexOf('image/') !== 0) { toast('error', 'Not an image', 'Please choose an image file.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      state.pendingPdfThumb = { fileName: sanitizeFileName(file.name), base64: base64 };
      els.pdfThumbFileName.textContent = state.pendingPdfThumb.fileName + ' — ' + Math.round(file.size / 1024) + ' KB (staged)';
      els.fPdfThumb.value = 'assets/img/' + state.pendingPdfThumb.fileName;
    };
    reader.readAsDataURL(file);
  }

  /* ---------------------------------------------------------------------
     Story: multiple images with placement (inline / full-width / left / right)
     ------------------------------------------------------------------- */

  var IMG_PLACEMENTS = [
    { value: 'inline', label: 'Inline (centered)' },
    { value: 'full', label: 'Full-width divider' },
    { value: 'left', label: 'Wrap left' },
    { value: 'right', label: 'Wrap right' }
  ];

  function bindStoryImages() {
    if (!els.addStoryImageBtn) return;
    els.addStoryImageBtn.addEventListener('click', function () {
      state.storyImages.push({ id: genId(), url: '', placement: 'full', caption: '' });
      renderStoryImagesEditor();
    });
  }

  function renderStoryImagesEditor() {
    if (!els.storyImagesList) return;
    els.storyImagesList.innerHTML = '';
    state.storyImages.forEach(function (img) {
      var row = document.createElement('div');
      row.className = 'story-image-row';
      row.dataset.id = img.id;

      var fields = document.createElement('div');
      fields.className = 'story-image-fields';
      fields.innerHTML =
        '<input type="text" class="si-url" placeholder="Image URL — assets/img/…" value="' + escapeHtml(img.url) + '">' +
        '<input type="text" class="si-caption" placeholder="Caption (optional)" value="' + escapeHtml(img.caption || '') + '">';
      row.appendChild(fields);

      var select = document.createElement('select');
      select.className = 'si-placement';
      IMG_PLACEMENTS.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.value; opt.textContent = p.label;
        if (p.value === (img.placement || 'full')) opt.selected = true;
        select.appendChild(opt);
      });
      row.appendChild(select);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn danger';
      removeBtn.setAttribute('aria-label', 'Remove image');
      removeBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-trash"/></svg>';
      row.appendChild(removeBtn);

      row.querySelector('.si-url').addEventListener('input', function (e) { img.url = e.target.value; });
      row.querySelector('.si-caption').addEventListener('input', function (e) { img.caption = e.target.value; });
      select.addEventListener('change', function (e) { img.placement = e.target.value; });
      removeBtn.addEventListener('click', function () {
        state.storyImages = state.storyImages.filter(function (i) { return i.id !== img.id; });
        renderStoryImagesEditor();
      });

      els.storyImagesList.appendChild(row);
    });
  }

  /* ---------------------------------------------------------------------
     Fields of Mathematics — dynamic create / edit / delete, synced into
     data.json's meta.fields. Drives the "Field of Mathematics" datalists
     and the tag-formatting used everywhere (item table, tag chips, and
     the public filter panel via app.js reading the same meta.fields).
     ------------------------------------------------------------------- */

  function bindFieldsManager() {
    if (!els.newFieldLabel) return;
    els.newFieldLabel.addEventListener('input', function () {
      els.newFieldSlugPreview.textContent = els.newFieldLabel.value.trim() ? slugifyField(els.newFieldLabel.value) : '';
    });
    els.addFieldBtn.addEventListener('click', function () {
      var label = els.newFieldLabel.value.trim();
      if (!label) { toast('error', 'Name required', 'Give the field a name first.'); return; }
      var slug = slugifyField(label);
      if (!slug) { toast('error', 'Invalid name', 'Use letters or numbers.'); return; }
      var fields = getFields();
      if (fields.some(function (f) { return f.slug === slug; })) {
        toast('error', 'Already exists', 'A field with that name already exists.');
        return;
      }
      fields.push({ slug: slug, label: label });
      state.dirty = true;
      els.newFieldLabel.value = '';
      els.newFieldSlugPreview.textContent = '';
      renderFieldsManagerList();
      refreshFieldDatalists();
      updateCommitBar();
      toast('success', 'Field added', '"' + label + '" is now available across the site.');
    });
  }

  function renderFieldsManagerList() {
    if (!els.fieldsManagerList) return;
    var fields = getFields();
    els.fieldsManagerList.innerHTML = '';
    if (!fields.length) {
      els.fieldsManagerList.innerHTML = '<p class="hint" style="margin:0;">No fields yet — add one below.</p>';
      return;
    }
    fields.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'fields-manager-row';
      row.innerHTML =
        '<input type="text" class="fm-label" value="' + escapeHtml(f.label) + '">' +
        '<span class="mono">' + escapeHtml(f.slug) + '</span>';
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn danger';
      delBtn.setAttribute('aria-label', 'Delete field');
      delBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-trash"/></svg>';
      row.appendChild(delBtn);

      row.querySelector('.fm-label').addEventListener('change', function (e) {
        f.label = e.target.value.trim() || f.label;
        state.dirty = true;
        updateCommitBar();
        renderItems();
      });
      delBtn.addEventListener('click', function () {
        if (!confirm('Delete the "' + f.label + '" field? Items already tagged with it will keep the tag, but it will stop showing up as a suggested field or filter.')) return;
        state.raw.meta.fields = getFields().filter(function (x) { return x.slug !== f.slug; });
        state.dirty = true;
        renderFieldsManagerList();
        refreshFieldDatalists();
        updateCommitBar();
      });

      els.fieldsManagerList.appendChild(row);
    });
  }

  function refreshFieldDatalists() {
    var fields = getFields();
    var labelList = document.getElementById('fieldsOfMathList');
    var slugList = document.getElementById('fieldsOfMathTagList');
    if (labelList) labelList.innerHTML = fields.map(function (f) { return '<option value="' + escapeHtml(f.label) + '">'; }).join('');
    if (slugList) slugList.innerHTML = fields.map(function (f) { return '<option value="' + escapeHtml(f.slug) + '">'; }).join('');
  }

  /* ---------------------------------------------------------------------
     Universal media manager — optional images/video on ANY content type.
     Each entry: { id, kind: 'image'|'video', url, placement, width, caption }.
     Uploaded files are staged (base64 kept only in memory, never written
     into state.raw) and get a final asset path immediately, matching the
     existing PDF/avatar upload pattern; the actual bytes are queued in
     state.pendingUploads and pushed to GitHub on commit.
     ------------------------------------------------------------------- */

  var MEDIA_ALIGN = [
    { value: 'left', label: 'Left' },
    { value: 'inline', label: 'Center' },
    { value: 'right', label: 'Right' },
    { value: 'full', label: 'Full width' }
  ];

  function bindMediaManager() {
    if (!els.mediaDropZone) return;
    els.mediaDropZone.addEventListener('click', function () { els.mediaFileInput.click(); });
    els.mediaDropZone.addEventListener('dragover', function (e) { e.preventDefault(); els.mediaDropZone.classList.add('is-drag'); });
    els.mediaDropZone.addEventListener('dragleave', function () { els.mediaDropZone.classList.remove('is-drag'); });
    els.mediaDropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      els.mediaDropZone.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleMediaFiles(e.dataTransfer.files);
    });
    els.mediaFileInput.addEventListener('change', function () {
      if (els.mediaFileInput.files.length) handleMediaFiles(els.mediaFileInput.files);
      els.mediaFileInput.value = '';
    });
    els.addMediaUrlBtn.addEventListener('click', function () {
      state.media.push({ id: genId(), kind: 'image', url: '', placement: 'full', width: 100, caption: '' });
      renderMediaManagerList();
    });
  }

  function handleMediaFiles(fileList) {
    Array.prototype.forEach.call(fileList, function (file) {
      var isImage = file.type.indexOf('image/') === 0;
      var isVideo = file.type.indexOf('video/') === 0;
      if (!isImage && !isVideo) { toast('error', 'Unsupported file', file.name + ' is not an image or video.'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(',')[1];
        var folder = isImage ? 'assets/img/' : 'assets/media/';
        var fileName = genId() + '-' + sanitizeFileName(file.name);
        var finalPath = folder + fileName;
        state.pendingUploads.push({ folder: folder, fileName: fileName, base64: base64 });
        state.media.push({
          id: genId(), kind: isImage ? 'image' : 'video', url: finalPath, placement: 'full', width: 100, caption: '',
          _previewDataUrl: reader.result
        });
        state.dirty = true;
        renderMediaManagerList();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderMediaManagerList() {
    if (!els.mediaManagerList) return;
    els.mediaManagerList.innerHTML = '';
    state.media.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'media-row';

      var thumb = document.createElement('div');
      thumb.className = 'media-thumb';
      if (m.kind === 'image' && (m._previewDataUrl || m.url)) {
        thumb.innerHTML = '<img src="' + (m._previewDataUrl || escapeHtml(m.url)) + '" alt="">';
      } else if (m.kind === 'video') {
        thumb.innerHTML = '<svg aria-hidden="true" style="width:22px;height:22px;color:var(--ink-faint);"><use href="#i-play"/></svg>';
      } else {
        thumb.innerHTML = '<svg aria-hidden="true" style="width:22px;height:22px;color:var(--ink-faint);"><use href="#i-image"/></svg>';
      }
      row.appendChild(thumb);

      var fields = document.createElement('div');
      fields.className = 'media-fields';

      var kindSelect = document.createElement('select');
      ['image', 'video'].forEach(function (k) {
        var opt = document.createElement('option');
        opt.value = k; opt.textContent = k === 'image' ? 'Image' : 'Video (YouTube or direct link)';
        if (k === m.kind) opt.selected = true;
        kindSelect.appendChild(opt);
      });
      fields.appendChild(kindSelect);

      var urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.placeholder = m.kind === 'video' ? 'https://youtu.be/… or direct video URL' : 'assets/img/… or paste an image URL';
      urlInput.value = m.url || '';
      urlInput.readOnly = !!m._previewDataUrl;
      fields.appendChild(urlInput);

      var captionInput = document.createElement('input');
      captionInput.type = 'text';
      captionInput.placeholder = 'Caption (optional)';
      captionInput.value = m.caption || '';
      fields.appendChild(captionInput);

      var controlsRow = document.createElement('div');
      controlsRow.className = 'media-controls-row';

      var alignGroup = document.createElement('div');
      alignGroup.className = 'media-align-group';
      MEDIA_ALIGN.forEach(function (a) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = a.label;
        btn.className = (m.placement || 'full') === a.value ? 'is-active' : '';
        btn.addEventListener('click', function () {
          m.placement = a.value;
          renderMediaManagerList();
        });
        alignGroup.appendChild(btn);
      });
      controlsRow.appendChild(alignGroup);

      if (m.placement !== 'full') {
        var sizeGroup = document.createElement('div');
        sizeGroup.className = 'media-size-group';
        var range = document.createElement('input');
        range.type = 'range'; range.min = 25; range.max = 100; range.step = 5;
        range.value = m.width || 100;
        var sizeLabel = document.createElement('span');
        sizeLabel.textContent = (m.width || 100) + '%';
        range.addEventListener('input', function () { m.width = Number(range.value); sizeLabel.textContent = m.width + '%'; });
        sizeGroup.appendChild(range);
        sizeGroup.appendChild(sizeLabel);
        controlsRow.appendChild(sizeGroup);
      }
      fields.appendChild(controlsRow);
      row.appendChild(fields);

      var rowActions = document.createElement('div');
      rowActions.className = 'media-row-actions';
      if (m.kind === 'image' && m._previewDataUrl) {
        var cropBtn = document.createElement('button');
        cropBtn.type = 'button';
        cropBtn.className = 'icon-btn';
        cropBtn.setAttribute('aria-label', 'Crop image');
        cropBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-crop"/></svg>';
        cropBtn.addEventListener('click', function () { openCropper(m, function () { renderMediaManagerList(); }); });
        rowActions.appendChild(cropBtn);
      }
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn danger';
      removeBtn.setAttribute('aria-label', 'Remove media');
      removeBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-trash"/></svg>';
      removeBtn.addEventListener('click', function () {
        state.media = state.media.filter(function (x) { return x.id !== m.id; });
        renderMediaManagerList();
      });
      rowActions.appendChild(removeBtn);
      row.appendChild(rowActions);

      kindSelect.addEventListener('change', function () { m.kind = kindSelect.value; renderMediaManagerList(); });
      urlInput.addEventListener('input', function () { if (!urlInput.readOnly) m.url = urlInput.value; });
      captionInput.addEventListener('input', function () { m.caption = captionInput.value; });

      els.mediaManagerList.appendChild(row);
    });
  }

  /* Strips admin-only transient fields (local preview data URLs) before a
     media list is written into the record that ends up in data.json. */
  function sanitizeMediaForSave(list) {
    return (list || [])
      .filter(function (m) { return m.url && m.url.trim(); })
      .map(function (m) {
        return { id: m.id, kind: m.kind || 'image', url: m.url.trim(), placement: m.placement || 'full', width: m.width || 100, caption: (m.caption || '').trim() };
      });
  }

  /* ---------------------------------------------------------------------
     Simple built-in image cropper — drag a rectangle over the staged
     image, then re-encode just that region. Works only on images staged
     via file upload in this session (we need the actual pixel data).
     ------------------------------------------------------------------- */

  var cropperState = { target: null, onDone: null, dragging: false, startX: 0, startY: 0, rect: null };

  function openCropper(mediaEntry, onDone) {
    if (!els.cropperBackdrop || !mediaEntry._previewDataUrl) return;
    cropperState.target = mediaEntry;
    cropperState.onDone = onDone;
    cropperState.rect = null;
    els.cropperSelection.style.display = 'none';
    els.cropperImg.src = mediaEntry._previewDataUrl;
    els.cropperBackdrop.classList.add('is-open');
  }

  function closeCropper() {
    els.cropperBackdrop.classList.remove('is-open');
    cropperState.target = null;
  }

  function bindCropper() {
    if (!els.cropperBackdrop) return;
    els.cropperCancelBtn.addEventListener('click', closeCropper);
    els.cropperBackdrop.addEventListener('click', function (e) { if (e.target === els.cropperBackdrop) closeCropper(); });

    function pointerPos(e) {
      var rect = els.cropperStage.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return { x: Math.max(0, Math.min(p.clientX - rect.left, rect.width)), y: Math.max(0, Math.min(p.clientY - rect.top, rect.height)) };
    }

    function start(e) {
      if (e.target === els.cropperCancelBtn || e.target === els.cropperApplyBtn) return;
      e.preventDefault();
      var pos = pointerPos(e);
      cropperState.dragging = true;
      cropperState.startX = pos.x;
      cropperState.startY = pos.y;
      els.cropperSelection.style.display = 'block';
      updateSelection(pos.x, pos.y);
    }
    function move(e) {
      if (!cropperState.dragging) return;
      e.preventDefault();
      var pos = pointerPos(e);
      updateSelection(pos.x, pos.y);
    }
    function end() { cropperState.dragging = false; }

    function updateSelection(x, y) {
      var left = Math.min(x, cropperState.startX), top = Math.min(y, cropperState.startY);
      var w = Math.abs(x - cropperState.startX), h = Math.abs(y - cropperState.startY);
      cropperState.rect = { left: left, top: top, width: w, height: h };
      els.cropperSelection.style.left = left + 'px';
      els.cropperSelection.style.top = top + 'px';
      els.cropperSelection.style.width = w + 'px';
      els.cropperSelection.style.height = h + 'px';
    }

    els.cropperStage.addEventListener('mousedown', start);
    els.cropperStage.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    els.cropperStage.addEventListener('touchstart', start, { passive: false });
    els.cropperStage.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);

    els.cropperApplyBtn.addEventListener('click', function () {
      var m = cropperState.target;
      if (!m || !cropperState.rect || cropperState.rect.width < 6 || cropperState.rect.height < 6) {
        toast('error', 'Draw a crop area', 'Drag a rectangle over the image first.');
        return;
      }
      var img = els.cropperImg;
      var scaleX = img.naturalWidth / img.clientWidth;
      var scaleY = img.naturalHeight / img.clientHeight;
      var sx = cropperState.rect.left * scaleX, sy = cropperState.rect.top * scaleY;
      var sw = cropperState.rect.width * scaleX, sh = cropperState.rect.height * scaleY;

      var canvas = document.createElement('canvas');
      canvas.width = sw; canvas.height = sh;
      var ctx = canvas.getContext('2d');
      var tempImg = new Image();
      tempImg.onload = function () {
        ctx.drawImage(tempImg, sx, sy, sw, sh, 0, 0, sw, sh);
        var dataUrl = canvas.toDataURL('image/png');
        var base64 = dataUrl.split(',')[1];
        var fileName = genId() + '-cropped.png';
        // Replace whatever was previously queued for this entry with the cropped version.
        state.pendingUploads = state.pendingUploads.filter(function (u) { return 'assets/img/' + u.fileName !== m.url; });
        state.pendingUploads.push({ folder: 'assets/img/', fileName: fileName, base64: base64 });
        m.url = 'assets/img/' + fileName;
        m._previewDataUrl = dataUrl;
        closeCropper();
        if (cropperState.onDone) cropperState.onDone();
        toast('success', 'Cropped', 'The image will use the cropped version once committed.');
      };
      tempImg.src = img.src;
    });
  }

  /* ---------------------------------------------------------------------
     Course cover upload (singular, like the PDF thumbnail pattern)
     ------------------------------------------------------------------- */

  function bindCourseCoverDrop() {
    if (!els.courseCoverDrop) return;
    els.courseCoverDrop.addEventListener('click', function () { els.courseCoverFileInput.click(); });
    els.courseCoverDrop.addEventListener('dragover', function (e) { e.preventDefault(); els.courseCoverDrop.classList.add('is-drag'); });
    els.courseCoverDrop.addEventListener('dragleave', function () { els.courseCoverDrop.classList.remove('is-drag'); });
    els.courseCoverDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.courseCoverDrop.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleCourseCoverFile(e.dataTransfer.files[0]);
    });
    els.courseCoverFileInput.addEventListener('change', function () {
      if (els.courseCoverFileInput.files[0]) handleCourseCoverFile(els.courseCoverFileInput.files[0]);
    });
  }

  function handleCourseCoverFile(file) {
    if (file.type.indexOf('image/') !== 0) { toast('error', 'Not an image', 'Please choose an image file.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      var fileName = genId() + '-' + sanitizeFileName(file.name);
      state.pendingUploads.push({ folder: 'assets/img/', fileName: fileName, base64: base64 });
      els.courseCoverFileName.textContent = fileName + ' — ' + Math.round(file.size / 1024) + ' KB (staged)';
      els.fCourseCoverUrl.value = 'assets/img/' + fileName;
      state.dirty = true;
    };
    reader.readAsDataURL(file);
  }

  /* ---------------------------------------------------------------------
     Courses: lessons sub-editor. Explicit numeric "order" sets display
     sequence on the public course page. PDF notes / YouTube / GitHub /
     code snippet are all optional per lesson.
     ------------------------------------------------------------------- */

  function bindLessonsEditor() {
    if (!els.addLessonBtn) return;
    els.addLessonBtn.addEventListener('click', function () {
      state.lessons.push({
        id: genId(), order: state.lessons.length + 1, title: '', description: '',
        video_url: '', pdf_url: '', github_url: '', code_snippet: '', thumbnail: ''
      });
      renderLessonsEditor();
    });
  }

  function renderLessonsEditor() {
    if (!els.lessonsEditorList) return;
    els.lessonsEditorList.innerHTML = '';
    state.lessons.forEach(function (lesson, idx) {
      var row = document.createElement('div');
      row.className = 'lesson-editor-row';

      var head = document.createElement('div');
      head.className = 'lesson-editor-head';
      head.innerHTML = '<strong>Lesson ' + (idx + 1) + '</strong>';
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn danger';
      removeBtn.setAttribute('aria-label', 'Remove lesson');
      removeBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-trash"/></svg>';
      removeBtn.addEventListener('click', function () {
        state.lessons = state.lessons.filter(function (l) { return l.id !== lesson.id; });
        renderLessonsEditor();
      });
      head.appendChild(removeBtn);
      row.appendChild(head);

      var rowTop = document.createElement('div');
      rowTop.className = 'field-row';
      rowTop.innerHTML =
        '<div class="field" style="margin-bottom:0;"><label>Order</label><input type="number" class="ln-order order-input" min="1" step="1" value="' + (lesson.order || idx + 1) + '"></div>' +
        '<div class="field" style="margin-bottom:0;"><label>Title</label><input type="text" class="ln-title" placeholder="Lesson title" value="' + escapeHtml(lesson.title) + '"></div>';
      row.appendChild(rowTop);

      var descField = document.createElement('div');
      descField.className = 'field';
      descField.innerHTML = '<label>Description (optional)</label><textarea class="ln-desc" style="min-height:60px; font-family:inherit; font-size:0.85rem;">' + escapeHtml(lesson.description) + '</textarea>';
      row.appendChild(descField);

      var thumbField = document.createElement('div');
      thumbField.className = 'field';
      thumbField.innerHTML =
        '<label>Thumbnail (optional)</label>' +
        '<div class="media-drop-mini ln-thumb-drop">Click or drag an image here' + (lesson.thumbnail ? ' — staged' : '') + '</div>' +
        '<input type="file" class="ln-thumb-input" accept="image/*" hidden>' +
        '<input type="text" class="ln-thumb-url" placeholder="or paste an image URL" value="' + escapeHtml(lesson.thumbnail) + '" style="margin-top:8px;">';
      row.appendChild(thumbField);

      var attachRow1 = document.createElement('div');
      attachRow1.className = 'field-row';
      attachRow1.innerHTML =
        '<div class="field" style="margin-bottom:0;"><label>YouTube link (optional)</label><input type="url" class="ln-video" placeholder="https://youtu.be/…" value="' + escapeHtml(lesson.video_url) + '"></div>' +
        '<div class="field" style="margin-bottom:0;"><label>GitHub link (optional)</label><input type="url" class="ln-github" placeholder="https://github.com/…" value="' + escapeHtml(lesson.github_url) + '"></div>';
      row.appendChild(attachRow1);

      var pdfField = document.createElement('div');
      pdfField.className = 'field';
      pdfField.innerHTML =
        '<label>PDF notes (optional)</label>' +
        '<div class="media-drop-mini ln-pdf-drop">Click or drag a PDF here' + (lesson.pdf_url ? ' — staged' : '') + '</div>' +
        '<input type="file" class="ln-pdf-input" accept="application/pdf" hidden>' +
        '<input type="text" class="ln-pdf-url" placeholder="or paste a PDF path/URL" value="' + escapeHtml(lesson.pdf_url) + '" style="margin-top:8px;">';
      row.appendChild(pdfField);

      var codeField = document.createElement('div');
      codeField.className = 'field';
      codeField.innerHTML = '<label>Code snippet (optional)</label><textarea class="ln-code" style="min-height:80px;">' + escapeHtml(lesson.code_snippet) + '</textarea>';
      row.appendChild(codeField);

      // Wire simple fields
      row.querySelector('.ln-order').addEventListener('input', function (e) { lesson.order = Number(e.target.value) || 1; });
      row.querySelector('.ln-title').addEventListener('input', function (e) { lesson.title = e.target.value; });
      row.querySelector('.ln-desc').addEventListener('input', function (e) { lesson.description = e.target.value; });
      row.querySelector('.ln-video').addEventListener('input', function (e) { lesson.video_url = e.target.value; });
      row.querySelector('.ln-github').addEventListener('input', function (e) { lesson.github_url = e.target.value; });
      row.querySelector('.ln-code').addEventListener('input', function (e) { lesson.code_snippet = e.target.value; });
      row.querySelector('.ln-thumb-url').addEventListener('input', function (e) { lesson.thumbnail = e.target.value; });
      row.querySelector('.ln-pdf-url').addEventListener('input', function (e) { lesson.pdf_url = e.target.value; });

      // Wire mini uploads (thumbnail + PDF), staged the same way as the course cover.
      bindMiniDrop(row.querySelector('.ln-thumb-drop'), row.querySelector('.ln-thumb-input'), function (file) {
        if (file.type.indexOf('image/') !== 0) { toast('error', 'Not an image', 'Please choose an image file.'); return; }
        stageFileForLesson(file, 'assets/img/', function (path) {
          lesson.thumbnail = path;
          row.querySelector('.ln-thumb-url').value = path;
        });
      });
      bindMiniDrop(row.querySelector('.ln-pdf-drop'), row.querySelector('.ln-pdf-input'), function (file) {
        if (file.type !== 'application/pdf') { toast('error', 'Not a PDF', 'Please choose a .pdf file.'); return; }
        stageFileForLesson(file, normalizeFolder(state.settings.assetPath || 'assets/pdf/'), function (path) {
          lesson.pdf_url = path;
          row.querySelector('.ln-pdf-url').value = path;
        });
      });

      els.lessonsEditorList.appendChild(row);
    });
  }

  function bindMiniDrop(dropEl, inputEl, onFile) {
    if (!dropEl || !inputEl) return;
    dropEl.addEventListener('click', function () { inputEl.click(); });
    dropEl.addEventListener('dragover', function (e) { e.preventDefault(); dropEl.classList.add('is-drag'); });
    dropEl.addEventListener('dragleave', function () { dropEl.classList.remove('is-drag'); });
    dropEl.addEventListener('drop', function (e) {
      e.preventDefault();
      dropEl.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
    });
    inputEl.addEventListener('change', function () { if (inputEl.files[0]) onFile(inputEl.files[0]); });
  }

  function stageFileForLesson(file, folder, onStaged) {
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      var fileName = genId() + '-' + sanitizeFileName(file.name);
      state.pendingUploads.push({ folder: folder, fileName: fileName, base64: base64 });
      state.dirty = true;
      onStaged(folder + fileName);
      toast('info', 'Staged', fileName + ' will upload on commit.');
    };
    reader.readAsDataURL(file);
  }

  /* ---------------------------------------------------------------------
     About page profile image (optional, stored in data.json meta.avatarUrl)
     ------------------------------------------------------------------- */

  function bindAvatarUpload() {
    if (!els.avatarDrop) return;
    els.avatarDrop.addEventListener('click', function () { els.avatarFileInput.click(); });
    els.avatarDrop.addEventListener('dragover', function (e) { e.preventDefault(); els.avatarDrop.classList.add('is-drag'); });
    els.avatarDrop.addEventListener('dragleave', function () { els.avatarDrop.classList.remove('is-drag'); });
    els.avatarDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.avatarDrop.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleAvatarFile(e.dataTransfer.files[0]);
    });
    els.avatarFileInput.addEventListener('change', function () {
      if (els.avatarFileInput.files[0]) handleAvatarFile(els.avatarFileInput.files[0]);
    });
    els.sAvatarUrl.addEventListener('input', function () {
      state.raw.meta.avatarUrl = els.sAvatarUrl.value.trim();
      state.dirty = true;
      updateAvatarPreview();
      updateCommitBar();
    });
  }

  function handleAvatarFile(file) {
    if (file.type.indexOf('image/') !== 0) { toast('error', 'Not an image', 'Please choose an image file.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      state.pendingAvatar = { fileName: sanitizeFileName(file.name), base64: base64 };
      els.avatarFileName.textContent = state.pendingAvatar.fileName + ' — ' + Math.round(file.size / 1024) + ' KB (staged)';
      var path = 'assets/img/' + state.pendingAvatar.fileName;
      els.sAvatarUrl.value = path;
      state.raw.meta.avatarUrl = path;
      state.dirty = true;
      updateAvatarPreview();
      updateCommitBar();
    };
    reader.readAsDataURL(file);
  }

  function updateAvatarPreview() {
    if (!els.avatarPreview) return;
    var url = state.raw.meta.avatarUrl || '';
    // A staged (not-yet-committed) upload can't be previewed by URL, so only
    // preview when it's an already-reachable path/URL rather than a local file.
    if (url && !state.pendingAvatar) {
      els.avatarPreview.src = url;
      els.avatarPreview.hidden = false;
    } else {
      els.avatarPreview.hidden = true;
    }
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
      state.raw.youtube.length + state.raw.pdf.length + state.raw.courses.length;
  }

  function updateCommitBar() {
    els.commitBar.style.display = state.dirty ? 'flex' : 'none';
    els.commitBarText.textContent = state.dirty
      ? 'You have unsaved local changes (' + totalItemCount() + ' items total).'
      : '';
  }

  function buildPayload() {
    return {
      meta: {
        schemaVersion: '3.0.0',
        siteTitle: 'Anur Qoradalov',
        updatedAt: new Date().toISOString(),
        avatarUrl: state.raw.meta.avatarUrl || '',
        fields: getFields()
      },
      courses: state.raw.courses,
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

      if (state.pendingPdfThumb) {
        toast('info', 'Uploading thumbnail…', state.pendingPdfThumb.fileName);
        var thumbPath = 'assets/img/' + state.pendingPdfThumb.fileName;
        var existingThumb = await ghGetFileRaw(thumbPath).catch(function () { return null; });
        await ghPutFile(thumbPath, state.pendingPdfThumb.base64, 'Add asset: ' + state.pendingPdfThumb.fileName, existingThumb ? existingThumb.sha : undefined);
        toast('success', 'Thumbnail uploaded', thumbPath);
        state.pendingPdfThumb = null;
      }

      if (state.pendingAvatar) {
        toast('info', 'Uploading profile picture…', state.pendingAvatar.fileName);
        var avatarPath = 'assets/img/' + state.pendingAvatar.fileName;
        var existingAvatar = await ghGetFileRaw(avatarPath).catch(function () { return null; });
        await ghPutFile(avatarPath, state.pendingAvatar.base64, 'Add asset: ' + state.pendingAvatar.fileName, existingAvatar ? existingAvatar.sha : undefined);
        toast('success', 'Profile picture uploaded', avatarPath);
        state.pendingAvatar = null;
        updateAvatarPreview();
      }

      if (state.pendingUploads.length) {
        toast('info', 'Uploading media…', state.pendingUploads.length + ' file(s) staged.');
        for (var i = 0; i < state.pendingUploads.length; i++) {
          var u = state.pendingUploads[i];
          var uPath = u.folder + u.fileName;
          var uExisting = await ghGetFileRaw(uPath).catch(function () { return null; });
          await ghPutFile(uPath, u.base64, 'Add asset: ' + u.fileName, uExisting ? uExisting.sha : undefined);
        }
        toast('success', 'Media uploaded', state.pendingUploads.length + ' file(s) pushed to ' + state.settings.assetPath.split('/')[0] + '/.');
        state.pendingUploads = [];
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
