/**
 * bimorph docs — content manifest.
 *
 * The single source of truth for the documentation information architecture.
 * The skeleton generator (`scripts/generate-skeleton.mjs`) reads this to emit
 * the folder tree, each `meta.json` (label + page order), and a stub `.mdx`
 * per page using the template for its `kind`.
 *
 * Invariants:
 *  - Two-way sync: every `.mdx` under `content/docs` is listed here, and every
 *    entry here has a file. No orphan pages, no undocumented pages. This is
 *    bimorph's own thesis — surface a mapping's mismatches instead of letting
 *    them go silent — applied to the docs tree itself.
 *  - `description` is mandatory and is a real sentence — it feeds search,
 *    `llms.txt`, and an agent's relevance decision when the page is pulled as
 *    standalone `llms.mdx`. Never ship a placeholder.
 *  - Error `code`s and their slugs are an API: they are the `DecodeError.code`
 *    a thrown `BimorphError` carries. Once published, never rename a slug — add
 *    a new page and redirect the old one.
 *
 * Page templates and the full rule set live in `AUTHORING.md`.
 */

export type PageKind =
    | 'landing' // curated orientation page (usually a folder index); hand-shaped
    | 'tutorial' // step-by-step (installation, quickstart); hand-shaped
    | 'concept' // explanation — why it's shaped this way
    | 'guide' // how-to — the workhorse template
    | 'reference' // prose + AutoTypeTable
    | 'error'; // errors & pitfalls catalog entry

export interface Section {
    /** Folder path relative to `content/docs`. `''` is the root. */
    path: string;
    /** Sidebar group label — becomes the folder `meta.json` `title`. */
    title: string;
    /** Optional folder-level blurb — becomes the `meta.json` `description`. */
    description?: string;
    /** Optional lucide icon name (the lucide-icons source plugin is enabled). */
    icon?: string;
}

export interface Page {
    /** Path relative to `content/docs`, no extension; folders via `/`. */
    path: string;
    /** `title` frontmatter and sidebar link label. */
    title: string;
    /** Mandatory. A real sentence — see the invariants above. */
    description: string;
    kind: PageKind;
    /** Error pages only: the `DecodeError.code` a thrown error carries. */
    code?: string;
}

/**
 * Sidebar groups, in display order. The generator writes one `meta.json` per
 * entry; the root entry orders the top-level groups.
 *
 * Six top-level groups, ordered for a first read:
 * Getting started → Recipes → Concepts → Guides → Reference → Errors & pitfalls.
 * (StitchAPI's Surfaces / For agents / Integrations groups don't map to a pure
 * data-mapping library, so they're intentionally dropped rather than padded.)
 */
export const sections: Section[] = [
    {
        path: '',
        title: 'Documentation',
        description:
            'Bidirectional data mapping for TypeScript: define a mapping once and get both directions — decode (wire → domain) and encode (domain → wire) — with the reverses that do not invert cleanly surfaced in the type instead of failing silently.',
    },
    { path: 'getting-started', title: 'Getting started', icon: 'Rocket' },
    { path: 'recipes', title: 'Recipes', icon: 'ChefHat' },
    { path: 'concepts', title: 'Concepts', icon: 'Lightbulb' },
    { path: 'guides', title: 'Guides', icon: 'BookOpen' },
    { path: 'guides/leaves', title: 'Leaf codecs' },
    { path: 'guides/enums', title: 'Enumerations' },
    { path: 'guides/composites', title: 'Composites' },
    { path: 'guides/composition', title: 'Composition' },
    { path: 'guides/doors', title: 'Doors' },
    { path: 'guides/context', title: 'Context' },
    { path: 'guides/recovery', title: 'Recovery' },
    { path: 'guides/testing', title: 'Testing' },
    { path: 'reference', title: 'Reference', icon: 'Code' },
    { path: 'errors', title: 'Errors & pitfalls', icon: 'TriangleAlert' },
];

/**
 * Sections whose `meta.json` and page set are curated by hand, NOT generated
 * from this manifest. bimorph has none today; kept for structural parity with
 * the generator, which skips any section listed here.
 */
export const HAND_MAINTAINED_SECTIONS: ReadonlySet<string> = new Set([]);

/**
 * Every page, grouped by section in reading order. The generator preserves this
 * order inside each folder's `meta.json`.
 */
