var V2_ASSIGNMENT_ID = 'build-a-living-cell-unit1';
var V2_ASSIGNMENT_VERSION = 1;
var V2_GAME_VERSION = '0.2.0';
var V2_CONTRACT_VERSION = 2;
var V2_OBJECTIVE_KEYS = [
  'wallPanels',
  'membranePanels',
  'cytoplasm',
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
  'centralVacuole',
  'droughtDiagnosed',
  'droughtObserved',
  'recoveryRestored',
  'effectCellWall',
  'effectCellMembrane',
  'effectCytoplasm',
  'effectNucleus',
  'effectRibosomes',
  'effectMitochondria',
  'effectChloroplasts',
  'effectCentralVacuole',
];
var V2_SCORE_KEYS = [
  'boundary',
  'requiredStructures',
  'placementContext',
  'activationFunctions',
  'droughtRecovery',
  'finalStability',
  'total',
];
var V2_CLIENT_KEYS = [
  'contractVersion',
  'firstName',
  'lastInitial',
  'period',
  'attemptId',
  'sessionId',
  'assignmentId',
  'assignmentVersion',
  'gameVersion',
  'completed',
  'early',
  'timeout',
  'activeTimeSeconds',
  'objectives',
  'hintsUsed',
];
var V2_FORWARDED_KEYS = V2_CLIENT_KEYS.concat([
  'score',
  'isTest',
  'sourceEnvironment',
  'canonicalDigest',
]);

function exactKeysV2_(value, required, optional) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  optional = optional || [];
  var keys = Object.keys(value);
  return (
    required.every(function (key) {
      return keys.indexOf(key) >= 0;
    }) &&
    keys.every(function (key) {
      return required.indexOf(key) >= 0 || optional.indexOf(key) >= 0;
    })
  );
}

function normalizeFirstNameV2_(value) {
  if (typeof value !== 'string') throw new Error('INVALID_NAME');
  var normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 40) throw new Error('INVALID_NAME');
  return normalized;
}

function cleanIdV2_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(value)) {
    throw new Error('INVALID_ID');
  }
  return value;
}

function integerV2_(value, min, max, code) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(code || 'INVALID_NUMBER');
  }
  return value;
}

function validateObjectivesV2_(value) {
  if (!exactKeysV2_(value, V2_OBJECTIVE_KEYS)) throw new Error('INVALID_OBJECTIVES');
  var result = {};
  V2_OBJECTIVE_KEYS.forEach(function (key) {
    var item = value[key];
    if (key === 'wallPanels' || key === 'membranePanels') {
      result[key] = integerV2_(item, 0, 6, 'INVALID_OBJECTIVES');
    } else {
      if (typeof item !== 'boolean') throw new Error('INVALID_OBJECTIVES');
      result[key] = item;
    }
  });
  if (result.membranePanels > 0 && result.wallPanels !== 6) throw new Error('INVALID_OBJECTIVES');
  if (result.cytoplasm && (result.wallPanels !== 6 || result.membranePanels !== 6)) {
    throw new Error('INVALID_OBJECTIVES');
  }
  [
    ['effectCellWall', result.wallPanels === 6],
    ['effectCellMembrane', result.membranePanels === 6],
    ['effectCytoplasm', result.cytoplasm],
    ['effectNucleus', result.nucleus],
    ['effectRibosomes', result.ribosomes],
    ['effectMitochondria', result.mitochondria],
    ['effectChloroplasts', result.chloroplasts],
    ['effectCentralVacuole', result.centralVacuole],
  ].forEach(function (pair) {
    if (result[pair[0]] && !pair[1]) throw new Error('INVALID_OBJECTIVES');
  });
  if (result.droughtObserved && !result.droughtDiagnosed) throw new Error('INVALID_OBJECTIVES');
  if (result.recoveryRestored && (!result.droughtDiagnosed || !result.droughtObserved)) {
    throw new Error('INVALID_OBJECTIVES');
  }
  return result;
}

function validateHintsV2_(value) {
  if (!exactKeysV2_(value, ['1', '2', '3'])) throw new Error('INVALID_HINTS');
  return {
    1: integerV2_(value[1], 0, 100, 'INVALID_HINTS'),
    2: integerV2_(value[2], 0, 100, 'INVALID_HINTS'),
    3: integerV2_(value[3], 0, 100, 'INVALID_HINTS'),
  };
}

function roundV2_(value) {
  return Math.round(value * 10) / 10;
}

