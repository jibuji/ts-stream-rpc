import { WebSocket } from 'ws';
import { WebSocketStream } from '../../streams/websocket-stream';
import { RpcPeer } from '../../core/framework';
import { calculator } from '../calculator/generated/proto';
import { CalculatorService } from '../calculator/services/calculator';
import { CalculatorWrapper } from '../calculator/generated/calculator-service';

async function main() {
  // Client
  const ws = new WebSocket('ws://localhost:8080');
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  console.log('TypeScript Client: Connected to Go server');
  
  const clientStream = new WebSocketStream(ws);
  const peer = new RpcPeer(clientStream);
  
  // Handle stream errors
  peer.setStreamCloseHandler((error) => {
    console.error('Stream error:', error);
  });

  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await peer.close();
    process.exit(0);
  });

  // Register the Calculator service to handle incoming requests
  peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()));

  try {
    console.log('Making RPC call...');
    const request = calculator.AddRequest.create({ a: 10, b: 5 });
    const requestBytes = calculator.AddRequest.encode(request).finish();
    
    const response = await peer.call<calculator.IAddResponse>(
      'Calculator.Add',
      requestBytes,
      calculator.AddResponse
    );
    
    console.log('10 + 5 =', response.result);
  } catch (error) {
    console.error('RPC call failed:', error);
  }

  // Keep the connection alive to handle incoming requests
  await new Promise(() => {}); // Never resolves
}
main().catch(console.error);
