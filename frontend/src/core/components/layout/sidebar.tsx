import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BookOpen,
  FileEdit,
  Code2,
  ClipboardList,
  Users,
  Settings,
  Building2,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Shield
} from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'ACADEMICS',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Courses', href: '/courses', icon: BookOpen },
      { label: 'Assignments', href: '/assignments', icon: FileEdit },
      { label: 'Programming', href: '/programming', icon: Code2 },
      { label: 'Exams', href: '/exams', icon: ClipboardList },
    ]
  },
  {
    title: 'ASSESSMENT',
    items: [
      { label: 'Question Banks', href: '/question-banks', icon: GraduationCap, roles: ['admin', 'super_admin', 'faculty', 'exam_controller', 'department_head'] },
    ]
  },
  {
    title: 'ADMINISTRATION',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users, roles: ['admin', 'super_admin'] },
      { label: 'Academics', href: '/admin/academic', icon: Building2, roles: ['admin', 'super_admin', 'department_head'] },
      { label: 'Settings', href: '/admin/settings', icon: Settings, roles: ['admin', 'super_admin'] },
    ]
  }
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Area */}
      <div className="flex h-16 items-center border-b border-slate-200 px-4 shrink-0 overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white shadow-sm">
            <Shield className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col whitespace-nowrap">
              <span className="text-sm font-semibold text-slate-900 tracking-tight leading-none">
                CampusFlow
              </span>
              <span className="text-[11px] text-slate-400 font-medium mt-1 leading-none">
                Academic Portal
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        {navSections.map((section) => {
          const filteredItems = section.items.filter(
            (item) => !item.roles || (user && item.roles.some((r) => user.roles.includes(r)))
          );

          if (filteredItems.length === 0) return null;

          return (
            <div key={section.title} className="mb-6 px-3">
              {!collapsed && (
                <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </h3>
              )}
              {collapsed && <div className="mb-2 mx-auto h-px w-6 bg-slate-100" />}
              
              <div className="space-y-1">
                {filteredItems.map((item) => {
                  const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href + '/'));
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-xs transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600 rounded-l-lg'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium rounded-lg',
                        collapsed && isActive && 'border-r-0 rounded-lg'
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-600" : "text-slate-500")} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer / Session Status */}
      <div className="border-t border-slate-200 p-4 shrink-0 flex flex-col gap-4">
        {!collapsed && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-600">Fall 2026 • Active</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
