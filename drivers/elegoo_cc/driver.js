const Homey = require('homey');
const Discovery = require('../../lib/Discovery');

class ElegooCCDriver extends Homey.Driver {
  async onInit() {
    this.log('Elegoo CC Driver initialized');
  }

  /**
   * Homey Pairing Flow
   */
  onPair(session) {
    session.setHandler('discover', async () => {
      this.log('Searching for Elegoo printers...');
      try {
        const discoveredPrinters = await Discovery.discover();
        this.log(`Found ${discoveredPrinters.length} printers`);

        return discoveredPrinters.map(printer => {
          const device = {
            name: printer.name || 'Elegoo Printer',
            data: { id: printer.address },
            settings: {
              address: printer.address,
              model: printer.model
            }
          };
          this.log('Discovered printer:', device.name, '@', device.data.id);
          return device;
        });
      } catch (err) {
        this.error('Discovery failed:', err.message);
        throw err;
      }
    });

    session.setHandler('validate_manual', async (data) => {
      this.log('Probing printer at', data.ip, 'port', data.port);
      try {
        const printer = await Discovery.probe(data.ip, data.port);
        if (printer) {
          const device = {
            name: printer.name || 'Elegoo Printer',
            data: { id: printer.address },
            settings: {
              address: printer.address,
              model: printer.model
            }
          };
          this.log('Found printer through manual probe:', device.name, '@', device.data.id);
          return device;
        }
        this.log('No printer found at', data.ip);
        return null;
      } catch (err) {
        this.error('Probe failed:', err.message);
        throw err;
      }
    });

    // Custom add_device handler if needed, but SDK v3 often handles this 
    // automatically if the returned device from a handler is passed to Homey.addDevice()
    session.setHandler('add_device', async (device) => {
      this.log('Adding device:', device.name);
      return true;
    });
  }
}

module.exports = ElegooCCDriver;
