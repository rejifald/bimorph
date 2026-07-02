# bimorph — Design

> Status: design phase. Illustrative TypeScript below is a **spec sketch**, not
> compiling code. Names (`bimorph`, `iso`, `Enum`, doors) are provisional.

---

## 1. Principles

**P1 — Tools, not guarantees.** The library helps you *spot* a broken mapping and
gives you escape hatches to *resolve* it. It does not, and should not, try to make a
bad schema correct. If the consumer's data model is lossy or ambiguous, that stays
the consumer's problem — bimorph only guarantees it won't be *silent*.

**P2 — Behaviour is a door, not a flag.** Different failure-handling behaviours are
different *named entry points*, never a config flag that silently changes what a
method returns. The choice must be visible at the call site and in the diff.

**P3 — Loud by default.** The bare verb (`decode`/`encode`) throws on failure, and
the error always carries a **path**. Silence (getting `undefined`, swallowing a
nested error) is something you opt *into* via a door, never the default.

**P4 — Two decision times, two rules.**
- *Creation-time* config = properties of **the mapping** (collision policy,
  resolver, encode-omit). Flags/options are correct here.
- *Call-time* behaviour = properties of **the caller's expectations** (throw /
  Result / fallback / accumulate). Doors only. Never a flag. (This is P2 applied.)

**P5 — Non-invertibility is expressible, not hidden.** The *type* reflects the
guarantee level. An `Iso` promises `decode(encode(a)) === a`. A lossy or partial or
context-dependent mapping is a *different type* that does **not** make that promise,
so callers can't accidentally assume a clean round-trip.

---

## 2. Core contract

`Codec<A, B>` where **A = domain** (what your app holds) and **B = wire** (the
external form).

```ts
codec.decode(b: B): A   // read external in
codec.encode(a: A): B   // write domain out
```

Direction convention matches io-ts / Effect Schema, so it won't surprise anyone.

### 2.1 Doors (call-time behaviour)

Exactly three behaviours. More would be noise.

| Door | Returns | Intent | Analog |
|---|---|---|---|
| `decode(b)` | `A`, **throws** on failure | "I assert this succeeds" | Rust `unwrap`, Zod `.parse` |
| `safeDecode(b)` | `Result<A, DecodeError>` | "I'll handle failure" | Zod `.safeParse` |
| `decodeOr(b, fallback)` | `A`, always | "Just give me a value" | Rust `unwrap_or` |

Symmetric on the encode side (`encode` / `safeEncode` / `encodeOr`).

Rules:
- **Same error type across doors.** `safeDecode`'s `E` is exactly what `decode`
  throws, so error handling composes.
- **`Result` is a dumb discriminated union**, not a wrapper class with its own
  method zoo: `{ ok: true; value: A } | { ok: false; error: DecodeError }`.
  `unwrap`/`unwrapOr` live as *codec* doors (table above), not on `Result` — one
  error API, not two.
- Flat method names (`safeDecode`) over a `.safe.decode` namespace: greppable and
  autocompletes.

### 2.2 The `validate` door (composites only)

Fail-fast is the default even for `safeDecode` — nesting errors silently is the
killer we're avoiding (P3). Error *accumulation* (collect every bad field, like a
form validator) is a **separate door**, and it only exists where more than one thing
can fail — `Struct`, `List`, `Tuple`. A leaf `iso`/`Enum` has nothing to
accumulate, so the door isn't on its type at all.

```ts
User.decode(dto)      // throws on first bad Field, error has a path
User.safeDecode(dto)  // Result<User, DecodeError>  — first failure, fail-fast
User.validate(dto)    // Result<User, ErrorTree>    — accumulate, composite-only

Status.decode(9)      // trio only — no .validate(); nothing to accumulate
```

- Same error vocabulary; differs only in **cardinality**. Fail-fast reports the
  first path, `validate` reports all paths.
- `ErrorTree` is **path-keyed flat** (`"shippingAddress.postalCode"`), which maps
  straight onto form libraries — not a nested tree.
- `validate` is **decode-only** by default (accumulation is an inbound/untrusted-data
  concern; encode is your own well-typed data). Mirror as `validateEncode` only if a
  real need appears.
- `validate` still returns the decoded `A` on success — "decode but collect," not a
  boolean checker.

### 2.3 The error