function scoreObjectivesV2_(objectives, completed) {
  var wall = objectives.wallPanels === 6;
  var membrane = objectives.membranePanels === 6;
  var present = [
    wall,
    membrane,
    objectives.cytoplasm,
    objectives.nucleus,
    objectives.ribosomes,
    objectives.mitochondria,
    objectives.chloroplasts,
    objectives.centralVacuole,
  ];
  var effects = [
    objectives.effectCellWall,
    objectives.effectCellMembrane,
    objectives.effectCytoplasm,
    objectives.effectNucleus,
    objectives.effectRibosomes,
    objectives.effectMitochondria,
    objectives.effectChloroplasts,
    objectives.effectCentralVacuole,
  ];
  var boundary = roundV2_(15 * ((objectives.wallPanels + objectives.membranePanels) / 12));
  var requiredStructures = roundV2_(
    30 *
      (present.filter(function (flag) {
        return flag;
      }).length /
        8),
  );
  var broad = [
    objectives.nucleus,
    objectives.ribosomes,
    objectives.mitochondria,
    objectives.chloroplasts,
  ].filter(function (flag) {
    return flag;
  }).length;
  var placementContext = roundV2_(
    (wall && membrane ? 5 : 0) + (objectives.centralVacuole ? 4 : 0) + broad * 1.5,
  );
  var activationFunctions = roundV2_(
    20 *
      (effects.filter(function (flag) {
        return flag;
      }).length /
        8),
  );
  var droughtRecovery =
    (objectives.droughtDiagnosed ? 5 : 0) +
    (objectives.droughtObserved ? 5 : 0) +
    (objectives.recoveryRestored ? 5 : 0);
  var finalStability =
    completed &&
    present.every(function (flag) {
      return flag;
    }) &&
    effects.every(function (flag) {
      return flag;
    }) &&
    objectives.recoveryRestored
      ? 5
      : 0;
  return {
    boundary: boundary,
    requiredStructures: requiredStructures,
    placementContext: placementContext,
    activationFunctions: activationFunctions,
    droughtRecovery: droughtRecovery,
    finalStability: finalStability,
    total: roundV2_(
      boundary +
        requiredStructures +
        placementContext +
        activationFunctions +
        droughtRecovery +
        finalStability,
    ),
  };
}

function scoreEqualsV2_(left, right) {
  return (
    exactKeysV2_(left, V2_SCORE_KEYS) &&
    V2_SCORE_KEYS.every(function (key) {
      return typeof left[key] === 'number' && left[key] === right[key];
    })
  );
}

function logicallyCompleteV2_(objectives) {
  return (
    objectives.wallPanels === 6 &&
    objectives.membranePanels === 6 &&
    objectives.cytoplasm &&
    objectives.nucleus &&
    objectives.ribosomes &&
    objectives.mitochondria &&
    objectives.chloroplasts &&
    objectives.centralVacuole &&
    objectives.recoveryRestored &&
    V2_OBJECTIVE_KEYS.filter(function (key) {
      return key.indexOf('effect') === 0;
    }).every(function (key) {
      return objectives[key] === true;
    })
  );
}

