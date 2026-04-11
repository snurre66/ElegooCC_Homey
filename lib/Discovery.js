const dgram = require('dgram');

/**
 * SDCP Discovery handles UDP discovery for Elegoo printers.
 * Sends 'M99999' to port 3000 and waits for responses.
 */
class Discovery {
  /**
   * SDCP Discovery handles UDP discovery for Elegoo printers.
   * Sends 'M99999' to port 3000 and waits for responses.
   */
  static async discover(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const printers = [];

      socket.on('error', (err) => {
        socket.close();
        reject(err);
      });

      socket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          // Standard SDCP response format
          printers.push({
            name: data.MachineName || data.MainboardModel,
            model: data.MainboardModel,
            address: rinfo.address,
            data: data
          });
        } catch (err) {
          // Non-JSON response, might be old protocol or garbage
        }
      });

      socket.on('listening', () => {
        socket.setBroadcast(true);
        const message = Buffer.from('M99999');
        socket.send(message, 3000, '255.255.255.255');
      });

      socket.bind();

      setTimeout(() => {
        socket.close();
        resolve(printers);
      }, timeout);
    });
  }

  /**
   * Probe a specific address and port to see if it's an SDCP printer.
   */
  static async probe(address, port = 3000, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let found = null;

      socket.on('error', (err) => {
        socket.close();
        reject(err);
      });

      socket.on('message', (msg, rinfo) => {
        if (rinfo.address === address) {
          try {
            const data = JSON.parse(msg.toString());
            found = {
              name: data.MachineName || data.MainboardModel,
              model: data.MainboardModel,
              address: rinfo.address,
              data: data
            };
            socket.close();
            resolve(found);
          } catch (err) {
            // Invalid response
          }
        }
      });

      socket.bind();

      const message = Buffer.from('M99999');
      socket.send(message, port, address, (err) => {
        if (err) {
          socket.close();
          reject(err);
        }
      });

      setTimeout(() => {
        if (!found) {
          socket.close();
          resolve(null);
        }
      }, timeout);
    });
  }
}

module.exports = Discovery;
