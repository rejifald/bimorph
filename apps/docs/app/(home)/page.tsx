import Link from 'next/link';

export default function HomePage() {
    return (
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
            <span className="mb-4 font-mono text-sm text-fd-muted-foreground">
                bimorph
            </span>
            <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
                Define a mapping once. Get both directions.
            </h1>
            <p className="mt-6 max-w-xl text-balance text-lg text-fd-muted-foreground">
                Bidirectional data mapping for TypeScript. The reverses that
                don&rsquo;t invert cleanly — duplicate values, lossy transforms,
                read-only fields, context-dependent parses — show up in the
                type, with explicit escape hatches, instead of failing silently.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                    href="/docs"
                    className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-opacity hover:opacity-90"
                >
                    Read the docs
                </Link>
                <Link
                    href="/docs/getting-started/quickstart"
                    className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
                >
                    Quickstart
                </Link>
            </div>
        </main>
    );
}
