import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/features/notifications/api';
import { NotificationPreferencesModal } from '@/features/notifications/components/NotificationPreferencesModal';
import type { NotificationItem } from '@/features/notifications/types';

export function Topbar() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);


  const { data: notifData } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const unreadCount = notifData?.unread_count || 0;
  const notifications = notifData?.items || [];

  return (
    <header className="relative flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 tracking-tight">
          CampusFlow Academic Portal
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllReadMutation.mutate()}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setIsPrefModalOpen(true);
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Notification Preferences"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No notifications yet.
                  </p>
                ) : (
                  notifications.slice(0, 10).map((n: NotificationItem) => (
                    <div
                      key={n.id}
                      className={`flex items-start justify-between gap-3 py-3 transition-colors ${
                        !n.is_read ? 'bg-blue-50/40 rounded-lg px-2' : 'px-2'
                      }`}
                    >
                      <div className="flex-1">
                        {n.link ? (
                          <Link
                            to={n.link}
                            onClick={() => {
                              if (!n.is_read) markReadMutation.mutate(n.id);
                              setIsOpen(false);
                            }}
                            className="block"
                          >
                            <h4 className="text-xs font-semibold text-slate-800 hover:text-blue-600">
                              {n.title}
                            </h4>
                            <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                              {n.message}
                            </p>
                          </Link>
                        ) : (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-800">{n.title}</h4>
                            <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                              {n.message}
                            </p>
                          </div>
                        )}
                        <span className="mt-1 block text-[10px] text-slate-400">
                          {new Date(n.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={() => markReadMutation.mutate(n.id)}
                          title="Mark read"
                          className="mt-1 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-white font-medium text-xs">
            {user ? `${user.first_name[0]}${user.last_name[0]}` : <UserIcon className="h-4 w-4" />}
          </div>
          {user && (
            <div className="hidden sm:block">
              <span className="block text-xs font-semibold text-slate-900 leading-tight">
                {user.first_name} {user.last_name}
              </span>
              <span className="block text-[10px] text-slate-500 uppercase tracking-wider">
                {user.roles[0] || 'User'}
              </span>
            </div>
          )}
          <button
            onClick={logout}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors ml-1"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <NotificationPreferencesModal
        isOpen={isPrefModalOpen}
        onClose={() => setIsPrefModalOpen(false)}
      />
    </header>
  );
}
