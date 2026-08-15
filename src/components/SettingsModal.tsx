import React, { useState } from 'react';
import { 
  Settings, ShieldCheck, Trash2, Download, RefreshCw, Volume2, 
  Eye, Sliders, Bell, CheckCircle2, Lock, Cpu, AlertTriangle 
} from 'lucide-react';
import { AppSettings, CalibrationData, StudySession } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  calibration: CalibrationData;
  sessions: StudySession[];
  onUpdateSettings: (settings: AppSettings) => void;
  onClearSessions: () => void;
  onClearAllData: () => void;
  onResetCalibration: () => void;
  onPlayTestSound: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  calibration,
  sessions,
  onUpdateSettings,
  onClearSessions,
  onClearAllData,
  onResetCalibration,
  onPlayTestSound,
}) => {
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2500);
  };

  const exportAllDataJson = () => {
    const payload = {
      exportDate: new Date().toISOString(),
      settings,
      calibration,
      sessions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-focus-tracker-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Data exported successfully!');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-slate-600" />
          Settings & Privacy Hub
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Configure detection tolerances, notification frequencies, and local privacy storage
        </p>
      </div>

      {/* Section 1: Focus & Distraction Engine Tuning */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
        <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600" />
          Focus & Distraction Detection Parameters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Distraction Threshold */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Distraction Threshold
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Grace period for natural blinking, note-checking, and brief micro-movements before triggering distraction.
            </p>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[5, 10, 15, 20].map(sec => (
                <button
                  key={sec}
                  id={`btn-threshold-${sec}`}
                  onClick={() => {
                    onUpdateSettings({ ...settings, distractionThreshold: sec });
                    triggerToast(`Threshold set to ${sec} seconds`);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                    settings.distractionThreshold === sec
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Notification Cooldown */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Notification Cooldown
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Minimum time gap between automatic reminder notifications to prevent alert fatigue.
            </p>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {[30, 60, 120].map(sec => (
                <button
                  key={sec}
                  id={`btn-cooldown-${sec}`}
                  onClick={() => {
                    onUpdateSettings({ ...settings, notificationCooldown: sec });
                    triggerToast(`Notification cooldown set to ${sec}s`);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                    settings.notificationCooldown === sec
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Focus Sensitivity */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Focus Sensitivity
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Tolerance angle for head turns and eye divergence from the center study screen.
            </p>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {(['low', 'medium', 'high'] as const).map(lvl => (
                <button
                  key={lvl}
                  id={`btn-sensitivity-${lvl}`}
                  onClick={() => {
                    onUpdateSettings({ ...settings, sensitivity: lvl });
                    triggerToast(`Sensitivity set to ${lvl}`);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    settings.sensitivity === lvl
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calibration Reset Row */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">Current Pose Calibration Baseline</span>
              {calibration.isCalibrated ? (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-medium border border-indigo-200">
                  Active ({calibration.calibratedAt || 'Calibrated'})
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">
                  Standard Factory Default
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Baseline: Yaw {calibration.baselineYaw}°, Pitch {calibration.baselinePitch}°, Gaze {calibration.baselineGazeX}
            </p>
          </div>
          {calibration.isCalibrated && (
            <button
              id="btn-reset-calibration"
              onClick={() => {
                onResetCalibration();
                triggerToast('Calibration baseline reset to neutral default');
              }}
              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-300 transition-colors shrink-0 cursor-pointer shadow-2xs"
            >
              Reset to Neutral
            </button>
          )}
        </div>
      </div>

      {/* Section 2: Audio, Video & Notification Preferences */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
        <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-600" />
          Alerts & Visual Feedback
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Audio Chimes */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-indigo-600" />
                Audio Chimes
              </span>
              <p className="text-[11px] text-slate-500">
                Play gentle harmonic web audio tones on distraction and focus restoration.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                id="btn-test-sound"
                onClick={onPlayTestSound}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-[11px] text-slate-700 border border-slate-300 cursor-pointer shadow-2xs font-medium"
              >
                Test Sound
              </button>
              <input
                id="toggle-audio-alerts"
                type="checkbox"
                checked={settings.audioAlerts}
                onChange={e => onUpdateSettings({ ...settings, audioAlerts: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Camera Preview Visibility */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-indigo-600" />
                Live Camera Preview
              </span>
              <p className="text-[11px] text-slate-500">
                Display live video stream on dashboard (toggle off for a distraction-free screen).
              </p>
            </div>
            <input
              id="toggle-camera-preview"
              type="checkbox"
              checked={settings.cameraPreview}
              onChange={e => onUpdateSettings({ ...settings, cameraPreview: e.target.checked })}
              className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
            />
          </div>

          {/* 3D Wireframe HUD Overlay */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-600" />
                3D Pose & Gaze Wireframe
              </span>
              <p className="text-[11px] text-slate-500">
                Render 3D orientation axis vectors and eye iris gaze lines over camera feed.
              </p>
            </div>
            <input
              id="toggle-wireframe"
              type="checkbox"
              checked={settings.wireframeOverlay}
              onChange={e => onUpdateSettings({ ...settings, wireframeOverlay: e.target.checked })}
              className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
            />
          </div>

          {/* Interactive Vision Simulation Mode */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600" />
                Camera Simulation Mode
              </span>
              <p className="text-[11px] text-slate-500">
                Test focus triggers with interactive sliders when camera hardware is unavailable.
              </p>
            </div>
            <input
              id="toggle-simulation-mode"
              type="checkbox"
              checked={settings.simulationMode}
              onChange={e => {
                onUpdateSettings({ ...settings, simulationMode: e.target.checked });
                triggerToast(e.target.checked ? 'Simulation mode enabled' : 'Webcam mode enabled');
              }}
              className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Privacy Transparency & Data Management */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 font-display">
              Local Data Storage & Privacy Architecture
            </h3>
            <p className="text-xs text-slate-500">
              100% Client-Side Video Processing Guarantee
            </p>
          </div>
        </div>

        {/* Privacy Guarantees */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> No Remote Video Streams
            </span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Your webcam feed is processed purely in your local browser runtime via WebAssembly / WebGL computer vision. Raw video frames, pictures, or facial recordings are NEVER uploaded or stored on remote servers.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="font-semibold text-indigo-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> No Biometric Identity Recognition
            </span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              The algorithm only estimates geometric 3D orientation angles and eye pupil deviation relative to your screen. It does not perform facial recognition or store biometric identities.
            </p>
          </div>
        </div>

        {/* Data Management Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-export-all-data"
              onClick={exportAllDataJson}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              Export Stored Data (JSON)
            </button>

            <button
              id="btn-view-raw-json"
              onClick={() => setShowRawJson(!showRawJson)}
              className="px-3.5 py-2 rounded-xl bg-white text-slate-600 hover:text-slate-900 text-xs font-medium border border-slate-200 transition-colors cursor-pointer shadow-2xs"
            >
              {showRawJson ? 'Hide Raw JSON' : 'Inspect Stored JSON'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-clear-sessions"
              onClick={() => {
                if (confirm('Are you sure you want to clear all past study session history?')) {
                  onClearSessions();
                  triggerToast('Session history deleted');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Session Logs
            </button>

            <button
              id="btn-delete-all-data"
              onClick={() => {
                if (confirm('Permanently delete all study data, settings, and calibration baselines?')) {
                  onClearAllData();
                  triggerToast('All data erased');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Delete My Data (Full Reset)
            </button>
          </div>
        </div>

        {/* Raw JSON viewer */}
        {showRawJson && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
              <span>Local Storage Payload ({sessions.length} sessions)</span>
            </div>
            <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-60 p-3 bg-slate-900 rounded-lg">
              {JSON.stringify({ settings, calibration, sessionsCount: sessions.length, sessions }, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Floating Save/Action Confirmation Toast */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl flex items-center gap-2 animate-fade-in border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {saveToast}
        </div>
      )}
    </div>
  );
};
