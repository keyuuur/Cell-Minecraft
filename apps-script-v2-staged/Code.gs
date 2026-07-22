var V2_RAW_SHEET = 'RawSubmissions';
var V2_BEST_SHEET = 'BestResults';
var V2_RAW_HEADERS_V1 = [
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
var V2_RAW_HEADERS = V2_RAW_HEADERS_V1.concat([
  'ContractVersion',
  'PayloadDigest',
  'SourceEnvironment',
]);
var V2_BEST_HEADERS_V1 = [
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
var V2_BEST_HEADERS = [
  'SessionKey',
  'AssignmentId',
  'Period',
  'FirstName',
  'LastInitial',
  'BestScore',
  'Completed',
  'ServerTimestamp',
  'AttemptId',
  'AssignmentVersion',
  'SessionId',
  'GameVersion',
  'IdentitySessionCount',
  'AmbiguousIdentity',
];

function setupSubmissionDestination() {
  return verifySubmissionDestinationV2();
}

function verifySubmissionDestinationV2() {
  var sheets = getVerifiedSheetsV2_();
  return {
    status: 'verified',
    rawRows: Math.max(0, sheets.raw.getLastRow() - 1),
    bestRows: Math.max(0, sheets.best.getLastRow() - 1),
    contractVersion: V2_CONTRACT_VERSION,
  };
}

function migrateSubmissionDestinationV2() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw new Error('SERVER_BUSY');
  try {
    var spreadsheet = getConfiguredSpreadsheetV2_();
    var raw = spreadsheet.getSheetByName(V2_RAW_SHEET);
    var best = spreadsheet.getSheetByName(V2_BEST_SHEET);
    if (!raw || !best) throw new Error('SHEET_MISSING');
    var currentRaw = readHeadersV2_(raw);
    if (arraysEqualV2_(currentRaw, V2_RAW_HEADERS)) return verifySubmissionDestinationV2();
    if (!arraysEqualV2_(currentRaw, V2_RAW_HEADERS_V1)) throw new Error('HEADER_MISMATCH');
    var currentBest = readHeadersV2_(best);
    if (!arraysEqualV2_(currentBest, V2_BEST_HEADERS_V1)) throw new Error('HEADER_MISMATCH');
    var rows = readRawRowsV2_(raw, V2_RAW_HEADERS_V1.length);
    if (
      rows.some(function (row) {
        return row[16] !== true;
      }) ||
      best.getLastRow() > 1
    ) {
      throw new Error('LIVE_ROWS_REQUIRE_MANUAL_REVIEW');
    }
    try {
      replaceHeaderV2_(raw, V2_RAW_HEADERS);
      replaceHeaderV2_(best, V2_BEST_HEADERS);
      return verifySubmissionDestinationV2();
    } catch (error) {
      var rollbackFailed = false;
      try {
        replaceHeaderV2_(raw, currentRaw);
      } catch (rawRollbackError) {
        rollbackFailed = true;
      }
      try {
        replaceHeaderV2_(best, currentBest);
      } catch (bestRollbackError) {
        rollbackFailed = true;
      }
      if (rollbackFailed) throw new Error('MIGRATION_ROLLBACK_FAILED');
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function doPost(event) {
  var timestamp = new Date();
  var attemptId = '';
  try {
    if (!event || !event.postData || typeof event.postData.contents !== 'string') {
      throw new Error('INVALID_PAYLOAD');
    }
    if (event.postData.contents.length > 24000) throw new Error('PAYLOAD_TOO_LARGE');
    var envelope = JSON.parse(event.postData.contents);
    if (!exactKeysV2_(envelope, ['proxyKey', 'submission'])) throw new Error('INVALID_PAYLOAD');
    if (envelope.submission && typeof envelope.submission.attemptId === 'string') {
      attemptId = envelope.submission.attemptId.slice(0, 64);
    }
    validateProxyV2_(envelope.proxyKey);
    var submission = validateForwardedSubmissionV2_(envelope.submission);
    attemptId = submission.attemptId;
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) return jsonReceiptV2_(attemptId, 'rejected', timestamp, 'SERVER_BUSY');
    try {
      var sheets = getVerifiedSheetsV2_();
      var rows = readRawRowsV2_(sheets.raw, V2_RAW_HEADERS.length);
      var duplicates = findDuplicateRowsV2_(rows, submission);
      if (duplicates.length > 1) throw new Error('CORRUPT_IDEMPOTENCY_STATE');
      if (duplicates.length === 1) {
        if (String(duplicates[0][19]) !== submission.canonicalDigest) {
          throw new Error('IDEMPOTENCY_CONFLICT');
        }
        return textJsonV2_(parseStoredReceiptV2_(duplicates[0][17], submission.attemptId));
      }
      assertSessionIdentityV2_(rows, submission);
      enforceRateLimitV2_(submission.sessionId);
      var receipt = receiptObjectV2_(submission.attemptId, 'accepted', timestamp);
      sheets.raw.appendRow(rawRowV2_(submission, receipt, timestamp));
      if (!submission.isTest)
        reconcileBestResultsV2_(sheets, rows.concat([rawRowV2_(submission, receipt, timestamp)]));
      return textJsonV2_(receipt);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonReceiptV2_(
      attemptId,
      'rejected',
      timestamp,
      publicErrorCodeV2_(error && error.message),
    );
  }
}

function getConfiguredSpreadsheetV2_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_NOT_CONFIGURED');
  return SpreadsheetApp.openById(id);
}

function getVerifiedSheetsV2_() {
  var spreadsheet = getConfiguredSpreadsheetV2_();
  var raw = spreadsheet.getSheetByName(V2_RAW_SHEET);
  var best = spreadsheet.getSheetByName(V2_BEST_SHEET);
  if (!raw || !best) throw new Error('SHEET_MISSING');
  assertHeadersV2_(raw, V2_RAW_HEADERS);
  assertHeadersV2_(best, V2_BEST_HEADERS);
  return { raw: raw, best: best };
}

function readHeadersV2_(sheet) {
  var lastColumn = sheet.getLastColumn();
  return lastColumn < 1 ? [] : sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function replaceHeaderV2_(sheet, headers) {
  var width = Math.max(sheet.getLastColumn(), headers.length);
  if (width > 0) sheet.getRange(1, 1, 1, width).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function assertHeadersV2_(sheet, expected) {
  if (!arraysEqualV2_(readHeadersV2_(sheet), expected)) throw new Error('HEADER_MISMATCH');
}

function arraysEqualV2_(left, right) {
  return (
    left.length === right.length &&
    left.every(function (item, index) {
      return item === right[index];
    })
  );
}

function readRawRowsV2_(sheet, width) {
  return sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
    : [];
}

function findDuplicateRowsV2_(rows, submission) {
  return rows.filter(function (row) {
    return (
      Number(row[18]) === V2_CONTRACT_VERSION &&
      String(row[1]) === submission.attemptId &&
      String(row[3]) === submission.assignmentId &&
      Number(row[4]) === submission.assignmentVersion
    );
  });
}

function assertSessionIdentityV2_(rows, submission) {
  var bindings = {};
  rows.forEach(function (row) {
    if (
      Number(row[18]) === V2_CONTRACT_VERSION &&
      String(row[2]) === submission.sessionId &&
      String(row[3]) === submission.assignmentId &&
      Number(row[4]) === submission.assignmentVersion
    ) {
      bindings[
        normalizedIdentityV2_({
          firstName: unsheetTextV2_(row[6]),
          lastInitial: String(row[7]),
          period: Number(row[8]),
        })
      ] = true;
    }
  });
  var keys = Object.keys(bindings);
  if (keys.length > 1) throw new Error('CORRUPT_SESSION_BINDING');
  if (keys.length === 1 && keys[0] !== normalizedIdentityV2_(submission)) {
    throw new Error('SESSION_IDENTITY_CONFLICT');
  }
}

function rawRowV2_(submission, receipt, timestamp) {
  return [
    timestamp.toISOString(),
    submission.attemptId,
    submission.sessionId,
    submission.assignmentId,
    submission.assignmentVersion,
    submission.gameVersion,
    sheetTextV2_(submission.firstName, 40),
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
    submission.contractVersion,
    submission.canonicalDigest,
    submission.sourceEnvironment,
  ];
}

function bestRowsFromRawV2_(rows) {
  var bestBySession = {};
  rows.forEach(function (row) {
    if (Number(row[18]) !== V2_CONTRACT_VERSION || row[16] === true) return;
    var candidate = {
      timestamp: String(row[0]),
      attemptId: String(row[1]),
      sessionId: String(row[2]),
      assignmentId: String(row[3]),
      assignmentVersion: Number(row[4]),
      gameVersion: String(row[5]),
      firstName: unsheetTextV2_(row[6]),
      lastInitial: String(row[7]),
      period: Number(row[8]),
      score: Number(row[9]),
      completed: row[10] === true,
    };
    var sessionKey = [
      candidate.assignmentId,
      candidate.assignmentVersion,
      candidate.sessionId,
    ].join('|');
    candidate.sessionKey = sessionKey;
    candidate.identityKey = normalizedIdentityV2_(candidate);
    if (
      bestBySession[sessionKey] &&
      bestBySession[sessionKey].identityKey !== candidate.identityKey
    ) {
      throw new Error('CORRUPT_SESSION_BINDING');
    }
    var current = bestBySession[sessionKey];
    if (!current || candidateBeatsV2_(candidate, current)) bestBySession[sessionKey] = candidate;
  });
  var identitySessions = {};
  Object.keys(bestBySession).forEach(function (key) {
    var candidate = bestBySession[key];
    identitySessions[candidate.identityKey] = identitySessions[candidate.identityKey] || {};
    identitySessions[candidate.identityKey][candidate.sessionKey] = true;
  });
  return Object.keys(bestBySession)
    .map(function (key) {
      var candidate = bestBySession[key];
      var count = Object.keys(identitySessions[candidate.identityKey]).length;
      return [
        candidate.sessionKey,
        candidate.assignmentId,
        candidate.period,
        sheetTextV2_(candidate.firstName, 40),
        candidate.lastInitial,
        candidate.score,
        candidate.completed,
        candidate.timestamp,
        candidate.attemptId,
        candidate.assignmentVersion,
        candidate.sessionId,
        candidate.gameVersion,
        count,
        count > 1,
      ];
    })
    .sort(function (left, right) {
      return String(left[0]).localeCompare(String(right[0]));
    });
}

function candidateBeatsV2_(incoming, current) {
  return (
    incoming.score > current.score ||
    (incoming.score === current.score && incoming.completed && !current.completed) ||
    (incoming.score === current.score &&
      incoming.completed === current.completed &&
      incoming.timestamp > current.timestamp) ||
    (incoming.score === current.score &&
      incoming.completed === current.completed &&
      incoming.timestamp === current.timestamp &&
      incoming.attemptId.localeCompare(current.attemptId) > 0)
  );
}

function reconcileBestResultsV2_(sheets, rawRows) {
  try {
    replaceBestRowsV2_(sheets.best, bestRowsFromRawV2_(rawRows));
    PropertiesService.getScriptProperties().deleteProperty('BEST_RESULTS_REBUILD_REQUIRED');
  } catch (error) {
    PropertiesService.getScriptProperties().setProperty('BEST_RESULTS_REBUILD_REQUIRED', 'true');
  }
}

function rebuildBestResultsV2() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw new Error('SERVER_BUSY');
  try {
    var sheets = getVerifiedSheetsV2_();
    var rows = readRawRowsV2_(sheets.raw, V2_RAW_HEADERS.length);
    var bestRows = bestRowsFromRawV2_(rows);
    replaceBestRowsV2_(sheets.best, bestRows);
    PropertiesService.getScriptProperties().deleteProperty('BEST_RESULTS_REBUILD_REQUIRED');
    return { rawRows: rows.length, bestRows: bestRows.length };
  } finally {
    lock.releaseLock();
  }
}

function replaceBestRowsV2_(sheet, rows) {
  assertHeadersV2_(sheet, V2_BEST_HEADERS);
  var oldRows =
    sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, V2_BEST_HEADERS.length).getValues()
      : [];
  try {
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, V2_BEST_HEADERS.length).setValues(rows);
    if (oldRows.length > rows.length) {
      sheet
        .getRange(2 + rows.length, 1, oldRows.length - rows.length, V2_BEST_HEADERS.length)
        .clearContent();
    }
  } catch (error) {
    if (oldRows.length > 0)
      sheet.getRange(2, 1, oldRows.length, V2_BEST_HEADERS.length).setValues(oldRows);
    throw error;
  }
}

function validateProxyV2_(value) {
  var expected = PropertiesService.getScriptProperties().getProperty('PROXY_KEY');
  if (!expected || value !== expected) throw new Error('UNAUTHORIZED_PROXY');
}

function enforceRateLimitV2_(sessionId) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    cleanIdV2_(sessionId),
    Utilities.Charset.UTF_8,
  )
    .slice(0, 8)
    .map(function (byte) {
      return (byte + 256).toString(16).slice(-2);
    })
    .join('');
  var cache = CacheService.getScriptCache();
  var key = 'rate-v2-' + digest;
  var count = Number(cache.get(key) || 0) + 1;
  if (count > 20) throw new Error('RATE_LIMITED');
  cache.put(key, String(count), 60);
}

