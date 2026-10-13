import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** When this value changes (e.g. the route path), a captured error is cleared. */
  resetKey?: string;
  /** `page` keeps the surrounding layout (header / dock) usable; `fullscreen` replaces the whole app. */
  variant?: 'page' | 'fullscreen';
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a crash in one page doesn't white-screen the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const fullscreen = this.props.variant === 'fullscreen';
    return (
      <div
        role="alert"
        className={`${fullscreen ? 'min-h-screen' : 'min-h-[60vh]'} bg-background flex items-center justify-center p-6`}
      >
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
            <AlertTriangle size={26} className="text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Что-то пошло не так</h2>
            <p className="text-sm text-muted-foreground">
              Произошла непредвиденная ошибка. Ваши данные не потеряны — попробуйте обновить страницу.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} /> Обновить страницу
            </button>
            {!fullscreen && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground"
              >
                Попробовать снова
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
