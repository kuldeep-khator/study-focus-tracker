import React, { useMemo } from 'react';
import { 
  Clock, Target, Flame, AlertTriangle, Play, Sparkles, 
  Calendar, Award, ArrowRight, ShieldCheck, ChevronRight, Compass
} from 'lucide-react';
import { StudySession, User } from '../types';

interface PersonalDashboardProps {
  user: User;
  sessions: StudySession[];
  onStartStudySession: () => void;
  onViewAllHistory: () => void;
  onOpenCalibration: () => void;
}

export const PersonalDashboard: React.FC<PersonalDashboardProps> = ({
  user,
  sessions,
  onStartStudySession,
  onViewAllHistory,
  onOpenCalibration,
}) => {
  // Calculate Today's and Weekly statistics strictly from real user sessions
  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOf7DaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Today's sessions
    const todaySessions = sessions.filter(s => s.startTime >= startOfToday);
    const todayStudyTime = todaySessions.reduce((acc, s) => acc + s.duration, 0);
    const todayFocusedTime = todaySessions.reduce((acc, s) => acc + s.focusedTime, 0);
    const todayDistractionTime = todaySessions.reduce((acc, s) => acc + s.distractionTime, 0);
    const todayDistractionEvents = todaySessions.reduce((acc, s) => acc + (s.distractionCount || 0), 0);
    const todayFocusScore = todaySessions.length > 0
      ? Math.round(todaySessions.reduce((acc, s) => acc + s.focusScore, 0) / todaySessions.length)
      : 0;

    // Weekly sessions
    const weeklySessions = sessions.filter(s => s.startTime >= startOf7DaysAgo);
    const weeklyStudyTime = weeklySessions.reduce((acc, s) => acc + s.duration, 0);
    const weeklyFocusScore = weeklySessions.length > 0
      ? Math.round(weeklySessions.reduce((acc, s) => acc + s.focusScore, 0) / weeklySessions.length)
      : 0;

    // Overall metrics
    const totalSessions = sessions.length;
    const longestStreak = Math.max(...sessions.map(s => s.longestStreak || 0), 0);

    return {
      todayStudyTime,
      todayFocusedTime,
      todayDistractionTime,
      todayDistractionEvents,
      todayFocusScore,
      todaySessionsCount: todaySessions.length,
      weeklyStudyTime,
      weeklyFocusScore,
      weeklySessionsCount: weeklySessions.length,
      totalSessions,
      longestStreak,
    };
  }, [sessions]);

  const formatDuration = (secs: number) => {
    if (secs <= 0) return '0m';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatMinSec = (secs: number) => {
    if (secs <= 0) return '0s';
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (mins > 0) return `${mins}m ${s > 0 ? `${s}s` : ''}`;
    return `${s}s`;
  };

  const recentSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.startTime - a.startTime).slice(0, 5);
  }, [sessions]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Personalized Study Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-display tracking-tight text-white">
              Welcome, {user.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Real-time computer vision actively protects your attention zone. All statistics and distraction counts are calculated from your real study sessions.
            </p>
          </div>

          {/* Quick CTA Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-dashboard-start-session"
              onClick={onStartStudySession}
              className="px-5 py-3 rounded-xl font-semibold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md hover:shadow-indigo-500/25 flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Study Session</span>
            </button>
            <button
              id="btn-dashboard-calibrate"
              onClick={onOpenCalibration}
              className="px-4 py-3 rounded-xl font-semibold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Compass className="w-4 h-4 text-indigo-400" />
              <span>Tune Limits</span>
            </button>
          </div>
        </div>

        {/* Decorative ambient gradient */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* TODAY'S ACTUAL STATISTICS GRID */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 font-display flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Today's Study Performance</span>
          </h2>
          <span className="text-xs text-slate-500">
            {stats.todaySessionsCount} session{stats.todaySessionsCount === 1 ? '' : 's'} today
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Today's Study Time */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Today's Study Time</span>
              <Clock className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono text-slate-900">
              {formatDuration(stats.todayStudyTime)}
            </p>
            <p className="text-[11px] text-slate-400">Total active session duration</p>
          </div>

          {/* Today's Focus Score */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Today's Focus Score</span>
              <Target className="w-4 h-4 text-emerald-600" />
            </div>
            <p className={`text-xl sm:text-2xl font-bold font-mono ${
              stats.todayFocusScore >= 80 ? 'text-emerald-600' : stats.todayFocusScore > 0 ? 'text-amber-600' : 'text-slate-400'
            }`}>
              {stats.todaySessionsCount > 0 ? `${stats.todayFocusScore}%` : '—'}
            </p>
            <p className="text-[11px] text-slate-400">Average attention ratio</p>
          </div>

          {/* Today's Focused Time */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Today's Focused Time</span>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-700">
              {formatDuration(stats.todayFocusedTime)}
            </p>
            <p className="text-[11px] text-slate-400">Inside screen boundary</p>
          </div>

          {/* Today's Distraction Time */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Today's Distraction Time</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono text-rose-600">
              {formatMinSec(stats.todayDistractionTime)}
            </p>
            <p className="text-[11px] text-slate-400">Drift beyond allowed limits</p>
          </div>

          {/* Today's Distraction Events */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Today's Distraction Events</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono text-slate-900">
              {stats.todayDistractionEvents}
            </p>
            <p className="text-[11px] text-slate-400">Individual look-away events</p>
          </div>
        </div>
      </div>

      {/* WEEKLY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              7-Day Trend
            </span>
            <h3 className="text-sm font-semibold text-slate-700">Weekly Study Time</h3>
            <p className="text-2xl font-bold font-mono text-slate-900">
              {formatDuration(stats.weeklyStudyTime)}
            </p>
            <p className="text-xs text-slate-500">Across {stats.weeklySessionsCount} completed sessions</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              Consistency
            </span>
            <h3 className="text-sm font-semibold text-slate-700">Weekly Focus Score</h3>
            <p className={`text-2xl font-bold font-mono ${stats.weeklyFocusScore > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {stats.weeklySessionsCount > 0 ? `${stats.weeklyFocusScore}%` : 'No weekly data'}
            </p>
            <p className="text-xs text-slate-500">Weighted focus quality</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Target className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* RECENT STUDY SESSIONS LIST / ZERO MOCK DATA EMPTY STATE */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 font-display">
              Recent Study Sessions
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified computer-vision records for {user.name}
            </p>
          </div>
          {sessions.length > 0 && (
            <button
              id="btn-view-all-history"
              onClick={onViewAllHistory}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({sessions.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          /* MANDATED AUTHENTIC EMPTY STATE */
          <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-3">
              <Award className="w-7 h-7" />
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-800 font-display mb-1">
              You haven't completed a study session yet.
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
              Start your first session to build your focus history. The AI will monitor your screen alignment locally and record genuine focus statistics.
            </p>
            <button
              id="btn-empty-start-session"
              onClick={onStartStudySession}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Your First Study Session</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentSessions.map((session) => {
              const dateStr = new Date(session.startTime).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const timeStr = new Date(session.startTime).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={session.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold font-mono text-xs shrink-0 border ${
                      session.focusScore >= 85
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : session.focusScore >= 70
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {session.focusScore}%
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 font-display">
                        {session.subject || 'General Study'}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {dateStr} at {timeStr} &bull; {formatDuration(session.duration)} total ({formatDuration(session.focusedTime)} focused)
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-medium text-slate-700 block">
                      {session.distractionCount || 0} distraction{session.distractionCount === 1 ? '' : 's'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Streak: {formatMinSec(session.longestStreak || 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Privacy Guarantee Banner */}
      <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-start sm:items-center gap-3 text-xs text-slate-700">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
        <div className="space-y-0.5">
          <p className="font-semibold text-emerald-950">
            Hardware & Privacy Security Active
          </p>
          <p className="text-slate-600 text-[11px]">
            Your camera is automatically turned OFF while viewing the dashboard. It will only turn on when you explicitly start a study session.
          </p>
        </div>
      </div>

    </div>
  );
};
