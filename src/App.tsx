import { isDemo, resetDemo } from '@/lib/demo';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Toaster } from '@/lib/toast';
import type { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/db';
import { useTheme } from '@/hooks/useTheme';

const AuthScreen = lazy(() => import('@/components/AuthScreen'));
const Index = lazy(() => import('./pages/Index.tsx'));
const DesignShowcase = lazy(() => import('./pages/DesignShowcase.tsx'));

const Splash = ({ label }: { label: string }) => (
  <div className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-background text-sm text-muted-foreground animate-pulse">
    {label}
  </div>
);


const App = () => {
  const embedded = isDemo && window.self !== window.top && new URLSearchParams(location.search).get('embed') === '1';
  const { setMode } = useTheme();
  useEffect(() => {
    if (!embedded) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (event.data?.type === 'zings:reset') resetDemo();
      if (event.data?.type === 'zings:theme' && ['light', 'dark', 'auto'].includes(event.data.mode)) setMode(event.data.mode);
    };
    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ type: 'zings:ready' }, location.origin);
    return () => window.removeEventListener('message', handleMessage);
  }, [embedded, setMode]);
  const [signedIn, setSignedIn] = useState(pb.authStore.isValid);

  useEffect(() => {
    // Extends the session on every visit; a token the server rejects signs you
    // out, while being offline keeps you signed in.
    if (pb.authStore.isValid && !isDemo) {
      pb.collection('users').authRefresh().catch((err: ClientResponseError) => {
        if ([401, 403, 404].includes(err.status)) pb.authStore.clear();
      });
    }
    return pb.authStore.onChange(() => setSignedIn(pb.authStore.isValid));
  }, []);

  // /#design: the design-system showcase, no account needed.
  if (window.location.hash === '#design') {
    return (
      <Suspense fallback={<Splash label="Loading…" />}>
        <DesignShowcase />
      </Suspense>
    );
  }

  if (!signedIn) {
    return (
      <>
        <Toaster />
        <Suspense fallback={<Splash label="Loading…" />}>
          <AuthScreen />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <Toaster />
      <Suspense fallback={<Splash label="Loading…" />}>
        {isDemo && !embedded ? <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-border bg-background px-3 py-2 text-xs text-foreground">
            <a href="/" className="font-semibold underline">Zings</a><span>Demo<span className="hidden sm:inline"> · saved only in this browser · no account needed</span></span>
            <button className="underline" onClick={resetDemo}>Reset demo</button>
            <a className="underline" href="https://github.com/greeenos/zings">Self-host<span className="hidden sm:inline"> your own</span></a>
          </div><div className="min-h-0 flex-1"><Index /></div></div> : <Index />}
      </Suspense>
    </>
  );
};

export default App;
