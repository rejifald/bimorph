# Authoring bimorph documentation

This is the contract for writing docs pages. Read it before you write one.

This guide governs **structure** — templates, sections, twoslash, tabs, the
manifest. How the prose _reads_ — voice, economy, how a claim is shown rather than
asserted — is the separate, equally-mandatory contract in
[`EDITORIAL.md`](./EDITORIAL.md). A page must pass both.

It matters more than a usual style guide because the first content pass ships the
**structure only** — every page starts life as a generated stub. There is no
finished page to copy yet, so **this guide plus [`content.manifest.ts`](./content.manifest.ts)
_are_ the exemplar.**

Audience: human writers **and** agents. Every rule below is chosen so a page works
equally well rendered in a browser and pulled out of context as a machine-readable
`llms.mdx`.

---

## How the site is built

-   **Engine:** Fumadocs (Next.js App Router). Pages are MDX with frontmatter under
    `content/docs/`.
-   **Structure is data:** [`content.manifest.ts`](./content.manifest.ts) is the
    source of truth for the information architecture — every page (path, title,
    description, kind) and every sidebar group. The skeleton generator
    (`scripts/generate-skeleton.mjs`) reads it to emit folders, each `meta.json`,
    and a stub `.mdx` per page. **A page that isn't in the manifest doesn't exist;
    a manifest entry with no file is a bug.** Don't reorganize the tree by hand —
    change the manifest.
