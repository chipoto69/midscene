import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { vlLocateMode } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { IOSDevice } from './device';

const debugAgent = getDebug('ios:agent');

type IOSAgentOpt = AgentOpt;

export class IOSAgent extends PageAgent<IOSDevice> {
  constructor(interfaceInstance: IOSDevice, opts?: IOSAgentOpt) {
    super(interfaceInstance, opts);

    if (!vlLocateMode({ intent: 'grounding' }) || !vlLocateMode({ intent: 'planning' })) {
      throw new Error(
        'iOS Agent only supports vl-model. https://midscenejs.com/choose-a-model.html',
      );
    }
  }

  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }
}

