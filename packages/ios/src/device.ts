import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getTmpFile, sleep } from '@midscene/core/utils';
import {
  type DeviceAction,
  type InterfaceType,
  type Point,
  type Size,
  getMidsceneLocationSchema,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionTapParam,
  defineAction,
  defineActionDragAndDrop,
  defineActionKeyboardPress,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';
import type { ElementInfo } from '@midscene/shared/extractor';
import { createImgBase64ByFormat, resizeAndConvertImgBuffer, imageInfo } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';

const execFileAsync = promisify(execFile);
const debugDevice = getDebug('ios:device');

export type IOSDeviceOpt = {
  udid?: string; // iOS Simulator or Device UDID
};

export class IOSDevice implements AbstractInterface {
  private udid: string;
  private destroyed = false;
  interfaceType: InterfaceType = 'ios';
  uri: string | undefined;
  options?: IOSDeviceOpt;

  constructor(udid: string, opts?: IOSDeviceOpt) {
    assert(udid, 'udid is required for IOSDevice');
    this.udid = udid;
    this.options = opts;
  }

  describe(): string {
    return `iOS(${this.udid})`;
  }

  async connect(): Promise<void> {
    // For simctl we don’t need a persistent connection
    return;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  actionSpace(): DeviceAction<any>[] {
    return [
      defineActionTap(async (param: ActionTapParam) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot tap');
        await this.mouseClick(element.center[0], element.center[1]);
      }),
      defineAction({
        name: 'Input',
        description: 'Input text into the input field',
        interfaceAlias: 'aiInput',
        paramSchema: z.object({
          value: z
            .string()
            .describe(
              'The final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
            ),
          locate: getMidsceneLocationSchema()
            .describe('The input field to be filled')
            .optional(),
        }),
        call: async (param) => {
          const element = param.locate;
          if (element) {
            await this.clearInput(element as unknown as ElementInfo);
            if (!param || !param.value) {
              return;
            }
          }
          await this.keyboardType(param.value);
        },
      }),
      defineActionScroll(async (param) => {
        const element = param.locate;
        const startingPoint = element
          ? { left: element.center[0], top: element.center[1] }
          : undefined;
        if (param?.scrollType === 'untilTop') {
          await this.scrollUp(undefined, startingPoint);
        } else if (param?.scrollType === 'untilBottom') {
          await this.scrollDown(undefined, startingPoint);
        } else if (param?.scrollType === 'untilRight') {
          await this.scrollRight(undefined, startingPoint);
        } else if (param?.scrollType === 'untilLeft') {
          await this.scrollLeft(undefined, startingPoint);
        } else {
          if (param?.direction === 'down' || !param || !param.direction) {
            await this.scrollDown(param?.distance || undefined, startingPoint);
          } else if (param.direction === 'up') {
            await this.scrollUp(param.distance || undefined, startingPoint);
          } else if (param.direction === 'left') {
            await this.scrollLeft(param.distance || undefined, startingPoint);
          } else if (param.direction === 'right') {
            await this.scrollRight(param.distance || undefined, startingPoint);
          } else {
            throw new Error(`Unknown scroll direction: ${param.direction}`);
          }
          await sleep(500);
        }
      }),
      defineActionDragAndDrop(async (param) => {
        const from = param.from;
        const to = param.to;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');
        await this.mouseDrag(
          { x: from.center[0], y: from.center[1] },
          { x: to.center[0], y: to.center[1] },
        );
      }),
      defineActionKeyboardPress(async (param) => {
        const key = param.keyName;
        await this.keyboardPress(key);
      }),
    ];
  }

  async getElementsNodeTree(): Promise<any> {
    // Placeholder: no native tree extraction in this initial iOS support
    return { type: 'Root', children: [] } as any;
  }

  async url(): Promise<string> {
    return '';
  }

  async size(): Promise<Size> {
    // Infer size from raw screenshot buffer
    const buffer = await this.getScreenshotBuffer();
    const info = await imageInfo(buffer);
    return { width: info.width, height: info.height };
  }

  async screenshotBase64(): Promise<string> {
    const pngBuffer = await this.getScreenshotBuffer();
    const { width, height } = await this.size();
    const { buffer, format } = await resizeAndConvertImgBuffer('png', pngBuffer, { width, height });
    return createImgBase64ByFormat(format, buffer.toString('base64'));
  }

  private async getScreenshotBuffer(): Promise<Buffer> {
    const tmpPng = getTmpFile(`midscene-ios-${randomUUID()}.png`);
    assert(tmpPng, 'Temporary directory not available for screenshot');
    const args = ['simctl', 'io', this.udid, 'screenshot', tmpPng];
    await execFileAsync('xcrun', args);
    const fs = await import('node:fs/promises');
    const pngBuffer = await fs.readFile(tmpPng);
    return pngBuffer;
  }

  async mouseClick(x: number, y: number): Promise<void> {
    // Use idb to simulate a tap on Simulator
    await execFileAsync('idb', ['tap', '--udid', this.udid, String(Math.round(x)), String(Math.round(y))]);
  }

  async mouseMove(_x: number, _y: number): Promise<void> {
    return;
  }

  async mouseDrag(from: { x: number; y: number }, to: { x: number; y: number }, durationMs = 800): Promise<void> {
    // Approximate with idb swipe
    await execFileAsync('idb', [
      'swipe',
      '--udid',
      this.udid,
      String(Math.round(from.x)),
      String(Math.round(from.y)),
      String(Math.round(to.x)),
      String(Math.round(to.y)),
      '--duration',
      (Math.max(0, durationMs / 1000)).toFixed(2)
    ]);
  }

  private async scroll(dx: number, dy: number): Promise<void> {
    const { width, height } = await this.size();
    const start = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    const end = { x: start.x + dx, y: start.y + dy };
    await this.mouseDrag(start, end);
  }

  async scrollUp(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: Math.floor(width / 2), y: Math.floor(height * 0.8) };
    const endY = start.y - (distance ?? Math.floor(height * 0.6));
    await this.mouseDrag(start, { x: start.x, y: endY });
  }

  async scrollDown(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: Math.floor(width / 2), y: Math.floor(height * 0.2) };
    const endY = start.y + (distance ?? Math.floor(height * 0.6));
    await this.mouseDrag(start, { x: start.x, y: endY });
  }

  async scrollLeft(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: Math.floor(width * 0.8), y: Math.floor(height / 2) };
    const endX = start.x - (distance ?? Math.floor(width * 0.6));
    await this.mouseDrag(start, { x: endX, y: start.y });
  }

  async scrollRight(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: Math.floor(width * 0.2), y: Math.floor(height / 2) };
    const endX = start.x + (distance ?? Math.floor(width * 0.6));
    await this.mouseDrag(start, { x: endX, y: start.y });
  }

  async keyboardType(text: string): Promise<void> {
    // Send text via idb type
    await execFileAsync('idb', ['type', '--udid', this.udid, text]);
  }

  async keyboardPress(key: string): Promise<void> {
    // Basic mapping for common keys
    const mapping: Record<string, string> = {
      Enter: 'Return',
      Escape: 'Escape',
      Tab: 'Tab',
      Backspace: 'Delete',
    };
    const k = mapping[key] || key;
    await execFileAsync('idb', ['press-key', '--udid', this.udid, k]);
  }

  async clearInput(element: ElementInfo): Promise<void> {
    await this.mouseClick(element.center[0], element.center[1]);
    // Select all then delete
    await execFileAsync('idb', ['press-key', '--udid', this.udid, 'Meta+KeyA']);
    await execFileAsync('idb', ['press-key', '--udid', this.udid, 'Delete']);
  }

  async launch(uri: string): Promise<IOSDevice> {
    // Open a URL via simctl io
    await execFileAsync('xcrun', ['simctl', 'openurl', this.udid, uri]);
    this.uri = uri;
    return this;
  }
}

