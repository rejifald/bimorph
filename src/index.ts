/**
 * bimorph prototype.
 *
 * Purpose: prove the two type-level claims from docs/DESIGN.md hold in real TS:
 *   1. Enum alias-narrowing — decode input is the WIDE union (primaries + aliases),
 *      encode output is the NARROW union (primaries only).
 *   2. contextual codecs — `Ctx` third param, optional-trailing-arg door signatures,
 *      `.bind()` context-erasure, and context INTERSECTION through `Struct`.
 *   plus: `Partial` fidelity removes the throwing door at the type level.
 *
 * Runtime is intentionally minimal; the types are the deliverable.
 */

// ---------------------------------------------------------------------------
// Result & errors
// ---------------------------------------------------------------------------

export type Result<A, E = DecodeError> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: E };

export interface DecodeError {
  /** Where the failure happened: `""` for a leaf, `"address.city"` or `"items[2].name"` inside a composite. */
  readonly path: string;
  /** What kind of failure it was — the stable code a thrown `BimorphError` carries, keyed to the Errors & pitfalls docs. */
  readonly code: "miss" | "ambiguous" | "lossy" | "malformed" | "collision";
  /** The value that failed to map, for diagnostics. */
  readonly input: unknown;
  /** A human-readable description of the failure. */
  readonly message: string;
}

/**
 * Accumulated decode failures, keyed by path (`"shipping.postalCode"`, `"[2].name"`).
 * The `validate` door (composites only) returns this instead of failing fast — it maps
 * straight onto form libraries, which key errors by field path.
 */
export type ErrorTree = { readonly [path: string]: DecodeError };

export class BimorphError extends Error {
  constructor(readonly detail: DecodeError) {
    super(detail.message);
    this.name = "BimorphError";
  }
}

function toErr(e: unknown, input: unknown): DecodeError {
  if (e instanceof BimorphError) return e.detail;
  return {
    path: "",
    code: "malformed",
    input,
    message: e instanceof Error ? e.message : String(e),
  };
}

/**
 * Prefix a structural segment onto a child error's path. Object field keys and
 * array indices (`"[3]"`) both flow through here so nested paths read like
 * `"address.city"` and `"items[2].postalCode"`.
 */
function prefixPath(seg: string, childPath: string): string {
  if (childPath === "") return seg;
  return childPath.startsWith("[") ? seg + childPath : seg + "." + childPath;
}

/**
 * Re-home a thrown child error under `seg`, prefixing its path. Re-thrown as a
 * `BimorphError` so an outer composite can prefix again — that recursion is what
 * builds a full `"a.b.c"` path from leaves that only know `path: ""`.
 */
function prefixError(seg: string, e: unknown, input: unknown): BimorphError {
  const detail = toErr(e, input);
  return new BimorphError({ ...detail, path: prefixPath(seg, detail.path) });
}

// ---------------------------------------------------------------------------
// Codec type — two axes: fidelity tier (F) and context requirement (Ctx)
// ---------------------------------------------------------------------------

export type Fidelity = "iso" | "lossy" | "partial";

/**
 * Optional trailing context argument. Present only when `Ctx` is a real type —
 * absent for `void` (no context) and for `unknown` (an all-context-free composite,
 * see FieldsCtx). This is what makes `decode(b)` a *type error* on a contextual codec
 * while staying `decode(b)` on a plain one.
 */
export type CtxArg<Ctx> = [Ctx] extends [void]
  ? []
  : unknown extends Ctx
    ? []
    : [ctx: Ctx];

interface SafeDoors<A, BIn, BOut, Ctx, F extends Fidelity> {
  readonly fidelity: F;
  safeDecode(b: BIn, ...c: CtxArg<Ctx>): Result<A>;
  safeEncode(a: A, ...c: CtxArg<Ctx>): Result<BOut>;
  decodeOr(b: BIn, fallback: A, ...c: CtxArg<Ctx>): A;
  encodeOr(a: A, fallback: BOut, ...c: CtxArg<Ctx>): BOut;
  /** Erase the context, yielding an ordinary (composable) codec. */
  bind(ctx: Ctx): CodecFull<A, BIn, BOut, void, F>;
}

interface DecodeThrow<A, BIn, Ctx> {
  decode(b: BIn, ...c: CtxArg<Ctx>): A;
}
interface EncodeThrow<A, BOut, Ctx> {
  encode(a: A, ...c: CtxArg<Ctx>): BOut;
}

/**
 * The accumulation door — present only on composites (`Struct`/`List`/`Tuple`), never
 * on leaves (a leaf has one thing to fail, nothing to accumulate). Decode-only: it
 * collects every failing path into an `ErrorTree` instead of failing fast on the first.
 */
export interface ValidateDoor<A, BIn, Ctx> {
  validate(b: BIn, ...c: CtxArg<Ctx>): Result<A, ErrorTree>;
}

