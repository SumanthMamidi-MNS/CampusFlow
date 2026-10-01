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
    <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* Context / Breadcrumb */}
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-slate-800 tracking-tight">
          Apex Institute of Technology
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium text-slate-500">System Online</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-lg z-50 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 p-4 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllReadMutation.mutate()}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
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
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Notification Preferences"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto py-1">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-500">
                    No new notifications
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {notifications.slice(0, 10).map((n: NotificationItem) => (
                      <div
                        key={n.id}
                        className={`group flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                          !n.is_read ? 'bg-slate-50/50' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          {n.link ? (
                            <Link
                              to={n.link}
                              onClick={() => {
                                if (!n.is_read) markReadMutation.mutate(n.id);
                                setIsOpen(false);
                              }}
                              className="block"
                            >
                              <div className="flex items-center gap-2">
                                {!n.is_read && <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />}
                                <h4 className="text-xs font-semibold text-slate-800 truncate">
                                  {n.title}
                                </h4>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                {n.message}
                              </p>
                            </Link>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2">
                                {!n.is_read && <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />}
                                <h4 className="text-xs font-semibold text-slate-800 truncate">{n.title}</h4>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                {n.message}
                              </p>
                            </div>
                          )}
                          <span className="mt-1.5 block text-[10px] text-slate-400 font-medium">
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
                            title="Mark as read"
                            className="mt-0.5 shrink-0 rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-600 transition-all"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-slate-200" />

        {/* User menu */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-semibold text-slate-800 leading-tight">
                {user.first_name} {user.last_name}
              </span>
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">
                {user.roles[0]?.replace('_', ' ') || 'USER'}
              </span>
            </div>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 shadow-sm">
            {user ? `${user.first_name[0]}${user.last_name[0]}` : <UserIcon className="h-4 w-4" />}
          </div>
          <button
            onClick={logout}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
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
