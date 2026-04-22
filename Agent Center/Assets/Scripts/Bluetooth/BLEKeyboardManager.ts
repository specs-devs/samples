import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { HID_KEY_CODES, SHIFT_MAP } from "./HIDKeyCodes";

export interface BluetoothDeviceInfo {
  name: string;
  address: Uint8Array;
}

export interface BLEKeyboardEvent {
  key: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
  isSpecialKey: boolean;
}

const HID_SERVICE_UUID = "0x1812";

@component
export class BLEKeyboardManager extends BaseScriptComponent {
  public readonly onDeviceFound = new Event<BluetoothDeviceInfo>();
  public readonly onScanComplete = new Event<void>();
  public readonly onConnectionStateChanged = new Event<{
    connected: boolean;
    deviceName: string;
  }>();
  public readonly onKeyboardInput = new Event<BLEKeyboardEvent>();

  private bluetoothModule: Bluetooth.BluetoothCentralModule = require("LensStudio:BluetoothCentralModule");
  private _isConnected = false;
  private _connectedDeviceName = "";
  private _foundDevices: BluetoothDeviceInfo[] = [];
  private _isScanning = false;

  // HID key repeat state
  private prevKeys: number[] = [];
  private heldKeys: Map<
    number,
    {
      startTime: number;
      lastRepeatTime: number;
      modifiers?: BLEKeyboardEvent["modifiers"];
    }
  > = new Map();
  private readonly KEY_REPEAT_INITIAL_DELAY = 500;
  private readonly KEY_REPEAT_RATE = 80;
  private readonly REPEATABLE_KEYS: Set<number> = new Set([
    0x2a, // Backspace
    0x4c, // Delete
    0x4f, // ArrowRight
    0x50, // ArrowLeft
    0x51, // ArrowDown
    0x52, // ArrowUp
  ]);

  get isConnected(): boolean {
    return this._isConnected;
  }

  get connectedDeviceName(): string {
    return this._connectedDeviceName;
  }

  onAwake(): void {
    print(
      `[BLE] onAwake: bluetoothModule = ${this.bluetoothModule ? "OK" : "NULL"}`,
    );
    this.createEvent("UpdateEvent").bind(() => this.processKeyRepeat());
  }

