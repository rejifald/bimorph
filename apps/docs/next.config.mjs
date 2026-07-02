import { createMDX } from 'fumadocs-mdx/next';

// Twoslash type-checks every `ts twoslash` MDX fence at build/render time against
// the *declared* types of the modules it imports. bimorph's examples import from
// `bimorph`, whose package `exports` point straight at `src/index.ts` (raw TS) —
// so, unlike a package that ships built `.d.ts`, there is nothing to build first:
// twoslash reads the source types directly. The docs app depends on `bimorph`
// via `file:../..`, so `node_modules/bimorph` symlinks to the repo root and
// standard resolution finds it.
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
    reactStrictMode: true,
};

export default withMDX(config);
