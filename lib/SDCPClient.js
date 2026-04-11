const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * SDCPClient handles the WebSocket connection to Elegoo SDCP printers.
 * Features:
 * - Exponential backoff reconnection logic.
 * - Pulse/Heartbeat monitoring.
 * - JSON command abstraction.
 */
class SDCPClient extends EventEmitter {
  constructor({ host, port = 3030, logger }) {
    super();
    this.url = `ws://${host}:${port}/websocket`;
    this.log = logger || console.log;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000; // 30 seconds
    this.baseReconnectDelay = 1000; // 1 second
    this.isConnected = false;
    this.isIntentionallyClosed = false;
    this.heartbeatInterval = null;
    this.pingTimeout = null;
  }

  connect() {
    this.log(` Connecting to SDCP printer at ${this.url}`);
    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.log(` WebSocket connection established to ${this.url}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        this.startHeartbeat();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.log(' Received message:', data.toString().substring(0, 150));
          this.emit('message', message);

          // SDCP v3 format: top-level "Status" key contains printer state
          if (message.Status) {
            this.emit('status', message.Status);
          }
          // SDCP v3 format: top-level "Attributes" key contains static info (MAC, Firmware, etc)
          if (message.Attributes) {
            this.emit('status', message.Attributes);
          }
          // Also handle alternate format with Data.Attributes
          if (message.Data && message.Data.Attributes) {
            this.emit('status', message.Data.Attributes);
          }
        } catch (err) {
          this.log(' Error parsing WebSocket message:', err.message);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.log(` WebSocket connection closed: code=${code}, reason=${reason || 'none'}`);
        this.handleDisconnect();
      });

      this.ws.on('error', (err) => {
        this.log(` WebSocket error for ${this.url}:`, err.message);
        // Error triggers 'close', so we handle it there
      });

      this.ws.on('pong', () => {
        this.log(' Received pong');
        this.resetPingTimeout();
      });
    } catch (err) {
      this.log(' Error creating WebSocket:', err.message);
      this.handleDisconnect();
    }
  }

  handleDisconnect() {
    this.isConnected = false;
    this.stopHeartbeat();
    this.emit('disconnected');

    if (!this.isIntentionallyClosed) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    const delay = Math.min(this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);

    // Add 20% jitter
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const finalDelay = delay + jitter;

    this.log(` Scheduling reconnection in ${Math.round(finalDelay / 1000)}s (Attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, finalDelay);
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    if (this.ws) {
      this.ws.close();
    }
    this.stopHeartbeat();
  }

  startHeartbeat() {
    this.stopHeartbeat();
    // SDCP V3 often expects a heartbeat or periodic status request
    this.heartbeatInterval = setInterval(() => {
      this.getStatus();
      this.ping();
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
  }

  ping() {
    if (this.ws && this.isConnected) {
      this.ws.ping();
      this.resetPingTimeout();
    }
  }

  resetPingTimeout() {
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {
      this.log(' WebSocket ping timeout - heartbeat lost');
      if (this.ws) this.ws.terminate();
    }, 15000); // 15s wait for pong
  }

  /**
   * Send a JSON command to the printer.
   * @param {number} commandId
   * @param {object} payload
   */
  sendCommand(commandId, payload = {}) {
    if (!this.isConnected) {
      this.log(' Cannot send command: Not connected');
      return false;
    }

    const message = {
      Id: this.generateTransactionId(),
      Data: {
        Command: commandId,
        ...payload,
      },
    };

    this.log(` Sending Command [${commandId}]:`, JSON.stringify(message));
    this.ws.send(JSON.stringify(message));
    return true;
  }

  getStatus() {
    // CMD_GET_STATUS is typically 0 for SDCP V3
    return this.sendCommand(0);
  }

  generateTransactionId() {
    return Math.floor(Math.random() * 1000000).toString();
  }
}

module.exports = SDCPClient;
