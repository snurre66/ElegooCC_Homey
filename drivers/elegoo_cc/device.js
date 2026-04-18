'use strict';

const http = require('http');
const { PassThrough } = require('stream');
const PrinterDevice = require('../../lib/PrinterDevice');
const { SDCP_CMD } = require('../../lib/SDCPCommands');
const CapabilityMapper = require('../../lib/CapabilityMapper');

class ElegooCCDevice extends PrinterDevice {
  async onInit() {
    await super.onInit();
    this.log(`Elegoo Centauri Carbon device initialized at ${this.host}`);

    await this.registerCamera().catch(this.error);
    this._registerListeners();
    this._registerFlowActions();
    this._registerFlowConditions();

    // Initialize flow trigger tracking state
    this._firedProgress = new Set();
    this._firedLayers = new Set();
    this._prevFilament = null;
    this._prevDoor = null;
    this._prevUsb = null;
    this._reachedNozzle = false;
    this._reachedBed = false;
    this._firedChamber = new Set();
    this._prevCamEnabled = null;
    this._prevMotors = null;
    this._prevStreamCount = null;

    // Set static info from settings if available
    const settings = this.getSettings();
    if (settings.model) this.setCapabilityValue('printer_model', settings.model).catch(this.error);
    if (settings.address) this.setCapabilityValue('ip_address', settings.address).catch(this.error);

    // Connect after all capabilities are ready
    this.client.connect();

    // Periodic attribute refresh (FDM-specific Cmd 385)
    this._attrInterval = this.homey.setInterval(() => {
      this.log('Periodic sync: Requesting attributes (FDM_GET_ATTRIBUTES)');
      this.client.sendCommand(SDCP_CMD.FDM_GET_ATTRIBUTES).catch(() => {});
    }, 60000);
  }

  async onUninit() {
    this.log('Elegoo CC Device uninitializing');
    if (this._attrInterval) this.homey.clearInterval(this._attrInterval);
    if (this._cameraInterval) this.homey.clearInterval(this._cameraInterval);
    await super.onUninit();
  }

  // ── Camera ────────────────────────────────────────────────

  async registerCamera() {
    this.log(`Registering camera feeds for ${this.host}`);
    try {
      this.snapshotImage = await this.homey.images.createImage();

      this.snapshotImage.setStream(async (stream) => {
        this.log('Camera: setStream called, fetching snapshot...');
        try {
          const buffer = await this._fetchSnapshotBuffer();
          const snapshot = new PassThrough();
          if (buffer && buffer.length > 0) {
            this.log(`Camera: pushing frame of ${buffer.length} bytes`);
            snapshot.end(buffer);
          } else {
            this.log('Camera: no frame, pushing empty stream');
            snapshot.end();
          }
          return snapshot.pipe(stream);
        } catch (error) {
          this.error('Camera mapping error:', error.message);
          const snapshot = new PassThrough();
          snapshot.end();
          return snapshot.pipe(stream);
        }
      });

      await this.setCameraImage(this.getName(), 'Snapshot', this.snapshotImage)
        .then(() => this.log('Camera: Snapshot registered OK'))
        .catch((e) => this.error('Camera: setCameraImage FAILED:', e.message));

      // Initial fetch after 3s
      this.homey.setTimeout(() => {
        this.snapshotImage
          .update()
          .then(() => this.log('Camera: initial update() OK'))
          .catch((e) => this.error('Camera: initial update() FAILED:', e.message));
      }, 3000);

      // Refresh every 10 seconds
      this._cameraInterval = this.homey.setInterval(() => {
        this.snapshotImage.update().catch(() => {});
      }, 10000);
    } catch (err) {
      this.error('Critical: Failed to register snapshot camera:', err.message);
    }
  }

