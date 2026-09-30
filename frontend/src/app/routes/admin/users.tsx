import { useState } from 'react';
import { UserPlus, Upload } from 'lucide-react';
import { PageHeader } from '@/core/components/layout/page-header';
import { UsersTable } from '@/features/users/components/users-table';
import { UserFormDialog } from '@/features/users/components/user-form-dialog';
import { BulkImportDialog } from '@/features/users/components/bulk-import-dialog';
import type { User } from '@/features/users/types';

export function UsersAdminPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);

  const handleCreate = () => {
    setUserToEdit(null);
    setIsFormOpen(true);
  };

  const handleEdit = (user: User) => {
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="User Management"
        description="Provision, configure, and inspect faculty, student, and administrator accounts."
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              <span>Bulk Import</span>
            </button>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add User</span>
            </button>
          </div>
        }
      />

      <UsersTable onEditUser={handleEdit} />

      <UserFormDialog
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setUserToEdit(null);
        }}
        userToEdit={userToEdit}
      />

      <BulkImportDialog
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
      />
    </div>
  );
}
