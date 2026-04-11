const http = require('http');

const { Duplex } = require('stream');
const PrinterDevice = require('../../lib/PrinterDevice');

class ElegooCCDevice extends PrinterDevice {
  async onInit() {
    await super.onInit();
    this.log(`Elegoo Centauri Carbon device initialized at ${this.host}`);

    await this.registerCamera().catch(this.error);
    this.registerListeners();
    this.registerFlowCards();

    // Initialize flow trigger tracking
    this._firedProgress = new Set();
    this._firedLayers = new Set();
    this._prevFilament = null;
    this._prevDoor = null;
    this._prevUsb = null;
    this._reachedNozzle = false;
    this._reachedBed = false;
    this._firedChamber = new Set();

    // Set static info from settings if available
    const settings = this.getSettings();
    if (settings.model) this.setCapabilityValue('printer_model', settings.model).catch(this.error);
    if (settings.address) this.setCapabilityValue('ip_address', settings.address).catch(this.error);

    // FINALLY: Connect to the printer after all capabilities are ready
    this.client.connect();

    // Periodic attribute refresh (Memory/USB/MAC info) - Required for original CC
    // Note: sendCommand returns boolean, not a Promise
    this._attrInterval = this.homey.setInterval(() => {
      this.log('Periodic sync: Requesting attributes (Cmd 385)');
      this.client.sendCommand(385);
    }, 60000); // Once per minute
  }

  async onUninit() {
    this.log('Elegoo CC Device uninitializing');
    if (this._attrInterval) this.homey.clearInterval(this._attrInterval);
    if (this._cameraInterval) this.homey.clearInterval(this._cameraInterval);
    await super.onUninit();
  }

