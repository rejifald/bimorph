// Runtime-behaviour gate. `typecheck` proves the *types*; the docs build (`apps/docs`)
// twoslashes every example. Neither exercises runtime, so guarantees that are runtime
// facts — error `path` threading, encode-omit, null/undefined normalization,
// round-trip drift detection — need their own regression gate. This is it.
//
// The library is TypeScript with a parameter property, which Node's strip-only loader
// rejects, so we transpile it in-memory with the TS compiler and import the result.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

const dir = mkdtempSync(join(tmpdir(), "bimorph-runtime-"));
const modPath = join(dir, "index.mjs");
writeFileSync(modPath, js);
const bm = await import(pathToFileURL(modPath).href);

const {
  iso,
  lossy,
  Enum,
  Struct,
  Field,
  Group,
  Nullable,
  List,
  Tuple,
  pipe,
  assertRoundTrip,
} = bm;

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e?.message ?? e}`);
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label ?? "value"}: got ${a}, want ${b}`);
}
function throws(fn, label) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error(`${label ?? "call"} did not throw`);
}

// --- P0 #1: error path threading ---------------------------------------------

const City = Enum([["NYC", "New York"]]);
const Addr = Struct({ city: Field("city", City) });
const User = Struct({ address: Field("address", Addr) });

check("path: nested object field carries dotted path", () => {
  const r = User.safeDecode({ address: { city: "???" } });
  if (r.ok) throw new Error("expected failure");
  eq(r.error.path, "address.city", "path");
});

check("path: encode direction carries field key", () => {
  const Boom = Struct({
    n: Field("n", iso({ decode: (b) => b, encode: () => { throw new Error("boom"); } })),
  });
  const r = Boom.safeEncode({ n: 1 });
  if (r.ok) throw new Error("expected failure");
  eq(r.error.path, "n", "path");
});

check("path: array element carries [i] segment", () => {
  const Cities = List(City);
  const r = Cities.safeDecode(["NYC", "???"]);
  if (r.ok) throw new Error("expected failure");
  eq(r.error.path, "[1]", "path");
});

check("path: array-of-object composes segments", () => {
  const r = List(Addr).safeDecode([{ city: "NYC" }, { city: "???" }]);
  if (r.ok) throw new Error("expected failure");
  eq(r.error.path, "[1].city", "path");
});

// --- enum aliases (wide decode / narrow encode) ------------------------------

check("enum: alias decodes, encode stays canonical", () => {
  const Status = Enum([["ACTIVE", "active"]], { aliases: [["A", "active"]] });
  eq(Status.decode("A"), "active", "decode alias");
  eq(Status.encode("active"), "ACTIVE", "encode canonical");
});

// --- P0 #2: pipe preserves narrow encode at runtime --------------------------

check("pipe: composed encode emits the canonical wire value", () => {
  const Status = Enum([["ACTIVE", "active"], ["INACTIVE", "inactive"]], {
    aliases: [["A", "active"]],
  });
  const Display = iso({
    decode: (s) => (s === "active" ? "Active" : "Inactive"),
    encode: (d) => (d === "Active" ? "active" : "inactive"),
  });
  const Labelled = pipe(Status, Display);
  eq(Labelled.decode("A"), "Active", "decode alias through pipe");
  eq(Labelled.encode("Active"), "ACTIVE", "encode narrow through pipe");
});

// --- P3 #8: omit / omit-if ---------------------------------------------------

check("omit: read-only field absent from encode output", () => {
  const C = Struct({
    id: Field("id", iso({ decode: (b) => b, encode: (a) => a }), { encode: "omit" }),
    name: Field("name", iso({ decode: (b) => b, encode: (a) => a })),
  });
  eq(C.encode({ id: "x", name: "n" }), { name: "n" }, "encode drops id");
});

check("omit-if: field dropped only when predicate holds", () => {
  const num = iso({ decode: (b) => b, encode: (a) => a });
  const Filter = Struct({
    page: Field("page", num, { encode: "omit-if", when: (v) => v === 1 }),
    sort: Field("sort", num),
  });
  eq(Filter.encode({ page: 1, sort: 9 }), { sort: 9 }, "page=1 dropped");
  eq(Filter.encode({ page: 2, sort: 9 }), { page: 2, sort: 9 }, "page=2 kept");
});

// --- P3 #7: optional ---------------------------------------------------------

check("optional: null/absent -> undefined, undefined -> null", () => {
  const OptCity = Nullable(City);
  eq(OptCity.decode(null), undefined, "null decodes to undefined");
  eq(OptCity.decode("NYC"), "New York", "present decodes normally");
  eq(OptCity.encode(undefined), null, "undefined encodes to null");
  eq(OptCity.encode("New York"), "NYC", "present encodes normally");
});

// --- P2 #4: tuple ------------------------------------------------------------

check("tuple: positional decode/encode", () => {
  const Pair = Tuple(
    iso({ decode: (b) => Number(b), encode: (a) => String(a) }),
    City,
  );
  eq(Pair.decode(["42", "NYC"]), [42, "New York"], "decode");
  eq(Pair.encode([42, "New York"]), ["42", "NYC"], "encode");
});

// --- P3 #6: group (N wire fields ↔ 1 domain field) --------------------------