```ts
type DecodeError = {
  path: string;          // "" for a leaf, "balance" / "address.city" for composites
  code: "miss" | "ambiguous" | "lossy" | "malformed" | "collision";
  input: unknown;
  message: string;
};
```

The `path` is what makes throw-by-default safe rather than a silent killer.

---

## 3. Creation-time config (properties of the mapping)

### 3.1 The resolver (escape hatch)

The single primitive that all recovery presets desugar to. Runs per-value, receives
full context, returns the final result — typed to the target so the escape hatch
never widens to `any`.

```ts
type ResolveContext<In, Out, Ctx = never> = {
  direction: "encode" | "decode";
  input: In;
  reason: "miss" | "ambiguous" | "lossy";
  candidates?: Out[];      // populated when ambiguous
  ctx?: Ctx;               // runtime context, if the codec is contextual (§4.4)
  raise(): never;          // typed "give up and fail with the standard error"
};

type Resolver<In, Out, Ctx = never> = (c: ResolveContext<In, Out, Ctx>) => Out;
```

Presets are sugar over it: `onMiss: "throw" | { default: X } | "passthrough" | Resolver`.

### 3.2 Collision policy

Structural (creation-time) resolution for "two keys produce the same value." A
default value can't resolve this — it can't pick *which* key wins. The knobs are:

```ts
onCollision: "throw" (default) | "first-wins" | "last-wins" | (keys) => winner
```

Note: `first-wins`/`last-wins` are just "bake the decision now" vs "defer to the
runtime resolver." Same mechanism, different time.

### 3.3 encode-omit

Fields that flow decode→domain only (server-managed ids/timestamps, derived config,
in-memory-only prefs). Declared read-only; the encode output type structurally
**lacks** them, so a round-trip can't be assumed.

```ts
Field("created_at", DateIso, { encode: "omit" })
Field("page",       NumberCodec, { encode: "omit-if", when: (v) => v === 1 }) // §5 G6
```

---

## 4. Two axes: fidelity tier & context requirement

Dogfooding forced apart two **independent** properties of a codec. Earlier drafts
treated `Contextual` as a fourth peer of `Iso`/`Lossy`/`Partial` — that was wrong.
Context-requirement is *orthogonal* to round-trip quality: a contextual codec can
also be lossy or partial. Both properties are visible in the type; neither can be
silently ignored.

### 4.1 Axis 1 — fidelity tier (round-trip quality)

| Tier | Promise | Throwing door on the failing direction? |
|---|---|---|
| `Iso<A,B>` | `decode(encode(a)) === a` **and** `encode(decode(b)) === b` | yes |
| `Lossy<A,B>` | neither round-trip promised | yes |
| `Partial<A,B>` | at least one direction can fail on otherwise-valid input | **no — only `safe*`/`validate`/`*Or`** |

- `Iso`: nullable↔optional (A3), bitmask↔roles w/ no reserved bits (E2), gRPC enum↔int (D3).
- `Lossy`: cents↔Money (A1), bytes↔"1.5 GB" (C3), C↔F rounded (C2), slug↔title (E6).
- `Partial`: "First Last"↔{first,last} (E4) — any inverse that is guesswork.

**Why `Partial` removes the throwing door at the type level.** A bare `.decode()`
reads as "I assert this succeeds" (P3). For a mapping whose inverse is genuine
guesswork that assertion is a lie, so the type simply doesn't offer it — the caller
is forced through `safeDecode`/`validate`/`decodeOr` and must acknowledge failure.

### 4.2 Axis 2 — context requirement

A codec is either **context-free** (`Ctx = void`) or **contextual** (`Ctx` is a
non-empty object type). Orthogonal to fidelity:

| Scenario | fidelity | context |
|---|---|---|
| B3 `<select>`↔entity | Iso (given the list) | `{ entities }` |
| E3 E.164↔national | Partial (ambiguous parse) | `{ region }` |
| E5 symbol↔ISO-4217 | Partial | `{ locale }` |
| C4 epoch↔ISO | Lossy | `{ tz }` (needed on **encode**) |
| E1 offset↔IANA zone | Partial | `{ at: Date }` — *and still* many-to-one |
| E4 name parse | Partial | context-free |

### 4.3 Contextual — full design

The reverse (or forward) function needs an argument the value doesn't carry. Model it
as a third type param.

