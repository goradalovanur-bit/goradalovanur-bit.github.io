/* =========================================================================
   Anur Qoradalov — Feed Engine
   Fetches data.json (5 content types), renders a unified Medium-style feed.
   ========================================================================= */

(function () {
  'use strict';

  var DATA_URL = 'data.json';
  var LS_THEME = 'dg-theme';

  var SECTION_META = {
    home: { title: 'Home', sub: 'Bütün yeniliklər tarix üzrə sıralanıb.' },
    problems: { title: 'Solved Problems', sub: 'Riyazi və fiziki məsələlərin ətraflı həlli, LaTeX ilə tərtib olunub.' },
    stories: { title: 'Essays & Stories', sub: 'Alimlərin bioqrafiyaları, şəxsi düşüncələr və fənlərarası yazılar.' },
    code: { title: 'Code & Animations', sub: 'Manim, MATLAB, Python və C++ ilə hazırlanmış skriptlər və animasiyalar.' },
    youtube: { title: 'YouTube', sub: 'Videolar və qeydə alınmış izahlar.' },
    courses: { title: 'Courses', sub: 'Struktur dərs ardıcıllığı ilə qruplaşdırılmış kurslar.' }
  };

  /* Default "Fields of Mathematics" tags (slug -> display label), used as a
     fallback until data.json's meta.fields (managed from the admin panel's
     Fields view) loads. Once loaded, FIELD_TAGS is rebuilt from that list. */
  var DEFAULT_FIELD_TAGS = {
    'algebra': 'Algebra',
    'complex-analysis': 'Complex Analysis',
    'geometry': 'Geometry',
    'lebesgue-integral-and-measure': 'Lebesgue Integral & Measure',
    'mathematical-logic': 'Mathematical Logic',
    'mathematical-statistics': 'Mathematical Statistics',
    'numerical-analysis': 'Numerical Analysis',
    'ordinary-differential-equations': 'ODE',
    'partial-differential-equations': 'PDE',
    'probability': 'Probability',
    'real-analysis': 'Real Analysis',
    'topology': 'Topology'
  };
  var TAG_ACRONYMS = { ode: 'ODE', pde: 'PDE', la: 'LA' };
  var FIELD_TAGS = Object.assign({}, DEFAULT_FIELD_TAGS);

  function rebuildFieldTags(fieldsList) {
    if (!Array.isArray(fieldsList) || !fieldsList.length) return;
    var map = {};
    fieldsList.forEach(function (f) {
      if (f && f.slug) map[String(f.slug).toLowerCase()] = f.label || f.slug;
    });
    FIELD_TAGS = map;
  }

  function formatTagLabel(raw) {
    var key = String(raw || '').trim().toLowerCase();
    if (!key) return '';
    if (FIELD_TAGS[key]) return FIELD_TAGS[key];
    return key.split(/[\s\-_]+/).map(function (word) {
      if (!word) return '';
      if (TAG_ACRONYMS[word]) return TAG_ACRONYMS[word];
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function isFieldTag(raw) {
    return Object.prototype.hasOwnProperty.call(FIELD_TAGS, String(raw || '').trim().toLowerCase());
  }

  var state = {
    raw: { problems: [], stories: [], code_animations: [], youtube: [], pdf: [], courses: [] },
    meta: {},
    section: 'home',
    activeFilters: [],
    filtersOpen: false,
    query: '',
    activeCourseId: null
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    initTheme();
    bindNav();
    bindSearch();
    bindModal();
    bindFiltersToggle();

    try {
      var data = await fetchData();
      state.raw = stripDrafts({
        problems: data.problems || [],
        stories: data.stories || [],
        code_animations: data.code_animations || [],
        youtube: data.youtube || [],
        pdf: data.pdf || [],
        courses: data.courses || []
      });
      state.meta = data.meta || {};
      rebuildFieldTags(state.meta.fields);
      applyAvatar(state.meta.avatarUrl);
      render();
    } catch (err) {
      renderFetchError(err);
    }
  }

  /* ---------------------------------------------------------------------
     About page / sidebar profile image (optional, set from Admin panel)
     ------------------------------------------------------------------- */

  function applyAvatar(url) {
    if (!url) return;
    var sideAvatar = document.querySelector('.about-avatar');
    var heroAvatar = document.querySelector('.about-hero-avatar');
    if (sideAvatar) sideAvatar.innerHTML = '<img src="' + escapeAttr(url) + '" alt="Profile photo" loading="lazy">';
    if (heroAvatar) heroAvatar.innerHTML = '<img src="' + escapeAttr(url) + '" alt="Profile photo" loading="lazy">';
  }

  function cacheEls() {
    els.sideNav = document.getElementById('sideNav');
    els.aboutBtn = document.getElementById('aboutBtn');
    els.feedView = document.getElementById('feedView');
    els.aboutView = document.getElementById('aboutView');
    els.courseDetailView = document.getElementById('courseDetailView');
    els.feedHeadingTitle = document.getElementById('feedHeadingTitle');
    els.feedHeadingSub = document.getElementById('feedHeadingSub');
    els.filterBar = document.getElementById('filterBar');
    els.filtersToggleBtn = document.getElementById('filtersToggleBtn');
    els.feedContainer = document.getElementById('feedContainer');
    els.emptyState = document.getElementById('emptyState');
    els.searchInput = document.getElementById('searchInput');
    els.searchField = document.getElementById('searchField');
    els.mobileSearchToggle = document.getElementById('mobileSearchToggle');
    els.modalBackdrop = document.getElementById('modalBackdrop');
    els.modalTitle = document.getElementById('modalTitle');
    els.modalBody = document.getElementById('modalBody');
    els.modalClose = document.getElementById('modalClose');
  }

  /* ---------------------------------------------------------------------
     Data loading
     ------------------------------------------------------------------- */

  async function fetchData() {
    var res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* Items are "published" by default (legacy items have no status field at
     all). Anything explicitly marked "draft" in the admin panel is dropped
     here, before it ever reaches the feed, search, filters, or course/lesson
     detail lookups — so a draft is never reachable on the public site even
     via a direct link. */
  function stripDrafts(raw) {
    ['problems', 'stories', 'code_animations', 'youtube', 'pdf', 'courses'].forEach(function (key) {
      raw[key] = (raw[key] || []).filter(function (item) { return item.status !== 'draft'; });
    });
    return raw;
  }

  function renderFetchError(err) {
    els.feedContainer.innerHTML = '';
    els.emptyState.hidden = false;
    els.emptyState.querySelector('p').textContent =
      'Məzmun yüklənə bilmədi (' + err.message + '). data.json faylının mövcud olduğunu yoxlayın.';
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
     Navigation: sidebar sections + About view
     ------------------------------------------------------------------- */

  function bindNav() {
    els.sideNav.addEventListener('click', function (e) {
      var btn = e.target.closest('.side-nav-btn');
      if (!btn) return;
      setSection(btn.dataset.section);
    });
    els.aboutBtn.addEventListener('click', function () {
      Array.prototype.forEach.call(els.sideNav.querySelectorAll('.side-nav-btn'), function (b) {
        b.classList.remove('is-active');
      });
      els.aboutBtn.classList.add('is-active');
      els.feedView.hidden = true;
      if (els.courseDetailView) els.courseDetailView.hidden = true;
      els.aboutView.hidden = false;
    });
  }

  function setSection(section) {
    state.section = section;
    state.activeFilters = [];
    Array.prototype.forEach.call(els.sideNav.querySelectorAll('.side-nav-btn'), function (b) {
      b.classList.toggle('is-active', b.dataset.section === section);
    });
    els.aboutBtn.classList.remove('is-active');
    els.aboutView.hidden = true;
    if (els.courseDetailView) els.courseDetailView.hidden = true;
    els.feedView.hidden = false;
    var meta = SECTION_META[section] || SECTION_META.home;
    els.feedHeadingTitle.textContent = meta.title;
    els.feedHeadingSub.textContent = meta.sub;
    render();
  }

  /* ---------------------------------------------------------------------
     Search
     ------------------------------------------------------------------- */

  function bindSearch() {
    els.searchInput.addEventListener('input', debounce(function () {
      state.query = els.searchInput.value.trim().toLowerCase();
      render();
    }, 140));

    /* Mobile only: the search field is a slide-down overlay toggled by
       a small icon button, since there's no room for it in the topbar
       alongside the section icons. Inert on desktop — the toggle button
       stays display:none there, so this listener simply never fires. */
    if (els.mobileSearchToggle && els.searchField) {
      els.mobileSearchToggle.addEventListener('click', function () {
        var isOpen = els.searchField.classList.toggle('is-open');
        els.mobileSearchToggle.classList.toggle('is-active', isOpen);
        if (isOpen) els.searchInput.focus();
      });
      els.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          els.searchField.classList.remove('is-open');
          els.mobileSearchToggle.classList.remove('is-active');
        }
      });
    }
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  /* ---------------------------------------------------------------------
     Building the unified item list
     ------------------------------------------------------------------- */

  function buildUnifiedList() {
    var out = [];

    state.raw.problems.forEach(function (p) {
      out.push({
        sourceType: 'problem', id: p.id, title: p.title, date: p.date || '',
        tags: p.tags || [], category: p.course || '', categoryKind: 'course',
        raw: p
      });
    });
    state.raw.stories.forEach(function (s) {
      out.push({
        sourceType: 'story', id: s.id, title: s.title, date: s.date || '',
        tags: s.tags || [], category: '', categoryKind: '',
        raw: s
      });
    });
    state.raw.code_animations.forEach(function (c) {
      out.push({
        sourceType: 'code', id: c.id, title: c.title, date: c.date || '',
        tags: c.tags || [], category: c.language || '', categoryKind: 'language',
        raw: c
      });
    });
    state.raw.youtube.forEach(function (y) {
      out.push({
        sourceType: 'youtube', id: y.id, title: y.title, date: y.date || '',
        tags: y.tags || [], category: '', categoryKind: '',
        raw: y
      });
    });
    state.raw.pdf.forEach(function (d) {
      out.push({
        sourceType: 'pdf', id: d.id, title: d.title, date: d.date || '',
        tags: d.tags || [], category: d.course || '', categoryKind: 'course',
        raw: d
      });
    });
    (state.raw.courses || []).forEach(function (co) {
      out.push({
        sourceType: 'course', id: co.id, title: co.title, date: co.date || '',
        tags: co.tags || [], category: co.field || '', categoryKind: 'course',
        raw: co
      });
    });

    out.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    return out;
  }

  function getSectionItems(all) {
    if (state.section === 'home') return all;
    var map = { problems: 'problem', stories: 'story', code: 'code', youtube: 'youtube', courses: 'course' };
    var wanted = map[state.section];
    return all.filter(function (item) { return item.sourceType === wanted; });
  }

  function getSearchHaystack(item) {
    var r = item.raw;
    var parts = [item.title, item.category, (item.tags || []).join(' ')];
    if (r.question_latex) parts.push(r.question_latex);
    if (r.solution_latex) parts.push(r.solution_latex);
    if (r.content) parts.push(r.content);
    if (r.description) parts.push(r.description);
    if (r.code_snippet) parts.push(r.code_snippet);
    if (r.lessons) parts.push(r.lessons.map(function (l) { return l.title + ' ' + (l.description || ''); }).join(' '));
    return parts.join(' ').toLowerCase();
  }

  /* ---------------------------------------------------------------------
     Filter pills — multi-select, collapsible panel.
     Facets come from two sources per item:
       - its category (course/language), prefixed "cat:"
       - any of its tags that match a pre-defined "Field of Mathematics",
         prefixed "tag:" — this is what surfaces Field filters in every
         section (including Codes) automatically, without touching
         unrelated free-form tags.
     ------------------------------------------------------------------- */

  function itemFacets(item) {
    var facets = [];
    if (item.category) facets.push('cat:' + item.category);
    (item.tags || []).forEach(function (t) {
      if (isFieldTag(t)) facets.push('tag:' + String(t).toLowerCase());
    });
    return facets;
  }

  function renderFilterBar(sectionItems) {
    var seen = {};
    var pills = [];
    sectionItems.forEach(function (item) {
      itemFacets(item).forEach(function (value) {
        if (seen[value]) return;
        seen[value] = true;
        var label = value.indexOf('tag:') === 0 ? FIELD_TAGS[value.slice(4)] : value.slice(4);
        pills.push({ value: value, label: label });
      });
    });
    pills.sort(function (a, b) { return a.label.localeCompare(b.label); });

    els.filterBar.innerHTML = '';
    updateFiltersToggle(pills.length);
    if (!pills.length) return;

    var all = document.createElement('button');
    all.className = 'filter-pill' + (state.activeFilters.length === 0 ? ' is-active' : '');
    all.textContent = 'All';
    all.dataset.value = 'all';
    els.filterBar.appendChild(all);

    pills.forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'filter-pill' + (state.activeFilters.indexOf(p.value) !== -1 ? ' is-active' : '');
      btn.textContent = p.label;
      btn.dataset.value = p.value;
      els.filterBar.appendChild(btn);
    });

    els.filterBar.querySelectorAll('.filter-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.dataset.value;
        if (value === 'all') {
          state.activeFilters = [];
        } else {
          var idx = state.activeFilters.indexOf(value);
          if (idx !== -1) state.activeFilters.splice(idx, 1); // toggle off
          else state.activeFilters.push(value);
        }
        render();
      });
    });
  }

  function updateFiltersToggle(pillCount) {
    if (!els.filtersToggleBtn) return;
    els.filtersToggleBtn.hidden = pillCount === 0;
    els.filtersToggleBtn.classList.toggle('has-active', state.activeFilters.length > 0);
    var countLabel = els.filtersToggleBtn.querySelector('.filter-count');
    if (state.activeFilters.length > 0) {
      if (!countLabel) {
        countLabel = document.createElement('span');
        countLabel.className = 'filter-count';
        els.filtersToggleBtn.appendChild(countLabel);
      }
      countLabel.textContent = state.activeFilters.length;
    } else if (countLabel) {
      countLabel.remove();
    }
  }

  function bindFiltersToggle() {
    if (!els.filtersToggleBtn) return;
    els.filtersToggleBtn.addEventListener('click', function () {
      state.filtersOpen = !state.filtersOpen;
      els.filterBar.classList.toggle('is-open', state.filtersOpen);
      els.filtersToggleBtn.classList.toggle('is-open', state.filtersOpen);
    });
  }

  /* ---------------------------------------------------------------------
     Main render
     ------------------------------------------------------------------- */

  function render() {
    var all = buildUnifiedList();
    var sectionItems = getSectionItems(all);

    renderFilterBar(sectionItems);

    var filtered = sectionItems.filter(function (item) {
      if (state.activeFilters.length) {
        var facets = itemFacets(item);
        // Strict AND (intersection): every selected filter must match this
        // item's facets, not just at least one of them.
        var matches = state.activeFilters.every(function (f) { return facets.indexOf(f) !== -1; });
        if (!matches) return false;
      }
      if (!state.query) return true;
      return getSearchHaystack(item).indexOf(state.query) !== -1;
    });

    els.feedContainer.innerHTML = '';
    els.emptyState.hidden = filtered.length !== 0;
    els.emptyState.querySelector('p').textContent = 'Bu filtrə uyğun heç nə tapılmadı.';

    filtered.forEach(function (item, idx) {
      var card = buildCard(item);
      card.style.animationDelay = Math.min(idx * 25, 300) + 'ms';
      els.feedContainer.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------------
     Mini text formatter: escapes HTML, supports \n\n paragraphs,
     "### " headers, **bold**, $...$ / $$...$$ for KaTeX, and inline media
     shortcode tokens:
       ![Alt text](url){align=L size=60 mode=wrap}
       [media: url | align=R | size=50% | mode=break | alt="Description" | kind=video]
     align: L / R / C (or U) / D (full-width). mode: wrap (float, text
     flows around) or break (own block, splits the paragraph). size is a
     percentage width. kind defaults to image, or video for YouTube/direct
     video URLs.
     ------------------------------------------------------------------- */

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

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
  function renderMediaTokenHtml(kind, url, alt, align, mode, size) {
    align = normalizeAlign(align);
    mode = normalizeMode(mode, align);
    size = normalizeSize(size);
    var cls = 'media-token media-align-' + align + ' media-mode-' + mode;
    var style = 'style="--media-size:' + size + '%"';
    if (kind === 'video') {
      var vid = extractYouTubeId(url);
      var thumbSrc = vid ? 'https://img.youtube.com/vi/' + vid + '/hqdefault.jpg' : '';
      return '<span class="' + cls + '" ' + style + '>' +
        '<span class="media-token-video" data-video-url="' + escapeAttr(url) + '" data-video-title="' + escapeAttr(alt || 'Video') + '" role="button" tabindex="0">' +
        (thumbSrc ? '<img src="' + thumbSrc + '" alt="' + escapeAttr(alt || '') + '" loading="lazy">' : '') +
        '<span class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></span>' +
        '</span></span>';
    }
    return '<span class="' + cls + '" ' + style + '><img src="' + escapeAttr(url) + '" alt="' + escapeAttr(alt || '') + '" loading="lazy"></span>';
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
          return '<blockquote>' + inlineFormat(escapeHtml(quoteText)) + '</blockquote>';
        case 'ul':
          return '<ul>' + trimmed.split('\n').map(function (l) {
            return '<li>' + inlineFormat(escapeHtml(l.replace(/^[-*]\s+/, ''))) + '</li>';
          }).join('') + '</ul>';
        case 'ol':
          return '<ol>' + trimmed.split('\n').map(function (l) {
            return '<li>' + inlineFormat(escapeHtml(l.replace(/^\d+\.\s+/, ''))) + '</li>';
          }).join('') + '</ol>';
        case 'h4':
          return '<h4>' + inlineFormat(escapeHtml(trimmed.slice(4))) + '</h4>';
        case 'h3':
          return '<h3>' + inlineFormat(escapeHtml(trimmed.slice(3))) + '</h3>';
        case 'h2':
          return '<h2>' + inlineFormat(escapeHtml(trimmed.slice(2))) + '</h2>';
        default:
          return '<p>' + inlineFormat(escapeHtml(trimmed)).replace(/\n/g, '<br>') + '</p>';
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
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  }

  /* Delegated click/keyboard handling for inline video tokens produced by
     formatRichText — opens the same lightbox modal used elsewhere. Safe to
     call repeatedly on the same element (checks a data flag first). */
  function bindInlineMedia(el) {
    if (!el || el._mediaBound) return;
    el._mediaBound = true;
    el.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('.media-token-video') : null;
      if (!trigger) return;
      openVideoModal(trigger.dataset.videoTitle || 'Video', trigger.dataset.videoUrl);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var trigger = e.target.closest ? e.target.closest('.media-token-video') : null;
      if (!trigger) return;
      e.preventDefault();
      openVideoModal(trigger.dataset.videoTitle || 'Video', trigger.dataset.videoUrl);
    });
  }

  /* ---------------------------------------------------------------------
     Card builders — one per content type
     ------------------------------------------------------------------- */

  var KICKER_LABEL = { problem: 'Solved Problem', story: 'Essay & Story', code: 'Code & Animation', youtube: 'YouTube', pdf: 'PDF', course: 'Course' };
  var KICKER_CLASS = { problem: 'k-problem', story: 'k-story', code: 'k-code', youtube: 'k-youtube', pdf: 'k-pdf', course: 'k-course' };

  function buildCard(item) {
    var card = document.createElement('article');
    card.className = 'post-card';
    card.dataset.id = item.id;

    var kicker = document.createElement('p');
    kicker.className = 'post-kicker ' + KICKER_CLASS[item.sourceType];
    kicker.innerHTML = '<span class="type-dot"></span>' + KICKER_LABEL[item.sourceType] +
      (item.date ? ' · ' + formatDate(item.date) : '');
    card.appendChild(kicker);

    var title = document.createElement('h2');
    title.className = 'post-title';
    title.textContent = item.title;
    card.appendChild(title);

    var builder = {
      problem: buildProblemCard,
      story: buildStoryCard,
      code: buildCodeCard,
      youtube: buildYoutubeCard,
      pdf: buildPdfCard,
      course: buildCourseCard
    }[item.sourceType];
    if (builder) builder(card, item.raw, item);

    // Universal optional media gallery — any content type can carry a
    // "media" array (images and/or videos) beyond its own primary media.
    if (item.sourceType !== 'story' && item.raw && item.raw.media && item.raw.media.length) {
      renderMediaGallery(card, item.raw.media, item.title);
    }

    var tagsToShow = (item.tags || []).slice();
    if (tagsToShow.length) {
      var tagRow = document.createElement('div');
      tagRow.className = 'tag-row';
      if (item.category) {
        var catTag = document.createElement('span');
        catTag.className = 'tag ' + (item.categoryKind === 'language' ? 't-lang' : 't-course');
        catTag.textContent = item.category;
        tagRow.appendChild(catTag);
      }
      tagsToShow.forEach(function (t) {
        var tag = document.createElement('span');
        tag.className = 'tag' + (isFieldTag(t) ? ' t-field' : '');
        tag.textContent = formatTagLabel(t);
        tagRow.appendChild(tag);
      });
      card.appendChild(tagRow);
    }

    return card;
  }

  /* ----- Problem: Question first, then "Show Solution" -> Overleaf panel ----- */

  function buildProblemCard(card, p, item) {
    var qBlock = document.createElement('div');
    qBlock.className = 'question-block';
    qBlock.innerHTML = formatRichText(p.question_latex);
    card.appendChild(qBlock);
    renderMathIn(qBlock);
    bindInlineMedia(qBlock);

    var actions = document.createElement('div');
    actions.className = 'post-actions';
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'action-btn primary';
    toggleBtn.type = 'button';
    toggleBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-chevron"/></svg><span>Show Solution</span>';
    actions.appendChild(toggleBtn);
    card.appendChild(actions);

    var panel = document.createElement('div');
    panel.className = 'solution-panel';
    panel.innerHTML =
      '<div class="solution-panel-head">Solution</div>' +
      '<div class="solution-panel-body"></div>';
    card.appendChild(panel);

    var rendered = false;
    toggleBtn.addEventListener('click', function () {
      var isOpen = panel.classList.toggle('is-open');
      toggleBtn.querySelector('span').textContent = isOpen ? 'Hide Solution' : 'Show Solution';
      if (isOpen && !rendered) {
        var body = panel.querySelector('.solution-panel-body');
        body.innerHTML = formatRichText(p.solution_latex);
        renderMathIn(body);
        bindInlineMedia(body);
        rendered = true;
      }
    });
  }

  /* ----- Story: excerpt + "Read Full Story" toggle ----- */

  /* Truncates for the excerpt without cutting a media token in half —
     backs up to before an unterminated "![" / "[media:" marker if the
     cut point would land inside one. */
  function safeExcerpt(full, maxLen) {
    if (full.length <= maxLen) return full;
    var cut = full.slice(0, maxLen);
    var lastBang = cut.lastIndexOf('![');
    var lastBracket = cut.lastIndexOf('[media:');
    var lastOpen = Math.max(lastBang, lastBracket);
    if (lastOpen !== -1) {
      var closeAfter = full.indexOf(lastBang > lastBracket ? ')' : ']', lastOpen);
      if (closeAfter === -1 || closeAfter >= maxLen) cut = cut.slice(0, lastOpen);
    }
    return cut.trim() + '…';
  }

  function buildStoryCard(card, s, item) {
    if (s.image) {
      var media = document.createElement('div');
      media.className = 'post-media';
      media.innerHTML = '<img src="' + escapeAttr(s.image) + '" alt="' + escapeAttr(s.title) + '" loading="lazy">';
      card.appendChild(media);
    }

    renderStoryImages(card, s.images, 'left', s.title);

    var excerpt = document.createElement('div');
    excerpt.className = 'post-excerpt post-excerpt-readable';
    var full = s.content || '';
    var isLong = full.length > 320;
    var short = isLong ? safeExcerpt(full, 320) : full;
    excerpt.innerHTML = formatRichText(short);
    card.appendChild(excerpt);

    if (isLong) {
      var actions = document.createElement('div');
      actions.className = 'post-actions';
      var btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.type = 'button';
      btn.innerHTML = '<svg aria-hidden="true"><use href="#i-chevron"/></svg><span>Read Full Story</span>';
      actions.appendChild(btn);
      card.appendChild(actions);

      var expanded = false;
      btn.addEventListener('click', function () {
        expanded = !expanded;
        excerpt.innerHTML = formatRichText(expanded ? full : short);
        renderMathIn(excerpt);
        bindInlineMedia(excerpt);
        btn.querySelector('span').textContent = expanded ? 'Show Less' : 'Read Full Story';
      });
    }
    renderMathIn(excerpt);
    bindInlineMedia(excerpt);

    renderStoryImages(card, s.images, 'full');
    renderStoryImages(card, s.images, 'right');
    renderStoryImages(card, s.images, 'inline');

    var clear = document.createElement('div');
    clear.style.clear = 'both';
    card.appendChild(clear);

    if (s.media && s.media.length) renderMediaGallery(card, s.media, s.title);
  }

  /* ---------------------------------------------------------------------
     Universal media gallery — renders an item's optional "media" array
     (images and/or short video links), each with its own placement
     (inline / full-width / wrap-left / wrap-right) and width, set from
     the admin panel's media manager. Used by every content type.
     ------------------------------------------------------------------- */

  function renderMediaGallery(card, media, title) {
    var wrap = document.createElement('div');
    wrap.className = 'item-media-gallery';
    (media || []).forEach(function (m) {
      if (!m || !m.url) return;
      var placement = m.placement || 'full';
      var width = m.width ? Math.min(100, Math.max(20, parseInt(m.width, 10) || 100)) : 100;
      var fig = document.createElement('figure');
      fig.className = 'gallery-item gi-' + placement;
      if (placement !== 'full') fig.style.width = width + '%';

      if (m.kind === 'video') {
        var vid = extractYouTubeId(m.url);
        var thumbWrap = document.createElement('div');
        thumbWrap.className = 'gallery-video-thumb';
        if (vid) {
          thumbWrap.innerHTML = '<img src="https://img.youtube.com/vi/' + vid + '/hqdefault.jpg" alt="' + escapeAttr(m.caption || title || '') + '" loading="lazy"><div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
        } else {
          thumbWrap.innerHTML = '<div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
        }
        thumbWrap.addEventListener('click', function () { openVideoModal(m.caption || title || 'Video', m.url); });
        fig.appendChild(thumbWrap);
      } else {
        var img = document.createElement('img');
        img.src = m.url;
        img.alt = m.caption || title || '';
        img.loading = 'lazy';
        fig.appendChild(img);
      }
      if (m.caption) {
        var cap = document.createElement('figcaption');
        cap.textContent = m.caption;
        fig.appendChild(cap);
      }
      wrap.appendChild(fig);
    });
    card.appendChild(wrap);
    var clear = document.createElement('div');
    clear.className = 'gallery-clear';
    card.appendChild(clear);
  }

  /* Renders any extra story images matching a given placement:
     "left"/"right" float beside the text, "full" is a full-width divider,
     "inline" sits centered within the flow. */
  function renderStoryImages(card, images, placement, title) {
    (images || []).forEach(function (img) {
      if (!img || !img.url || (img.placement || 'full') !== placement) return;
      var fig = document.createElement('figure');
      fig.className = 'story-image story-image-' + placement;
      fig.innerHTML = '<img src="' + escapeAttr(img.url) + '" alt="' + escapeAttr(img.caption || title || '') + '" loading="lazy">' +
        (img.caption ? '<figcaption>' + escapeHtml(img.caption) + '</figcaption>' : '');
      card.appendChild(fig);
    });
  }

  /* ----- Code & Animations: language, collapsible code block + copy, video/github links ----- */

  function buildCodeCard(card, c, item) {
    var videoId = c.animation_url ? extractYouTubeId(c.animation_url) : null;
    var media = document.createElement('div');
    media.className = 'post-media';
    if (c.custom_thumbnail) {
      media.innerHTML = '<img src="' + escapeAttr(c.custom_thumbnail) + '" alt="' + escapeAttr(c.title) + '" loading="lazy">';
      if (videoId) {
        media.innerHTML += '<div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
        media.addEventListener('click', function () { openVideoModal(c.title, c.animation_url); });
      }
      card.appendChild(media);
    } else if (videoId) {
      media.innerHTML =
        '<img src="https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg" alt="' + escapeAttr(c.title) + '" loading="lazy">' +
        '<div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
      media.addEventListener('click', function () { openVideoModal(c.title, c.animation_url); });
      card.appendChild(media);
    } else {
      media.className += ' media-fallback';
      media.innerHTML = '<svg class="media-fallback-icon" aria-hidden="true"><use href="#i-code"/></svg>';
      card.appendChild(media);
    }

    var actions = document.createElement('div');
    actions.className = 'post-actions';

    var codeBtn = document.createElement('button');
    codeBtn.className = 'action-btn primary';
    codeBtn.type = 'button';
    codeBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-code"/></svg><span>View Code</span>';
    actions.appendChild(codeBtn);

    if (videoId) {
      actions.appendChild(makeLinkAction('Watch Video', null, function (e) {
        e.preventDefault();
        openVideoModal(c.title, c.animation_url);
      }, '#i-play'));
    } else if (c.animation_url) {
      actions.appendChild(makeLinkAction('Watch Animation', c.animation_url, null, '#i-play'));
    }
    if (c.github_url) {
      actions.appendChild(makeLinkActionIcon('GitHub', c.github_url, '#i-github'));
    }
    card.appendChild(actions);

    var codeWrap = document.createElement('div');
    codeWrap.className = 'code-wrap';
    codeWrap.innerHTML =
      '<div class="code-head"><span>' + escapeHtml(c.language || 'code') + '</span>' +
      '<button class="code-copy-btn" type="button"><svg aria-hidden="true"><use href="#i-copy"/></svg><span>Copy</span></button></div>' +
      '<pre class="code-block"></pre>';
    codeWrap.querySelector('.code-block').textContent = c.code_snippet || '';
    card.appendChild(codeWrap);

    codeBtn.addEventListener('click', function () {
      var open = codeWrap.classList.toggle('is-open');
      codeBtn.querySelector('span').textContent = open ? 'Hide Code' : 'View Code';
    });

    codeWrap.querySelector('.code-copy-btn').addEventListener('click', function () {
      var btn = codeWrap.querySelector('.code-copy-btn');
      copyText(c.code_snippet || '').then(function () {
        var label = btn.querySelector('span');
        var original = label.textContent;
        btn.innerHTML = '<svg aria-hidden="true"><use href="#i-check-sm"/></svg><span>Copied</span>';
        setTimeout(function () {
          btn.innerHTML = '<svg aria-hidden="true"><use href="#i-copy"/></svg><span>' + original + '</span>';
        }, 1600);
      });
    });
  }

  /* ----- YouTube: auto thumbnail + modal ----- */

  function buildYoutubeCard(card, y, item) {
    var videoId = extractYouTubeId(y.video_url);
    var media = document.createElement('div');
    media.className = 'post-media';
    if (videoId) {
      media.innerHTML =
        '<img src="https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg" alt="' + escapeAttr(y.title) + '" loading="lazy">' +
        '<div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
    } else {
      media.className += ' media-fallback';
      media.innerHTML = '<svg class="media-fallback-icon" aria-hidden="true"><use href="#i-yt"/></svg>';
    }
    media.addEventListener('click', function () { openVideoModal(y.title, y.video_url); });
    card.appendChild(media);

    if (y.description) {
      var excerpt = document.createElement('p');
      excerpt.className = 'post-excerpt';
      excerpt.textContent = y.description;
      card.appendChild(excerpt);
      if (y.description.length > 200) {
        excerpt.classList.add('text-clamp-3');
        var ytMoreBtn = document.createElement('button');
        ytMoreBtn.type = 'button';
        ytMoreBtn.className = 'more-btn';
        ytMoreBtn.innerHTML = '<span>Show more</span><svg aria-hidden="true"><use href="#i-chevron"/></svg>';
        ytMoreBtn.addEventListener('click', function () {
          var isClamped = excerpt.classList.toggle('text-clamp-3');
          ytMoreBtn.querySelector('span').textContent = isClamped ? 'Show more' : 'Show less';
          ytMoreBtn.classList.toggle('is-open', !isClamped);
        });
        card.appendChild(ytMoreBtn);
      }
    }

    var actions = document.createElement('div');
    actions.className = 'post-actions';
    var btn = document.createElement('button');
    btn.className = 'action-btn primary';
    btn.type = 'button';
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg><span>Watch Video</span>';
    btn.addEventListener('click', function () { openVideoModal(y.title, y.video_url); });
    actions.appendChild(btn);
    card.appendChild(actions);
  }

  /* ----- PDF: custom thumbnail or fallback icon, viewer modal + download ----- */

  function buildPdfCard(card, d, item) {
    var media = document.createElement('div');
    if (d.custom_thumbnail) {
      media.className = 'post-media media-pdf';
      media.innerHTML = '<img src="' + escapeAttr(d.custom_thumbnail) + '" alt="' + escapeAttr(d.title) + '" loading="lazy">';
    } else {
      media.className = 'post-media media-pdf media-fallback';
      media.innerHTML = '<svg class="media-fallback-icon" aria-hidden="true"><use href="#i-pdf"/></svg>';
    }
    media.addEventListener('click', function () { openPdfModal(d.title, d.pdf_url); });
    card.appendChild(media);

    var actions = document.createElement('div');
    actions.className = 'post-actions';
    var readBtn = document.createElement('button');
    readBtn.className = 'action-btn primary';
    readBtn.type = 'button';
    readBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-pdf"/></svg><span>Read PDF</span>';
    readBtn.addEventListener('click', function () { openPdfModal(d.title, d.pdf_url); });
    actions.appendChild(readBtn);

    var dl = document.createElement('a');
    dl.className = 'action-btn';
    dl.href = d.pdf_url;
    dl.setAttribute('download', '');
    dl.innerHTML = '<svg aria-hidden="true"><use href="#i-download"/></svg><span>Download</span>';
    actions.appendChild(dl);

    card.appendChild(actions);
  }

  /* ----- Course: cover + lesson count + "View Course" opens a detail view ----- */

  function buildCourseCard(card, co, item) {
    if (co.cover_thumbnail) {
      var cover = document.createElement('div');
      cover.className = 'course-cover';
      cover.innerHTML = '<img src="' + escapeAttr(co.cover_thumbnail) + '" alt="' + escapeAttr(co.title) + '" loading="lazy">';
      card.appendChild(cover);
    }
    var lessonCount = (co.lessons || []).length;
    var metaRow = document.createElement('div');
    metaRow.className = 'course-meta-row';
    metaRow.innerHTML = '<span class="course-lesson-count">' + lessonCount + ' dərs</span>';
    card.appendChild(metaRow);

    if (co.description) {
      var excerpt = document.createElement('p');
      excerpt.className = 'post-excerpt';
      excerpt.textContent = co.description;
      card.appendChild(excerpt);
    }

    var actions = document.createElement('div');
    actions.className = 'post-actions';
    var btn = document.createElement('button');
    btn.className = 'action-btn primary';
    btn.type = 'button';
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-course"/></svg><span>View Course</span>';
    btn.addEventListener('click', function () { openCourseDetail(co); });
    actions.appendChild(btn);
    card.appendChild(actions);
  }

  /* ---------------------------------------------------------------------
     Course detail view — ordered lesson list with modular, optional
     attachments (PDF notes / YouTube link / GitHub link / code snippet),
     each rendered only when present on that lesson.
     ------------------------------------------------------------------- */

  function openCourseDetail(co) {
    if (!els.courseDetailView) return;
    state.activeCourseId = co.id;
    Array.prototype.forEach.call(els.sideNav.querySelectorAll('.side-nav-btn'), function (b) { b.classList.remove('is-active'); });
    els.aboutBtn.classList.remove('is-active');
    els.aboutView.hidden = true;
    els.feedView.hidden = true;
    els.courseDetailView.hidden = false;
    renderCourseDetail(co);
    window.scrollTo(0, 0);
  }

  function closeCourseDetail() {
    els.courseDetailView.hidden = true;
    setSection(state.section === 'courses' ? 'courses' : 'home');
  }

  function renderCourseDetail(co) {
    var lessons = (co.lessons || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    var html = '<button class="course-detail-back" type="button" id="courseBackBtn"><svg aria-hidden="true"><use href="#i-back"/></svg><span>Back</span></button>';
    if (co.cover_thumbnail) {
      html += '<div class="course-detail-cover"><img src="' + escapeAttr(co.cover_thumbnail) + '" alt="' + escapeAttr(co.title) + '" loading="lazy"></div>';
    }
    html += '<h1>' + escapeHtml(co.title) + '</h1>';
    if (co.description) html += '<div class="course-detail-desc">' + formatRichText(co.description) + '</div>';
    html += '<div class="lesson-list" id="lessonList"></div>';

    els.courseDetailView.innerHTML = html;
    document.getElementById('courseBackBtn').addEventListener('click', closeCourseDetail);
    var descEl = els.courseDetailView.querySelector('.course-detail-desc');
    if (descEl) { renderMathIn(descEl); bindInlineMedia(descEl); }

    var list = document.getElementById('lessonList');
    lessons.forEach(function (lesson, idx) {
      var lc = document.createElement('div');
      lc.className = 'lesson-card';

      var head = document.createElement('div');
      head.className = 'lesson-card-head';
      head.innerHTML = '<span class="lesson-index">' + (idx + 1) + '</span><h3>' + escapeHtml(lesson.title || '') + '</h3>';
      lc.appendChild(head);

      var thumb = document.createElement('div');
      thumb.className = 'post-media';
      if (lesson.thumbnail) {
        thumb.innerHTML = '<img src="' + escapeAttr(lesson.thumbnail) + '" alt="' + escapeAttr(lesson.title || '') + '" loading="lazy">';
      } else {
        thumb.className = 'post-media media-fallback';
        thumb.innerHTML = '<svg class="media-fallback-icon" aria-hidden="true"><use href="#i-course"/></svg>';
      }
      lc.appendChild(thumb);
      if (lesson.description) {
        var desc = document.createElement('p');
        desc.className = 'lesson-desc';
        desc.textContent = lesson.description;
        lc.appendChild(desc);
        if (lesson.description.length > 180) {
          desc.classList.add('text-clamp-3');
          var moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'more-btn';
          moreBtn.innerHTML = '<span>Show more</span><svg aria-hidden="true"><use href="#i-chevron"/></svg>';
          moreBtn.addEventListener('click', function () {
            var isClamped = desc.classList.toggle('text-clamp-3');
            moreBtn.querySelector('span').textContent = isClamped ? 'Show more' : 'Show less';
            moreBtn.classList.toggle('is-open', !isClamped);
          });
          lc.insertBefore(moreBtn, desc.nextSibling);
        }
      }

      var actions = document.createElement('div');
      actions.className = 'post-actions';
      var hasActions = false;
      if (lesson.video_url) {
        hasActions = true;
        var vBtn = document.createElement('button');
        vBtn.className = 'action-btn primary';
        vBtn.type = 'button';
        vBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg><span>Watch Video</span>';
        vBtn.addEventListener('click', function () { openVideoModal(lesson.title, lesson.video_url); });
        actions.appendChild(vBtn);
      }
      if (lesson.pdf_url) {
        hasActions = true;
        var pBtn = document.createElement('button');
        pBtn.className = 'action-btn';
        pBtn.type = 'button';
        pBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-pdf"/></svg><span>Read Notes</span>';
        pBtn.addEventListener('click', function () { openPdfModal(lesson.title, lesson.pdf_url); });
        actions.appendChild(pBtn);
      }
      if (lesson.github_url) {
        hasActions = true;
        actions.appendChild(makeLinkActionIcon('GitHub', lesson.github_url, '#i-github'));
      }
      if (hasActions) lc.appendChild(actions);

      if (lesson.code_snippet) {
        var codeWrap = document.createElement('div');
        codeWrap.className = 'code-wrap';
        codeWrap.innerHTML =
          '<div class="code-head"><span>code</span>' +
          '<button class="code-copy-btn" type="button"><svg aria-hidden="true"><use href="#i-copy"/></svg><span>Copy</span></button></div>' +
          '<pre class="code-block"></pre>';
        codeWrap.querySelector('.code-block').textContent = lesson.code_snippet;
        lc.appendChild(codeWrap);

        var codeToggle = document.createElement('button');
        codeToggle.className = 'action-btn';
        codeToggle.type = 'button';
        codeToggle.innerHTML = '<svg aria-hidden="true"><use href="#i-code"/></svg><span>View Code</span>';
        codeToggle.addEventListener('click', function () {
          var open = codeWrap.classList.toggle('is-open');
          codeToggle.querySelector('span').textContent = open ? 'Hide Code' : 'View Code';
        });
        if (!hasActions) { actions.appendChild(codeToggle); lc.insertBefore(actions, codeWrap); }
        else actions.appendChild(codeToggle);

        codeWrap.querySelector('.code-copy-btn').addEventListener('click', function () {
          var btn = codeWrap.querySelector('.code-copy-btn');
          copyText(lesson.code_snippet).then(function () {
            var label = btn.querySelector('span');
            var original = label.textContent;
            btn.innerHTML = '<svg aria-hidden="true"><use href="#i-check-sm"/></svg><span>Copied</span>';
            setTimeout(function () { btn.innerHTML = '<svg aria-hidden="true"><use href="#i-copy"/></svg><span>' + original + '</span>'; }, 1600);
          });
        });
      }

      list.appendChild(lc);
    });
  }

  /* ---------------------------------------------------------------------
     Small action-link helpers
     ------------------------------------------------------------------- */

  function makeLinkAction(label, href, onClick, iconRef) {
    var a = document.createElement('a');
    a.className = 'action-btn';
    if (iconRef) {
      a.innerHTML = '<svg aria-hidden="true"><use href="' + iconRef + '"/></svg><span>' + escapeHtml(label) + '</span>';
    } else {
      a.textContent = label;
    }
    if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else { a.href = '#'; }
    if (onClick) a.addEventListener('click', onClick);
    return a;
  }

  function makeLinkActionIcon(label, href, iconRef) {
    var a = document.createElement('a');
    a.className = 'action-btn';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = '<svg aria-hidden="true"><use href="' + iconRef + '"/></svg><span>' + escapeHtml(label) + '</span>';
    return a;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  function escapeAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  /* ---------------------------------------------------------------------
     Modal: YouTube embed / PDF viewer
     ------------------------------------------------------------------- */

  function bindModal() {
    els.modalClose.addEventListener('click', closeModal);
    els.modalBackdrop.addEventListener('click', function (e) {
      if (e.target === els.modalBackdrop) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openVideoModal(title, url) {
    var videoId = extractYouTubeId(url);
    els.modalTitle.textContent = title;
    if (videoId) {
      els.modalBody.innerHTML =
        '<iframe src="https://www.youtube.com/embed/' + videoId +
        '?autoplay=1" title="' + escapeAttr(title) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    els.modalBackdrop.classList.add('is-open');
  }

  function openPdfModal(title, url) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = '<iframe src="' + url + '" title="' + escapeAttr(title) + '"></iframe>';
    els.modalBackdrop.classList.add('is-open');
  }

  function closeModal() {
    els.modalBackdrop.classList.remove('is-open');
    els.modalBody.innerHTML = '';
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/);
    return m ? m[1] : null;
  }

  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Renders both plain dates ("2026-09-14") and full timestamps
     ("2026-09-14T21:30") from the admin panel's datetime-local inputs.
     Timestamps always use 12-hour clock with an AM/PM indicator, e.g.
     "Sep 14, 2026, 09:30 PM". */
  function formatDate(iso) {
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

})();
