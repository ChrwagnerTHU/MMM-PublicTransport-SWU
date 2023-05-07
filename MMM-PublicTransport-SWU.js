/* Magic Mirror
 * Module: SWU Departures
 *
 * By Christopher Wagner
 */

Module.register("MMM-PublicTransport-SWU", {

    // Default module config.
    defaults: {
      stopNumber: 1008, // Change this to the stop number you want to display
      stopString: "Hauptbahnhof", // Change this to the stop name you want to display
      limit: 10, // Change this to the number of departures you want to display
      updateInterval: 60000, // Update the display every minute (in ms)
    },
    
    // Define start sequence.
    start: async function() {
      Log.info("Starting module: " + this.name);
      this.departureData = []; // Initialize departure data as empty array
      this.getDepartureData(); // Call API immediately to get initial data
      this.scheduleUpdate(); // Schedule update interval
    },
  
    // Override dom generator.
    getDom: function() {

      // Create main wrapper
      var wrapper = document.createElement("div");
      wrapper.className = "swu-departure-wrapper";

      // If there is no departure data, display error message
      if (this.departureData.length <= 0){
        wrapper.innerHTML = "Dieser Service steht aktuell nicht zur Verfügung.";
        wrapper.className = "dimmed light small";
        return wrapper;
      }

      // Create header wrapper and add text
      var headerWrapper = document.createElement("div");
      headerWrapper.className = "swu-departure-header";
      headerWrapper.innerHTML = this.config.stopString;

      // Create table wrapper
      var tableWrapper = document.createElement("table");
      tableWrapper.className = "swu-departure-table";
      tableWrapper.style.padding = "10px";
      tableWrapper.style.textAlign = "left";

      // Create table header row
      var tableHeader = document.createElement("tr");
      tableHeader.className = "swu-departure-table-header";
      tableHeader.innerHTML = "<th style='padding: 5px;'>Plattform</th><th style='padding: 5px;'>Linie</th><th style='padding: 5px;'>Richtung</th><th style='padding: 5px;'>Abfahrt</th>";
      tableWrapper.appendChild(tableHeader);

      // Loop through departure data and create table rows for each departure
      for (var i = 0; i < this.departureData.length; i++) {
        var departure = this.departureData[i];

        var tableRow = document.createElement("tr");
        tableRow.className = "swu-departure-table-row";

        var platformName = document.createElement("td");
        platformName.className = "swu-departure-platformName";
        platformName.style.padding = "5px";
        platformName.innerHTML = departure.PlatformName;
        tableRow.appendChild(platformName);

        var routeNumber = document.createElement("td");
        routeNumber.className = "swu-departure-routeNumber";
        routeNumber.style.padding = "5px";
        routeNumber.innerHTML = departure.RouteNumber;
        tableRow.appendChild(routeNumber);

        var directionText = document.createElement("td");
        directionText.className = "swu-departure-directionText";
        directionText.style.padding = "5px";
        directionText.innerHTML = departure.DepartureDirectionText;
        tableRow.appendChild(directionText);

        var countdown = document.createElement("td");
        countdown.className = "swu-departure-countdown";
        countdown.style.padding = "5px";
        var countdownMinutes = Math.floor(departure.DepartureCountdown / 60);
        if (countdownMinutes < 1){
          countdown.innerHTML = "Jetzt"
        } else {
          countdown.innerHTML = countdownMinutes + " min";
        }
        tableRow.appendChild(countdown);

        // Add table row to table wrapper
        tableWrapper.appendChild(tableRow);
      }
      
      // Append header and table to main wrapper
      wrapper.appendChild(headerWrapper);
      wrapper.appendChild(tableWrapper);

      return wrapper;
    },
  
    // Schedule update interval
    scheduleUpdate: function(delay) {
      var nextLoad = this.config.updateInterval;
      if (typeof delay !== "undefined" && delay >= 0) {
        nextLoad = delay;
      }
      var self = this;
      setInterval(function() {
        self.getDepartureData();
      }, nextLoad);
    },
  
    // Call API to get departure data
    getDepartureData: function() {
      var url = "https://api.swu.de/mobility/v1/stop/passage/Departures?StopNumber=" + this.config.stopNumber + "&Limit=" + this.config.limit;
      var self = this;
      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
          self.departureData = JSON.parse(this.responseText).StopPassage.DepartureData;
          self.updateDom();
        }
      };
      xhttp.open("GET", url, true);
      xhttp.send();
    },
  
  });