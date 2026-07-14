import { useState, type FormEvent } from 'react';
import { ASSIGNMENT } from '../data/assignment';
import type { SaveEnvelope, StudentProfile } from '../types/game';

interface IdentifyScreenProps {
  resumableSave: SaveEnvelope | null;
  onIdentify: (student: StudentProfile) => void;
  onResume: () => void;
  onClearData: () => Promise<void>;
}

export function IdentifyScreen({
  resumableSave,
  onIdentify,
  onResume,
  onClearData,
}: IdentifyScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [period, setPeriod] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleanFirst = firstName.trim().replace(/\s+/g, ' ');
    const cleanInitial = lastInitial.trim().slice(0, 1).toUpperCase();
    const numericPeriod = Number(period);
    if (cleanFirst.length < 1 || cleanFirst.length > 40) {
      setError('Enter your first name using 1–40 characters.');
      return;
    }
    if (!/^[A-Z]$/.test(cleanInitial)) {
      setError('Enter one letter for your last initial.');
      return;
    }
    if (!ASSIGNMENT.periods.includes(numericPeriod)) {
      setError('Choose your class period.');
      return;
    }
    onIdentify({ firstName: cleanFirst, lastInitial: cleanInitial, period: numericPeriod });
  };

  return (
    <main className="screen identify-screen">
      <section className="hero-card" aria-labelledby="game-title">
        <p className="eyebrow">Ninth-grade Biology mission</p>
        <h1 id="game-title">Build a Living Cell</h1>
        <p className="hero-copy">
          Build a simplified model of a photosynthetic plant cell. Cell parts are enlarged and are
          not to scale.
        </p>
        <p className="system-copy">
          Cells are systems. Their parts work together to keep the cell functioning.
        </p>
      </section>

      <section className="form-card" aria-labelledby="identify-heading">
        <h2 id="identify-heading">Start your private attempt</h2>
        <p>Only your first name, last initial, and class period are requested.</p>
        {resumableSave && (
          <div className="resume-card">
            <p>
              A saved attempt is available on this device at {Math.round(resumableSave.score.total)}
              %.
            </p>
            <button className="primary-button" type="button" onClick={onResume}>
              Resume saved attempt
            </button>
          </div>
        )}
        <form onSubmit={submit} noValidate>
          <label>
            First name
            <input
              autoComplete="given-name"
              maxLength={40}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label>
            Last initial
            <input
              autoComplete="family-name"
              inputMode="text"
              maxLength={1}
              value={lastInitial}
              onChange={(event) => setLastInitial(event.target.value.replace(/[^a-z]/gi, ''))}
            />
          </label>
          <label>
            Class period
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="">Choose 1–7</option>
              {ASSIGNMENT.periods.map((value) => (
                <option key={value} value={value}>
                  Period {value}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit">
            Continue to controls
          </button>
        </form>
        <button
          className="text-button danger-text"
          type="button"
          onClick={async () => {
            if (window.confirm('Clear saved progress and student information from this device?')) {
              await onClearData();
            }
          }}
        >
          New student / clear local data
        </button>
      </section>
      <footer className="legal-footer">
        Independent educational project. Not approved by or associated with Mojang or Microsoft. No
        copied Minecraft assets or branding are used.
      </footer>
    </main>
  );
}