```ts
type Codec<A, B, Ctx = void> = {
  decode(b: B, ...c: CtxArg<Ctx>): A;
  encode(a: A, ...c: CtxArg<Ctx>): B;
  safeDecode(b: B, ...c: CtxArg<Ctx>): Result<A, DecodeError>;
  decodeOr(b: B, fallback: A, ...c: CtxArg<Ctx>): A;
  // ...encode variants...
  bind(ctx: Ctx): Codec<A, B, void>;    // erase the context → an ordinary codec
};

// the trailing arg exists ONLY when Ctx is non-void
type CtxArg<Ctx> = [Ctx] extends [void] ? [] : [ctx: Ctx];
```

So `codec.decode(b)` compiles **iff** `Ctx = void`; otherwise `decode(b, ctx)` is
required and forgetting `ctx` is a compile error. You cannot silently drop context.

**Design decisions:**

1. **Single shared `Ctx`, not per-direction `DecCtx`/`EncCtx`.** Per-direction is
   more precise but means four type params, awful signatures, and a composition
   nightmare — for a rare payoff (most contextual codecs need the same context on
   both sides; phone formatting needs `region` both ways). A direction that ignores
   the context simply doesn't read it. Rejected the precise version deliberately.

2. **`Ctx` must be an object type** (`{ region: string }`, never a bare `string`).
   Composition merges child contexts by intersection (`&`), which only works on
   objects. Keep field names disjoint and meaningful across codecs you expect to
   compose (`region`, `locale`, `entities` — not `value`).

3. **Two ways to supply it:**
   - *Per-call* — `codec.decode(v, { region: "US" })` when the context varies per call.
   - *`.bind(ctx)`* — returns a context-free `Codec<A,B,void>` when the context is
     stable over many calls (a whole form, one render pass). **This is what makes
     contextual codecs composable**: bind first, then drop the result into
     `Struct`/`pipe`/`List` as an ordinary codec.

4. **Composition propagates context by intersection.** A composite holding contextual
   children is itself contextual; one merged bag is passed down and each child reads
   its own fields:

   ```ts
   const Form = Struct({
     phone:    Field("phone",    PhoneCodec),   // Ctx = { region: string }
     currency: Field("currency", SymbolCodec),  // Ctx = { locale: string }
   });
   // Form: Codec<Domain, Wire, { region: string } & { locale: string }>
   Form.decode(dto, { region: "US", locale: "en-US" });
   ```

5. **The resolver sees the context.** `ResolveContext.ctx` carries the bound/passed
   value so an `onMiss`/`onAmbiguous` resolver can use it (E1: read `at` to pick a
   zone, or `raise()`).

**The honest failure (E1).** When even a `Ctx` can't recover the inverse — offset →
IANA zone stays many-to-one regardless of the instant — the resolver `raise()`s and
the codec is `Partial`. That is the design *working*: it forces you to either inject
enough context to disambiguate, or admit at design time that the inverse doesn't
exist and stop modelling it as one codec. A design-time "you can't do this cleanly"
beats a shipped, plausible, wrong reverse.

**Async note.** Entity lookup (B3) is often async in reality. v1 is sync-only, but the
`Ctx` shape doesn't preclude an `AsyncCodec<A,B,Ctx>` (`decodeAsync`) later.

---

## 5. Aliases (intentional many-to-one)

Headline dogfood finding: **intentional many-to-one is the *common* case, not an
error.** Legacy status strings, deprecated feature-flag spellings, versioned event
names — all are "several wire values decode to one domain value; one canonical wire
value is the encode target." The naive "duplicate ⇒ throw at creation" diagnostic
fights exactly this legitimate migration pattern. Aliases make it first-class.

### 5.1 Precise semantics (two indexes)

An `Enum` maintains two internal indexes, and every rule falls out of keeping both
functional:

- **decode index** `wire → domain` — populated by primary entries **and** aliases.
- **encode index** `domain → wire` — populated by **primary entries only**.

Rules:

1. **Primaries must be injective on the domain side.** Two primaries with the same
   domain value ⇒ ambiguous encode ⇒ **throws at creation.** This is the diagnostic
   that stays meaningful.
2. **Aliases are decode-only.** They add `wire → domain` pairs but never appear in
   encode output — a permanent, implicit `encode: "omit"` on that spelling.
