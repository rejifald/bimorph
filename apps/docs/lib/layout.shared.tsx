import { appName, gitConfig } from './shared';

import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
    return {
        nav: {
            title: (
                <span className="font-mono text-[0.95rem] font-bold tracking-tight">
                    {appName}
                </span>
            ),
        },
        links: [
            {
                text: 'Docs',
                url: '/docs',
            },
        ],
        githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    };
}
