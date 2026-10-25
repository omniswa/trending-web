(() => {
  'use strict';
  
  /* ---------- Config ---------- */
  const CONFIG = { src: 'blogs.json', pageSize: 6, debounceMs: 180, siteTitle: '3NDING – What\'s going on?' };
  const SORTS = {
    new: (a, b) => b.t - a.t || a.i - b.i,
    old: (a, b) => a.t - b.t || a.i - b.i,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  };
  
  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const el = { grid: $('grid'), count: $('count'), pager: $('pager'), state: $('state'), q: $('q'), box: $('searchBox'), sort: $('sort'), clear: $('clear'), theme: $('theme') };
  const fmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  
  /* ---------- State ---------- */
  const state = { all: [], view: [], q: '', sort: 'new', page: 1 };
  let ctrl = null;
  
  /* ---------- Helpers ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (paths, cls = 'icon') => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = paths; // static, trusted strings only
    return s;
  };
  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids);
    return n;
  };
  const safeHref = (u) => {
    try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? u : '#'; } catch { return '#'; }
  };
  const pluralize = n => `${n.toLocaleString()} ${n === 1 ? 'post' : 'posts'}`;
  
  /* ---------- Data ---------- */
  const normalize = (raw) => (Array.isArray(raw) ? raw : [])
    .filter(p => p && p.title && p.link)
    .map((p, i) => {
      const t = Date.parse(`${p.published}T00:00:00Z`);
      return {
        i,
        id: String(p.id ?? i),
        title: String(p.title),
        description: String(p.description ?? ''),
        published: p.published,
        t: Number.isNaN(t) ? 0 : t,
        thumbnail: p.thumbnail || '',
        link: safeHref(String(p.link)),
        key: `${p.title} ${p.description ?? ''}`.toLowerCase() // precomputed search key
      };
    });
  
  async function load() {
    ctrl?.abort();
    ctrl = new AbortController();
    showSkeleton();
    el.state.replaceChildren();
    el.pager.hidden = true;
    try {
      const res = await fetch(CONFIG.src, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.all = normalize(await res.json());
      apply(false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      showError();
    }
  }
  
  /* ---------- Query / URL ---------- */
  function readURL() {
    const p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').slice(0, 100);
    state.sort = SORTS[p.get('sort')] ? p.get('sort') : 'new';
    state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
    el.q.value = state.q;
    el.sort.value = state.sort;
    el.box.classList.toggle('has-value', !!state.q);
  }
  
  function writeURL(push) {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.sort !== 'new') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', state.page);
    const qs = p.toString();
    const url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  
  /* Filter + sort only when query/sort change; paging just slices. */
  function apply(resetPage = true) {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = terms.length ? state.all.filter(p => terms.every(t => p.key.includes(t))) : state.all.slice();
    list.sort(SORTS[state.sort]);
    state.view = list;
    if (resetPage) state.page = 1;
    render();
  }
  
  /* ---------- Render ---------- */
  const totalPages = () => Math.max(1, Math.ceil(state.view.length / CONFIG.pageSize));
  
  function render() {
    const total = totalPages();
    state.page = Math.min(state.page, total);
    const start = (state.page - 1) * CONFIG.pageSize;
    const items = state.view.slice(start, start + CONFIG.pageSize);
    
    el.count.textContent = state.q ? `${pluralize(state.view.length)} for “${state.q}”` : pluralize(state.view.length);
    document.title = state.page > 1 ? `Page ${state.page} – ${CONFIG.siteTitle}` : CONFIG.siteTitle;
    
    const frag = document.createDocumentFragment();
    const lead = state.page === 1 && !state.q && state.sort === 'new'; // highlight the newest post only in the default view
    items.forEach((p, idx) => frag.append(card(p, idx, lead && idx === 0)));
    el.grid.replaceChildren(frag);
    el.grid.setAttribute('aria-busy', 'false');
    
    el.state.replaceChildren();
    if (!items.length) showEmpty();
    renderPager(total);
  }
  
  function card(p, idx, feature) {
    const img = h('img', { src: p.thumbnail || null, alt: '', width: 600, height: 400, decoding: 'async', loading: idx < 2 ? 'eager' : 'lazy', fetchpriority: idx < 1 ? 'high' : null });
    const thumb = h('figure', { class: 'thumb' }, img);
    img.addEventListener('error', () => thumb.classList.add('noimg'), { once: true });
    if (!p.thumbnail) thumb.classList.add('noimg');
    const time = h('time', { class: 'meta', datetime: p.published, text: p.t ? fmt.format(p.t) : '' });
    const link = h('a', { href: p.link }, h('h2', { class: 'title', text: p.title }));
    const more = h('span', { class: 'more', 'aria-hidden': 'true' }, 'Read post', svg('<path d="M5 12h14M13 6l6 6-6 6"/>'));
    const text = h('div', { class: 'text' }, time, link, h('p', { class: 'desc', text: p.description }), more);
    return h('li', {}, h('article', { class: feature ? 'post feature' : 'post' }, text, thumb));
  }
  
  function showSkeleton() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CONFIG.pageSize; i++)
      frag.append(h('li', {}, h('div', { class: 'post skel' }, h('div', { class: 'text' }, h('i'), h('i'), h('i')), h('div', { class: 'thumb' }))));
    el.grid.replaceChildren(frag);
    el.grid.setAttribute('aria-busy', 'true');
    el.count.textContent = 'Loading posts…';
  }
  
  function showEmpty() {
    el.state.replaceChildren(h('div', { class: 'state' },
      svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
      h('h2', { text: 'No posts found' }),
      h('p', { text: 'Try a different search term or clear the search to see all posts.' }),
      h('button', { class: 'btn', type: 'button', id: 'reset', text: 'Clear search' })));
  }
  
  function showError() {
    el.grid.replaceChildren();
    el.grid.setAttribute('aria-busy', 'false');
    el.count.textContent = '';
    el.state.replaceChildren(h('div', { class: 'state', role: 'alert' },
      svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>'),
      h('h2', { text: 'Couldn’t load posts' }),
      h('p', { text: 'Check your connection and try again. If you opened this file directly, serve the folder over HTTP so blogs.json can load.' }),
      h('button', { class: 'btn', type: 'button', id: 'retry', text: 'Try again' })));
  }
  
  /* ---------- Pagination ---------- */
  function pageItems(cur, total) {
    const keep = [...new Set([1, total, cur - 1, cur, cur + 1])].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    keep.forEach((n, i) => {
      const prev = keep[i - 1];
      if (prev) {
        if (n - prev === 2) out.push(prev + 1);
        else if (n - prev > 2) out.push('gap');
      }
      out.push(n);
    });
    return out;
  }
  const pageHref = n => {
    const p = new URLSearchParams(location.search);
    if (n > 1) p.set('page', n);
    else p.delete('page');
    const s = p.toString();
    return location.pathname + (s ? `?${s}` : '');
  };
  
  function renderPager(total) {
    if (total <= 1) {
      el.pager.hidden = true;
      el.pager.replaceChildren();
      return;
    }
    const cur = state.page;
    const arrow = (dir, target, label) => {
      const icon = svg(dir < 0 ? '<path d="m15 18-6-6 6-6"/>' : '<path d="m9 18 6-6-6-6"/>');
      return target < 1 || target > total ?
        h('span', { class: 'pg', 'aria-disabled': 'true', 'aria-label': label }, icon) :
        h('a', { class: 'pg', href: pageHref(target), 'data-page': target, 'aria-label': label, rel: dir < 0 ? 'prev' : 'next' }, icon);
    };
    const list = h('ol');
    pageItems(cur, total).forEach(n => {
      list.append(h('li', {}, n === 'gap' ?
        h('span', { class: 'gap', 'aria-hidden': 'true', text: '…' }) :
        h('a', { class: 'pg', href: pageHref(n), 'data-page': n, 'aria-label': `Page ${n}`, 'aria-current': n === cur ? 'page' : null, text: n })));
    });
    el.pager.replaceChildren(arrow(-1, cur - 1, 'Previous page'), list, h('span', { class: 'status', text: `Page ${cur} of ${total}` }), arrow(1, cur + 1, 'Next page'));
    el.pager.hidden = false;
  }
  
  function goTo(n) {
    if (n === state.page) return;
    state.page = n;
    writeURL(true);
    render();
    el.count.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    el.count.focus({ preventScroll: true });
  }
  
  /* ---------- Events ---------- */
  el.pager.addEventListener('click', e => {
    const a = e.target.closest('a[data-page]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    goTo(+a.dataset.page);
  });
  
  el.state.addEventListener('click', e => {
    if (e.target.id === 'retry') load();
    if (e.target.id === 'reset') {
      el.q.value = '';
      onSearch();
      el.q.focus();
    }
  });
  
  let timer;
  
  function onSearch() {
    state.q = el.q.value.trim().replace(/\s+/g, ' ');
    el.box.classList.toggle('has-value', !!el.q.value);
    clearTimeout(timer);
    timer = setTimeout(() => {
      apply(true);
      writeURL(false);
    }, CONFIG.debounceMs);
  }
  el.q.addEventListener('input', onSearch);
  el.clear.addEventListener('click', () => {
    el.q.value = '';
    onSearch();
    el.q.focus();
  });
  $('tools').addEventListener('submit', e => e.preventDefault());
  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    apply(true);
    writeURL(false);
  });
  
  addEventListener('popstate', () => { readURL(); if (state.all.length) apply(false); });
  
  el.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    try { if (localStorage.getItem('theme')) return; } catch {}
    document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
  });
  
  /* ---------- Init ---------- */
  $('year').textContent = new Date().getFullYear();
  readURL();
  load();
})();