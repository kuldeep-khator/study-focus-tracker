import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Lock, Mail, User as UserIcon, ArrowRight, Sparkles, 
  CheckCircle2, AlertCircle, Eye, EyeOff, KeyRound, RefreshCw, Send
} from 'lucide-react';
import { User } from '../types';
import { auth, googleAuthProvider } from '../lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  signInWithPopup,
  signOut,
  reload,
  User as FirebaseUser
} from 'firebase/auth';
import { createFirestoreUserProfile, getFirestoreUserProfile, updateFirestoreUserVerification } from '../utils/firestore';

interface AuthViewProps {
  onAuthSuccess: (user: User) => void;
  unverifiedUser?: FirebaseUser | null;
  onClearUnverified?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ 
  onAuthSuccess, 
  unverifiedUser: initialUnverifiedUser,
  onClearUnverified
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'verify_notice'>('login');
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Pending verification tracking
  const [pendingUser, setPendingUser] = useState<FirebaseUser | null>(initialUnverifiedUser || null);
  const [pendingEmail, setPendingEmail] = useState<string>(initialUnverifiedUser?.email || '');
  
  // Status, Cooldown & Feedback
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Sync if parent passes unverified user
  useEffect(() => {
    if (initialUnverifiedUser) {
      setPendingUser(initialUnverifiedUser);
      setPendingEmail(initialUnverifiedUser.email || '');
      setMode('verify_notice');
    }
  }, [initialUnverifiedUser]);

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const resetFeedback = () => {
    setError(null);
    setSuccessMsg(null);
  };

