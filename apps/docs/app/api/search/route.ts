import { source } from '@/lib/source';

import { createFromSource } from 'fumadocs-core/search/server';

// Fumadocs' built-in static search over the docs source.
export const { GET } = createFromSource(source);
