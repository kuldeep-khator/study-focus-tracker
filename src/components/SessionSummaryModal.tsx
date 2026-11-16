import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  Trophy, Clock, Target, AlertTriangle, Sparkles, Check, 
  Flame, Bot, Loader2, Activity, Mail, CheckCircle2 
} from 'lucide-react';
import { StudySession } from '../types';
import { EmailSessionModal } from './EmailSessionModal';

interface SessionSummaryModalProps {
  session: StudySession;
  userEmail?: string;
  autoOpenEmailPrompt?: boolean;
  onSaveAndClose: (updatedSession: StudySession) => void;
  onUpdateSession?: (updatedSession: StudySession) => void;
  onStartNewSession: () => void;
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  session,
  userEmail = '',
  autoOpenEmailPrompt = false,
  onSaveAndClose,
  onUpdateSession,
  onStartNewSession,
}) => {
  const [currentSession, setCurrentSession] = useState<StudySession>(session);
  const [subject, setSubject] = useState<string>(session.subject || 'General Study');
  const [notes, setNotes] = useState<string>(session.notes || '');
  const [aiFeedback, setAiFeedback] = useState<string>(session.aiSummary || '');
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [showEmailModal, setShowEmailModal] = useState<boolean>(autoOpenEmailPrompt);

  useEffect(() => {
    setCurrentSession(session);
  }, [session]);

  // Trigger confetti burst on completion
  useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#14b8a6', '#f59e0b', '#38bdf8'],
      });
    } catch (e) {
      console.debug('Confetti error', e);
    }
  }, []);

  const formatMinSec = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (mins > 0) return `${mins}m ${s > 0 ? `${s}s` : ''}`;
    return `${s}s`;
  };

  // Performance assessment message
  const getPerformanceMessage = (score: number) => {
    if (score >= 90) return '🎉 Outstanding deep work! You achieved stellar laser focus throughout.';
    if (score >= 80) return '🌟 Great session! You maintained strong and consistent focus.';
    if (score >= 65) return '👍 Solid effort! Good study stamina with a few natural pauses.';
    return '💪 Every session builds endurance! Regular short breaks will boost your next block.';
  };

  // Request AI Study Coach Feedback via Express server
  const handleGenerateAiFeedback = async () => {
    setIsLoadingAi(true);
    try {
      const res = await fetch('/api/ai/coach-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionStats: {
            duration: currentSession.duration,
            focusedTime: currentSession.focusedTime,
            distractionTime: currentSession.distractionTime,
            focusScore: currentSession.focusScore,
            distractionCount: currentSession.distractionCount,
            longestStreak: currentSession.longestStreak,
            avgPostureScore: currentSession.avgPostureScore,
            postureSummary: currentSession.postureSummary,
            subject,
          },
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        setAiFeedback(data.feedback);
      }
    } catch (err) {
      console.error('Failed to get AI coach feedback', err);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const buildUpdatedSession = (): StudySession => ({
    ...currentSession,
    subject,
    notes,
    aiSummary: aiFeedback,
  });

  const handleSave = () => {
    onSaveAndClose(buildUpdatedSession());
  };

  const handleOpenEmailDialog = () => {
    const updated = buildUpdatedSession();
    setCurrentSession(updated);
    onUpdateSession?.(updated);
    setShowEmailModal(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl my-8 p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-2xl space-y-6">
        
        {/* Header with Trophy */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
            <Trophy className="w-7 h-7" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Study Session Complete 🎉
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            {getPerformanceMessage(currentSession.focusScore)}
          </p>
        </div>

        {/* Primary Stats Bento Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Study Time</span>
            </div>
            <p className="text-2xl font-bold font-mono text-slate-900">
              {formatMinSec(currentSession.duration)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-emerald-600 mb-1 font-medium">
              <Target className="w-3.5 h-3.5 text-emerald-600" />
              <span>Focused Time</span>
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-600">
              {formatMinSec(currentSession.focusedTime)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-amber-600 mb-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              <span>Focus Score</span>
            </div>
            <p className="text-2xl font-bold font-mono text-amber-600">
              {currentSession.focusScore}%
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-red-600 mb-1 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span>Distracted Time</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono text-red-600">
              {formatMinSec(currentSession.distractionTime)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Distraction Events</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono text-slate-900">
              {currentSession.distractionCount}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-indigo-600 mb-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-indigo-600" />
              <span>Longest Streak</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono text-indigo-600">
              {formatMinSec(currentSession.longestStreak)}
            </p>
          </div>
        </div>

        {/* Upper Body Posture Summary Card */}
        {typeof currentSession.avgPostureScore === 'number' && (
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  Upper Body Posture Summary
                </h3>
                <p className="text-xs text-emerald-900 mt-0.5">
                  {currentSession.postureSummary || 'Upper body ergonomics monitored throughout session.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs shrink-0">
              <div className="text-center">
                <span className="text-[10px] text-emerald-700 uppercase block">Score</span>
                <span className="text-lg font-bold text-emerald-700">{currentSession.avgPostureScore}%</span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-emerald-700 uppercase block">Upright</span>
                <span className="font-bold text-slate-800">{formatMinSec(currentSession.uprightPostureTime || 0)}</span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-amber-700 uppercase block">Slouch</span>
                <span className="font-bold text-amber-700">{formatMinSec(currentSession.slouchPostureTime || 0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* AI Study Coach Insights */}
        <div className="p-4 sm:p-5 rounded-xl bg-indigo-50/70 border border-indigo-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
                <Bot className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 font-display">
                AI Study Habits Coach
              </h3>
            </div>
            {!aiFeedback && (
              <button
                id="btn-get-ai-feedback"
                onClick={handleGenerateAiFeedback}
                disabled={isLoadingAi}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isLoadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {isLoadingAi ? 'Analyzing...' : 'Generate AI Coach Advice'}
              </button>
            )}
          </div>

          {aiFeedback ? (
            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line p-3.5 rounded-xl bg-white border border-indigo-100 shadow-2xs">
              {aiFeedback}
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Get personalized AI analysis on your attention stamina, upper body posture, distraction patterns, and ergonomic tips based strictly on this session's collected metrics.
            </p>
          )}
        </div>

        {/* Editable Details: Subject & Notes */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Subject / Topic Tag
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-white text-slate-900 text-xs sm:text-sm rounded-xl px-3 py-2 border border-slate-200 focus:outline-none focus:border-indigo-500 shadow-2xs"
              placeholder="e.g. Mathematics, Organic Chemistry..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Session Reflections / Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-white text-slate-900 text-xs sm:text-sm rounded-xl px-3 py-2 border border-slate-200 focus:outline-none focus:border-indigo-500 shadow-2xs"
              placeholder="What chapters did you cover? What helped you stay focused?"
            />
          </div>
        </div>

        {/* Email Delivery Status Banner */}
        {currentSession.emailedTo && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              Saved log emailed to <strong>{currentSession.emailedTo}</strong>
            </span>
            {currentSession.emailedAt && (
              <span className="font-mono text-[11px] text-emerald-700">
                {new Date(currentSession.emailedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            id="btn-send-summary-email"
            type="button"
            onClick={handleOpenEmailDialog}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs sm:text-sm border border-emerald-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Mail className="w-4 h-4 text-emerald-600" />
            <span>{currentSession.emailedTo ? 'Resend Log via Gmail' : 'Send Log via Gmail'}</span>
          </button>

          <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 w-full sm:w-auto">
            <button
              id="btn-start-another-session"
              onClick={() => {
                handleSave();
                onStartNewSession();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm border border-slate-200 transition-colors cursor-pointer"
            >
              Start Another Session
            </button>
            <button
              id="btn-save-session"
              onClick={handleSave}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Save & Return to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Explicit Confirmation Modal for Gmail Sending */}
      {showEmailModal && (
        <EmailSessionModal
          session={buildUpdatedSession()}
          defaultRecipientEmail={userEmail}
          onClose={() => setShowEmailModal(false)}
          onEmailSent={(updatedWithMail) => {
            setCurrentSession(updatedWithMail);
            onUpdateSession?.(updatedWithMail);
          }}
        />
      )}
    </div>
  );
};
