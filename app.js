/* =========================================================================
   Digital Garden — Frontend Dynamic Engine
   Fetches data.json, renders content cards, handles search/filter/theme.
   ========================================================================= */

(function () {
  'use strict';

  var DATA_URL = 'data.json';

  var state = {
    items: [],
    query: '',
    type: 'all'
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    document.getElementById('year').textContent = new Date().getFullYear();

    els.grid = document.getElementById('entriesGrid');
    els.empty = document.getElementById('emptyState');
    els.search = document.getElementById('searchInput');
    els.filters = document.getElementById('typeFilters');
    els.modalBackdrop = document.getElementById('modalBackdrop');
    els.modalTitle = document.getElementById('modalTitle');
    els.modalBody = document.getElementById('modalBody');
    els.modalClose = document.getElementById('modalClose');

    initTheme();
    bindToolbar();
    bindModal();

    try {
      var data = await fetchData();
      state.items = normalizeItems(data.items || []);
      render();
    } catch (err) {
      renderFetchError(err);
    }
  }

  /* ---------------------------------------------------------------------
     Data loading
     ------------------------------------------------------------------- */

  async function fetchData() {
    var res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function normalizeItems(rawItems) {
    return rawItems
      .map(function (item) {
        return {
          id: item.id || cryptoRandomId(),
          type: item.type || 'link',
          title: item.title || 'Untitled',
          description: item.description || '',
          url: item.url || '',
          content: item.content || '',
          date: item.date || '',
          tags: Array.isArray(item.tags) ? item.tags : [],
          meta: item.meta || {}
        };
      })
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  function cryptoRandomId() {
    return 'itm_' + Math.random().toString(36).slice(2, 9);
  }

  /* ---------------------------------------------------------------------
     Theme (dark / light, auto-detect + toggle, persisted)
     ------------------------------------------------------------------- */

  function initTheme() {
    var toggle = document.getElementById('themeToggle');
    var stored = localStorage.getItem('dg-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);

    toggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('dg-theme', next);
    });
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /* ---------------------------------------------------------------------
     Toolbar: search + type filter
     ------------------------------------------------------------------- */

  function bindToolbar() {
    els.search.addEventListener('input', debounce(function () {
      state.query = els.search.value.trim().toLowerCase();
      render();
    }, 140));

    els.filters.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;
      Array.prototype.forEach.call(els.filters.querySelectorAll('.filter-btn'), function (b) {
        b.classList.remove('is-active');
      });
      btn.classList.add('is-active');
      state.type = btn.dataset.type;
      render();
    });
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
     Filtering + rendering
     ------------------------------------------------------------------- */

  function getFilteredItems() {
    return state.items.filter(function (item) {
      var typeMatch = state.type === 'all' || item.type === state.type;
      if (!typeMatch) return false;
      if (!state.query) return true;
      var haystack = [item.title, item.description, item.content, item.tags.join(' ')]
        .join(' ')
        .toLowerCase();
      return haystack.indexOf(state.query) !== -1;
    });
  }

  function render() {
    var items = getFilteredItems();
    els.grid.innerHTML = '';
    els.empty.hidden = items.length !== 0;

    items.forEach(function (item, idx) {
      var card = buildCard(item);
      card.style.animationDelay = Math.min(idx * 25, 300) + 'ms';
      els.grid.appendChild(card);
    });

    if (window.katex) renderLatexPreviews();
  }

  function renderFetchError(err) {
    els.grid.innerHTML = '';
    els.empty.hidden = false;
    els.empty.querySelector('p').textContent =
      'Could not load content (' + err.message + '). Check that data.json is reachable.';
  }

  /* ---------------------------------------------------------------------
     Card builders — one per content type
     ------------------------------------------------------------------- */

  var TYPE_LABEL = { youtube: 'Video', pdf: 'PDF', latex: 'LaTeX', link: 'Link' };

  function buildCard(item) {
    var card = document.createElement('article');
    card.className = 'entry-card';
    card.dataset.id = item.id;

    var media = buildMedia(item);
    if (media) card.appendChild(media);

    var body = document.createElement('div');
    body.className = 'entry-body';

    var kicker = document.createElement('p');
    kicker.className = 'entry-kicker mono';
    kicker.textContent = '/' + item.type + (item.date ? ' · ' + formatDate(item.date) : '');
    body.appendChild(kicker);

    var title = document.createElement('h3');
    title.className = 'entry-title';
    title.textContent = item.title;
    body.appendChild(title);

    if (item.description) {
      var desc = document.createElement('p');
      desc.className = 'entry-desc';
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    if (item.tags.length) {
      var tagRow = document.createElement('div');
      tagRow.className = 'tag-row';
      var typeTag = document.createElement('span');
      typeTag.className = 'tag type-' + item.type;
      typeTag.textContent = TYPE_LABEL[item.type] || item.type;
      tagRow.appendChild(typeTag);
      item.tags.forEach(function (t) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t;
        tagRow.appendChild(tag);
      });
      body.appendChild(tagRow);
    }

    var actions = buildActions(item);
    if (actions) body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function buildMedia(item) {
    if (item.type === 'youtube') {
      var wrap = document.createElement('div');
      wrap.className = 'entry-media media-video';
      wrap.innerHTML =
        '<div class="coord"></div><div class="entry-play"><svg aria-hidden="true"><use href="#icon-play-big"/></svg></div>';
      wrap.addEventListener('click', function () { openVideoModal(item); });
      return wrap;
    }
    if (item.type === 'pdf') {
      var pdfWrap = document.createElement('div');
      pdfWrap.className = 'entry-media media-pdf';
      pdfWrap.innerHTML = '<div class="coord"></div><svg aria-hidden="true"><use href="#icon-pdf"/></svg>';
      return pdfWrap;
    }
    if (item.type === 'link') {
      var linkWrap = document.createElement('div');
      linkWrap.className = 'entry-media media-link';
      linkWrap.innerHTML = '<div class="coord"></div><svg aria-hidden="true"><use href="#icon-link"/></svg>';
      return linkWrap;
    }
    if (item.type === 'latex') {
      var latexWrap = document.createElement('div');
      latexWrap.className = 'entry-media media-latex';
      latexWrap.innerHTML = '<div class="coord"></div><span class="katex-target" data-src="' +
        escapeAttr(item.content) + '"><span class="ph">∫ rendering…</span></span>';
      return latexWrap;
    }
    return null;
  }

  function buildActions(item) {
    var wrap = document.createElement('div');
    wrap.className = 'entry-actions';
    var hasAction = false;

    if (item.type === 'youtube' && item.url) {
      wrap.appendChild(makeAction('🎬 Watch Video', item.url, true, function (e) {
        e.preventDefault();
        openVideoModal(item);
      }));
      hasAction = true;
    }

    if (item.type === 'pdf' && item.url) {
      wrap.appendChild(makeAction('📄 View PDF', item.url, true, function (e) {
        e.preventDefault();
        openPdfModal(item);
      }));
      wrap.appendChild(makeAction('⬇ Download', item.url, false, null, true));
      hasAction = true;
    }

    if (item.type === 'link' && item.url) {
      wrap.appendChild(makeAction('🔗 ' + (item.meta.linkLabel || 'Open Link'), item.url, true));
      hasAction = true;
    }

    if (item.type === 'latex' && item.meta.sourceUrl) {
      wrap.appendChild(makeAction('✏️ ' + (item.meta.sourceLabel || 'Source'), item.meta.sourceUrl, false, null, true));
      hasAction = true;
    }

    if (item.meta && item.meta.sourceUrl && item.type !== 'latex') {
      wrap.appendChild(makeAction('✏️ ' + (item.meta.sourceLabel || 'Source'), item.meta.sourceUrl, false, null, true));
      hasAction = true;
    }

    return hasAction ? wrap : null;
  }

  function makeAction(label, href, primary, onClick, download) {
    var a = document.createElement('a');
    a.className = 'action-btn' + (primary ? ' primary' : '');
    a.href = href;
    a.textContent = label;
    if (download) a.setAttribute('download', '');
    if (!onClick) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.addEventListener('click', onClick);
    }
    return a;
  }

  /* ---------------------------------------------------------------------
     LaTeX rendering
     ------------------------------------------------------------------- */

  function renderLatexPreviews() {
    document.querySelectorAll('.katex-target').forEach(function (el) {
      var src = el.dataset.src || '';
      try {
        katex.render(src, el, { throwOnError: false, displayMode: true });
      } catch (e) {
        el.innerHTML = '<span class="ph">Could not render formula</span>';
      }
    });
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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

  function openVideoModal(item) {
    var videoId = extractYouTubeId(item.url);
    els.modalTitle.textContent = item.title;
    if (videoId) {
      els.modalBody.innerHTML =
        '<iframe src="https://www.youtube.com/embed/' + videoId +
        '?autoplay=1" title="' + escapeAttr(item.title) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    } else {
      els.modalBody.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#eee;">Could not embed this video.</div>';
    }
    els.modalBackdrop.classList.add('is-open');
  }

  function openPdfModal(item) {
    els.modalTitle.textContent = item.title;
    els.modalBody.innerHTML = '<iframe src="' + item.url + '" title="' + escapeAttr(item.title) + '"></iframe>';
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
