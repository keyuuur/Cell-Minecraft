const RAW_SHEET = 'RawSubmissions';
const BEST_SHEET = 'BestResults';
const ASSIGNMENT_ID = 'build-a-living-cell-unit1';
const RAW_HEADERS = [
  'ServerTimestamp',
  'AttemptId',
  'SessionId',
  'AssignmentId',
  'AssignmentVersion',
  'GameVersion',
  'FirstName',
  'LastInitial',
  'Period',
  'Score',
  'Completed',
  'Early',
  'Timeout',
  'ActiveTimeSeconds',
  'HintsUsed',
  'Objectives',
  'IsTest',
  'ReceiptJson',
];
const BEST_HEADERS = [
  'StudentKey',
  'AssignmentId',
  'Period',
  'FirstName',
  'LastInitial',
  'BestScore',
  'Completed',
  'ServerTimestamp',
  'AttemptId',
];

function setupSubmissionDestination() {
  const spreadsheet = SpreadsheetApp.create('Build a Living Cell — Results');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  ensureSheets_(spreadsheet);
  return { spreadsheetId: spreadsheet.getId(), spreadsheetUrl: spreadsheet.getUrl() };
}

function configureProxyKey(proxyKey) {
  if (typeof proxyKey !== 'string' || proxyKey.length < 24)
    throw new Error('Proxy key must be at least 24 characters.');
  PropertiesService.getScriptProperties().setProperty('PROXY_KEY', proxyKey);
}

function doPost(event) {
  const timestamp = new Date();
  let attemptId = '';
  try {
    if (!event || !event.postData || event.postData.length > 24000)
      return jsonReceipt_(attemptId, 'rejected', timestamp, 'PAYLOAD_TOO_LARGE');
    const data = JSON.parse(event.postData.contents);
    attemptId = cleanId_(data.attemptId, 64);
    validateProxy_(data.proxyKey);
    const submission = validateSubmission_(data);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) return jsonReceipt_(attemptId, 'rejected', timestamp, 'SERVER_BUSY');
    try {
      const spreadsheet = getSpreadsheet_();
      const sheets = ensureSheets_(spreadsheet);
      const duplicate = findRawByAttemptId_(sheets.raw, submission.attemptId);
      if (duplicate) {
        const duplicateReceipt = JSON.parse(duplicate);
        if (!submission.isTest)
          reconcileBestResult_(
            sheets.best,
            submission,
            new Date(duplicateReceipt.serverTimestamp || timestamp),
          );
        return ContentService.createTextOutput(duplicate).setMimeType(ContentService.MimeType.JSON);
      }
      enforceRateLimit_(submission.sessionId);

      const receipt = receiptObject_(submission.attemptId, 'accepted', timestamp);
      sheets.raw.appendRow([
        timestamp.toISOString(),
        submission.attemptId,
        submission.sessionId,
        submission.assignmentId,
        submission.assignmentVersion,
        submission.gameVersion,
        sheetText_(submission.firstName, 40),
        submission.lastInitial,
        submission.period,
        submission.score.total,
        submission.completed,
        submission.early,
        submission.timeout,
        submission.activeTimeSeconds,
        JSON.stringify(submission.hintsUsed),
        JSON.stringify(submission.objectives),
        submission.isTest,
        JSON.stringify(receipt),
      ]);
      if (!submission.isTest) reconcileBestResult_(sheets.best, submission, timestamp);
      return ContentService.createTextOutput(JSON.stringify(receipt)).setMimeType(
        ContentService.MimeType.JSON,
      );
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonReceipt_(attemptId, 'rejected', timestamp, publicErrorCode_(error && error.message));
  }
}

