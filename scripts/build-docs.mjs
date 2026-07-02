// Render docs/examples/*.mdx into a self-contained static site under site/.
// Each ```ts twoslash``` block is highlighted with Shiki + the twoslash transformer,
// which runs the TypeScript compiler and renders inline type hovers (`^?`) and expected
// errors. `throws: true` means a snippet that fails to typecheck fails the build — so
// the rendered docs can never drift from the real library types.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import MarkdownIt from "markdown-it";
import { codeToHtml } from "shiki";
import { transformerTwoslash, rendererRich } from "@shikijs/twoslash";

const ROOT = process.cwd();
const EX = join(ROOT, "docs", "examples");
const OUT = join(ROOT, "site");
mkdirSync(OUT, { recursive: true });

const libSource = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
const twoslashCss = readFileSync(
  join(ROOT, "node_modules", "@shikijs", "twoslash", "style-rich.css"),
  "utf8",
);

const transformer = transformerTwoslash({
  renderer: rendererRich(),
  throws: true,
  twoslashOptions: {
    compilerOptions: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: ".",
      paths: { bimorph: ["./bimorph-lib.ts"] },
    },
    extraFiles: { "bimorph-lib.ts": libSource },
  },
});

const md = new MarkdownIt({ html: true, linkify: true });

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { body: src, title: null };
  const title = (m[1].match(/title:\s*(.+)/) || [])[1]?.trim() ?? null;
  return { body: src.slice(m[0].length), title };
}

async function render(file) {
  const { body, title } = parseFrontmatter(readFileSync(join(EX, file), "utf8"));

  const blocks = [];
  const withPlaceholders = body.replace(
    /```(\w+)([^\n]*)\n([\s\S]*?)```/g,
    (full, lang, meta, code) => {
      if (/\btwoslash\b/.test(meta) && (lang === "ts" || lang === "tsx")) {
        const id = blocks.push({ code: code.replace(/\n$/, "") }) - 1;
        return `\n\n<!--TSBLOCK_${id}-->\n\n`;
      }
      return full;
    },
  );

  let html = md.render(withPlaceholders);
  for (let i = 0; i < blocks.length; i++) {
    const rendered = await codeToHtml(blocks[i].code, {
      lang: "ts",
      theme: "github-dark",
      transformers: [transformer],
    });
    html = html.replace(`<!--TSBLOCK_${i}-->`, rendered);
  }
  return { html, title: title ?? file, blocks: blocks.length };
}

const PAGE_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0d1117; color: #c9d1d9;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
.wrap { max-width: 860px; margin: 0 auto; padding: 2rem 1.25rem 6rem; }
nav { position: sticky; top: 0; background: rgba(13,17,23,.85); backdrop-filter: blur(8px);
  border-bottom: 1px solid #21262d; padding: .75rem 1.25rem; display: flex; gap: 1rem; flex-wrap: wrap; font-size: 14px; }
nav a { color: #8b949e; text-decoration: none; }
nav a.active { color: #f0b429; }
nav a:hover { color: #e6edf3; }
h1, h2, h3 { line-height: 1.25; }
h1 { margin-top: 0; }
h2 { margin-top: 2.5rem; border-bottom: 1px solid #21262d; padding-bottom: .3rem; }
a { color: #58a6ff; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
:not(pre) > code { background: #161b22; padding: .15em .4em; border-radius: 4px; font-size: .9em; }
pre.shiki { padding: 1rem; border-radius: 8px; overflow-x: auto; border: 1px solid #21262d; font-size: 14px; }
.badge { display:inline-block; background:#161b22; border:1px solid #21262d; color:#8b949e;
  border-radius: 999px; padding: .1rem .6rem; font-size: 12px; }
`;

function nav(files, current) {
  const links = files
    .map((f) => {
      const href = f.replace(/\.mdx$/, ".html");
      const label = f.replace(/^\d+-/, "").replace(/\.mdx$/, "");
      const active = f === current ? ' class="active"' : "";
      return `<a href="${href}"${active}>${label}</a>`;
    })
    .join("");
  return `<nav><a href="index.html">bimorph</a>${links}</nav>`;
}

function shell(title, files, current, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · bimorph</title>
<style>${PAGE_CSS}</style>
<style>${twoslashCss}</style>
</head><body>${nav(files, current)}<div class="wrap">${inner}</div></body></html>`;
}

const files = readdirSync(EX)
  .filter((f) => f.endsWith(".mdx"))
  .sort();

const pages = [];
for (const f of files) {
  const { html, title, blocks } = await render(f);
  const outName = f.replace(/\.mdx$/, ".html");
  writeFileSync(join(OUT, outName), shell(title, files, f, html));
  pages.push({ outName, title, blocks });
  console.log(`  rendered ${outName}  (${blocks} verified snippets)`);
}

const index = `<h1>bimorph</h1>
<p>Bidirectional data mapping. Every code snippet below is type-checked against
<code>src/index.ts</code> at build time via Shiki + twoslash — hover any identifier to
see its inferred type.</p>
<ul>${pages
  .map(
    (p) =>
      `<li><a href="${p.outName}">${p.title}</a> <span class="badge">${p.blocks} snippets</span></li>`,
  )
  .join("")}</ul>`;
writeFileSync(join(OUT, "index.html"), shell("Home", files, null, index));
console.log(`  wrote index.html`);
console.log(`\nsite/ built — ${pages.length} pages`);
