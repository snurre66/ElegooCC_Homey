const Homey = require('homey');

class ElegooSDCPApp extends Homey.App {
  async onInit() {
    this.log('Elegoo SDCP App has been initialized');
  }
}

module.exports = ElegooSDCPApp;
