import { RiskLimitsForm } from '../features/settings/RiskLimitsForm';

export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink-primary">Settings</h1>
        <p className="mt-1 text-sm text-ink-secondary">Risk limits enforced on every order, before it's ever submitted.</p>
      </div>
      <RiskLimitsForm />
    </div>
  );
}