  async _fetchSnapshotBuffer() {
    return new Promise((resolve) => {
      const url = `http://${this.host}:3031/video`;
      this.log(`Camera: connecting to ${url}`);

      let req;
      const timeout = this.homey.setTimeout(() => {
        this.log('Camera: timeout waiting for MJPEG frame');
        if (req) req.destroy();
        resolve(null);
      }, 8000);

      req = http.get(url, (res) => {
        this.log(`Camera: HTTP ${res.statusCode} content-type: ${res.headers['content-type']}`);
        if (res.statusCode !== 200) {
          this.homey.clearTimeout(timeout);
          res.resume();
          resolve(null);
          return;
        }

        const chunks = [];
        let frameFound = false;

        res.on('data', (chunk) => {
          if (frameFound) return;
          chunks.push(chunk);
          const buf = Buffer.concat(chunks);
          const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
          const end = buf.indexOf(Buffer.from([0xff, 0xd9]));
          if (start !== -1 && end !== -1 && end > start) {
            frameFound = true;
            this.homey.clearTimeout(timeout);
            const frame = buf.slice(start, end + 2);
            this.log(`Camera: extracted JPEG frame ${frame.length} bytes`);
            req.destroy();
            resolve(frame);
          }
        });

        res.on('end', () => {
          if (!frameFound) {
            this.homey.clearTimeout(timeout);
            this.log('Camera: stream ended without a complete frame');
            resolve(null);
          }
        });
      });

      req.on('error', (err) => {
        if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) return;
        this.homey.clearTimeout(timeout);
        this.error(`Camera: fetch error: ${err.message}`);
        resolve(null);
      });
    });
  }

  // ── Capability Listeners ──────────────────────────────────

  _registerListeners() {
    // Buttons
    this.registerCapabilityListener('button.pause', async () => {
      this.log('UI: Pause Program');
      return this.client.sendCommand(SDCP_CMD.FDM_PAUSE);
    });
    this.registerCapabilityListener('button.resume', async () => {
      this.log('UI: Resume Program');
      return this.client.sendCommand(SDCP_CMD.FDM_RESUME);
    });
    this.registerCapabilityListener('button.stop', async () => {
      this.log('UI: Stop/Cancel Program');
      return this.client.sendCommand(SDCP_CMD.FDM_STOP);
    });
    this.registerCapabilityListener('button.home', async () => {
      this.log('UI: Home All Axes');
      return this.client.sendCommand(SDCP_CMD.FDM_HOME_AXIS, { Axis: 'XYZ' });
    });

    // Read-only temperature targets
    this.registerCapabilityListener('target_temperature.nozzle', async () => true);
    this.registerCapabilityListener('target_temperature.bed', async () => true);

    // Performance factors
    this.registerCapabilityListener('speed_factor', async (value) => {
      this.log(`UI: Set Speed Factor -> ${value}%`);
      return this.client.sendCommand(SDCP_CMD.FDM_SET_SPEED, { SpeedFactor: value });
    });
    this.registerCapabilityListener('extrusion_factor', async (value) => {
      this.log(`UI: Set Extrusion Factor -> ${value}%`);
      return this.client.sendCommand(SDCP_CMD.FDM_SET_EXTRUSION, { ExtrusionFactor: value });
    });

    // Fans & Lights
    this.registerCapabilityListener('part_fan_speed', async (value) => {
      this.log(`UI: Set Part Fan Speed -> ${value}%`);
      return this.client.sendCommand(SDCP_CMD.FDM_SET_PART_FAN, { Fan: value });
    });
    this.registerCapabilityListener('onoff.chamberlight', async (value) => {
      return this.client.sendCommand(SDCP_CMD.FDM_SET_LIGHT, { SecondLight: value ? 1 : 0 });
    });
    this.registerCapabilityListener('onoff.auxfan', async (value) => {
      return this.client.sendCommand(SDCP_CMD.FDM_SET_AUX_FAN, { ExtraFan: value ? 1 : 0 });
    });
    this.registerCapabilityListener('onoff.exhaustfan', async (value) => {
      return this.client.sendCommand(SDCP_CMD.FDM_SET_EXHAUST_FAN, { ExhaustFan: value ? 1 : 0 });
    });
    this.registerCapabilityListener('onoff.boxfan', async (value) => {
      this.log(`UI: Set Box Fan -> ${value ? 'ON' : 'OFF'}`);
      return this.client.sendCommand(SDCP_CMD.FDM_SET_AUX_FAN, { BoxFan: value ? 100 : 0 });
    });
  }

  // ── Flow Actions ──────────────────────────────────────────

  _registerFlowActions() {
    const flow = this.homey.flow;
    flow.getActionCard('emergency_stop').registerRunListener(async () => {
      this.log('Action: Emergency Stop');
      return this.client.sendCommand(SDCP_CMD.FDM_STOP);
    });
    flow.getActionCard('pause_print').registerRunListener(async () => {
      this.log('Action: Pause Print');
      return this.client.sendCommand(SDCP_CMD.FDM_PAUSE);
    });
    flow.getActionCard('resume_print').registerRunListener(async () => {
      this.log('Action: Resume Print');
      return this.client.sendCommand(SDCP_CMD.FDM_RESUME);
    });
    flow.getActionCard('home_axes').registerRunListener(async (args) => {
      this.log(`Action: Home Axes (${args.axes})`);
      return this.client.sendCommand(SDCP_CMD.FDM_HOME_AXIS, { Axis: args.axes });
    });
    flow.getActionCard('set_speed_preset').registerRunListener(async (args) => {
      const pct = parseInt(args.preset);
      this.log(`Action: Set Speed Preset (${pct}%)`);
      return this.client.sendCommand(SDCP_CMD.FDM_SET_SPEED, { SpeedFactor: pct });
    });
    flow.getActionCard('set_fan_speed_pct').registerRunListener(async (args) => {
      this.log(`Action: Set Fan Speed (${args.fan} -> ${args.percentage}%)`);
      const cmdMap = {
        model: SDCP_CMD.FDM_SET_MODEL_FAN,
        aux: SDCP_CMD.FDM_SET_AUX_FAN,
        exhaust: SDCP_CMD.FDM_SET_EXHAUST_FAN,
      };
      const keyMap = { model: 'Fan', aux: 'ExtraFan', exhaust: 'ExhaustFan' };
      const cmd = cmdMap[args.fan];
      if (!cmd) throw new Error('Invalid fan selected');
      return this.client.sendCommand(cmd, { [keyMap[args.fan]]: args.percentage });
    });
    flow.getActionCard('set_chamber_light').registerRunListener(async (args) => {
      this.log(`Action: Set Light (${args.state})`);
      return this.client.sendCommand(SDCP_CMD.FDM_SET_LIGHT, { SecondLight: args.state ? 1 : 0 });
    });
  }

  // ── Flow Conditions ───────────────────────────────────────

  _registerFlowConditions() {
    const flow = this.homey.flow;
    flow
      .getConditionCard('is_printing')
      .registerRunListener(async () => this.getCapabilityValue('printer_status') === 'Printing');
    flow
      .getConditionCard('is_paused')
      .registerRunListener(async () => this.getCapabilityValue('printer_status') === 'Paused');
    flow.getConditionCard('is_offline').registerRunListener(async () => !this.getAvailable());
    flow
      .getConditionCard('is_light_on')
      .registerRunListener(async () => this.getCapabilityValue('onoff.chamberlight') === true);
  }

  // ── Capability Updates (delegated to CapabilityMapper) ────

  updateCapabilities(attributes) {
    if (!attributes) return;

    const temps = CapabilityMapper.updateTemperatures(this, attributes);
    CapabilityMapper.updateFactors(this, attributes);
    CapabilityMapper.updateFansAndLights(this, attributes);
    CapabilityMapper.updateSafetySensors(this, attributes);
    CapabilityMapper.updateHardwareInfo(this, attributes);
    CapabilityMapper.updateIdleTelemetry(this, attributes);

    const oldStatus = this.getCapabilityValue('printer_status');
    const newStatus = CapabilityMapper.updateStatus(this, attributes);
    const { progress, layer } = CapabilityMapper.updatePrintInfo(this, attributes);
    CapabilityMapper.updateAdvancedInfo(this, attributes);

    // Thumbnail
    if (attributes.Thumbnail && attributes.Thumbnail.length > 50) {
      this._handleThumbnail(attributes.Thumbnail);
    }

    // Sensor transition triggers
    CapabilityMapper.processSensorTransitions(this, attributes);

    // Threshold triggers
    CapabilityMapper.processThresholdTriggers(this, {
      progress,
      layer,
      nozzleTemp: temps.nozzleTemp,
      bedTemp: temps.bedTemp,
      chamberTemp: temps.chamberTemp,
      nozzleTarget: temps.nozzleTarget,
      bedTarget: temps.bedTarget,
    });

    // Status change triggers (fire last, after all capabilities are set)
    if (newStatus) {
      CapabilityMapper.handleStatusTriggers(this, newStatus, oldStatus || '');
    }

    // Migration: capture MainboardID
    const mid = attributes.MainboardID || attributes.MainboardId || attributes.Id;
    if (mid && !this.getSetting('mainboard_id')) {
      this.log(`Migrating/Capturing MainboardID: ${mid}`);
      this.setSettings({ mainboard_id: mid }).catch(this.error);
    }
  }

  _handleThumbnail(base64Data) {
    if (!this.thumbnailImage) return;
    try {
      this.thumbnailBuffer = Buffer.from(base64Data, 'base64');
      this.thumbnailImage.update().catch(this.error);
    } catch (err) {
      this.error('Error updating thumbnail:', err.message);
    }
  }
}

module.exports = ElegooCCDevice;
