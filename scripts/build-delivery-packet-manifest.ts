import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildPacketManifest,
  verifyPacket,
  PACKET_SPEC,
  type PacketManifestInput,
} from '../lib/modules/implementation/delivery-packet-manifest.ts';

type Request = PacketManifestInput & { packetDir: string };

const input = await requestInput<Request>();
if (!input?.packetDir)
  throw new Error('A packetDir is required to write the manifest.');
const manifestPath = path.join(input.packetDir, PACKET_SPEC.manifestFile);
await writeFile(
  manifestPath,
  buildPacketManifest(input, PACKET_SPEC, await readdir(input.packetDir)),
  'utf8',
);
process.stdout.write(
  `${JSON.stringify({
    manifestPath,
    verification: await verifyPacket(input.packetDir),
  })}\n`,
);

async function requestInput<T>() {
  const text = process.argv[2]
    ? await readFile(process.argv[2], 'utf8')
    : await stdin();
  return JSON.parse(text) as T;
}

async function stdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}