function validateForwardedSubmissionV2_(value) {
  if (!exactKeysV2_(value, V2_FORWARDED_KEYS)) throw new Error('INVALID_PAYLOAD');
  if (
    value.contractVersion !== V2_CONTRACT_VERSION ||
    value.assignmentId !== V2_ASSIGNMENT_ID ||
    value.assignmentVersion !== V2_ASSIGNMENT_VERSION ||
    value.gameVersion !== V2_GAME_VERSION
  ) {
    throw new Error('UNSUPPORTED_CONTRACT');
  }
  var firstName = normalizeFirstNameV2_(value.firstName);
  var lastInitial = typeof value.lastInitial === 'string' ? value.lastInitial.toUpperCase() : '';
  if (
    value.firstName !== firstName ||
    value.lastInitial !== lastInitial ||
    !/^[A-Z]$/.test(lastInitial)
  ) {
    throw new Error('IDENTITY_NOT_NORMALIZED');
  }
  var completed = value.completed;
  var early = value.early;
  var timeout = value.timeout;
  if (
    typeof completed !== 'boolean' ||
    typeof early !== 'boolean' ||
    typeof timeout !== 'boolean' ||
    [completed, early, timeout].filter(function (flag) {
      return flag;
    }).length !== 1
  ) {
    throw new Error('INVALID_OUTCOME');
  }
  var objectives = validateObjectivesV2_(value.objectives);
  var activeTimeSeconds = integerV2_(value.activeTimeSeconds, 0, 900, 'INVALID_ACTIVE_TIME');
  if (completed !== logicallyCompleteV2_(objectives)) throw new Error('INVALID_COMPLETION');
  if (timeout && activeTimeSeconds !== 900) throw new Error('INVALID_ACTIVE_TIME');
  if (early && activeTimeSeconds >= 900) throw new Error('INVALID_ACTIVE_TIME');
  var sourceEnvironment = value.sourceEnvironment;
  if (['production', 'preview', 'development', 'test'].indexOf(sourceEnvironment) < 0) {
    throw new Error('INVALID_SOURCE_ENVIRONMENT');
  }
  if (typeof value.isTest !== 'boolean' || value.isTest !== (sourceEnvironment !== 'production')) {
    throw new Error('INVALID_TEST_CLASSIFICATION');
  }
  var score = scoreObjectivesV2_(objectives, completed);
  if (!scoreEqualsV2_(value.score, score)) throw new Error('SCORE_MISMATCH');
  if (typeof value.canonicalDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.canonicalDigest)) {
    throw new Error('INVALID_DIGEST');
  }
  var clean = {
    contractVersion: V2_CONTRACT_VERSION,
    firstName: firstName,
    lastInitial: lastInitial,
    period: integerV2_(value.period, 1, 7, 'INVALID_PERIOD'),
    attemptId: cleanIdV2_(value.attemptId),
    sessionId: cleanIdV2_(value.sessionId),
    assignmentId: V2_ASSIGNMENT_ID,
    assignmentVersion: V2_ASSIGNMENT_VERSION,
    gameVersion: V2_GAME_VERSION,
    completed: completed,
    early: early,
    timeout: timeout,
    activeTimeSeconds: activeTimeSeconds,
    objectives: objectives,
    hintsUsed: validateHintsV2_(value.hintsUsed),
    score: score,
    isTest: value.isTest,
    sourceEnvironment: sourceEnvironment,
    canonicalDigest: value.canonicalDigest,
  };
  if (digestForwardedSubmissionV2_(clean) !== clean.canonicalDigest)
    throw new Error('DIGEST_MISMATCH');
  return clean;
}

function canonicalForwardedSubmissionV2_(payload) {
  var objectives = {};
  V2_OBJECTIVE_KEYS.forEach(function (key) {
    objectives[key] = payload.objectives[key];
  });
  return JSON.stringify({
    contractVersion: payload.contractVersion,
    assignmentId: payload.assignmentId,
    assignmentVersion: payload.assignmentVersion,
    gameVersion: payload.gameVersion,
    attemptId: payload.attemptId,
    sessionId: payload.sessionId,
    firstName: normalizeFirstNameV2_(payload.firstName),
    lastInitial: payload.lastInitial.toUpperCase(),
    period: payload.period,
    completed: payload.completed,
    early: payload.early,
    timeout: payload.timeout,
    activeTimeSeconds: payload.activeTimeSeconds,
    objectives: objectives,
    hintsUsed: { 1: payload.hintsUsed[1], 2: payload.hintsUsed[2], 3: payload.hintsUsed[3] },
    score: {
      boundary: payload.score.boundary,
      requiredStructures: payload.score.requiredStructures,
      placementContext: payload.score.placementContext,
      activationFunctions: payload.score.activationFunctions,
      droughtRecovery: payload.score.droughtRecovery,
      finalStability: payload.score.finalStability,
      total: payload.score.total,
    },
    isTest: payload.isTest,
    sourceEnvironment: payload.sourceEnvironment,
  });
}

function digestForwardedSubmissionV2_(payload) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    canonicalForwardedSubmissionV2_(payload),
    Utilities.Charset.UTF_8,
  )
    .map(function (byte) {
      return (byte + 256).toString(16).slice(-2);
    })
    .join('');
}

function normalizedIdentityV2_(submission) {
  return [
    normalizeFirstNameV2_(submission.firstName).toLocaleLowerCase('en-US'),
    submission.lastInitial.toUpperCase(),
    String(submission.period),
  ].join('|');
}

function idempotencyKeyV2_(submission) {
  return [submission.assignmentId, submission.assignmentVersion, submission.attemptId].join('|');
}

function sessionBindingKeyV2_(submission) {
  return [submission.assignmentId, submission.assignmentVersion, submission.sessionId].join('|');
}
