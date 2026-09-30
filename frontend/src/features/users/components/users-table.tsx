import { useState } from 'react';
import { Edit2, UserX, Search, ShieldCheck } from 'lucide-react';
import type { User } from '../types';
import { useUsers, useDeleteUser } from '../api';
import { useDebounce } from '@/core/hooks/use-debounce';

interface UsersTableProps {
  onEditUser: (user: User) => void;
}

export function UsersTable({ onEditUser }: UsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data, isLoading, isError } = useUsers({
    search: debouncedSearch,
    status: statusFilter,
    role: roleFilter,
    page,
    pageSize: 15,
  });

  const deleteUserMutation = useDeleteUser();

  const handleDeactivate = async (user: User) => {
    if (confirm(`Are you sure you want to deactivate ${user.first_name} ${user.last_name}?`)) {
      await deleteUserMutation.mutateAsync(user.id);
    }
  };

  const users = data?.data || [];
  const pagination = data?.meta ? (data.meta as any).pagination : null;
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.page_size) : 1;

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 transition"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="">All Roles</option>
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
            <option value="department_head">Department Head</option>
            <option value="exam_controller">Exam Controller</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading user roster...</div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-rose-600">Failed to load users.</div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-500">No users found matching your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Roles</th>
                  <th className="px-6 py-3.5">Phone</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/75 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                          {user.first_name[0]}{user.last_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700"
                          >
                            <ShieldCheck className="h-3 w-3 text-slate-500" />
                            {role.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500">
                      {user.phone || '—'}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          user.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : user.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEditUser(user)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Edit User"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(user)}
                          className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition"
                          title="Deactivate User"
                        >
                          <UserX className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 text-xs text-slate-500">
            <div>
              Showing {((page - 1) * pagination.page_size) + 1} to{' '}
              {Math.min(page * pagination.page_size, pagination.total)} of{' '}
              {pagination.total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Previous
              </button>
              <span className="px-2 font-medium">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
