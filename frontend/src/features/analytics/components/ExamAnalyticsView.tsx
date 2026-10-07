import { useState } from 'react';
import { downloadExamResultsCsv, useExamAnalytics } from '../api';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FileSpreadsheet,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';


export function ExamAnalyticsView({
  examId,
  examTitle,
  totalMarks,
}: {
  examId: string;
  examTitle: string;
  totalMarks: number;
}) {
  const { data: analytics, isLoading } = useExamAnalytics(examId);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading exam performance analytics...</div>;
  }

  if (!analytics) {
    return <div className="p-12 text-center text-xs text-slate-400">No performance records found for this exam.</div>;
  }

  const handleExport = async () => {
    setExportError(null);
    try {
      setIsExporting(true);
      await downloadExamResultsCsv(examId, examTitle);
    } catch (err: any) {
      setExportError(
        err?.response?.data?.error?.message || err?.message || 'Failed to export exam results spreadsheet.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const scoreBracketsList = [
    { label: '81 - 100%', key: '81-100', color: 'bg-emerald-500' },
    { label: '61 - 80%', key: '61-80', color: 'bg-blue-500' },
    { label: '41 - 60%', key: '41-60', color: 'bg-amber-500' },
    { label: '0 - 40%', key: '0-40', color: 'bg-rose-500' },
  ];

  const maxBracketCount = Math.max(
    ...Object.values(analytics.score_brackets),
    1
  );

  return (
    <div className="space-y-6">
      {exportError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
          {exportError}
        </div>
      )}

      {/* Top Banner with CSV Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Performance & Results Analytics</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Aggregated statistics across all candidate submissions and proctoring telemetry
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || analytics.total_attempts === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs shrink-0 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>{isExporting ? 'Generating CSV...' : 'Export Results (CSV)'}</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Candidate Attempts</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
            <Users className="h-5 w-5 text-blue-500" /> {analytics.total_attempts}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{analytics.graded_attempts} evaluated</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Average Score</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
            <Sparkles className="h-5 w-5 text-amber-500" />{' '}
            {analytics.average_score !== null ? `${analytics.average_score} / ${totalMarks}` : 'N/A'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Median: {analytics.median_score !== null ? analytics.median_score : 'N/A'} pts
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pass Percentage</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="h-5 w-5" />{' '}
            {analytics.pass_percentage !== null ? `${analytics.pass_percentage}%` : 'N/A'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            High: {analytics.highest_score ?? 'N/A'} • Low: {analytics.lowest_score ?? 'N/A'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proctoring Telemetry</p>
          <p className="text-2xl font-bold text-rose-600 mt-1 flex items-center gap-1.5">
            <ShieldAlert className="h-5 w-5" /> {analytics.violation_stats.total_violations}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {analytics.violation_stats.auto_submitted_breaches} auto-submitted breaches
          </p>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Score Range Distribution</h4>
              <p className="text-xs text-slate-500">Student count grouped by percentage tier</p>
            </div>
            <Award className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            {scoreBracketsList.map((bracket) => {
              const count = analytics.score_brackets[bracket.key] || 0;
              const barWidth = Math.round((count / maxBracketCount) * 100);

              return (
                <div key={bracket.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{bracket.label}</span>
                    <span className="font-bold text-slate-900">{count} candidates</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`${bracket.color} h-full rounded-full transition-all duration-500`}
                      style={{ width: `${count > 0 ? Math.max(barWidth, 8) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Proctoring & Integrity Overview */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Security & Integrity Overview</h4>
              <p className="text-xs text-slate-500">Summary of testing environment events and limits</p>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Total Recorded Breaches</p>
                <p className="text-[11px] text-slate-500">Tab switches, window defocus, clipboard actions</p>
              </div>
              <span className="text-base font-extrabold text-slate-900">
                {analytics.violation_stats.total_violations}
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Candidates with Infractions</p>
                <p className="text-[11px] text-slate-500">Attempts with at least one recorded event</p>
              </div>
              <span className="text-base font-extrabold text-amber-600">
                {analytics.violation_stats.attempts_with_violations} of {analytics.total_attempts}
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Forced Session Terminations</p>
                <p className="text-[11px] text-slate-500">Exceeded maximum permitted violations limit</p>
              </div>
              <span className="text-base font-extrabold text-rose-600">
                {analytics.violation_stats.auto_submitted_breaches}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
