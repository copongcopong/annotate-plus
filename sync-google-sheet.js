/* =============================================================================
 * sync-google-sheet.js — Google Sheets sync plugin for annotate.js.
 * Load AFTER sync-engine.js. Registers via Annotate.sync.register({…}).
 *
 * Configure with data-google-sheet="<Apps Script URL>" on the annotate.js
 * script tag, or paste the URL when prompted.
 * ========================================================================== */
(function () {
  if (!window.Annotate || !window.Annotate.sync || !window.Annotate._internals) return;
  var I = window.Annotate._internals;

  var GS_SYNCING = false;

  function gsUrl(){ return I.state.sheetUrl; }
  function gsHeaders() { return { "Content-Type": "text/plain" }; }

  function safeJSON(v) {
    if (typeof v !== "string" || !v) return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  }

  function gsFlatten(c) {
    var rows = [];
    rows.push({
      annotateId: c.id, page: c.page, url: c.url, type: c.type,
      author: c.author, text: c.text, color: c.color,
      anchor: c.anchor ? JSON.stringify(c.anchor) : "",
      geom: c.geom ? JSON.stringify(c.geom) : "",
      resolved: c.resolved,
      parentId: "",
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    });
    (c.replies || []).forEach(function (r) {
      rows.push({
        annotateId: r.id, page: c.page, url: "", type: "reply",
        author: r.author, text: r.text, color: "",
        anchor: "", geom: "", resolved: false,
        parentId: c.id,
        createdAt: r.createdAt, updatedAt: "",
      });
    });
    return rows;
  }

  function gsRowToComment(row) {
    if (!row || !row.annotateId) return null;
    return {
      id: row.annotateId, page: row.page || "", url: row.url || "",
      type: row.type || "", author: row.author || "", text: row.text || "",
      color: row.color || "", anchor: safeJSON(row.anchor),
      geom: safeJSON(row.geom),
      resolved: row.resolved === true || row.resolved === "TRUE" || row.resolved === "true",
      parentId: row.parentId || "", replies: [],
      createdAt: row.createdAt || "", updatedAt: row.updatedAt || "",
    };
  }

  function gsNest(rows) {
    var tops = [], byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });
    rows.forEach(function (r) {
      if (r.parentId && byId[r.parentId]) {
        byId[r.parentId].replies.push({
          id: r.id, author: r.author, text: r.text, createdAt: r.createdAt,
        });
      } else if (!r.parentId) { tops.push(r); }
    });
    return tops;
  }

  window.Annotate.sync.register({
    id: "gsheet",
    name: "Google Sheets",
    icon: function () { return I.ICONS.sheets; },
    enabled: function () { return !!I.state.sheetUrl; },

    push: function (c) {
      var rows = gsFlatten(c);
      rows.forEach(function (row) {
        fetch(gsUrl(), { method: "POST", headers: gsHeaders(),
          body: JSON.stringify({ action: "upsert", comment: row }) })
          .catch(function () {});
      });
    },

    delete: function (ids) {
      if (!Array.isArray(ids)) ids = [ids];
      ids.forEach(function (id) {
        fetch(gsUrl(), { method: "POST", headers: gsHeaders(),
          body: JSON.stringify({ action: "delete", annotateId: id }) })
          .catch(function () {});
      });
    },

    pull: function (cb) {
      GS_SYNCING = true;
      var url = gsUrl() + "?page=" + encodeURIComponent(I.PAGE);
      fetch(url)
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res); })
        .then(function (data) {
          var incoming = (data && data.comments || []).map(gsRowToComment).filter(Boolean);
          incoming = gsNest(incoming);
          GS_SYNCING = false;
          cb(incoming, null);
        })
        .catch(function () {
          GS_SYNCING = false;
          cb(null, "Sheet pull failed");
        });
    },

    renderStatus: function (el, n, canShare) {
      if (!this.enabled()) return;
      var row = I.el("div", { class: "an-localnote" }, [
        I.el("span", { html: I.ICONS.sheets }),
        I.el("span", { text: GS_SYNCING ? "Syncing\u2026" : "Synced to Google Sheets \u00B7 " }),
      ]);
      if (!GS_SYNCING) {
        var changeBtn = I.el("button", { class: "an-mini an-ghost2", text: "Change", title: "Change Google Sheet", onclick: function () {
          I.askSheet(function () { I.renderFooter(); });
        } });
        row.appendChild(changeBtn);
      }
      el.appendChild(row);
    },
  });
})();
