import { beforeEach, describe, expect, it } from 'vitest';
import { ASSIGNMENT } from '../data/assignment';
import { useGameStore } from './gameStore';

describe('active-time and mission state', () => {
  beforeEach(() => {
    useGameStore.getState().resetForNewStudent();
    useGameStore.getState().identifyStudent({ firstName: 'Test', lastInitial: 'S', period: 1 });
    useGameStore.getState().startMission();
  });

  it('does not count time while paused', () => {
    useGameStore.getState().tickActiveTime(1000);
    useGameStore.getState().setPaused(true);
    useGameStore.getState().tickActiveTime(5000);
    expect(useGameStore.getState().activeElapsedMs).toBe(1000);
  });

  it('does not count graded time during ungraded practice', () => {
    useGameStore.getState().startMission(true);
    useGameStore.getState().tickActiveTime(30_000);
    expect(useGameStore.getState().activeElapsedMs).toBe(0);
    expect(useGameStore.getState().mission.practice).toBe(true);
  });

  it('locks and shows results at 15 active minutes', () => {
    useGameStore.getState().tickActiveTime(ASSIGNMENT.durationSeconds * 1000);
    const state = useGameStore.getState();
    expect(state.timedOut).toBe(true);
    expect(state.mission.completionLocked).toBe(true);
    expect(state.screen).toBe('results');
  });

  it('requires the player to enter the boundary zone before placing panels', () => {
    useGameStore.setState((state) => ({
      mission: { ...state.mission, collected: { cellWall: true } },
      selectedItem: 'cellWall',
    }));
    useGameStore.getState().placeSelected({ x: -15, y: 1, z: 8 });
    expect(useGameStore.getState().mission.wallPanels).toBe(0);
    useGameStore.getState().placeSelected({ x: 0, y: 1, z: 10 });
    expect(useGameStore.getState().mission.wallPanels).toBe(1);
  });

  it('gives boundary-specific placement guidance after collection', () => {
    useGameStore.getState().setNearbyStation('cellWall');
    useGameStore.getState().interact();
    expect(useGameStore.getState().mission.lastFeedback).toContain('OUTER WALL ZONE');
    expect(useGameStore.getState().mission.lastFeedback).not.toContain('inside the cell');

    useGameStore.getState().setNearbyStation('cellMembrane');
    useGameStore.getState().interact();
    expect(useGameStore.getState().mission.lastFeedback).toContain('INNER MEMBRANE ZONE');
    expect(useGameStore.getState().mission.lastFeedback).toContain('just inside the wall');
  });

  it('test-stage navigation reaches a stable cell with full credit', () => {
    for (let step = 0; step < 10; step += 1) useGameStore.getState().testAdvanceStage();
    expect(useGameStore.getState().mission.completed).toBe(true);
    expect(useGameStore.getState().score.total).toBe(100);
  });

  it('records a structure effect only after in-world inspection and clears it on removal', () => {
    useGameStore.setState((state) => ({
      mission: { ...state.mission, wallPanels: 6 },
      nearbyStructure: 'cellWall',
    }));
    useGameStore.getState().interact();
    expect(useGameStore.getState().mission.functionEvidence.cellWall).toBe(true);
    useGameStore.getState().selectItem('cellWall');
    useGameStore.getState().removeSelected();
    expect(useGameStore.getState().mission.functionEvidence.cellWall).toBeUndefined();
  });

  it('requires replacement and reinspection to restore a removed structure function', () => {
    for (let step = 0; step < 3; step += 1) useGameStore.getState().testAdvanceStage();
    useGameStore.setState((state) => ({
      mission: {
        ...state.mission,
        collected: { ...state.mission.collected, nucleus: true },
      },
      nearbyStation: null,
      nearbyStructure: 'nucleus',
    }));
    useGameStore.getState().interact();
    expect(useGameStore.getState().mission.lastFeedback).toContain(
      'The nucleus contains DNA and helps control cell activities.',
    );
    useGameStore.getState().selectItem('nucleus');
    useGameStore.getState().removeSelected();
    expect(useGameStore.getState().mission.functionEvidence.nucleus).toBeUndefined();
    expect(useGameStore.getState().selectedItem).toBe('nucleus');
    useGameStore.getState().placeSelected({ x: -3, y: 1, z: 0 });
    expect(useGameStore.getState().mission.functionEvidence.nucleus).toBeUndefined();
    useGameStore.getState().setNearbyStructure('nucleus');
    useGameStore.getState().interact();
    expect(useGameStore.getState().mission.functionEvidence.nucleus).toBe(true);
  });

  it('does not award function evidence when Overview opens', () => {
    useGameStore.setState((state) => ({
      mission: { ...state.mission, wallPanels: 6 },
    }));
    const before = useGameStore.getState().mission.functionEvidence;
    useGameStore.getState().openOverview();
    expect(useGameStore.getState().mission.functionEvidence).toEqual(before);
  });

  it('separates hydrated baseline, drought observation, repair diagnosis, and recovery verification', () => {
    for (let step = 0; step < 6; step += 1) useGameStore.getState().testAdvanceStage();
    expect(useGameStore.getState().mission.vacuoleHydratedObserved).toBe(true);
    expect(useGameStore.getState().mission.droughtStarted).toBe(false);
    useGameStore.getState().beginDroughtChallenge();
    expect(useGameStore.getState().mission.droughtStarted).toBe(true);
    useGameStore.getState().openOverview();
    expect(useGameStore.getState().mission.droughtObserved).toBe(true);
    expect(useGameStore.getState().mission.droughtDiagnosed).toBe(false);
    useGameStore.getState().setNearbyStation('waterStation');
    useGameStore.getState().interact();
    expect(useGameStore.getState().mission.droughtDiagnosed).toBe(true);
    expect(useGameStore.getState().mission.recoveryRestored).toBe(true);
    expect(useGameStore.getState().mission.completed).toBe(false);
    useGameStore.getState().openOverview();
    expect(useGameStore.getState().mission.completed).toBe(true);
  });

  it('keeps the submitted grade immutable while ungraded practice changes', () => {
    useGameStore.getState().testAdvanceStage();
    useGameStore.getState().submitAttempt(true);
    const submitted = useGameStore.getState().gradedScore?.total;
    useGameStore.getState().continuePractice();
    useGameStore.getState().selectItem('cellWall');
    useGameStore.getState().removeSelected();
    expect(useGameStore.getState().score.total).not.toBe(submitted);
    expect(useGameStore.getState().gradedScore?.total).toBe(submitted);
    useGameStore.getState().endPractice();
    expect(useGameStore.getState().screen).toBe('results');
  });
});