export const pages: Page[] = [
    // ── Root ────────────────────────────────────────────────────────────────
    {
        path: 'index',
        title: 'bimorph',
        description:
            'Define a mapping once and get decode and encode for free — with duplicate values, lossy transforms, read-only fields, and context-dependent reverses surfaced in the type, not hidden.',
        kind: 'landing',
    },
    {
        path: 'contract',
        title: 'Contract: before & after',
        description:
            'A design review of the consumer-facing surface — export-name collisions, the Codec/CodecFull split, optional’s encode, and leaked internal types — with before/after options and a recommendation for each.',
        kind: 'concept',
    },

    // ── Getting started ─────────────────────────────────────────────────────
    {
        path: 'getting-started/index',
        title: 'Introduction',
        description:
            'What a codec is, the reverse-mapping pain it removes, and how this documentation is organized.',
        kind: 'landing',
    },
    {
        path: 'getting-started/installation',
        title: 'Installation',
        description:
            'Add bimorph to a TypeScript project and confirm the types resolve.',
        kind: 'tutorial',
    },
    {
        path: 'getting-started/quickstart',
        title: 'Quickstart',
        description:
            'Define your first codec from one mapping and call it in both directions in five minutes.',
        kind: 'tutorial',
    },
    {
        path: 'getting-started/coming-from-zod',
        title: 'Coming from Zod or io-ts',
        description:
            'How a two-directional codec differs from a one-directional validator, and which door replaces .parse() / .safeParse().',
        kind: 'guide',
    },

    // ── Recipes ─────────────────────────────────────────────────────────────
    {
        path: 'recipes/index',
        title: 'Recipes',
        description:
            'Working solutions to common mapping tasks — each one the whole thing in a single block, with links down to the guides for depth.',
        kind: 'landing',
    },
    {
        path: 'recipes/reverse-a-lookup-table',
        title: 'Reverse a lookup table without the boilerplate',
        description:
            'Replace a status-code object and its hand-written reverse lookup with one Enum that decodes and encodes both ways.',
        kind: 'guide',
    },
    {
        path: 'recipes/migrate-legacy-enum-values',
        title: 'Accept legacy values but only ever write the canonical one',
        description:
            'Declare deprecated spellings as aliases so they decode, while encode stays typed to the single canonical wire value a migration is allowed to emit.',
        kind: 'guide',
    },
    {
        path: 'recipes/map-a-dto-to-your-domain',
        title: 'Map a wire DTO to your domain object',
        description:
            'Rename keys and convert each field with Struct and Field, so snake_case wire records become your camelCase domain type and back.',
        kind: 'guide',
    },
    {
        path: 'recipes/drop-server-managed-fields-on-encode',
        title: "Keep server-managed fields out of what you send back",
        description:
            'Mark created_at and id as encode: "omit" so they decode in but the encode output type structurally lacks them — a round-trip can never resend them.',
        kind: 'guide',
    },
    {
        path: 'recipes/decode-without-throwing',
        title: 'Decode untrusted input without a try/catch',
        description:
            'Reach for safeDecode to get a Result, or decodeOr to fall back to a value, instead of wrapping the throwing door.',
        kind: 'guide',
    },
    {
        path: 'recipes/collect-every-form-error',
        title: 'Collect every bad field, not just the first',
        description:
            'Use the validate door on a composite to accumulate every failing path into a flat, form-library-shaped ErrorTree.',
        kind: 'guide',
    },
    {
        path: 'recipes/localize-a-value-with-context',
        title: 'Parse a value that needs a region or locale',
        description:
            'Make a codec contextual so decode requires the region it needs, then bind the context once for a whole form.',
        kind: 'guide',
    },
    {
        path: 'recipes/guard-a-lossy-mapping-in-tests',
        title: 'Catch precision loss a lossy mapping introduces',
        description:
            'Tag a mapping lossy where a clean round-trip is not promised, and hold the line in your test suite with assertRoundTrip.',
        kind: 'guide',
    },
    {
        path: 'recipes/collapse-checkboxes-to-an-enum',
        title: 'Collapse several wire flags into one domain value',
        description:
            'Fold a set of booleans — a checkbox group — into a single enum with Group, mapping N wire keys to one domain field.',
        kind: 'guide',
    },
    {
        path: 'recipes/recover-unknown-values',
        title: 'Recover from an unmapped value instead of throwing',
        description:
            'Give an Enum a recover resolver (or a default) so an out-of-map wire value is repaired at the point of failure, with the standard error one raise() away.',
        kind: 'guide',
    },
    {
        path: 'recipes/compose-two-codecs',
        title: 'Chain two codecs into one',
        description:
            'Compose a string↔date codec with a date↔domain codec using pipe, and watch the fidelity tier and context intersect automatically.',
        kind: 'guide',
    },

    // ── Concepts ────────────────────────────────────────────────────────────
    {
        path: 'concepts/the-codec',
        title: 'The codec',
        description:
            'The one primitive bimorph is built on — a typed, two-directional mapping between a domain value and its wire form, carrying its own fidelity and context in the type.',
        kind: 'concept',
    },
    {
        path: 'concepts/doors',
        title: 'Doors, not flags',
        description:
            'Why each failure behavior — throw, Result, fallback, accumulate — is a separate named method visible at the call site, never a config flag that silently changes what decode returns.',
        kind: 'concept',
    },
    {
        path: 'concepts/fidelity-tiers',
        title: 'Fidelity tiers',
        description:
            'How iso, lossy, and partial encode a mapping’s round-trip guarantee in the type, so a partial mapping cannot offer a throwing decode you would be wrong to trust.',
        kind: 'concept',
    },
    {
        path: 'concepts/context-requirement',
        title: 'The context axis',
        description:
            'Why needing runtime context is a second axis orthogonal to fidelity, and how the type forces you to supply a ctx the value cannot carry.',
        kind: 'concept',
    },
    {
        path: 'concepts/aliases',
        title: 'Intentional many-to-one',
        description:
            'Why several wire values decoding to one domain value is the common case, not an error, and how aliases make it first-class without silencing real duplicate bugs.',
        kind: 'concept',
    },
    {
        path: 'concepts/loud-by-default',
        title: 'Loud by default',
        description:
            'Why the bare verb throws with a path, and why getting undefined or a swallowed nested error is always something you opt into through a door.',
        kind: 'concept',
    },
    {
        path: 'concepts/principles',
        title: 'Principles',
        description:
            'Tools not guarantees, behavior as a door, loud by default, two decision times, and non-invertibility made expressible — the ideas that shape the API.',
        kind: 'concept',
    },

    // ── Guides · Leaf codecs ────────────────────────────────────────────────
    {
        path: 'guides/leaves/iso',
        title: 'iso',
        description:
            'Build a leaf codec from two pure inverse functions when both round-trips hold exactly.',
        kind: 'guide',
    },
    {
        path: 'guides/leaves/lossy',
        title: 'lossy',
        description:
            'Build a leaf codec that keeps its throwing doors but promises no clean round-trip — for cents↔Money and other precision-shedding maps.',
        kind: 'guide',
    },
    {
        path: 'guides/leaves/partial',
        title: 'partial',
        description:
            'Build a leaf codec whose decode can fail on otherwise-valid input, which removes the throwing decode door and forces safeDecode.',
        kind: 'guide',
    },

    // ── Guides · Enumerations ───────────────────────────────────────────────
    {
        path: 'guides/enums/enum',
        title: 'Enum',
        description:
            'Map a set of discrete keys to values, entries-first, and get decode and encode from one declaration.',
        kind: 'guide',
    },
    {
        path: 'guides/enums/aliases',
        title: 'Aliases',
        description:
            'Add decode-only spellings whose wire values decode to a canonical domain value but never appear in encode output.',
        kind: 'guide',
    },
    {
        path: 'guides/enums/on-miss',
        title: 'default & recover',
        description:
            'Recover an unmapped wire value with a static default or a resolver — and how omitting both keeps the decode input a closed union that rejects a miss at compile time.',
        kind: 'guide',
    },
    {
        path: 'guides/enums/on-collision',
        title: 'reconcile',
        description:
            'Resolve two primary entries that share a domain value with first-wins, last-wins, a picker, or the loud default throw.',
        kind: 'guide',
    },

    // ── Guides · Composites ─────────────────────────────────────────────────
    {
        path: 'guides/composites/object',
        title: 'Struct',
        description:
            'Map a struct field-by-field, with per-field rename and codec, and get the accumulate-all-errors validate door.',
        kind: 'guide',
    },
    {
        path: 'guides/composites/field',
        title: 'Field',
        description:
            'Declare one wire↔domain field, rename its key, and drop it from encode output with encode: "omit" or "omit-if".',
        kind: 'guide',
    },
    {
        path: 'guides/composites/group',
        title: 'Group',
        description:
            'Collapse N wire fields into one domain field — a checkbox group into a single enum.',
        kind: 'guide',
    },
    {
        path: 'guides/composites/array-and-tuple',
        title: 'List & Tuple',
        description:
            'Map homogeneous lists and fixed-length heterogeneous lists, with per-index paths threaded into errors.',
        kind: 'guide',
    },
    {
        path: 'guides/composites/optional',
        title: 'Nullable',
        description:
            'Normalize a null or absent wire value to undefined on decode, and undefined back to null on encode.',
        kind: 'guide',
    },

    // ── Guides · Composition ────────────────────────────────────────────────
    {
        path: 'guides/composition/pipe',
        title: 'pipe',
        description:
            'Compose codecs end to end, taking the weaker fidelity tier and the intersection of their contexts, with error paths threaded through.',
        kind: 'guide',
    },

    // ── Guides · Doors ──────────────────────────────────────────────────────
    {
        path: 'guides/doors/decode-and-encode',
        title: 'decode & encode',
        description:
            'The bare verbs that throw a path-carrying error on failure — the door you reach for when you assert success.',
        kind: 'guide',
    },
    {
        path: 'guides/doors/safe-doors',
        title: 'safeDecode & decodeOr',
        description:
            'Get a Result you handle, or a value you fall back to, using the same error type the throwing door raises.',
        kind: 'guide',
    },
    {
        path: 'guides/doors/validate',
        title: 'validate',
        description:
            'Accumulate every failing path into an ErrorTree on composites, instead of failing fast on the first bad field.',
        kind: 'guide',
    },

    // ── Guides · Context ────────────────────────────────────────────────────
    {
        path: 'guides/context/contextual-codecs',
        title: 'Contextual codecs',
        description:
            'Add a Ctx type parameter so decode and encode require the runtime context a value cannot carry, checked at compile time.',
        kind: 'guide',
    },
    {
        path: 'guides/context/bind',
        title: '.bind()',
        description:
            'Erase a codec’s context by binding it once, yielding an ordinary codec you can drop into Struct, List, and pipe.',
        kind: 'guide',
    },

    // ── Guides · Recovery ───────────────────────────────────────────────────
    {
        path: 'guides/recovery/resolver',
        title: 'The resolver',
        description:
            'The single recovery primitive every recover and reconcile preset desugars to — typed to the target, with the context in hand and raise() to give up.',
        kind: 'guide',
    },

    // ── Guides · Testing ────────────────────────────────────────────────────
    {
        path: 'guides/testing/assert-round-trip',
        title: 'assertRoundTrip',
        description:
            'Round-trip a set of samples through decode then encode in your test suite — the only enforcement behind the lossy tier.',
        kind: 'guide',
    },

    // ── Reference ───────────────────────────────────────────────────────────
    {
        path: 'reference/codec-types',
        title: 'Codec types',
        description:
            'Codec, CodecFull, Fidelity, CtxArg, and the door interfaces that make up a codec’s shape.',
        kind: 'reference',
    },
    {
        path: 'reference/constructors',
        title: 'Constructors',
        description:
            'Signatures for iso, lossy, partial, Enum, Struct, Field, Group, List, Tuple, Nullable, and pipe.',
        kind: 'reference',
    },
    {
        path: 'reference/errors',
        title: 'Errors & results',
        description:
            'DecodeError, ErrorTree, BimorphError, and the Result discriminated union the doors return.',
        kind: 'reference',
    },
    {
        path: 'reference/resolver',
        title: 'Resolver types',
        description:
            'Resolver, ResolveContext, and Reconcile — the recovery type surface, plus the default and recover miss slots.',
        kind: 'reference',
    },
    {
        path: 'reference/helpers',
        title: 'Helpers',
        description: 'assertRoundTrip and the .bind() context-erasure method.',
        kind: 'reference',
    },

    // ── Errors & pitfalls ───────────────────────────────────────────────────
    // Keyed to the `DecodeError.code` a thrown `BimorphError` carries. The page
    // slug is the code; treat both as an API (never rename a published slug).
    {
        path: 'errors/index',
        title: 'Errors & pitfalls',
        description:
            'How a BimorphError is shaped, the code-to-docs contract, and an index of every DecodeError code.',
        kind: 'landing',
    },
    {
        path: 'errors/miss',
        title: 'miss',
        description:
            'No mapping existed for a wire value on decode, or no canonical wire for a domain value on encode.',
        kind: 'error',
        code: 'miss',
    },
    {
        path: 'errors/ambiguous',
        title: 'ambiguous',
        description:
            'One wire value decoded to two different domain values, so the decode index is not a function.',
        kind: 'error',
        code: 'ambiguous',
    },
    {
        path: 'errors/collision',
        title: 'collision',
        description:
            'Two primary entries shared a domain value, so encode has no single canonical wire to emit — set reconcile or declare an alias.',
        kind: 'error',
        code: 'collision',
    },
    {
        path: 'errors/lossy',
        title: 'lossy',
        description:
            'A round-trip sample did not come back equal, so assertRoundTrip reported drift a lossy mapping shed.',
        kind: 'error',
        code: 'lossy',
    },
    {
        path: 'errors/malformed',
        title: 'malformed',
        description:
            'A decode or encode function threw, and bimorph wrapped it as a malformed failure with a path.',
        kind: 'error',
        code: 'malformed',
    },
];
