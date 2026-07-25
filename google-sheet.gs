// =============================================================================
// annotate.js — Google Sheets sync backend
// -----------------------------------------------------------------------------
// 1. Open your Google Sheet
// 2. Extensions → Apps Script → paste this entire file → Save
// 3. Deploy → New deployment → Web app
//      Execute as: Me
//      Who has access: Anyone
// 4. Copy the web app URL → paste into annotate.js when prompted
//
// The sheet MUST have this header row (column order matters):
//   annotateId | page | url | type | author | text | color | anchor | geom
//   | resolved | parentId | createdAt | updatedAt
//
// Columns beyond Z (=13) are ignored. You can add extra columns for your own
// notes, status flags, etc. — they won't be touched.
// =============================================================================

var HEADERS = [
  "annotateId", "page", "url", "type", "author", "text", "color",
  "anchor", "geom", "resolved", "parentId", "createdAt", "updatedAt"
];
var COL_COUNT = HEADERS.length;

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || "";
  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return json({ comments: [] });

  // Row 1 = headers, rows 2+ = data
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue; // skip rows with no annotateId
    if (page && row[1] !== page) continue; // page filter
    rows.push(rowToObj(row));
  }
  return json({ comments: rows });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "Invalid JSON" });
  }

  var action = body.action;
  if (!action) return json({ ok: false, error: "Missing action" });

  if (action === "upsert") return handleUpsert(body.comment);
  if (action === "delete") return handleDelete(body.annotateId);
  return json({ ok: false, error: "Unknown action: " + action });
}

// ---- helpers ---------------------------------------------------------------

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function rowToObj(row) {
  var obj = {};
  for (var i = 0; i < COL_COUNT; i++) {
    obj[HEADERS[i]] = row[i] != null ? row[i] : (i === 9 ? false : "");
  }
  // Convert boolean-ish values
  if (typeof obj.resolved === "string") obj.resolved = obj.resolved === "TRUE" || obj.resolved === "true";
  return obj;
}

function findRow(sheet, annotateId) {
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(annotateId)) return r + 1; // 1-indexed row number
  }
  return -1;
}

function handleUpsert(comment) {
  if (!comment || !comment.annotateId) return json({ ok: false, error: "Missing annotateId" });
  var sheet = SpreadsheetApp.getActiveSheet();
  var rowNum = findRow(sheet, comment.annotateId);

  var values = HEADERS.map(function (h) {
    var v = comment[h];
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });

  if (rowNum > 0) {
    // Update existing row
    sheet.getRange(rowNum, 1, 1, COL_COUNT).setValues([values]);
  } else {
    // Append new row
    sheet.appendRow(values);
  }
  return json({ ok: true });
}

function handleDelete(annotateId) {
  if (!annotateId) return json({ ok: false, error: "Missing annotateId" });
  var sheet = SpreadsheetApp.getActiveSheet();
  var rowNum = findRow(sheet, annotateId);
  if (rowNum > 0) {
    sheet.deleteRow(rowNum);
  }
  return json({ ok: true });
}
