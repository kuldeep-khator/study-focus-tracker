import React from 'react';
import { 
  Play, BarChart3, History, Settings, ShieldCheck, Crosshair, 
  Flame, Sparkles, LayoutDashboard, LogOut, User as UserIcon
} from 'lucide-react';
import { FocusState, User } from '../types';

interface NavbarProps {
  activeTab: 'dashboard' | 'session' | 'analytics' | 'history' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'session' | 'analytics' | 'history' | 'settings') => void;
  focusState: FocusState;
  isTracking: boolean;
  todayStudyMinutes: number;
  onOpenCalibration: () => void;
  currentUser: User | null;
  onLogoutClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  focusState,
  isTracking,
  todayStudyMinutes,
  onOpenCalibration,
  currentUser,
  onLogoutClick,
}) => {
  // Focus State Badge renderer
  const getStatusBadge = () => {
    if (!isTracking) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          Camera Idle (OFF)
        </span>
      );
    }

    switch (focusState) {
      case 'FOCUSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Focused (Studying)
          </span>
        );
      case 'DRIFTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Drifting (Attention Window)
          </span>
        );
      case 'DISTRACTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Distracted
          </span>
        );
      case 'NO_FACE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            No Face Detected
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Session Paused (Camera OFF)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Standby (Camera OFF)
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Brand & Identity */}
        <div className="flex items-center space-x-3 shrink-0">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center space-x-2.5 focus:outline-none cursor-pointer text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              S
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm sm:text-base font-display tracking-tight block leading-tight">
                StudyFocus AI
              </span>
              <span className="text-[10px] text-slate-500 font-mono tracking-tight block">
                Local Vision & Privacy Engine
              </span>
            </div>
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
          
          {/* Dashboard Tab */}
          <button
            id="nav-tab-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          {/* Active Tracker Session Tab */}
          <button
            id="nav-tab-session"
            onClick={() => setActiveTab('session')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'session'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Study Tracker</span>
            {isTracking && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping ml-0.5" />
            )}
          </button>

          {/* Analytics Tab */}
          <button
            id="nav-tab-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden md:inline">Analytics</span>
          </button>

          {/* History Tab */}
          <button
            id="nav-tab-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden md:inline">History</span>
          </button>

          {/* Settings Tab */}
          <button
            id="nav-tab-settings"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden lg:inline">Settings</span>
          </button>
        </nav>

        {/* Right Status, Calibration & User Logout */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          
          {/* Status Badge */}
          <div className="hidden lg:block">{getStatusBadge()}</div>

          {/* Quick Calibrate Button */}
          <button
            id="btn-quick-calibrate"
            onClick={onOpenCalibration}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            title="Calibrate normal screen focus baseline"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-600" />
            <span>Calibrate</span>
          </button>

          {/* User Profile Chip & Logout Action */}
          {currentUser && (
            <div className="flex items-center gap-1.5 pl-1.5 sm:pl-2 border-l border-slate-200">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight truncate max-w-[100px]">
                  {currentUser.email}
                </span>
              </div>
              <button
                id="btn-navbar-logout"
                onClick={onLogoutClick}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Log out from StudyFocus AI"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
};
