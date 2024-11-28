import { Stream } from '@libp2p/interface';
import { DuplexStream } from './types';
import { Uint8ArrayList } from 'uint8arraylist';

export class Libp2pStream implements DuplexStream {
  private messageBuffer: Uint8Array | null = null;
  private writeBuffer: Uint8Array[] = [];
  private writeResolver: (() => void) | null = null;
  private sourceIterator: AsyncIterator<Uint8ArrayList>;
  private closed = false;

  constructor(private stream: Stream) {
    this.sourceIterator = this.stream.source[Symbol.asyncIterator]();
    this.startWriteLoop();
  }

  private async startWriteLoop() {
    try {
      const self = this;
      async function* generateChunks() {
        while (!self.closed) {
          if (self.writeBuffer.length > 0) {
            yield self.writeBuffer.shift()!;
          } else {
            // Wait for next write operation
            await new Promise<void>(resolve => {
              self.writeResolver = resolve;
            });
          }
        }
      }

      await this.stream.sink(generateChunks());
    } catch (error) {
      if (!this.closed) {
        console.error('Write loop error:', error);
      }
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    this.writeBuffer.push(data.slice());
    
    // Signal the write loop that new data is available
    if (this.writeResolver) {
      const resolve = this.writeResolver;
      this.writeResolver = null;
      resolve();
    }
  }

  async readFull(buf: Uint8Array): Promise<void> {
    let offset = 0;
    
    while (offset < buf.length) {
      if (!this.messageBuffer) {
        const result = await this.sourceIterator.next();
        if (result.done) {
          throw new Error('Stream ended unexpectedly');
        }
        this.messageBuffer = result.value.subarray();
      }

      const remaining = buf.length - offset;
      const bytesToCopy = Math.min(this.messageBuffer.length, remaining);
      buf.set(this.messageBuffer.subarray(0, bytesToCopy), offset);
      offset += bytesToCopy;

      if (bytesToCopy < this.messageBuffer.length) {
        this.messageBuffer = this.messageBuffer.subarray(bytesToCopy);
      } else {
        this.messageBuffer = null;
      }
    }
  }

  close(): void {
    this.closed = true;
    this.stream.close();
  }
}