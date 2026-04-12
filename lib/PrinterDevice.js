const Homey = require('homey');
const SDCPClient = require('./SDCPClient');

class PrinterDevice extends Homey.Device {
  async onInit() {
    this.log('Initializing Printer Device:', this.getName());

    // Initialize state
    this.host = this.getSetting('address');

    // Initialize SDCP Client
    this.client = new SDCPClient({
      host: this.host,
      logger: (...args) => this.log(...args),
    });

    // Initialize Flow triggers
    this.triggerPrinterOnline = this.homey.flow.getDeviceTriggerCard('printer_online');
    this.triggerPrinterOffline = this.homey.flow.getDeviceTriggerCard('printer_offline');

    this.client.on('connected', () => {
      this.log('Printer connected');
      this.setAvailable().catch(this.error);
      // Alarm defaults: false = no alarm (normal), true = alarm triggered
      this.safeSetCapabilityValue('alarm_filament', false); // Filament Detection Alarm
      this.safeSetCapabilityValue('alarm_contact', false); // Door Close Alarm

      if (this.triggerPrinterOnline) {
        this.triggerPrinterOnline.trigger(this).catch(this.error);
      }
    });

    this.client.on('disconnected', () => {
      this.log('Printer disconnected');
      this.setUnavailable(this.homey.__('printer_offline') || 'Printer Offline').catch(this.error);

      if (this.triggerPrinterOffline) {
        this.triggerPrinterOffline.trigger(this).catch(this.error);
      }
    });

    this.client.on('status', (attributes) => {
      this.updateCapabilities(attributes);
    });

    // Initial connection removed from base class to allow drivers to handle migration first
  }

  async onUninit() {
    this.log('Uninitializing Printer Device');
    if (this.client) {
      this.client.disconnect();
    }
  }

  /**
   * Override this in child classes to map SDCP attributes to Homey capabilities.
   * @param {object} attributes
   */
  updateCapabilities(_attributes) {
    // Base implementation for common attributes
    // To be expanded in drivers
  }

  /**
   * Helper to set capability value safely.
   */
  safeSetCapabilityValue(capability, value) {
    if (this.hasCapability(capability)) {
      this.setCapabilityValue(capability, value).catch(this.error);
    }
  }
}

module.exports = PrinterDevice;
