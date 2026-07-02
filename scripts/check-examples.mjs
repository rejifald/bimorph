// Type-check every ```ts twoslash``` block in docs/examples/*.mdx against the real
// library types. Twoslash compiles each block in-memory; the library source is wired
// in as a virtual file and aliased to the bare specifier `bimorph`, so the MDX imports
// read exactly as a consumer would write them. An undeclared compiler error (or a
// declared `// @errors:` code that never fires) makes twoslash throw → we fail.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { createTwoslasher } from "twoslash";

const ROOT = process.cwd();
const EX_DIR = join(ROOT, "docs", "examples");
const libSource = readFileSync(join(ROOT, "src", "index.ts"), "utf8");

const twoslasher = createTwoslasher();

const compilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: ".",
  paths: { bimorph: ["./bimorph-lib.ts"] },
};
const extraFiles = { "bimorph-lib.ts": libSource };

function extractBlocks(md) {
  const blocks = [];
  const re = /```(\w+)([^\n]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) {
    const [, lang, meta, code] = m;
    if (/\btwoslash\b/.test(meta) && (lang === "ts" || lang === "tsx")) {
      const line = md.slice(0, m.index).split("\n").length;
      blocks.push({ lang, code, line });
    }
  }
  return blocks;
}

const files = readdirSync(EX_DIR, { recursive: true })
  .filter((f) => typeof f === "string" && f.endsWith(".mdx"))
  .sort();

let total = 0;
let failed = 0;

for (const file of files) {
  const md = readFileSync(join(EX_DIR, file), "utf8");
  for (const b of extractBlocks(md)) {
    total++;
    try {
      twoslasher(b.code, b.lang, { compilerOptions, extraFiles });
      console.log(`  ok    ${file}:${b.line}`);
    } catch (e) {
      failed++;
      const msg = e?.title
        ? `${e.title}\n${e.description ?? ""}`
        : (e?.message ?? String(e));
      console.log(`  FAIL  ${file}:${b.line}`);
      console.log(
        msg
          .split("\n")
          .map((l) => "        " + l)
          .join("\n"),
      );
    }
  }
}

console.log(`\n${total - failed}/${total} twoslash blocks passed`);
process.exit(failed ? 1 : 0);
