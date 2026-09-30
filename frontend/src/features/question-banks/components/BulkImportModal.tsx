import { useState } from 'react';
import { useBulkImportQuestions } from '../api';
import type { BulkImportResult } from '../types';
import { AlertCircle, CheckCircle2, FileUp, UploadCloud, X } from 'lucide-react';

interface BulkImportModalProps {
  bankId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BulkImportModal({ bankId, isOpen, onClose }: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const importMutation = useBulkImportQuestions(bankId);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
      setResult(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Please select a CSV file to upload.');
      return;
    }

    try {
      const data = await importMutation.mutateAsync(file);
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error?.message || err.message || 'Failed to process CSV file.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <FileUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Bulk Import Questions</h2>
              <p className="text-xs text-slate-500">Upload multiple questions at once using a CSV file</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Import Processing Completed</h3>
                    <p className="text-xs text-slate-500">
                      Successfully imported <strong className="text-emerald-700">{result.imported_count}</strong> questions.
                      {result.failed_count > 0 && (
                        <span> (<strong className="text-rose-600">{result.failed_count}</strong> failed)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">
                    Validation Warnings & Errors ({result.errors.length})
                  </h4>
                  <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-y-auto list-disc pl-4">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleImport} className="space-y-5">
              {/* File upload zone */}
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50">
                <UploadCloud className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                <label className="cursor-pointer">
                  <span className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Click to select CSV file
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-500 mt-1">UTF-8 formatted .csv file up to 10MB</p>
                {file && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 border border-slate-200 text-xs font-medium text-slate-800">
                    <span>{file.name}</span>
                    <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>

              {/* Instructions / CSV Schema */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Supported CSV Format
                </h4>
                <p className="text-xs text-slate-600">
                  Headers must include: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">question_type, difficulty, marks, negative_marks, body, options, correct_options, explanation, tags</code>
                </p>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>• Options are separated by pipe: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">Option A|Option B|Option C</code></p>
                  <p>• Correct options are specified by label or text: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">A</code> or <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">Option A</code></p>
                  <p>• Numerical answers use <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">numerical_answer</code> and <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">tolerance</code> columns.</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!file || importMutation.isPending}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {importMutation.isPending ? 'Importing...' : 'Upload & Import'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
