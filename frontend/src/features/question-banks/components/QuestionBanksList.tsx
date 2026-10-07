import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCourses, useDepartments } from '@/features/courses/api';
import { useCreateQuestionBank, useDeleteQuestionBank, useQuestionBanks } from '../api';
import type { QuestionBankCreateInput } from '../types';
import { ConfirmDialog } from '@/core/components/ui';
import {
  BookOpen,
  Building2,
  Calendar,
  GraduationCap,
  HelpCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

export function QuestionBanksList() {
  const navigate = useNavigate();
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: departments } = useDepartments();
  const { data: courses } = useCourses();
  const { data: questionBanks, isLoading } = useQuestionBanks(
    selectedDeptId ? { department_id: selectedDeptId } : undefined
  );
  const deleteBankMutation = useDeleteQuestionBank();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Create Modal State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [newCourseId, setNewCourseId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const createBankMutation = useCreateQuestionBank();

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newTitle.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!newDeptId) {
      setFormError('Please select a department.');
      return;
    }

    const payload: QuestionBankCreateInput = {
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      department_id: newDeptId,
      course_id: newCourseId || undefined,
    };

    try {
      await createBankMutation.mutateAsync(payload);
      setIsCreateOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewDeptId('');
      setNewCourseId('');
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message || 'Failed to create question bank.');
    }
  };

  const handleDelete = (e: React.MouseEvent, bankId: string, title: string) => {
    e.stopPropagation();
    setDeleteError(null);
    setDeleteTarget({ id: bankId, title });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBankMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err.response?.data?.error?.message || err.message || 'Failed to delete question bank.');
      setDeleteTarget(null);
    }
  };

  const filteredCourses = courses?.filter((c) => !newDeptId || c.department_id === newDeptId) || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {deleteError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
          {deleteError}
        </div>
      )}

      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Question Banks Repository</h1>
              <p className="text-xs text-slate-500">
                Centralized assessment repository across academic departments & courses
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {departments && departments.length > 0 && (
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" /> New Question Bank
          </button>
        </div>
      </div>

      {/* Grid of Question Banks */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading question banks...</div>
      ) : !questionBanks || questionBanks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white">
          <HelpCircle className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No question banks found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Get started by creating your first department or course question bank.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs"
          >
            <Plus className="h-4 w-4" /> Create Bank
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {questionBanks.map((bank) => (
            <div
              key={bank.id}
              onClick={() => navigate(`/question-banks/${bank.id}`)}
              className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {bank.title}
                  </h3>
                  <button
                    onClick={(e) => handleDelete(e, bank.id, bank.title)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-opacity"
                    title="Delete Bank"
                    aria-label={`Delete question bank ${bank.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 mb-4 h-8">
                  {bank.description || 'No description provided.'}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {bank.department_name && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      <Building2 className="h-3 w-3" /> {bank.department_name}
                    </span>
                  )}
                  {bank.course_title && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      <BookOpen className="h-3 w-3" /> {bank.course_title}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Created {new Date(bank.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="rounded-full bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700 text-xs shrink-0">
                  {bank.questions_count} {bank.questions_count === 1 ? 'question' : 'questions'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Create Question Bank</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Bank Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Data Structures & Algorithms Midterm Bank"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                >
                  <option value="">Select department...</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Associated Course (Optional)
                </label>
                <select
                  value={newCourseId}
                  onChange={(e) => setNewCourseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">No specific course (Department level)</option>
                  {filteredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Short description of topics, scope, or learning outcomes..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBankMutation.isPending}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createBankMutation.isPending ? 'Creating...' : 'Create Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete question bank"
        body={`Delete "${deleteTarget?.title ?? ''}" and all of its questions? This cannot be undone.`}
        confirmLabel="Delete bank"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
