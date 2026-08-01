import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  symbol: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Card-sized (not full-page, unlike app/ErrorBoundary.tsx) fallback so one
 * chart failing to render doesn't take the whole Overview page down with
 * it -- an explicit CHART-001 requirement, not a generic nicety.
 */
export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[client] chart render error', {
      symbol: this.props.symbol,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <AlertTriangle className="h-5 w-5 text-short" aria-hidden />
          <p className="text-sm text-ink-secondary">Chart failed to render.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
