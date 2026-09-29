import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/'>) {
  // The docs layout has its own sidebar; only the landing page needs top-level links.
  return (
    <HomeLayout
      {...baseOptions()}
      links={[
        { text: 'Documentation', url: '/docs', active: 'nested-url' },
        { text: 'Wire comparison', url: '/docs/wire-comparison' },
        { text: 'Release notes', url: '/docs/changelog/core' },
      ]}
    >
      {children}
    </HomeLayout>
  );
}