function validateSubmission_(data) {
  if (!data || typeof data !== 'object') throw new Error('INVALID_PAYLOAD');
  if (data.assignmentId !== ASSIGNMENT_ID) throw new Error('UNKNOWN_ASSIGNMENT');
  const firstName = cleanText_(data.firstName, 40);
  const lastInitial = cleanText_(data.lastInitial, 1).toUpperCase();
  if (!/^[A-Z]$/.test(lastInitial)) throw new Error('INVALID_INITIAL');
  const period = numberInRange_(data.period, 1, 7, true);
  const activeTimeSeconds = numberInRange_(data.activeTimeSeconds, 0, 900, true);
  if (
    typeof data.isTest !== 'boolean' ||
    typeof data.completed !== 'boolean' ||
    typeof data.early !== 'boolean' ||
    typeof data.timeout !== 'boolean'
  )
    throw new Error('INVALID_FLAGS');
  const objectives = validateObjectives_(data.objectives);
  const score = serverScore_(objectives, data.completed);
  if (data.completed && score.total < 100) throw new Error('IMPOSSIBLE_COMPLETION');
  if ([data.completed, data.early, data.timeout].filter(Boolean).length !== 1)
    throw new Error('INVALID_OUTCOME');
  return {
    firstName: firstName,
    lastInitial: lastInitial,
    period: period,
    attemptId: cleanId_(data.attemptId, 64),
    sessionId: cleanId_(data.sessionId, 64),
    assignmentId: data.assignmentId,
    assignmentVersion: numberInRange_(data.assignmentVersion, 1, 1, true),
    gameVersion: cleanText_(data.gameVersion, 24),
    score: score,
    completed: data.completed,
    early: data.early,
    timeout: data.timeout,
    activeTimeSeconds: activeTimeSeconds,
    objectives: objectives,
    hintsUsed: validateHints_(data.hintsUsed),
    isTest: data.isTest,
  };
}

function validateObjectives_(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_OBJECTIVES');
  const result = {
    wallPanels: numberInRange_(raw.wallPanels, 0, 6, true),
    membranePanels: numberInRange_(raw.membranePanels, 0, 6, true),
  };
  [
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
  ].forEach(function (key) {
    if (typeof raw[key] !== 'boolean') throw new Error('INVALID_OBJECTIVE');
    result[key] = raw[key];
  });
  return result;
}

function validateHints_(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_HINTS');
  return {
    1: numberInRange_(raw[1] || 0, 0, 100, true),
    2: numberInRange_(raw[2] || 0, 0, 100, true),
    3: numberInRange_(raw[3] || 0, 0, 100, true),
  };
}

function serverScore_(objectives, claimedComplete) {
  const presentKeys = [
    'cytoplasm',
    'nucleus',
    'ribosomes',
    'mitochondria',
    'chloroplasts',
    'centralVacuole',
  ];
  const present = presentKeys.filter(function (key) {
    return objectives[key];
  }).length;
  const wall = objectives.wallPanels === 6;
  const membrane = objectives.membranePanels === 6;
  const totalPresent = present + Number(wall) + Number(membrane);
  const boundary = round_(15 * ((objectives.wallPanels + objectives.membranePanels) / 12));
  const requiredStructures = round_(30 * (totalPresent / 8));
  const broad = ['nucleus', 'ribosomes', 'mitochondria', 'chloroplasts'].filter(function (key) {
    return objectives[key];
  }).length;
  const placementContext = round_(
    (wall ? 5 : 0) + (objectives.centralVacuole ? 4 : 0) + broad * 1.5,
  );
  const effectKeys = [
    'effectCellWall',
    'effectCellMembrane',
    'effectCytoplasm',
    'effectNucleus',
    'effectRibosomes',
    'effectMitochondria',
    'effectChloroplasts',
    'effectCentralVacuole',
  ];
  const activationFunctions = round_(
    20 *
      (effectKeys.filter(function (key) {
        return objectives[key];
      }).length /
        8),
  );
  const droughtRecovery =
    (objectives.droughtDiagnosed ? 5 : 0) +
    (objectives.droughtObserved ? 5 : 0) +
    (objectives.recoveryRestored ? 5 : 0);
  const effectsObserved = effectKeys.every(function (key) {
    return objectives[key];
  });
  const finalStability =
    claimedComplete && totalPresent === 8 && objectives.recoveryRestored && effectsObserved ? 5 : 0;
  return {
    boundary: boundary,
    requiredStructures: requiredStructures,
    placementContext: placementContext,
    activationFunctions: activationFunctions,
    droughtRecovery: droughtRecovery,
    finalStability: finalStability,
    total: round_(
      boundary +
        requiredStructures +
        placementContext +
        activationFunctions +
        droughtRecovery +
        finalStability,
    ),
  };
}

