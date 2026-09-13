/* =========================================================================
   Anur Qoradalov — Modern Jamstack Web Platform Engine
   Features: Reverse-chronological feed, Medium-style navigation,
             MathJax v3 LaTeX problem engine, YouTube media renderer,
             smooth dark/light theme engine, and interactive tag filter.
   ========================================================================= */

(function () {
  'use strict';

  var DATA_URL = 'data.json';
  var THEME_KEY = 'theme';

  var SECTION_META = {
    home: {
      title: 'Home',
      sub: 'Latest notes, proofs, problems, animations, and media.'
    },
    problems: {
      title: 'Problems',
      sub: 'LaTeX mathematical problems with step-by-step solutions.'
    },
    insights: {
      title: 'Insights',
      sub: 'Mathematical stories, popular science, and theoretical notes.'
    },
    codes: {
      title: 'Codes',
      sub: 'Manim animations, MATLAB, Python, C++, and YouTube videos.'
    },
    about: {
      title: 'About',
      sub: 'Author background, biography, and social links.'
    }
  };

  var TYPE_LABEL = {
    problem: 'Problem',
    insight: 'Insight',
    code: 'Code',
    youtube: 'Video',
    pdf: 'PDF',
    link: 'Link'
  };

  var state = {
    items: [],
    meta: {},
    section: 'home',
    tag: 'all',
    query: '',
    filterOpen: false
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    initTheme();
    bindNavEvents();
    bindToolbarEvents();
    bindModalEvents();
    bindMobileDrawer();

    // Set current copyright year
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    try {
      var data = await fetchFeedData();
      state.meta = data.meta || {};
      state.items = normalizeItems(data.items || []);

      renderAuthorMeta();
      renderSidebarWidgets();
      renderFeed();
    } catch (err) {
      renderErrorState(err);
    }
  }

  function cacheElements() {
    els.grid = document.getElementById('entriesGrid');
    els.empty = document.getElementById('emptyState');
    els.emptyResetBtn = document.getElementById('emptyResetBtn');
    els.search = document.getElementById('searchInput');
    els.searchClear = document.getElementById('searchClearBtn');
    els.filterToggleBtn = document.getElementById('filterToggleBtn');
    els.activeFilterBadge = document.getElementById('activeFilterBadge');
    els.filterPanel = document.getElementById('filterPanel');
    els.filterResetBtn = document.getElementById('filterResetBtn');
    els.tagFilters = document.getElementById('tagFilters');
    els.feedToolbar = document.getElementById('feedToolbar');
    els.feedTitle = document.getElementById('feedTitle');
    els.feedSub = document.getElementById('feedSub');
    els.aboutPage = document.getElementById('aboutPage');
    els.modalBackdrop = document.getElementById('modalBackdrop');
    els.modalTitle = document.getElementById('modalTitle');
    els.modalBody = document.getElementById('modalBody');
    els.modalClose = document.getElementById('modalClose');
    els.recentList = document.getElementById('recentList');
    els.topicCloud = document.getElementById('topicCloud');
    els.sidebarBackdrop = document.getElementById('sidebarBackdrop');
    els.menuToggle = document.getElementById('menuToggle');
  }

  /* =========================================================================
     Theme Toggle Engine (Light / Dark with localStorage)
     ========================================================================= */

  function initTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var currentTheme = stored || (prefersDark ? 'dark' : 'light');

    applyTheme(currentTheme);

    var toggles = document.querySelectorAll('.theme-toggle');
    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var active = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var next = active === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch (e) {}
      });
    });

    // Listen for OS theme preference change if not explicitly overridden
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }

    var toggles = document.querySelectorAll('.theme-toggle');
    toggles.forEach(function (btn) {
      var label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }

  /* =========================================================================
     Data Fetching & Normalization
     ========================================================================= */

  async function fetchFeedData() {
    var res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function normalizeItems(rawItems) {
    return rawItems
      .map(function (item) {
        var type = item.type || 'insight';
        if (type === 'latex') type = 'problem';

        var tags = Array.isArray(item.tags) ? item.tags.slice() : [];
        var subject = item.subject_tag || (item.meta && item.meta.subject_tag) || '';
        if (subject && tags.indexOf(subject) === -1) tags.push(subject);
        var language = item.language || (item.meta && item.meta.language) || '';
        if (language && tags.indexOf(language) === -1) tags.push(language);

        var date = item.date || '';

        return {
          id: item.id || ('itm_' + Math.random().toString(36).slice(2, 9)),
          type: type,
          title: item.title || 'Untitled',
          description: item.description || '',
          url: item.url || item.youtube_url || item.pdf_url || item.video_url || '',
          youtube_url: item.youtube_url || (type === 'youtube' ? item.url : '') || item.video_url || '',
          pdf_url: item.pdf_url || (type === 'pdf' ? item.url : '') || '',
          video_url: item.video_url || '',
          custom_thumbnail_url: item.custom_thumbnail_url || (item.meta && item.meta.thumbnail) || '',
          content: item.content || item.content_markdown_or_html || '',
          question_latex: item.question_latex || (type === 'problem' ? item.content : '') || '',
          solution_latex: item.solution_latex || (item.meta && item.meta.solution_latex) || '',
          subject_tag: subject,
          language: language,
          code_snippet: item.code_snippet || (type === 'code' ? item.content : '') || '',
          date: date,
          tags: tags,
          meta: item.meta || {}
        };
      })
      // Strictly sort by timestamp reverse-chronologically (latest first)
      .sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
      });
  }

  /* =========================================================================
     Author Profile & Sidebar Metadata
     ========================================================================= */

  function renderAuthorMeta() {
    var m = state.meta;
    var name = m.authorName || 'Anur Qoradalov';
    var role = m.authorRole || 'Mathematics Student';
    var bio = m.bio || '';
    var initials = getInitials(name);

    safeSetText('brandName', name);
    safeSetText('brandRole', role);
    safeSetText('aboutMiniName', name);
    safeSetText('aboutMiniBio', bio);
    safeSetText('aboutPageName', name);
    safeSetText('aboutPageRole', role);

    var bioEl = document.getElementById('aboutPageBio');
    if (bioEl) bioEl.innerHTML = parseSimpleMarkdown(bio);

    renderAvatar('authorAvatar', m.profileImage, initials);
    renderAvatar('aboutPageAvatar', m.profileImage, initials);

    renderSocialLinks('socialRow', m.social);
    renderSocialLinks('aboutPageSocial', m.social);

    document.title = name;
  }

  function safeSetText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text || '';
  }

  function getInitials(name) {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join('') || 'AQ';
  }

  function renderAvatar(id, imageUrl, initials) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = initials;
    if (imageUrl) {
      el.style.backgroundImage = 'url("' + imageUrl + '")';
      el.textContent = '';
    } else {
      el.style.backgroundImage = 'none';
    }
  }

  function renderSocialLinks(containerId, socialMap) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    socialMap = socialMap || {};

    var platforms = [
      { key: 'youtube', icon: 'icon-youtube', label: 'YouTube' },
      { key: 'github', icon: 'icon-github', label: 'GitHub' },
      { key: 'instagram', icon: 'icon-instagram', label: 'Instagram' },
      { key: 'tiktok', icon: 'icon-tiktok', label: 'TikTok' }
    ];

    platforms.forEach(function (p) {
      var href = socialMap[p.key];
      if (!href) return;
      var a = document.createElement('a');
      a.className = 'social-link';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', p.label);
      a.innerHTML = '<svg aria-hidden="true"><use href="#' + p.icon + '"/></svg>';
      el.appendChild(a);
    });
  }

  /* =========================================================================
     Navigation & Section Handling
     ========================================================================= */

  function bindNavEvents() {
    var buttons = document.querySelectorAll('.side-nav-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sec = btn.dataset.section;
        if (sec) {
          switchSection(sec);
          closeMobileDrawer();
        }
      });
    });

    // Clicking brand name in sidebar resets to Home
    var brandName = document.getElementById('brandName');
    if (brandName) {
      brandName.addEventListener('click', function (e) {
        e.preventDefault();
        switchSection('home');
        closeMobileDrawer();
      });
    }
  }

  function switchSection(section) {
    state.section = section;
    state.tag = 'all'; // reset tag when switching main sections

    document.querySelectorAll('.side-nav-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.section === section);
    });

    var meta = SECTION_META[section] || SECTION_META.home;
    els.feedTitle.textContent = meta.title;
    els.feedSub.textContent = meta.sub;

    closeFilterPanel();
    renderFeed();
  }

  function bindMobileDrawer() {
    if (els.menuToggle) {
      els.menuToggle.addEventListener('click', function () {
        var isOpen = document.body.classList.contains('nav-open');
        if (isOpen) {
          closeMobileDrawer();
        } else {
          openMobileDrawer();
        }
      });
    }

    if (els.sidebarBackdrop) {
      els.sidebarBackdrop.addEventListener('click', closeMobileDrawer);
    }
  }

  function openMobileDrawer() {
    document.body.classList.add('nav-open');
    if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = false;
    if (els.menuToggle) els.menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMobileDrawer() {
    document.body.classList.remove('nav-open');
    if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = true;
    if (els.menuToggle) els.menuToggle.setAttribute('aria-expanded', 'false');
  }

  /* =========================================================================
     Toolbar, Search & Dedicated Filter UI
     ========================================================================= */

  function bindToolbarEvents() {
    if (els.search) {
      els.search.addEventListener('input', debounce(function () {
        state.query = els.search.value.trim().toLowerCase();
        if (els.searchClear) els.searchClear.hidden = !state.query;
        renderFeed();
      }, 150));
    }

    if (els.searchClear) {
      els.searchClear.addEventListener('click', function () {
        els.search.value = '';
        state.query = '';
        els.searchClear.hidden = true;
        renderFeed();
        els.search.focus();
      });
    }

    // Dedicated Filter Button Action: Toggles dropdown filter tray
    if (els.filterToggleBtn) {
      els.filterToggleBtn.addEventListener('click', function () {
        toggleFilterPanel();
      });
    }

    if (els.filterResetBtn) {
      els.filterResetBtn.addEventListener('click', function () {
        state.tag = 'all';
        updateFilterBadge();
        renderTagChips();
        renderFeed();
      });
    }

    if (els.tagFilters) {
      els.tagFilters.addEventListener('click', function (e) {
        var btn = e.target.closest('.filter-btn');
        if (!btn) return;
        state.tag = btn.dataset.tag || 'all';
        updateFilterBadge();
        renderTagChips();
        renderFeed();
      });
    }

    if (els.emptyResetBtn) {
      els.emptyResetBtn.addEventListener('click', function () {
        state.query = '';
        state.tag = 'all';
        if (els.search) els.search.value = '';
        if (els.searchClear) els.searchClear.hidden = true;
        updateFilterBadge();
        renderTagChips();
        renderFeed();
      });
    }
  }

  function toggleFilterPanel() {
    state.filterOpen = !state.filterOpen;
    if (els.filterPanel) {
      els.filterPanel.hidden = !state.filterOpen;
    }
    if (els.filterToggleBtn) {
      els.filterToggleBtn.setAttribute('aria-expanded', String(state.filterOpen));
      els.filterToggleBtn.classList.toggle('is-active', state.filterOpen);
    }
  }

  function closeFilterPanel() {
    state.filterOpen = false;
    if (els.filterPanel) els.filterPanel.hidden = true;
    if (els.filterToggleBtn) {
      els.filterToggleBtn.setAttribute('aria-expanded', 'false');
      els.filterToggleBtn.classList.toggle('is-active', false);
    }
  }

  function updateFilterBadge() {
    if (!els.activeFilterBadge) return;
    if (state.tag && state.tag !== 'all') {
      els.activeFilterBadge.hidden = false;
      els.activeFilterBadge.textContent = state.tag;
    } else {
      els.activeFilterBadge.hidden = true;
      els.activeFilterBadge.textContent = '';
    }
  }

  function getSectionItems() {
    return state.items.filter(function (item) {
      if (state.section === 'home') return true;
      if (state.section === 'problems') return item.type === 'problem';
      if (state.section === 'insights') return item.type === 'insight' || item.type === 'link';
      if (state.section === 'codes') return item.type === 'code' || item.type === 'youtube' || item.type === 'pdf';
      return false;
    });
  }

  function getFilteredItems() {
    var sectionItems = getSectionItems();
    return sectionItems.filter(function (item) {
      // Filter by tag
      if (state.tag !== 'all') {
        var tagsLower = (item.tags || []).map(function (t) { return String(t).toLowerCase(); });
        if (item.language) tagsLower.push(String(item.language).toLowerCase());
        if (item.subject_tag) tagsLower.push(String(item.subject_tag).toLowerCase());
        if (tagsLower.indexOf(state.tag.toLowerCase()) === -1) return false;
      }

      // Filter by search query
      if (!state.query) return true;
      var haystack = [
        item.title,
        item.description,
        item.content,
        item.question_latex,
        item.solution_latex,
        item.code_snippet,
        (item.tags || []).join(' '),
        item.language,
        item.subject_tag
      ].join(' ').toLowerCase();

      return haystack.indexOf(state.query) !== -1;
    });
  }

  function collectUniqueTags(items) {
    var seen = {};
    var out = [];
    items.forEach(function (item) {
      (item.tags || []).forEach(add);
      if (item.language) add(item.language);
      if (item.subject_tag) add(item.subject_tag);
    });

    function add(tag) {
      var t = String(tag || '').trim();
      if (!t || seen[t.toLowerCase()]) return;
      seen[t.toLowerCase()] = true;
      out.push(t);
    }

    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  function renderTagChips() {
    if (!els.tagFilters) return;
    var items = getSectionItems();
    var tags = collectUniqueTags(items);

    var html = '<button class="filter-btn' + (state.tag === 'all' ? ' is-active' : '') +
      '" data-tag="all" type="button">All (' + items.length + ')</button>';

    tags.forEach(function (t) {
      var isActive = state.tag.toLowerCase() === t.toLowerCase();
      html += '<button class="filter-btn' + (isActive ? ' is-active' : '') +
        '" data-tag="' + escapeAttr(t) + '" type="button">' + escapeHtml(t) + '</button>';
    });

    els.tagFilters.innerHTML = html;
  }

  /* =========================================================================
     Sidebar Widgets (Recent & Topics on Desktop)
     ========================================================================= */

  function renderSidebarWidgets() {
    // Recent list (latest 5 items)
    if (els.recentList) {
      els.recentList.innerHTML = '';
      var recent = state.items.slice(0, 5);
      recent.forEach(function (item) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML =
          '<span class="r-title">' + escapeHtml(item.title) + '</span>' +
          '<span class="r-meta">' + escapeHtml(TYPE_LABEL[item.type] || item.type) +
          (item.date ? ' · ' + formatDate(item.date) : '') + '</span>';

        btn.addEventListener('click', function () {
          var targetSection = 'home';
          if (item.type === 'problem') targetSection = 'problems';
          else if (item.type === 'insight' || item.type === 'link') targetSection = 'insights';
          else if (item.type === 'code' || item.type === 'youtube' || item.type === 'pdf') targetSection = 'codes';

          switchSection(targetSection);
          setTimeout(function () {
            var card = document.querySelector('[data-id="' + item.id + '"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        });

        li.appendChild(btn);
        els.recentList.appendChild(li);
      });
    }

    // Topic cloud
    if (els.topicCloud) {
      els.topicCloud.innerHTML = '';
      var allTags = collectUniqueTags(state.items).slice(0, 14);
      allTags.forEach(function (t) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'topic-chip';
        chip.textContent = t;
        chip.addEventListener('click', function () {
          switchSection('home');
          state.tag = t;
          updateFilterBadge();
          renderTagChips();
          renderFeed();
        });
        els.topicCloud.appendChild(chip);
      });
    }
  }

  /* =========================================================================
     Feed Rendering & Card Construction
     ========================================================================= */

  function renderFeed() {
    var isAbout = state.section === 'about';

    if (els.aboutPage) els.aboutPage.hidden = !isAbout;
    if (els.feedToolbar) els.feedToolbar.hidden = isAbout;
    if (els.grid) els.grid.hidden = isAbout;

    if (isAbout) {
      if (els.empty) els.empty.hidden = true;
      return;
    }

    renderTagChips();
    updateFilterBadge();

    var filtered = getFilteredItems();

    if (els.grid) {
      els.grid.innerHTML = '';
    }

    if (els.empty) {
      els.empty.hidden = filtered.length !== 0;
    }

    filtered.forEach(function (item, idx) {
      var card = buildFeedCard(item);
      card.style.animationDelay = Math.min(idx * 30, 250) + 'ms';
      els.grid.appendChild(card);
    });

    // Typeset MathJax math throughout the rendered cards
    typesetMath(els.grid);
  }

  function renderErrorState(err) {
    if (els.grid) els.grid.innerHTML = '';
    if (els.empty) {
      els.empty.hidden = false;
      var p = els.empty.querySelector('p');
      if (p) {
        p.textContent = 'Could not load feed data (' + err.message + '). Check that data.json is accessible.';
      }
    }
  }

  /* =========================================================================
     Card Builder & Media / LaTeX Engines
     ========================================================================= */

  function buildFeedCard(item) {
    var card = document.createElement('article');
    card.className = 'entry-card';
    card.dataset.id = item.id;

    // Media element (YouTube video thumbnail or PDF preview)
    var mediaEl = buildCardMedia(item);
    if (mediaEl) card.appendChild(mediaEl);

    // Card text body
    var body = document.createElement('div');
    body.className = 'entry-body';

    // Kicker (Type & Date)
    var kicker = document.createElement('div');
    kicker.className = 'entry-kicker mono';
    kicker.textContent = (TYPE_LABEL[item.type] || item.type) +
      (item.date ? ' · ' + formatDate(item.date) : '');
    body.appendChild(kicker);

    // Title
    var title = document.createElement('h2');
    title.className = 'entry-title';
    title.textContent = item.title;
    body.appendChild(title);

    // Programming language badge
    if (item.language && item.type === 'code') {
      var langBadge = document.createElement('span');
      langBadge.className = 'lang-badge';
      langBadge.textContent = item.language;
      body.appendChild(langBadge);
    }

    // Type-specific content rendering
    if (item.type === 'problem') {
      // Mathematical Problem statement
      var problemDoc = document.createElement('div');
      problemDoc.className = 'math-doc problem-statement';
      problemDoc.innerHTML = parseLatexDocToHtml(item.question_latex || item.content);
      body.appendChild(problemDoc);

      // Expandable Solution Section
      if (item.solution_latex) {
        var solPanel = document.createElement('div');
        solPanel.className = 'solution-panel';

        var solInner = document.createElement('div');
        solInner.className = 'solution-inner';

        var solDoc = document.createElement('div');
        solDoc.className = 'math-doc problem-solution';
        solDoc.innerHTML = parseLatexDocToHtml(item.solution_latex);

        solInner.appendChild(solDoc);
        solPanel.appendChild(solInner);
        body.appendChild(solPanel);

        // Show Solution / Hide Solution Action Button
        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'action-btn primary';
        toggleBtn.textContent = 'Show Solution';

        toggleBtn.addEventListener('click', function () {
          var isOpen = solPanel.classList.toggle('is-open');
          toggleBtn.textContent = isOpen ? 'Hide Solution' : 'Show Solution';
          if (isOpen) {
            typesetMath(solDoc);
          }
        });

        var problemActions = document.createElement('div');
        problemActions.className = 'entry-actions';
        problemActions.appendChild(toggleBtn);

        // If problem links to a PDF solution
        if (item.pdf_url) {
          problemActions.appendChild(makeActionButton('Read PDF', item.pdf_url, false, function (e) {
            e.preventDefault();
            openPdfViewer(item);
          }));
        }

        body.appendChild(problemActions);
      }
    } else if (item.type === 'insight') {
      var insightDoc = document.createElement('div');
      insightDoc.className = 'insight-body';
      insightDoc.innerHTML = parseSimpleMarkdown(item.content || item.description);
      body.appendChild(insightDoc);
    } else if (item.type === 'code') {
      if (item.description) {
        var descP = document.createElement('p');
        descP.className = 'entry-desc';
        descP.textContent = item.description;
        body.appendChild(descP);
      }
      if (item.code_snippet) {
        var pre = document.createElement('pre');
        pre.className = 'code-block-card';
        pre.textContent = item.code_snippet;
        body.appendChild(pre);
      }
    } else if (item.description) {
      var generalDesc = document.createElement('p');
      generalDesc.className = 'entry-desc';
      generalDesc.textContent = item.description;
      body.appendChild(generalDesc);
    }

    // Tag list chips
    if (item.tags && item.tags.length) {
      var tagRow = document.createElement('div');
      tagRow.className = 'tag-row';

      var typeTag = document.createElement('span');
      typeTag.className = 'tag type-' + item.type;
      typeTag.textContent = TYPE_LABEL[item.type] || item.type;
      tagRow.appendChild(typeTag);

      item.tags.forEach(function (t) {
        var chip = document.createElement('span');
        chip.className = 'tag';
        chip.textContent = t;
        tagRow.appendChild(chip);
      });

      body.appendChild(tagRow);
    }

    // Action buttons (Watch Video, Read PDF, Open Link) for non-problem items
    if (item.type !== 'problem') {
      var actionRow = buildActionButtons(item);
      if (actionRow) body.appendChild(actionRow);
    }

    card.appendChild(body);
    return card;
  }

  /* =========================================================================
     YouTube & PDF Media Builder
     ========================================================================= */

  function buildCardMedia(item) {
    var videoUrl = item.youtube_url || (item.type === 'youtube' ? item.url : '') || item.video_url;
    var ytId = extractYouTubeId(videoUrl);

    // YouTube Card Media
    if (ytId) {
      var wrap = document.createElement('div');
      wrap.className = 'entry-media media-video';

      var img = document.createElement('img');
      img.alt = item.title;
      img.loading = 'lazy';
      // Try maxresdefault first with fallback to hqdefault
      img.src = 'https://img.youtube.com/vi/' + ytId + '/maxresdefault.jpg';

      img.addEventListener('error', function () {
        if (!img.dataset.fallbackApplied) {
          img.dataset.fallbackApplied = '1';
          img.src = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
        }
      });

      // Also detect YouTube's 120x90 grey placeholder for missing maxresdefault
      img.addEventListener('load', function () {
        if (img.naturalWidth === 120 && img.naturalHeight === 90 && !img.dataset.fallbackApplied) {
          img.dataset.fallbackApplied = '1';
          img.src = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
        }
      });

      wrap.appendChild(img);

      var play = document.createElement('div');
      play.className = 'entry-play';
      play.innerHTML = '<svg aria-hidden="true"><use href="#icon-play-big"/></svg>';
      wrap.appendChild(play);

      var badge = document.createElement('div');
      badge.className = 'media-badge';
      badge.textContent = 'YouTube';
      wrap.appendChild(badge);

      wrap.addEventListener('click', function () {
        openVideoPlayer(item, videoUrl);
      });

      return wrap;
    }

    // PDF Card Media
    if (item.type === 'pdf') {
      var pdfWrap = document.createElement('div');
      pdfWrap.className = 'entry-media media-pdf';

      if (item.custom_thumbnail_url) {
        var pimg = document.createElement('img');
        pimg.alt = item.title;
        pimg.src = item.custom_thumbnail_url;
        pdfWrap.appendChild(pimg);
      } else {
        pdfWrap.innerHTML = '<svg aria-hidden="true"><use href="#icon-pdf"/></svg>';
      }

      var pdfBadge = document.createElement('div');
      pdfBadge.className = 'media-badge';
      pdfBadge.textContent = 'PDF';
      pdfWrap.appendChild(pdfBadge);

      pdfWrap.addEventListener('click', function () {
        if (item.pdf_url || item.url) openPdfViewer(item);
      });

      return pdfWrap;
    }

    return null;
  }

  function buildActionButtons(item) {
    var wrap = document.createElement('div');
    wrap.className = 'entry-actions';
    var hasAction = false;

    var videoUrl = item.youtube_url || (item.type === 'youtube' ? item.url : '') || item.video_url;
    var ytId = extractYouTubeId(videoUrl);

    if (ytId) {
      wrap.appendChild(makeActionButton('Watch Video', videoUrl, true, function (e) {
        e.preventDefault();
        openVideoPlayer(item, videoUrl);
      }));
      hasAction = true;
    }

    if (item.type === 'pdf' && (item.pdf_url || item.url)) {
      wrap.appendChild(makeActionButton('Read PDF', item.pdf_url || item.url, true, function (e) {
        e.preventDefault();
        openPdfViewer(item);
      }));
      hasAction = true;
    }

    if (item.type === 'link' && item.url) {
      wrap.appendChild(makeActionButton(item.meta.linkLabel || 'Open Link', item.url, true));
      hasAction = true;
    }

    if (item.meta && item.meta.sourceUrl) {
      wrap.appendChild(makeActionButton(item.meta.sourceLabel || 'Source', item.meta.sourceUrl, false));
      hasAction = true;
    }

    return hasAction ? wrap : null;
  }

  function makeActionButton(label, href, primary, onClickHandler) {
    var a = document.createElement('a');
    a.className = 'action-btn' + (primary ? ' primary' : '');
    a.href = href;
    a.textContent = label;

    if (onClickHandler) {
      a.addEventListener('click', onClickHandler);
    } else {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }

    return a;
  }

  /* =========================================================================
     Modal Video & PDF Player Engine
     ========================================================================= */

  function bindModalEvents() {
    if (els.modalClose) {
      els.modalClose.addEventListener('click', closeModal);
    }
    if (els.modalBackdrop) {
      els.modalBackdrop.addEventListener('click', function (e) {
        if (e.target === els.modalBackdrop) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal();
        closeMobileDrawer();
      }
    });
  }

  function openVideoPlayer(item, url) {
    var videoId = extractYouTubeId(url || item.youtube_url || item.url);
    if (!els.modalBackdrop) return;

    els.modalTitle.textContent = item.title;
    if (videoId) {
      els.modalBody.innerHTML =
        '<iframe src="https://www.youtube.com/embed/' + videoId +
        '?autoplay=1&rel=0" title="' + escapeAttr(item.title) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    } else {
      els.modalBody.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#eee;">Could not embed video.</div>';
    }

    els.modalBackdrop.hidden = false;
    els.modalBackdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function openPdfViewer(item) {
    var href = item.pdf_url || item.url;
    if (!els.modalBackdrop) return;

    els.modalTitle.textContent = item.title;
    els.modalBody.innerHTML =
      '<iframe src="' + escapeAttr(href) + '" title="' + escapeAttr(item.title) + '"></iframe>';

    els.modalBackdrop.hidden = false;
    els.modalBackdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!els.modalBackdrop) return;
    els.modalBackdrop.classList.remove('is-open');
    els.modalBackdrop.hidden = true;
    els.modalBody.innerHTML = '';
    document.body.style.overflow = '';
  }

  /* =========================================================================
     LaTeX Document Parser & Typesetter (MathJax v3)
     ========================================================================= */

  function parseLatexDocToHtml(src) {
    if (!src) return '';
    var text = String(src).replace(/\r\n/g, '\n');

    // Section and Subsection headers
    text = text.replace(/\\section\*\{([^}]*)\}/g, '@@SEC@@$1@@/SEC@@');
    text = text.replace(/\\subsection\*\{([^}]*)\}/g, '@@SUB@@$1@@/SUB@@');
    text = text.replace(/\\section\{([^}]*)\}/g, '@@SEC@@$1@@/SEC@@');
    text = text.replace(/\\subsection\{([^}]*)\}/g, '@@SUB@@$1@@/SUB@@');

    var lines = text.split('\n');
    var html = '';
    var paragraph = [];

    function flushPara() {
      if (!paragraph.length) return;
      var block = paragraph.join('\n').trim();
      paragraph = [];
      if (!block) return;
      html += renderLatexChunk(block);
    }

    lines.forEach(function (line) {
      if (/^@@SEC@@/.test(line) || /^@@SUB@@/.test(line)) {
        flushPara();
        html += renderLatexChunk(line.trim());
      } else if (!line.trim()) {
        flushPara();
      } else {
        paragraph.push(line);
      }
    });

    flushPara();
    return html;
  }

  function renderLatexChunk(chunk) {
    var secMatch = chunk.match(/^@@SEC@@([\s\S]*)@@\/SEC@@$/);
    if (secMatch) return '<h2 class="latex-section">' + escapeHtml(secMatch[1]) + '</h2>';

    var subMatch = chunk.match(/^@@SUB@@([\s\S]*)@@\/SUB@@$/);
    if (subMatch) return '<h3 class="latex-subsection">' + escapeHtml(subMatch[1]) + '</h3>';

    if (/^\s*\\\[/.test(chunk) || /^\s*\\begin\{/.test(chunk) || /^\s*\$\$/.test(chunk)) {
      return '<div class="math-block">' + chunk + '</div>';
    }

    return '<p>' + chunk.replace(/\n/g, ' ') + '</p>';
  }

  function typesetMath(element) {
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise([element]).catch(function (err) {
        console.warn('MathJax typesetting warning:', err);
      });
    }
  }

  /* =========================================================================
     Utilities: Markdown Parser, YouTube ID Extractor, Formatters
     ========================================================================= */

  function parseSimpleMarkdown(src) {
    if (!src) return '';
    if (/<[a-z][\s\S]*>/i.test(src)) return src;

    var paragraphs = String(src).replace(/\r\n/g, '\n').split(/\n{2,}/);
    return paragraphs.map(function (block) {
      var t = escapeHtml(block.trim()).replace(/\n/g, '<br>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return '<p>' + t + '</p>';
    }).join('');
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    var str = String(url).trim();
    // Match youtu.be, watch?v=, embed/, shorts/, etc.
    var reg = /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    var match = str.match(reg);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
    // Fallback search for any 11-char sequence
    var general = str.match(/([a-zA-Z0-9_-]{11})/);
    return general ? general[1] : null;
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      clearTimeout(timer);
      var args = arguments;
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

})();