-   **Machine-readable output is automatic:** Fumadocs emits `llms.txt`,
    `llms-full.txt`, and a per-page `llms.mdx` from your content. You never write
    these — but [rule 5](#authoring-rules) exists because of them.

## Information architecture

Six top-level groups, ordered for a first read:

**Getting started → Recipes → Concepts → Guides → Reference → Errors & pitfalls.**

Guides are **fine-grained** — roughly one page per export — grouped into capability
subfolders (`leaves`, `enums`, `composites`, `composition`, `doors`, `context`,
`recovery`, `testing`). Fine-grained is deliberate: one page per feature means one
focused `llms.mdx` per feature, so an agent pulls just the `enum_` page into
context, not the whole combinator manual.

StitchAPI's `Surfaces`, `For agents`, and `Integrations` groups have no analogue in
a pure data-mapping library and are intentionally absent — don't reintroduce them
to pad the tree.

---

## The four templates

Pick the template by the page's `kind` in the manifest. Copy the skeleton verbatim,
then fill it. Required sections are marked `(required)` — don't drop them; don't add
a fifth top-level section without a reason.

> **Frontmatter:** the schema (`pageSchema`) allows `title`, `description`, and
> `icon` only. `kind` and `code` live in the manifest, not the frontmatter. Keep
> frontmatter to `title` + `description`.

### Guide — the workhorse (`kind: guide`)

<!-- prettier-ignore -->
````mdx
---
title: enum_
description: Map a set of discrete keys to values, entries-first, and get decode and encode from one declaration.
---

{/* What & when (required) — 1–2 sentences: what this does + when you reach for
it. Leads the page because it is also the agent's relevance signal in llms.mdx.
No heading. */}
Reach for `enum_` when a fixed set of wire values maps to a fixed set of domain
values — the status codes, kinds, and flags an API sends as ints or short strings.

## Example {/* (required) */}

{/* The smallest codec that uses the feature, above the fold. Twoslash — see
"Code examples" below. */}
```ts twoslash
import { enum_ } from 'bimorph';

const Status = enum_([
    [1, 'active'],
    [0, 'inactive'],
]);
```

## Options {/* (required) */}

{/* Only the options that matter here, with defaults. Link to Reference for the
exhaustive shape — never paste a full type table into a guide (rule 6). */}
`onCollision` decides what happens when two entries share a domain value;
`onMiss` decides what an unmapped wire value does. See
[Reference → Constructors](/docs/reference/constructors) for every field.

<Callout type="warn">
    **Anti-pattern:** don't reach for X here — do Y instead. Tempting-but-wrong
    uses and one-line micro-gotchas go inline like this, at the point of
    temptation (rule 10). Anything systemic gets a catalog page instead — link it
    under See also.
</Callout>

## See also {/* (required) */}

<Cards>
    <Card title="Aliases" href="/docs/guides/enums/aliases" />
    <Card title="Intentional many-to-one" href="/docs/concepts/aliases" />
    <Card title="collision" href="/docs/errors/collision" />
</Cards>
````

### Concept (`kind: concept`)

Explanation, not how-to. No step lists, no "do this then that" — that's a guide.

<!-- prettier-ignore -->
````mdx
---
title: Fidelity tiers
description: How iso, lossy, and partial encode a mapping's round-trip guarantee in the type.
---

{/* What it is (required) — 1–2 sentences. */}
A codec's fidelity tier — `iso`, `lossy`, or `partial` — states what round-trip it
promises, and the type enforces it.

## Why it's shaped this way {/* (required) */}

{/* The mental model and the design rationale. This is the heart of a concept page. */}

## How it relates {/* (required) */}

{/* How this connects to other concepts and to the features that use it. */}

## See also {/* (required) */}

<Cards>
    <Card title="Guide: lossy" href="/docs/guides/leaves/lossy" />
</Cards>
````

### Reference (`kind: reference`)

Hybrid: editorial prose for orientation, generated tables for the shapes.

<!-- prettier-ignore -->
````mdx
---
title: Errors & results
description: DecodeError, ErrorTree, BimorphError, and the Result discriminated union the doors return.
---

{/* One line on what this page documents. */}
The error and result types every door speaks.

## DecodeError {/* (required: signature) */}

{/* (required: the no-drift table) Generated from the real type — never
hand-write a type table. See "Type tables" below. */}

<AutoTypeTable path="../../src/index.ts" name="DecodeError" />

## See also {/* (required) */}

<Cards>
    <Card title="Guide: validate" href="/docs/guides/doors/validate" />
</Cards>
````

### Errors & pitfalls (`kind: error`)

The most rigid template, and the most agent-facing. Each page is keyed to a
`DecodeError.code` — the value a thrown `BimorphError` carries. The page slug **is**
that code; treat it as an API (rule 9).

<!-- prettier-ignore -->
````mdx
---
title: collision
description: Two primary entries shared a domain value, so encode has no single canonical wire to emit.
---

## What you'll see {/* (required) */}

{/* The symptom, with the literal error message where possible. */}

## Why it happens {/* (required) */}

{/* The trigger. */}

## How to fix {/* (required) — the payoff. */}

{/* Concrete remediation steps. */}

## Related {/* (required) */}

<Cards>
    <Card title="Guide: onCollision" href="/docs/guides/enums/on-collision" />
</Cards>
````

---

## Authoring rules

1. **Examples are Twoslash, always.** Every code block is type-checked against the
   real `bimorph` at build time. A snippet that calls a renamed export fails the
   build. See [Code examples](#code-examples--twoslash).
2. **Frontmatter is `title` + `description`, both mandatory.** `description` is a
   real sentence — it's the search result, the `llms.txt` line, and the agent's
   relevance signal. No placeholders, no fragments.
3. **Draw every example from the canonical world.** Reuse the named codecs below
   (`Status`, `Flag`, `User`, `Money`, `Phone`, `Visibility`) instead of coining a
   new domain per page. See [The canonical example world](#the-canonical-example-world).
4. **Terminology.** A **codec** (lowercase, noun) maps between a **wire** value and
   a **domain** value via **decode** (wire → domain) and **encode** (domain →
   wire). A failure behavior is a **door**; a round-trip guarantee is a **fidelity
   tier**; runtime context is **context**. Never "schema", "validator", "parser",
   or "serializer" for a codec — those assert a one-directional mental model.
5. **Self-contained pages.** Each page must stand alone when extracted into
   `llms.mdx`. No "as we saw above" or "continuing from the previous page" —
   restate the one-line premise and link instead.
6. **One source of truth per fact.** Full type tables live only in Reference; error
   remediation lives only in Errors & pitfalls; positioning lives only on the entry
   pages. Everywhere else, link. This is bimorph's own thesis — surface the
   mismatch, don't duplicate it — applied to the docs.
7. **`See also` is mandatory.** Fine-grained pages strand readers without it. Every
   page links to its neighbors, its Reference entry, and any relevant concept or
   error page.
8. **Backfill TSDoc as you go.** Writing a Reference page means adding or extending
   TSDoc on the types it documents — that's what enriches the generated
   `AutoTypeTable`.
9. **Alternatives are tabs, not prose.** When the same outcome has more than one
   equivalent form — package manager, import style — show the forms as tabs and let
   the reader's pick persist. Never write "you can also…" and never pick one form
   for the reader while hiding the rest. See [Code variants](#code-variants--tabs).
10. **Anti-patterns go inline, at the point of temptation.** Where a feature has a
    tempting-but-wrong use — the shortcut a reader reaches for right before it bites
    them — flag it with a `<Callout type="warn">` in the section that introduces
    that use, never in a separate "best practices" page. Lead with **Anti-pattern**
    and write it as _don't X — do Y instead_. A systemic failure mode is a catalog
    page in Errors & pitfalls (link it under `See also`), not a restated list.

---

## The canonical example world

Every example everywhere draws from **one fixed roster of named codecs**. bimorph
touches no network, so there is no host to standardize — the shared vocabulary is
the codecs themselves. Reuse the same names: a reader who meets `Status` on the
intro page recognizes it on the enum page and in the doors guide — one example
world, no drift.

### The roster

Each codec is the canonical demonstration of **one** idea. Reach for the row that
matches what the page teaches; don't coin a new codec for a shape one of these
already shows.

<!-- prettier-ignore -->
```ts twoslash
import { enum_, iso, lossy, partial, object, field } from 'bimorph';

// Status — wire int ↔ domain label. The intro enum; reverse-lookup; both directions.
const Status = enum_([
    [1, 'active'],
    [0, 'inactive'],
]);

// Flag — a feature flag with legacy spellings as decode-only aliases.
const Flag = enum_([['search_v2', 'SearchV2']], {
    aliases: [
        ['new-search', 'SearchV2'],
        ['newSearchUI', 'SearchV2'],
    ],
});

// Money — cents (wire) ↔ dollars (domain). Lossy: float division sheds precision.
const Money = lossy<number, number>({
    decode: (cents) => cents / 100,
    encode: (dollars) => Math.round(dollars * 100),
});

// User — a wire DTO ↔ a domain object: renamed keys, and created_at decode-only.
const num = iso<number, number>({ decode: (n) => n, encode: (n) => n });
const str = iso<string, string>({ decode: (s) => s, encode: (s) => s });
const User = object({
    id: field('user_id', num),
    name: field('full_name', str),
    createdAt: field('created_at', str, { encode: 'omit' }),
});

// Phone — national ↔ E.164, needs a { region } to disambiguate. Partial + contextual.
const Phone = partial<string, string, { region: string }>({
    decode: (national, ctx) => ({ ok: true, value: `${ctx.region}:${national}` }),
    encode: (e164) => e164,
});
```

| Codec        | Maps                                | The canonical demo of                                        |
| ------------ | ----------------------------------- | ------------------------------------------------------------ |
| `Status`     | `1 \| 0` ↔ `'active' \| 'inactive'` | the intro · reverse lookup · `enum_` · both directions       |
| `Flag`       | legacy spellings ↔ `'SearchV2'`     | aliases · wide decode, narrow encode · migration             |
| `Money`      | cents ↔ dollars                     | the `lossy` tier · `assertRoundTrip`                         |
| `User`       | snake_case DTO ↔ domain object      | `object` · `field` rename · `encode: 'omit'` · `validate`    |
| `Phone`      | national ↔ E.164                    | `partial` · contextual codecs · `.bind()`                    |
| `Visibility` | 3 booleans ↔ one enum               | `group` — N wire keys ↔ 1 domain field                       |

**Extending the roster.** Only when a feature needs a shape these can't show. Add
the codec to this section first — same style, same names — so a one-off domain
invented inline (the thing this section exists to stop) never ships.

---

## Code examples — Twoslash

Write the fence as `ts twoslash`:

````md
```ts twoslash
import { enum_ } from 'bimorph';

// ...
```
````

Twoslash compiles the snippet against the workspace's real `bimorph` types (the
package `exports` point at `src/index.ts`) during the docs build, renders inline
type hovers, and **fails the build on a type error**. That's the whole point:
examples cannot silently drift from the types.

-   Imports must resolve to the published entry point (`bimorph`), not deep paths.
-   Use the `//    ^?` query to surface an inferred type — the alias-narrowing and
    context machinery is best _shown_ this way (e.g. `encode` returning the narrow
    canonical wire union).
-   To intentionally show an error, use Twoslash's `// @errors:` directive — don't
    ship an un-annotated broken snippet.

## Folding setup code

Every example is a complete, compiling program (rule 1), so it carries scaffolding
the reader didn't come for — imports, a leaf codec, a type declaration. Wrap that
scaffolding in a fold so the block opens on the focal code, with a **Show full
example** toggle to reveal the rest:

<!-- prettier-ignore -->
````md
```ts twoslash
// [!code fold:start]
import { enum_ } from 'bimorph';
// [!code fold:end]
const Status = enum_([
    [1, 'active'],
    [0, 'inactive'],
]);
```
````

-   **`// [!code fold:start]` … `// [!code fold:end]`** are whole-line markers; the
    lines between them collapse and the markers themselves never render.
-   **The folded code stays real.** It's still type-checked by Twoslash and still in
    the page source — this hides it, it doesn't cut it (contrast Twoslash's
    `// ---cut---`, which deletes setup with no way back).
-   **Fold the boilerplate, not the lesson.** Collapse imports and leaf-codec setup.
    Never fold the line the page is actually teaching.

## Code variants — tabs

If a snippet has an equivalent alternative, show the alternatives as **tabs**. The
reader chooses once and the choice persists across the whole site.

### Install commands → `package-install`

One fence tagged `package-install` becomes npm / pnpm / yarn / bun tabs. Write only
the package name — this is the **one** code block that isn't Twoslash (rule 1),
because it's a shell command, not TypeScript:

````md
```package-install
bimorph
```
````

The package-manager pick persists site-wide, wired once in
[`source.config.ts`](./source.config.ts) via `remarkNpmOptions.persist`.

### Equivalent code → `tab=` on consecutive fences

Give each equivalent form its own `ts twoslash` fence tagged with a `tab` label and
a shared `tabGroup` (the persistence key). bimorph's live axis is
`package-manager`; introduce a new `tabGroup` only for genuinely equivalent forms,
and add it here first so persistence stays consistent. A codec's per-call `ctx`
versus `.bind()`, or `iso` versus `enum_`, are **not** equivalent forms — they are
different tools, so they're prose + separate examples, not tabs.

## Type tables — AutoTypeTable

Reference pages render option shapes from the **actual** TypeScript with
`fumadocs-typescript`:

<!-- prettier-ignore -->
```mdx
<AutoTypeTable path="../../src/index.ts" name="DecodeError" />
```

-   `path` resolves relative to this app's cwd — always `../../src/index.ts` for
    bimorph, regardless of the page's folder depth; `name` is the exported type.
-   Never hand-write a prop table — it will drift. If a field needs explanation, add
    TSDoc to the type (rule 8) and the table picks it up.
-   Type tables belong in Reference only; guides link to them (rule 6).

## The error code registry

Errors & pitfalls is keyed to the `DecodeError.code` union in `src/index.ts`:
`miss`, `ambiguous`, `collision`, `lossy`, `malformed`.

-   One catalog page per code. The page **slug is the code** a thrown `BimorphError`
    carries in `error.detail.code`.
-   **Slugs are an API.** Once a page is published, never rename its slug — add a new
    page and redirect the old one.

---

## Definition of done (per page)

-   [ ] Listed in `content.manifest.ts`; file path matches.
-   [ ] `title` + `description` frontmatter; `description` is a real sentence.
-   [ ] Uses the correct template for its `kind`; all `(required)` sections present.
-   [ ] Every TypeScript code block is `ts twoslash` and builds clean (install
        blocks are the exception — they aren't TypeScript).
-   [ ] Equivalent forms (install, import) are tabs with a canonical `tabGroup`, not
        prose alternatives.
-   [ ] No hand-written type tables; shapes come from `AutoTypeTable`.
-   [ ] Examples come from the canonical roster (`Status` / `Flag` / `User` /
        `Money` / `Phone` / `Visibility`), not a one-off domain.
-   [ ] Reads correctly in isolation (imagine it as a lone `llms.mdx`).
-   [ ] `See also` links neighbors, the Reference entry, and any concept/error page.
-   [ ] Any tempting-but-wrong use is flagged with an inline **Anti-pattern**
        `<Callout type="warn">` at the point of temptation (rule 10) — omit only
        when the page has no such pitfall.
