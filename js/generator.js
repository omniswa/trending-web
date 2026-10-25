(() => {
  'use strict';
  const DOMAIN = 'https://3nding.top';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const absUrl = u => /^https?:\/\//i.test(u) ? u : DOMAIN + (u.startsWith('/') ? '' : '/') + u;
  
  /* ---------- Markdown → HTML ---------- */
  function inline(t) {
    const codes = [];
    t = t.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    t = esc(t);
    t = t.replace(/\[\[(.+?)\]\]/g, '<kbd>$1</kbd>');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => {
      const ext = /^https?:\/\//i.test(u) && !/^https?:\/\/(www\.)?3nding\.top/i.test(u);
      return `<a href="${u}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${txt}</a>`;
    });
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/==(.+?)==/g, '<mark>$1</mark>');
    return t.replace(/\u0000(\d+)\u0000/g, (m, n) => '<code>' + esc(codes[n]) + '</code>');
  }
  
  function markdown(src) {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const out = [],
      toc = [],
      used = {};
    const LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
    const IMG = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;
    const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
    const isTable = i => i + 1 < lines.length && lines[i].includes('|') && SEP.test(lines[i + 1]);
    const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const blockStart = i => {
      const l = lines[i];
      return /^```/.test(l) || /^#{1,6}\s/.test(l) || HR.test(l) || /^\s*>/.test(l) || LI.test(l) || IMG.test(l) || isTable(i) || (/^Table:/i.test(l) && i + 1 < lines.length && isTable(i + 1));
    };
    const headId = text => {
      let base = slugify(text) || 'section',
        id = base,
        n = 2;
      while (used[id]) id = base + '-' + n++;
      used[id] = 1;
      return id;
    };
    
    function parseList(i, indent) {
      const first = lines[i].match(LI);
      const tag = /\d/.test(first[2]) ? 'ol' : 'ul';
      let html = `<${tag}>`;
      while (i < lines.length) {
        const m = lines[i].match(LI);
        if (!m || m[1].length !== indent) break;
        let item = inline(m[3]);
        i++;
        while (i < lines.length) {
          const n = lines[i].match(LI);
          if (n && n[1].length > indent) {
            const r = parseList(i, n[1].length);
            item += r[0];
            i = r[1];
          } else break;
        }
        html += `<li>${item}</li>`;
      }
      return [html + `</${tag}>`, i];
    }
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      
      let m;
      if ((m = line.match(/^```\s*([\w+-]*)/))) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code${m[1] ? ` class="language-${esc(m[1])}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        const lvl = Math.min(4, Math.max(2, m[1].length));
        const plain = m[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`~=]/g, '');
        const id = headId(plain);
        if (lvl === 2) toc.push({ id, text: plain });
        out.push(`<h${lvl} id="${id}">${inline(m[2])}</h${lvl}>`);
        i++;
        continue;
      }
      if (HR.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }
      if ((m = line.match(IMG))) {
        out.push(`<figure><img src="${esc(m[2])}" alt="${esc(m[1])}" loading="lazy" decoding="async">${m[3] ? `<figcaption>${esc(m[3])}</figcaption>` : ''}</figure>`);
        i++;
        continue;
      }
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        let src = buf.join('\n').trim(),
          cite = '';
        const cm = src.match(/(?:^|\n)\s*(?:—|--)\s*(.+)$/);
        if (cm) {
          cite = cm[1];
          src = src.slice(0, cm.index).trim();
        }
        const paras = src.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${inline(p.replace(/\n/g, ' '))}</p>`).join('');
        out.push(`<blockquote>${paras}${cite ? `<footer>— ${inline(cite)}</footer>` : ''}</blockquote>`);
        continue;
      }
      let caption = '';
      if (/^Table:/i.test(line) && isTable(i + 1)) {
        caption = line.replace(/^Table:\s*/i, '');
        i++;
      }
      if (isTable(i)) {
        const head = cells(lines[i]);
        const align = cells(lines[i + 1]).map(c => /:$/.test(c) ? 'num' : '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
        const cls = k => align[k] ? ' class="num"' : '';
        const capId = 'tbl-' + out.length;
        out.push(`<div class="table-wrap" role="region" ${caption ? `aria-labelledby="${capId}"` : 'aria-label="Table"'} tabindex="0"><table>${caption ? `<caption id="${capId}">${inline(caption)}</caption>` : ''}<thead><tr>${head.map((c, k) => `<th scope="col"${cls(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => k === 0 ? `<th scope="row"${cls(k)}>${inline(r[k] || '')}</th>` : `<td${cls(k)}>${inline(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if ((m = line.match(LI))) {
        const r = parseList(i, m[1].length);
        out.push(r[0]);
        i = r[1];
        continue;
      }
      const buf = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !blockStart(i)) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
    return { html: out.join('\n'), toc, text: src };
  }
  
  /* ---------- Page template ---------- */
  const ARTICLE_CSS = String.raw`
    .crumbs { padding-block: clamp(20px, 4vw, 36px) 0; font-size: .875rem; color: var(--muted) }
    .crumbs ol { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0 }
    .crumbs li + li::before { content: "/"; margin-right: 6px; opacity: .6 }
    .crumbs a:hover { color: var(--accent) }
    .article-head { padding-block: clamp(16px, 3vw, 28px) 0 }
    .article-head h1 { font-size: clamp(2rem, 6vw, 3rem) }
    .article-head .lede { margin: .9rem 0 0; color: var(--muted); font-size: clamp(1.05rem, 2.4vw, 1.2rem); line-height: 1.55; max-width: 52ch }
    .byline { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 18px; color: var(--muted); font-size: .875rem }
    .hero-img { margin: clamp(20px, 4vw, 32px) 0 0 }
    .hero-img img { width: 100%; height: auto; aspect-ratio: 16/9; object-fit: cover; border-radius: 16px; background: var(--accent-soft) }
    figcaption { margin-top: 8px; color: var(--muted); font-size: .85rem }
    .toc { margin-block: clamp(24px, 4vw, 36px) 0; padding: 16px 20px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface) }
    .toc h2 { margin: 0 0 8px; font: 600 1.05rem/1.3 var(--serif) }
    .toc ol { margin: 0; padding-left: 1.2em }
    .toc a { color: var(--accent) }
    .toc a:hover { text-decoration: underline }
    .prose { font-family: var(--serif); font-size: clamp(1.05rem, 2.4vw, 1.15rem); line-height: 1.75; padding-block: clamp(20px, 4vw, 32px) 0; overflow-wrap: break-word }
    .prose > * { margin-block: 0 1.25em }
    .prose h2, .prose h3, .prose h4 { line-height: 1.25; letter-spacing: -.01em; text-wrap: balance }
    .prose h2 { font-size: clamp(1.45rem, 4vw, 1.8rem); margin-top: 2em }
    .prose h3 { font-size: clamp(1.2rem, 3.2vw, 1.4rem); margin-top: 1.7em }
    .prose h4 { font-size: 1.1rem; margin-top: 1.5em }
    .prose p a, .prose li a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px }
    .prose p a:hover, .prose li a:hover { text-decoration-thickness: 2px }
    .prose a[target=_blank]::after { content: "\2197"; font-size: .8em; margin-left: 2px }
    .prose ul, .prose ol { padding-left: 1.4em }
    .prose li { margin-block: .4em }
    .prose li::marker { color: var(--accent) }
    .prose li > ul, .prose li > ol { margin-block: .4em 0 }
    .prose mark { background: color-mix(in srgb, var(--accent-2) 28%, transparent); color: inherit; padding: 0 .2em; border-radius: 3px }
    .prose hr { border: 0; border-top: 1px solid var(--border); margin-block: 2.2em }
    .prose figure { margin-inline: 0 }
    .prose figure img { width: 100%; height: auto; border-radius: 12px }
    .prose blockquote { margin-inline: 0; padding: .2em 0 .2em 1.2em; border-left: 3px solid var(--accent); font-style: italic }
    .prose blockquote p { margin: 0 0 .5em }
    .prose blockquote footer { margin: 0; padding: 0; border: 0; font-size: .9rem; font-style: normal; color: var(--muted) }
    .prose code, .prose kbd { font: .88em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: .15em .4em; border-radius: 6px; background: var(--accent-soft) }
    .prose pre { padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface); overflow-x: auto; -webkit-overflow-scrolling: touch }
    .prose pre code { padding: 0; background: none; font-size: .88rem; line-height: 1.6; white-space: pre }
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface) }
    .prose table { width: 100%; min-width: 480px; border-collapse: collapse; font-family: var(--sans); font-size: .93rem; line-height: 1.5 }
    .prose caption { padding: 12px 16px; text-align: left; color: var(--muted); font-size: .85rem; caption-side: bottom }
    .prose th, .prose td { padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border) }
    .prose thead th { background: var(--accent-soft); font-weight: 600; white-space: nowrap }
    .prose tbody tr:last-child > * { border-bottom: 0 }
    .prose td.num, .prose th.num { text-align: right; font-variant-numeric: tabular-nums }
    .post-nav { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap); margin-top: clamp(32px, 6vw, 56px); padding-top: 24px; border-top: 1px solid var(--border) }
    .post-nav a { display: block; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface); transition: border-color .2s }
    .post-nav a:hover { border-color: var(--accent) }
    .post-nav small { display: block; color: var(--muted); font-size: .8rem }
    .post-nav strong { font: 600 1rem/1.3 var(--serif) }
    .post-nav .next { text-align: right; grid-column: 2 }
    @media (max-width: 479px) { .post-nav { grid-template-columns: 1fr } .post-nav .next { text-align: left; grid-column: 1 } }`;
  
  const THEME_HEAD = `(function() {
      try {
        var s = localStorage.getItem('theme');
        var d = s ? s === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = d ? 'dark' : 'light';
      } catch (e) {}
    })();`;
  const THEME_FOOT = `(function() {
      var root = document.documentElement;
      document.getElementById('year').textContent = new Date().getFullYear();
      document.getElementById('theme').addEventListener('click', function() {
        var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch (e) {}
      });
    })();`;
  
  function buildPost(d) {
    const md = markdown(d.body);
    const words = d.body.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 200));
    const url = `${DOMAIN}/blogs/${d.year}/${d.slug}.html`;
    const lede = d.lede || d.desc;
    const img = d.image ? absUrl(d.image) : '';
    const dateLong = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [{
        '@type': 'BlogPosting',
        '@id': url + '#post',
        mainEntityOfPage: url,
        headline: d.title,
        description: d.desc,
        ...(img ? { image: img } : {}),
        datePublished: d.date,
        dateModified: d.date,
        inLanguage: 'en',
        ...(d.tags.length ? { keywords: d.tags.join(', ') } : {}),
        author: { '@type': 'Organization', name: d.author },
        publisher: { '@type': 'Organization', name: '3NDING', url: DOMAIN + '/' }
      }, {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
          { '@type': 'ListItem', position: 2, name: d.section, item: DOMAIN + '/' },
          { '@type': 'ListItem', position: 3, name: d.title }
        ]
      }]
    };
    const toc = d.toc && md.toc.length >= 2 ?
      `\n      <nav class="toc" aria-label="Table of contents">\n        <h2>In this post</h2>\n        <ol>\n${md.toc.map(t => `          <li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('\n')}\n        </ol>\n      </nav>\n` : '';
    const hero = img ? `\n      <figure class="hero-img">\n        <img src="${esc(img)}" width="1200" height="675" alt="${esc(d.alt)}" fetchpriority="high" decoding="async" itemprop="image">${d.caption ? `\n        <figcaption>${esc(d.caption)}</figcaption>` : ''}\n      </figure>\n` : '';
    const pn = (cls, rel, label, t, f) => `      <a class="${cls}" href="${esc(f)}" rel="${rel}">\n        <small>${label}</small>\n        <strong>${esc(t)}</strong>\n      </a>`;
    const hasNav = (d.prevT && d.prevF) || (d.nextT && d.nextF);
    const nav = hasNav ? `\n    <nav class="post-nav" aria-label="More posts">\n${d.prevT && d.prevF ? pn('prev', 'prev', 'Previous', d.prevT, d.prevF) + '\n' : ''}${d.nextT && d.nextF ? pn('next', 'next', 'Next', d.nextT, d.nextF) + '\n' : ''}    </nav>\n` : '';
    const tagMeta = d.tags.map(t => `  <meta property="article:tag" content="${esc(t)}">`).join('\n');
    
    return `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <title>${esc(d.title)} – 3NDING</title>
  <meta name="description" content="${esc(d.desc)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${esc(d.author)}">
  <meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0e1016" media="(prefers-color-scheme: dark)">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="3NDING">
  <meta property="og:title" content="${esc(d.title)}">
  <meta property="og:description" content="${esc(d.desc)}">
  <meta property="og:url" content="${url}">${img ? `\n  <meta property="og:image" content="${esc(img)}">\n  <meta property="og:image:alt" content="${esc(d.alt)}">` : ''}
  <meta property="article:published_time" content="${d.date}T00:00:00Z">
  <meta property="article:modified_time" content="${d.date}T00:00:00Z">
  <meta property="article:author" content="${esc(d.author)}">
  <meta property="article:section" content="${esc(d.section)}">${tagMeta ? '\n' + tagMeta : ''}
  <meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${esc(d.title)}">
  <meta name="twitter:description" content="${esc(d.desc)}">${img ? `\n  <meta name="twitter:image" content="${esc(img)}">` : ''}