  async registerCamera() {
    this.log(`Registering camera feeds for ${this.host}`);

    // Live snapshot (Ring Pattern) - ONLY ONE image to prevent UI bugs on 2019 firmware
    try {
      this.snapshotImage = await this.homey.images.createImage();
      this.log('Camera: snapshotImage created');

      this.snapshotImage.setStream(async (stream) => {
        this.log('Camera: setStream called, fetching snapshot...');
        try {
          const buffer = await this._fetchSnapshotBuffer();
          const snapshot = new Duplex();

          if (buffer && buffer.length > 0) {
            this.log(`Camera: pushing frame of ${buffer.length} bytes`);
            snapshot.push(buffer);
          } else {
            this.log('Camera: no frame, pushing dummy stream');
            snapshot.push(null);
            return snapshot.pipe(stream);
          }

          snapshot.push(null); // End of stream
          return snapshot.pipe(stream);
        } catch (error) {
          this.error('Camera mapping error:', error.message);
          const snapshot = new Duplex();
          snapshot.push(null);
          return snapshot.pipe(stream);
        }
      });

      // EXACT RING PATTERN: Use this.getName() and 'Snapshot'
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

  /**
   * Fetches a single JPEG frame from the printer's MJPEG stream at /video.
   * Reads just enough data to extract the first complete JPEG frame, then closes.
   */
  async _fetchSnapshotBuffer() {
    return new Promise((resolve) => {
      const url = `http://${this.host}:3031/video`;
      this.log(`Camera: connecting to ${url}`);

      const timeout = setTimeout(() => {
        this.log('Camera: timeout waiting for MJPEG frame');
        req.destroy();
        resolve(null);
      }, 8000);

      const req = http.get(url, (res) => {
        this.log(`Camera: HTTP ${res.statusCode} content-type: ${res.headers['content-type']}`);

        if (res.statusCode !== 200) {
          clearTimeout(timeout);
          res.resume();
          resolve(null);
          return;
        }

        // Scan incoming chunks for JPEG SOI (0xFFD8) and EOI (0xFFD9) markers
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
            clearTimeout(timeout);
            const frame = buf.slice(start, end + 2);
            this.log(`Camera: extracted JPEG frame ${frame.length} bytes`);
            req.destroy();
            resolve(frame);
          }
        });

        res.on('end', () => {
          if (!frameFound) {
            clearTimeout(timeout);
            this.log('Camera: stream ended without a complete frame');
            resolve(null);
          }
        });
      });

      req.on('error', (err) => {
        // req.destroy() triggers ECONNRESET — expected, not an error
        if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) return;
        clearTimeout(timeout);
        this.error(`Camera: fetch error: ${err.message}`);
        resolve(null);
      });
    });
  }

  registerFlowCards() {
    // Actions
    this.homey.flow
      .getActionCard('emergency_stop')
      .registerRunListener(async (_args, _state) => this.onActionEmergencyStop());
    this.homey.flow.getActionCard('pause_print').registerRunListener(async (_args, _state) => this.onActionPause());
    this.homey.flow.getActionCard('resume_print').registerRunListener(async (_args, _state) => this.onActionResume());
    this.homey.flow.getActionCard('home_axes').registerRunListener(async (args, _state) => this.onActionHome(args));
    this.homey.flow
      .getActionCard('set_speed_preset')
      .registerRunListener(async (args, _state) => this.onActionSetSpeedPreset(args));
    this.homey.flow
      .getActionCard('set_fan_speed_pct')
      .registerRunListener(async (args, _state) => this.onActionSetFanSpeed(args));
    this.homey.flow
      .getActionCard('set_chamber_light')
      .registerRunListener(async (args, _state) => this.onActionSetLight(args.state));

    // Conditions
    this.homey.flow.getConditionCard('is_printing').registerRunListener(async (_args, _state) => {
      return this.getCapabilityValue('printer_status') === 'Printing';
    });
    this.homey.flow.getConditionCard('is_paused').registerRunListener(async (_args, _state) => {
      return this.getCapabilityValue('printer_status') === 'Paused';
    });
    this.homey.flow.getConditionCard('is_offline').registerRunListener(async (_args, _state) => {
      return !this.getAvailable();
    });
    this.homey.flow.getConditionCard('is_light_on').registerRunListener(async (_args, _state) => {
      return this.getCapabilityValue('onoff.chamberlight') === true;
    });
  }

  registerListeners() {
    // 1. Control Actions (Buttons)
    this.registerCapabilityListener('button.pause', async () => {
      this.log('UI: Pause Program');
      return this.client.sendCommand(2);
    });

    this.registerCapabilityListener('button.resume', async () => {
      this.log('UI: Resume Program');
      return this.client.sendCommand(3);
    });

    this.registerCapabilityListener('button.stop', async () => {
      this.log('UI: Stop/Cancel Program');
      return this.client.sendCommand(4);
    });

    this.registerCapabilityListener('button.home', async () => {
      this.log('UI: Home All Axes');
      return this.client.sendCommand(260, { Gcode: 'G28' });
    });

    // 2. Interactive Setpoints (Temperatures)
    this.registerCapabilityListener('target_temperature.nozzle', async (_value) => {
      this.log('UI: Target Nozzle change ignored (Read-Only Mode)');
      return true;
    });

    this.registerCapabilityListener('target_temperature.bed', async (_value) => {
      this.log('UI: Target Bed change ignored (Read-Only Mode)');
      return true;
    });

    // 3. Performance Factors
    this.registerCapabilityListener('speed_factor', async (value) => {
      this.log(`UI: Set Speed Factor -> ${value}%`);
      return this.client.sendCommand(13, { SpeedFactor: value });
    });

    this.registerCapabilityListener('extrusion_factor', async (value) => {
      this.log(`UI: Set Extrusion Factor -> ${value}%`);
      return this.client.sendCommand(14, { ExtrusionFactor: value });
    });

    // 4. Fans & Lights
    this.registerCapabilityListener('part_fan_speed', async (value) => {
      this.log(`UI: Set Part Fan Speed -> ${value}%`);
      return this.client.sendCommand(7, { Fan: value });
    });

    this.registerCapabilityListener('onoff.chamberlight', async (value) => {
      return this.client.sendCommand(12, { SecondLight: value ? 1 : 0 });
    });

    this.registerCapabilityListener('onoff.auxfan', async (value) => {
      return this.client.sendCommand(15, { ExtraFan: value ? 1 : 0 });
    });

    this.registerCapabilityListener('onoff.exhaustfan', async (value) => {
      return this.client.sendCommand(16, { ExhaustFan: value ? 1 : 0 });
    });

    this.registerCapabilityListener('onoff.boxfan', async (value) => {
      this.log(`UI: Set Box Fan -> ${value ? 'ON' : 'OFF'}`);
      return this.client.sendCommand(15, { BoxFan: value ? 100 : 0 });
    });
  }

  /**
   * Flow Actions
   */
  async onActionHome(args) {
    this.log(`Action: Home Axes (${args.axes})`);
    return this.client.sendCommand(17, { Axis: args.axes });
  }

  async onActionSetSpeedPreset(args) {
    const percentage = parseInt(args.preset);
    this.log(`Action: Set Speed Preset (${percentage}%)`);
    return this.client.sendCommand(13, { SpeedFactor: percentage });
  }

  async onActionSetFanSpeed(args) {
    this.log(`Action: Set Fan Speed (${args.fan} -> ${args.percentage}%)`);
    const cmdMap = { model: 18, aux: 15, exhaust: 16 };
    const payloadMap = { model: 'Fan', aux: 'ExtraFan', exhaust: 'ExhaustFan' };
    const cmd = cmdMap[args.fan];
    const key = payloadMap[args.fan];
    if (!cmd) throw new Error('Invalid fan selected');
    return this.client.sendCommand(cmd, { [key]: args.percentage });
  }

  async onActionResume() {
    this.log('Action: Resume Print');
    return this.client.sendCommand(3);
  }

  async onActionPause() {
    this.log('Action: Pause Print');
    return this.client.sendCommand(2);
  }

  async onActionEmergencyStop() {
    this.log('Action: Emergency Stop');
    return this.client.sendCommand(4);
  }

  async onActionSetLight(state) {
    this.log(`Action: Set Light (${state})`);
    return this.client.sendCommand(12, { SecondLight: state ? 1 : 0 });
  }

  /**
   * Map SDCP attributes to Homey capabilities
   */
  updateCapabilities(attributes) {
    if (!attributes) return;

    // --- Temperatures ---
    const nozzleTemp = attributes.TempOfNozzle ?? attributes.ExtruderTemp;
    const bedTemp = attributes.TempOfHotbed ?? attributes.BedTemp;
    const chamberTemp = attributes.TempOfBox ?? attributes.TempOfAmbient ?? attributes.ChamberTemp;

    if (nozzleTemp !== undefined) this.safeSetCapabilityValue('measure_temperature.nozzle', nozzleTemp);
    if (bedTemp !== undefined) this.safeSetCapabilityValue('measure_temperature.bed', bedTemp);
    if (chamberTemp !== undefined) this.safeSetCapabilityValue('measure_temperature', chamberTemp);

    const nozzleTarget = attributes.TempTargetNozzle ?? attributes.TargetTempOfNozzle ?? attributes.ExtruderTargetTemp;
    const bedTarget = attributes.TempTargetHotbed ?? attributes.TargetTempOfHotbed ?? attributes.BedTargetTemp;
    if (nozzleTarget !== undefined) this.safeSetCapabilityValue('target_temperature.nozzle', nozzleTarget);
    if (bedTarget !== undefined) this.safeSetCapabilityValue('target_temperature.bed', bedTarget);

    // --- Factors ---
    if (attributes.SpeedFactor !== undefined) this.safeSetCapabilityValue('speed_factor', attributes.SpeedFactor);
    if (attributes.ExtrusionFactor !== undefined) {
      this.safeSetCapabilityValue('extrusion_factor', attributes.ExtrusionFactor);
    }

    // --- Fans ---
    if (attributes.CurrentFanSpeed) {
      const fanSpeeds = attributes.CurrentFanSpeed;
      if (fanSpeeds.ModelFan !== undefined) this.safeSetCapabilityValue('part_fan_speed', fanSpeeds.ModelFan);
      if (fanSpeeds.AuxiliaryFan !== undefined) this.safeSetCapabilityValue('onoff.auxfan', fanSpeeds.AuxiliaryFan > 0);
      if (fanSpeeds.ExhaustFan !== undefined) this.safeSetCapabilityValue('onoff.exhaustfan', fanSpeeds.ExhaustFan > 0);
      if (fanSpeeds.BoxFan !== undefined) this.safeSetCapabilityValue('onoff.boxfan', fanSpeeds.BoxFan > 0);
    }
    if (attributes.Fan !== undefined) this.safeSetCapabilityValue('part_fan_speed', attributes.Fan);
    if (attributes.ExtraFan !== undefined) {
      const auxOn = typeof attributes.ExtraFan === 'boolean' ? attributes.ExtraFan : attributes.ExtraFan > 0;
      this.safeSetCapabilityValue('onoff.auxfan', auxOn);
    }
    if (attributes.ExhaustFan !== undefined) this.safeSetCapabilityValue('onoff.exhaustfan', attributes.ExhaustFan > 0);

    // --- Lights ---
    if (attributes.LightStatus) {
      if (attributes.LightStatus.SecondLight !== undefined) {
        this.safeSetCapabilityValue('onoff.chamberlight', attributes.LightStatus.SecondLight === 1);
      }
    }
    if (attributes.SecondLight !== undefined) {
      this.safeSetCapabilityValue('onoff.chamberlight', attributes.SecondLight === 1);
    }

    // --- Safety Sensors ---
    if (attributes.Filament !== undefined) this.safeSetCapabilityValue('alarm_filament', attributes.Filament === 0);
    if (attributes.Door !== undefined) this.safeSetCapabilityValue('alarm_contact', attributes.Door === 1);
    if (attributes.ZOffset !== undefined) this.safeSetCapabilityValue('z_offset', attributes.ZOffset);

    // --- Hardware Attributes (Centauri Carbon v3) ---
    // These now arrive directly on the attributes object via the top-level Attributes payload
    if (attributes.UsbDiskStatus !== undefined) {
      this.safeSetCapabilityValue('alarm_usb', attributes.UsbDiskStatus === 1);
    }
    if (attributes.MainboardMAC !== undefined) this.safeSetCapabilityValue('mac_address', attributes.MainboardMAC);
    if (attributes.RemainingMemory !== undefined) {
      this.safeSetCapabilityValue('memory_remaining', attributes.RemainingMemory);
    }

    // --- Status ---
    if (attributes.CurrentStatus !== undefined) {
      const rawStatus = Array.isArray(attributes.CurrentStatus)
        ? attributes.CurrentStatus[0]
        : attributes.CurrentStatus;

      const statusMap = {
        0: 'Idle',
        1: 'Printing',
        2: 'Paused',
        3: 'Finished',
        4: 'Error',
        13: 'Input Shaping',
      };

      const status = statusMap[rawStatus] ?? 'Idle';
      this.log(`Mapped status code ${rawStatus} to: ${status}`);

      const oldStatus = this.getCapabilityValue('printer_status');
      if (oldStatus !== status) {
        this._pendingStatusChange = { newStatus: status, oldStatus: oldStatus || '' };
      }
      this.safeSetCapabilityValue('printer_status', status);
    }

    // --- Print Info (SDCP v3 nested object) ---
    const pi = attributes.PrintInfo;
    if (pi) {
      if (pi.Progress !== undefined) this.safeSetCapabilityValue('print_progress', pi.Progress);
      if (pi.Filename !== undefined) this.safeSetCapabilityValue('filename', pi.Filename);
      if (pi.CurrentLayer !== undefined) this.safeSetCapabilityValue('current_layer', pi.CurrentLayer);
      if (pi.TotalLayer !== undefined) this.safeSetCapabilityValue('total_layers', pi.TotalLayer);
      if (pi.TotalLayers !== undefined) this.safeSetCapabilityValue('total_layers', pi.TotalLayers);

      if (pi.CurrentLayer !== undefined && pi.TotalLayer !== undefined && pi.TotalLayer > 0) {
        const layerPct = Math.round((pi.CurrentLayer / pi.TotalLayer) * 100);
        this.safeSetCapabilityValue('layer_progress', Math.min(100, Math.max(0, layerPct)));
      } else if (pi.CurrentLayer !== undefined && pi.TotalLayers !== undefined && pi.TotalLayers > 0) {
        const layerPct = Math.round((pi.CurrentLayer / pi.TotalLayers) * 100);
        this.safeSetCapabilityValue('layer_progress', Math.min(100, Math.max(0, layerPct)));
      }

      if (pi.CurrentTicks !== undefined && pi.TotalTicks !== undefined && pi.TotalTicks > 0) {
        const remainingSec = Math.max(0, pi.TotalTicks - pi.CurrentTicks);
        this.safeSetCapabilityValue('time_left', Math.round(remainingSec / 60));
      }
    }

    // Flat fallbacks
    if (attributes.PrintProgress !== undefined) this.safeSetCapabilityValue('print_progress', attributes.PrintProgress);
    if (attributes.FileName !== undefined) this.safeSetCapabilityValue('filename', attributes.FileName);

    const fallbackCurrentLayer = attributes.CurrentLayer;
    const fallbackTotalLayer = attributes.TotalLayer ?? attributes.TotalLayers;
    if (fallbackCurrentLayer !== undefined && fallbackTotalLayer !== undefined && fallbackTotalLayer > 0) {
      const layerPct = Math.round((fallbackCurrentLayer / fallbackTotalLayer) * 100);
      this.safeSetCapabilityValue('layer_progress', Math.min(100, Math.max(0, layerPct)));
    }
    if (attributes.RemainingTime !== undefined) {
      this.safeSetCapabilityValue('time_left', Math.round(attributes.RemainingTime / 60));
    }

    // --- Advanced Info ---
    if (attributes.CurrenCoord) {
      const parts = attributes.CurrenCoord.split(',');
      if (parts.length >= 3) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (!isNaN(x)) this.safeSetCapabilityValue('x_position', Math.round(x * 100) / 100);
        if (!isNaN(y)) this.safeSetCapabilityValue('y_position', Math.round(y * 100) / 100);
        if (!isNaN(z)) this.safeSetCapabilityValue('z_position', Math.round(z * 100) / 100);
      }
    } else if (attributes.ZPosition !== undefined) {
      this.safeSetCapabilityValue('z_position', Math.round(attributes.ZPosition * 100) / 100);
    }

    if (attributes.FwVersion !== undefined) this.safeSetCapabilityValue('firmware_version', attributes.FwVersion);
    if (attributes.FirmwareVersion !== undefined) {
      this.safeSetCapabilityValue('firmware_version', attributes.FirmwareVersion);
    }
    if (attributes.MachineName !== undefined) this.safeSetCapabilityValue('printer_model', attributes.MachineName);
    if (attributes.MainboardIP !== undefined) this.safeSetCapabilityValue('ip_address', attributes.MainboardIP);
    if (attributes.Resolution !== undefined) this.safeSetCapabilityValue('resolution', attributes.Resolution);

    // --- FW Update ---
    if (attributes.FwUpdate) {
      this.homey.flow.getTriggerCard('fw_update_available').trigger(this).catch(this.error);
    }

    // --- Thumbnail ---
    if (attributes.Thumbnail && attributes.Thumbnail.length > 50) {
      this.handleThumbnail(attributes.Thumbnail);
    }

    // --- Sensor Transition Triggers ---
    if (attributes.Filament !== undefined) {
      if (this._prevFilament === 1 && attributes.Filament === 0) {
        this.homey.flow.getTriggerCard('filament_runout').trigger(this).catch(this.error);
      }
      this._prevFilament = attributes.Filament;
    }

    if (attributes.Door !== undefined) {
      if (this._prevDoor !== null && this._prevDoor !== attributes.Door) {
        const state = attributes.Door === 1 ? 'opened' : 'closed';
        this.homey.flow.getTriggerCard('door_status_changed').trigger(this, { state }).catch(this.error);
      }
      this._prevDoor = attributes.Door;
    }

    if (attributes.UsbDiskStatus !== undefined) {
      if (this._prevUsb !== null && this._prevUsb !== attributes.UsbDiskStatus) {
        const state = attributes.UsbDiskStatus === 1 ? 'inserted' : 'removed';
        this.homey.flow.getTriggerCard('usb_status_changed').trigger(this, { state }).catch(this.error);
      }
      this._prevUsb = attributes.UsbDiskStatus;
    }

    // --- Threshold Triggers ---
    const progress = pi ? pi.Progress : attributes.PrintProgress;
    if (progress !== undefined && progress > 0) {
      this.homey.flow
        .getTriggerCard('progress_reached')
        .getArgumentValues()
        .then((argsList) => {
          for (const args of argsList) {
            if (progress >= args.percentage && !this._firedProgress.has(args.percentage)) {
              this.homey.flow.getTriggerCard('progress_reached').trigger(this, {}, args).catch(this.error);
              this._firedProgress.add(args.percentage);
            }
          }
        })
        .catch(() => {});
    }

    const layer = pi ? pi.CurrentLayer : attributes.CurrentLayer;
    if (layer !== undefined && layer > 0) {
      this.homey.flow
        .getTriggerCard('layer_reached')
        .getArgumentValues()
        .then((argsList) => {
          for (const args of argsList) {
            if (layer >= args.layer && !this._firedLayers.has(args.layer)) {
              this.homey.flow.getTriggerCard('layer_reached').trigger(this, {}, args).catch(this.error);
              this._firedLayers.add(args.layer);
            }
          }
        })
        .catch(() => {});
    }

    // --- Temperature Reached Triggers ---
    if (nozzleTemp !== undefined && nozzleTarget !== undefined && nozzleTarget > 0) {
      if (!this._reachedNozzle && nozzleTemp >= nozzleTarget - 1) {
        this.homey.flow.getTriggerCard('nozzle_temp_reached').trigger(this).catch(this.error);
        this._reachedNozzle = true;
      } else if (nozzleTemp < nozzleTarget - 5) {
        this._reachedNozzle = false;
      }
    }

    if (bedTemp !== undefined && bedTarget !== undefined && bedTarget > 0) {
      if (!this._reachedBed && bedTemp >= bedTarget - 1) {
        this.homey.flow.getTriggerCard('bed_temp_reached').trigger(this).catch(this.error);
        this._reachedBed = true;
      } else if (bedTemp < bedTarget - 5) {
        this._reachedBed = false;
      }
    }

    if (chamberTemp !== undefined) {
      this.homey.flow
        .getTriggerCard('chamber_temp_reached')
        .getArgumentValues()
        .then((argsList) => {
          for (const args of argsList) {
            if (chamberTemp >= args.temperature && !this._firedChamber.has(args.temperature)) {
              this.homey.flow.getTriggerCard('chamber_temp_reached').trigger(this, {}, args).catch(this.error);
              this._firedChamber.add(args.temperature);
            } else if (chamberTemp < args.temperature - 2) {
              this._firedChamber.delete(args.temperature);
            }
          }
        })
        .catch(() => {});
    }

    // --- Final Step: Triggers ---
    if (this._pendingStatusChange) {
      this.handleStatusTriggers(this._pendingStatusChange.newStatus, this._pendingStatusChange.oldStatus);
      this._pendingStatusChange = null;
    }
  }

  handleThumbnail(base64Data) {
    if (!this.thumbnailImage) return;
    try {
      this.thumbnailBuffer = Buffer.from(base64Data, 'base64');
      this.thumbnailImage.update().catch(this.error);
    } catch (err) {
      this.error('Error updating thumbnail:', err.message);
    }
  }

  handleStatusTriggers(newStatus, oldStatus) {
    if (newStatus === oldStatus) return;

    const sLower = newStatus.toLowerCase();
    const oldLower = oldStatus.toLowerCase();

    try {
      // 1. Specific State Triggers
      if (sLower === 'printing' && oldLower !== 'printing') {
        if (oldLower === 'paused') {
          this.homey.flow.getTriggerCard('print_resumed').trigger(this).catch(this.error);
        } else {
          this.homey.flow.getTriggerCard('print_started').trigger(this).catch(this.error);
        }
      } else if (sLower === 'finished' && oldLower !== 'finished') {
        this.homey.flow.getTriggerCard('print_finished').trigger(this).catch(this.error);
      } else if (sLower === 'paused' && oldLower !== 'paused') {
        this.homey.flow.getTriggerCard('print_paused').trigger(this).catch(this.error);
      } else if (sLower === 'error' && oldLower !== 'error') {
        this.homey.flow
          .getTriggerCard('error_detected')
          .trigger(this, { error_msg: 'Printer reported error state' })
          .catch(this.error);
      } else if (sLower === 'idle' && (oldLower === 'printing' || oldLower === 'paused')) {
        this.homey.flow.getTriggerCard('print_cancelled').trigger(this).catch(this.error);
      }

      // 2. Generic Status Change Trigger
      this.homey.flow.getTriggerCard('status_changed').trigger(this, { status: newStatus }).catch(this.error);

      // Clean up threshold trackers on end of print
      if (sLower === 'finished' || sLower === 'idle' || sLower === 'error') {
        if (this._firedProgress) this._firedProgress.clear();
        if (this._firedLayers) this._firedLayers.clear();
        this._reachedNozzle = false;
        this._reachedBed = false;
        if (this._firedChamber) this._firedChamber.clear();
      }
    } catch (err) {
      this.log('[Warning] Failed to trigger flow card:', err.message);
    }
  }
}

module.exports = ElegooCCDevice;
