import React from 'react';
import { Camera, ShieldCheck, CheckCircle, XCircle, Sliders } from 'lucide-react';

interface CameraPermissionModalProps {
  onAllow: () => void;
  onDeny: () => void;
  onUseSimulation: () => void;
}

export const CameraPermissionModal: React.FC<CameraPermissionModalProps> = ({
  onAllow,
  onDeny,
  onUseSimulation,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
      <div className="w-full max-w-md p-6 sm:p-7 rounded-3xl bg-stone-900 border border-stone-800 shadow-2xl space-y-5 text-center">
        
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Camera className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-stone-100 font-display">
            Enable Camera for AI Focus Tracking
          </h3>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed text-left p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800">
            Camera access is required to automatically estimate your study focus using face, eye, and head-position analysis. Your camera feed is processed locally whenever possible and is not saved as video.
          </p>
        </div>

        {/* Local processing transparency */}
        <div className="flex items-center gap-2 text-left text-xs text-stone-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>No video or facial biometrics are ever sent to remote servers.</span>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            id="btn-allow-camera"
            onClick={onAllow}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-stone-950 font-bold text-sm shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            Allow Camera & Start Session
          </button>

          <button
            id="btn-use-simulation"
            onClick={onUseSimulation}
            className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-semibold border border-stone-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            Continue with Vision Simulator (No Camera)
          </button>

          <button
            id="btn-deny-camera"
            onClick={onDeny}
            className="w-full py-2 rounded-xl text-stone-500 hover:text-stone-400 text-xs font-medium transition-colors"
          >
            Deny Access
          </button>
        </div>
      </div>
    </div>
  );
};