3. **Alias target must be a declared domain value**, else creation error.
4. **The decode index must stay a function.** Two entries (primary or alias) mapping
   the *same wire* to *different* domains ⇒ ambiguous decode ⇒ **throws.** (Still a
   real bug; aliases don't suppress this.)

### 5.2 API & the type-level payoff

```ts
const Flag = Enum(
  [["search_ui_v2", FeatureFlag.SearchUiV2]],      // primary = canonical wire
  {
    aliases: [
      ["new-search-ui", FeatureFlag.SearchUiV2],   // legacy spellings, decode-only
      ["newSearchUI",   FeatureFlag.SearchUiV2],
    ],
  },
);

Flag.decode("new-search-ui");        // FeatureFlag.SearchUiV2   ← legacy accepted
Flag.decode("search_ui_v2");         // FeatureFlag.SearchUiV2
Flag.encode(FeatureFlag.SearchUiV2); // "search_ui_v2"           ← never a legacy spelling
```

The encode return type is the **narrow canonical union**, aliases excluded:

```ts
decode(b: "search_ui_v2" | "new-search-ui" | "newSearchUI"): FeatureFlag
encode(a: FeatureFlag): "search_ui_v2"
```

So downstream consumers of `encode` output *cannot* receive a deprecated spelling —
the type guarantees the migration only ever writes canonical values. That is the
whole point of the feature expressed at the type level.

### 5.3 What aliases are NOT

- **Not one-wire-to-many-domain.** `$` → USD | CAD | AUD (E5) is *decode ambiguity* —
  the opposite shape — and belongs to **Contextual** (a locale disambiguates), not
  aliases. Aliases are strictly many-wire → one-domain with deterministic decode.
- **Not fuzzy / pattern matching.** Aliases are exact wire values. Approximate or
  computed matching is the resolver's (`onMiss`) job.
- **Not a fidelity downgrade.** An enum with aliases can still be `Iso` on its
  canonical domain ⇄ canonical-wire core; aliases only widen the *accepted* decode
  input, not the round-trip guarantee.

### 5.4 Interaction with the collision diagnostic

Declaring an alias is you asserting "I know this collides on the domain side, on
purpose." The diagnostic is therefore suppressed **only for declared alias pairs** —
never globally. Every *undeclared* domain-side duplicate among primaries still
throws. This is the design keeping the diagnostic loud for mistakes and silent for
intent, without ever offering a "just turn off the check" flag (which would violate
P2/P3).

---

## 6. Combinators

| Combinator | Purpose | Notes |
|---|---|---|
| `iso({decode, encode})` | leaf, two pure inverse fns | tier inferred/annotated |
| `Enum(entries, opts)` | discrete key↔value map | entries, not object literal (numeric-key stringification footgun); `aliases`, `onCollision`, `onMiss` |
| `Struct({ key: Field(...) })` | struct with rename + per-field codec | exposes `validate`; encode output type drops `encode:"omit"` fields |
| `Field(wireKey, codec, opts)` | 1:1 field wire↔domain | `encode: "omit" \| "omit-if"` |
| `Group(wireKeys[], codec)` | **N wire fields ↔ 1 domain field** | checkbox-group↔enum; §DOGFOOD G5 |
| `List(codec)` / `Tuple(...)` | collections | accumulate per-index in `validate` |
| `Nullable(codec)` | `null`/absent handling | `null`↔`undefined` normalization |
| `pipe(a, b, …)` | compose codecs | preserves the **weakest** fidelity tier (Iso∘Lossy = Lossy), **intersects** child `Ctx` (§4.3), and threads `path` through nested errors |

---

## 7. Open questions (carried into implementation)

1. **Path threading through `pipe`.** Nested error paths must stay accurate through
   composed/renamed codecs. Mechanism TBD.
2. **`Lossy` detection.** Can't auto-detect precision loss for arbitrary math at
   creation. Provide an *optional* `assertRoundTrip(samples)` test helper rather than
   overpromising a creation diagnostic. (DOGFOOD G3.)
3. **`Contextual` ergonomics.** Per-call `ctx` arg vs `.bind(ctx)` instance — support
   both? Does `pipe` propagate `Ctx`?
4. **Async codecs?** Entity lookup (`<select>`↔entity) may be async in reality. Out of
   scope for v1, but the `Contextual` shape should not preclude an async variant later.
