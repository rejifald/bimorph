import { docsContentRoute, docsImageRoute, docsRoute } from './shared';

import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
    baseUrl: docsRoute,
    source: docs.toFumadocsSource(),
    plugins: [lucideIconsPlugin()],
});

// A curated, signal-first header prepended to /llms.txt and /llms-full.txt so an
// agent reads what bimorph is — and how to call it — before the page index.
export function llmsPreamble() {
    return `# bimorph
> Bidirectional data mapping for TypeScript. Define a mapping once and get both directions for free: decode (wire → domain) and encode (domain → wire). Most real mappings do not invert cleanly — duplicate values, lossy transforms, missing keys, read-only fields, reverses that need runtime context — so bimorph surfaces that in the type and gives explicit escape hatches instead of pretending every mapping is a clean isomorphism.

## What to know
- A **codec** is \`Codec<A, B, Ctx, F>\`: A = domain (what your app holds), B = wire (the external form), Ctx = required runtime context, F = fidelity tier.
- **Doors, not flags:** the bare \`decode\`/\`encode\` throw with a \`path\`; \`safeDecode\`/\`safeEncode\` return a \`Result\`; \`decodeOr\`/\`encodeOr\` fall back; \`validate\` (composites only) accumulates every failing path into an \`ErrorTree\`.
- **Fidelity tiers** are in the type: \`iso\` (both round-trips hold), \`lossy\` (neither promised), \`partial\` (a direction can fail — so the throwing door is removed and you must go through \`safe*\`/\`validate\`/\`*Or\`).
- **Aliases** make intentional many-to-one first-class: several wire values decode to one domain value; encode only ever emits the canonical wire value, and the encode type proves it.
- **Context** is a second, orthogonal axis: a contextual codec needs a \`ctx\` argument the value can't carry (a region, a locale); \`.bind(ctx)\` erases it back to a plain, composable codec.

## Quickstart
\`\`\`ts
import { enum_ } from 'bimorph';

const Status = enum_([[1, 'active'], [0, 'inactive']]);
Status.decode(1);        // 'active'
Status.encode('active'); // 1
\`\`\``;
}

export function getPageImage(page: (typeof source)['$inferPage']) {
    const segments = [...page.slugs, 'image.png'];

    return {
        segments,
        url: `${docsImageRoute}/${segments.join('/')}`,
    };
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
    const segments = [...page.slugs, 'content.md'];

    return {
        segments,
        url: `${docsContentRoute}/${segments.join('/')}`,
    };
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
    const processed = await page.data.getText('processed');

    return `# ${page.data.title} (${page.url})

${processed}`;
}
