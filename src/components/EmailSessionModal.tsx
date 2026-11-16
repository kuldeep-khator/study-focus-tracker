import React, { useState } from 'react';
import { Mail, Send, CheckCircle2, AlertCircle, X, Loader2, ShieldCheck, Activity } from 'lucide-react';
import { StudySession } from '../types';
import { buildSessionEmailPayload, connectGmailAccount, sendGmailMessage } from '../utils/gmail';
import { getGmailAccessToken } from '../lib/firebase';

interface EmailSessionModalProps {
  session: StudySession;
  defaultRecipientEmail: string;
  onClose: () => void;
  onEmailSent: (updatedSession: StudySession) => void;
}

export const EmailSessionModal: React.FC<EmailSessionModalProps> = ({
  session,
  defaultRecipientEmail,
  onClose,
  onEmailSent,
}) => {
  const [recipientEmail, setRecipientEmail] = useState<string>(
    session.emailedTo || defaultRecipientEmail || ''
  );
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState<{ to: string; id: string } | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(getGmailAccessToken()));

  const preview = buildSessionEmailPayload(session, recipientEmail, defaultRecipientEmail);

  const formatMinSec = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (mins > 0) return `${mins}m ${s > 0 ? `${s}s` : ''}`;
    return `${s}s`;
  };

  const handleConnectGmail = async () => {
    setError(null);
    try {
      await connectGmailAccount();
      setHasToken(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to authorize Gmail access.');
    }
  };

  const handleConfirmSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanRecipient = recipientEmail.trim();
    if (!cleanRecipient || !cleanRecipient.includes('@')) {
      setError('Please enter a valid recipient email address.');
      return;
    }

    setIsSending(true);
    try {
      const result = await sendGmailMessage({
        to: cleanRecipient,
        subject: preview.subject,
        htmlBody: preview.htmlBody,
        textBody: preview.textBody,
      });

      setHasToken(true);
      const updatedSession: StudySession = {
        ...session,
        emailedTo: cleanRecipient,
        emailedAt: Date.now(),
        emailMessageId: result.id,
      };
      onEmailSent(updatedSession);
      setSentSuccess({ to: cleanRecipient, id: result.id });
    } catch (err: any) {
      setError(err?.message || 'Could not send email via Gmail. Please try connecting Gmail again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          aria-label="Close email confirmation dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 font-display">
              Confirm &amp; Send Study Log via Gmail
            </h3>
            <p className="text-xs text-slate-500">
              Review the saved session metrics before sending this log to your email.
            </p>
          </div>
        </div>

        {sentSuccess ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-950">
              Study log sent and logged to {sentSuccess.to}
            </p>
            <p className="text-xs text-emerald-700">
              Your saved session record has been emailed via Gmail and marked in your Firestore history.
            </p>
            <button
              id="btn-close-email-success"
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleConfirmSend} className="space-y-4">
            {/* Recipient Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recipient Email Address
              </label>
              <input
                id="input-email-recipient"
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="student@example.com"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Email Content Preview */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-semibold text-slate-700">Email Subject:</span>
                <span className="font-mono text-[11px] text-indigo-700 truncate max-w-[260px]">
                  {preview.subject}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Duration / Focus</span>
                  <span className="font-semibold text-slate-900">
                    {formatMinSec(session.duration)} ({session.focusScore}% Focus)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Distractions</span>
                  <span className="font-semibold text-slate-900">
                    {session.distractionCount} events ({formatMinSec(session.distractionTime)})
                  </span>
                </div>
                {typeof session.avgPostureScore === 'number' && (
                  <div className="col-span-2 flex items-center gap-1.5 pt-1 text-indigo-700 font-medium">
                    <Activity className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Upper Body Posture: <strong>{session.avgPostureScore}%</strong> &bull; {session.postureSummary || 'Included in report'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Gmail Connection Status */}
            {!hasToken && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-xs">
                <div className="text-amber-900">
                  <strong className="block">Gmail Send Authorization</strong>
                  <span className="text-[11px] text-amber-800">
                    You will be prompted to grant Google Gmail send permission when confirming.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 shrink-0 cursor-pointer"
                >
                  Connect Gmail
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Sent via your Gmail account
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-send-gmail"
                  type="submit"
                  disabled={isSending}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {isSending ? 'Sending Email...' : 'Confirm & Send Email'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