function updateBestResult_(sheet, submission, timestamp) {
  const key = [
    submission.assignmentId,
    submission.period,
    normalizeName_(submission.firstName),
    submission.lastInitial,
  ].join('|');
  const values = sheet.getDataRange().getValues();
  let row = -1;
  for (let index = 1; index < values.length; index++)
    if (values[index][0] === key) {
      row = index + 1;
      break;
    }
  const incoming = [
    key,
    submission.assignmentId,
    submission.period,
    sheetText_(submission.firstName, 40),
    submission.lastInitial,
    submission.score.total,
    submission.completed,
    timestamp.toISOString(),
    submission.attemptId,
  ];
  if (row < 0) {
    sheet.appendRow(incoming);
    return;
  }
  const current = values[row - 1];
  const replace =
    submission.score.total > Number(current[5]) ||
    (submission.score.total === Number(current[5]) && submission.completed && !current[6]) ||
    (submission.score.total === Number(current[5]) &&
      submission.completed === Boolean(current[6]) &&
      timestamp.toISOString() > String(current[7]));
  if (replace) sheet.getRange(row, 1, 1, incoming.length).setValues([incoming]);
}

function reconcileBestResult_(sheet, submission, timestamp) {
  try {
    updateBestResult_(sheet, submission, timestamp);
  } catch (error) {
    PropertiesService.getScriptProperties().setProperty('BEST_RESULTS_REBUILD_REQUIRED', 'true');
  }
}

function rebuildBestResults() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw new Error('SERVER_BUSY');
  try {
    const sheets = ensureSheets_(getSpreadsheet_());
    if (sheets.best.getLastRow() > 1)
      sheets.best.getRange(2, 1, sheets.best.getLastRow() - 1, BEST_HEADERS.length).clearContent();
    const rows =
      sheets.raw.getLastRow() > 1
        ? sheets.raw.getRange(2, 1, sheets.raw.getLastRow() - 1, RAW_HEADERS.length).getValues()
        : [];
    let rebuilt = 0;
    rows.forEach(function (row) {
      if (row[16] === true) return;
      updateBestResult_(
        sheets.best,
        {
          attemptId: String(row[1]),
          assignmentId: String(row[3]),
          firstName: String(row[6]),
          lastInitial: String(row[7]),
          period: Number(row[8]),
          score: { total: Number(row[9]) },
          completed: row[10] === true,
        },
        new Date(row[0]),
      );
      rebuilt += 1;
    });
    PropertiesService.getScriptProperties().deleteProperty('BEST_RESULTS_REBUILD_REQUIRED');
    return { rebuilt: rebuilt, rawRows: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function findRawByAttemptId_(sheet, attemptId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 2, lastRow - 1, 17).getValues();
  for (let index = 0; index < values.length; index++)
    if (values[index][0] === attemptId) return String(values[index][16]);
  return null;
}

function ensureSheets_(spreadsheet) {
  let raw = spreadsheet.getSheetByName(RAW_SHEET);
  if (!raw) {
    raw = spreadsheet.insertSheet(RAW_SHEET);
    raw.getRange(1, 1, 1, RAW_HEADERS.length).setValues([RAW_HEADERS]);
    raw.setFrozenRows(1);
  }
  let best = spreadsheet.getSheetByName(BEST_SHEET);
  if (!best) {
    best = spreadsheet.insertSheet(BEST_SHEET);
    best.getRange(1, 1, 1, BEST_HEADERS.length).setValues([BEST_HEADERS]);
    best.setFrozenRows(1);
  }
  const first = spreadsheet.getSheets()[0];
  if (
    first.getName() !== RAW_SHEET &&
    first.getLastRow() === 0 &&
    spreadsheet.getSheets().length > 2
  )
    spreadsheet.deleteSheet(first);
  return { raw: raw, best: best };
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_NOT_CONFIGURED');
  return SpreadsheetApp.openById(id);
}

function validateProxy_(value) {
  const expected = PropertiesService.getScriptProperties().getProperty('PROXY_KEY');
  if (!expected || value !== expected) throw new Error('UNAUTHORIZED_PROXY');
}

function enforceRateLimit_(sessionId) {
  const cleanSessionId = cleanId_(sessionId, 64);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cleanSessionId)
    .slice(0, 8)
    .map(function (byte) {
      return (byte + 256).toString(16).slice(-2);
    })
    .join('');
  const cache = CacheService.getScriptCache();
  const key = 'rate-' + digest;
  const count = Number(cache.get(key) || 0) + 1;
  if (count > 20) throw new Error('RATE_LIMITED');
  cache.put(key, String(count), 60);
}

