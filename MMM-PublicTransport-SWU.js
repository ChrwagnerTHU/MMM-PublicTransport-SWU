/* Magic Mirror
 * Module: SWU Departures
 *
 * By Christopher Wagner
 */

Module.register("MMM-PublicTransport-SWU", {

  // Default module config.
  defaults: {
    stopNumber: 1008,             // Haltestellen-Nummer
    stopString: "Hauptbahnhof",   // Haltestellen-Name
    limit: 10,                    // Anzahl Abfahrten
    maxMinutes: 0,                // Nur Abfahrten innerhalb dieser Minuten (0 = unbegrenzt)
    updateInterval: 60000,        // Update-Intervall (ms)
    showDelay: false,
    showPlattform: [],
    timetostop: 5,                // Gehzeit zur Haltestelle (Minuten)

    // Datenquelle: "auto" (SWU, bei Ausfall DING), "swu" oder "ding"
    provider: "auto",
    dingBaseUrl: "https://www.ding.eu/ding3/XSLT_DM_REQUEST",
    dingStopPrefix: "de:08421",   // Stadtkreis Ulm (Neu-Ulm: de:09775)
  },

  // Define start sequence.
  start: function () {
    Log.info("Starting module: " + this.name);
    this.departureData = [];      // leeres Array initialisieren
    this.loaded = false;
    this.errorMessage = null;
    this.source = null;
    this.getDepartureData();      // initial laden
    this.scheduleUpdate();        // regelmäßige Updates
  },

  // Override dom generator.
  getDom: function () {

    // Main wrapper
    var wrapper = document.createElement("div");
    wrapper.className = "swu-departure-wrapper";

    // Falls keine Daten da sind
    if (!this.loaded) {
      wrapper.innerHTML = "Lädt...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (this.errorMessage) {
      wrapper.innerHTML = "Dieser Service steht aktuell nicht zur Verfügung.";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (!this.departureData || this.departureData.length === 0) {
      wrapper.innerHTML = "Keine Abfahrten";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    // Header
    var headerWrapper = document.createElement("div");
    headerWrapper.className = "swu-departure-header";
    headerWrapper.innerHTML = this.config.stopString;

    // Tabelle
    var tableWrapper = document.createElement("table");
    tableWrapper.className = "swu-departure-table";
    tableWrapper.style.padding = "10px";
    tableWrapper.style.textAlign = "left";

    // Tabellenkopf (fehlendes '>' war ein Bug)
    var tableHeader = document.createElement("tr");
    tableHeader.className = "swu-departure-table-header";
    tableHeader.innerHTML =
      "<th style='padding:5px;'>Linie</th>" +
      "<th style='padding:5px;'>Plattform</th>" +
      "<th style='padding:5px;'>Richtung</th>" +
      "<th style='padding:5px;'>Abfahrt</th>" +
      "<th style='padding:5px;'></th>";
    tableWrapper.appendChild(tableHeader);

    var countLines = 0;
    var tts = Number(this.config.timetostop) || 0; // Gehzeit (Min)

    // Zeilen rendern
    for (var i = 0; i < this.departureData.length; i++) {
      if (countLines >= this.config.limit) break;

      var departure = this.departureData[i];

      var remainingMs = Number(departure.DepartureTime) - Date.now();
      var countdownMinutes = Math.floor(remainingMs / 60000);
      if (countdownMinutes < 0) {
        countdownMinutes = 0;
      }

      // Zeitfenster: die Liste ist aufsteigend sortiert, danach liegt alles weiter weg
      if (this.config.maxMinutes > 0 && countdownMinutes > this.config.maxMinutes) break;

      // Plattform-Filter
      if (
        this.config.showPlattform.length === 0 ||
        this.config.showPlattform.indexOf(departure.PlatformName) !== -1
      ) {
        var tableRow = document.createElement("tr");
        tableRow.className = "swu-departure-table-row";

        // Linie (Piktogramm)
        var routeNumber = document.createElement("td");
        routeNumber.className = "swu-departure-routeNumber";
        var img = document.createElement("img");
        img.src = "modules/MMM-PublicTransport-SWU/lines/Linie_" + departure.RouteNumber + "_Pikto.gif";
        img.setAttribute("width", "20");
        // Für Linien ohne Piktogramm die Liniennummer als Text zeigen
        img.onerror = function () {
          routeNumber.innerHTML = departure.RouteNumber;
        };
        routeNumber.appendChild(img);
        tableRow.appendChild(routeNumber);

        // Plattform
        var platformName = document.createElement("td");
        platformName.className = "swu-departure-platformName";
        platformName.style.padding = "5px";
        platformName.innerHTML = departure.PlatformName || "";
        tableRow.appendChild(platformName);

        // Richtung
        var directionText = document.createElement("td");
        directionText.className = "swu-departure-directionText";
        directionText.style.padding = "5px";
        directionText.innerHTML = departure.DepartureDirectionText || "";
        tableRow.appendChild(directionText);

        // Countdown
        var countdown = document.createElement("td");
        countdown.className = "swu-departure-countdown";
        countdown.style.padding = "5px";

        // Text
        countdown.innerHTML = countdownMinutes < 1 ? "Jetzt" : (countdownMinutes + " min");

        // >>> Einfärbung hier beim Rendern <<<
        if (tts > 0) {
          if (countdownMinutes < tts - 1) {
            // zu knapp
            countdown.style.color = "red";
          } else if (Math.abs(countdownMinutes - tts) <= 1) {
            // genau im Fenster
            countdown.style.color = "gold";
          } else {
            // entspannt
            countdown.style.color = "";
          }
        }
        tableRow.appendChild(countdown);

        // Verspätung (optional)
        var delayCell = document.createElement("td");
        delayCell.style.padding = "5px";
        if (this.config.showDelay) {
          var delayMinutes = Number(departure.DelayMinutes) || 0;
          if (delayMinutes > 0) {
            delayCell.style.color = "red";
            delayCell.innerHTML = "+ " + delayMinutes;
          } else {
            delayCell.innerHTML = "";
          }
        }
        tableRow.appendChild(delayCell);

        countLines++;
        tableWrapper.appendChild(tableRow);
      }
    }

    // Zusammenbauen
    wrapper.appendChild(headerWrapper);

    // Außerhalb der Betriebszeiten liegt nichts im Zeitfenster – dann statt
    // einer leeren Tabelle einen Hinweis zeigen
    if (countLines === 0) {
      var emptyNote = document.createElement("div");
      emptyNote.className = "dimmed light small";
      emptyNote.innerHTML = this.config.maxMinutes > 0
        ? "Keine Abfahrten in den nächsten " + this.config.maxMinutes + " Minuten"
        : "Keine Abfahrten";
      wrapper.appendChild(emptyNote);
    } else {
      wrapper.appendChild(tableWrapper);
    }

    return wrapper;
  },

  // Update-Intervall
  scheduleUpdate: function () {
    var self = this;
    setInterval(function () {
      self.getDepartureData();
    }, this.config.updateInterval);
  },

  // Abruf an den node_helper delegieren (umgeht CORS im Browser)
  getDepartureData: function () {
    this.sendSocketNotification("SWU_GET_DEPARTURES", {
      identifier: this.identifier,
      config: this.config,
    });
  },

  socketNotificationReceived: function (notification, payload) {
    if (!payload || payload.identifier !== this.identifier) {
      return;
    }

    if (notification === "SWU_DEPARTURES") {
      this.departureData = payload.departures || [];
      this.errorMessage = null;
      this.source = payload.source;
      this.loaded = true;
      this.updateDom();
    } else if (notification === "SWU_ERROR") {
      Log.error(this.name + " - " + payload.error);
      this.departureData = [];
      this.errorMessage = payload.error;
      this.loaded = true;
      this.updateDom();
    }
  },

});
