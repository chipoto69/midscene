import { getDebug } from '@midscene/shared/logger';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const debugUtils = getDebug('ios:utils');

export type IOSDeviceInfo = {
  udid: string;
  name: string;
  state?: string;
  isAvailable?: boolean;
};

export async function getConnectedDevices(): Promise<IOSDeviceInfo[]> {
  try {
    // List simulators
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
    const json = JSON.parse(stdout || '{}');
    const devices: IOSDeviceInfo[] = [];
    for (const runtime in json.devices || {}) {
      for (const d of json.devices[runtime] || []) {
        if (d.state === 'Booted') {
          devices.push({ udid: d.udid, name: d.name, state: d.state, isAvailable: d.isAvailable });
        }
      }
    }
    debugUtils(`Found ${devices.length} booted simulators`, devices);
    return devices;
  } catch (error: any) {
    console.error('Failed to get iOS device list:', error);
    throw new Error(
      `Unable to get connected iOS device list. Ensure Xcode command line tools are installed and a Simulator is booted: ${error.message}`,
      { cause: error },
    );
  }
}

