import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/core/components/layout/sidebar';
import { Topbar } from '@/core/components/layout/topbar';

/**
 * The authenticated shell. Nested routes render through `Outlet`; the signed-in
 * dashboard at `/` passes its element as children instead, so both paths get
 * the same sidebar and topbar.
 */
export function RootLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
