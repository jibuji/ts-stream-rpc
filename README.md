# ts-stream-rpc

A TypeScript RPC framework that operates over duplex streams with Protocol Buffer support. It provides seamless integration with WebSocket and LibP2P transports.

## Features

- 🚀 Stream-based RPC communication
- 📦 Protocol Buffer support
- 🔌 Multiple transport layers (WebSocket, LibP2P)
- 🛠 Code generation tools for service implementation
- 📝 Type-safe APIs
- ⚡ Async/await support

## Installation

```bash
npm install ts-stream-rpc
```

## Quick Start

### 1. Define Your Protocol

Create a Protocol Buffer definition for your service (e.g., `service.proto`):

```protobuf
syntax = "proto3";

service Calculator {
  rpc Add (AddRequest) returns (AddResponse);
}

message AddRequest {
  int32 a = 1;
  int32 b = 2;
}

message AddResponse {
  int32 result = 1;
}
```

### 2. Generate Service Code

You can generate the TypeScript service code using the provided code generation tool:

```bash
node node_modules/ts-stream-rpc/src/codegen/service-generator.js --proto path/to/service.proto --out generated/calculator-service.ts
```

Note: Make sure to also generate Protocol Buffer code using `protobufjs`.

### 3. Implement the Service

```typescript
import { ICalculator } from './generated/calculator-service';

class CalculatorService implements ICalculator {
  async add(request: AddRequest): Promise<AddResponse> {
    return {
      result: request.a + request.b
    };
  }
}
```

### 4. Create a Server

```typescript
import { RpcPeer } from 'ts-stream-rpc';
import { WebSocket, WebSocketServer } from 'ws';
import { CalculatorService, CalculatorWrapper } from './generated/calculator-service';

const wss = new WebSocketServer({ port: 8080 });
const service = new CalculatorService();
const wrapper = new CalculatorWrapper(service);

wss.on('connection', (ws: WebSocket) => {
  const peer = new RpcPeer();
  
  // Register service methods
  peer.register('Calculator.Add', wrapper.add.bind(wrapper));
  
  // Connect the WebSocket stream
  peer.connect(ws);
});
```

### 5. Create a Client

```typescript
import { RpcPeer } from 'ts-stream-rpc';
import { WebSocket } from 'ws';
import { CalculatorClient } from './generated/calculator-service';

const ws = new WebSocket('ws://localhost:8080');
const peer = new RpcPeer();
const client = new CalculatorClient(peer);

peer.connect(ws);

// Make RPC calls
const result = await client.add({ a: 5, b: 3 });
console.log(result.result); // Output: 8
```

## Transport Layers

### WebSocket

The example above demonstrates WebSocket usage. Simply pass a WebSocket instance to `peer.connect()`.

### LibP2P

ts-stream-rpc also supports LibP2P transport. Here's a basic example:

```typescript
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { RpcPeer } from 'ts-stream-rpc';

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/0']
  },
  transports: [tcp()],
  connectionEncryption: [noise()],
  streamMuxers: [yamux()]
});

const peer = new RpcPeer();
// Connect using LibP2P stream
peer.connect(stream);
```

## Code Generation Tool

The package includes a code generation tool that creates TypeScript interfaces and client code from your Protocol Buffer definitions. The tool is located at `src/codegen/service-generator.js`.

Usage:
```bash
node node_modules/ts-stream-rpc/src/codegen/service-generator.js --proto <proto_file> --out <output_file>
```

Arguments:
- `--proto`: Path to your Protocol Buffer definition file
- `--out`: Output path for the generated TypeScript code

The generated code includes:
- TypeScript interfaces for request/response types
- Service interface definition
- Client implementation
- Service wrapper for server-side implementation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details. 