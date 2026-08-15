import React, { useState } from 'react';
import { 
  Crosshair, Sliders, User, Plus, Trash2, CheckCircle2, RotateCcw, 
  Sparkles, Save, ShieldAlert, Activity, Check, Info, ShieldCheck, 
  ChevronRight, AlertCircle, Eye, Compass
} from 'lucide-react';
import { StudentProfile, SensitivityPreset, TrackerMetrics } from '../types';
import { PRESET_CONFIGS } from '../utils/storage';

const FALLBACK_PROFILE: StudentProfile = {
  id: 'default-profile',
  name: 'Student Profile',
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

interface FocusCalibrationPanelProps {
  studentProfiles?: StudentProfile[];
  activeStudentId?: string;
  onSelectStudent: (id: string) => void;
  onUpdateActiveProfile: (updated: StudentProfile) => void;
  onCreateStudentProfile: (name: string) => void;
  onDeleteStudentProfile?: (id: string) => void;
  onStartLiveCalibration: () => void;
  onResetFactoryDefault?: () => void;
  onSaveSettings?: () => void;
  metrics?: TrackerMetrics;
  isCalibrating?: boolean;
}

export const FocusCalibrationPanel: React.FC<FocusCalibrationPanelProps> = ({
  studentProfiles = [],
  activeStudentId,
  onSelectStudent,
  onUpdateActiveProfile,
  onCreateStudentProfile,
  onDeleteStudentProfile,
  onStartLiveCalibration,
  onResetFactoryDefault,
  onSaveSettings,
  metrics,
  isCalibrating = false,
}) => {
  const [newStudentName, setNewStudentName] = useState('');
  const [showAddStudentInput, setShowAddStudentInput] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const safeProfiles = (studentProfiles && studentProfiles.length > 0) ? studentProfiles : [FALLBACK_PROFILE];
  const activeProfile = safeProfiles.find(p => p.id === activeStudentId) || safeProfiles[0];

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2500);
  };

  const handlePresetSelect = (preset: SensitivityPreset) => {
    if (preset === 'custom') {
      onUpdateActiveProfile({ ...activeProfile, preset: 'custom' });
      triggerToast('Custom mode enabled: adjust sliders as needed');
      return;
    }

    const config = PRESET_CONFIGS[preset];
    onUpdateActiveProfile({
      ...activeProfile,
      preset,
      yawLimit: config.yawLimit,
      pitchLimit: config.pitchLimit,
      gazeLimit: config.gazeLimit,
      facePosTolerance: config.facePosTolerance,
      distractionDelay: config.distractionDelay,
    });
    triggerToast(`Preset applied: ${preset.toUpperCase()}`);
  };

  // Helper for formatting range string (e.g. "-17° to +23°")
  const formatRange = (baseline: number, limit: number, unit = '°') => {
    const min = Math.round((baseline - limit) * 10) / 10;
    const max = Math.round((baseline + limit) * 10) / 10;
    const formatNum = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    return `${formatNum(min)}${unit} to ${formatNum(max)}${unit}`;
  };

  // Calculate live boundary compliance
  const currentYaw = metrics?.rawYaw ?? 0;
  const currentPitch = metrics?.rawPitch ?? 0;
  const currentGaze = metrics?.rawGazeX ?? 0;

  const baselineYaw = activeProfile.baselineYaw;
  const baselinePitch = activeProfile.baselinePitch;
  const baselineGaze = activeProfile.baselineGazeX;

  const relativeYaw = Math.round((currentYaw - baselineYaw) * 10) / 10;
  const relativePitch = Math.round((currentPitch - baselinePitch) * 10) / 10;
  const relativeGaze = Math.round((currentGaze - baselineGaze) * 10) / 10;

  const isYawViolated = Math.abs(relativeYaw) > activeProfile.yawLimit;
  const isPitchViolated = Math.abs(relativePitch) > activeProfile.pitchLimit;
  const isGazeViolated = Math.abs(relativeGaze) > activeProfile.gazeLimit;

  const isOutsideFocusZone = isYawViolated || isPitchViolated || isGazeViolated || !metrics?.faceDetected;

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                AI Vision Configuration
              </span>
              <span className="text-xs text-slate-500">&bull; Anti-False-Alert Protected</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-display mt-1 flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-indigo-600" />
              Focus Calibration & Detection Limits
            </h3>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Configure personalized study baselines and custom distraction boundaries for each student. The system continuously compares live camera telemetry with the student’s calibrated reference point.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-recalibrate-header"
              onClick={onStartLiveCalibration}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Crosshair className="w-4 h-4" />
              Calibrate Student Position
            </button>

            <button
              id="btn-save-custom-settings-header"
              onClick={() => {
                onSaveSettings();
                triggerToast('Custom settings & boundaries saved successfully!');
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Custom Settings
            </button>
          </div>
        </div>

        {/* Section 6: Individual Student Profiles Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <User className="w-4 h-4 text-indigo-600" />
              Active Student Profile
            </label>
            <span className="text-[11px] text-slate-500">
              Each student maintains their own unique reference baseline and tolerances
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {safeProfiles.map(student => {
              const isSelected = student.id === activeStudentId;
              return (
                <button
                  key={student.id}
                  id={`btn-student-profile-${student.id}`}
                  onClick={() => {
                    onSelectStudent(student.id);
                    triggerToast(`Switched active profile to ${student.name}`);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50 text-indigo-900 border-2 border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <div 
                    className="w-3 h-3 rounded-full shrink-0" 
                    style={{ backgroundColor: student.avatarColor || '#4f46e5' }}
                  />
                  <span>{student.name}</span>
                  {student.isCalibrated ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                      Calibrated
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">
                      Factory
                    </span>
                  )}
                </button>
              );
            })}

            {/* Add student inline */}
            {!showAddStudentInput ? (
              <button
                id="btn-add-new-student"
                onClick={() => setShowAddStudentInput(true)}
                className="px-3 py-2 rounded-xl text-xs font-medium text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 border border-dashed border-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Student
              </button>
            ) : (
              <div className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-300">
                <input
                  type="text"
                  placeholder="Student name (e.g. Student 04)"
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 w-44"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newStudentName.trim()) {
                      onCreateStudentProfile(newStudentName.trim());
                      setNewStudentName('');
                      setShowAddStudentInput(false);
                      triggerToast('New student profile created!');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newStudentName.trim()) {
                      onCreateStudentProfile(newStudentName.trim());
                      setNewStudentName('');
                      setShowAddStudentInput(false);
                      triggerToast('New student profile created!');
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddStudentInput(false);
                    setNewStudentName('');
                  }}
                  className="px-2 py-1 rounded-lg text-slate-500 text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Left Column (Personal Baseline & Detection Limits) | Right Column (Real-time Diagnostic Monitor) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 7 Cols: Personal Baseline & Sliders */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section 2: Personal Baseline Calibration */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Personal Baseline Calibration ({activeProfile.name})
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  The student’s natural posture reference point (not assumed to be 0°/0°/0°).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btn-recalibrate-profile"
                  onClick={onStartLiveCalibration}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  {activeProfile.isCalibrated ? 'Recalibrate' : 'Calibrate Now'}
                </button>

                <button
                  id="btn-reset-factory-default"
                  onClick={() => {
                    onResetFactoryDefault();
                    triggerToast('Reset to neutral factory baseline (0°, 0°, 0°)');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Reset to factory baseline"
                >
                  <RotateCcw className="w-3 h-3 text-slate-500" />
                  Reset to Factory Default
                </button>
              </div>
            </div>

            {/* Baseline Values Display */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Baseline Yaw</span>
                <span className="text-lg font-bold font-mono text-indigo-600">
                  {activeProfile.baselineYaw >= 0 ? `+${activeProfile.baselineYaw}` : activeProfile.baselineYaw}°
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Horizontal Ref</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Baseline Pitch</span>
                <span className="text-lg font-bold font-mono text-indigo-600">
                  {activeProfile.baselinePitch >= 0 ? `+${activeProfile.baselinePitch}` : activeProfile.baselinePitch}°
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Vertical Ref</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Baseline Gaze</span>
                <span className="text-lg font-bold font-mono text-indigo-600">
                  {activeProfile.baselineGazeX >= 0 ? `+${activeProfile.baselineGazeX}` : activeProfile.baselineGazeX}°
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Eye Iris Ref</span>
              </div>
            </div>

            {activeProfile.isCalibrated ? (
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Personal reference point calibrated: {activeProfile.calibratedAt || 'Active'}
                </span>
                <span className="text-[11px] font-mono text-emerald-700">Tolerance active</span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between text-xs text-amber-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <Info className="w-4 h-4 text-amber-600" />
                  Standard Factory Default active. Click "Calibrate" to customize for this student.
                </span>
              </div>
            )}
          </div>

          {/* Section 7: Detection Sensitivity Presets */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  Detection Sensitivity Presets
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a predefined profile or fine-tune individual boundaries below.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'relaxed', label: 'Relaxed', desc: 'Allows more movement (±28°)' },
                { id: 'normal', label: 'Normal', desc: 'Balanced detection (±20°)' },
                { id: 'strict', label: 'Strict', desc: 'High rigor & quick alerts (±14°)' },
                { id: 'custom', label: 'Custom', desc: 'Manual parameter controls' },
              ].map(preset => {
                const isSelected = activeProfile.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    id={`btn-preset-${preset.id}`}
                    onClick={() => handlePresetSelect(preset.id as SensitivityPreset)}
                    className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-600 shadow-2xs ring-1 ring-indigo-600/30'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                        {preset.label}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 1 & 3: Editable Detection Limits & Distraction Boundaries */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
            <div>
              <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" />
                Custom Distraction Boundaries & Tolerance Limits
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Allowed deviation ranges are calculated automatically relative to the student’s calibrated baseline.
              </p>
            </div>

            <div className="space-y-5">
              
              {/* Head Yaw Limit Slider */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Head Yaw Limit (Left / Right)</span>
                    <span className="text-[11px] text-slate-500">
                      Calculated Allowed Range: <strong className="text-indigo-700 font-mono">{formatRange(activeProfile.baselineYaw, activeProfile.yawLimit)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                      ±{activeProfile.yawLimit}°
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">±5°</span>
                  <input
                    id="slider-yaw-limit"
                    type="range"
                    min="5"
                    max="45"
                    step="1"
                    value={activeProfile.yawLimit}
                    onChange={e => onUpdateActiveProfile({
                      ...activeProfile,
                      preset: 'custom',
                      yawLimit: Number(e.target.value),
                    })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 font-mono">±45°</span>
                </div>
              </div>

              {/* Head Pitch Limit Slider */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Head Pitch Limit (Up / Down)</span>
                    <span className="text-[11px] text-slate-500">
                      Calculated Allowed Range: <strong className="text-indigo-700 font-mono">{formatRange(activeProfile.baselinePitch, activeProfile.pitchLimit)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                      ±{activeProfile.pitchLimit}°
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">±5°</span>
                  <input
                    id="slider-pitch-limit"
                    type="range"
                    min="5"
                    max="35"
                    step="1"
                    value={activeProfile.pitchLimit}
                    onChange={e => onUpdateActiveProfile({
                      ...activeProfile,
                      preset: 'custom',
                      pitchLimit: Number(e.target.value),
                    })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 font-mono">±35°</span>
                </div>
              </div>

              {/* Eye Gaze Limit Slider */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Eye Gaze Limit (Iris Divergence)</span>
                    <span className="text-[11px] text-slate-500">
                      Calculated Allowed Range: <strong className="text-indigo-700 font-mono">{formatRange(activeProfile.baselineGazeX, activeProfile.gazeLimit)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                      ±{activeProfile.gazeLimit}°
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">±5°</span>
                  <input
                    id="slider-gaze-limit"
                    type="range"
                    min="5"
                    max="35"
                    step="1"
                    value={activeProfile.gazeLimit}
                    onChange={e => onUpdateActiveProfile({
                      ...activeProfile,
                      preset: 'custom',
                      gazeLimit: Number(e.target.value),
                    })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 font-mono">±35°</span>
                </div>
              </div>

              {/* Face Position & Distraction Duration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Face Position Tolerance */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Face Position Tolerance</span>
                    <span className="text-xs font-mono font-bold text-indigo-700">±{activeProfile.facePosTolerance}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Allowed posture shifting within desk camera frame</p>
                  <input
                    id="slider-face-pos-tolerance"
                    type="range"
                    min="10"
                    max="50"
                    step="5"
                    value={activeProfile.facePosTolerance}
                    onChange={e => onUpdateActiveProfile({
                      ...activeProfile,
                      preset: 'custom',
                      facePosTolerance: Number(e.target.value),
                    })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                {/* Distraction Delay / Anti-False-Alert Window */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Distraction Delay</span>
                    <span className="text-xs font-mono font-bold text-indigo-700">{activeProfile.distractionDelay}s</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Continuous seconds outside boundary before alert triggers</p>
                  <div className="grid grid-cols-4 gap-1 pt-1">
                    {[3, 5, 8, 10].map(sec => (
                      <button
                        key={sec}
                        id={`btn-distraction-delay-${sec}`}
                        onClick={() => onUpdateActiveProfile({
                          ...activeProfile,
                          preset: 'custom',
                          distractionDelay: sec,
                        })}
                        className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                          activeProfile.distractionDelay === sec
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 5: Out-of-Focus Boundary Option */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                    Out-of-Focus Boundary Detection
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Triggers when the student turns significantly away (&gt;38°), looks behind, looks down at a phone, or leaves the desk.
                  </p>
                </div>
                <input
                  id="toggle-out-of-focus-boundary"
                  type="checkbox"
                  checked={activeProfile.outOfFocusBoundaryEnabled}
                  onChange={e => onUpdateActiveProfile({
                    ...activeProfile,
                    outOfFocusBoundaryEnabled: e.target.checked,
                  })}
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

            </div>

            {/* Profile Management Footer */}
            {safeProfiles.length > 1 && onDeleteStudentProfile && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Profile ID: {activeProfile.id}</span>
                <button
                  id="btn-delete-student-profile"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete profile "${activeProfile.name}"?`)) {
                      onDeleteStudentProfile(activeProfile.id);
                      triggerToast(`Profile deleted`);
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Student Profile
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Section 8 Real-Time Calibration & Diagnostic Monitor */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5 sticky top-20">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Real-Time Boundary Diagnostic
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Authorized teacher & parent telemetry monitor
                </p>
              </div>

              {/* Status Badge */}
              <div className="text-right">
                {!metrics?.faceDetected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    NO FACE DETECTED
                  </span>
                ) : isOutsideFocusZone ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    OUTSIDE FOCUS ZONE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    STATUS: FOCUSED
                  </span>
                )}
              </div>
            </div>

            {/* Live Telemetry Matrix */}
            <div className="space-y-4 text-xs font-mono">
              
              {/* Yaw Axis Telemetry */}
              <div className={`p-3.5 rounded-xl border transition-colors ${
                isYawViolated ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-700 font-sans">Head Yaw (Turn Angle)</span>
                  <span className={`font-bold ${isYawViolated ? 'text-red-600' : 'text-slate-800'}`}>
                    {relativeYaw >= 0 ? `+${relativeYaw}` : relativeYaw}° {isYawViolated ? '(VIOLATION)' : '(SAFE)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 text-[11px] text-slate-500 font-sans gap-2 mb-2">
                  <span>Baseline: <strong className="font-mono text-slate-700">{baselineYaw >= 0 ? `+${baselineYaw}` : baselineYaw}°</strong></span>
                  <span>Current: <strong className="font-mono text-slate-700">{currentYaw >= 0 ? `+${currentYaw}` : currentYaw}°</strong></span>
                </div>
                <div className="text-[10px] text-slate-500 font-sans mb-1">
                  Allowed Zone: <strong className="font-mono text-indigo-700">{formatRange(baselineYaw, activeProfile.yawLimit)}</strong>
                </div>
                {/* Visual meter */}
                <div className="relative w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-150 ${isYawViolated ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (Math.abs(relativeYaw) / (activeProfile.yawLimit || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Pitch Axis Telemetry */}
              <div className={`p-3.5 rounded-xl border transition-colors ${
                isPitchViolated ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-700 font-sans">Head Pitch (Nod Angle)</span>
                  <span className={`font-bold ${isPitchViolated ? 'text-red-600' : 'text-slate-800'}`}>
                    {relativePitch >= 0 ? `+${relativePitch}` : relativePitch}° {isPitchViolated ? '(VIOLATION)' : '(SAFE)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 text-[11px] text-slate-500 font-sans gap-2 mb-2">
                  <span>Baseline: <strong className="font-mono text-slate-700">{baselinePitch >= 0 ? `+${baselinePitch}` : baselinePitch}°</strong></span>
                  <span>Current: <strong className="font-mono text-slate-700">{currentPitch >= 0 ? `+${currentPitch}` : currentPitch}°</strong></span>
                </div>
                <div className="text-[10px] text-slate-500 font-sans mb-1">
                  Allowed Zone: <strong className="font-mono text-indigo-700">{formatRange(baselinePitch, activeProfile.pitchLimit)}</strong>
                </div>
                {/* Visual meter */}
                <div className="relative w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-150 ${isPitchViolated ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (Math.abs(relativePitch) / (activeProfile.pitchLimit || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Gaze Telemetry */}
              <div className={`p-3.5 rounded-xl border transition-colors ${
                isGazeViolated ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-700 font-sans">Eye Gaze Divergence</span>
                  <span className={`font-bold ${isGazeViolated ? 'text-red-600' : 'text-slate-800'}`}>
                    {relativeGaze >= 0 ? `+${relativeGaze}` : relativeGaze}° {isGazeViolated ? '(VIOLATION)' : '(SAFE)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 text-[11px] text-slate-500 font-sans gap-2 mb-2">
                  <span>Baseline: <strong className="font-mono text-slate-700">{baselineGaze >= 0 ? `+${baselineGaze}` : baselineGaze}°</strong></span>
                  <span>Current: <strong className="font-mono text-slate-700">{currentGaze >= 0 ? `+${currentGaze}` : currentGaze}°</strong></span>
                </div>
                <div className="text-[10px] text-slate-500 font-sans mb-1">
                  Allowed Zone: <strong className="font-mono text-indigo-700">{formatRange(baselineGaze, activeProfile.gazeLimit)}</strong>
                </div>
                {/* Visual meter */}
                <div className="relative w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-150 ${isGazeViolated ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (Math.abs(relativeGaze) / (activeProfile.gazeLimit || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Section 9: Anti-False-Alert Pipeline Explanation Card */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-300 space-y-2 text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Anti-False-Alert Engine
              </span>
              <p className="text-[11px] leading-relaxed text-slate-300">
                Single-frame deviations are safely ignored. Distractions require sustained violation for <strong>{activeProfile.distractionDelay} seconds</strong> before triggering alerts.
              </p>
              <ul className="text-[10px] space-y-1 text-slate-400 pt-1 border-t border-slate-800">
                <li>&bull; Natural blinking & rapid saccades automatically filtered</li>
                <li>&bull; Temporary face occlusion grace period (1.5s)</li>
                <li>&bull; Instant auto-cancellation when returning within boundary</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                id="btn-save-all-settings"
                onClick={() => {
                  onSaveSettings();
                  triggerToast('All custom boundary limits saved to local memory!');
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Save Custom Settings
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Save Notification Toast */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl flex items-center gap-2 animate-fade-in border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {saveToast}
        </div>
      )}
    </div>
  );
};