function receiptObject_(attemptId, status, timestamp, errorCode) {
  const result = { attemptId: attemptId, status: status, serverTimestamp: timestamp.toISOString() };
  if (errorCode) result.errorCode = errorCode;
  return result;
}

function jsonReceipt_(attemptId, status, timestamp, errorCode) {
  return ContentService.createTextOutput(
    JSON.stringify(receiptObject_(attemptId, status, timestamp, errorCode)),
  ).setMimeType(ContentService.MimeType.JSON);
}

function cleanId_(value, max) {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9-]+$/.test(value) ||
    value.length < 1 ||
    value.length > max
  )
    throw new Error('INVALID_ID');
  return value;
}

function cleanText_(value, max) {
  if (typeof value !== 'string') throw new Error('INVALID_TEXT');
  const clean = value
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, max);
  if (!clean) throw new Error('INVALID_TEXT');
  return clean;
}

function sheetText_(value, max) {
  const clean = cleanText_(value, max);
  return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
}

function normalizeName_(value) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
}
function numberInRange_(value, min, max, integer) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max ||
    (integer && !Number.isInteger(number))
  )
    throw new Error('INVALID_NUMBER');
  return number;
}
function publicErrorCode_(value) {
  const code = typeof value === 'string' ? value : 'INVALID_SUBMISSION';
  if (code === 'SPREADSHEET_NOT_CONFIGURED' || code === 'UNAUTHORIZED_PROXY')
    return 'BACKEND_UNAVAILABLE';
  const allowed = [
    'PAYLOAD_TOO_LARGE',
    'UNKNOWN_ASSIGNMENT',
    'INVALID_PAYLOAD',
    'INVALID_INITIAL',
    'INVALID_FLAGS',
    'INVALID_OBJECTIVES',
    'INVALID_OBJECTIVE',
    'INVALID_HINTS',
    'INVALID_ID',
    'INVALID_TEXT',
    'INVALID_NUMBER',
    'IMPOSSIBLE_COMPLETION',
    'INVALID_OUTCOME',
    'RATE_LIMITED',
    'SERVER_BUSY',
  ];
  return allowed.indexOf(code) >= 0 ? code : 'INVALID_SUBMISSION';
}
function round_(value) {
  return Math.round(value * 10) / 10;
}

function runSyntheticTest() {
  const result = validateSubmission_({
    proxyKey: 'local-test-only',
    firstName: 'Test',
    lastInitial: 'S',
    period: 1,
    attemptId: Utilities.getUuid(),
    sessionId: Utilities.getUuid(),
    assignmentId: ASSIGNMENT_ID,
    assignmentVersion: 1,
    gameVersion: '0.1.0',
    completed: true,
    early: false,
    timeout: false,
    activeTimeSeconds: 720,
    objectives: {
      wallPanels: 6,
      membranePanels: 6,
      cytoplasm: true,
      nucleus: true,
      ribosomes: true,
      mitochondria: true,
      chloroplasts: true,
      centralVacuole: true,
      droughtDiagnosed: true,
      droughtObserved: true,
      recoveryRestored: true,
      effectCellWall: true,
      effectCellMembrane: true,
      effectCytoplasm: true,
      effectNucleus: true,
      effectRibosomes: true,
      effectMitochondria: true,
      effectChloroplasts: true,
      effectCentralVacuole: true,
    },
    hintsUsed: { 1: 0, 2: 0, 3: 0 },
    isTest: true,
  });
  if (result.score.total !== 100) throw new Error('Synthetic scoring test failed.');
  return result;
}
