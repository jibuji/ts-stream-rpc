import WebSocket, { WebSocketServer } from 'ws';
import { WebSocketStream } from '../../streams/websocket-stream';
import { RpcPeer } from '../../core/framework';
import { CalculatorService } from '../calculator/services/calculator';
import { calculator } from '../calculator/generated/calculator.proto';
import { CalculatorWrapper } from '../calculator/generated/calculator-service';
async function main() {
  console.log("calculator: ", calculator);
  console.log("WebSocketServer: ", WebSocketServer);
  const wss = new WebSocketServer({ port: 8080 });
  
  // First peer (traditionally "server")
  wss.on('connection', async (ws) => {
    console.log('Peer connected');
    const stream = new WebSocketStream(ws);
    const peer = new RpcPeer(stream);
    
    // Register services this peer provides
    peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()));
    
    // This peer can also make calls to the other peer
    setTimeout(async () => {
      try {
        const request = calculator.MultiplyRequest.create({ a: 6, b: 7 });
        const requestBytes = calculator.MultiplyRequest.encode(request).finish();
        const response = await peer.call<calculator.IMultiplyResponse>(
          'Calculator.Multiply',
          requestBytes,
          calculator.MultiplyResponse
        );
        console.log('Remote calculation: 6 * 7 =', response.result);
      } catch (error) {
        console.error('RPC call failed:', error);
      }
    }, 1000);
  });

  await new Promise(resolve => wss.on('listening', resolve));
  console.log('First peer listening on port 8080');

  // Second peer (traditionally "client")
  const ws = new WebSocket('ws://localhost:8080');
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  
  const stream = new WebSocketStream(ws);
  const peer = new RpcPeer(stream);
  
  // Register services this peer provides
  peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()));

  // Make a call to the other peer
  try {
    const request = calculator.AddRequest.create({ a: 5, b: 3 });
    const requestBytes = calculator.AddRequest.encode(request).finish();
    const response = await peer.call<calculator.IAddResponse>(
      'Calculator.Add',
      requestBytes,
      calculator.AddResponse
    );
    console.log('Remote calculation: 5 + 3 =', response.result);
  } catch (error) {
    console.error('RPC call failed:', error);
  }
}

main().catch(console.error);