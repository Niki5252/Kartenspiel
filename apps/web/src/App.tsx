import { lazy, Suspense } from 'react';
import { api } from './net/client';
import { useClientState } from './net/hooks';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { useGameSounds } from './sound/useGameSounds';

// Dev-Werkzeuge werden im Produktions-Build komplett entfernt (import.meta.env.DEV ist dort false).
const DevLauncher = import.meta.env.DEV ? lazy(() => import('./dev/DevLauncher').then((m) => ({ default: m.DevLauncher }))) : null;
const UiPreview = import.meta.env.DEV ? lazy(() => import('./dev/UiPreview').then((m) => ({ default: m.UiPreview }))) : null;

export function App() {
  const state = useClientState();
  useGameSounds(state);

  if (UiPreview && window.location.pathname === '/dev/ui') {
    return (
      <Suspense fallback={null}>
        <UiPreview />
      </Suspense>
    );
  }

  if (DevLauncher && window.location.pathname === '/dev') {
    return (
      <Suspense fallback={null}>
        <DevLauncher />
      </Suspense>
    );
  }

  return (
    <>
      <ConnectionBanner status={state.connection} />
      {state.view ? (
        state.view.match ? (
          <GameScreen view={state.view} />
        ) : (
          <LobbyScreen view={state.view} />
        )
      ) : state.resuming ? (
        <main className="home">
          <p className="muted">Verbinde mit deinem Raum …</p>
        </main>
      ) : (
        <HomeScreen exitReason={state.exitReason} onDismissExit={api.dismissExit} />
      )}
    </>
  );
}

function ConnectionBanner({ status }: { status: string }) {
  if (status === 'connected') return null;
  return (
    <div className="connection-banner" role="status">
      {status === 'connecting' ? 'Verbinde mit Server …' : 'Verbindung unterbrochen – versuche erneut …'}
    </div>
  );
}
