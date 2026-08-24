/**
 * Generates site/privacy/index.html from PRIVACY.md, so the published policy and
 * the one in the repository cannot drift apart. The page shell is lifted from
 * site/index.html, which keeps one copy of the masthead and footer.
 *
 *   node scripts/build-site.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inline = (t) =>
  escape(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1">$1</a>');

function frontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: {}, body: markdown };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: markdown.slice(match[0].length) };
}

function render(markdown) {
  const lines = markdown.split('\n', 1).length ? markdown.split('\n').slice(1) : [];
  const out = [];
  let i = 0;
  let droppedIntro = false;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (line.startsWith('## ')) { out.push(`<h2>${inline(line.slice(3))}</h2>`); i++; continue; }
    if (line.startsWith('### ')) { out.push(`<h3>${inline(line.slice(4))}</h3>`); i++; continue; }
    if (/^_.+_$/.test(line)) { out.push(`<p class="label">${inline(line.slice(1, -1))}</p>`); i++; continue; }

    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const head = rows[0].map((c) => `<th>${inline(c)}</th>`).join('');
      const body = rows.slice(2).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('> ')) { quote.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        let text = lines[i].slice(2);
        i++;
        while (i < lines.length && lines[i].startsWith('  ') && lines[i].trim()) { text += ' ' + lines[i].trim(); i++; }
        items.push(`<li><span>${inline(text)}</span></li>`);
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (line.trim()) {
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{2,3} |\||- |_)/.test(lines[i])) { para.push(lines[i].trimEnd()); i++; }
      const text = para.join(' ');
      // The page header already introduces the document; do not say it twice.
      if (!droppedIntro && text.startsWith('Veyl is a browser extension')) { droppedIntro = true; continue; }
      out.push(`<p>${inline(text)}</p>`);
      continue;
    }
    i++;
  }
  return out.join('\n');
}

const [markdown, shell] = await Promise.all([readFile('PRIVACY.md', 'utf8'), readFile('site/index.html', 'utf8')]);

const head = shell
  .split('<main>')[0]
  .replace(/<title>[^<]*<\/title>/, '<title>Privacy policy — Veyl</title>')
  .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="What Veyl does with your data. The short version: it has no server, and nothing leaves your device.">')
  .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="Veyl — privacy policy">')
  .replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="https://noveyl.work/privacy/">')
  .replace('href="styles.css"', 'href="../styles.css"')
  .replace('href="assets/icon.png"', 'href="../assets/icon.png"');

const footer = '<footer' + shell.split('<footer')[1];

await writeFile(
  'site/privacy/index.html',
  `${head}<main class="wrap doc">
  <div class="doc__head">
    <p class="label">Veyl · Privacy</p>
    <div>
      <h1 class="display">Privacy policy</h1>
      <p class="lede">
        Veyl is an extension that explains what a website is doing with your data. This describes what
        Veyl does with <em>yours</em>, which is the question that matters more.
      </p>
    </div>
  </div>
  <div class="doc__body">
${render(markdown)}
  </div>
</main>

${footer}`
);

console.log('site/privacy/index.html generated from PRIVACY.md');

// --- articles -------------------------------------------------------------

const slugs = (await readdir('content')).filter((f) => f.endsWith('.md'));
const written = [];

for (const file of slugs) {
  const slug = file.replace(/\.md$/, '');
  const { meta, body } = frontMatter(await readFile(`content/${file}`, 'utf8'));
  // Parsed as a plain date: "2026-08-24" is a day, not midnight UTC, and
  // rendering it in a negative offset would silently publish it a day early.
  const [y, m, d] = (meta.date ?? '').split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const articleHead = head
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.title} — Veyl</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${meta.subtitle}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${meta.title}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${meta.subtitle}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://noveyl.work/writing/${slug}/">`)
    .replace('href="../styles.css"', 'href="../../styles.css"')
    .replace('href="../assets/icon.png"', 'href="../../assets/icon.png"');

  await mkdir(`site/writing/${slug}`, { recursive: true });
  await writeFile(
    `site/writing/${slug}/index.html`,
    `${articleHead}<main class="wrap doc">
  <div class="doc__head">
    <p class="label">${date}</p>
    <h1 class="h1">${meta.title}</h1>
    <p class="lede">${meta.subtitle}</p>
  </div>
  <article class="doc__body">
${render(body)}
  </article>
</main>

${footer}`
  );
  written.push(`site/writing/${slug}/index.html`);
}

for (const f of written) console.log(f + ' generated');
