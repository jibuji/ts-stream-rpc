import { DuplexStream } from './types.js';
import WebSocket from 'ws';

export class WebSocketStream implements DuplexStream {
  private messageQueue: Uint8Array[] = [];
  private resolvers: ((data: Uint8Array) => void)[] = [];

  constructor(private ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
			const resolver = this.resolvers.shift();
			if (resolver) {
				resolver(new Uint8Array(data));
			} else {
        this.messageQueue.push(new Uint8Array(data));
      }
    });
  }

  async write(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.send(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async read(): Promise<Uint8Array> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
	}
    
	close(): void {
		this.ws.close();
	}

  async readFull(buf: Uint8Array): Promise<void> {
    let offset = 0;
    
    while (offset < buf.length) {
      // Get the next chunk of data
      const chunk = await this.read();
      
      // Calculate remaining space and bytes to copy
      const remaining = buf.length - offset;
      const bytesToCopy = Math.min(chunk.length, remaining);
      
      // Copy data into the buffer at the current offset
      buf.set(chunk.subarray(0, bytesToCopy), offset);
      offset += bytesToCopy;
      
      // If we have leftover data, put it back in the queue
      if (bytesToCopy < chunk.length) {
        this.messageQueue.unshift(chunk.subarray(bytesToCopy));
      }
    }
  }
}
