import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  Trophy, Clock, Target, AlertTriangle, Sparkles, Check, 
  Flame, BookOpen, Share2, ArrowRight, Bot, Loader2 
} from 'lucide-react';
import { StudySession } from '../types';

interface SessionSummaryModalProps {
  session: StudySession;
  onSaveAndClose: (updatedSession: StudySession) => void;
  onStartNewSession: () => void;
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  session,
  onSaveAndClose,
  onStartNewSession,
}) => {
  const [subject, setSubject] = useState<string>(session.subject || 'General Study');
  const [notes, setNotes] = useState<string>(session.notes || '');
  const [aiFeedback, setAiFeedback] = useState<string>(session.aiSummary || '');
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);

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
            duration: session.duration,
            focusedTime: session.focusedTime,
            distractionTime: session.distractionTime,
            focusScore: session.focusScore,
            distractionCount: session.distractionCount,
            longestStreak: session.longestStreak,
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

  const handleSave = () => {
    const updated: StudySession = {
      ...session,
      subject,
      notes,
      aiSummary: aiFeedback,
    };
    onSaveAndClose(updated);
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
            {getPerformanceMessage(session.focusScore)}
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
              {formatMinSec(session.duration)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-emerald-600 mb-1 font-medium">
              <Target className="w-3.5 h-3.5 text-emerald-600" />
              <span>Focused Time</span>
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-600">
              {formatMinSec(session.focusedTime)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-amber-600 mb-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              <span>Focus Score</span>
            </div>
            <p className="text-2xl font-bold font-mono text-amber-600">
              {session.focusScore}%
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-red-600 mb-1 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span>Distracted Time</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono text-red-600">
              {formatMinSec(session.distractionTime)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-slate-500 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Distraction Events</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono text-slate-900">
              {session.distractionCount}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-indigo-600 mb-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-indigo-600" />
              <span>Longest Streak</span>
            </div>
            <p className="text-lg sm:text-xl font-bold font-mono text-indigo-600">
              {formatMinSec(session.longestStreak)}
            </p>
          </div>
        </div>

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
              Get personalized AI analysis on your attention stamina, distraction patterns, and ergonomic tips based strictly on this session's collected metrics.
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

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
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
  );
};
