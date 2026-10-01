import { useState } from 'react';
import { Building2, Calendar, Plus, X } from 'lucide-react';
import { PageHeader } from '@/core/components/layout/page-header';
import {
  useAcademicTerms,
  useDepartments,
} from '@/features/courses/api';
import apiClient from '@/core/api/client';
import { useQueryClient } from '@tanstack/react-query';

export function AcademicAdminPage() {
  const [activeTab, setActiveTab] = useState<'departments' | 'terms'>('departments');
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [isTermOpen, setIsTermOpen] = useState(false);

  // New dept form
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptDesc, setDeptDesc] = useState('');

  // New term form
  const [termName, setTermName] = useState('');
  const [termType, setTermType] = useState('semester');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);

  const queryClient = useQueryClient();
  const { data: departments, isLoading: deptsLoading } = useDepartments();
  const { data: terms, isLoading: termsLoading } = useAcademicTerms();

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.post('/departments', {
      name: deptName,
      code: deptCode,
      description: deptDesc || null,
    });
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    setDeptName('');
    setDeptCode('');
    setDeptDesc('');
    setIsDeptOpen(false);
  };

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiClient.post('/academic-terms', {
      name: termName,
      term_type: termType,
      start_date: startDate,
      end_date: endDate,
      is_current: isCurrent,
    });
    queryClient.invalidateQueries({ queryKey: ['academic-terms'] });
    setTermName('');
    setStartDate('');
    setEndDate('');
    setIsTermOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Academic Structure"
        description="Configure academic divisions, programs, and semester/term scheduling."
        actions={
          activeTab === 'departments' ? (
            <button
              onClick={() => setIsDeptOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Department</span>
            </button>
          ) : (
            <button
              onClick={() => setIsTermOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Academic Term</span>
            </button>
          )
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'departments'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Departments</span>
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'terms'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Academic Terms</span>
        </button>
      </div>

      {activeTab === 'departments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {deptsLoading ? (
            <div className="py-20 text-center text-sm text-slate-500">Loading departments...</div>
          ) : !departments || departments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No departments configured yet.</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Code</th>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Head of Department</th>
                  <th className="px-6 py-3.5">Active Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-bold text-blue-600">{d.code}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{d.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{(d as any).head_of_department || '—'}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{(d as any).active_terms_count || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'terms' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {termsLoading ? (
            <div className="py-20 text-center text-sm text-slate-500">Loading academic terms...</div>
          ) : !terms || terms.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No terms configured yet.</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Term Name</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Start Date</th>
                  <th className="px-6 py-3.5">End Date</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {terms.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-900">{t.name}</td>
                    <td className="px-6 py-4 capitalize text-slate-600">{t.term_type}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{t.start_date}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{t.end_date}</td>
                    <td className="px-6 py-4">
                      {t.is_current ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Current Term
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Past</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Department Modal */}
      {isDeptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Add Department</h3>
              <button onClick={() => setIsDeptOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateDept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Code *</label>
                <input
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="e.g. CS"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm uppercase focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Name *</label>
                <input
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  placeholder="Brief description..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsDeptOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Create Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Term Modal */}
      {isTermOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Add Academic Term</h3>
              <button onClick={() => setIsTermOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateTerm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Term Name *</label>
                <input
                  required
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  placeholder="e.g. Spring 2027"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Term Type</label>
                <select
                  value={termType}
                  onChange={(e) => setTermType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm bg-white focus:border-blue-600 focus:outline-none"
                >
                  <option value="semester">Semester</option>
                  <option value="trimester">Trimester</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Set as current active term</span>
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsTermOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Create Term
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
