/* Magic Mirror
 * Module: SWU Departures
 *
 * By Christopher Wagner
 * MIT Licensed.
 */

Module.register("MM2_PublicTransport-SWU", {

    // Default module config.
    defaults: {
      stopNumber: 1352, // Change this to the stop number you want to display
      limit: 5, // Change this to the number of departures you want to display
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
      var wrapper = document.createElement("div");
      wrapper.className = "small";
  
      // Loop through departure data and create elements for each departure
      for (var i = 0; i < this.departureData.length; i++) {
        var departure = this.departureData[i];
        var platformName = document.createElement("div");
        platformName.className = "swu-departure-platformName";
        platformName.innerHTML = departure.PlatformName;
  
        var routeNumber = document.createElement("div");
        routeNumber.className = "swu-departure-routeNumber";
        routeNumber.innerHTML = departure.RouteNumber;
  
        var directionText = document.createElement("div");
        directionText.className = "swu-departure-directionText";
        directionText.innerHTML = departure.DepartureDirectionText;
  
        var countdown = document.createElement("div");
        countdown.className = "swu-departure-countdown";
        countdown.innerHTML = departure.DepartureCountdown;
  
        // Add departure elements to wrapper
        wrapper.appendChild(platformName);
        wrapper.appendChild(routeNumber);
        wrapper.appendChild(directionText);
        wrapper.appendChild(countdown);
      }
  
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