import { Duplex } from 'stream';
import { DuplexStream } from './types.js';

export class NodeStream implements DuplexStream {
  private leftoverChunk: Uint8Array | null = null;

  constructor(private stream: Duplex) {}

  async write(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async read(): Promise<Uint8Array> {
    if (this.leftoverChunk) {
      const chunk = this.leftoverChunk;
      this.leftoverChunk = null;
      return chunk;
    }

    return new Promise((resolve, reject) => {
      this.stream.once('data', (data: Buffer) => {
        resolve(new Uint8Array(data));
      });
      this.stream.once('error', reject);
    });
  }

  close(): void {
    this.stream.destroy();
	}

  async readFull(buf: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < buf.length) {
      const chunk = await this.read();
      const remaining = buf.length - offset;
      const copyLength = Math.min(chunk.length, remaining);
      buf.set(chunk.subarray(0, copyLength), offset);
      offset += copyLength;

      if (copyLength < chunk.length) {
        this.leftoverChunk = chunk.subarray(copyLength);
      }
    }
  }
}