${img && /^https?:\/\//i.test(img) ? `\n  <link rel="preconnect" href="${esc(new URL(img).origin)}" crossorigin>` : ''}
  <link rel="stylesheet" href="../../style.css">

  <script type="application/ld+json">
${JSON.stringify(ld, null, 2).replace(/</g, '\\u003c')}
  <\/script>

  <script>
    ${THEME_HEAD}
  <\/script>

  <style>${ARTICLE_CSS}
  </style>
</head>

<body>
  <header class="site-header">
    <div class="wrap bar">
      <a class="brand" href="../../" aria-label="3NDING home">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#4f46e5" />
              <stop offset="1" stop-color="#0d9488" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#g)" />
          <text x="16" y="23" text-anchor="middle" font-size="28" font-weight="bolder" font-family="Arial, sans-serif" fill="white">&nearr;</text>
        </svg>
        3NDING
      </a>
      <button class="icon-btn" id="theme" type="button" aria-label="Toggle dark mode">
        <svg class="icon moon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
        <svg class="icon sun" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
    </div>
  </header>

  <main class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="../../">Home</a></li>
        <li><a href="../../">${esc(d.section)}</a></li>
        <li aria-current="page">${esc(d.title)}</li>
      </ol>
    </nav>

    <article itemscope itemtype="https://schema.org/BlogPosting">
      <header class="article-head">
        <h1 itemprop="headline">${esc(d.title)}</h1>
        <p class="lede" itemprop="description">${esc(lede)}</p>
        <div class="byline">
          <span>By <span itemprop="author">${esc(d.author)}</span></span>
          <time datetime="${d.date}" itemprop="datePublished">${dateLong}</time>
          <span>${mins} min read</span>
        </div>
      </header>
${hero}${toc}
      <div class="prose" itemprop="articleBody">
${md.html}
      </div>
    </article>
${nav}  </main>

  <footer>
    <div class="wrap foot">
      <section>© <span id="year">2026</span> 3NDING </section>
      <section class="links">
        <a href="#">About</a> |
        <a href="#">Terms</a> |
        <a href="#">Privacy</a>
      </section>
    </div>
  </footer>

  <script>
    ${THEME_FOOT}
  <\/script>
</body>

</html>
`;
  }
  
  /* ---------- Form ---------- */
  const F = {};
  ['title', 'slug', 'date', 'desc', 'lede', 'author', 'section', 'tags', 'image', 'alt', 'caption', 'thumb', 'body', 'toc', 'prevT', 'prevF', 'nextT', 'nextF'].forEach(k => F[k] = $(k));
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  F.date.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  $('year').textContent = now.getFullYear();
  let slugTouched = false,
    loadedJson = null;
  
  function read() {
    const date = F.date.value || F.date.defaultValue;
    return {
      title: F.title.value.trim() || 'Untitled post',
      slug: F.slug.value.trim() || slugify(F.title.value) || 'untitled-post',
      date,
      year: (date || '').slice(0, 4) || String(now.getFullYear()),
      desc: F.desc.value.trim() || 'Add a meta description.',
      lede: F.lede.value.trim(),
      author: F.author.value.trim() || '3NDING Editorial',
      section: F.section.value.trim() || 'Stories',
      tags: F.tags.value.split(',').map(s => s.trim()).filter(Boolean),
      image: F.image.value.trim(),
      alt: F.alt.value.trim(),
      caption: F.caption.value.trim(),
      thumb: F.thumb.value.trim(),
      body: F.body.value,
      toc: F.toc.checked,
      prevT: F.prevT.value.trim(),
      prevF: F.prevF.value.trim(),
      nextT: F.nextT.value.trim(),
      nextF: F.nextF.value.trim()
    };
  }
  
  function hints() {
    const t = F.title.value.trim().length,
      dd = F.desc.value.trim().length;
    $('titleHint').textContent = t ? `${t} characters${t > 52 ? ' – the page title adds “ – 3NDING”, keep the total under ~60' : ''}` : '';
    $('descHint').textContent = `${dd} characters${dd && (dd < 120 || dd > 160) ? ' – aim for 120–160' : ''}`;
    const d = read();
    $('urlHint').textContent = `${DOMAIN}/blogs/${d.year}/${d.slug}.html`;
  }
  
  const preview = $('preview');
  let tmr;
  
  function refresh() {
    hints();
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      const html = buildPost(read()).replace('href="../../style.css"', 'href="style.css"');
      preview.srcdoc = html;
    }, 250);
  }
  
  document.querySelectorAll('input, textarea').forEach(el => {
    if (el.type === 'file') return;
    el.addEventListener('input', () => {
      if (el === F.slug) slugTouched = true;
      if (el === F.title && !slugTouched) F.slug.value = slugify(F.title.value);
      refresh();
    });
  });
  
  /* ---------- Output ---------- */
  const statusEl = $('status');
  
  function say(msg, err) {
    statusEl.textContent = msg;
    statusEl.className = 'show' + (err ? ' err' : '');
  }
  
  function validate() {
    const miss = [];
    if (!F.title.value.trim()) miss.push('title');
    if (!F.desc.value.trim()) miss.push('meta description');
    if (!(F.slug.value.trim() || slugify(F.title.value))) miss.push('URL slug');
    if (!F.date.value) miss.push('date');
    if (F.image.value.trim() && !F.alt.value.trim()) miss.push('image alt text');
    if (miss.length) { say('Please fill in: ' + miss.join(', ') + '.', true); return null; }
    return read();
  }
  
  function entryFor(d) {
    return {
      title: d.title,
      description: d.desc,
      published: d.date,
      thumbnail: d.thumb || d.image || '',
      link: `blogs/${d.year}/${d.slug}.html`
    };
  }
  
  function merge(list, e) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const at = arr.findIndex(p => p && p.link === e.link);
    if (at >= 0) { arr[at] = { id: arr[at].id, ...e }; return { arr, replaced: true }; }
    const max = arr.reduce((m, p) => Math.max(m, parseInt(p && p.id, 10) || 0), 0);
    arr.push({ id: String(max + 1), ...e });
    return { arr, replaced: false };
  }
  
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  
  $('loadJson').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!Array.isArray(j)) throw new Error('not an array');
      loadedJson = j;
      $('jsonInfo').textContent = `Loaded ${j.length} existing post${j.length === 1 ? '' : 's'}.`;
    } catch (err) {
      loadedJson = null;
      $('jsonInfo').textContent = 'That file is not a valid blogs.json.';
      say('Could not read blogs.json: ' + err.message, true);
    }
  });
  
  $('dlHtml').addEventListener('click', () => {
    const d = validate();
    if (!d) return;
    download(d.slug + '.html', buildPost(d), 'text/html');
    say(`Downloaded ${d.slug}.html. Put it in blogs/${d.year}/ in your project.`);
  });
  
  $('dlJson').addEventListener('click', () => {
    const d = validate();
    if (!d) return;
    const { arr, replaced } = merge(loadedJson, entryFor(d));
    download('blogs.json', JSON.stringify(arr, null, 2) + '\n', 'application/json');
    say(`Downloaded blogs.json with ${arr.length} post${arr.length === 1 ? '' : 's'}${replaced ? ' (existing entry updated)' : ''}. Replace the one in your project root.${loadedJson ? '' : ' Note: you did not load your current file, so it only contains this post.'}`);
  });
  
  $('copyHtml').addEventListener('click', async () => {
    const d = validate();
    if (!d) return;
    try {
      await navigator.clipboard.writeText(buildPost(d));
      say('HTML copied to the clipboard.');
    } catch (e) { say('Copy failed. Use Download post HTML instead.', true); }
  });
  
  async function writeFile(dir, name, text) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
  
  if (!window.showDirectoryPicker) $('saveFolder').style.display = 'none';
  $('saveFolder').addEventListener('click', async () => {
    const d = validate();
    if (!d) return;
    try {
      const root = await showDirectoryPicker({ mode: 'readwrite' });
      const yearDir = await (await root.getDirectoryHandle('blogs', { create: true })).getDirectoryHandle(d.year, { create: true });
      let exists = true;
      try { await yearDir.getFileHandle(d.slug + '.html'); } catch (e) { exists = false; }
      if (exists && !confirm(`blogs/${d.year}/${d.slug}.html already exists. Overwrite it?`)) return;
      
      let existing = [];
      try {
        const fh = await root.getFileHandle('blogs.json');
        existing = JSON.parse(await (await fh.getFile()).text());
        if (!Array.isArray(existing)) throw new Error('blogs.json is not an array');
      } catch (e) {
        if (e.name !== 'NotFoundError') { say('Stopped: could not read blogs.json (' + e.message + '). Nothing was changed.', true); return; }
      }
      const { arr, replaced } = merge(existing, entryFor(d));
      await writeFile(yearDir, d.slug + '.html', buildPost(d));
      await writeFile(root, 'blogs.json', JSON.stringify(arr, null, 2) + '\n');
      say(`Saved blogs/${d.year}/${d.slug}.html and ${replaced ? 'updated' : 'added'} the entry in blogs.json (${arr.length} posts total).`);
    } catch (e) {
      if (e.name !== 'AbortError') say('Save failed: ' + e.message, true);
    }
  });
  
  $('theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
  
  refresh();
})();