  startScan(): void {
    if (this._isScanning) {
      print("[BLE] startScan ignored — already scanning");
      return;
    }
    this._foundDevices = [];
    this._isScanning = true;
    print("[BLE] startScan: beginning HID device scan");

    if (global.deviceInfoSystem.isEditor()) {
      print("[BLE] startScan: editor mode, fake device will appear in 2s");
      const fakeDevice: BluetoothDeviceInfo = {
        name: "MyFakeKeyboard",
        address: new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe]),
      };
      setTimeout(() => {
        print("[BLE] onDeviceFound (fake): MyFakeKeyboard");
        this._foundDevices.push(fakeDevice);
        this.onDeviceFound.invoke(fakeDevice);
        this._isScanning = false;
        print("[BLE] onScanComplete (fake): 1 device found");
        this.onScanComplete.invoke();
      }, 2000);
      return;
    }

    this.scanForDevices();
  }

  stopScan(): void {
    print("[BLE] stopScan");
    this._isScanning = false;
    if (!global.deviceInfoSystem.isEditor()) {
      this.bluetoothModule.stopScan();
    }
  }

  unpairDevice(): void {
    print(`[BLE] unpairDevice: "${this._connectedDeviceName}"`);
    const name = this._connectedDeviceName;
    this._isConnected = false;
    this._connectedDeviceName = "";
    this.onConnectionStateChanged.invoke({
      connected: false,
      deviceName: name,
    });
  }

  getFoundDeviceByAddress(address: Uint8Array): BluetoothDeviceInfo | null {
    return this._foundDevices.find((d) => d.address === address) ?? null;
  }

  async connectToDevice(address: Uint8Array, name: string): Promise<void> {
    print(`[BLE] connectToDevice: "${name}"`);
    try {
      const gatt = await this.bluetoothModule.connectGatt(address);
      print(`[BLE] GATT connected to "${name}", registering HID notifications`);
      gatt.onConnectionStateChangedEvent.add(async (cs) => {
        if (cs.state !== Bluetooth.ConnectionState.Connected) {
          if (this._connectedDeviceName === name) {
            print(`[BLE] disconnected from "${name}"`);
            this._isConnected = false;
            this._connectedDeviceName = "";
            this.onConnectionStateChanged.invoke({
              connected: false,
              deviceName: name,
            });
          }
          return;
        }

        // Stop scan now that we have a connection (only if one is active)
        if (this._isScanning) {
          this._isScanning = false;
          this.bluetoothModule.stopScan();
        }

        // Register notifications on all characteristics across all services
        let charCount = 0;
        for (const service of gatt.getServices()) {
          print(`[BLE] service uuid=${service.uuid}`);
          for (const char of service.getCharacteristics()) {
            print(
              `[BLE] characteristic uuid=${char.uuid} properties=${char.properties}`,
            );
            await char.registerNotifications((buf) => {
              this.handleKeyboard(buf);
            });
            charCount++;
          }
        }
        print(`[BLE] registered ${charCount} characteristic(s) for "${name}"`);

        this._isConnected = true;
        this._connectedDeviceName = name;
        print(
          `[BLE] onConnectionStateChanged: connected = true, device = "${name}"`,
        );
        this.onConnectionStateChanged.invoke({
          connected: true,
          deviceName: name,
        });
      });
    } catch (e) {
      print("[BLE] connectToDevice error: " + e);
    }
  }

  private async scanForDevices(): Promise<void> {
    print(
      "[BLE] scanForDevices: scanning for HID service 0x1812, timeout=10000s",
    );
    const scanFilter = new Bluetooth.ScanFilter();
    scanFilter.serviceUUID = HID_SERVICE_UUID;

    const scanSettings = new Bluetooth.ScanSettings();
    scanSettings.uniqueDevices = true;
    scanSettings.timeoutSeconds = 10;
    scanSettings.scanMode = Bluetooth.ScanMode.Balanced;

    await this.bluetoothModule
      .startScan([scanFilter], scanSettings, (result) => {
        if (!this._isScanning) return false;
        const addrHex = Array.from(result.deviceAddress)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(":");
        print(
          `[BLE] raw result: name="${result.deviceName || ""}" addr=${addrHex}`,
        );

        const device: BluetoothDeviceInfo = {
          name: result.deviceName || "Unknown Device",
          address: result.deviceAddress,
        };
        const isDuplicate = this._foundDevices.some(
          (d) =>
            d.address.length === device.address.length &&
            d.address.every((byte, i) => byte === device.address[i]),
        );
        if (isDuplicate) return false;
        print(`[BLE] onDeviceFound: "${device.name}"`);
        this._foundDevices.push(device);
        this.onDeviceFound.invoke(device);
        return false;
      })
      .catch((e) => {
        print(`[BLE] startScan ended: ${e}`);
      });

    print(`[BLE] onScanComplete: ${this._foundDevices.length} device(s) found`);
    this._isScanning = false;
    this.onScanComplete.invoke();
  }

  private handleKeyboard(buf: Uint8Array): void {
    const hex = Array.from(buf)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    print(`[BLE] handleKeyboard: len=${buf.length} buf=[${hex}]`);

    // Standard HID keyboard report: [mods, reserved, key0..key5] = 8 bytes
    // Some keyboards prefix with a 1-byte Report ID, giving 9 bytes.
    // Detect by checking if buf[0] has any of the known modifier bits set
    // OR if the buffer length suggests a report-ID prefix.
    const hasReportId = buf.length === 9;
    const offset = hasReportId ? 1 : 0;

    const mods = buf[offset];
    const shift = !!(mods & (0x02 | 0x20));
    const ctrlPressed = !!(mods & (0x01 | 0x10));
    const alt = !!(mods & (0x04 | 0x40));
    const metaPressed = !!(mods & (0x08 | 0x80));

    // Key codes start at offset+2 (skip modifier byte + reserved byte),
    // or offset+1 for 7-byte (no reserved byte) reports.
    const dataLen = buf.length - offset;
    const start = offset + (dataLen === 7 ? 1 : 2);
    const now: number[] = [];
    for (let i = start; i < buf.length; i++) {
      if (buf[i]) now.push(buf[i]);
    }

    const ctrl = metaPressed || ctrlPressed;
    const modifiers: BLEKeyboardEvent["modifiers"] =
      ctrl || alt || shift ? { ctrl, alt, shift } : undefined;

    // Release held keys no longer pressed
    for (const code of this.prevKeys) {
      if (!now.includes(code)) {
        this.heldKeys.delete(code);
      }
    }

    // Process newly pressed keys
    for (const code of now) {
      if (this.prevKeys.includes(code)) continue;

      if (this.REPEATABLE_KEYS.has(code)) {
        const t = Date.now();
        this.heldKeys.set(code, {
          startTime: t,
          lastRepeatTime: t,
          modifiers,
        });
      }

      const specialKey = this.getSpecialKeyName(code);
      if (specialKey) {
        print(
          `[BLE] key DOWN: special="${specialKey}" mods=${JSON.stringify(modifiers)}`,
        );
        this.onKeyboardInput.invoke({
          key: specialKey,
          modifiers,
          isSpecialKey: true,
        });
        continue;
      }

      const ch = this.usageToChar(code, shift);
      if (ch) {
        print(
          `[BLE] key DOWN: char="${ch}" ctrl=${ctrl} mods=${JSON.stringify(modifiers)}`,
        );
        if (!ctrl) {
          this.onKeyboardInput.invoke({
            key: ch,
            modifiers,
            isSpecialKey: false,
          });
        }
      } else {
        print(`[BLE] key DOWN: unmapped HID 0x${code.toString(16)}`);
      }
    }

    this.prevKeys = now;
  }

  private processKeyRepeat(): void {
    const now = Date.now();
    for (const [code, state] of this.heldKeys) {
      if (now - state.startTime < this.KEY_REPEAT_INITIAL_DELAY) continue;
      if (now - state.lastRepeatTime < this.KEY_REPEAT_RATE) continue;
      state.lastRepeatTime = now;

      const shift = state.modifiers?.shift ?? false;
      const specialKey = this.getSpecialKeyName(code);
      if (specialKey) {
        this.onKeyboardInput.invoke({
          key: specialKey,
          modifiers: state.modifiers,
          isSpecialKey: true,
        });
      } else {
        const ch = this.usageToChar(code, shift);
        if (ch) {
          this.onKeyboardInput.invoke({
            key: ch,
            modifiers: state.modifiers,
            isSpecialKey: false,
          });
        }
      }
    }
  }

  private getSpecialKeyName(code: number): string | null {
    const specialKeys: { [key: number]: string } = {
      0x28: "Enter",
      0x29: "Escape",
      0x2a: "Backspace",
      0x2b: "Tab",
      0x4c: "Delete",
      0x49: "Insert",
      0x4a: "Home",
      0x4d: "End",
      0x4b: "PageUp",
      0x4e: "PageDown",
      0x4f: "ArrowRight",
      0x50: "ArrowLeft",
      0x51: "ArrowDown",
      0x52: "ArrowUp",
      0x3a: "F1",
      0x3b: "F2",
      0x3c: "F3",
      0x3d: "F4",
      0x3e: "F5",
      0x3f: "F6",
      0x40: "F7",
      0x41: "F8",
      0x42: "F9",
      0x43: "F10",
      0x44: "F11",
      0x45: "F12",
    };
    return specialKeys[code] ?? null;
  }

  private usageToChar(code: number, shift: boolean): string {
    const base = HID_KEY_CODES[code] ?? "";
    if (!base) return "";
    if (/[a-z]/.test(base)) return shift ? base.toUpperCase() : base;
    return shift ? (SHIFT_MAP[base] ?? base) : base;
  }
}