  /**
   * 1. EMAIL/PASSWORD SIGN UP WITH VERIFICATION EMAIL
   */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!cleanName) {
      setError('Please provide your full name.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-type your confirmation password.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create account in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = userCredential.user;

      // 2. Save user profile to Firestore (never password)
      await createFirestoreUserProfile(fbUser.uid, {
        name: cleanName,
        email: cleanEmail,
        emailVerified: false,
      });

      // 3. Immediately send Firebase Email Verification to the exact signup email
      await sendEmailVerification(fbUser);

      // 4. Transition to "Check Your Email" screen
      setPendingUser(fbUser);
      setPendingEmail(cleanEmail);
      setResendCooldown(60);
      setMode('verify_notice');
      setSuccessMsg(`Verification email has been sent to ${cleanEmail}`);
    } catch (err: any) {
      console.error('Sign up error:', err);
      if (err?.code === 'auth/email-already-in-use') {
        setError('This email address is already registered. Please sign in instead.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('Invalid email address format.');
      } else if (err?.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters with mixed characters.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setError('Email/Password registration is not enabled in the Firebase Console. Please click "Continue with Google" below for instant verified access, or enable Email/Password provider in the Firebase Authentication Console.');
      } else {
        setError(err.message || 'Failed to create your account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 2. EMAIL/PASSWORD SIGN IN WITH VERIFICATION ENFORCEMENT
   */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = userCredential.user;

      // 2. Force fresh reload from Firebase servers to prevent stale cached state
      await reload(fbUser);

      // 3. Check verification status
      if (!fbUser.emailVerified) {
        // Block dashboard access!
        setPendingUser(fbUser);
        setPendingEmail(cleanEmail);
        setMode('verify_notice');
        setError('Please verify your email before accessing your account.');
        return;
      }

      // 4. Update Firestore verification flag
      await updateFirestoreUserVerification(fbUser.uid, true);

      // 5. Load user profile
      let profile = await getFirestoreUserProfile(fbUser.uid);
      if (!profile) {
        profile = {
          id: fbUser.uid,
          name: fbUser.displayName || name || cleanEmail.split('@')[0] || 'Student',
          email: cleanEmail,
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        };
        await createFirestoreUserProfile(fbUser.uid, {
          name: profile.name,
          email: profile.email,
          emailVerified: true,
        });
      }

      onAuthSuccess(profile);
    } catch (err: any) {
      console.error('Sign in error:', err);
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please check your credentials.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Too many unsuccessful attempts. Please try again in a few minutes or reset your password.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in the Firebase Console. Please click "Continue with Google" below for instant verified access, or enable Email/Password provider in the Firebase Authentication Console.');
      } else {
        setError(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 3. CHECK EMAIL VERIFICATION STATUS & ENTER DASHBOARD
   */
  const handleCheckVerificationStatus = async () => {
    resetFeedback();
    const targetUser = pendingUser || auth.currentUser;

    if (!targetUser) {
      setError('No active session found. Please sign in to verify.');
      setMode('login');
      return;
    }

    setIsCheckingStatus(true);

    try {
      // Reload user from Firebase backend
      await reload(targetUser);

      if (targetUser.emailVerified) {
        setSuccessMsg('Email verified successfully! Loading your dashboard...');
        await updateFirestoreUserVerification(targetUser.uid, true);

        // Load profile
        let profile = await getFirestoreUserProfile(targetUser.uid);
        if (!profile) {
          profile = {
            id: targetUser.uid,
            name: targetUser.displayName || name || pendingEmail.split('@')[0] || 'Student',
            email: targetUser.email || pendingEmail,
            createdAt: Date.now(),
            lastLoginAt: Date.now(),
          };
          await createFirestoreUserProfile(targetUser.uid, {
            name: profile.name,
            email: profile.email,
            emailVerified: true,
          });
        }

        setTimeout(() => {
          onAuthSuccess(profile!);
        }, 600);
      } else {
        setError('Your email is not verified yet. Please open the link in the verification email sent to your inbox.');
      }
    } catch (err: any) {
      console.error('Status check error:', err);
      setError('Could not verify status. Please make sure you are online and try again.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  /**
   * 4. RESEND VERIFICATION EMAIL TO EXACT EMAIL
   */
  const handleResendVerificationEmail = async () => {
    if (resendCooldown > 0) return;
    resetFeedback();

    const targetUser = pendingUser || auth.currentUser;
    if (!targetUser) {
      setError('Please sign in with your email and password first to resend the verification link.');
      setMode('login');
      return;
    }

    setIsResending(true);

    try {
      await sendEmailVerification(targetUser);
      setSuccessMsg(`A new verification email was sent to ${targetUser.email || pendingEmail}`);
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Resend verification error:', err);
      if (err?.code === 'auth/too-many-requests') {
        setError('Please wait a moment before requesting another verification email.');
      } else {
        setError(err.message || 'Failed to resend verification email.');
      }
    } finally {
      setIsResending(false);
    }
  };

  /**
   * 5. FORGOT PASSWORD FLOW
   */
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter your registered email address.');
      return;
    }

    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMsg(`Password reset link sent to ${cleanEmail}. Please check your inbox.`);
      setTimeout(() => {
        setMode('login');
      }, 3500);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err?.code === 'auth/user-not-found') {
        setError('No account exists with this email address.');
      } else {
        setError(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 6. GOOGLE SIGN IN (Auto-verified by Google)
   */
  const handleGoogleSignIn = async () => {
    resetFeedback();
    setIsLoading(true);

    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const fbUser = cred.user;

      await createFirestoreUserProfile(fbUser.uid, {
        name: fbUser.displayName || 'Student',
        email: fbUser.email || `${fbUser.uid}@studyaid.app`,
        emailVerified: true,
      });

      const profile: User = {
        id: fbUser.uid,
        name: fbUser.displayName || 'Student',
        email: fbUser.email || `${fbUser.uid}@studyaid.app`,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      };

      onAuthSuccess(profile);
    } catch (err: any) {
      console.error('Google sign in error:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Sign in popup was closed.');
      } else {
        setError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToSignIn = async () => {
    resetFeedback();
    try {
      await signOut(auth);
    } catch (e) {
      // ignore
    }
    setPendingUser(null);
    if (onClearUnverified) onClearUnverified();
    setMode('login');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Subtle Background Lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center px-4">
        {/* Brand Logo */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white font-bold text-2xl shadow-lg shadow-indigo-600/30 mb-4">
          S
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight">
          StudyFocus AI
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
          Private, AI-powered study focus tracker with secure Firebase email authentication & cloud Firestore
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-2xl border border-slate-200">
          
          {/* SCREEN 1: CHECK YOUR EMAIL / EMAIL VERIFICATION NOTICE */}
          {mode === 'verify_notice' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
                <Mail className="w-8 h-8 animate-pulse" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  Check Your Email 📧
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  We've created your account and sent a verification email to:
                </p>
                <div className="mt-2 py-2 px-3 bg-indigo-50/80 border border-indigo-100 rounded-xl text-xs sm:text-sm font-semibold text-indigo-700 break-all select-all">
                  {pendingEmail || email || 'your registered email'}
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Please open your inbox and click the verification link to activate your account.
                </p>
              </div>

              {/* Feedback messages */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 text-left">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2 text-left">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="space-y-2.5 pt-2">
                <button
                  id="btn-verified-status-check"
                  type="button"
                  onClick={handleCheckVerificationStatus}
                  disabled={isCheckingStatus}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  {isCheckingStatus ? 'Verifying with Firebase...' : "I've Verified My Email"}
                </button>

                <button
                  id="btn-resend-verification"
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={isResending || resendCooldown > 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isResending 
                    ? 'Sending email...' 
                    : resendCooldown > 0 
                      ? `Resend Verification Email (${resendCooldown}s)` 
                      : 'Resend Verification Email'}
                </button>

                <button
                  id="btn-back-to-sign-in"
                  type="button"
                  onClick={handleBackToSignIn}
                  className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 py-2 cursor-pointer transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 2: FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center pb-1">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 font-display">Reset Your Password</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your registered email and Firebase will send you a secure password reset link.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registered Email Address
                </label>
                <div className="relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="input-forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="block w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setMode('login'); resetFeedback(); }}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-forgot"
                  type="submit"
                  disabled={isLoading}
                  className="flex-2 py-2.5 px-3 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? 'Sending Link...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          )}

          {/* SCREEN 3: SIGN IN & SIGN UP FORMS */}
          {(mode === 'login' || mode === 'register') && (
            <>
              {/* Primary Instant Google Sign-In */}
              <div className="mb-6">
                <button
                  id="btn-google-sign-in-top"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google (Recommended)</span>
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white px-2 text-slate-400 font-medium">Or use email & password</span>
                  </div>
                </div>
              </div>

              {/* Header Tab Switcher */}
              <div className="flex border-b border-slate-200 pb-4 mb-6">
                <button
                  id="tab-login"
                  type="button"
                  onClick={() => { setMode('login'); resetFeedback(); }}
                  className={`flex-1 text-center pb-2 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-[18px] ${
                    mode === 'login'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sign In
                </button>
                <button
                  id="tab-register"
                  type="button"
                  onClick={() => { setMode('register'); resetFeedback(); }}
                  className={`flex-1 text-center pb-2 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-[18px] ${
                    mode === 'register'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Feedback Alerts */}
              {error && (
                <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <span className="font-medium leading-relaxed">{error}</span>
                  </div>
                  {error.includes('Firebase Console') && (
                    <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                      <span className="text-[11px] text-amber-700">Quickest fix:</span>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
                      >
                        Sign in with Google now →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* SIGN IN FORM */}
              {mode === 'login' && (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative rounded-xl shadow-2xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        id="input-login-email"
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="student@university.edu"
                        className="block w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); resetFeedback(); }}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-500 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative rounded-xl shadow-2xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="input-login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="block w-full pl-9 pr-10 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    id="btn-submit-login"
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? 'Verifying with Firebase...' : 'Sign In to Dashboard'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* SIGN UP FORM */}
              {mode === 'register' && (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name
                    </label>
                    <div className="relative rounded-xl shadow-2xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <input
                        id="input-register-name"
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Alex Morgan"
                        className="block w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative rounded-xl shadow-2xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        id="input-register-email"
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="alex@university.edu"
                        className="block w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      A verification link will be sent to this exact email.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Password (min. 6 characters)
                    </label>
                    <div className="relative rounded-xl shadow-2xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="input-register-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="block w-full pl-9 pr-10 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm Password
                    </label>
                    <div className="relative rounded-xl shadow-2xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="input-register-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="block w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    id="btn-submit-register"
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Account...' : 'Create Account & Send Verification Email'}
                    <Sparkles className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Google Sign-in Alternative */}
              <div className="mt-6">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-slate-400 font-medium">Or continue with</span>
                  </div>
                </div>

                <button
                  id="btn-google-sign-in"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Google Sign-In</span>
                </button>
              </div>
            </>
          )}

          {/* Privacy & Security Footnote */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-[11px] text-slate-500 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <span>
              <strong>Zero-Password Storage in Firestore:</strong> Passwords are authenticated strictly via Firebase Auth. Video frames are processed locally and never uploaded.
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};
