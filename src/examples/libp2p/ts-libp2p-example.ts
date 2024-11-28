import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { Libp2pStream } from '../../streams/libp2p-stream';
import { RpcPeer } from '../../core/framework';
import { CalculatorService } from '../calculator/services/calculator';
import { calculator } from '../calculator/generated/proto';
import { Stream } from '@libp2p/interface';
import { CalculatorClient, CalculatorWrapper } from '../calculator/generated/calculator-service';

async function main() {
  // Create first peer (server)
  const server = await createLibp2p({
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/8080']
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()]
  });

  await server.start();
  console.log('Server peer started with addresses:', server.getMultiaddrs());

  // Handle incoming streams
  server.handle('/calculator/1.0.0', async ({ stream }) => {
    console.log('New stream connection');
    const libp2pStream = new Libp2pStream(stream);
    const peer = new RpcPeer(libp2pStream);
    
    peer.setStreamCloseHandler((error) => {
      console.error('Stream closed with error:', error);
      libp2pStream.close();
    });
    
    peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()));
  });


  // Create second peer (client)
  const client = await createLibp2p({
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()]
  });

  await client.start();

  // Connect to server
  const serverMultiaddr = server.getMultiaddrs()[0];
  await client.dial(serverMultiaddr);

  // Create stream
  const stream = await client.dialProtocol(serverMultiaddr, '/calculator/1.0.0');
  const libp2pStream = new Libp2pStream(stream as unknown as Stream);
  const peer = new RpcPeer(libp2pStream);

  // await new Promise((resolve) => {
  //   setTimeout(resolve, 50*1000)
  // })
  // Make RPC call
  try {
    const request = calculator.AddRequest.create({ a: 10, b: 5 });
    const requestBytes = calculator.AddRequest.encode(request).finish();
    const responseBytes = await peer.call<calculator.IAddResponse>('Calculator.Add', requestBytes, calculator.AddResponse);
    console.log('10 + 5 =', responseBytes.result);

    
    const calculatorClient = new CalculatorClient(peer);
    const response = await calculatorClient.add({ a: 10, b: 1 });
    console.log('10 + 5 =', response.result);
  } catch (error) {
    console.error('RPC call failed:', error);
  }
  try {
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

  console.log("done")
  // await sleep for 5s
  await new Promise((resolve) => {
    setTimeout(resolve, 5*1000)
  })
  // Cleanup
  await client.stop();
  await server.stop();
}

main().catch(console.error); 