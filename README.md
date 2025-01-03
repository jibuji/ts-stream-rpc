# ts-stream-rpc

A TypeScript RPC framework that operates over duplex streams with Protocol Buffer support. It provides seamless integration with WebSocket and LibP2P transports.

## Features

- 🚀 Stream-based RPC communication
- 📦 Protocol Buffer support
- 🔌 Multiple transport layers (WebSocket, LibP2P)
- 🛠 Code generation tools for service implementation
- 📝 Type-safe APIs
- ⚡ Async/await support
- 🖥️ Easy-to-use CLI tool

## Installation

```bash
npm install ts-stream-rpc
```

## Quick Start

### 1. Define Your Protocol

Create a Protocol Buffer definition for your service (e.g., `service.proto`):

```protobuf
syntax = "proto3";

package myapp;  // Package declaration is mandatory

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

You can generate the TypeScript service code using the CLI tool:

```bash
# Generate code from a single proto file
npx ts-stream-rpc generate path/to/service.proto -o ./generated

# Generate code from a directory containing proto files
npx ts-stream-rpc generate ./proto -o ./generated
```

The CLI tool will:
1. Validate your proto files (ensuring they have package declarations)
2. Generate Protocol Buffer JavaScript and TypeScript definitions
3. Generate service interfaces and client code
4. Create all necessary type definitions

For each proto file, three files will be generated:
- `[name].proto.js` - Protocol Buffer JavaScript code
- `[name].proto.d.ts` - Protocol Buffer TypeScript definitions
- `[name]-service.ts` - Service interfaces and client code

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
import { RpcPeer, WebSocketStream } from 'ts-stream-rpc';
import { WebSocket, WebSocketServer } from 'ws';
import { CalculatorService, CalculatorWrapper } from './generated/calculator-service';

const wss = new WebSocketServer({ port: 8080 });
const service = new CalculatorService();
const wrapper = new CalculatorWrapper(service);

wss.on('connection', (ws: WebSocket) => {
  const stream = new WebSocketStream(ws);
  const peer = new RpcPeer(stream);
  
  // Register service methods
  peer.registerService('Calculator', wrapper);
  
});
```

### 5. Create a Client

```typescript
import { RpcPeer, WebSocketStream } from 'ts-stream-rpc';
import { WebSocket } from 'ws';
import { CalculatorClient } from './generated/calculator-service';

const ws = new WebSocket('ws://localhost:8080');
const stream = new WebSocketStream(ws);
const peer = new RpcPeer(stream);
const client = new CalculatorClient(peer);

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
import { RpcPeer, Libp2pStream } from 'ts-stream-rpc';

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/0']
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()]
});

const stream = new Libp2pStream(node);
const peer = new RpcPeer(stream);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details. 