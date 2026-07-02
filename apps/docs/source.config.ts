import { transformerFold } from './lib/transformer-fold';

import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { transformerTwoslash } from 'fumadocs-twoslash';

// The docs collection. The information architecture is data — see
// content.manifest.ts — and the skeleton generator emits the folder tree,
// each meta.json, and a stub .mdx per page from it.
//
// NOTE: source.config.ts may only export collections — fumadocs-mdx rejects any
// other export from this file. Keep schemas inline.
export const docs = defineDocs({
    dir: 'content/docs',
    docs: {
        schema: pageSchema,
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },
    meta: {
        schema: metaSchema,
    },
});

export default defineConfig({
    mdxOptions: {
        // Package-manager install tabs (```package-install```) persist the
        // reader's manager pick across every page.
        remarkNpmOptions: { persist: { id: 'package-manager' } },
        rehypeCodeOptions: {
            ...rehypeCodeDefaultOptions,
            transformers: [
                ...(rehypeCodeDefaultOptions.transformers ?? []),
                // Twoslash type-checks every ```ts twoslash``` block against the
                // real `bimorph` types (src/index.ts) at build time and renders
                // hover tooltips. Spread the defaults so the stock Shiki
                // transformers (tab/title/icon meta) survive; the Popup
                // components it emits are registered in components/mdx.tsx.
                // Resolve `bimorph` to its TS source (not the published dist/) so docs
                // type-check against live src/index.ts. Twoslash requests the custom
                // `bimorph-source` export condition declared in the package exports map.
                transformerTwoslash({
                    twoslashOptions: {
                        compilerOptions: {
                            customConditions: ['bimorph-source'],
                        },
                    },
                }),
                // Collapse `// [!code fold:start] … [!code fold:end]` regions
                // behind a "Show full example" toggle. Runs AFTER twoslash so it
                // folds the post-twoslash line elements (and keeps them in the
                // DOM, unlike twoslash's `// ---cut---`). The toggle UI is the
                // `pre` override in components/mdx.tsx.
                transformerFold(),
            ],
        },
    },
});