/**
 * Full codec shape with distinct decode-input (`BIn`) and encode-output (`BOut`) —
 * that split is what lets alias-narrowing be expressed. `Partial` fidelity removes
 * the throwing *decode* door (decode is the guesswork direction, per DESIGN §4.1);
 * the clean `encode` throwing door stays, and `safe*` always exist. `unknown` is the
 * intersection identity, so the removed branch adds nothing.
 */
export type CodecFull<
  A,
  BIn,
  BOut,
  Ctx = void,
  F extends Fidelity = "iso",
> = SafeDoors<A, BIn, BOut, Ctx, F> &
  EncodeThrow<A, BOut, Ctx> &
  (F extends "partial" ? unknown : DecodeThrow<A, BIn, Ctx>);

/** The common symmetric case: decode input === encode output. */
export type Codec<A, B, Ctx = void, F extends Fidelity = "iso"> = CodecFull<
  A,
  B,
  B,
  Ctx,
  F
>;

// ---------------------------------------------------------------------------
// Codec factory (runtime always carries every door; types hide what shouldn't exist)
// ---------------------------------------------------------------------------

function makeCodec(
  fidelity: Fidelity,
  decodeFn: (b: any, ctx: any) => any,
  encodeFn: (a: any, ctx: any) => any,
  safeDecodeFn: (b: any, ctx: any) => Result<any>,
  validateFn?: (b: any, ctx: any) => Result<any, ErrorTree>,
): any {
  const self: any = {
    fidelity,
    decode: (b: any, ctx: any) => decodeFn(b, ctx),
    encode: (a: any, ctx: any) => encodeFn(a, ctx),
    safeDecode: (b: any, ctx: any) => safeDecodeFn(b, ctx),
    safeEncode: (a: any, ctx: any): Result<any> => {
      try {
        return { ok: true, value: encodeFn(a, ctx) };
      } catch (e) {
        return { ok: false, error: toErr(e, a) };
      }
    },
    decodeOr: (b: any, fallback: any, ctx: any) => {
      const r = safeDecodeFn(b, ctx);
      return r.ok ? r.value : fallback;
    },
    encodeOr: (a: any, fallback: any, ctx: any) => {
      try {
        return encodeFn(a, ctx);
      } catch {
        return fallback;
      }
    },
    bind: (ctx: any) =>
      makeCodec(
        fidelity,
        (b: any) => decodeFn(b, ctx),
        (a: any) => encodeFn(a, ctx),
        (b: any) => safeDecodeFn(b, ctx),
        validateFn ? (b: any) => validateFn(b, ctx) : undefined,
      ),
  };
  if (validateFn) self.validate = (b: any, ctx: any) => validateFn(b, ctx);
  return self;
}

/**
 * Accumulate a child's failures into a parent `ErrorTree`, prefixing `seg` onto each
 * path. If the child is itself a composite it exposes `validate` (recursive
 * accumulation); otherwise `safeDecode` yields its single fail-fast error.
 */
