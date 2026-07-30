import { Settings as SettingsIcon } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function SettingsPage() {
  return (
    <PlaceholderPage
      icon={SettingsIcon}
      title="Settings is coming next"
      description="Risk limits (position size, leverage, max open positions, personal kill switch) already work end to end on the backend. The editable form for them is the next build."
    />
  );
}
