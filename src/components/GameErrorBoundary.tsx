import { Component, type ReactNode } from 'react';

interface GameErrorBoundaryProps {
  children: ReactNode;
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
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="modal-backdrop">
          <section className="modal-panel" role="alert">
            <h2>The 3D scene paused safely</h2>
            <p>
              Your progress is stored on this device. Reload to restore the construction chamber.
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
