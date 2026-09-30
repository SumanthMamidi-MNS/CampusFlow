import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { User, UserCreateInput, UserUpdateInput } from '../types';
import { useCreateUser, useUpdateUser } from '../api';

const AVAILABLE_ROLES = [
  { id: 'student', label: 'Student' },
  { id: 'faculty', label: 'Faculty / Lecturer' },
  { id: 'department_head', label: 'Department Head' },
  { id: 'exam_controller', label: 'Exam Controller' },
  { id: 'admin', label: 'College Admin' },
];

interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userToEdit?: User | null;
}

export function UserFormDialog({ isOpen, onClose, userToEdit }: UserFormDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'pending' | 'active' | 'inactive'>('active');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['student']);
  const [errorMessage, setErrorMessage] = useState('');

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  useEffect(() => {
    if (userToEdit) {
      setFirstName(userToEdit.first_name);
      setLastName(userToEdit.last_name);
      setEmail(userToEdit.email);
      setPhone(userToEdit.phone || '');
      setStatus(userToEdit.status);
      setSelectedRoles(userToEdit.roles || ['student']);
      setPassword('');
      setErrorMessage('');
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setStatus('active');
      setSelectedRoles(['student']);
      setErrorMessage('');
    }
  }, [userToEdit, isOpen]);

  if (!isOpen) return null;

  const handleRoleToggle = (roleId: string) => {
    if (selectedRoles.includes(roleId)) {
      if (selectedRoles.length > 1) {
        setSelectedRoles(selectedRoles.filter((r) => r !== roleId));
      }
    } else {
      setSelectedRoles([...selectedRoles, roleId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    try {
      if (userToEdit) {
        const updatePayload: UserUpdateInput = {
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          status,
          roles: selectedRoles,
        };
        if (password.trim()) {
          updatePayload.password = password;
        }
        await updateUserMutation.mutateAsync({ id: userToEdit.id, data: updatePayload });
      } else {
        if (!password.trim()) {
          setErrorMessage('Password is required for new accounts.');
          return;
        }
        const createPayload: UserCreateInput = {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          password,
          status,
          roles: selectedRoles,
        };
        await createUserMutation.mutateAsync(createPayload);
      }
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Operation failed';
      setErrorMessage(msg);
    }
  };

  const isSubmitting = createUserMutation.isPending || updateUserMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {userToEdit ? 'Edit User' : 'Create New User'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Institutional Email *
            </label>
            <input
              type="email"
              required
              disabled={!!userToEdit}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 focus:border-blue-600 focus:outline-none"
              placeholder="user@college.edu"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                placeholder="+1 555-0199"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none bg-white"
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {userToEdit ? 'New Password (leave blank to retain current)' : 'Initial Password *'}
            </label>
            <input
              type="password"
              minLength={8}
              required={!userToEdit}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Assigned Roles
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_ROLES.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 text-xs text-slate-700 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(r.id)}
                    onChange={() => handleRoleToggle(r.id)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : userToEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
