import * as protobuf from 'protobufjs';
import { DuplexStream } from '../streams/types.js';

const REQUEST_ID_MSB = 0x80000000;  // Most significant bit mask
const REQUEST_ID_MASK = 0x7fffffff;  // Mask for actual request ID value

interface Message {
  requestId: number;
  length: number;
  methodName: string;
  payload: Uint8Array;
}

export class RpcPeer {
  private services: Map<string, any> = new Map();
  private nextRequestId = 1;
  private pendingRequests = new Map<number, {
    resolve: (response: any) => void;
    reject: (error: any) => void;
    ResponseType: any;
  }>();
  private isClosing = false;
  private onStreamClose?: (error: Error) => void;

  constructor(private stream: DuplexStream) {
    this.startMessageHandler();
  }

  setStreamCloseHandler(handler: (error: Error) => void) {
    this.onStreamClose = handler;
  }

  async close() {
    this.isClosing = true;
    
    // Reject all pending requests
    for (const [_, pending] of this.pendingRequests) {
      pending.reject(new Error('Peer is closing'));
    }
    this.pendingRequests.clear();

    // Close the underlying stream if it has a close method
    if ('close' in this.stream) {
      await (this.stream as any).close();
    }
  }

  registerService(name: string, service: any) {
    this.services.set(name, service);
  }

  async call<TResponse>(
    methodName: string,
    request: Uint8Array,
    ResponseType: { decode: (reader: Uint8Array) => TResponse }
  ): Promise<TResponse> {
    const requestId = this.nextRequestId++;
    if (this.nextRequestId > REQUEST_ID_MASK) {
      this.nextRequestId = 1; // Reset to avoid overflow
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, ResponseType });
      this.writeRequest(requestId, methodName, request).catch(reject);
    });
  }

  private async startMessageHandler() {
    while (!this.isClosing) {
      try {
        const message = await this.readMessage();
        const isResponse = (message.requestId & REQUEST_ID_MSB) !== 0;

        if (isResponse) {
          // Handle response
          const originalRequestId = message.requestId & REQUEST_ID_MASK;
          const pending = this.pendingRequests.get(originalRequestId);
          if (pending) {
            this.pendingRequests.delete(originalRequestId);
            try {
              const response = pending.ResponseType.decode(message.payload);
              pending.resolve(response);
            } catch (error) {
              const errorMessage = new TextDecoder().decode(message.payload);
              pending.reject(new Error(errorMessage));
            }
          }
        } else {
          // Handle request
          this.handleRequest(message).catch(console.error);
        }
      } catch (error) {
        if (!this.isClosing) {
          console.error('Error processing message:', error);
          if (this.onStreamClose) {
            this.onStreamClose(error as Error);
          }
        }
        break;
      }
    }
  }

  private async handleRequest(message: Message) {
    try {
      const [serviceName, methodName] = message.methodName.split('.');
      const service = this.services.get(serviceName);
      if (!service) {
        throw new Error(`Service ${serviceName} not found`);
      }

      const methodNameCamelCase = methodName.charAt(0).toLowerCase() + methodName.slice(1);
      const method = service[methodNameCamelCase];
      
      if (typeof method !== 'function') {
        throw new Error(`Method ${methodName} not found`);
      }

      const response = await method.call(service, message.payload);
      await this.writeResponse(message.requestId, response);
    } catch (error) {
      console.error('Error processing request:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorResponse = new TextEncoder().encode(errorMessage);
      await this.writeResponse(message.requestId, errorResponse);
    }
  }

  private async readMessage(): Promise<Message> {
    const lengthBuffer = new Uint8Array(4);
    await this.stream.readFull(lengthBuffer);
    const length = new DataView(lengthBuffer.buffer).getUint32(0);
    const requestIdBuffer = new Uint8Array(4);
    await this.stream.readFull(requestIdBuffer);
    const requestId = new DataView(requestIdBuffer.buffer).getUint32(0);

    let methodName = '';
    let payloadLength = length - 4; // -4 for requestId

    // If it's a request (MSB not set), read method name
    if ((requestId & REQUEST_ID_MSB) === 0) {
      const methodLenBuffer = new Uint8Array(1);
      await this.stream.readFull(methodLenBuffer);
      const methodNameLength = methodLenBuffer[0];

      const methodNameBuffer = new Uint8Array(methodNameLength);
      await this.stream.readFull(methodNameBuffer);
      methodName = new TextDecoder().decode(methodNameBuffer);
      
      payloadLength = length - methodNameLength - 5; // -5 for requestId and method name length
    }

    const payloadBuffer = new Uint8Array(payloadLength);
    await this.stream.readFull(payloadBuffer);

    return {
      requestId,
      length,
      methodName,
      payload: payloadBuffer,
    };
  }

  private async writeRequest(requestId: number, methodName: string, payload: Uint8Array): Promise<void> {
    const methodNameBytes = new TextEncoder().encode(methodName);
    const totalLength = payload.length + methodNameBytes.length + 5; // +5 for requestId and method name length

    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, totalLength);
    await this.stream.write(lengthBuffer);

    const requestIdBuffer = new Uint8Array(4);
    new DataView(requestIdBuffer.buffer).setUint32(0, requestId);
    await this.stream.write(requestIdBuffer);

    await this.stream.write(new Uint8Array([methodNameBytes.length]));
    await this.stream.write(methodNameBytes);
    await this.stream.write(payload);
  }

  private async writeResponse(requestId: number, payload: Uint8Array): Promise<void> {
    const responseId = requestId | REQUEST_ID_MSB;
    const totalLength = payload.length + 4; // +4 for requestId

    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, totalLength);
    await this.stream.write(lengthBuffer);

    const responseIdBuffer = new Uint8Array(4);
    new DataView(responseIdBuffer.buffer).setUint32(0, responseId);
    await this.stream.write(responseIdBuffer);

    await this.stream.write(payload);
  }
}