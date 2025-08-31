# @midscene/ios

iOS automation library for Midscene. Provides an `IOSDevice` and `IOSAgent` compatible with the Midscene core abstractions, enabling AI-driven actions on iOS Simulator via Apple simctl and Facebook idb.

## Prerequisites

- Xcode with Command Line Tools
- A booted iOS Simulator
- Facebook idb installed and configured (`brew install idb-companion` and `pipx install fb-idb`)

## Usage

```ts
import { IOSDevice, IOSAgent, getConnectedDevices } from '@midscene/ios';

const devices = await getConnectedDevices();
const udid = devices[0].udid;
const device = new IOSDevice(udid);
await device.connect();

const agent = new IOSAgent(device, {
  aiActionContext: 'If any permission dialog appears, allow it.',
});

await agent.launch('https://example.com');
await agent.aiTap('Click the login button');
```

## Notes

- Initial implementation targets Simulator via simctl and idb. Physical device support would require additional setup.
- Element tree extraction is a placeholder and may be expanded in future versions.