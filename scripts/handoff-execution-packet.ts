import { readFile } from 'node:fs/promises';
import {
  handoffDeliveryPacket,
  type DeliveryPacketHandoffInput,
} from '../lib/modules/implementation/delivery-packet.ts';

const input = await requestInput<DeliveryPacketHandoffInput>();
process.stdout.write(`${JSON.stringify(await handoffDeliveryPacket(input))}\n`);

async function requestInput<T>() {
  const text = process.argv[2]
    ? await readFile(process.argv[2], 'utf8')
    : await stdin();
  return JSON.parse(text) as T;
}

async function stdin() {
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}
