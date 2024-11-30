import * as protobuf from 'protobufjs';
import { DuplexStream } from '../streams/types.js';

const REQUEST_ID_MSB = 0x80000000;  // Most significant bit mask
const REQUEST_ID_MASK = 0x7fffffff;  // Mask for actual request ID value
const ERROR_RESPONSE_MSB = 0x40000000; // Second most significant bit for error responses

const enum ErrorCode {
  Unknown = 0,
  MethodNotFound = 1,
  InvalidRequest = 2,
  MalformedRequest = 3,
  InvalidMessageFormat = 4,
  InternalError = 5,
}

interface Message {
  requestId: number;
  length: number;
  methodName: string;
  payload: Uint8Array;
}

interface FrameworkError {
  code: ErrorCode;
  message: string;
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
        const isErrorResponse = (message.requestId & ERROR_RESPONSE_MSB) !== 0;
        
        if (isResponse) {
          const originalRequestId = message.requestId & REQUEST_ID_MASK;
          const pending = this.pendingRequests.get(originalRequestId);
          
          if (pending) {
            this.pendingRequests.delete(originalRequestId);
            
            if (isErrorResponse) {
              // Handle framework error response
              const errorCode = new DataView(message.payload.buffer, 0, 4).getUint32(0);
              const errorMessage = new TextDecoder().decode(message.payload.slice(4));
              pending.reject(new Error(`Framework error (${errorCode}): ${errorMessage}`));
            } else {
              try {
                const response = pending.ResponseType.decode(message.payload);
                pending.resolve(response);
              } catch (error: unknown) {
                pending.reject(new Error(`Failed to decode response: ${error instanceof Error ? error.message : String(error)}`));
              }
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
        await this.writeErrorResponse(message.requestId, {
          code: ErrorCode.MethodNotFound,
          message: `Service ${serviceName} not found`
        });
        return;
      }

      const methodNameCamelCase = methodName.charAt(0).toLowerCase() + methodName.slice(1);
      const method = service[methodNameCamelCase];
      
      if (typeof method !== 'function') {
        await this.writeErrorResponse(message.requestId, {
          code: ErrorCode.MethodNotFound,
          message: `Method ${methodName} not found`
        });
        return;
      }

      const response = await method.call(service, message.payload);
      await this.writeResponse(message.requestId, response);
    } catch (error) {
      console.error('Error processing request:', error);
      await this.writeErrorResponse(message.requestId, {
        code: ErrorCode.InternalError,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async readMessage(): Promise<Message> {
    const lengthBuffer = new Uint8Array(4);
    await this.stream.readFull(lengthBuffer);
    const length = new DataView(lengthBuffer.buffer).getUint32(0);
    
    const requestIdBuffer = new Uint8Array(4);
    await this.stream.readFull(requestIdBuffer);
    const requestId = new DataView(requestIdBuffer.buffer).getUint32(0);

    const isResponse = (requestId & REQUEST_ID_MSB) !== 0;
    const isErrorResponse = (requestId & ERROR_RESPONSE_MSB) !== 0;

    let methodName = '';
    let payloadLength = length - 4; // -4 for requestId

    if (isErrorResponse) {
      // Read error code and message
      const errorCodeBuffer = new Uint8Array(4);
      await this.stream.readFull(errorCodeBuffer);
      payloadLength = length - 8; // -8 for requestId and error code
    } else if (!isResponse) {
      // Regular request handling
      const methodLenBuffer = new Uint8Array(1);
      await this.stream.readFull(methodLenBuffer);
      const methodNameLength = methodLenBuffer[0];

      const methodNameBuffer = new Uint8Array(methodNameLength);
      await this.stream.readFull(methodNameBuffer);
      methodName = new TextDecoder().decode(methodNameBuffer);
      
      payloadLength = length - methodNameLength - 5;
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

  private async writeErrorResponse(requestId: number, error: FrameworkError): Promise<void> {
    const responseId = requestId | REQUEST_ID_MSB | ERROR_RESPONSE_MSB;
    const messageBytes = new TextEncoder().encode(error.message);
    const totalLength = 8 + messageBytes.length; // 4 for requestId + 4 for error code + message length

    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, totalLength);
    await this.stream.write(lengthBuffer);

    const responseIdBuffer = new Uint8Array(4);
    new DataView(responseIdBuffer.buffer).setUint32(0, responseId);
    await this.stream.write(responseIdBuffer);

    const errorCodeBuffer = new Uint8Array(4);
    new DataView(errorCodeBuffer.buffer).setUint32(0, error.code);
    await this.stream.write(errorCodeBuffer);

    await this.stream.write(messageBytes);
  }
}