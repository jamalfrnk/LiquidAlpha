import { Radio } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function SignalsPage() {
  return (
    <PlaceholderPage
      icon={Radio}
      title="Signals is coming next"
      description="The backend already generates evidence-backed signals (rule alignment score, indicator snapshot, entry/stop/target). This screen -- with full signal detail and history -- is the next build."
    />
  );
}
