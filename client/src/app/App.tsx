import { Route, Switch } from 'wouter';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { AppShell } from './AppShell';
import { ConnectScreen } from './ConnectScreen';
import { OverviewPage } from '../routes/OverviewPage';
import { SignalsPage } from '../routes/SignalsPage';
import { PositionsPage } from '../routes/PositionsPage';
import { SettingsPage } from '../routes/SettingsPage';

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-bg-base text-ink-muted">Loading…</div>;
  }

  if (!user) {
    return <ConnectScreen />;
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/signals" component={SignalsPage} />
        <Route path="/positions" component={PositionsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route>
          <p className="text-ink-secondary">Page not found.</p>
        </Route>
      </Switch>
    </AppShell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
