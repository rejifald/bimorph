# bimorph — Roadmap

Prioritized punch list to close every gap surfaced by dogfooding the **prototype**
(`src/index.ts`) against `SCENARIOS.md`. Ordering principle: **repair the promises
that are currently false → build the escape-hatch spine → add the accumulation /
collection story → close the remaining combinators → give `lossy` teeth.**

Each item lands the way the repo already proves its claims: a ` ```ts twoslash ` block
in `docs/examples/` (so `npm run check:examples` gates it) plus a runtime probe for the
behavioural ones.

Legend: **S/M/L** = rough size. "Unlocks" = scenario IDs from `SCENARIOS.md`.

---

## Status: ✅ all 9 items closed

Every gap below is implemented, type-gated (`docs/examples/*.mdx` via
`npm run check:examples`) and runtime-gated (`npm run check:runtime`).

| # | Item | Gate |
|---|------|------|
| P0 #1 | path threading | runtime: `address.city`, `[i]`, encode-side |
| P0 #2 | `pipe` over `CodecFull` (alias narrowing survives) | [05-pipe](examples/05-pipe.mdx) |
| P1 #3 | resolver (`onMiss`/`onCollision`, widened input, `ambiguous`) | [08-resolver](examples/08-resolver.mdx) |
| P2 #4 | `array` / `tuple` | [06](examples/06-collections-and-tools.mdx) |
| P2 #5 | `validate` + `ErrorTree` (composites only) | [07-validate](examples/07-validate.mdx) |
| P3 #6 | `group` (N↔1) | [09-group](examples/09-group.mdx) |
| P3 #7 | `optional` | [06](examples/06-collections-and-tools.mdx) |
| P3 #8 | `field` `omit-if` | [06](examples/06-collections-and-tools.mdx) |
| P4 #9 | `assertRoundTrip` | [06](examples/06-collections-and-tools.mdx) |

Gates now: **`typecheck` clean · `check:examples` 33/33 · `check:runtime` 30 checks · 9 docs pages.**

**Two caveats discovered during implementation (documented, not silently dropped):**
- **`pipe` into a wire-asymmetric `b`** (e.g. an `encode:"omit"` object) stays a type
  error rather than a silent collapse — model that boundary as an explicitly asymmetric
  codec, or nest via `object`. The alias case (asymmetric `a`) is fully supported.
- **A computed-literal `onMiss` resolver return needs a return annotation** (a TS
  overload-resolution limitation). The `{ default }` preset and `raise()`-style
  resolvers are clean bare; annotated resolvers cover the rest.

The sections below are the original punch list, kept as the design/evidence trail.

---

## P0 — Repair the promises that are currently *false*

Bugs in features that already ship and are advertised as working. Verified against the
compiler / runtime, not asserted.

### 1. Path threading in `object` (then reused by `array` / `pipe`)  — S

- **Repairs:** P3 / DESIGN §2.3 — "the error always carries a path." Today a nested
  field failure yields `path: ""` and a message that never names the field. This is
  Open Question #1.
- **What:** move the `try/catch` *inside* the per-field loop in `object`'s decode /
  encode; on a child failure, prefix the field's **domain key** onto the child's path
  (`key` + `"." + child.path`, or `key + child.path` when the child path starts with
  `[`). Re-throw as a `BimorphError` so an outer composite can prefix again. Add a
  reusable `prefixPath` / `prefixError` helper.
- **Path segment = domain key** (the object-literal key), direction-independent, and it
  maps straight onto form libraries per §2.2.
- **Blocks:** `validate` (#5) is meaningless without correct paths.
- **Done-when:** decoding an object with a bad nested field returns `path === "status"`;
  a nested object returns `"address.city"`; an MDX example asserts it.

### 2. `pipe` over `CodecFull` (kill the asymmetric collapse)  — M

- **Repairs:** the alias-narrowing guarantee (§5.2). `pipe` is typed over the
  *symmetric* `Codec<M,B>`, so composing an aliased `enum_` (wide `BIn`, narrow `BOut`)
  unifies both sides and picks the **wide** side — `pipe(Status, Display).encode(...)`
  is typed to possibly return the legacy alias the feature swore it never emits.
- **What:** retype as `pipe(a: CodecFull<M, BIn, BOut, …>, b: CodecFull<A, M, M, …>)`,
  propagating `a`'s `BIn`/`BOut` to the composed type. The outer/wire codec `a` may be
  asymmetric (this is the alias case); the mid `M` is `a`'s domain and `b`'s wire, kept
  symmetric. Thread `path` through the mid (no new segment added by composition).
- **Deferred (documented, not silent):** piping *into* a wire-asymmetric codec (e.g. an
  `encode:"omit"` object — the B6 case) stays a type error rather than a silent
  collapse; model that boundary as an explicitly asymmetric codec or nest via `object`.
- **Done-when:** `pipe(AliasedEnum, Display).encode(...)` is typed to the **narrow**
  union; an MDX example asserts narrow-out + alias-in survive composition.

---

## P1 — Build the escape-hatch spine

### 3. Resolver subsystem (`onMiss` / `onAmbiguous` / `onCollision`)  — L

- **Fills:** the single most-cited gap. DESIGN §3.1 calls the resolver "the primitive
  all recovery presets desugar to," and it is 100% absent — every "recover gracefully"
  path currently degrades to hand-rolled `try/catch`.
- **What:** `Resolver` / `ResolveContext` types (typed `raise()`, `candidates`, and the
  load-bearing `ctx` field); preset sugar
  `onMiss: "throw" | { default } | "passthrough" | Resolver`;
  `onCollision: "throw" | "first-wins" | "last-wins" | fn`; wire into `enum_` decode /
  encode; start emitting the `"ambiguous"` / `"lossy"` `DecodeError` codes that are
  declared but never produced.
- **Unlocks:** B3, C1, C3, D1, D3, E1, E5.
- **Done-when:** `enum_(…, { onMiss: { default: X } }).decode(unknown)` returns `X`; a
  resolver reading `ctx` disambiguates E5 (`¥` → JPY / CNY).

---

## P2 — Accumulation door + collections (the untrusted-data story)

### 4. `array` / `tuple`  — M

- **Fills:** zero collection support today — every real DTO has arrays.
- **What:** `array(codec)` maps element-wise with per-**index** path segments (`"[3]"`);
  `tuple(...codecs)` fixed positions; both join fidelity (weakest) and intersect `Ctx`,
  as `object` does.
- **Deps:** #1 (path segments). **Unlocks:** B1 (`tags`), D4 (CSV rows), E2.
- **Done-when:** decoding a bad element reports `path: "[2].field"`.

### 5. `validate` door + `ErrorTree`  — M

- **Fills:** the DOGFOOD scorecard's "solid, high-value" feature that does not exist.
- **What:** add `validate(b): Result<A, ErrorTree>` to **composites only**
  (`object` / `array` / `tuple`, never leaves), where `ErrorTree` is the path-keyed flat
  map (`"shipping.postalCode"`) of §2.2. Decode-only for now (skip `validateEncode`).
- **Deps:** #1 (paths) + #4 (per-index accumulation).
- **Unlocks:** A5, B2, D4, C5, E2.
- **Done-when:** a 3-error DTO returns all three keyed paths in one `Result`.

---

## P3 — Close the remaining combinators

### 6. `group` (N↔1)  — M

- **Fills:** Gap 5 / B4 — three checkbox wire fields collapse to one domain enum;
  `field(wireKey, codec)` is 1:1 and cannot express it.
- **Sub-decision:** either `object` accepts a multi-`wireKey` field, or a standalone
  `group(wireKeys[], codec)`; `WireIn` / `WireOut` key-derivation must consume multiple
  wire keys for one domain key.
- **Unlocks:** B4.

### 7. `optional(codec)`  — S

- `null` / absent ↔ `undefined` normalisation. **Unlocks:** A3 (the regression anchor)
  as a real combinator instead of a hand-rolled `iso`.

### 8. `field(…, { encode: "omit-if", when })`  — S

- Conditional omit; the field stays present (optional) in the `WireOut` type, unlike
  unconditional `omit` which drops it. **Unlocks:** B1 (drop `page=1`).

---

## P4 — Give `lossy` teeth

### 9. `assertRoundTrip(codec, samples)`  — S

- **Fills:** the *entire* enforcement behind the `lossy` tier — today `lossy` is
  byte-identical to `iso`. DESIGN §7 Q2 scopes this as a **test helper**, not a
  runtime / creation check.
- **Unlocks:** A1 (BHD 3-dp drift), C2, C3 — caught loudly in a test, where they belong.

---

## Dependency spine

```
#1 path ──┬──► #4 array/tuple ──► #5 validate
          └──────────────────────► #5
#2 pipe (independent; do alongside #1)
#3 resolver (independent; large)
#6 group   #7 optional   #8 omit-if   #9 assertRoundTrip   (independent leaves)
```

## Non-goals (explicit)

- **Async codecs** — Open Q#4; v1 is sync-only. The `Ctx` shape does not preclude an
  `AsyncCodec` later.
- **`validateEncode`** — mirror only if a real need appears; encode is your own
  well-typed data.
