/* =============================================================================
 * sync-hono.js — Hono sync plugin for annotate.js.
 * Load AFTER sync-engine.js. Registers via Annotate.sync.register({…}).
 *
 * Configure with data-hono-url="http://localhost:3099/api/sync" on the
 * annotate.js script tag, or paste the URL when prompted.
 * ========================================================================== */
(function () {
  if (!window.Annotate || !window.Annotate.sync || !window.Annotate._internals) return;
  var I = window.Annotate._internals;

  var HONO_SYNCING = false;

  function honoUrl(){ return I.state.honoUrl; }
  function honoDomain() {
    try { return location.hostname; } catch (e) { return "unknown"; }
  }

  window.Annotate.sync.register({
    id: "hono",
    name: "Hono Sync",
    icon: function () { return I.ICONS.download; },
    enabled: function () { return !!I.state.honoUrl; },

    push: function (c) {
      fetch(honoUrl(), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", comment: c }) })
        .catch(function () {});
    },

    delete: function (ids) {
      if (!Array.isArray(ids)) ids = [ids];
      ids.forEach(function (id) {
        fetch(honoUrl(), { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", annotateId: id }) })
          .catch(function () {});
      });
    },

    pull: function (cb) {
      HONO_SYNCING = true;
      var url = honoUrl() + "?domain=" + encodeURIComponent(honoDomain()) + "&page=" + encodeURIComponent(I.PAGE);
      fetch(url)
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res); })
        .then(function (data) {
          HONO_SYNCING = false;
          cb((data && data.comments) || [], null);
        })
        .catch(function () {
          HONO_SYNCING = false;
          cb(null, "Hono pull failed");
        });
    },

    renderStatus: function (el, n, canShare) {
      if (!this.enabled()) return;
      var row = I.el("div", { class: "an-localnote" }, [
        I.el("span", { html: I.ICONS.download }),
        I.el("span", { text: HONO_SYNCING ? "Syncing\u2026" : "Synced to Hono \u00B7 " }),
      ]);
      if (!HONO_SYNCING) {
        var changeBtn = I.el("button", { class: "an-mini an-ghost2", text: "Change", title: "Change Hono URL", onclick: function () {
          I.askHono(function () { I.renderFooter(); });
        } });
        row.appendChild(changeBtn);
      }
      el.appendChild(row);
    },
  });
})();