function parseStoredReceiptV2_(value, attemptId) {
  var receipt = typeof value === 'string' ? JSON.parse(value) : value;
  var terminal = receipt && (receipt.status === 'accepted' || receipt.status === 'duplicate');
  if (
    !exactKeysV2_(receipt, ['attemptId', 'status', 'serverTimestamp'], ['errorCode']) ||
    receipt.attemptId !== attemptId ||
    ['accepted', 'duplicate', 'rejected'].indexOf(receipt.status) < 0 ||
    typeof receipt.serverTimestamp !== 'string' ||
    !Number.isFinite(Date.parse(receipt.serverTimestamp)) ||
    (terminal
      ? receipt.errorCode !== undefined
      : typeof receipt.errorCode !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(receipt.errorCode))
  ) {
    throw new Error('CORRUPT_RECEIPT_STATE');
  }
  return receipt;
}

function receiptObjectV2_(attemptId, status, timestamp, errorCode) {
  var receipt = { attemptId: attemptId, status: status, serverTimestamp: timestamp.toISOString() };
  if (errorCode) receipt.errorCode = errorCode;
  return receipt;
}

function textJsonV2_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function jsonReceiptV2_(attemptId, status, timestamp, errorCode) {
  return textJsonV2_(receiptObjectV2_(attemptId, status, timestamp, errorCode));
}

