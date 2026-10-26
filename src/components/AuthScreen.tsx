import React, { useState } from 'react';
import type { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/db';
import { BrandMark } from '@/components/BrandMark';
import { toast } from "@/lib/toast";
import { LogIn, UserPlus, KeyRound, ArrowLeft } from "@/lib/icons";

const isHostedInstance = import.meta.env.VITE_HOSTED === 'true';

type View = 'signin' | 'signup' | 'forgot';

const inputClass =
  'flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

const COPY: Record<View, { title: string; description: string }> = {
  signin: { title: 'A little room to focus.', description: 'Sign in to your Zings workspace.' },
  signup: { title: 'Create your account', description: 'Keep your tasks in sync across your devices.' },
  forgot: { title: 'Reset password', description: 'Enter your email and we’ll send you a reset link.' },
};

export default function AuthScreen() {
  const [view, setView] = useState<View>('signin');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const goto = (next: View) => {
    setPassword('');
    setView(next);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const users = pb.collection('users');
      if (view === 'signup') {
        await users.create({ email, password, passwordConfirm: password });
      }
      if (view === 'forgot') {
        // The emailed link opens PocketBase's own reset page (needs SMTP set up).
        await users.requestPasswordReset(email);
        // Deliberately generic so we don't reveal which emails have accounts.
        toast.success('If that email has an account, a reset link is on its way.');
        goto('signin');
      } else {
        await users.authWithPassword(email, password);
        toast.success(view === 'signup' ? 'Account created. Enjoy real-time sync!' : 'Logged in securely.');
      }
    } catch (err) {
      toast.error(authErrorMessage(err, view));
    } finally {
      setLoading(false);
    }
  };

  const showPassword = view !== 'forgot';

  const submitLabel = (() => {
    if (loading) return <span className="animate-pulse">Please wait…</span>;
    switch (view) {
      case 'signin':
        return (<><LogIn className="w-5 h-5 mr-2" /> Sign in</>);
      case 'signup':
        return (<><UserPlus className="w-5 h-5 mr-2" /> Create account</>);
      case 'forgot':
        return (<><KeyRound className="w-5 h-5 mr-2" /> Send reset link</>);
    }
  })();

  return (
    <div className="auth-shell flex h-full min-h-0 w-full items-center justify-center overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <div className="my-auto grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-elevated animate-in fade-in zoom-in-95 duration-300 md:grid-cols-2">
        <div className="relative hidden min-h-[590px] overflow-hidden bg-[#0C1110] md:flex md:flex-col">
          <div className="flex flex-1 items-center justify-center px-10 pb-44 pt-10">
            <BrandMark className="h-56 w-56" />
          </div>
          <div className="absolute bottom-9 left-8 right-8 text-white">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">Your tasks. Your space.</p>
            <h2 className="font-display text-[32px] leading-tight">Make room for<br />what matters.</h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">A calmer day, on your own server.</p>
          </div>
        </div>
        <div className="w-full self-center bg-card py-3 text-card-foreground sm:px-2">
        <div className="flex flex-col space-y-2 p-6 pb-4 text-center">
          <div className="mx-auto mb-4 flex items-center gap-3">
            <BrandMark className="h-12 w-12 md:hidden" />
            <span className="font-display text-3xl">Zings</span>
          </div>
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight">
            {COPY[view].title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {COPY[view].description}
          </p>
        </div>
        <div className="p-6 pt-4">
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="ml-1 text-xs font-medium text-muted-foreground">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            {showPassword && (
              <div className="space-y-2">
                <label htmlFor="password" className="ml-1 text-xs font-medium text-muted-foreground">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={view === 'signin' ? 'current-password' : 'new-password'}
                  minLength={view === 'signup' ? 8 : undefined}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-3d btn-primary mt-4 w-full whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
            >
              {submitLabel}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-border/40 text-center text-sm space-y-3">
            {view === 'signin' && (
              <>
                <div>
                  <button
                    type="button"
                    onClick={() => goto('forgot')}
                    className="text-muted-foreground hover:text-foreground transition-colors hover:underline underline-offset-4 focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
                <div>
                  <span className="text-muted-foreground">New user?{' '}</span>
                  {isHostedInstance ? (
                    <a
                      href="https://github.com/greeenos/zings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-bold tracking-tight hover:opacity-80 transition-opacity hover:underline underline-offset-4 focus:outline-none ml-1"
                    >
                      Selfhost on GitHub
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => goto('signup')}
                      className="text-primary font-bold tracking-tight hover:opacity-80 transition-opacity hover:underline underline-offset-4 focus:outline-none ml-1"
                    >
                      Create new account
                    </button>
                  )}
                </div>
              </>
            )}
            {view === 'signup' && (
              <div>
                <p className="mb-3 text-xs text-muted-foreground">Up to 5 accounts per household. Everyone gets a private workspace.</p>
                <span className="text-muted-foreground">Existing member?{' '}</span>
                <button
                  type="button"
                  onClick={() => goto('signin')}
                  className="text-primary font-bold tracking-tight hover:opacity-80 transition-opacity hover:underline underline-offset-4 focus:outline-none ml-1"
                >
                  Sign in to existing account
                </button>
              </div>
            )}
            {view === 'forgot' && (
              <button
                type="button"
                onClick={() => goto('signin')}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors hover:underline underline-offset-4 focus:outline-none"
              >
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

/** PocketBase's own messages ("Failed to authenticate.") don't say what to do next. */
function authErrorMessage(err: unknown, view: View): string {
  const { status, response } = err as Partial<ClientResponseError>;
  if (view === 'signin' && status === 400) {
    return 'Wrong email or password. New to this server? Create an account first.';
  }
  const fields = response?.data as Record<string, { message?: string }> | undefined;
  const detail = fields && Object.entries(fields).map(([field, e]) => `${field}: ${e?.message}`).join(' · ');
  if (detail) return detail;
  return err instanceof Error ? err.message : 'Something went wrong — try again';
}
