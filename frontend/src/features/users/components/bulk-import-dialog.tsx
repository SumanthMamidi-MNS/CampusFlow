import { useState } from 'react';
import { UploadCloud, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useBulkImportUsers } from '../api';
import type { BulkImportResult } from '../types';

interface BulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkImportDialog({ isOpen, onClose }: BulkImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const bulkImportMutation = useBulkImportUsers();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setErrorMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setErrorMessage('');
    try {
      const res = await bulkImportMutation.mutateAsync(file);
      setResult(res);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Upload failed.';
      setErrorMessage(msg);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setErrorMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Bulk Import Users</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          {!result ? (
            <>
              {/* Instructions */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">CSV Template Format:</p>
                <code className="block bg-white p-2 rounded border border-slate-200 text-slate-800">
                  email,first_name,last_name,phone,roles
                </code>
                <p>Example: <code>john.doe@college.edu,John,Doe,+15550199,student</code></p>
                <p className="text-slate-500">Default initial password assigned: <code>CampusFlow@2026</code></p>
              </div>

              {/* Upload Dropzone */}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 cursor-pointer transition">
                <UploadCloud className="h-10 w-10 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-700">
                  {file ? file.name : 'Click to select CSV file'}
                </span>
                <span className="text-xs text-slate-400 mt-1">UTF-8 encoded CSV files only</span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!file || bulkImportMutation.isPending}
                  onClick={handleUpload}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 transition disabled:opacity-50"
                >
                  {bulkImportMutation.isPending ? 'Processing...' : 'Upload & Import'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm">Import Process Completed</h4>
                  <p className="text-xs mt-0.5">
                    Successfully created: <strong>{result.created_count}</strong> | Skipped: <strong>{result.skipped_count}</strong>
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-500" /> Skipped Rows / Errors:
                  </h5>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="p-2">Row</th>
                          <th className="p-2">Email</th>
                          <th className="p-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.errors.map((err, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono">{err.row}</td>
                            <td className="p-2 font-mono text-slate-700">{err.email}</td>
                            <td className="p-2 text-rose-600">{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
