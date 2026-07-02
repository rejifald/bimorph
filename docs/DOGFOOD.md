# bimorph — Dogfood pass

Writing the designed-but-unbuilt API against the hardest scenarios from
`SCENARIOS.md`. Goal: find where the design is clean, where it bends, and where it
breaks. Code is illustrative spec, not compiling.

Verdict up front: **the core (enum/iso + resolver + throw/safe/validate doors +
encode-omit) covers ~70% of real scenarios cleanly.** But dogfooding surfaced two
*architectural* gaps and four smaller ones. All are now folded into `DESIGN.md`; this
file is the evidence trail.

---

## Where it just works (validates the design)

**A3 nullable↔optional, D3 gRPC enum, E2 bitmask (simple):** clean `iso`/`Enum`.
Baseline holds.

**A4 / B6 / D5 read-only fields:** `encode: "omit"` is exactly right, and having the
encode output type *structurally drop* the field means a `CreateUserInput` can't
accidentally try to write `id`. This was the cleanest win.

**A5 / B2 / D4 composite decode of untrusted data:** the `validate` door earns its
place immediately — "collect every bad field in the CSV / form / DTO" is a real,
frequent need, and keeping it separate from fail-fast `decode` (P2/P3) is clearly
correct once you see D4 (accumulate per-row across a whole file).

**D3 unknown enum variant, B3 missing id:** `onMiss` resolver + `safeDecode` handle
runtime misses without ceremony.

---

## Gap 1 (architectural): aliases ≠ collisions

**Scenarios: A2, D2, D6, C1, E5, D1.** This is the single most common real shape and
the original design got it *wrong*.

Naive design said: "two keys → same value ⇒ throw at creation." But the most common
real case is **intentional** many-to-one:

```ts
// D2 — every one of these MUST decode to the same flag; only one is written back
"new-search-ui" | "newSearchUI" | "search_ui_v2"  →  FeatureFlag.SearchUiV2
```

Throwing here would punish the *correct* migration pattern. Yet we still want the
diagnostic to catch a *genuine* accidental dupe. Resolution (now in DESIGN §5): a
first-class `aliases` declaration that (a) decodes many→one, (b) is never emitted by
`encode`, (c) suppresses the collision diagnostic **only for the declared pair**. An
undeclared dupe still throws.

```ts
const Status = Enum(
  [[1, "active"], [0, "inactive"]],
  { aliases: [["PENDING", "inactive"], ["AWAITING_PAYMENT", "inactive"]] },
);
Status.decode("PENDING");      // "inactive"
Status.encode("inactive");     // 0  — never "PENDING"
```

Without this, the collision diagnostic is either too loud (fights aliases) or
disabled (misses real bugs). The alias concept is what makes "loud by default"
survivable.

---

## Gap 2 (architectural): the reverse often needs runtime context

**Scenarios: B3, E3, E5, C4, E1.** These break the founding slogan
*"define once → both directions free."* The reverse function needs an argument the
value simply does not contain:

| Scenario | reverse needs |
|---|---|
| B3 `<select>` → entity | the **live entity collection** to look up |
| E3 national phone → E.164 | the **region** (`(415)…` is US-only by assumption) |
| E5 `¥` → ISO 4217 | a **locale** (¥ is JPY *or* CNY) |
| C4 epoch → ISO string | a **target timezone** |
| E1 offset → IANA zone | the **instant** — and *still* many-to-one |

A plain `decode(b): A` cannot express this. The design now carries a `Contextual<A,
B, Ctx>` tier: `decode(b, ctx)` or a bound `.bind(ctx)` instance, with
`decode(b)`-without-ctx being a **type error**. The `ResolveContext.ctx` field
carries it into the resolver.

The blunt lesson from **E1**: sometimes even a `Ctx` can't recover the inverse
(offset→zone is irreducibly many-to-one). That's not a library failure — it's the
library *forcing you to discover, at design time, that the inverse doesn't exist*
rather than shipping a plausible-but-wrong reverse. That is exactly the "tools, not
guarantees / surface it early" principle paying off.

