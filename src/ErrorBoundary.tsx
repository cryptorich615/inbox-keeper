import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Inbox Keeper UI error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="fatal-error" role="alert"><h1>Inbox Keeper hit a problem</h1><p>Your saved demo data was not deleted. Reload the page to try again.</p><button onClick={() => location.reload()}>Reload safely</button></main>;
  }
}
