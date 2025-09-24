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
    updateInterval: 60000,        // Update-Intervall (ms)
    showDelay: false,
    showPlattform: [],
    timetostop: 5,                // Gehzeit zur Haltestelle (Minuten)
  },

  // Define start sequence.
  start: function () {
    Log.info("Starting module: " + this.name);
    this.departureData = [];      // leeres Array initialisieren
    this.getDepartureData();      // initial laden
    this.scheduleUpdate();        // regelmäßige Updates
  },

  // Override dom generator.
  getDom: function () {

    // Main wrapper
    var wrapper = document.createElement("div");
    wrapper.className = "swu-departure-wrapper";

    // Falls keine Daten da sind
    if (!this.departureData || this.departureData.length === 0) {
      wrapper.innerHTML = "Dieser Service steht aktuell nicht zur Verfügung.";
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

        var rawSeconds = Number(departure.DepartureCountdown) || 0;
        var countdownMinutes = Math.floor(rawSeconds / 60);

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
          var devSec = Number(departure.DepartureDeviation) || 0;
          var delayMinutes = Math.floor(devSec / 60);
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
    wrapper.appendChild(tableWrapper);

    return wrapper;
  },

  // Update-Intervall
  scheduleUpdate: function () {
    var self = this;
    setInterval(function () {
      self.getDepartureData();
    }, this.config.updateInterval);
  },

  // API aufrufen und Daten speichern
  getDepartureData: function () {
    var url = "https://api.swu.de/mobility/v1/stop/passage/Departures?StopNumber=" +
      encodeURIComponent(this.config.stopNumber) +
      "&Limit=" + encodeURIComponent(this.config.limit * 5);

    var self = this;
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function () {
      if (this.readyState === 4) {
        if (this.status === 200) {
          try {
            var json = JSON.parse(this.responseText);
            self.departureData =
              (json && json.StopPassage && json.StopPassage.DepartureData) || [];
          } catch (e) {
            Log.error(self.name + " - JSON parse error:", e);
            self.departureData = [];
          }
        } else {
          Log.error(self.name + " - HTTP error: " + this.status);
        }
        self.updateDom();
      }
    };
    xhttp.open("GET", url, true);
    xhttp.send();
  },

});
