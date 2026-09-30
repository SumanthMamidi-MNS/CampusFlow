import { Bell, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div>
        {/* Breadcrumbs will go here */}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button
          className="relative rounded-full p-2 hover:bg-accent"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* User menu */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserIcon className="h-4 w-4" />
          </div>
          {user && (
            <span className="text-sm font-medium">
              {user.first_name} {user.last_name}
            </span>
          )}
          <button
            onClick={logout}
            className="rounded-full p-2 hover:bg-accent"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
