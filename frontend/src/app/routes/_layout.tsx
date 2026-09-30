import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/core/components/layout/sidebar';
import { Topbar } from '@/core/components/layout/topbar';

export function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
