# bimorph

A TypeScript library for **bidirectional data mapping**. Define a mapping **once**,
get both directions for free:

- `decode` — external representation → domain value
- `encode` — domain value → external representation

The interesting part is not the happy path (a `Record` already does that). It's
that **most real mappings do not invert cleanly** — duplicate values, lossy
transforms, missing keys, read-only fields, and reverses that need runtime context
the value doesn't carry. bimorph's thesis: *embrace that reality, surface it early,
and give the caller explicit, legible escape hatches* — rather than pretend every
mapping is a clean isomorphism.

## Status

Design phase + a **typechecked prototype** proving the load-bearing type machinery.

Docs:

- [`apps/docs/`](apps/docs) — the full documentation site (Fumadocs + Next.js App
  Router). Every `ts twoslash` example is type-checked against `src/index.ts` at
  build time. Run it with `npm run docs`, then open http://localhost:3411.
- [`docs/DESIGN.md`](docs/DESIGN.md) — principles, contracts, and the API surface.
- [`docs/SCENARIOS.md`](docs/SCENARIOS.md) — ~28 real-world scenarios gathered to test the design against.
- [`docs/DOGFOOD.md`](docs/DOGFOOD.md) — the design written against those scenarios, and the gaps it exposed.

Prototype:

- [`src/index.ts`](src/index.ts) — minimal runtime, but the **real** types: `iso` / `lossy` /
  `partial` / `Enum` (with aliases) / `Struct` / `Field` / `bind`.

```bash
npm install
npm run typecheck        # tsc --noEmit over src/
npm run check:runtime    # runtime-behaviour regression gate over src/
npm run docs             # run the documentation site (apps/docs) at http://localhost:3411
```

What the prototype proves compiles (see the MDX for the assertions):

1. **Alias narrowing** — `Enum` decode accepts the *wide* union (primaries + aliases),
   `encode` returns the *narrow* canonical-only union. A migration cannot emit a legacy spelling.
2. **Contextual codecs** — a `Ctx` third param whose trailing argument is required
   (`decode(b)` without it is a type error), `.bind(ctx)` erases it back to a plain codec,
   and `Struct` **intersects** the contexts of its fields into one merged bag.
3. **`Partial` removes the throwing decode door** at the type level — you're forced to `safeDecode`.

## The one-line motivation

```ts
// The problem this exists to kill:
const STATUSES = { 0: "BAD", 1: "OK" };
const label = STATUSES[0];                                 // easy
const value = Object.entries(STATUSES).find(([, v]) => v === "OK")?.[0]; // ugh
```
