import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const proofRequested = new URLSearchParams(window.location.search).get('proof');

async function bootstrap() {
  if (proofRequested === 'voxel' || proofRequested === 'boundary') {
    if (!import.meta.env.DEV) {
      root.render(
        <main className="screen">
          <section className="results-card">
            <p className="eyebrow">DEVELOPMENT TOOL</p>
            <h1>Voxel proof unavailable</h1>
            <p>
              This isolated, ungraded interaction proof is excluded from production builds. Return
              to the classroom mission.
            </p>
            <a className="primary-button" href="/">
              Open Build a Living Cell
            </a>
          </section>
        </main>,
      );
      return;
    }
    if (proofRequested === 'boundary') {
      const { default: BoundarySliceApp } = await import('./proof/BoundarySliceApp');
      root.render(
        <StrictMode>
          <BoundarySliceApp />
        </StrictMode>,
      );
      return;
    }
    const { default: VoxelProofApp } = await import('./proof/VoxelProofApp');
    root.render(
      <StrictMode>
        <VoxelProofApp />
      </StrictMode>,
    );
    return;
  }

  const { default: App } = await import('./App');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
