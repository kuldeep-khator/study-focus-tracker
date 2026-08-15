import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { AuthView } from './components/AuthView';
import { PersonalDashboard } from './components/PersonalDashboard';
import { ActiveSessionView } from './components/ActiveSessionView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SessionHistoryView } from './components/SessionHistoryView';
import { SettingsModal } from './components/SettingsModal';
import { SessionSummaryModal } from './components/SessionSummaryModal';
import { 
  AppSettings, CalibrationData, FocusState, StudentProfile, 
  StudySession, TrackerMetrics, User 
} from './types';
import { 
  getFirestoreUserProfile,
  getFirestoreStudentProfiles,
  saveFirestoreStudentProfile,
  deleteFirestoreStudentProfile,
  getFirestoreSettings,
  saveFirestoreSettings,
  getFirestoreCalibration,
  saveFirestoreCalibration,
  getFirestoreStudySessions,
  saveFirestoreStudySession,
  deleteFirestoreStudySession,
  clearAllFirestoreStudySessions
} from './utils/firestore';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut, reload, User as FirebaseUser } from 'firebase/auth';
import { playDistractionAlertSound, playFocusRestoredSound, playSessionCompleteSound } from './utils/audio';
import { AlertTriangle, Loader2 } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
  distractionThreshold: 5,
  notificationCooldown: 60,
  sensitivity: 'medium',
  cameraPreview: true,
  wireframeOverlay: true,
  audioAlerts: true,
  browserNotifications: false,
  dailyGoalMinutes: 120,
  simulationMode: false,
};

const DEFAULT_CALIBRATION: CalibrationData = {
  baselineYaw: 0,
  baselinePitch: 0,
  baselineRoll: 0,
  baselineGazeX: 0,
  baselineGazeY: 0,
  baselineFaceScale: 1.0,
  isCalibrated: false,
};