function sheetTextV2_(value, maxLength) {
  var clean = normalizeFirstNameV2_(String(value)).slice(0, maxLength);
  return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
}

function unsheetTextV2_(value) {
  var text = String(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function publicErrorCodeV2_(value) {
  if (value === 'SPREADSHEET_NOT_CONFIGURED' || value === 'UNAUTHORIZED_PROXY') {
    return 'BACKEND_UNAVAILABLE';
  }
  var allowed = [
    'PAYLOAD_TOO_LARGE',
    'INVALID_PAYLOAD',
    'UNSUPPORTED_CONTRACT',
    'INVALID_NAME',
    'INVALID_ID',
    'INVALID_NUMBER',
    'INVALID_OBJECTIVES',
    'INVALID_HINTS',
    'INVALID_OUTCOME',
    'INVALID_COMPLETION',
    'INVALID_ACTIVE_TIME',
    'INVALID_PERIOD',
    'INVALID_SOURCE_ENVIRONMENT',
    'INVALID_TEST_CLASSIFICATION',
    'IDENTITY_NOT_NORMALIZED',
    'SCORE_MISMATCH',
    'INVALID_DIGEST',
    'DIGEST_MISMATCH',
    'IDEMPOTENCY_CONFLICT',
    'SESSION_IDENTITY_CONFLICT',
    'CORRUPT_IDEMPOTENCY_STATE',
    'CORRUPT_SESSION_BINDING',
    'CORRUPT_RECEIPT_STATE',
    'HEADER_MISMATCH',
    'SHEET_MISSING',
    'RATE_LIMITED',
    'SERVER_BUSY',
  ];
  return allowed.indexOf(value) >= 0 ? value : 'INVALID_SUBMISSION';
}
