# bimorph

[![npm](https://img.shields.io/npm/v/bimorph)](https://www.npmjs.com/package/bimorph)
[![license: MIT](https://img.shields.io/npm/l/bimorph)](LICENSE)

**Bidirectional data mapping for TypeScript.** Define a mapping once and get both
directions — `decode` (wire → domain) and `encode` (domain → wire) — with the reverses
that *don't* invert cleanly surfaced in the type instead of failing silently.

```ts
import { Enum } from 'bimorph';

const Status = Enum([
    [1, 'active'],
    [0, 'inactive'],
]);

Status.decode(1); // 'active'   — wire → domain
Status.encode('active'); // 1   — domain → wire
```

One declaration, both directions — no hand-written reverse lookup drifting out of sync.

## The problem it kills

The happy path is easy; a lookup object already does that. The pain is the *reverse*:

```ts
const STATUSES = { 0: 'BAD', 1: 'OK' };
const label = STATUSES[0]; // easy
const value = Object.entries(STATUSES).find(([, v]) => v === 'OK')?.[0]; // ugh — and it drifts
```

And most real mappings *don't* invert cleanly: duplicate values, lossy transforms,
missing keys, read-only fields, reverses that need runtime context the value doesn't
carry. Most tools ignore that or hide it. bimorph's thesis: **surface non-invertibility
in the type, and give explicit escape hatches** — instead of pretending every mapping is
a clean isomorphism.

That shows up as:

- **Fidelity tiers** — `iso` (exact round-trip), `lossy` (no round-trip promised),
  `partial` (the inverse can fail). A `partial` codec doesn't even offer a throwing
  `decode`; the type forces you through `safeDecode`.
- **Doors, not flags** — `decode` throws with a path, `safeDecode` returns a `Result`,
  `decodeOr` falls back, `validate` accumulates every error. The behavior is visible at
  the call site, never a hidden config flag.
- **Aliases** — several wire values decode to one domain value, but `encode` only ever
  emits the canonical one (narrowed in the type), so a migration can't leak a legacy
  spelling.
- **Context** — a codec that needs a `region` or `locale` says so in its type; you can't
  silently forget to pass it.

## Install

```bash
npm install bimorph
```

> **Early release — expect breaking changes before 1.0.** The API has just stabilized,
> but the package currently ships TypeScript source (`src/index.ts`): it works in a
> TypeScript project with a bundler, and a compiled `dist/` (`.js` + `.d.ts`) for plain
> Node/JS is on the way. Pin the version.

## Documentation

The full documentation site — Fumadocs, with every `ts twoslash` example type-checked
against the real types at build time — lives in [`apps/docs/`](apps/docs). Run it with
`npm run docs` and open http://localhost:3411.

Design record:

- [`docs/DESIGN.md`](docs/DESIGN.md) — principles, the codec contract, and the API surface.
- [`docs/SCENARIOS.md`](docs/SCENARIOS.md) — ~28 real-world mappings the design was tested against.
- [`docs/DOGFOOD.md`](docs/DOGFOOD.md) — the design written against those scenarios, and the gaps it exposed.

## Development

```bash
npm run typecheck     # tsc --noEmit over src/
npm run check:runtime # runtime-behaviour regression gate
npm run docs          # the documentation site at http://localhost:3411
```

## License

[MIT](LICENSE) © 2026 Oleksandr Zhuravlov
