import React, { useState } from 'react';
import { 
  History, Calendar, Clock, Trash2, Search, ChevronDown, ChevronUp, 
  Bot, FileText, Download, Mail, Activity, CheckCircle2 
} from 'lucide-react';
import { StudySession } from '../types';
import { EmailSessionModal } from './EmailSessionModal';

interface SessionHistoryViewProps {
  sessions: StudySession[];
  userEmail?: string;
  onUpdateSession?: (updated: StudySession) => void;
  onDeleteSession: (id: string) => void;
}

export const SessionHistoryView: React.FC<SessionHistoryViewProps> = ({
  sessions,
  userEmail = '',
  onUpdateSession,
  onDeleteSession,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [emailModalSession, setEmailModalSession] = useState<StudySession | null>(null);

  const filteredSessions = sessions.filter(s => {
    const term = searchQuery.toLowerCase();
    return (
      (s.subject || '').toLowerCase().includes(term) ||
      (s.notes || '').toLowerCase().includes(term) ||
      new Date(s.startTime).toLocaleDateString().toLowerCase().includes(term)
    );
  });

  const formatMinSec = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (mins > 0) return `${mins}m ${s > 0 ? `${s}s` : ''}`;
    return `${s}s`;
  };

  const exportSingleSessionJson = (session: StudySession) => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-session-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
            Study Session History
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Detailed log of your deep work blocks, upper body posture, distraction analytics, and email reports
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="input-search-sessions"
            type="text"
            placeholder="Search by subject or notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white text-slate-900 text-xs sm:text-sm rounded-xl pl-9 pr-3 py-2 border border-slate-200 focus:outline-none focus:border-indigo-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Session List */}
      {filteredSessions.length > 0 ? (
        <div className="space-y-3">
          {filteredSessions.map(session => {
            const isExpanded = expandedId === session.id;
            const dateStr = new Date(session.startTime).toLocaleDateString(undefined, {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            const timeStr = new Date(session.startTime).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={session.id}
                className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Main Row Summary */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold font-mono text-sm shrink-0 border ${
                      session.focusScore >= 85
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : session.focusScore >= 70
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {session.focusScore}%
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                          {session.subject || 'General Study'}
                        </h3>
                        {typeof session.avgPostureScore === 'number' && (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                            session.avgPostureScore >= 80
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : session.avgPostureScore >= 60
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            <Activity className="w-3 h-3" />
                            Posture: {session.avgPostureScore}%
                          </span>
                        )}
                        {session.emailedTo && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                            Emailed to {session.emailedTo}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {dateStr} at {timeStr}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatMinSec(session.duration)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Metrics & Expand Action */}
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="hidden md:flex items-center gap-4 text-xs text-slate-600 font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase block">Focused</span>
                        <span className="text-emerald-600 font-semibold">{formatMinSec(session.focusedTime)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase block">Distractions</span>
                        <span className="text-slate-700 font-semibold">{session.distractionCount}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmailModalSession(session);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Send or resend this saved session log via Gmail"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{session.emailedTo ? 'Resend' : 'Email Log'}</span>
                    </button>

                    <button
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      title={isExpanded ? 'Collapse' : 'Expand Details'}
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-4">
                    
                    {/* Session Metrics Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
                        <span className="text-[10px] uppercase text-slate-500 font-medium">Pure Focus Time</span>
                        <p className="text-sm font-bold font-mono text-emerald-600 mt-0.5">
                          {formatMinSec(session.focusedTime)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
                        <span className="text-[10px] uppercase text-slate-500 font-medium">Distraction Time</span>
                        <p className="text-sm font-bold font-mono text-red-600 mt-0.5">
                          {formatMinSec(session.distractionTime)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
                        <span className="text-[10px] uppercase text-slate-500 font-medium">Distraction Count</span>
                        <p className="text-sm font-bold font-mono text-slate-800 mt-0.5">
                          {session.distractionCount} events
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
                        <span className="text-[10px] uppercase text-slate-500 font-medium">Max Focus Streak</span>
                        <p className="text-sm font-bold font-mono text-indigo-600 mt-0.5">
                          {formatMinSec(session.longestStreak || session.focusedTime)}
                        </p>
                      </div>
                    </div>

                    {/* Upper Body Posture Card (if recorded) */}
                    {typeof session.avgPostureScore === 'number' && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-emerald-900">
                          <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>Upper Body Posture:</strong> {session.avgPostureScore}% &mdash; {session.postureSummary || 'Tracked'}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-700 flex items-center gap-3">
                          <span>Upright: <strong>{formatMinSec(session.uprightPostureTime || 0)}</strong></span>
                          <span>Slouch: <strong>{formatMinSec(session.slouchPostureTime || 0)}</strong></span>
                        </div>
                      </div>
                    )}

                    {/* AI Coach Summary (if generated) */}
                    {session.aiSummary && (
                      <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                          <Bot className="w-3.5 h-3.5" />
                          AI Study Coach Feedback
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                          {session.aiSummary}
                        </p>
                      </div>
                    )}

                    {/* Notes (if recorded) */}
                    {session.notes && (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          Personal Session Notes
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {session.notes}
                        </p>
                      </div>
                    )}

                    {/* Actions: Email, Export JSON or Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 text-xs">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailModalSession(session);
                          }}
                          className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-semibold transition-colors cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {session.emailedTo ? 'Resend Saved Log via Email' : 'Send Saved Log via Email'}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            exportSingleSessionJson(session);
                          }}
                          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export Raw JSON
                        </button>
                      </div>

                      <button
                        id={`btn-delete-session-${session.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this study session record?')) {
                            onDeleteSession(session.id);
                          }
                        }}
                        className="flex items-center gap-1.5 text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Record
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 rounded-2xl bg-white border border-slate-200 shadow-xs text-center space-y-3">
          <History className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 font-display">
            No Study Sessions Found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery ? 'No sessions match your search query.' : 'Complete your first study session to build your personal deep-work archive!'}
          </p>
        </div>
      )}

      {/* Email Confirmation Dialog */}
      {emailModalSession && (
        <EmailSessionModal
          session={emailModalSession}
          defaultRecipientEmail={userEmail}
          onClose={() => setEmailModalSession(null)}
          onEmailSent={(updatedSession) => {
            onUpdateSession?.(updatedSession);
            setEmailModalSession(updatedSession);
          }}
        />
      )}
    </div>
  );
};
