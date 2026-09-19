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
    isConnected: false,
    itemsSearch: '',
    itemsStatusFilter: '',
    itemsTypeFilter: '',
    itemsFieldFilter: '',
    selectedIds: {}
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
    bindCodeThumbDrop();
    bindLessonsEditor();
    bindCropper();
    bindStatusToggle();
    bindItemsToolbar();
    bindSplitEditors();
    bindMediaTokenPopover();
    bindMediaLibrary();
    bindAutosave();

    populateSettingsForm();
    await loadInitialData();
    checkForAutosaveDraft();
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

    // status (draft / published)
    els.fStatus = document.getElementById('f-status');
    els.statusToggle = document.getElementById('statusToggle');

    // items list toolbar — search, filters, bulk actions
    els.itemsSearchInput = document.getElementById('itemsSearchInput');
    els.itemsStatusFilter = document.getElementById('itemsStatusFilter');
    els.itemsTypeFilter = document.getElementById('itemsTypeFilter');
    els.itemsFieldFilter = document.getElementById('itemsFieldFilter');
    els.selectAllItems = document.getElementById('selectAllItems');
    els.bulkBar = document.getElementById('bulkBar');
    els.bulkCount = document.getElementById('bulkCount');
    els.bulkStatusSelect = document.getElementById('bulkStatusSelect');
    els.bulkDeleteBtn = document.getElementById('bulkDeleteBtn');

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
    els.fCodeThumb = document.getElementById('f-code-thumb');
    els.codeThumbDrop = document.getElementById('codeThumbDrop');
    els.codeThumbFileInput = document.getElementById('codeThumbFileInput');
    els.codeThumbFileName = document.getElementById('codeThumbFileName');

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
    els.browseMediaLibraryBtn = document.getElementById('browseMediaLibraryBtn');

    // autosave banner
    els.autosaveBanner = document.getElementById('autosaveBanner');
    els.autosaveBannerText = document.getElementById('autosaveBannerText');
    els.autosaveRestoreBtn = document.getElementById('autosaveRestoreBtn');
    els.autosaveDiscardBtn = document.getElementById('autosaveDiscardBtn');

    // course
    els.fCourseDesc = document.getElementById('f-course-desc');
    els.courseDescPreview = document.getElementById('courseDescPreview');
    els.fCourseCoverUrl = document.getElementById('f-course-cover-url');
    els.fCourseField = document.getElementById('f-course-field');
    els.courseCoverDrop = document.getElementById('courseCoverDrop');
    els.courseCoverFileInput = document.getElementById('courseCoverFileInput');
    els.courseCoverFileName = document.getElementById('courseCoverFileName');
    els.lessonsEditorList = document.getElementById('lessonsEditorList');
    els.addLessonBtn = document.getElementById('addLessonBtn');

    // cropper
    els.cropperBackdrop = document.getElementById('cropperBackdrop');
    els.cropperAspectRow = document.getElementById('cropperAspectRow');
    els.cropperStage = document.getElementById('cropperStage');
    els.cropperImg = document.getElementById('cropperImg');
    els.cropperZoom = document.getElementById('cropperZoom');
    els.cropperCancelBtn = document.getElementById('cropperCancelBtn');
    els.cropperApplyBtn = document.getElementById('cropperApplyBtn');

    // media-token insert popover (shared by every split-view editor)
    els.mediaTokenBackdrop = document.getElementById('mediaTokenBackdrop');    els.mediaTokenTitle = document.getElementById('mediaTokenTitle');
    els.mediaTokenDrop = document.getElementById('mediaTokenDrop');
    els.mediaTokenFileInput = document.getElementById('mediaTokenFileInput');
    els.mediaTokenFileName = document.getElementById('mediaTokenFileName');
    els.mediaTokenUrlInput = document.getElementById('mediaTokenUrlInput');
    els.mediaTokenGalleryList = document.getElementById('mediaTokenGalleryList');
    els.mediaTokenGalleryEmpty = document.getElementById('mediaTokenGalleryEmpty');
    els.mediaTokenAlt = document.getElementById('mediaTokenAlt');
    els.mediaTokenSize = document.getElementById('mediaTokenSize');
    els.mediaTokenSizeVal = document.getElementById('mediaTokenSizeVal');
    els.mediaTokenCancelBtn = document.getElementById('mediaTokenCancelBtn');
    els.mediaTokenInsertBtn = document.getElementById('mediaTokenInsertBtn');

    // standalone Media Library modal (reused across the whole admin panel)
    els.mediaLibraryBackdrop = document.getElementById('mediaLibraryBackdrop');
    els.mediaLibraryList = document.getElementById('mediaLibraryList');
    els.mediaLibraryEmpty = document.getElementById('mediaLibraryEmpty');
    els.mediaLibraryCloseBtn = document.getElementById('mediaLibraryCloseBtn');

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

  /* Item's Field-of-Mathematics-ish "category" for the field filter, mirroring
     what course/field text each type stores (course text or field slug/tag). */
  function itemCategoryValue(item) {
    var r = item.raw;
    var val = r.course || r.field || '';
    if (val) return val;
    var fields = getFields();
    var slugs = fields.map(function (f) { return f.slug; });
    var hit = (r.tags || []).find(function (t) { return slugs.indexOf(String(t).toLowerCase()) !== -1; });
    return hit ? fieldMap()[String(hit).toLowerCase()] : '';
  }

  function populateItemsFieldFilter() {
    if (!els.itemsFieldFilter) return;
    var current = els.itemsFieldFilter.value;
    var opts = ['<option value="">All fields</option>'].concat(
      getFields().map(function (f) { return '<option value="' + escapeHtml(f.label) + '">' + escapeHtml(f.label) + '</option>'; })
    );
    els.itemsFieldFilter.innerHTML = opts.join('');
    if (current) els.itemsFieldFilter.value = current;
  }

  function bindItemsToolbar() {
    if (els.itemsSearchInput) {
      els.itemsSearchInput.addEventListener('input', debounce(function () {
        state.itemsSearch = els.itemsSearchInput.value.trim().toLowerCase();
        renderItems();
      }, 150));
    }
    if (els.itemsStatusFilter) els.itemsStatusFilter.addEventListener('change', function () { state.itemsStatusFilter = els.itemsStatusFilter.value; renderItems(); });
    if (els.itemsTypeFilter) els.itemsTypeFilter.addEventListener('change', function () { state.itemsTypeFilter = els.itemsTypeFilter.value; renderItems(); });
    if (els.itemsFieldFilter) els.itemsFieldFilter.addEventListener('change', function () { state.itemsFieldFilter = els.itemsFieldFilter.value; renderItems(); });
    if (els.selectAllItems) {
      els.selectAllItems.addEventListener('change', function () {
        var checked = els.selectAllItems.checked;
        getFilteredItems().forEach(function (item) {
          if (checked) state.selectedIds[item.id] = item.sourceType; else delete state.selectedIds[item.id];
        });
        renderItems();
      });
    }
    if (els.bulkStatusSelect) {
      els.bulkStatusSelect.addEventListener('change', function () {
        var status = els.bulkStatusSelect.value;
        if (!status) return;
        bulkSetStatus(status);
        els.bulkStatusSelect.value = '';
      });
    }
    if (els.bulkDeleteBtn) els.bulkDeleteBtn.addEventListener('click', bulkDelete);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function getFilteredItems() {
    var list = buildUnifiedList();
    if (state.itemsStatusFilter) {
      list = list.filter(function (item) { return (item.raw.status || 'published') === state.itemsStatusFilter; });
    }
    if (state.itemsTypeFilter) {
      list = list.filter(function (item) { return item.sourceType === state.itemsTypeFilter; });
    }
    if (state.itemsFieldFilter) {
      list = list.filter(function (item) { return itemCategoryValue(item) === state.itemsFieldFilter; });
    }
    if (state.itemsSearch) {
      var q = state.itemsSearch;
      list = list.filter(function (item) {
        var haystack = [item.title, item.raw.description, item.raw.content, item.raw.course, item.raw.field, item.raw.language]
          .concat(item.raw.tags || []).filter(Boolean).join(' ').toLowerCase();
        return haystack.indexOf(q) !== -1;
      });
    }
    return list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  function updateBulkBar() {
    if (!els.bulkBar) return;
    var count = Object.keys(state.selectedIds).length;
    els.bulkBar.hidden = count === 0;
    if (els.bulkCount) els.bulkCount.textContent = count + ' selected';
  }

  function bulkSetStatus(status) {
    var ids = state.selectedIds;
    Object.keys(ids).forEach(function (id) {
      var arr = state.raw[TYPE_TO_ARRAY[ids[id]]];
      var it = arr && arr.find(function (i) { return i.id === id; });
      if (it) it.status = status;
    });
    var n = Object.keys(ids).length;
    state.dirty = true;
    renderItems();
    updateCommitBar();
    toast('success', 'Status updated', n + ' item' + (n === 1 ? '' : 's') + ' marked ' + status + '.');
  }

  function bulkDelete() {
    var ids = state.selectedIds;
    var n = Object.keys(ids).length;
    if (!n) return;
    if (!window.confirm('Delete ' + n + ' selected item' + (n === 1 ? '' : 's') + '? This cannot be undone once committed.')) return;
    Object.keys(ids).forEach(function (id) {
      var arrKey = TYPE_TO_ARRAY[ids[id]];
      state.raw[arrKey] = state.raw[arrKey].filter(function (i) { return i.id !== id; });
    });
    state.selectedIds = {};
    state.dirty = true;
    renderItems();
    updateCommitBar();
    toast('success', 'Items deleted', n + ' item' + (n === 1 ? '' : 's') + ' removed. Commit to make it permanent.');
  }

  function renderItems() {
    populateItemsFieldFilter();
    var list = getFilteredItems();
    els.itemRows.innerHTML = '';

    // Drop selections for items no longer present (e.g. deleted individually).
    var allIds = {};
    buildUnifiedList().forEach(function (item) { allIds[item.id] = true; });
    Object.keys(state.selectedIds).forEach(function (id) { if (!allIds[id]) delete state.selectedIds[id]; });

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'item-row';
      empty.innerHTML = '<div class="mono" style="grid-column:1/-1;color:var(--ink-faint);">No items match your search or filters.</div>';
      els.itemRows.appendChild(empty);
      if (els.selectAllItems) els.selectAllItems.checked = false;
      updateBulkBar();
      return;
    }
    list.forEach(function (item) {
      var desc = item.raw.description || item.raw.content || item.raw.course || item.raw.language || '';
      var status = item.raw.status === 'draft' ? 'draft' : 'published';
      var checked = !!state.selectedIds[item.id];
      var row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML =
        '<div class="it-check"><input type="checkbox" data-select="' + item.id + '" data-type="' + item.sourceType + '" ' + (checked ? 'checked' : '') + ' aria-label="Select item"></div>' +
        '<div class="it-type"><span class="tag t-' + item.sourceType + '">' + TYPE_LABEL[item.sourceType] + '</span></div>' +
        '<div class="it-titlewrap"><div class="it-title">' + escapeHtml(item.title) + '</div><div class="it-desc">' + escapeHtml(stripLatex(desc)) + '</div></div>' +
        '<div class="it-statuswrap"><span class="status-pill is-' + status + '">' + (status === 'draft' ? 'Draft' : 'Published') + '</span></div>' +
        '<div class="mono it-date">' + (item.date ? adminFormatDate(item.date) : '—') + '</div>' +
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
    els.itemRows.querySelectorAll('[data-select]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) state.selectedIds[cb.dataset.select] = cb.dataset.type;
        else delete state.selectedIds[cb.dataset.select];
        updateBulkBar();
        if (els.selectAllItems) els.selectAllItems.checked = list.every(function (item) { return !!state.selectedIds[item.id]; });
      });
    });
    if (els.selectAllItems) els.selectAllItems.checked = list.every(function (item) { return !!state.selectedIds[item.id]; });
    updateBulkBar();
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
     Rich-text mini formatter (mirrors app.js) for live previews, now with
     inline media shortcode tokens:
       ![Alt text](url){align=L size=60 mode=wrap}
       [media: url | align=R | size=50% | mode=break | alt="Description" | kind=video]
     align: L / R / C (or U) / D (full-width). mode: wrap (float, text
     flows around) or break (own block, splits the paragraph). size: a
     percentage width. kind defaults to image, or video for YouTube/direct
     video URLs.
     ------------------------------------------------------------------- */

  function escapeHtmlText(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* Inline formatting: bold before italic (bold consumes the double
     asterisks first so the italic regex never sees them), then
     strikethrough, underline, and inline code. */
  function inlineFormat(text) {
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return text;
  }

  function parseTokenAttrs(str) {
    var attrs = {};
    if (!str) return attrs;
    var parts = str.indexOf('|') !== -1 ? str.split('|') : str.trim().split(/\s+/);
    parts.forEach(function (part) {
      var m = /^\s*([a-zA-Z]+)\s*=\s*"?([^"]*?)"?\s*$/.exec(part);
      if (m && m[1]) attrs[m[1].toLowerCase()] = m[2];
    });
    return attrs;
  }
  function normalizeAlign(a) {
    a = String(a || 'c').trim().toLowerCase();
    if (a === 'u') a = 'c';
    return ['l', 'r', 'c', 'd'].indexOf(a) !== -1 ? a : 'c';
  }
  function normalizeMode(m, align) {
    m = String(m || '').trim().toLowerCase();
    if (m === 'wrap' || m === 'break') return m;
    return (align === 'l' || align === 'r') ? 'wrap' : 'break';
  }
  function normalizeSize(s) {
    var n = parseInt(String(s || '').replace('%', ''), 10);
    if (isNaN(n)) return 60;
    return Math.max(10, Math.min(100, n));
  }
  function isVideoUrl(url) {
    return /youtu\.?be/i.test(url) || /\.(mp4|webm|ogg)(\?|$)/i.test(url);
  }
  function extractYouTubeIdAdmin(url) {
    var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/.exec(String(url || ''));
    return m ? m[1] : null;
  }
  function renderMediaTokenHtml(kind, url, alt, align, mode, size) {
    align = normalizeAlign(align);
    mode = normalizeMode(mode, align);
    size = normalizeSize(size);
    var cls = 'media-token media-align-' + align + ' media-mode-' + mode;
    var style = 'style="--media-size:' + size + '%"';
    if (kind === 'video') {
      var vid = extractYouTubeIdAdmin(url);
      var thumbSrc = vid ? 'https://img.youtube.com/vi/' + vid + '/hqdefault.jpg' : '';
      return '<span class="' + cls + '" ' + style + '>' +
        '<span class="media-token-video">' +
        (thumbSrc ? '<img src="' + thumbSrc + '" alt="' + escapeHtmlText(alt || '') + '" loading="lazy">' : '') +
        '<span class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></span>' +
        '</span></span>';
    }
    return '<span class="' + cls + '" ' + style + '><img src="' + escapeHtmlText(url) + '" alt="' + escapeHtmlText(alt || '') + '" loading="lazy"></span>';
  }

  function tokenPlaceholder(idx, mode) {
    var marker = '\uE000MTK' + idx + '\uE001';
    return mode === 'break' ? ('\n\n' + marker + '\n\n') : marker;
  }

  function extractMediaTokens(raw) {
    var tokens = [];
    function pushToken(kind, url, alt, attrs) {
      var align = normalizeAlign(attrs.align);
      var mode = normalizeMode(attrs.mode, align);
      var size = normalizeSize(attrs.size);
      var idx = tokens.length;
      tokens.push({ html: renderMediaTokenHtml(kind, url, attrs.alt || alt, align, mode, size), mode: mode });
      return idx;
    }
    var text = String(raw || '');
    text = text.replace(/\[media:\s*([^|\]]+?)\s*((?:\|[^\]]*)?)\]/g, function (m, url, attrStr) {
      var attrs = parseTokenAttrs(attrStr.replace(/^\|/, ''));
      var kind = attrs.kind === 'video' ? 'video' : (isVideoUrl(url) ? 'video' : 'image');
      var idx = pushToken(kind, url.trim(), attrs.alt, attrs);
      return tokenPlaceholder(idx, tokens[idx].mode);
    });
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)\{([^}]*)\}/g, function (m, alt, url, attrStr) {
      var attrs = parseTokenAttrs(attrStr);
      var kind = attrs.kind === 'video' ? 'video' : (isVideoUrl(url) ? 'video' : 'image');
      var idx = pushToken(kind, url.trim(), attrs.alt || alt, attrs);
      return tokenPlaceholder(idx, tokens[idx].mode);
    });
    return { text: text, tokens: tokens };
  }

  /* Classifies one blank-line-separated block for rendering: a horizontal
     rule, a blockquote, a bulleted/numbered list (every line must carry
     the marker), one of three heading levels, or a plain paragraph. */
  function classifyBlock(trimmed) {
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return 'hr';
    if (/^>\s?/.test(trimmed)) return 'quote';
    var lines = trimmed.split('\n');
    if (lines.length && lines.every(function (l) { return /^[-*]\s+/.test(l); })) return 'ul';
    if (lines.length && lines.every(function (l) { return /^\d+\.\s+/.test(l); })) return 'ol';
    if (/^### /.test(trimmed)) return 'h4';
    if (/^## /.test(trimmed)) return 'h3';
    if (/^# /.test(trimmed)) return 'h2';
    return 'p';
  }

  function formatRichText(raw) {
    var extracted = extractMediaTokens(raw || '');
    var blocks = extracted.text.split(/\n\s*\n/);
    var html = blocks.map(function (block) {
      var trimmed = block.trim();
      if (!trimmed) return '';
      var breakMatch = /^\uE000MTK(\d+)\uE001$/.exec(trimmed);
      if (breakMatch && extracted.tokens[Number(breakMatch[1])]) return extracted.tokens[Number(breakMatch[1])].html;

      switch (classifyBlock(trimmed)) {
        case 'hr':
          return '<hr>';
        case 'quote':
          var quoteText = trimmed.split('\n').map(function (l) { return l.replace(/^>\s?/, ''); }).join(' ');
          return '<blockquote>' + inlineFormat(escapeHtmlText(quoteText)) + '</blockquote>';
        case 'ul':
          return '<ul>' + trimmed.split('\n').map(function (l) {
            return '<li>' + inlineFormat(escapeHtmlText(l.replace(/^[-*]\s+/, ''))) + '</li>';
          }).join('') + '</ul>';
        case 'ol':
          return '<ol>' + trimmed.split('\n').map(function (l) {
            return '<li>' + inlineFormat(escapeHtmlText(l.replace(/^\d+\.\s+/, ''))) + '</li>';
          }).join('') + '</ol>';
        case 'h4':
          return '<h4>' + inlineFormat(escapeHtmlText(trimmed.slice(4))) + '</h4>';
        case 'h3':
          return '<h3>' + inlineFormat(escapeHtmlText(trimmed.slice(3))) + '</h3>';
        case 'h2':
          return '<h2>' + inlineFormat(escapeHtmlText(trimmed.slice(2))) + '</h2>';
        default:
          return '<p>' + inlineFormat(escapeHtmlText(trimmed)).replace(/\n/g, '<br>') + '</p>';
      }
    }).join('');
    html = html.replace(/\uE000MTK(\d+)\uE001/g, function (m, idx) {
      var t = extracted.tokens[Number(idx)];
      return t ? t.html : '';
    });
    return html;
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
     Overleaf-style split-view editors: toolbar (bold/heading/math/media)
     wired to each .split-editor's textarea + live-preview pane.
     ------------------------------------------------------------------- */

  var splitEditorCursors = {};

  /* Toolbar button specs. Rendered into any empty .split-editor-toolbar via
     its data-toolbar attribute — one definition, reused across every
     split-view editor instead of duplicating the button markup per field. */
  var TOOLBAR_SPECS = {
    full: [
      { cmd: 'h2', label: 'H1', title: 'Heading (large)' },
      { cmd: 'h3', label: 'H2', title: 'Heading (medium)' },
      { cmd: 'h4', label: 'H3', title: 'Heading (small)' },
      { sep: true },
      { cmd: 'bold', icon: '#i-bold', title: 'Bold' },
      { cmd: 'italic', icon: '#i-italic', title: 'Italic' },
      { cmd: 'underline', icon: '#i-underline', title: 'Underline' },
      { cmd: 'strike', icon: '#i-strike', title: 'Strikethrough' },
      { cmd: 'code', icon: '#i-code-inline', title: 'Inline code' },
      { sep: true },
      { cmd: 'quote', icon: '#i-quote', title: 'Blockquote' },
      { cmd: 'ul', icon: '#i-list-ul', title: 'Bulleted list' },
      { cmd: 'ol', icon: '#i-list-ol', title: 'Numbered list' },
      { cmd: 'hr', icon: '#i-hr', title: 'Horizontal rule' },
      { sep: true },
      { cmd: 'math-inline', icon: '#i-sigma', label: '$', title: 'Inline math' },
      { cmd: 'math-block', icon: '#i-sigma', label: '$$', title: 'Block math' },
      { sep: true },
      { cmd: 'media-wrap-left', icon: '#i-align-left', label: 'Img L', title: 'Image, wrapped left' },
      { cmd: 'media-wrap-right', icon: '#i-align-right', label: 'Img R', title: 'Image, wrapped right' },
      { cmd: 'media-center', icon: '#i-align-center', label: 'Img C', title: 'Image, centered' },
      { cmd: 'media-full', icon: '#i-align-full', label: 'Img Full', title: 'Image, full width' },
      { cmd: 'media-video', icon: '#i-play', label: 'Video', title: 'Video' }
    ],
    basic: [
      { cmd: 'h3', label: 'H1', title: 'Heading' },
      { cmd: 'bold', icon: '#i-bold', title: 'Bold' },
      { cmd: 'italic', icon: '#i-italic', title: 'Italic' },
      { sep: true },
      { cmd: 'media-wrap-left', icon: '#i-align-left', label: 'Img L', title: 'Image, wrapped left' },
      { cmd: 'media-wrap-right', icon: '#i-align-right', label: 'Img R', title: 'Image, wrapped right' },
      { cmd: 'media-center', icon: '#i-align-center', label: 'Img C', title: 'Image, centered' },
      { cmd: 'media-full', icon: '#i-align-full', label: 'Img Full', title: 'Image, full width' }
    ]
  };

  function renderToolbar(toolbarEl) {
    var spec = TOOLBAR_SPECS[toolbarEl.dataset.toolbar] || TOOLBAR_SPECS.full;
    toolbarEl.innerHTML = spec.map(function (item) {
      if (item.sep) return '<div class="toolbar-sep"></div>';
      var icon = item.icon ? '<svg aria-hidden="true"><use href="' + item.icon + '"/></svg>' : '';
      var label = item.label ? '<span>' + item.label + '</span>' : '';
      return '<button type="button" data-cmd="' + item.cmd + '" title="' + (item.title || '') + '">' + icon + label + '</button>';
    }).join('');
  }

  function bindSplitEditors() {
    document.querySelectorAll('.split-editor').forEach(initSplitEditor);
  }

  function initSplitEditor(root) {
    var taId = root.dataset.textarea;
    var ta = document.getElementById(taId);
    var preview = document.getElementById(root.dataset.preview);
    if (!ta || !preview) return;
    var toolbarEl = root.querySelector('.split-editor-toolbar');
    if (toolbarEl) renderToolbar(toolbarEl);
    initMobileEditorTabs(root);
    splitEditorCursors[taId] = { start: ta.value.length, end: ta.value.length };
    var syncCursor = function () { splitEditorCursors[taId] = { start: ta.selectionStart, end: ta.selectionEnd }; };
    ta.addEventListener('keyup', syncCursor);
    ta.addEventListener('click', syncCursor);
    ta.addEventListener('input', syncCursor);
    root.querySelectorAll('.split-editor-toolbar [data-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function () { runSplitEditorCmd(btn.dataset.cmd, ta); });
    });
  }

  /* Mobile-only "Edit / Preview" tab bar for the split-view editor. The
     bar itself is display:none outside the mobile media query, and the
     "mobile-show-preview" class it toggles only has any visual effect
     inside that same query — so this is entirely inert on desktop. */
  function initMobileEditorTabs(root) {
    var panes = root.querySelector('.split-editor-panes');
    if (!panes || root.querySelector('.split-editor-mobile-tabs')) return;
    var tabs = document.createElement('div');
    tabs.className = 'split-editor-mobile-tabs';
    tabs.innerHTML =
      '<button type="button" data-view="edit" class="is-active">Edit</button>' +
      '<button type="button" data-view="preview">Preview</button>';
    panes.parentNode.insertBefore(tabs, panes);
    tabs.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        panes.classList.toggle('mobile-show-preview', btn.dataset.view === 'preview');
      });
    });
  }

  function insertAtCursor(ta, before, after, placeholder) {
    var cursor = splitEditorCursors[ta.id] || { start: ta.value.length, end: ta.value.length };
    var val = ta.value;
    var selected = val.slice(cursor.start, cursor.end) || placeholder || '';
    ta.value = val.slice(0, cursor.start) + before + selected + after + val.slice(cursor.end);
    var newPos = cursor.start + before.length + selected.length + after.length;
    ta.focus();
    ta.setSelectionRange(newPos, newPos);
    splitEditorCursors[ta.id] = { start: newPos, end: newPos };
    ta.dispatchEvent(new Event('input'));
  }

  /* Prefixes each line of the current selection (or a single placeholder
     line) with `prefix` — used for block-level commands like blockquote
     and lists, where every line of a multi-line selection needs the
     marker, not just the first. */
  function prefixLines(ta, prefix, placeholder) {
    var cursor = splitEditorCursors[ta.id] || { start: ta.value.length, end: ta.value.length };
    var val = ta.value;
    var selected = val.slice(cursor.start, cursor.end) || placeholder;
    var prefixed = selected.split('\n').map(function (line, i) {
      return typeof prefix === 'function' ? prefix(line, i) : prefix + line;
    }).join('\n');
    var needsLeadingBreak = cursor.start > 0 && val[cursor.start - 1] !== '\n';
    var lead = needsLeadingBreak ? '\n' : '';
    ta.value = val.slice(0, cursor.start) + lead + prefixed + val.slice(cursor.end);
    var newPos = cursor.start + lead.length + prefixed.length;
    ta.focus();
    ta.setSelectionRange(newPos, newPos);
    splitEditorCursors[ta.id] = { start: newPos, end: newPos };
    ta.dispatchEvent(new Event('input'));
  }

  var MEDIA_TOOLBAR_PRESETS = {
    'media-wrap-left': { align: 'L', mode: 'wrap', kind: 'image' },
    'media-wrap-right': { align: 'R', mode: 'wrap', kind: 'image' },
    'media-center': { align: 'C', mode: 'break', kind: 'image' },
    'media-full': { align: 'D', mode: 'break', kind: 'image' },
    'media-video': { align: 'C', mode: 'break', kind: 'video' }
  };

  function runSplitEditorCmd(cmd, ta) {
    switch (cmd) {
      case 'bold': return insertAtCursor(ta, '**', '**', 'qalın mətn');
      case 'italic': return insertAtCursor(ta, '*', '*', 'kursiv mətn');
      case 'underline': return insertAtCursor(ta, '++', '++', 'altı xətli mətn');
      case 'strike': return insertAtCursor(ta, '~~', '~~', 'üstündən xətli mətn');
      case 'code': return insertAtCursor(ta, '`', '`', 'kod');
      case 'h2': return insertAtCursor(ta, '\n# ', '\n', 'Əsas bölmə başlığı');
      case 'h3': return insertAtCursor(ta, '\n## ', '\n', 'Alt bölmə başlığı');
      case 'h4': return insertAtCursor(ta, '\n### ', '\n', 'Kiçik bölmə başlığı');
      case 'quote': return prefixLines(ta, '> ', 'Sitat mətni');
      case 'ul': return prefixLines(ta, '- ', 'Siyahı elementi');
      case 'ol': return prefixLines(ta, function (line, i) { return (i + 1) + '. ' + line; }, 'Siyahı elementi');
      case 'hr': return insertAtCursor(ta, '\n\n---\n\n', '', '');
      case 'math-inline': return insertAtCursor(ta, '$', '$', 'x^2');
      case 'math-block': return insertAtCursor(ta, '\n$$\n', '\n$$\n', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}');
      default:
        if (MEDIA_TOOLBAR_PRESETS[cmd]) openMediaTokenPopover(ta, MEDIA_TOOLBAR_PRESETS[cmd]);
    }
  }

  /* ---------------------------------------------------------------------
     Media Library — every image/video URL already used anywhere across
     data.json (plus anything staged in the current editor session), so
     it can be reused elsewhere without re-uploading. Returns { src, url,
     kind, caption }: `src` is always renderable (falls back to a local
     preview data URL for not-yet-committed uploads), `url` is the value
     that actually gets written into the record/token.
     ------------------------------------------------------------------- */

  function collectAllMediaUrls() {
    var seen = {};
    var out = [];
    function add(url, kind, caption, src) {
      if (!url || !url.trim()) return;
      if (seen[url]) return;
      seen[url] = true;
      out.push({ url: url, src: src || url, kind: kind === 'video' || isVideoUrlAdmin(url) ? 'video' : 'image', caption: caption || '' });
    }
    function isVideoUrlAdmin(u) { return /youtu\.?be/i.test(u) || /\.(mp4|webm|ogg)(\?|$)/i.test(u); }
    function addFromList(list) { (list || []).forEach(function (m) { add(m.url, m.kind, m.caption); }); }

    (state.raw.problems || []).forEach(function (p) { addFromList(p.media); });
    (state.raw.stories || []).forEach(function (s) {
      add(s.image, 'image');
      (s.images || []).forEach(function (im) { add(im.url, 'image', im.caption); });
      addFromList(s.media);
    });
    (state.raw.code_animations || []).forEach(function (c) { add(c.custom_thumbnail, 'image'); addFromList(c.media); });
    (state.raw.youtube || []).forEach(function (y) { addFromList(y.media); });
    (state.raw.pdf || []).forEach(function (d) { add(d.custom_thumbnail, 'image'); addFromList(d.media); });
    (state.raw.courses || []).forEach(function (co) {
      add(co.cover_thumbnail, 'image');
      addFromList(co.media);
      (co.lessons || []).forEach(function (l) { add(l.thumbnail, 'image'); });
    });
    if (state.raw.meta && state.raw.meta.avatarUrl) add(state.raw.meta.avatarUrl, 'image');

    // Anything staged in the item currently being edited (including
    // uncommitted uploads, which only have a local preview data URL).
    (state.media || []).forEach(function (m) { add(m.url, m.kind, m.caption, m._previewDataUrl); });
    (state.storyImages || []).forEach(function (im) { add(im.url, 'image', im.caption); });

    return out;
  }

  function openMediaLibrary(onPick) {
    if (!els.mediaLibraryBackdrop) return;
    var items = collectAllMediaUrls();
    els.mediaLibraryList.innerHTML = '';
    els.mediaLibraryEmpty.hidden = items.length > 0;
    items.forEach(function (m) {
      var thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'media-token-gallery-thumb';
      thumb.title = m.url;
      thumb.innerHTML = (m.kind === 'video' && !isLikelyImageSrc(m.src))
        ? '<svg aria-hidden="true"><use href="#i-play"/></svg>'
        : '<img src="' + escapeHtml(m.src) + '" alt="" loading="lazy">';
      thumb.addEventListener('click', function () {
        onPick({ url: m.url, dataUrl: m.src !== m.url ? m.src : '', kind: m.kind, caption: m.caption });
        closeMediaLibrary();
      });
      els.mediaLibraryList.appendChild(thumb);
    });
    els.mediaLibraryBackdrop.classList.add('is-open');
  }
  function closeMediaLibrary() { els.mediaLibraryBackdrop.classList.remove('is-open'); }
  function bindMediaLibrary() {
    if (!els.mediaLibraryBackdrop) return;
    els.mediaLibraryCloseBtn.addEventListener('click', closeMediaLibrary);
    els.mediaLibraryBackdrop.addEventListener('click', function (e) { if (e.target === els.mediaLibraryBackdrop) closeMediaLibrary(); });
  }

  /* ---------------------------------------------------------------------
     Media-token insert popover — shared by every split-view editor.
     Upload a file, paste a URL, or reuse an image already added to this
     item's "Additional media" list, then insert the shortcode token.
     ------------------------------------------------------------------- */

  var mediaTokenState = { ta: null, cursor: null, align: 'c', mode: 'break', kind: 'image', pendingFile: null, chosenUrl: '', previewDataUrl: '' };

  function bindMediaTokenPopover() {
    if (!els.mediaTokenBackdrop) return;
    els.mediaTokenBackdrop.querySelectorAll('.media-token-tabs [data-tab]').forEach(function (tabBtn) {
      tabBtn.addEventListener('click', function () { switchMediaTokenTab(tabBtn.dataset.tab); });
    });
    els.mediaTokenDrop.addEventListener('click', function () { els.mediaTokenFileInput.click(); });
    els.mediaTokenDrop.addEventListener('dragover', function (e) { e.preventDefault(); els.mediaTokenDrop.classList.add('is-drag'); });
    els.mediaTokenDrop.addEventListener('dragleave', function () { els.mediaTokenDrop.classList.remove('is-drag'); });
    els.mediaTokenDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.mediaTokenDrop.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleMediaTokenFile(e.dataTransfer.files[0]);
    });
    els.mediaTokenFileInput.addEventListener('change', function () {
      if (els.mediaTokenFileInput.files[0]) handleMediaTokenFile(els.mediaTokenFileInput.files[0]);
    });
    els.mediaTokenUrlInput.addEventListener('input', function () {
      mediaTokenState.chosenUrl = els.mediaTokenUrlInput.value.trim();
      mediaTokenState.pendingFile = null;
      mediaTokenState.previewDataUrl = '';
    });
    els.mediaTokenSize.addEventListener('input', function () {
      els.mediaTokenSizeVal.textContent = els.mediaTokenSize.value + '%';
    });
    els.mediaTokenCancelBtn.addEventListener('click', closeMediaTokenPopover);
    els.mediaTokenBackdrop.addEventListener('click', function (e) { if (e.target === els.mediaTokenBackdrop) closeMediaTokenPopover(); });
    els.mediaTokenInsertBtn.addEventListener('click', confirmMediaTokenInsert);
  }

  function switchMediaTokenTab(tab) {
    els.mediaTokenBackdrop.querySelectorAll('.media-token-tabs [data-tab]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === tab); });
    els.mediaTokenBackdrop.querySelectorAll('[data-tab-panel]').forEach(function (p) { p.hidden = p.dataset.tabPanel !== tab; });
  }

  function handleMediaTokenFile(file) {
    var isImage = file.type.indexOf('image/') === 0;
    var isVideo = file.type.indexOf('video/') === 0;
    if (!isImage && !isVideo) { toast('error', 'Unsupported file', file.name + ' is not an image or video.'); return; }
    if (isVideo) {
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(',')[1];
        var fileName = genId() + '-' + sanitizeFileName(file.name);
        mediaTokenState.pendingFile = { folder: 'assets/media/', fileName: fileName, base64: base64 };
        mediaTokenState.chosenUrl = 'assets/media/' + fileName;
        mediaTokenState.previewDataUrl = reader.result;
        mediaTokenState.kind = 'video';
        els.mediaTokenFileName.textContent = file.name + ' — ' + Math.round(file.size / 1024) + ' KB (staged)';
      };
      reader.readAsDataURL(file);
      return;
    }
    els.mediaTokenFileName.textContent = 'Processing ' + file.name + '…';
    processImageForUpload(file).then(function (res) {
      var fileName = genId() + '-' + sanitizeFileName(stripExt(file.name)) + '.' + res.ext;
      mediaTokenState.pendingFile = { folder: 'assets/img/', fileName: fileName, base64: res.base64 };
      mediaTokenState.chosenUrl = 'assets/img/' + fileName;
      mediaTokenState.previewDataUrl = res.dataUrl;
      mediaTokenState.kind = 'image';
      els.mediaTokenFileName.textContent = file.name + ' → WebP, staged';
    }).catch(function () {
      toast('error', 'Could not process image', file.name + ' could not be read.');
      els.mediaTokenFileName.textContent = '';
    });
  }

  function renderMediaTokenGallery() {
    if (!els.mediaTokenGalleryList) return;
    els.mediaTokenGalleryList.innerHTML = '';
    var items = collectAllMediaUrls();
    if (els.mediaTokenGalleryEmpty) els.mediaTokenGalleryEmpty.hidden = items.length > 0;
    items.forEach(function (m) {
      var thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'media-token-gallery-thumb';
      thumb.title = m.url;
      thumb.innerHTML = (m.kind === 'video' && !isLikelyImageSrc(m.src))
        ? '<svg aria-hidden="true"><use href="#i-play"/></svg>'
        : '<img src="' + escapeHtml(m.src) + '" alt="" loading="lazy">';
      thumb.addEventListener('click', function () {
        mediaTokenState.chosenUrl = m.url;
        mediaTokenState.previewDataUrl = '';
        mediaTokenState.pendingFile = null;
        mediaTokenState.kind = m.kind || 'image';
        els.mediaTokenGalleryList.querySelectorAll('.media-token-gallery-thumb').forEach(function (t) { t.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      });
      els.mediaTokenGalleryList.appendChild(thumb);
    });
  }
  function isLikelyImageSrc(url) { return /^data:image\//.test(url) || /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url); }

  function openMediaTokenPopover(ta, preset) {
    mediaTokenState.ta = ta;
    mediaTokenState.cursor = splitEditorCursors[ta.id] || { start: ta.value.length, end: ta.value.length };
    mediaTokenState.align = preset.align;
    mediaTokenState.mode = preset.mode;
    mediaTokenState.kind = preset.kind || 'image';
    mediaTokenState.pendingFile = null;
    mediaTokenState.chosenUrl = '';
    mediaTokenState.previewDataUrl = '';
    els.mediaTokenTitle.textContent = mediaTokenState.kind === 'video' ? 'Insert video' : 'Insert image';
    els.mediaTokenFileInput.value = '';
    els.mediaTokenFileInput.accept = mediaTokenState.kind === 'video' ? 'video/*' : 'image/*';
    els.mediaTokenFileName.textContent = '';
    els.mediaTokenUrlInput.value = '';
    els.mediaTokenAlt.value = '';
    els.mediaTokenSize.value = preset.align === 'D' ? 100 : 60;
    els.mediaTokenSizeVal.textContent = els.mediaTokenSize.value + '%';
    renderMediaTokenGallery();
    switchMediaTokenTab('upload');
    els.mediaTokenBackdrop.classList.add('is-open');
  }

  function closeMediaTokenPopover() {
    els.mediaTokenBackdrop.classList.remove('is-open');
  }

  function confirmMediaTokenInsert() {
    var url = mediaTokenState.chosenUrl;
    if (!url) { toast('error', 'Choose a file', 'Upload a file, paste a URL, or pick one from this item\u2019s media.'); return; }
    if (mediaTokenState.pendingFile) state.pendingUploads.push(mediaTokenState.pendingFile);
    var alt = els.mediaTokenAlt.value.trim().replace(/"/g, '');
    var size = els.mediaTokenSize.value;
    var align = mediaTokenState.align;
    var mode = mediaTokenState.mode;
    var token = mediaTokenState.kind === 'video'
      ? '[media: ' + url + ' | align=' + align + ' | size=' + size + '% | mode=' + mode + ' | kind=video' + (alt ? ' | alt="' + alt + '"' : '') + ']'
      : '![' + (alt || 'Image') + '](' + url + '){align=' + align + ' size=' + size + ' mode=' + mode + '}';

    var ta = mediaTokenState.ta;
    var cursor = mediaTokenState.cursor;
    var val = ta.value;
    var before = val.slice(0, cursor.start);
    var after = val.slice(cursor.end);
    if (mode === 'break') {
      if (before && !/\n\n$/.test(before)) before += (before.endsWith('\n') ? '\n' : '\n\n');
      if (after && !/^\n\n/.test(after)) after = (after.startsWith('\n') ? '\n' : '\n\n') + after;
    }
    ta.value = before + token + after;
    var newPos = before.length + token.length;
    ta.focus();
    ta.setSelectionRange(newPos, newPos);
    splitEditorCursors[ta.id] = { start: newPos, end: newPos };
    ta.dispatchEvent(new Event('input'));
    closeMediaTokenPopover();
    toast('success', mediaTokenState.kind === 'video' ? 'Video inserted' : 'Image inserted', 'Token added at the cursor.');
  }

  /* ---------------------------------------------------------------------
     Editor form
     ------------------------------------------------------------------- */

  function bindItemForm() {
    els.fType.addEventListener('change', function () { updateTypeFields(els.fType.value); });
    els.fQuestion.addEventListener('input', function () { livePreview(els.fQuestion, els.questionPreview); });
    els.fSolution.addEventListener('input', function () { livePreview(els.fSolution, els.solutionPreview); });
    els.fContent.addEventListener('input', function () { livePreview(els.fContent, els.contentPreview); });
    els.fCourseDesc.addEventListener('input', function () { livePreview(els.fCourseDesc, els.courseDescPreview); });

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
      setStatusToggle(item.status);
      state.tags = (item.tags || []).slice();
      state.media = (item.media || []).map(function (m) {
        return { id: genId(), kind: m.kind || 'image', url: m.url || '', placement: m.placement || 'full', width: m.width || 100, caption: m.caption || '' };
      });

      els.fCourseProblem.value = ''; els.fQuestion.value = ''; els.fSolution.value = '';
      els.fContent.value = ''; els.fImage.value = '';
      els.fLanguage.value = 'Manim'; els.fCodeSnippet.value = ''; els.fAnimationUrl.value = ''; els.fGithubUrl.value = '';
      els.fCodeThumb.value = '';
      if (els.codeThumbFileName) els.codeThumbFileName.textContent = '';
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
        els.fCodeThumb.value = item.custom_thumbnail || '';
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
      setStatusToggle('published');
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
    livePreview(els.fCourseDesc, els.courseDescPreview);
    renderTagChips();
    renderStoryImagesEditor();
    renderMediaManagerList();
    renderLessonsEditor();
    switchView('editor');
    checkForAutosaveDraft();
  }

  /* ---------------------------------------------------------------------
     Status (draft / published) toggle in the editor
     ------------------------------------------------------------------- */

  function bindStatusToggle() {
    if (!els.statusToggle) return;
    els.statusToggle.querySelectorAll('.status-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { setStatusToggle(btn.dataset.status); });
    });
  }

  function setStatusToggle(status) {
    status = status === 'draft' ? 'draft' : 'published';
    els.fStatus.value = status;
    els.statusToggle.querySelectorAll('.status-toggle-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.status === status);
    });
  }

  /* ---------------------------------------------------------------------
     Autosave — caches the editor form to localStorage (debounced) so a
     browser crash or accidental tab close doesn't lose unsaved work.
     Excludes staged file previews/base64 (kept only in memory) to stay
     well under localStorage's size limit; a restore keeps everything
     except those, and the person can just re-attach files if needed.
     ------------------------------------------------------------------- */

  var AUTOSAVE_KEY = 'academicPortalAdminDraft_v1';
  var AUTOSAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  var AUTOSAVE_FIELD_IDS = [
    'f-course-problem', 'f-question', 'f-solution', 'f-content', 'f-image',
    'f-language', 'f-code-snippet', 'f-animation-url', 'f-github-url',
    'f-video-url', 'f-yt-desc', 'f-pdf-url', 'f-pdf-thumb', 'f-course-pdf',
    'f-course-desc', 'f-course-cover-url', 'f-course-field'
  ];
  var autosaveTimer = null;

  function bindAutosave() {
    if (!els.itemForm) return;
    els.itemForm.addEventListener('input', function () {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(saveAutosaveDraft, 900);
    });
    if (els.autosaveRestoreBtn) els.autosaveRestoreBtn.addEventListener('click', function () { restoreAutosaveDraft(); });
    if (els.autosaveDiscardBtn) els.autosaveDiscardBtn.addEventListener('click', function () {
      clearAutosaveDraft();
      els.autosaveBanner.hidden = true;
    });
  }

  function fieldVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  function saveAutosaveDraft() {
    try {
      var fields = {};
      AUTOSAVE_FIELD_IDS.forEach(function (id) { fields[id] = fieldVal(id); });
      var draft = {
        savedAt: Date.now(),
        id: els.fId.value || '',
        sourceType: els.fType.value,
        title: els.fTitle.value || '',
        date: els.fDate.value || '',
        status: els.fStatus.value || 'published',
        tags: state.tags.slice(),
        media: (state.media || []).map(function (m) { return { id: m.id, kind: m.kind, url: m.url, placement: m.placement, width: m.width, caption: m.caption }; }),
        storyImages: (state.storyImages || []).map(function (im) { return { id: im.id, url: im.url, placement: im.placement, caption: im.caption }; }),
        lessons: (state.lessons || []).map(function (l) {
          return { id: l.id, order: l.order, title: l.title, description: l.description, video_url: l.video_url, pdf_url: l.pdf_url, github_url: l.github_url, code_snippet: l.code_snippet, thumbnail: l.thumbnail };
        }),
        fields: fields
      };
      var hasContent = draft.title || fields['f-question'] || fields['f-content'] || fields['f-course-desc'] || fields['f-video-url'] || fields['f-pdf-url'];
      if (!hasContent) { clearAutosaveDraft(); return; }
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
    } catch (e) { /* best-effort — storage full or unavailable */ }
  }

  function clearAutosaveDraft() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* ignore */ }
  }

  function readAutosaveDraft() {
    var raw;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { clearAutosaveDraft(); return null; }
  }

  function checkForAutosaveDraft() {
    var draft = readAutosaveDraft();
    if (!draft || !draft.savedAt) return;
    if (Date.now() - draft.savedAt > AUTOSAVE_MAX_AGE_MS) { clearAutosaveDraft(); return; }
    if (!els.autosaveBanner) return;
    var when = new Date(draft.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    els.autosaveBannerText.textContent = 'Unsaved draft from ' + when + (draft.title ? (' — “' + draft.title + '”') : '') + '.';
    els.autosaveBanner.hidden = false;
  }

  function restoreAutosaveDraft() {
    var draft = readAutosaveDraft();
    if (!draft) return;
    // If this was an edit of an existing item that's since been deleted,
    // fall back to a fresh "new item" form rather than silently no-oping.
    var itemStillExists = draft.id && state.raw[TYPE_TO_ARRAY[draft.sourceType]] &&
      state.raw[TYPE_TO_ARRAY[draft.sourceType]].some(function (i) { return i.id === draft.id; });
    openEditor(itemStillExists ? draft.id : null, itemStillExists ? draft.sourceType : null);
    els.fType.value = draft.sourceType || 'problem';
    els.fTitle.value = draft.title || '';
    if (draft.date) els.fDate.value = draft.date;
    setStatusToggle(draft.status || 'published');
    state.tags = (draft.tags || []).slice();
    state.media = (draft.media || []).map(function (m) { return { id: m.id || genId(), kind: m.kind || 'image', url: m.url || '', placement: m.placement || 'full', width: m.width || 100, caption: m.caption || '' }; });
    state.storyImages = (draft.storyImages || []).map(function (im) { return { id: im.id || genId(), url: im.url || '', placement: im.placement || 'full', caption: im.caption || '' }; });
    state.lessons = (draft.lessons || []).map(function (l) { return { id: l.id || genId(), order: l.order || 1, title: l.title || '', description: l.description || '', video_url: l.video_url || '', pdf_url: l.pdf_url || '', github_url: l.github_url || '', code_snippet: l.code_snippet || '', thumbnail: l.thumbnail || '' }; });
    Object.keys(draft.fields || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = draft.fields[id];
    });
    updateTypeFields(els.fType.value);
    livePreview(els.fQuestion, els.questionPreview);
    livePreview(els.fSolution, els.solutionPreview);
    livePreview(els.fContent, els.contentPreview);
    livePreview(els.fCourseDesc, els.courseDescPreview);
    renderTagChips();
    renderStoryImagesEditor();
    renderMediaManagerList();
    renderLessonsEditor();
    els.autosaveBanner.hidden = true;
    toast('success', 'Draft restored', 'Continue where you left off — remember to re-attach any files you were uploading.');
  }

  function saveItemFromForm() {
    var type = els.fType.value;
    var title = els.fTitle.value.trim();
    if (!title) { toast('error', 'Title required', 'Give this item a title before saving.'); return; }

    var record = {
      id: els.fId.value || genId(),
      title: title,
      date: els.fDate.value || nowForDatetimeLocal(),
      status: els.fStatus.value === 'draft' ? 'draft' : 'published',
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
      record.custom_thumbnail = els.fCodeThumb.value.trim();
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
    clearAutosaveDraft();
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
    els.pdfThumbFileName.textContent = 'Processing ' + file.name + '…';
    processImageForUpload(file).then(function (res) {
      var fileName = stripExt(sanitizeFileName(file.name)) + '.' + res.ext;
      state.pendingPdfThumb = { fileName: fileName, base64: res.base64 };
      els.pdfThumbFileName.textContent = fileName + ' — WebP, staged';
      els.fPdfThumb.value = 'assets/img/' + fileName;
    }).catch(function () {
      toast('error', 'Could not process image', file.name + ' could not be read.');
      els.pdfThumbFileName.textContent = '';
    });
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

  /* Compress an uploaded image to WebP (quality 0.85) and cap its width at
     maxWidth (default 1600px), preserving aspect ratio. SVGs are passed
     through untouched since rasterizing throws away their scalability. */
  var MAX_UPLOAD_WIDTH = 1600;

  function processImageForUpload(file, maxWidth) {
    maxWidth = maxWidth || MAX_UPLOAD_WIDTH;
    return new Promise(function (resolve, reject) {
      if (file.type === 'image/svg+xml') {
        var svgReader = new FileReader();
        svgReader.onload = function () { resolve({ base64: svgReader.result.split(',')[1], dataUrl: svgReader.result, ext: 'svg' }); };
        svgReader.onerror = reject;
        svgReader.readAsDataURL(file);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxWidth / w);
          var outW = Math.max(1, Math.round(w * scale)), outH = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = outW; canvas.height = outH;
          canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);
          canvas.toBlob(function (blob) {
            if (!blob) { resolve({ base64: reader.result.split(',')[1], dataUrl: reader.result, ext: (file.name.split('.').pop() || 'png') }); return; }
            var fr2 = new FileReader();
            fr2.onload = function () { resolve({ base64: fr2.result.split(',')[1], dataUrl: fr2.result, ext: 'webp', width: outW, height: outH }); };
            fr2.onerror = reject;
            fr2.readAsDataURL(blob);
          }, 'image/webp', 0.85);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function stripExt(name) { return name.replace(/\.[^./]+$/, ''); }

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
    if (els.browseMediaLibraryBtn) {
      els.browseMediaLibraryBtn.addEventListener('click', function () {
        openMediaLibrary(function (picked) {
          state.media.push({ id: genId(), kind: picked.kind, url: picked.url, placement: 'full', width: 100, caption: picked.caption || '', _previewDataUrl: picked.dataUrl || '' });
          state.dirty = true;
          renderMediaManagerList();
        });
      });
    }
  }

  function handleMediaFiles(fileList) {
    var single = fileList.length === 1;
    Array.prototype.forEach.call(fileList, function (file) {
      var isImage = file.type.indexOf('image/') === 0;
      var isVideo = file.type.indexOf('video/') === 0;
      if (!isImage && !isVideo) { toast('error', 'Unsupported file', file.name + ' is not an image or video.'); return; }

      if (isVideo) {
        var reader = new FileReader();
        reader.onload = function () {
          var base64 = reader.result.split(',')[1];
          var folder = 'assets/media/';
          var fileName = genId() + '-' + sanitizeFileName(file.name);
          state.pendingUploads.push({ folder: folder, fileName: fileName, base64: base64 });
          state.media.push({ id: genId(), kind: 'video', url: folder + fileName, placement: 'full', width: 100, caption: '', _previewDataUrl: reader.result });
          state.dirty = true;
          renderMediaManagerList();
        };
        reader.readAsDataURL(file);
        return;
      }

      processImageForUpload(file).then(function (res) {
        var folder = 'assets/img/';
        var fileName = genId() + '-' + sanitizeFileName(stripExt(file.name)) + '.' + res.ext;
        var finalPath = folder + fileName;
        state.pendingUploads.push({ folder: folder, fileName: fileName, base64: res.base64 });
        var entry = { id: genId(), kind: 'image', url: finalPath, placement: 'full', width: 100, caption: '', _previewDataUrl: res.dataUrl };
        state.media.push(entry);
        state.dirty = true;
        renderMediaManagerList();
        if (single) openCropper(entry, function () { renderMediaManagerList(); });
      }).catch(function () {
        toast('error', 'Could not process image', file.name + ' could not be read.');
      });
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
     Image cropper — fixed-aspect frame (1:1 / 16:9 / 4:3 / Freeform),
     zoom and drag-to-pan. The frame is exactly what gets saved: it starts
     covering the whole image ("object-fit: cover" at zoom 1) and zooming
     /panning selects a sub-region. Output is re-encoded to WebP and
     capped at MAX_UPLOAD_WIDTH. Works only on images staged via file
     upload in this session (we need the actual pixel data).
     ------------------------------------------------------------------- */

  var CROPPER_FRAME_BASE = 380;
  var CROPPER_ASPECTS = { 'free': null, '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3 };

  var cropperState = {
    target: null, onDone: null, aspect: 'free', zoom: 1,
    imgLeft: 0, imgTop: 0, dispW: 0, dispH: 0, frameW: CROPPER_FRAME_BASE, frameH: CROPPER_FRAME_BASE,
    naturalW: 0, naturalH: 0, baseScale: 1,
    dragging: false, dragStartX: 0, dragStartY: 0, dragStartLeft: 0, dragStartTop: 0
  };

  function openCropper(mediaEntry, onDone) {
    if (!els.cropperBackdrop || !mediaEntry._previewDataUrl) return;
    cropperState.target = mediaEntry;
    cropperState.onDone = onDone;
    cropperState.aspect = 'free';
    cropperState.zoom = 1;
    els.cropperZoom.value = 100;
    els.cropperAspectRow.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.aspect === 'free'); });
    els.cropperImg.onload = function () {
      cropperState.naturalW = els.cropperImg.naturalWidth;
      cropperState.naturalH = els.cropperImg.naturalHeight;
      applyCropperAspect('free');
    };
    els.cropperImg.src = mediaEntry._previewDataUrl;
    els.cropperBackdrop.classList.add('is-open');
  }

  function closeCropper() {
    els.cropperBackdrop.classList.remove('is-open');
    cropperState.target = null;
  }

  function applyCropperAspect(key) {
    cropperState.aspect = key;
    var ratio = CROPPER_ASPECTS[key];
    if (ratio === null) ratio = cropperState.naturalW && cropperState.naturalH ? cropperState.naturalW / cropperState.naturalH : 1;
    var frameW, frameH;
    if (ratio >= 1) { frameW = CROPPER_FRAME_BASE; frameH = CROPPER_FRAME_BASE / ratio; }
    else { frameH = CROPPER_FRAME_BASE; frameW = CROPPER_FRAME_BASE * ratio; }
    cropperState.frameW = frameW;
    cropperState.frameH = frameH;
    els.cropperStage.style.width = frameW + 'px';
    els.cropperStage.style.height = frameH + 'px';
    cropperState.zoom = 1;
    els.cropperZoom.value = 100;
    recomputeCropperImage(true);
  }

  /* Recomputes the image's displayed size/position for the current zoom,
     centering it in the frame (recenter=true) or clamping the existing
     position back into bounds after a zoom change (recenter=false). */
  function recomputeCropperImage(recenter) {
    var s = cropperState;
    if (!s.naturalW || !s.naturalH) return;
    s.baseScale = Math.max(s.frameW / s.naturalW, s.frameH / s.naturalH);
    var scale = s.baseScale * s.zoom;
    s.dispW = s.naturalW * scale;
    s.dispH = s.naturalH * scale;
    if (recenter) {
      s.imgLeft = (s.frameW - s.dispW) / 2;
      s.imgTop = (s.frameH - s.dispH) / 2;
    } else {
      s.imgLeft = Math.min(0, Math.max(s.frameW - s.dispW, s.imgLeft));
      s.imgTop = Math.min(0, Math.max(s.frameH - s.dispH, s.imgTop));
    }
    els.cropperImg.style.width = s.dispW + 'px';
    els.cropperImg.style.height = s.dispH + 'px';
    els.cropperImg.style.left = s.imgLeft + 'px';
    els.cropperImg.style.top = s.imgTop + 'px';
  }

  function bindCropper() {
    if (!els.cropperBackdrop) return;
    els.cropperCancelBtn.addEventListener('click', closeCropper);
    els.cropperBackdrop.addEventListener('click', function (e) { if (e.target === els.cropperBackdrop) closeCropper(); });

    els.cropperAspectRow.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        els.cropperAspectRow.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        applyCropperAspect(btn.dataset.aspect);
      });
    });

    els.cropperZoom.addEventListener('input', function () {
      cropperState.zoom = Number(els.cropperZoom.value) / 100;
      recomputeCropperImage(false);
    });

    function pointerPos(e) {
      var p = e.touches ? e.touches[0] : e;
      return { x: p.clientX, y: p.clientY };
    }
    function start(e) {
      e.preventDefault();
      var pos = pointerPos(e);
      cropperState.dragging = true;
      cropperState.dragStartX = pos.x;
      cropperState.dragStartY = pos.y;
      cropperState.dragStartLeft = cropperState.imgLeft;
      cropperState.dragStartTop = cropperState.imgTop;
      els.cropperStage.classList.add('is-panning');
    }
    function move(e) {
      if (!cropperState.dragging) return;
      e.preventDefault();
      var pos = pointerPos(e);
      var s = cropperState;
      s.imgLeft = Math.min(0, Math.max(s.frameW - s.dispW, s.dragStartLeft + (pos.x - s.dragStartX)));
      s.imgTop = Math.min(0, Math.max(s.frameH - s.dispH, s.dragStartTop + (pos.y - s.dragStartY)));
      els.cropperImg.style.left = s.imgLeft + 'px';
      els.cropperImg.style.top = s.imgTop + 'px';
    }
    function end() { cropperState.dragging = false; els.cropperStage.classList.remove('is-panning'); }

    els.cropperStage.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    els.cropperStage.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);

    els.cropperApplyBtn.addEventListener('click', function () {
      var m = cropperState.target;
      var s = cropperState;
      if (!m) return;
      var scale = s.baseScale * s.zoom;
      var srcX = -s.imgLeft / scale;
      var srcY = -s.imgTop / scale;
      var srcW = s.frameW / scale;
      var srcH = s.frameH / scale;

      var outW = Math.round(srcW), outH = Math.round(srcH);
      if (outW > MAX_UPLOAD_WIDTH) { outH = Math.round(outH * (MAX_UPLOAD_WIDTH / outW)); outW = MAX_UPLOAD_WIDTH; }

      var canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      var ctx = canvas.getContext('2d');
      var tempImg = new Image();
      tempImg.onload = function () {
        ctx.drawImage(tempImg, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
        canvas.toBlob(function (blob) {
          if (!blob) { toast('error', 'Crop failed', 'This browser could not export the crop.'); return; }
          var fr = new FileReader();
          fr.onload = function () {
            var dataUrl = fr.result;
            var base64 = dataUrl.split(',')[1];
            var fileName = genId() + '-cropped.webp';
            state.pendingUploads = state.pendingUploads.filter(function (u) { return 'assets/img/' + u.fileName !== m.url; });
            state.pendingUploads.push({ folder: 'assets/img/', fileName: fileName, base64: base64 });
            m.url = 'assets/img/' + fileName;
            m._previewDataUrl = dataUrl;
            closeCropper();
            if (cropperState.onDone) cropperState.onDone();
            toast('success', 'Cropped', 'The image will use the cropped WebP version once committed.');
          };
          fr.readAsDataURL(blob);
        }, 'image/webp', 0.85);
      };
      tempImg.src = els.cropperImg.src;
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
    els.courseCoverFileName.textContent = 'Processing ' + file.name + '…';
    processImageForUpload(file).then(function (res) {
      var fileName = genId() + '-' + sanitizeFileName(stripExt(file.name)) + '.' + res.ext;
      state.pendingUploads.push({ folder: 'assets/img/', fileName: fileName, base64: res.base64 });
      els.courseCoverFileName.textContent = fileName + ' — WebP, staged';
      els.fCourseCoverUrl.value = 'assets/img/' + fileName;
      state.dirty = true;
    }).catch(function () {
      toast('error', 'Could not process image', file.name + ' could not be read.');
      els.courseCoverFileName.textContent = '';
    });
  }

  function bindCodeThumbDrop() {
    if (!els.codeThumbDrop) return;
    els.codeThumbDrop.addEventListener('click', function () { els.codeThumbFileInput.click(); });
    els.codeThumbDrop.addEventListener('dragover', function (e) { e.preventDefault(); els.codeThumbDrop.classList.add('is-drag'); });
    els.codeThumbDrop.addEventListener('dragleave', function () { els.codeThumbDrop.classList.remove('is-drag'); });
    els.codeThumbDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.codeThumbDrop.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleCodeThumbFile(e.dataTransfer.files[0]);
    });
    els.codeThumbFileInput.addEventListener('change', function () {
      if (els.codeThumbFileInput.files[0]) handleCodeThumbFile(els.codeThumbFileInput.files[0]);
    });
  }

  function handleCodeThumbFile(file) {
    if (file.type.indexOf('image/') !== 0) { toast('error', 'Not an image', 'Please choose an image file.'); return; }
    els.codeThumbFileName.textContent = 'Processing ' + file.name + '…';
    processImageForUpload(file).then(function (res) {
      var fileName = genId() + '-' + sanitizeFileName(stripExt(file.name)) + '.' + res.ext;
      state.pendingUploads.push({ folder: 'assets/img/', fileName: fileName, base64: res.base64 });
      els.codeThumbFileName.textContent = fileName + ' — WebP, staged';
      els.fCodeThumb.value = 'assets/img/' + fileName;
      state.dirty = true;
    }).catch(function () {
      toast('error', 'Could not process image', file.name + ' could not be read.');
      els.codeThumbFileName.textContent = '';
    });
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
      lesson.order = idx + 1;

      var row = document.createElement('div');
      row.className = 'lesson-editor-row';
      row.draggable = true;
      row.dataset.lessonId = lesson.id;

      var head = document.createElement('div');
      head.className = 'lesson-editor-head';
      head.innerHTML =
        '<span class="lesson-drag-handle" title="Drag to reorder"><svg aria-hidden="true"><use href="#i-grip"/></svg></span>' +
        '<strong>Lesson ' + (idx + 1) + '</strong>';

      var moveUpBtn = document.createElement('button');
      moveUpBtn.type = 'button';
      moveUpBtn.className = 'lesson-move-btn';
      moveUpBtn.setAttribute('aria-label', 'Move lesson up');
      moveUpBtn.disabled = idx === 0;
      moveUpBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-chevron"/></svg>';
      moveUpBtn.style.transform = 'rotate(180deg)';
      moveUpBtn.addEventListener('click', function () { moveLesson(lesson.id, -1); });
      head.appendChild(moveUpBtn);

      var moveDownBtn = document.createElement('button');
      moveDownBtn.type = 'button';
      moveDownBtn.className = 'lesson-move-btn';
      moveDownBtn.setAttribute('aria-label', 'Move lesson down');
      moveDownBtn.disabled = idx === state.lessons.length - 1;
      moveDownBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-chevron"/></svg>';
      moveDownBtn.addEventListener('click', function () { moveLesson(lesson.id, 1); });
      head.appendChild(moveDownBtn);

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
      rowTop.className = 'field';
      rowTop.innerHTML = '<label>Title</label><input type="text" class="ln-title" placeholder="Lesson title" value="' + escapeHtml(lesson.title) + '">';
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

      // Drag-and-drop reordering (grab anywhere on the row header).
      row.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lesson.id);
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', function () { row.classList.remove('is-dragging'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('is-drop-target'); });
      row.addEventListener('dragleave', function () { row.classList.remove('is-drop-target'); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('is-drop-target');
        var draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === lesson.id) return;
        var fromIdx = state.lessons.findIndex(function (l) { return l.id === draggedId; });
        var toIdx = state.lessons.findIndex(function (l) { return l.id === lesson.id; });
        if (fromIdx === -1 || toIdx === -1) return;
        var moved = state.lessons.splice(fromIdx, 1)[0];
        state.lessons.splice(toIdx, 0, moved);
        renderLessonsEditor();
      });

      els.lessonsEditorList.appendChild(row);
    });
  }

  /* Tap-to-move fallback for touch devices, where native HTML5 drag
     events don't fire. Swaps the lesson with its neighbor in place. */
  function moveLesson(id, direction) {
    var idx = state.lessons.findIndex(function (l) { return l.id === id; });
    var targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= state.lessons.length) return;
    var tmp = state.lessons[idx];
    state.lessons[idx] = state.lessons[targetIdx];
    state.lessons[targetIdx] = tmp;
    renderLessonsEditor();
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
    els.avatarFileName.textContent = 'Processing ' + file.name + '…';
    processImageForUpload(file, 800).then(function (res) {
      var fileName = stripExt(sanitizeFileName(file.name)) + '.' + res.ext;
      state.pendingAvatar = { fileName: fileName, base64: res.base64, previewDataUrl: res.dataUrl };
      els.avatarFileName.textContent = fileName + ' — WebP, staged';
      var path = 'assets/img/' + fileName;
      els.sAvatarUrl.value = path;
      state.raw.meta.avatarUrl = path;
      state.dirty = true;
      updateAvatarPreview();
      updateCommitBar();
    }).catch(function () {
      toast('error', 'Could not process image', file.name + ' could not be read.');
      els.avatarFileName.textContent = '';
    });
  }

  function updateAvatarPreview() {
    if (!els.avatarPreview) return;
    var url = state.raw.meta.avatarUrl || '';
    if (state.pendingAvatar && state.pendingAvatar.previewDataUrl) {
      els.avatarPreview.src = state.pendingAvatar.previewDataUrl;
      els.avatarPreview.hidden = false;
    } else if (url) {
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
