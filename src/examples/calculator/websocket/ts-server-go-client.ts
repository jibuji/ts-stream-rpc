import WebSocket, { WebSocketServer } from 'ws';
import { WebSocketStream } from '../../../streams/websocket-stream';
import { RpcPeer } from '../../../core/framework';
import { CalculatorService } from '../services/calculator';
import { CalculatorWrapper } from '../generated/calculator-service';
async function main() {
  const wss = new WebSocketServer({ port: 8080 });
  
  // Server
  wss.on('connection', async (ws) => {
    console.log('TypeScript Server: Client connected');
    const stream = new WebSocketStream(ws);
    const peer = new RpcPeer(stream);
    peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()));
  });

  await new Promise(resolve => wss.on('listening', resolve));
  console.log('TypeScript Server: Listening on port 8080');
}

main().catch(console.error);
