import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { Libp2pStream } from '../../streams/libp2p-stream'
import { RpcPeer } from '../../core/framework'
import { CalculatorService } from '../calculator/services/calculator'
import { calculator } from '../calculator/generated/proto'
import { CalculatorClient, CalculatorWrapper } from '../calculator/generated/calculator-service'

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/8080/ws']
    },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
  })

  await node.start()
  console.log('LibP2P node started')
  console.log('Listening on:', node.getMultiaddrs())

  // Handle incoming connections
  node.handle('/calculator/1.0.0', async ({ stream }) => {
    console.log('New connection received')
    const libp2pStream = new Libp2pStream(stream)
    const peer = new RpcPeer(libp2pStream)
    
    // Register local service
    peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()))
    const calculatorClient = new CalculatorClient(peer)
    // Start periodic requests to client
    const interval = setInterval(async () => {
      try {
        const request = { 
          a: Math.floor(Math.random() * 100), 
          b: Math.floor(Math.random() * 100) 
        }
        const response = await calculatorClient.add(request)
        
        console.log(`Server requested: ${request.a} + ${request.b} = ${response.result}`)
      } catch (error) {
        console.error('Error making RPC call:', error)
      }
    }, 5000) // Every 5 seconds

    peer.setStreamCloseHandler((error) => {
      clearInterval(interval)
      peer.close()
    })
  })

  process.on('SIGINT', async () => {
    console.log('Shutting down...')
    await node.stop()
    process.exit(0)
  })
}

main().catch(console.error) 