check("group: N wire booleans collapse to one domain field, and spread back", () => {
  const KEYS = ["public", "private", "unlisted"];
  const Visibility = Group(
    KEYS,
    iso({
      decode: (flags) => KEYS.find((k) => flags[k]) ?? "public",
      encode: (v) => ({ public: v === "public", private: v === "private", unlisted: v === "unlisted" }),
    }),
  );
  const Post = Struct({
    visibility: Visibility,
    title: Field("title", iso({ decode: (b) => b, encode: (a) => a })),
  });
  eq(
    Post.decode({ public: false, private: true, unlisted: false, title: "Hi" }),
    { visibility: "private", title: "Hi" },
    "decode collapses N booleans to one field",
  );
  eq(
    Post.encode({ visibility: "unlisted", title: "Hi" }),
    { public: false, private: false, unlisted: true, title: "Hi" },
    "encode spreads one field back to N booleans",
  );
});

// --- P4 #9: assertRoundTrip --------------------------------------------------

check("assertRoundTrip: clean samples pass", () => {
  const Trip = iso({ decode: (b) => b * 2, encode: (a) => a / 2 });
  assertRoundTrip(Trip, [2, 4, 100]); // clean round-trip → no throw
});

check("assertRoundTrip: round-trip drift throws code=lossy", () => {
  const Trimmed = lossy({ decode: (s) => s.trim(), encode: (c) => c });
  assertRoundTrip(Trimmed, ["clean", "also-clean"]); // clean samples → no throw
  const bad = throws(() => assertRoundTrip(Trimmed, ["  spaced  "]), "drift sample");
  eq(bad.detail?.code, "lossy", "error code");
});

// --- P1 #3: recovery — default / recover / reconcile ------------------------

check("default: substitutes a declared fallback domain value on miss", () => {
  const Status = Enum([["shipped", "Shipped"], ["unknown", "Unknown"]], {
    default: "Unknown",
  });
  eq(Status.decode("shipped"), "Shipped", "known value");
  eq(Status.decode("garbage"), "Unknown", "miss → default");
});

check("recover: receives reason + input, returns a domain value", () => {
  const Status = Enum([["shipped", "Shipped"], ["other", "Other"]], {
    recover: (c) => (c.reason === "miss" ? "Other" : c.raise()),
  });
  eq(Status.decode("weird"), "Other", "resolver value");
});

check("recover: raise() falls back to the standard miss error", () => {
  const Status = Enum([["shipped", "Shipped"]], { recover: (c) => c.raise() });
  const r = Status.safeDecode("nope");
  if (r.ok) throw new Error("expected failure");
  eq(r.error.code, "miss", "error code");
});

check("recover 'throw' shorthand: widens input, throws at runtime on miss", () => {
  const Status = Enum([["shipped", "Shipped"]], { recover: "throw" });
  const r = Status.safeDecode("nope");
  if (r.ok) throw new Error("expected failure");
  eq(r.error.code, "miss", "error code");
});

check("recover: reads runtime ctx to disambiguate", () => {
  const Sym = Enum([["USD", "$"], ["EUR", "€"]], { recover: (c) => c.ctx?.fallback ?? "$" });
  eq(Sym.decode("GBP", { fallback: "€" }), "€", "ctx used by resolver");
});

check("reconcile first-wins: first wire canonical, loser still decodes", () => {
  const HttpErr = Enum([[400, "ValidationError"], [422, "ValidationError"]], {
    reconcile: "first-wins",
  });
  eq(HttpErr.decode(400), "ValidationError", "400 decodes");
  eq(HttpErr.decode(422), "ValidationError", "422 decodes (implicit alias)");
  eq(HttpErr.encode("ValidationError"), 400, "encodes to first");
});

check("reconcile last-wins: last wire becomes canonical", () => {
  const E = Enum([[400, "V"], [422, "V"]], { reconcile: "last-wins" });
  eq(E.encode("V"), 422, "encodes to last");
});

check("reconcile throw (default): domain dup throws at creation", () => {
  const e = throws(() => Enum([[1, "x"], [2, "x"]]), "dup domain");
  eq(e.detail?.code, "collision", "error code");
});

check("ambiguous decode: same wire → two domains throws at creation", () => {
  const e = throws(() => Enum([["k", "A"], ["k", "B"]]), "dup wire");
  eq(e.detail?.code, "ambiguous", "error code");
});

// --- P2 #5: validate — accumulate every failing path ------------------------

check("validate: accumulates every failing field, keyed by path", () => {
  const Person = Struct({
    home: Field("home", City),
    work: Field("work", City),
    name: Field("name", iso({ decode: (b) => b, encode: (a) => a })),
  });
  const r = Person.validate({ home: "???", work: "!!!", name: "ok" });
  if (r.ok) throw new Error("expected failure");
  eq(Object.keys(r.error).sort(), ["home", "work"], "error keys");
  eq(r.error.home.path, "home", "home path");
});

check("validate: recurses into nested composites with dotted paths", () => {
  const User2 = Struct({ a: Field("a", Addr), b: Field("b", Addr) });
  const r = User2.validate({ a: { city: "???" }, b: { city: "!!!" } });
  if (r.ok) throw new Error("expected failure");
  eq(Object.keys(r.error).sort(), ["a.city", "b.city"], "nested keys");
});

check("validate: array accumulates per-index", () => {
  const r = List(City).validate(["NYC", "???", "!!!"]);
  if (r.ok) throw new Error("expected failure");
  eq(Object.keys(r.error).sort(), ["[1]", "[2]"], "index keys");
});

check("validate: returns decoded value on success", () => {
  const P = Struct({ home: Field("home", City) });
  const r = P.validate({ home: "NYC" });
  if (!r.ok) throw new Error("expected success");
  eq(r.value, { home: "New York" }, "decoded value");
});

console.log(`\n${failed ? `${failed} FAILED` : "all runtime checks passed"}`);
process.exit(failed ? 1 : 0);
