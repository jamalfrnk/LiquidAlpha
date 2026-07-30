import { LayoutDashboard, Radio, Layers, Settings } from 'lucide-react';

export const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/signals', label: 'Signals', icon: Radio },
  { href: '/positions', label: 'Positions', icon: Layers },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
