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
    stories: { title: 'Math Insights', sub: 'Elmi-kütləvi yazılar, maraqlı faktlar və bioqrafiyalar.' },
    code: { title: 'Code & Animations', sub: 'Manim, MATLAB, Python və C++ ilə hazırlanmış skriptlər və animasiyalar.' },
    youtube: { title: 'YouTube', sub: 'Videolar və qeydə alınmış izahlar.' }
  };

  var state = {
    raw: { problems: [], stories: [], code_animations: [], youtube: [], pdf: [] },
    section: 'home',
    category: 'all',
    query: ''
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    initTheme();
    bindNav();
    bindSearch();
    bindModal();

    try {
      var data = await fetchData();
      state.raw = {
        problems: data.problems || [],
        stories: data.stories || [],
        code_animations: data.code_animations || [],
        youtube: data.youtube || [],
        pdf: data.pdf || []
      };
      render();
    } catch (err) {
      renderFetchError(err);
    }
  }

  function cacheEls() {
    els.sideNav = document.getElementById('sideNav');
    els.aboutBtn = document.getElementById('aboutBtn');
    els.feedView = document.getElementById('feedView');
    els.aboutView = document.getElementById('aboutView');
    els.feedHeadingTitle = document.getElementById('feedHeadingTitle');
    els.feedHeadingSub = document.getElementById('feedHeadingSub');
    els.filterBar = document.getElementById('filterBar');
    els.feedContainer = document.getElementById('feedContainer');
    els.emptyState = document.getElementById('emptyState');
    els.searchInput = document.getElementById('searchInput');
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
      els.aboutView.hidden = false;
    });
  }

  function setSection(section) {
    state.section = section;
    state.category = 'all';
    Array.prototype.forEach.call(els.sideNav.querySelectorAll('.side-nav-btn'), function (b) {
      b.classList.toggle('is-active', b.dataset.section === section);
    });
    els.aboutBtn.classList.remove('is-active');
    els.aboutView.hidden = true;
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

    out.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    return out;
  }

  function getSectionItems(all) {
    if (state.section === 'home') return all;
    var map = { problems: 'problem', stories: 'story', code: 'code', youtube: 'youtube' };
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
    return parts.join(' ').toLowerCase();
  }

  /* ---------------------------------------------------------------------
     Filter pills (built from whatever categories exist in the current section)
     ------------------------------------------------------------------- */

  function renderFilterBar(sectionItems) {
    var seen = {};
    var pills = [];
    sectionItems.forEach(function (item) {
      if (item.category && !seen[item.category]) {
        seen[item.category] = true;
        pills.push({ value: item.category, label: item.category });
      }
    });
    pills.sort(function (a, b) { return a.label.localeCompare(b.label); });

    els.filterBar.innerHTML = '';
    if (!pills.length) return;

    var all = document.createElement('button');
    all.className = 'filter-pill' + (state.category === 'all' ? ' is-active' : '');
    all.textContent = 'All';
    all.dataset.value = 'all';
    els.filterBar.appendChild(all);

    pills.forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'filter-pill' + (state.category === p.value ? ' is-active' : '');
      btn.textContent = p.label;
      btn.dataset.value = p.value;
      els.filterBar.appendChild(btn);
    });

    els.filterBar.querySelectorAll('.filter-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.dataset.value;
        render();
      });
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
      if (state.category !== 'all' && item.category !== state.category) return false;
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
     "### " headers, **bold**, and leaves $...$ / $$...$$ for KaTeX.
     ------------------------------------------------------------------- */

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inlineFormat(text) {
    return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function formatRichText(raw) {
    var escaped = escapeHtml(raw || '');
    var blocks = escaped.split(/\n\s*\n/);
    return blocks.map(function (block) {
      var trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.indexOf('### ') === 0) {
        return '<h4>' + inlineFormat(trimmed.slice(4)) + '</h4>';
      }
      return '<p>' + inlineFormat(trimmed).replace(/\n/g, '<br>') + '</p>';
    }).join('');
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

  /* ---------------------------------------------------------------------
     Card builders — one per content type
     ------------------------------------------------------------------- */

  var KICKER_LABEL = { problem: 'Solved Problem', story: 'Math Insight', code: 'Code & Animation', youtube: 'YouTube', pdf: 'PDF' };
  var KICKER_CLASS = { problem: 'k-problem', story: 'k-story', code: 'k-code', youtube: 'k-youtube', pdf: 'k-pdf' };

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
      pdf: buildPdfCard
    }[item.sourceType];
    if (builder) builder(card, item.raw, item);

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
        tag.className = 'tag';
        tag.textContent = t;
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
        rendered = true;
      }
    });
  }

  /* ----- Story: excerpt + "Read Full Story" toggle ----- */

  function buildStoryCard(card, s, item) {
    if (s.image) {
      var media = document.createElement('div');
      media.className = 'post-media';
      media.innerHTML = '<img src="' + escapeAttr(s.image) + '" alt="' + escapeAttr(s.title) + '" loading="lazy">';
      card.appendChild(media);
    }

    var excerpt = document.createElement('div');
    excerpt.className = 'post-excerpt';
    var full = s.content || '';
    var isLong = full.length > 320;
    var short = isLong ? full.slice(0, 320).trim() + '…' : full;
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
        btn.querySelector('span').textContent = expanded ? 'Show Less' : 'Read Full Story';
      });
    }
    renderMathIn(excerpt);
  }

  /* ----- Code & Animations: language, collapsible code block + copy, video/github links ----- */

  function buildCodeCard(card, c, item) {
    var videoId = c.animation_url ? extractYouTubeId(c.animation_url) : null;
    if (videoId) {
      var media = document.createElement('div');
      media.className = 'post-media';
      media.innerHTML =
        '<img src="https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg" alt="' + escapeAttr(c.title) + '" loading="lazy">' +
        '<div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
      media.addEventListener('click', function () { openVideoModal(c.title, c.animation_url); });
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
      actions.appendChild(makeLinkAction('🎬 Watch Video', null, function (e) {
        e.preventDefault();
        openVideoModal(c.title, c.animation_url);
      }));
    } else if (c.animation_url) {
      actions.appendChild(makeLinkAction('🎬 Watch Animation', c.animation_url));
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
      media.innerHTML = '<div class="play-badge"><svg aria-hidden="true"><use href="#i-play"/></svg></div>';
    }
    media.addEventListener('click', function () { openVideoModal(y.title, y.video_url); });
    card.appendChild(media);

    if (y.description) {
      var excerpt = document.createElement('p');
      excerpt.className = 'post-excerpt';
      excerpt.textContent = y.description;
      card.appendChild(excerpt);
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
      media.className = 'post-media media-pdf';
      media.innerHTML = '<svg class="pdf-fallback" aria-hidden="true"><use href="#i-pdf"/></svg>';
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
    dl.innerHTML = '⬇ Download';
    actions.appendChild(dl);

    card.appendChild(actions);
  }

  /* ---------------------------------------------------------------------
     Small action-link helpers
     ------------------------------------------------------------------- */

  function makeLinkAction(label, href, onClick) {
    var a = document.createElement('a');
    a.className = 'action-btn';
    a.textContent = label;
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

  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

})();