function accumulateChild(
  codec: any,
  value: any,
  ctx: any,
  seg: string,
  out: Record<string, DecodeError>,
): { ok: boolean; value?: any } {
  if (typeof codec.validate === "function") {
    const r = codec.validate(value, ctx) as Result<any, ErrorTree>;
    if (r.ok) return { ok: true, value: r.value };
    for (const [p, e] of Object.entries(r.error)) {
      const np = prefixPath(seg, p);
      out[np] = { ...e, path: np };
    }
    return { ok: false };
  }
  const r = codec.safeDecode(value, ctx) as Result<any>;
  if (r.ok) return { ok: true, value: r.value };
  const np = prefixPath(seg, r.error.path);
  out[np] = { ...r.error, path: np };
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Leaf constructors: iso / lossy / partial
// ---------------------------------------------------------------------------

export function iso<A, B, Ctx = void>(spec: {
  decode: (b: B, ctx: Ctx) => A;
  encode: (a: A, ctx: Ctx) => B;
}): Codec<A, B, Ctx, "iso"> {
  return makeCodec("iso", spec.decode, spec.encode, (b, ctx) => {
    try {
      return { ok: true, value: spec.decode(b, ctx) };
    } catch (e) {
      return { ok: false, error: toErr(e, b) };
    }
  }) as Codec<A, B, Ctx, "iso">;
}

export function lossy<A, B, Ctx = void>(spec: {
  decode: (b: B, ctx: Ctx) => A;
  encode: (a: A, ctx: Ctx) => B;
}): Codec<A, B, Ctx, "lossy"> {
  return makeCodec("lossy", spec.decode, spec.encode, (b, ctx) => {
    try {
      return { ok: true, value: spec.decode(b, ctx) };
    } catch (e) {
      return { ok: false, error: toErr(e, b) };
    }
  }) as Codec<A, B, Ctx, "lossy">;
}

export function partial<A, B, Ctx = void>(spec: {
  /** Decode may fail on otherwise-valid input, so it returns a Result. */
  decode: (b: B, ctx: Ctx) => Result<A>;
  encode: (a: A, ctx: Ctx) => B;
}): Codec<A, B, Ctx, "partial"> {
  const throwingDecode = (b: B, ctx: Ctx): A => {
    const r = spec.decode(b, ctx);
    if (r.ok) return r.value;
    throw new BimorphError(r.error);
  };
  return makeCodec(
    "partial",
    throwingDecode,
    spec.encode,
    spec.decode as (b: any, ctx: any) => Result<any>,
  ) as Codec<A, B, Ctx, "partial">;
}

// ---------------------------------------------------------------------------
// Resolver — the recovery primitive behind `recover` (reconcile presets desugar to it)
// ---------------------------------------------------------------------------

/** What a resolver receives to recover a failed mapping — or re-raise the standard error. */
export interface ResolveContext<In, Out, Ctx = void> {
  readonly direction: "decode" | "encode";
  readonly input: In;
  readonly reason: "miss" | "ambiguous" | "lossy";
  /** Populated when the failure is ambiguity (more than one candidate). */
  readonly candidates?: readonly Out[];
  /** Runtime context, if the codec is contextual; otherwise `undefined`. */
  readonly ctx: Ctx;
  /** Give up and fail with the standard error. */
  raise(): never;
}

/** The primitive all recovery presets desugar to: per-value, typed to the target. */
export type Resolver<In, Out, Ctx = void> = (c: ResolveContext<In, Out, Ctx>) => Out;

/**
 * Creation-time policy electing the canonical wire when two primary entries share a
 * domain value (ambiguous encode). `first-wins`/`last-wins` bake the choice now; a
 * function picks per collision; `throw` (default) keeps the diagnostic loud. The losing
 * wire still *decodes* to the domain value — it becomes an implicit alias.
 *
 * Miss recovery is not here: it splits into a static `default` value and a `recover`
 * slot (`"throw"` shorthand or a resolver). Omit both for the closed-union default,
 * which rejects an out-of-map value at compile time.
 */
export type Reconcile<Domain> =
  | "throw"
  | "first-wins"
  | "last-wins"
  | ((domain: Domain, wires: readonly PropertyKey[]) => PropertyKey);

/** Widen a union of literal keys to their primitive base(s). */
export type WidenWire<T> =
  | (T extends string ? string : never)
  | (T extends number ? number : never)
  | (T extends symbol ? symbol : never);

// ---------------------------------------------------------------------------
// Enum — discrete map: alias-narrowing, default/recover on miss, reconcile on collision
// ---------------------------------------------------------------------------

// Overload A — no recovery: decode input is the CLOSED union (primary | alias wire),
// so an unmapped value is a compile error.
export function Enum<
  const E extends readonly (readonly [PropertyKey, unknown])[],
  const AL extends readonly (readonly [PropertyKey, E[number][1]])[] = readonly [],
>(
  entries: E,
  opts?: {
    readonly aliases?: AL;
    readonly reconcile?: Reconcile<E[number][1]>;
  },
): CodecFull<
  E[number][1],
  E[number][0] | AL[number][0],
  E[number][0],
  void,
  "iso"
>;
// Overload B — a static `default`: decode input WIDENS to the wire's primitive base,
// since the point of a default is to accept values not in the map (they become it).
export function Enum<
  const E extends readonly (readonly [PropertyKey, unknown])[],
  const AL extends readonly (readonly [PropertyKey, E[number][1]])[] = readonly [],
>(
  entries: E,
  opts: {
    readonly aliases?: AL;
    readonly default: E[number][1];
    readonly reconcile?: Reconcile<E[number][1]>;
  },
): CodecFull<
  E[number][1],
  WidenWire<E[number][0] | AL[number][0]>,
  E[number][0],
  void,
  "iso"
>;
// Overload C — `recover`: widened input, either the `"throw"` shorthand (re-raise) or a
// resolver, optionally contextual (a resolver typed with `ctx` makes decode require it).
// The resolver is a bare type so its return literal stays contextually typed to the domain.
export function Enum<
  const E extends readonly (readonly [PropertyKey, unknown])[],
  const AL extends readonly (readonly [PropertyKey, E[number][1]])[] = readonly [],
  Ctx = void,
>(
  entries: E,
  opts: {
    readonly aliases?: AL;
    readonly recover: "throw" | Resolver<WidenWire<E[number][0] | AL[number][0]>, E[number][1], Ctx>;
    readonly reconcile?: Reconcile<E[number][1]>;
  },
): CodecFull<
  E[number][1],
  WidenWire<E[number][0] | AL[number][0]>,
  E[number][0],
  Ctx,
  "iso"
>;
export function Enum(
  entries: readonly (readonly [PropertyKey, unknown])[],
  opts?: {
    readonly aliases?: readonly (readonly [PropertyKey, unknown])[];
    readonly default?: unknown;
    readonly recover?: "throw" | Resolver<any, any, any>;
    readonly reconcile?: Reconcile<any>;
  },
): any {
  const decodeMap = new Map<PropertyKey, unknown>();
  const encodeMap = new Map<unknown, PropertyKey>();
  const reconcile = opts?.reconcile ?? "throw";

  const ambiguousDecode = (wire: PropertyKey): BimorphError =>
    new BimorphError({
      path: "",
      code: "ambiguous",
      input: wire,
      message: `wire ${String(wire)} decodes to two different domain values`,
    });

  for (const [wire, domain] of entries) {
    if (decodeMap.has(wire) && decodeMap.get(wire) !== domain) throw ambiguousDecode(wire);
    decodeMap.set(wire, domain);

    if (!encodeMap.has(domain)) {
      encodeMap.set(domain, wire);
    } else if (reconcile === "throw") {
      throw new BimorphError({
        path: "",
        code: "collision",
        input: domain,
        message: `duplicate domain value ${String(domain)} — set reconcile, or declare one wire as an alias`,
      });
    } else if (reconcile === "last-wins") {
      encodeMap.set(domain, wire);
    } else if (typeof reconcile === "function") {
      encodeMap.set(domain, reconcile(domain as any, [encodeMap.get(domain)!, wire]));
    }
    // "first-wins": keep the existing encode target; the new wire still decodes.
  }

  for (const [wire, domain] of opts?.aliases ?? []) {
    if (decodeMap.has(wire) && decodeMap.get(wire) !== domain) throw ambiguousDecode(wire);
    // decode-only: aliases populate the decode map but NOT the encode map.
    decodeMap.set(wire, domain);
  }

  const recover = opts?.recover;
  const hasDefault = !!opts && "default" in opts;
  const defaultValue = opts?.default;
  const missError = (input: unknown, direction: "decode" | "encode"): DecodeError => ({
    path: "",
    code: "miss",
    input,
    message:
      direction === "decode"
        ? `no mapping for wire ${String(input)}`
        : `no canonical wire for domain value ${String(input)}`,
  });

  const decodeFn = (b: PropertyKey, ctx: any): unknown => {
    if (decodeMap.has(b)) return decodeMap.get(b);
    if (recover === "throw") throw new BimorphError(missError(b, "decode"));
    if (typeof recover === "function") {
      return recover({
        direction: "decode",
        input: b as any,
        reason: "miss",
        ctx,
        raise() {
          throw new BimorphError(missError(b, "decode"));
        },
      });
    }
    if (hasDefault) return defaultValue;
    throw new BimorphError(missError(b, "decode"));
  };
  const encodeFn = (a: unknown): PropertyKey => {
    if (!encodeMap.has(a)) throw new BimorphError(missError(a, "encode"));
    return encodeMap.get(a)!;
  };

  return makeCodec("iso", decodeFn, encodeFn, (b, ctx) => {
    try {
      return { ok: true, value: decodeFn(b, ctx) };
    } catch (e) {
      return { ok: false, error: toErr(e, b) };
    }
  });
}

// ---------------------------------------------------------------------------
// Struct / Field — struct mapping with rename, encode-omit, and Ctx intersection
// ---------------------------------------------------------------------------

/** How a field participates in encode output. */
export type OmitMode = "no" | "always" | "if";

export interface Field<
  WK extends string,
  A,
  BIn,
  BOut,
  Ctx,
  F extends Fidelity,
  OmitEnc extends OmitMode,
> {
  readonly wireKey: WK;
  readonly codec: CodecFull<A, BIn, BOut, Ctx, F>;
  readonly omit: OmitEnc;
  /** Predicate for `omit: "if"` — encode drops the field when it returns true. */
  readonly omitWhen?: (a: A) => boolean;
}

type AnyField = Field<string, any, any, any, any, Fidelity, OmitMode>;

/**
 * N wire fields ↔ 1 domain field. The inner codec maps the *sub-object* of the grouped
 * wire keys ↔ the single domain value (e.g. three booleans `{public,private,unlisted}`
 * ↔ a `visibility` enum). Placed in `Struct` like a field, but contributes all its wire
 * keys to the composite wire shape.
 */
export interface GroupField<WK extends string, A, BSub, Ctx, F extends Fidelity> {
  readonly _group: true;
  readonly wireKeys: readonly WK[];
  readonly codec: CodecFull<A, BSub, BSub, Ctx, F>;
}

type AnyGroupField = GroupField<string, any, any, any, Fidelity>;
type AnyFieldLike = AnyField | AnyGroupField;

/** Flatten an intersection of object types into a single object type (nicer hovers). */
type Simplify<T> = { [K in keyof T]: T[K] };

/**
 * `encode: "omit"` drops the field unconditionally (read-only wire fields), so it
 * vanishes from the wire-out type. `encode: "omit-if"` drops it only when `when(value)`
 * holds — e.g. drop `page=1` defaults from a URL — so the field stays *optional* in the
 * wire-out type. Overloaded so `when`'s parameter is contextually typed to the field's
 * domain value `A`.
 */
export function Field<WK extends string, A, BIn, BOut, Ctx, F extends Fidelity>(
  wireKey: WK,
  codec: CodecFull<A, BIn, BOut, Ctx, F>,
): Field<WK, A, BIn, BOut, Ctx, F, "no">;
export function Field<WK extends string, A, BIn, BOut, Ctx, F extends Fidelity>(
  wireKey: WK,
  codec: CodecFull<A, BIn, BOut, Ctx, F>,
  opts: { readonly encode: "omit" },
): Field<WK, A, BIn, BOut, Ctx, F, "always">;
export function Field<WK extends string, A, BIn, BOut, Ctx, F extends Fidelity>(
  wireKey: WK,
  codec: CodecFull<A, BIn, BOut, Ctx, F>,
  opts: { readonly encode: "omit-if"; readonly when: (a: A) => boolean },
): Field<WK, A, BIn, BOut, Ctx, F, "if">;
export function Field(
  wireKey: string,
  codec: CodecFull<any, any, any, any, Fidelity>,
  opts?: { readonly encode?: "omit" | "omit-if"; readonly when?: (a: any) => boolean },
): AnyField {
  const mode: OmitMode =
    opts?.encode === "omit-if" ? "if" : opts?.encode === "omit" ? "always" : "no";
  return { wireKey, codec, omit: mode, omitWhen: opts?.when };
}

/**
 * Collapse N wire fields into one domain field (Gap 5 / scenario B4). The inner codec
 * maps the sub-object of the grouped wire keys ↔ the single domain value; invalid Side-B
 * states (all-false, two-true) that no creation diagnostic can catch are the codec's job
 * (a resolver or `partial` decode).
 */
export function Group<
  const WK extends readonly string[],
  A,
  BSub extends Record<WK[number], unknown>,
  Ctx = void,
  F extends Fidelity = "iso",
>(
  wireKeys: WK,
  codec: CodecFull<A, BSub, BSub, Ctx, F>,
): GroupField<WK[number], A, BSub, Ctx, F> {
  return { _group: true, wireKeys, codec };
}

type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

// --- Per-entry extraction: each helper handles a Field OR a GroupField. -------

type EntryDomain<Fdef> = Fdef extends Field<any, infer A, any, any, any, any, any>
  ? A
  : Fdef extends GroupField<any, infer A, any, any, any>
    ? A
    : never;

type EntryCtx<Fdef> = Fdef extends Field<any, any, any, any, infer C, any, any>
  ? [C] extends [void]
    ? never
    : C
  : Fdef extends GroupField<any, any, any, infer C, any>
    ? [C] extends [void]
      ? never
      : C
    : never;

type EntryFidelity<Fdef> = Fdef extends Field<any, any, any, any, any, infer F, any>
  ? F
  : Fdef extends GroupField<any, any, any, any, infer F>
    ? F
    : never;

/** Wire-in contribution: one key for a Field, the whole sub-object for a GroupField. */
type EntryWireIn<Fdef> = Fdef extends Field<infer WK, any, infer BIn, any, any, any, any>
  ? { [P in WK]: BIn }
  : Fdef extends GroupField<any, any, infer BSub, any, any>
    ? BSub
    : {};

/** Required wire-out contribution: `omit:"no"` fields and groups; `{}` otherwise. */
type EntryWireOutReq<Fdef> = Fdef extends Field<
  infer WK,
  any,
  any,
  infer BOut,
  any,
  any,
  infer O
>
  ? O extends "no"
    ? { [P in WK]: BOut }
    : {}
  : Fdef extends GroupField<any, any, infer BSub, any, any>
    ? BSub
    : {};

/** Optional wire-out contribution: `omit:"if"` fields become optional keys. */
type EntryWireOutOpt<Fdef> = Fdef extends Field<
  infer WK,
  any,
  any,
  infer BOut,
  any,
  any,
  infer O
>
  ? O extends "if"
    ? { [P in WK]?: BOut }
    : {}
  : {};

type DomainOf<Fields extends Record<string, AnyFieldLike>> = {
  [K in keyof Fields]: EntryDomain<Fields[K]>;
};

/** Intersection of every non-void field/group context; `unknown` when there are none. */
type FieldsCtx<Fields extends Record<string, AnyFieldLike>> = UnionToIntersection<
  { [K in keyof Fields]: EntryCtx<Fields[K]> }[keyof Fields]
>;

/** Wire shape for decode: merge of every entry's wire-in contribution. */
type WireIn<Fields extends Record<string, AnyFieldLike>> = Simplify<
  UnionToIntersection<{ [K in keyof Fields]: EntryWireIn<Fields[K]> }[keyof Fields]>
>;

/**
 * Wire shape for encode: merge of every entry's contribution. `omit:"always"` fields
 * contribute nothing; `omit:"if"` fields contribute an *optional* key; groups contribute
 * their whole sub-object.
 */
type WireOut<Fields extends Record<string, AnyFieldLike>> = Simplify<
  UnionToIntersection<{ [K in keyof Fields]: EntryWireOutReq<Fields[K]> }[keyof Fields]> &
    UnionToIntersection<{ [K in keyof Fields]: EntryWireOutOpt<Fields[K]> }[keyof Fields]>
>;

type FieldsFidelity<Fields extends Record<string, AnyFieldLike>> = {
  [K in keyof Fields]: EntryFidelity<Fields[K]>;
}[keyof Fields] extends infer U
  ? "partial" extends U
    ? "partial"
    : "lossy" extends U
      ? "lossy"
      : "iso"
  : never;

const isGroup = (f: AnyFieldLike): f is AnyGroupField =>
  (f as AnyGroupField)._group === true;

/** Gather a group's wire keys out of the parent wire into its sub-object. */
function pickSub(wire: any, wireKeys: readonly string[]): any {
  const sub: any = {};
  for (const k of wireKeys) sub[k] = wire?.[k];
  return sub;
}

export function Struct<Fields extends Record<string, AnyFieldLike>>(
  fields: Fields,
): CodecFull<
  DomainOf<Fields>,
  WireIn<Fields>,
  WireOut<Fields>,
  FieldsCtx<Fields>,
  FieldsFidelity<Fields>
> &
  ValidateDoor<DomainOf<Fields>, WireIn<Fields>, FieldsCtx<Fields>> {
  const entries = Object.entries(fields) as [string, AnyFieldLike][];

  const decodeFn = (wire: any, ctx: any): any => {
    const out: any = {};
    for (const [domainKey, f] of entries) {
      const input = isGroup(f) ? pickSub(wire, f.wireKeys) : wire?.[f.wireKey];
      try {
        out[domainKey] = (f.codec as any).decode(input, ctx);
      } catch (e) {
        throw prefixError(domainKey, e, input);
      }
    }
    return out;
  };
  const encodeFn = (dom: any, ctx: any): any => {
    const out: any = {};
    for (const [domainKey, f] of entries) {
      if (!isGroup(f)) {
        if (f.omit === "always") continue;
        if (f.omit === "if" && f.omitWhen?.(dom[domainKey])) continue;
      }
      try {
        if (isGroup(f)) {
          Object.assign(out, (f.codec as any).encode(dom[domainKey], ctx));
        } else {
          out[f.wireKey] = (f.codec as any).encode(dom[domainKey], ctx);
        }
      } catch (e) {
        throw prefixError(domainKey, e, dom?.[domainKey]);
      }
    }
    return out;
  };
  const safeDecodeFn = (wire: any, ctx: any): Result<any> => {
    try {
      return { ok: true, value: decodeFn(wire, ctx) };
    } catch (e) {
      return { ok: false, error: toErr(e, wire) };
    }
  };
  const validateFn = (wire: any, ctx: any): Result<any, ErrorTree> => {
    const out: any = {};
    const errors: Record<string, DecodeError> = {};
    for (const [domainKey, f] of entries) {
      const input = isGroup(f) ? pickSub(wire, f.wireKeys) : wire?.[f.wireKey];
      const r = accumulateChild(f.codec, input, ctx, domainKey, errors);
      if (r.ok) out[domainKey] = r.value;
    }
    return Object.keys(errors).length
      ? { ok: false, error: errors }
      : { ok: true, value: out };
  };

  const fid: Fidelity = entries.some(([, f]) => f.codec.fidelity === "partial")
    ? "partial"
    : entries.some(([, f]) => f.codec.fidelity === "lossy")
      ? "lossy"
      : "iso";

  return makeCodec(fid, decodeFn, encodeFn, safeDecodeFn, validateFn);
}

// ---------------------------------------------------------------------------
// pipe — compose two codecs, weakening fidelity and intersecting context
// ---------------------------------------------------------------------------

type Weakest<F1 extends Fidelity, F2 extends Fidelity> = "partial" extends
  | F1
  | F2
  ? "partial"
  : "lossy" extends F1 | F2
    ? "lossy"
    : "iso";

type MergeCtx<C1, C2> = [C1] extends [void]
  ? C2
  : [C2] extends [void]
    ? C1
    : C1 & C2;

/**
 * pipe(a, b): `a` maps wire `BIn`/`BOut` ↔ mid `M`, `b` maps mid `M` ↔ domain `A`.
 * decode flows BIn → M → A; encode flows A → M → BOut.
 * Result fidelity is the *weaker* of the two; result context is the *intersection*.
 *
 * `a` (the wire-facing codec) may be **asymmetric** — a wide decode input and a narrow
 * encode output, as produced by an aliased `Enum` — and that split propagates to the
 * composed codec's `BIn`/`BOut` instead of collapsing to one type. The mid `M` is `a`'s
 * domain and `b`'s wire, kept symmetric; piping *into* a wire-asymmetric `b` (e.g. an
 * `encode:"omit"` Struct) is intentionally a type error rather than a silent collapse.
 */
export function pipe<
  A,
  M,
  BIn,
  BOut,
  C1,
  C2,
  F1 extends Fidelity,
  F2 extends Fidelity,
>(
  a: CodecFull<M, BIn, BOut, C1, F1>,
  b: CodecFull<A, M, M, C2, F2>,
): CodecFull<A, BIn, BOut, MergeCtx<C1, C2>, Weakest<F1, F2>> {
  const av = a as any;
  const bv = b as any;
  const fid: Fidelity =
    av.fidelity === "partial" || bv.fidelity === "partial"
      ? "partial"
      : av.fidelity === "lossy" || bv.fidelity === "lossy"
        ? "lossy"
        : "iso";

  const decodeFn = (x: any, ctx: any) => bv.decode(av.decode(x, ctx), ctx);
  const encodeFn = (x: any, ctx: any) => av.encode(bv.encode(x, ctx), ctx);
  const safeDecodeFn = (x: any, ctx: any): Result<any> => {
    const r1 = av.safeDecode(x, ctx);
    if (!r1.ok) return r1;
    return bv.safeDecode(r1.value, ctx);
  };

  return makeCodec(fid, decodeFn, encodeFn, safeDecodeFn) as CodecFull<
    A,
    BIn,
    BOut,
    MergeCtx<C1, C2>,
    Weakest<F1, F2>
  >;
}

// ---------------------------------------------------------------------------
// Nullable — null/absent <-> undefined normalization
// ---------------------------------------------------------------------------

/**
 * Wrap a codec so a `null` or absent wire value decodes to `undefined`, and an
 * `undefined` domain value encodes back to `null`. Fidelity and context pass through.
 */
export function Nullable<A, BIn, BOut, Ctx, F extends Fidelity>(
  codec: CodecFull<A, BIn, BOut, Ctx, F>,
): CodecFull<A | undefined, BIn | null | undefined, BOut | null, Ctx, F> {
  const c = codec as any;
  const empty = (b: any) => b === null || b === undefined;
  const decodeFn = (b: any, ctx: any) => (empty(b) ? undefined : c.decode(b, ctx));
  const encodeFn = (a: any, ctx: any) => (a === undefined ? null : c.encode(a, ctx));
  const safeDecodeFn = (b: any, ctx: any): Result<any> =>
    empty(b) ? { ok: true, value: undefined } : c.safeDecode(b, ctx);
  return makeCodec(c.fidelity, decodeFn, encodeFn, safeDecodeFn) as any;
}

// ---------------------------------------------------------------------------
// List / Tuple — collections with per-index path segments
// ---------------------------------------------------------------------------

/** Homogeneous list: each element runs through `codec`; errors carry a `[i]` segment. */
export function List<A, BIn, BOut, Ctx, F extends Fidelity>(
  codec: CodecFull<A, BIn, BOut, Ctx, F>,
): CodecFull<A[], BIn[], BOut[], Ctx, F> & ValidateDoor<A[], BIn[], Ctx> {
  const c = codec as any;
  const decodeFn = (arr: any[], ctx: any) =>
    arr.map((el, i) => {
      try {
        return c.decode(el, ctx);
      } catch (e) {
        throw prefixError(`[${i}]`, e, el);
      }
    });
  const encodeFn = (arr: any[], ctx: any) =>
    arr.map((el, i) => {
      try {
        return c.encode(el, ctx);
      } catch (e) {
        throw prefixError(`[${i}]`, e, el);
      }
    });
  const safeDecodeFn = (arr: any, ctx: any): Result<any> => {
    try {
      return { ok: true, value: decodeFn(arr, ctx) };
    } catch (e) {
      return { ok: false, error: toErr(e, arr) };
    }
  };
  const validateFn = (arr: any[], ctx: any): Result<any, ErrorTree> => {
    const out: any[] = [];
    const errors: Record<string, DecodeError> = {};
    arr.forEach((el, i) => {
      const r = accumulateChild(c, el, ctx, `[${i}]`, errors);
      if (r.ok) out[i] = r.value;
    });
    return Object.keys(errors).length
      ? { ok: false, error: errors }
      : { ok: true, value: out };
  };
  return makeCodec(c.fidelity, decodeFn, encodeFn, safeDecodeFn, validateFn) as any;
}

type AnyCodec = CodecFull<any, any, any, any, Fidelity>;

type DomainTuple<C extends readonly AnyCodec[]> = {
  [K in keyof C]: C[K] extends CodecFull<infer A, any, any, any, any> ? A : never;
};
type WireInTuple<C extends readonly AnyCodec[]> = {
  [K in keyof C]: C[K] extends CodecFull<any, infer BIn, any, any, any> ? BIn : never;
};
type WireOutTuple<C extends readonly AnyCodec[]> = {
  [K in keyof C]: C[K] extends CodecFull<any, any, infer BOut, any, any> ? BOut : never;
};
type CtxTuple<C extends readonly AnyCodec[]> = UnionToIntersection<
  {
    [K in keyof C]: C[K] extends CodecFull<any, any, any, infer Ctx, any>
      ? [Ctx] extends [void]
        ? never
        : Ctx
      : never;
  }[number]
>;
type FidelityTuple<C extends readonly AnyCodec[]> = {
  [K in keyof C]: C[K] extends CodecFull<any, any, any, any, infer F> ? F : never;
}[number] extends infer U
  ? "partial" extends U
    ? "partial"
    : "lossy" extends U
      ? "lossy"
      : "iso"
  : never;

/** Fixed-length heterogeneous list: element `i` runs through `codecs[i]`. */
export function Tuple<const C extends readonly AnyCodec[]>(
  ...codecs: C
): CodecFull<
  DomainTuple<C>,
  WireInTuple<C>,
  WireOutTuple<C>,
  CtxTuple<C>,
  FidelityTuple<C>
> &
  ValidateDoor<DomainTuple<C>, WireInTuple<C>, CtxTuple<C>> {
  const cs = codecs as readonly any[];
  const decodeFn = (arr: any[], ctx: any) =>
    cs.map((c, i) => {
      try {
        return c.decode(arr[i], ctx);
      } catch (e) {
        throw prefixError(`[${i}]`, e, arr?.[i]);
      }
    });
  const encodeFn = (arr: any[], ctx: any) =>
    cs.map((c, i) => {
      try {
        return c.encode(arr[i], ctx);
      } catch (e) {
        throw prefixError(`[${i}]`, e, arr?.[i]);
      }
    });
  const safeDecodeFn = (arr: any, ctx: any): Result<any> => {
    try {
      return { ok: true, value: decodeFn(arr, ctx) };
    } catch (e) {
      return { ok: false, error: toErr(e, arr) };
    }
  };
  const validateFn = (arr: any[], ctx: any): Result<any, ErrorTree> => {
    const out: any[] = [];
    const errors: Record<string, DecodeError> = {};
    cs.forEach((c, i) => {
      const r = accumulateChild(c, arr?.[i], ctx, `[${i}]`, errors);
      if (r.ok) out[i] = r.value;
    });
    return Object.keys(errors).length
      ? { ok: false, error: errors }
      : { ok: true, value: out };
  };
  const fid: Fidelity = cs.some((c) => c.fidelity === "partial")
    ? "partial"
    : cs.some((c) => c.fidelity === "lossy")
      ? "lossy"
      : "iso";
  return makeCodec(fid, decodeFn, encodeFn, safeDecodeFn, validateFn) as any;
}

// ---------------------------------------------------------------------------
// assertRoundTrip — test helper: the teeth behind the `lossy` tier
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as any)[k], (b as any)[k]),
  );
}

/**
 * Round-trip each wire sample through `decode` then `encode` and assert the result
 * is structurally equal to the input. This is the *only* enforcement behind the
 * `lossy` tier — precision loss is data-dependent and can't be caught at creation,
 * so it belongs in your test suite. Throws a `BimorphError` (code `"lossy"`) on drift.
 */
export function assertRoundTrip<A, BIn, BOut extends BIn, Ctx, F extends Fidelity>(
  codec: CodecFull<A, BIn, BOut, Ctx, F>,
  samples: readonly BIn[],
  ...ctx: CtxArg<Ctx>
): void {
  const c = codec as any;
  for (const sample of samples) {
    const roundTripped = c.encode(c.decode(sample, ctx[0]), ctx[0]);
    if (!deepEqual(sample, roundTripped)) {
      throw new BimorphError({
        path: "",
        code: "lossy",
        input: sample,
        message: `round-trip drift: ${JSON.stringify(sample)} → ${JSON.stringify(roundTripped)}`,
      });
    }
  }
}
