import { Component, type ReactNode } from 'react';

interface GameErrorBoundaryProps {
  children: ReactNode;
  onError?: () => void;
}

interface GameErrorBoundaryState {
  failed: boolean;
}

export class GameErrorBoundary extends Component<GameErrorBoundaryProps, GameErrorBoundaryState> {
  state: GameErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): GameErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    // Student identity and save contents are intentionally never written to the console.
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="modal-backdrop">
          <section className="modal-panel" role="alert">
            <h2>The 3D scene paused safely</h2>
            <p>
              Controls and the active timer stopped. Reload to restore the last confirmed local
              save; if the screen had not shown Saved, ask your teacher before closing it.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload saved mission
            </button>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}