export default function App() {
  // Authentication & Verification State
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [unverifiedFirebaseUser, setUnverifiedFirebaseUser] = useState<FirebaseUser | null>(null);

  // Primary Navigation Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'session' | 'analytics' | 'history' | 'settings'>('dashboard');
  
  // User-Scoped Stored Data State (Firestore Source of Truth)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [calibration, setCalibration] = useState<CalibrationData>(DEFAULT_CALIBRATION);
  const [studentProfiles, setStudentProfiles] = useState<StudentProfile[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string>('');
  const [sessions, setSessions] = useState<StudySession[]>([]);

  // Live session status & modals
  const [focusState, setFocusState] = useState<FocusState>('IDLE');
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [completedSession, setCompletedSession] = useState<StudySession | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<TrackerMetrics | undefined>(undefined);
  
  // Logout protection modal state
  const [showLogoutProtectionModal, setShowLogoutProtectionModal] = useState<boolean>(false);

  // 1. Firebase Auth State Listener & Reload Verification
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setAuthLoading(true);
      if (fbUser) {
        try {
          // Force reload user to get fresh emailVerified status from Firebase backend
          await reload(fbUser);
          
          if (!fbUser.emailVerified) {
            // Block dashboard access for unverified users
            setUnverifiedFirebaseUser(fbUser);
            setCurrentUser(null);
            setAuthLoading(false);
            return;
          }

          // User is authenticated & verified!
          setUnverifiedFirebaseUser(null);
          
          // Load Firestore Profile
          let profile = await getFirestoreUserProfile(fbUser.uid);
          if (!profile) {
            profile = {
              id: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Student',
              email: fbUser.email || '',
              createdAt: Date.now(),
              lastLoginAt: Date.now(),
            };
          }
          setCurrentUser(profile);
        } catch (error) {
          console.error("Auth state processing error:", error);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
        setUnverifiedFirebaseUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Load User Data from Firestore upon verified login
  useEffect(() => {
    if (!currentUser) {
      setSettings(DEFAULT_SETTINGS);
      setCalibration(DEFAULT_CALIBRATION);
      setStudentProfiles([]);
      setActiveStudentId('');
      setSessions([]);
      return;
    }

    const loadUserData = async () => {
      try {
        const [loadedSettings, loadedCalib, loadedProfiles, loadedSessions] = await Promise.all([
          getFirestoreSettings(currentUser.id),
          getFirestoreCalibration(currentUser.id),
          getFirestoreStudentProfiles(currentUser.id),
          getFirestoreStudySessions(currentUser.id),
        ]);

        if (loadedSettings) {
          setSettings(loadedSettings);
        } else {
          setSettings(DEFAULT_SETTINGS);
        }

        if (loadedCalib) {
          setCalibration(loadedCalib);
        } else {
          setCalibration(DEFAULT_CALIBRATION);
        }

        if (loadedProfiles && loadedProfiles.length > 0) {
          setStudentProfiles(loadedProfiles);
          setActiveStudentId(loadedProfiles[0].id);
        } else {
          // Create initial default profile for new user in Firestore
          const defaultProfile: StudentProfile = {
            id: `profile-${currentUser.id}-primary`,
            name: currentUser.name || 'Student Profile',
            avatarColor: '#4f46e5',
            baselineYaw: 0,
            baselinePitch: 0,
            baselineRoll: 0,
            baselineGazeX: 0,
            baselineGazeY: 0,
            baselineFaceX: 0.5,
            baselineFaceY: 0.5,
            baselineFaceScale: 1.0,
            isCalibrated: false,
            yawLimit: 20,
            pitchLimit: 15,
            gazeLimit: 20,
            facePosTolerance: 25,
            distractionDelay: 5,
            preset: 'normal',
            outOfFocusBoundaryEnabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setStudentProfiles([defaultProfile]);
          setActiveStudentId(defaultProfile.id);
          saveFirestoreStudentProfile(currentUser.id, defaultProfile).catch(e => console.error(e));
        }

        if (loadedSessions) {
          setSessions(loadedSessions);
        } else {
          setSessions([]);
        }
      } catch (err) {
        console.error("Failed to load user data from Firestore:", err);
      }
    };

    loadUserData();
  }, [currentUser?.id]);

  // Derived Active Student Profile
  const activeProfile = useMemo(() => {
    const profiles = Array.isArray(studentProfiles) && studentProfiles.length > 0 ? studentProfiles : [];
    return profiles.find(p => p.id === activeStudentId) || profiles[0] || {
      id: currentUser ? `profile-${currentUser.id}-primary` : 'default',
      name: currentUser ? currentUser.name : 'Student Profile',
      baselineYaw: 0,
      baselinePitch: 0,
      baselineRoll: 0,
      baselineGazeX: 0,
      baselineGazeY: 0,
      baselineFaceX: 0.5,
      baselineFaceY: 0.5,
      baselineFaceScale: 1.0,
      yawLimit: 20,
      pitchLimit: 15,
      gazeLimit: 20,
      facePosTolerance: 25,
      distractionDelay: 5,
      isCalibrated: false,
      preset: 'normal',
      outOfFocusBoundaryEnabled: true,
      avatarColor: '#4f46e5',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }, [studentProfiles, activeStudentId, currentUser]);

  // Handle student profile updates
  const handleUpdateProfile = (updated: StudentProfile) => {
    if (!currentUser) return;
    const profiles = Array.isArray(studentProfiles) ? studentProfiles : [];
    const nextProfiles = profiles.map(p => (p.id === updated.id ? updated : p));
    setStudentProfiles(nextProfiles);
    saveFirestoreStudentProfile(currentUser.id, updated).catch(err => console.error(err));
  };

  const handleCreateProfile = (name: string) => {
    if (!currentUser) return;
    const profiles = Array.isArray(studentProfiles) ? studentProfiles : [];
    const newProfile: StudentProfile = {
      id: `student-${Date.now()}`,
      name: name.trim() || `Student ${profiles.length + 1}`,
      avatarColor: ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'][profiles.length % 6],
      baselineYaw: 0,
      baselinePitch: 0,
      baselineRoll: 0,
      baselineGazeX: 0,
      baselineGazeY: 0,
      baselineFaceX: 0.5,
      baselineFaceY: 0.5,
      baselineFaceScale: 1.0,
      isCalibrated: false,
      yawLimit: 20,
      pitchLimit: 15,
      gazeLimit: 20,
      facePosTolerance: 25,
      distractionDelay: 5,
      preset: 'normal',
      outOfFocusBoundaryEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const nextProfiles = [...profiles, newProfile];
    setStudentProfiles(nextProfiles);
    setActiveStudentId(newProfile.id);
    saveFirestoreStudentProfile(currentUser.id, newProfile).catch(err => console.error(err));
  };

  const handleDeleteProfile = (id: string) => {
    if (!currentUser) return;
    const profiles = Array.isArray(studentProfiles) ? studentProfiles : [];
    if (profiles.length <= 1) return;
    const nextProfiles = profiles.filter(p => p.id !== id);
    setStudentProfiles(nextProfiles);
    if (activeStudentId === id) {
      setActiveStudentId(nextProfiles[0].id);
    }
    deleteFirestoreStudentProfile(currentUser.id, id).catch(err => console.error(err));
  };

  const handleSelectStudent = (id: string) => {
    setActiveStudentId(id);
  };

  // Save settings on update
  const handleUpdateSettings = (updated: AppSettings) => {
    if (!currentUser) return;
    setSettings(updated);
    saveFirestoreSettings(currentUser.id, updated).catch(err => console.error(err));
  };

  // Save calibration on completion
  const handleCalibrationComplete = (calib: CalibrationData) => {
    if (!currentUser) return;
    setCalibration(calib);
    setIsCalibrating(false);
    saveFirestoreCalibration(currentUser.id, calib).catch(err => console.error(err));

    if (activeProfile) {
      const updatedProfile: StudentProfile = {
        ...activeProfile,
        baselineYaw: calib.baselineYaw,
        baselinePitch: calib.baselinePitch,
        baselineRoll: calib.baselineRoll,
        baselineGazeX: calib.baselineGazeX,
        baselineGazeY: calib.baselineGazeY,
        isCalibrated: true,
        calibratedAt: calib.calibratedAt,
      };
      handleUpdateProfile(updatedProfile);
    }
  };

  // Save completed session to Firestore
  const handleSessionComplete = (session: StudySession) => {
    if (!currentUser) return;
    const next = [session, ...sessions];
    setSessions(next);
    setCompletedSession(session);
    setFocusState('IDLE');
    saveFirestoreStudySession(currentUser.id, session).catch(err => console.error(err));
  };

  // Update session from summary modal (with notes & AI Coach summary)
  const handleSaveModalSession = (updatedSession: StudySession) => {
    if (!currentUser) return;
    const updated = sessions.map(s => (s.id === updatedSession.id ? updatedSession : s));
    setSessions(updated);
    setCompletedSession(null);
    saveFirestoreStudySession(currentUser.id, updatedSession).catch(err => console.error(err));
  };

  const handleDeleteSession = (id: string) => {
    if (!currentUser) return;
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    deleteFirestoreStudySession(currentUser.id, id).catch(err => console.error(err));
  };

  const handleClearSessions = () => {
    if (!currentUser) return;
    setSessions([]);
    clearAllFirestoreStudySessions(currentUser.id).catch(err => console.error(err));
  };

  const handleClearAllData = () => {
    if (!currentUser) return;
    setSessions([]);
    clearAllFirestoreStudySessions(currentUser.id).catch(err => console.error(err));
    setSettings(DEFAULT_SETTINGS);
    saveFirestoreSettings(currentUser.id, DEFAULT_SETTINGS).catch(err => console.error(err));
  };

  const handleResetCalibration = () => {
    if (!currentUser) return;
    setCalibration(DEFAULT_CALIBRATION);
    saveFirestoreCalibration(currentUser.id, DEFAULT_CALIBRATION).catch(err => console.error(err));

    if (activeProfile) {
      handleUpdateProfile({
        ...activeProfile,
        baselineYaw: 0,
        baselinePitch: 0,
        baselineRoll: 0,
        baselineGazeX: 0,
        baselineGazeY: 0,
        isCalibrated: false,
        calibratedAt: undefined,
      });
    }
  };

  // Calculate today's study minutes purely from user's verified Firestore sessions
  const todayStudyMinutes = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaySessions = sessions.filter(s => s.startTime >= startOfToday.getTime());
    const totalSecs = todaySessions.reduce((acc, s) => acc + s.duration, 0);
    return Math.round(totalSecs / 60);
  }, [sessions]);

  // Is a study session actively running?
  const isSessionActive = focusState !== 'IDLE' && focusState !== 'PAUSED';

  // Logout Click Handler (with session active protection)
  const handleLogoutClick = () => {
    if (isSessionActive) {
      setShowLogoutProtectionModal(true);
    } else {
      executeLogout();
    }
  };

  const executeLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Firebase signOut error:', e);
    }
    setCurrentUser(null);
    setUnverifiedFirebaseUser(null);
    setFocusState('IDLE');
    setIsCalibrating(false);
    setShowLogoutProtectionModal(false);
  };

  // 1. Loading Authentication State Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-300">Checking Firebase authentication...</p>
      </div>
    );
  }

  // 2. Unauthenticated or Unverified User Screen
  if (!currentUser) {
    return (
      <AuthView
        unverifiedUser={unverifiedFirebaseUser}
        onClearUnverified={() => setUnverifiedFirebaseUser(null)}
        onAuthSuccess={(user) => {
          setUnverifiedFirebaseUser(null);
          setCurrentUser(user);
        }}
      />
    );
  }

  // 3. Authenticated & Verified Dashboard
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-indigo-500/20 selection:text-indigo-700">
      
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        focusState={focusState}
        isTracking={focusState === 'FOCUSED' || focusState === 'DRIFTING' || focusState === 'DISTRACTED' || focusState === 'NO_FACE'}
        todayStudyMinutes={todayStudyMinutes}
        onOpenCalibration={() => {
          setActiveTab('session');
          setIsCalibrating(true);
        }}
        currentUser={currentUser}
        onLogoutClick={handleLogoutClick}
      />

      {/* Main Content Views */}
      <main className="flex-1 pb-10">
        
        {/* 1. PERSONALIZED USER DASHBOARD */}
        {activeTab === 'dashboard' && (
          <PersonalDashboard
            user={currentUser}
            sessions={sessions}
            onStartStudySession={() => setActiveTab('session')}
            onViewAllHistory={() => setActiveTab('history')}
            onOpenCalibration={() => {
              setActiveTab('session');
              setIsCalibrating(true);
            }}
          />
        )}

        {/* 2. ACTIVE STUDY TRACKER SESSION */}
        {activeTab === 'session' && (
          <ActiveSessionView
            settings={settings}
            activeProfile={activeProfile}
            profiles={studentProfiles}
            onSelectProfile={handleSelectStudent}
            onOpenCalibration={() => setIsCalibrating(true)}
            onCalibrationComplete={handleCalibrationComplete}
            onSessionComplete={handleSessionComplete}
            onPlaySound={(type) => {
              if (type === 'distraction') playDistractionAlertSound();
              if (type === 'restored') playFocusRestoredSound();
              if (type === 'completed') playSessionCompleteSound();
            }}
            isCalibrating={isCalibrating}
            onStartCalibration={() => setIsCalibrating(true)}
            onCancelCalibration={() => setIsCalibrating(false)}
            onMetricsUpdate={(m) => {
              setLatestMetrics(m);
              setFocusState(m.state);
            }}
            userId={currentUser.id}
          />
        )}

        {/* 3. ANALYTICS & TRENDS */}
        {activeTab === 'analytics' && (
          <AnalyticsDashboard sessions={sessions} />
        )}

        {/* 4. STUDY SESSION HISTORY */}
        {activeTab === 'history' && (
          <SessionHistoryView
            sessions={sessions}
            onDeleteSession={handleDeleteSession}
          />
        )}

        {/* 5. SETTINGS & HARDWARE PRIVACY HUB */}
        {activeTab === 'settings' && (
          <SettingsModal
            settings={settings}
            calibration={calibration}
            sessions={sessions}
            onUpdateSettings={handleUpdateSettings}
            onClearSessions={handleClearSessions}
            onClearAllData={handleClearAllData}
            onResetCalibration={handleResetCalibration}
            onPlayTestSound={playDistractionAlertSound}
          />
        )}

      </main>

      {/* COMPLETED SESSION SUMMARY MODAL */}
      {completedSession && (
        <SessionSummaryModal
          session={completedSession}
          onSaveAndClose={handleSaveModalSession}
          onStartNewSession={() => {
            setCompletedSession(null);
            setActiveTab('session');
          }}
        />
      )}

      {/* LOGOUT ACTIVE SESSION PROTECTION MODAL */}
      {showLogoutProtectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Active Study Session in Progress
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your study session is still running. Please end your study session to record your focus statistics to Firestore before logging out.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                id="btn-modal-continue-studying"
                onClick={() => setShowLogoutProtectionModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Continue Studying
              </button>
              <button
                id="btn-modal-end-and-logout"
                onClick={executeLogout}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer"
              >
                End Session & Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="py-5 bg-white border-t border-slate-200 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <p className="text-slate-600 font-medium">
              StudyFocus AI &bull; Firebase Auth & Cloud Firestore &bull; User: {currentUser.name}
            </p>
          </div>
          <div className="flex items-center gap-4 text-slate-500 font-medium">
            <button
              onClick={() => {
                setActiveTab('session');
                setIsCalibrating(true);
              }}
              className="hover:text-indigo-600 transition-colors cursor-pointer"
            >
              Pose Calibration
            </button>
            <span>&bull;</span>
            <button
              onClick={() => setActiveTab('settings')}
              className="hover:text-indigo-600 transition-colors cursor-pointer"
            >
              Privacy & Settings
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
