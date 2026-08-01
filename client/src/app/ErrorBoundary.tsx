import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in route content so one failing screen
 * doesn't blank the entire app -- nav, header, and the connection-status
 * indicator all stay usable. React error boundaries must be class
 * components; there is no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[client] route render error', { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md text-center">
            <CardContent className="flex flex-col items-center gap-4 pt-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-short/15">
                <AlertTriangle className="h-6 w-6 text-short" aria-hidden />
              </div>
              <h2 className="font-display text-xl font-medium tracking-tight text-ink-primary">Something went wrong</h2>
              <p className="text-sm leading-relaxed text-ink-secondary">
                This screen hit an unexpected error. The rest of the app is unaffected -- try again, or navigate
                elsewhere.
              </p>
              <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
