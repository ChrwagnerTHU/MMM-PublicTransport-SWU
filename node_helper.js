/* Magic Mirror
 * Node Helper: MMM-PublicTransport-SWU
 *
 * Holt die Abfahrten serverseitig, damit der Browser nicht an CORS scheitert,
 * und kann zwischen zwei Datenquellen wechseln:
 *   - "swu":  die offizielle SWU-Schnittstelle (api.swu.de)
 *   - "ding": der Verbund-Auskunftsserver des DING (EFA), liefert ebenfalls
 *             die Echtzeitdaten der SWU
 * Mit provider "auto" wird zuerst die SWU-API versucht und bei Ausfall auf
 * DING umgeschaltet.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");

const REQUEST_TIMEOUT = 10000;

module.exports = NodeHelper.create({
  start: function () {
    Log.log("Starting node helper for: " + this.name);
    // Zuletzt gemeldeter Zustand je Modulinstanz, damit eine dauerhaft nicht
    // erreichbare Quelle das Log nicht bei jedem Abruf erneut vollschreibt
    this.lastState = {};
  },

  // Nur melden, wenn sich etwas geändert hat
  logOnce: function (identifier, key, message, level) {
    if (this.lastState[identifier] === key) {
      return;
    }
    this.lastState[identifier] = key;
    Log[level](`${this.name} - ${message}`);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SWU_GET_DEPARTURES") {
      this.handleRequest(payload);
    }
  },

  handleRequest: async function (payload) {
    const config = payload.config;
    const providers =
      (config.provider || "auto") === "auto" ? ["swu", "ding"] : [config.provider];

    const errors = [];
    for (const provider of providers) {
      try {
        const departures =
          provider === "swu"
            ? await this.fetchSwu(config)
            : await this.fetchDing(config);

        this.logOnce(
          payload.identifier,
          `ok:${provider}`,
          errors.length
            ? `Datenquelle ${provider} (${errors.join(" | ")})`
            : `Datenquelle ${provider}`,
          "log"
        );

        this.sendSocketNotification("SWU_DEPARTURES", {
          identifier: payload.identifier,
          departures: departures,
          source: provider,
        });
        return;
      } catch (error) {
        errors.push(`${provider}: ${error.message}`);
      }
    }

    const summary = errors.join(" | ");
    this.logOnce(payload.identifier, `fail:${summary}`, `keine Datenquelle erreichbar: ${summary}`, "error");

    this.sendSocketNotification("SWU_ERROR", {
      identifier: payload.identifier,
      error: summary,
    });
  },

  getJson: async function (url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  },

  // Offizielle SWU-Schnittstelle
  fetchSwu: async function (config) {
    const url =
      "https://api.swu.de/mobility/v1/stop/passage/Departures?StopNumber=" +
      encodeURIComponent(config.stopNumber) +
      "&Limit=" +
      encodeURIComponent(config.limit * 5);

    const json = await this.getJson(url);
    const data = (json && json.StopPassage && json.StopPassage.DepartureData) || [];
    const now = Date.now();

    return this.sortDepartures(
      data.map((departure) => {
        const deviation = Number(departure.DepartureDeviation) || 0;
        return {
          RouteNumber: departure.RouteNumber,
          PlatformName: departure.PlatformName || "",
          DepartureDirectionText: departure.DepartureDirectionText || "",
          // Die SWU-API liefert einen Countdown in Sekunden, daraus wird ein
          // absoluter Zeitpunkt, damit das Frontend jederzeit neu rechnen kann
          DepartureTime: now + (Number(departure.DepartureCountdown) || 0) * 1000,
          DelayMinutes: Math.floor(deviation / 60),
          Realtime: true,
        };
      })
    );
  },

  /*
   * DING-Auskunft (EFA). Die Haltestellennummern der SWU entsprechen den
   * Verbund-IDs, z.B. 1261 -> de:08421:1261.
   */
  fetchDing: async function (config) {
    const params = new URLSearchParams({
      language: "de",
      outputFormat: "rapidJSON",
      name_dm: `${config.dingStopPrefix}:${config.stopNumber}`,
      type_dm: "stop",
      mode: "direct",
      useRealtime: "1",
      limit: String(config.limit * 5),
    });

    const json = await this.getJson(`${config.dingBaseUrl}?${params.toString()}`);
    const stopEvents = (json && json.stopEvents) || [];
    if (stopEvents.length === 0 && !(json && json.locations && json.locations.length)) {
      throw new Error(`Haltestelle ${config.stopNumber} nicht gefunden`);
    }

    const now = Date.now();

    return this.sortDepartures(
      stopEvents
        .map((event) => {
          const transportation = event.transportation || {};
          const properties = (event.location && event.location.properties) || {};

          const planned = Date.parse(event.departureTimePlanned);
          const estimated = Date.parse(
            event.departureTimeEstimated || event.departureTimePlanned
          );
          if (Number.isNaN(estimated)) {
            return null;
          }

          return {
            RouteNumber: transportation.number || transportation.disassembledName || "",
            PlatformName: properties.platform || "",
            DepartureDirectionText:
              (transportation.destination && transportation.destination.name) || "",
            DepartureTime: estimated,
            DelayMinutes: Number.isNaN(planned)
              ? 0
              : Math.round((estimated - planned) / 60000),
            Realtime: Boolean(event.isRealtimeControlled),
          };
        })
        // Abgefahrene Fahrten verwirft der EFA nicht immer selbst
        .filter((departure) => departure && departure.DepartureTime > now - 60000)
    );
  },

  sortDepartures: function (departures) {
    return departures.sort((a, b) => a.DepartureTime - b.DepartureTime);
  },
});
