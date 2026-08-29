// =============================================================================
// Brutopolis — FMOD Studio Audio Engine Integration
// Optimized with decoupled 50Hz DSP clock & large buffer for zero-stutter playback
// =============================================================================

/**
 * AudioManager handles FMOD Studio initialization, Bank loading,
 * event playback (one-shots, loops, 3D spatialized), and decoupled background updates.
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
    this.updateInterval = null;
  }

  /**
   * Initializes the FMOD Studio WebAssembly runtime and System.
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

            // In FMOD, setDSPBufferSize MUST be called before system.initialize() to take effect in the WebAudio audio-driver mixer!
            // 4096 samples with 4 buffers provides ~370ms of audio buffer headroom
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

            // Decoupled timer for FMOD updates at 50 Hz so audio never lags behind FPS drops
            if (!this.updateInterval) {
              this.updateInterval = setInterval(() => {
                this.update();
              }, 20);
            }

            // Auto pause/resume when switching tabs
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

  checkResult(result, context = "") {
    if (result !== this.fmod.OK) {
      const errStr = this.fmod.ErrorString ? this.fmod.ErrorString(result) : `Error code: ${result}`;
      const msg = `[FMOD Error] ${context ? context + " -> " : ""}${errStr} (Code ${result})`;
      console.warn(msg);
      return false;
    }
    return true;
  }

  update() {
    if (!this.isInitialized || !this.system) return;
    this.system.update();
  }

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

      this.refreshBuses();
      return bank;
    } catch (err) {
      console.error(`[FMOD] Error loading bank ${url}:`, err);
      return null;
    }
  }

  unloadBank(bankId) {
    if (!this.loadedBanks.has(bankId)) return;
    const bank = this.loadedBanks.get(bankId);
    if (bank && bank.unload) {
      bank.unload();
    }
    this.loadedBanks.delete(bankId);
  }

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

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterBus) {
      this.masterBus.setVolume(this.masterVolume);
    }
  }

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

  playOneShot(eventPath, params = null, position3D = null) {
    if (!this.isInitialized) return null;
    const desc = this.getEventDescription(eventPath);
    if (!desc) return null;

    const outval = {};
    let res = desc.createInstance(outval);
    if (!this.checkResult(res, `createInstance (${eventPath})`)) return null;

    const instance = outval.val;

    if (params && typeof params === "object") {
      for (const [key, val] of Object.entries(params)) {
        instance.setParameterByName(key, val, false);
      }
    }

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
    instance.release();
    return instance;
  }

  createInstance(nameKey, eventPath, autoStart = true) {
    if (!this.isInitialized) return null;
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

  setInstanceVolume(nameKey, volume) {
    const instance = this.activeInstances.get(nameKey);
    if (instance && typeof instance.setVolume === "function") {
      instance.setVolume(Math.max(0, Math.min(1, volume)));
    }
  }

  setInstanceParameter(nameKey, paramName, value) {
    const instance = this.activeInstances.get(nameKey);
    if (instance) {
      instance.setParameterByName(paramName, value, false);
    }
  }

  setGlobalParameter(paramName, value) {
    if (!this.system) return;
    this.system.setParameterByName(paramName, value, false);
  }

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

export const audio = new AudioManager();
