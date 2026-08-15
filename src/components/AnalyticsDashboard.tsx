import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  BarChart3, TrendingUp, Clock, Target, Flame, AlertTriangle, 
  Calendar, CheckCircle, Award, Sparkles, Filter 
} from 'lucide-react';
import { StudySession } from '../types';

interface AnalyticsDashboardProps {
  sessions: StudySession[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ sessions }) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');

  // Filter sessions by selected timeframe
  const filteredSessions = useMemo(() => {
    if (sessions.length === 0) return [];
    const now = Date.now();
    if (timeRange === '7d') {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      return sessions.filter(s => s.startTime >= cutoff);
    }
    if (timeRange === '30d') {
      const cutoff = now - 30 * 24 * 60 * 60 * 1000;
      return sessions.filter(s => s.startTime >= cutoff);
    }
    return sessions;
  }, [sessions, timeRange]);

  // Aggregate Total Statistics
  const aggregateStats = useMemo(() => {
    if (filteredSessions.length === 0) {
      return {
        totalDuration: 0,
        totalFocused: 0,
        totalDistraction: 0,
        avgFocusScore: 0,
        totalDistractions: 0,
        longestStreak: 0,
        sessionCount: 0,
      };
    }

    const totalDuration = filteredSessions.reduce((acc, s) => acc + s.duration, 0);
    const totalFocused = filteredSessions.reduce((acc, s) => acc + s.focusedTime, 0);
    const totalDistraction = filteredSessions.reduce((acc, s) => acc + s.distractionTime, 0);
    const totalDistractions = filteredSessions.reduce((acc, s) => acc + s.distractionCount, 0);
    const avgFocusScore = Math.round(
      filteredSessions.reduce((acc, s) => acc + s.focusScore, 0) / filteredSessions.length
    );
    const longestStreak = Math.max(...filteredSessions.map(s => s.longestStreak || 0), 0);

    return {
      totalDuration,
      totalFocused,
      totalDistraction,
      avgFocusScore,
      totalDistractions,
      longestStreak,
      sessionCount: filteredSessions.length,
    };
  }, [filteredSessions]);

  // Performance Trend Insight Calculation (Supported by actual stored data)
  const performanceInsight = useMemo(() => {
    if (sessions.length < 2) {
      return {
        text: 'Complete more study sessions to unlock trend comparisons and performance milestones.',
        type: 'neutral',
      };
    }

    const sorted = [...sessions].sort((a, b) => a.startTime - b.startTime);
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    const avgFirst = firstHalf.reduce((acc, s) => acc + s.focusScore, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((acc, s) => acc + s.focusScore, 0) / (secondHalf.length || 1);

    const diff = Math.round(avgSecond - avgFirst);

    if (diff > 0) {
      return {
        text: `Your focus score improved by +${diff}% across recent study sessions. Excellent habit progression!`,
        type: 'positive',
      };
    } else if (diff < 0) {
      return {
        text: `Recent focus averaged ${Math.abs(diff)}% lower. Consider shortening session blocks to 25-minute sprints to manage fatigue.`,
        type: 'warning',
      };
    } else {
      return {
        text: 'Your focus consistency is rock steady across study sessions. Keep up this disciplined cadence!',
        type: 'neutral',
      };
    }
  }, [sessions]);

  // Daily Focus Score Chart Data
  const dailyFocusData = useMemo(() => {
    const dayMap = new Map<string, { totalScore: number; count: number; dateStr: string; timestamp: number }>();

    filteredSessions.forEach(s => {
      const d = new Date(s.startTime);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const existing = dayMap.get(key) || { totalScore: 0, count: 0, dateStr: key, timestamp: s.startTime };
      existing.totalScore += s.focusScore;
      existing.count += 1;
      dayMap.set(key, existing);
    });

    return Array.from(dayMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(item => ({
        date: item.dateStr,
        focusScore: Math.round(item.totalScore / item.count),
      }));
  }, [filteredSessions]);

  // Weekly / Daily Study Time Volume (Minutes)
  const studyVolumeData = useMemo(() => {
    const dayMap = new Map<string, { minutes: number; focusedMin: number; dateStr: string; timestamp: number }>();

    filteredSessions.forEach(s => {
      const d = new Date(s.startTime);
      const key = d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
      const existing = dayMap.get(key) || { minutes: 0, focusedMin: 0, dateStr: key, timestamp: s.startTime };
      existing.minutes += Math.round(s.duration / 60);
      existing.focusedMin += Math.round(s.focusedTime / 60);
      dayMap.set(key, existing);
    });

    return Array.from(dayMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(item => ({
        day: item.dateStr,
        totalStudyMin: item.minutes,
        focusedMin: item.focusedMin,
      }));
  }, [filteredSessions]);

  // Focus vs Distraction Pie Data
  const focusPieData = useMemo(() => {
    const focusedMinutes = Math.round(aggregateStats.totalFocused / 60);
    const distractionMinutes = Math.round(aggregateStats.totalDistraction / 60);

    return [
      { name: 'Focused Time', value: focusedMinutes || 1, color: '#10b981' },
      { name: 'Distraction Time', value: distractionMinutes || 0, color: '#f43f5e' },
    ];
  }, [aggregateStats]);

  // Distraction Events per Session Chart Data
  const distractionsPerSessionData = useMemo(() => {
    return filteredSessions
      .slice(0, 10)
      .reverse()
      .map((s, idx) => ({
        session: s.subject ? (s.subject.length > 15 ? `${s.subject.slice(0, 15)}...` : s.subject) : `Session #${idx + 1}`,
        distractions: s.distractionCount,
        durationMin: Math.round(s.duration / 60),
      }));
  }, [filteredSessions]);

  const formatHoursMins = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  if (sessions.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-8 sm:p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white shadow-xs max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-4">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 font-display mb-2">
            No Study Analytics Recorded Yet
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
            You haven't completed a study session yet. Start your first session to build your focus history and unlock real-time attention trends, volume graphs, and distraction logs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header & Timeframe Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
            Study Analytics & Attention Trends
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Objective performance data derived from local computer-vision session logs
          </p>
        </div>

        {/* Timeframe Filter Buttons */}
        <div className="flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
          <button
            id="filter-7d"
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              timeRange === '7d' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last 7 Days
          </button>
          <button
            id="filter-30d"
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              timeRange === '30d' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last 30 Days
          </button>
          <button
            id="filter-all"
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              timeRange === 'all' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Dynamic Performance Summary Insight Banner */}
      <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start sm:items-center gap-3.5">
        <div className="w-9 h-9 rounded-xl bg-white border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-indigo-600">
            Study Performance Insight
          </span>
          <p className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5">
            {performanceInsight.text}
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Study Time</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900">
            {formatHoursMins(aggregateStats.totalDuration)}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium">
            {formatHoursMins(aggregateStats.totalFocused)} pure focus
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Avg Focus Score</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-600">
            {aggregateStats.avgFocusScore}%
          </p>
          <p className="text-[11px] text-slate-500">
            Across {aggregateStats.sessionCount} study blocks
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Distractions Handled</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900">
            {aggregateStats.totalDistractions}
          </p>
          <p className="text-[11px] text-red-600 font-medium">
            {formatHoursMins(aggregateStats.totalDistraction)} drift time
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Longest Focus Streak</span>
            <Award className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-indigo-600">
            {formatHoursMins(aggregateStats.longestStreak)}
          </p>
          <p className="text-[11px] text-slate-500">
            Max uninterrupted attention
          </p>
        </div>
      </div>

      {/* Main Charts Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Daily Focus Score % Trend */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                Daily Focus Score Trend
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Focus percentage maintained across each study date
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="h-64 w-full pt-4">
            {dailyFocusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyFocusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="focusGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.75rem', fontSize: '12px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: number) => [`${val}%`, 'Focus Score']}
                  />
                  <Area type="monotone" dataKey="focusScore" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#focusGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No session data for selected timeframe
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Weekly Study Time Volume */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                Study Time Volume (Minutes)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Total study duration vs focused duration per day
              </p>
            </div>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>

          <div className="h-64 w-full pt-4">
            {studyVolumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyVolumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} unit="m" tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.75rem', fontSize: '12px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: number, name: string) => [
                      `${val} mins`,
                      name === 'focusedMin' ? 'Focused Time' : 'Total Study Time'
                    ]}
                  />
                  <Bar dataKey="totalStudyMin" fill="#CBD5E1" radius={[4, 4, 0, 0]} name="Total Time" />
                  <Bar dataKey="focusedMin" fill="#6366f1" radius={[4, 4, 0, 0]} name="Focused Time" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No volume data recorded yet
              </div>
            )}
          </div>
        </div>

        {/* Chart 3: Focus vs Distraction Breakdown */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                Focus vs Distraction Breakdown
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Proportion of active study spent in flow state
              </p>
            </div>
            <Target className="w-4 h-4 text-indigo-600" />
          </div>

          <div className="h-64 w-full flex items-center justify-center pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={focusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {focusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.75rem', fontSize: '12px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => [`${val} mins`, 'Duration']}
                />
                <Legend 
                  formatter={(val) => <span className="text-xs text-slate-600">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Distraction Events per Session */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                Distraction Events per Session
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Number of times attention drifted beyond threshold
              </p>
            </div>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>

          <div className="h-64 w-full pt-4">
            {distractionsPerSessionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distractionsPerSessionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="session" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '0.75rem', fontSize: '12px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: number) => [`${val} events`, 'Distractions']}
                  />
                  <Bar dataKey="distractions" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No session logs available
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
