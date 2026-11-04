import { lazy, Suspense } from 'react';
import { Redirect, Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomeScreen } from './features/home/HomeScreen';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { TabBar } from './ui/TabBar';
import { UpdateBanner } from './ui/UpdateBanner';

// El mapa se carga aparte: MapLibre pesa y el inicio tiene que abrir rápido.
const ExploreScreen = lazy(() =>
  import('./features/explore/ExploreScreen').then((m) => ({ default: m.ExploreScreen })),
);
const VerifyScreen = lazy(() =>
  import('./features/verify/VerifyScreen').then((m) => ({ default: m.VerifyScreen })),
);
const SessionScreen = lazy(() =>
  import('./features/session/SessionScreen').then((m) => ({ default: m.SessionScreen })),
);
const OnboardingScreen = lazy(() =>
  import('./features/onboarding/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen })),
);
const DiagnosticsScreen = lazy(() =>
  import('./features/diagnostics/DiagnosticsScreen').then((m) => ({
    default: m.DiagnosticsScreen,
  })),
);

export function App() {
  return (
    <Router hook={useHashLocation}>
      <div className="flex h-dvh flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Screens />
        </main>
        <TabBar />
      </div>
      <UpdateBanner />
    </Router>
  );
}

function Screens() {
  // Con la ruta como key, cambiar de pantalla deja atrás un error anterior.
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location}>
      <Switch>
        <Route path="/">
          <HomeScreen />
        </Route>
        <Route path="/mapa/:view?">
          <Suspense fallback={<LoadingScreen />}>
            <ExploreScreen />
          </Suspense>
        </Route>
        <Route path="/sesion">
          <Suspense fallback={<LoadingScreen />}>
            <SessionScreen />
          </Suspense>
        </Route>
        <Route path="/bienvenida">
          <Suspense fallback={<LoadingScreen />}>
            <OnboardingScreen />
          </Suspense>
        </Route>
        <Route path="/verificar">
          <Suspense fallback={<LoadingScreen />}>
            <VerifyScreen />
          </Suspense>
        </Route>
        <Route path="/diagnostico">
          <Suspense fallback={<LoadingScreen />}>
            <DiagnosticsScreen />
          </Suspense>
        </Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </ErrorBoundary>
  );
}

function LoadingScreen() {
  return (
    <p role="status" className="grid h-full place-items-center text-muted">
      Cargando…
    </p>
  );
}
