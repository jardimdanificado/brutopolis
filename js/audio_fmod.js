// =============================================================================
// Brutopolis — FMOD Studio Audio Engine Integration
// =============================================================================

/**
 * AudioManager handles FMOD Studio initialization, Bank loading,
 * event playback (one-shots, loops, 3D spatialized), and per-frame updates.
 */
class AudioManager {
  constructor() {
    this.fmod = null;
    this.system = null;
    this.coreSystem = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.initPromise = null;

    // Loaded banks: { [bankName]: BankHandle }
    this.loadedBanks = new Map();

    // Cached event descriptions: { [eventPath]: EventDescriptionHandle }
    this.eventDescriptions = new Map();

    // Active event instances: { [key]: EventInstanceHandle }
    this.activeInstances = new Map();

    // Master volume (0.0 to 1.0)
    this.masterVolume = 1.0;
    this.masterBus = null;
    this.musicBus = null;
    this.sfxBus = null;
  }

  /**
   * Initializes the FMOD Studio WebAssembly runtime and System.
   * @param {Object} options - Config options
   * @param {string} options.wasmPath - Path to fmodstudio.wasm (default: 'lib/fmod/fmodstudio.wasm')
   * @param {number} options.maxChannels - Max virtual channels (default: 512)
   * @param {number} options.initialMemory - Heap memory in bytes (default: 64MB)
   * @returns {Promise<AudioManager>}
   */
  async init(options = {}) {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      this.isLoading = true;

      const wasmPath = options.wasmPath || "lib/fmod/fmodstudio.wasm";
      const maxChannels = options.maxChannels || 512;
      const initialMemory = options.initialMemory || 64 * 1024 * 1024;

      const fmodModuleConfig = {
        window: window,
        INITIAL_MEMORY: initialMemory,
        locateFile: (file) => {
          if (file.endsWith(".wasm")) {
            return wasmPath;
          }
          return file;
        },
        onRuntimeInitialized: () => {
          try {
            console.log("[FMOD] WebAssembly runtime initialized. Creating Studio System...");
            const outval = {};
            let res = this.fmod.Studio_System_Create(outval);
            this.checkResult(res, "Studio_System_Create");
            this.system = outval.val;

            res = this.system.getCoreSystem(outval);
            this.checkResult(res, "getCoreSystem");
            this.coreSystem = outval.val;

            // Configure DSP buffer size for WebAudio stability (larger buffer prevents underruns during heavy rendering)
            this.coreSystem.setDSPBufferSize(4096, 4);

            // Initialize Studio System
            res = this.system.initialize(
              maxChannels,
              this.fmod.STUDIO_INIT_NORMAL,
              this.fmod.INIT_NORMAL,
              null
            );
            this.checkResult(res, "system.initialize");

            // Cache default buses if available
            this.refreshBuses();

            // Decoupled timer for FMOD updates so audio doesn't depend solely on requestAnimationFrame
            if (!this.updateInterval) {
              this.updateInterval = setInterval(() => {
                this.update();
              }, 20); // 50 Hz constant update
            }

            // Auto pause/resume when switching tabs to avoid audio buffer stutter
            document.addEventListener("visibilitychange", () => {
              if (document.hidden) {
                if (this.coreSystem && this.coreSystem.mixerSuspend) {
                  this.coreSystem.mixerSuspend();
                }
              } else {
                if (this.coreSystem && this.coreSystem.mixerResume) {
                  this.coreSystem.mixerResume();
                }
              }
            });

            this.isInitialized = true;
            this.isLoading = false;
            console.log("[FMOD] Audio engine fully initialized!");
            resolve(this);
          } catch (err) {
            this.isLoading = false;
            console.error("[FMOD] Initialization failed:", err);
            reject(err);
          }
        },
        print: (msg) => console.log(`[FMOD Output] ${msg}`),
        printErr: (msg) => console.warn(`[FMOD Error] ${msg}`)
      };

      if (typeof window.FMODModule === "function") {
        this.fmod = {};
        window.FMODModule(Object.assign(this.fmod, fmodModuleConfig));
      } else {
        reject(new Error("FMODModule is not loaded on window. Ensure lib/fmod/fmodstudio.js is included."));
      }
    });

    return this.initPromise;
  }

  /**
   * Helper to verify FMOD call results.
   */
  checkResult(result, context = "") {
    if (result !== this.fmod.OK) {
      const errStr = this.fmod.ErrorString ? this.fmod.ErrorString(result) : `Error code: ${result}`;
      const msg = `[FMOD Error] ${context ? context + " -> " : ""}${errStr} (Code ${result})`;
      console.warn(msg);
      return false;
    }
    return true;
  }

  /**
   * Updates FMOD system state (call this inside your main requestAnimationFrame loop).
   */
  update() {
    if (!this.isInitialized || !this.system) return;
    this.system.update();
  }

  /**
   * Loads a bank file via URL (mounts file into FMOD virtual filesystem).
   * @param {string} url - URL or relative path to the .bank file
   * @param {string} [bankId] - Optional key identifier for the bank
   * @returns {Promise<any>} Loaded bank handle
   */
  async loadBank(url, bankId = null) {
    if (!this.isInitialized) {
      console.warn("[FMOD] Cannot load bank before initialization.");
      return null;
    }

    const filename = url.substring(url.lastIndexOf("/") + 1);
    const key = bankId || filename;
    if (this.loadedBanks.has(key)) {
      return this.loadedBanks.get(key);
    }

    try {
      console.log(`[FMOD] Fetching Bank file: ${url}...`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch bank from ${url}: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      const virtualPath = "/" + filename;

      // Mount into FMOD Emscripten Virtual File System
      if (typeof this.fmod.FS_unlink === "function") {
        try { this.fmod.FS_unlink(virtualPath); } catch (_) {}
      }
      this.fmod.FS_createDataFile("/", filename, uint8, true, false, false);

      const outval = {};
      const res = this.system.loadBankFile(
        virtualPath,
        this.fmod.STUDIO_LOAD_BANK_NORMAL,
        outval
      );

      if (!this.checkResult(res, `loadBankFile (${virtualPath})`)) {
        return null;
      }

      const bank = outval.val;
      this.loadedBanks.set(key, bank);
      console.log(`[FMOD] Successfully loaded bank: ${key}`);

      // Refresh buses in case strings/master bus became available
      this.refreshBuses();

      return bank;
    } catch (err) {
      console.error(`[FMOD] Error loading bank ${url}:`, err);
      return null;
    }
  }

  /**
   * Unloads a loaded bank.
   * @param {string} bankId
   */
  unloadBank(bankId) {
    if (!this.loadedBanks.has(bankId)) return;
    const bank = this.loadedBanks.get(bankId);
    if (bank && bank.unload) {
      bank.unload();
    }
    this.loadedBanks.delete(bankId);
    console.log(`[FMOD] Bank unloaded: ${bankId}`);
  }

  /**
   * Refreshes default master / category buses.
   */
  refreshBuses() {
    if (!this.system) return;
    const outval = {};
    if (this.system.getBus("bus:/", outval) === this.fmod.OK) {
      this.masterBus = outval.val;
    }
    if (this.system.getBus("bus:/Music", outval) === this.fmod.OK) {
      this.musicBus = outval.val;
    }
    if (this.system.getBus("bus:/SFX", outval) === this.fmod.OK) {
      this.sfxBus = outval.val;
    }
  }

  /**
   * Sets the master volume (0.0 to 1.0).
   * @param {number} vol
   */
  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterBus) {
      this.masterBus.setVolume(this.masterVolume);
    }
  }

  /**
   * Gets or loads an EventDescription handle by event path (e.g. "event:/UI/Click" or GUID).
   * @param {string} pathOrGuid
   * @returns {any} EventDescription handle
   */
  getEventDescription(pathOrGuid) {
    if (this.eventDescriptions.has(pathOrGuid)) {
      return this.eventDescriptions.get(pathOrGuid);
    }
    if (!this.system) return null;

    const outval = {};
    const res = this.system.getEvent(pathOrGuid, outval);
    if (res === this.fmod.OK && outval.val) {
      this.eventDescriptions.set(pathOrGuid, outval.val);
      return outval.val;
    }
    return null;
  }

  /**
   * Plays a one-shot event at 2D or 3D position and automatically releases it when finished.
   * @param {string} eventPath - e.g. "event:/SFX/Explosion"
   * @param {Object} [params] - Key-value map of parameter names and values
   * @param {Object} [position3D] - Optional { x, y, z } for 3D spatial sound
   * @returns {any} EventInstance handle or null
   */
  playOneShot(eventPath, params = null, position3D = null) {
    if (!this.isInitialized) return null;
    const desc = this.getEventDescription(eventPath);
    if (!desc) {
      return null;
    }

    const outval = {};
    let res = desc.createInstance(outval);
    if (!this.checkResult(res, `createInstance (${eventPath})`)) return null;

    const instance = outval.val;

    // Apply parameters if supplied
    if (params && typeof params === "object") {
      for (const [key, val] of Object.entries(params)) {
        instance.setParameterByName(key, val, false);
      }
    }

    // Set 3D attributes if supplied
    if (position3D && typeof position3D.x === "number") {
      const attributes = {
        position: { x: position3D.x, y: position3D.y || 0, z: position3D.z || 0 },
        velocity: { x: 0, y: 0, z: 0 },
        forward: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: 1, z: 0 }
      };
      instance.set3DAttributes(attributes);
    }

    instance.start();
    // Release frees the memory when sound playback completes
    instance.release();
    return instance;
  }

  /**
   * Creates a persistent instance (e.g. for looping music or continuous ambience).
   * @param {string} nameKey - Custom identifier to retrieve/control later
   * @param {string} eventPath - FMOD event path
   * @param {boolean} [autoStart=true]
   * @returns {any} EventInstance handle
   */
  createInstance(nameKey, eventPath, autoStart = true) {
    if (!this.isInitialized) return null;

    // Stop existing instance with same key if present
    this.stopInstance(nameKey, true);

    const desc = this.getEventDescription(eventPath);
    if (!desc) {
      console.warn(`[FMOD] Event not found: ${eventPath}`);
      return null;
    }

    const outval = {};
    const res = desc.createInstance(outval);
    if (!this.checkResult(res, `createInstance (${eventPath})`)) return null;

    const instance = outval.val;
    this.activeInstances.set(nameKey, instance);

    if (autoStart) {
      instance.start();
    }

    return instance;
  }

  /**
   * Stops and releases an active event instance.
   * @param {string} nameKey
   * @param {boolean} [immediate=false] - If true, stops immediately without fade-out
   */
  stopInstance(nameKey, immediate = false) {
    if (!this.activeInstances.has(nameKey)) return;
    const instance = this.activeInstances.get(nameKey);
    if (instance) {
      const mode = immediate
        ? this.fmod.STUDIO_STOP_IMMEDIATE
        : this.fmod.STUDIO_STOP_ALLOWFADEOUT;
      instance.stop(mode);
      instance.release();
    }
    this.activeInstances.delete(nameKey);
  }

  /**
   * Sets a parameter value on a named active instance.
   * @param {string} nameKey
   * @param {string} paramName
   * @param {number} value
   */
  setInstanceParameter(nameKey, paramName, value) {
    const instance = this.activeInstances.get(nameKey);
    if (instance) {
      instance.setParameterByName(paramName, value, false);
    }
  }

  /**
   * Sets a global FMOD Studio parameter by name.
   * @param {string} paramName
   * @param {number} value
   */
  setGlobalParameter(paramName, value) {
    if (!this.system) return;
    this.system.setParameterByName(paramName, value, false);
  }

  /**
   * Updates 3D listener position and orientation (e.g. from camera).
   * @param {Object} pos - { x, y, z }
   * @param {Object} forward - { x, y, z }
   * @param {Object} up - { x, y, z }
   */
  setListenerPosition(pos, forward = { x: 0, y: 0, z: 1 }, up = { x: 0, y: 1, z: 0 }) {
    if (!this.system) return;
    const attributes = {
      position: { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 },
      velocity: { x: 0, y: 0, z: 0 },
      forward: { x: forward.x || 0, y: forward.y || 0, z: forward.z || 1 },
      up: { x: up.x || 0, y: up.y || 1, z: up.z || 0 }
    };
    this.system.setListenerAttributes(0, attributes, null);
  }
}

// Export singleton
export const audio = new AudioManager();
