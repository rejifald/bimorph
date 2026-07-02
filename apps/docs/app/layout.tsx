import './global.css';

import { appName, siteUrl } from '@/lib/shared';

import 'fumadocs-twoslash/twoslash.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';

const defaultTitle = 'bimorph — bidirectional data mapping for TypeScript';
const defaultDescription =
    'Define a mapping once and get both directions for free. bimorph surfaces the mappings that do not invert cleanly — duplicate values, lossy transforms, missing keys, read-only fields, context-dependent reverses — in the type, with explicit escape hatches, instead of pretending every mapping is a clean isomorphism.';

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: defaultTitle,
        template: `%s — ${appName}`,
    },
    description: defaultDescription,
    applicationName: appName,
};

export default function Layout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="flex flex-col min-h-screen">
                <RootProvider>{children}</RootProvider>
            </body>
        </html>
    );
}
