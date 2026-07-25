/* =============================================================================
 * sync-engine.js — pluggable remote-sync engine for annotate.js.
 * Load AFTER annotate.js. Replaces window.Annotate.sync with the real engine.
 * Plugins register via Annotate.sync.register({…}).
 * ========================================================================== */
(function () {
  if (!window.Annotate || !window.Annotate._internals) return;
  var I = window.Annotate._internals;

  var DIRTY = {};
  var TIMER = null;
  var DEBOUNCE = 2000;

  var engine = {
    plugins: [],

    register: function (p) { engine.plugins.push(p); },

    anyEnabled: function () {
      return engine.plugins.some(function (p) { return p.enabled(); });
    },

    markDirty: function (c) {
      DIRTY[c.id] = c;
      clearTimeout(TIMER);
      TIMER = setTimeout(engine.flush, DEBOUNCE);
    },

    flush: function () {
      TIMER = null;
      var ids = Object.keys(DIRTY);
      if (!ids.length) return;
      var all = I.dbRead().comments;
      engine.plugins.forEach(function (p) {
        if (!p.enabled()) return;
        ids.forEach(function (id) {
          var c = all.filter(function (x) { return x.id === id; })[0];
          if (c && !I.pendingDeletes[id]) try { p.push(c); } catch (e) {}
        });
      });
      DIRTY = {};
    },

    delete: function (ids) {
      if (!Array.isArray(ids)) ids = [ids];
      ids.forEach(function (id) { delete DIRTY[id]; });
      engine.plugins.forEach(function (p) {
        if (!p.enabled()) return;
        try { p.delete(ids); } catch (e) {}
      });
    },

    pull: function (callback) {
      var plugins = engine.plugins.filter(function (p) { return p.enabled(); });
      if (!plugins.length) { if (callback) callback([], null); return; }
      var remaining = plugins.length;
      var allIncoming = [];
      plugins.forEach(function (p) {
        try {
          p.pull(function (incoming, err) {
            if (incoming) allIncoming = allIncoming.concat(incoming);
            remaining--;
            if (remaining === 0) callback(allIncoming, null);
          });
        } catch (e) { remaining--; if (remaining === 0) callback(allIncoming, null); }
      });
    },

    mergeAll: function (incoming) {
      if (!incoming || !incoming.length) return 0;
      var d = I.dbRead();
      var existing = {};
      d.comments.forEach(function (c, i) { existing[c.id] = i; });
      var added = 0;
      incoming.forEach(function (c) {
        if (!c || !c.id) return;
        if (existing.hasOwnProperty(c.id)) {
          if (c.updatedAt >= (d.comments[existing[c.id]].updatedAt || "")) {
            d.comments[existing[c.id]] = c;
          }
        } else {
          d.comments.push(c);
          added++;
        }
      });
      I.dbWrite(d);
      return added;
    },

    renderFooter: function (el, n, canShare) {
      engine.plugins.forEach(function (p) {
        if (!p.renderStatus) return;
        try { p.renderStatus(el, n, canShare); } catch (e) {}
      });
    },
  };

  window.Annotate.sync = engine;
})();
