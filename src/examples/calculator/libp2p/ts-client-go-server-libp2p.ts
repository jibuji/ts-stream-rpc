import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { multiaddr } from '@multiformats/multiaddr'
import { Libp2pStream } from 'ts-stream-rpc'
import { RpcPeer } from 'ts-stream-rpc'
import { CalculatorService } from '../services/calculator'
import { CalculatorClient, CalculatorWrapper } from '../generated/calculator-service'

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2)
  const peerIndex = args.indexOf('-peer')
  const peerAddr = peerIndex !== -1 ? args[peerIndex + 1] : null

  const node = await createLibp2p({
    addresses: {
      // If no peer address is provided, act as a server
      listen: peerAddr ? [] : ['/ip4/127.0.0.1/tcp/8080/ws']
    },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()]
  })

  await node.start()
  console.log('LibP2P node started')

  if (peerAddr) {
    // Client mode
    try {
      const serverAddr = multiaddr(peerAddr)
      console.log('Connecting to peer:', serverAddr.toString())
      const connection = await node.dial(serverAddr)
      console.log('Connected to peer')

      const stream = await connection.newStream('/calculator/1.0.0')
      const libp2pStream = new Libp2pStream(stream)
      const peer = new RpcPeer(libp2pStream)

      // Register local service to handle peer requests
      peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()))
      const calculatorClient = new CalculatorClient(peer)
      // Start periodic requests to peer
      const interval = setInterval(async () => {
        try {
          const requestParams = {a: 1, b: 2}
          const response = await calculatorClient.add(requestParams)
          
          console.log(`Client requested: ${requestParams.a} + ${requestParams.b} = ${response.result}`)

          const requestParams2 = {a: 3, b: 4}
          const response2 = await calculatorClient.multiply(requestParams2)
          
          console.log(`Client requested: ${requestParams2.a} * ${requestParams2.b} = ${response2.result}`)
        } catch (error) {
          console.error('Error making RPC call:', error)
        }
      }, 5000)

      peer.setStreamCloseHandler((error) => {
        clearInterval(interval)
        peer.close()
        process.exit(1)
      })

      process.on('SIGINT', async () => {
        console.log('Shutting down...')
        clearInterval(interval)
        await peer.close()
        await node.stop()
        process.exit(0)
      })

      await new Promise(() => {})
    } catch (error) {
      console.error('Error:', error)
      await node.stop()
    }
  } else {
    // Server mode
    console.log('Listening on:', node.getMultiaddrs())

    node.handle('/calculator/1.0.0', async ({ stream }) => {
      console.log('New connection received')
      const libp2pStream = new Libp2pStream(stream)
      const peer = new RpcPeer(libp2pStream)
      
      peer.registerService('Calculator', new CalculatorWrapper(new CalculatorService()))
      const calculatorClient = new CalculatorClient(peer)
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
      }, 5000)

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
}

main().catch(console.error) 