---

## Gap 3: lossy is a type label, not a creation-time catch

**Scenarios: A1, C2, C3, C4, E6.** We can't statically detect that `cents/100`
followed by `Math.round(x*100)` loses precision for BHD (3 decimal places) — it's
data-dependent. Over-promising a creation diagnostic here would be a lie.

Resolution: a `Lossy<A,B>` tier that simply **does not promise** round-trip, plus an
*opt-in* test helper:

```ts
assertRoundTrip(MoneyCodec, [
  { cents: 1999, currency: "USD" },
  { cents: 100,  currency: "BHD" }, // fails loudly here, in a test, where it belongs
]);
```

Detection lives in *your test suite*, not in a magic runtime check. The library's job
is to make the lossiness *visible in the type* so nobody downstream assumes an `Iso`.

---

## Gap 4: one-clean-one-guesswork ⇒ `Partial`, and kill the throwing door

**Scenarios: E4 name-parsing, E6 slug↔title.** `encode` is trivial (concat /
slugify); `decode` is fundamentally guesswork. Throw-by-default is *wrong* here — a
bare `.decode()` implies a reliability that doesn't exist.

Resolution: a `Partial<A,B>` tier where the throwing `decode` is **not on the type at
all** — only `safeDecode`/`validate`. The type forces the caller to acknowledge the
mapping might not recover a valid input. For E6, decode "never throws, always
best-effort" because the DB is the real source of truth and the codec is a
cache-miss fallback — `decodeOr(slug, titleCase(slug))` expresses that in one line.

---

## Gap 5: N↔M field mapping (`Struct`/`Field` isn't enough)

**Scenario: B4.** Three checkbox fields `{public, private, unlisted}` collapse to one
enum `visibility`. `Field("wireKey", codec)` assumes 1:1. Needed a `Group`
combinator:

```ts
const Visibility = Group(
  ["public", "private", "unlisted"],
  iso<"public"|"private"|"unlisted", Record<string, boolean>>({
    decode: (flags) => onlyTrueKey(flags),          // resolver handles all-false / two-true
    encode: (v) => ({ public: v==="public", private: v==="private", unlisted: v==="unlisted" }),
  }),
);
```

B4 also shows invalid Side-B states (all-false, two-true) that no creation diagnostic
can catch — pure runtime, so the resolver / `validate` door is the only answer.

---

## Gap 6: conditional omit (`omit-if-default`)

**Scenario: B1.** `page=1` (the default) must be *absent* from the URL, but `page=2`
present. That's richer than unconditional `encode: "omit"`. Added
`encode: "omit-if", when: (v) => v === default` to `Field`.

---

## Scorecard

| Design feature | Verdict |
|---|---|
| A=domain/B=wire + decode/encode | solid |
| 3 doors (throw/safe/or) | solid |
| `validate` accumulation, composite-only | solid, high-value |
| encode-omit | solid, cleanest win |
| resolver escape hatch | solid — but its `ctx` field is load-bearing (Gap 2) |
| collision diagnostic | **needed rework** → aliases (Gap 1) |
| "define once → both free" | **partly false** → Contextual tier (Gap 2) |
| guarantee-in-the-type | **expanded** to Iso / Lossy / Partial / Contextual (Gaps 3–4) |
| 1:1 field mapping | **incomplete** → `Group` (Gap 5) |

**Bottom line:** the design's *spine* (doors, loud-by-default, resolver, encode-omit,
guarantee-in-the-type) survived contact with reality. What it was missing were the
honest admissions that (1) many-to-one is usually *intentional* and (2) a big class of
inverses need context or are guesswork. Both are now first-class rather than swept
into "well, use the resolver." That is the difference between a library that *helps you
spot* non-invertibility (the stated goal) and one that pretends it away.
