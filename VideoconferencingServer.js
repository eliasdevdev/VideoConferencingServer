const https = require('https');
var fs = require('fs');

const express = require('express');

const app = express();
app.use(express.static('Public'));


const options = {
	key: fs.readFileSync('server/ssl/key.pem', 'utf-8'),
	cert: fs.readFileSync('server/ssl/cert.pem', 'utf-8')
  }
  
const httpsServer = https.createServer(options, app)

httpsServer.listen(5000, () => {
	console.log('listening on port: ' + 5000)
  })


const { Server } = require("socket.io");
const io = new Server(httpsServer)

const mediasoup = require("mediasoup");
 

  const mediaCodecs =
  [
	{
	  kind        : "audio",
	  mimeType    : "audio/opus",
	  clockRate   : 48000,
	  channels    : 2
	},
	{
	  kind       : "video",
	  mimeType   : "video/H264",
	  clockRate  : 90000,
	  parameters :
	  {
		"packetization-mode"      : 1,
		"profile-level-id"        : "42e01f",
		"level-asymmetry-allowed" : 1
	  }
	}
  ];	


	let worker
	let router
	let rtpcap
	let clients = []

 async function initsetup(){
	worker = await mediasoup.createWorker({
        rtcMinPort: 2000,
        rtcMaxPort: 2020,
      })
	
	worker.on('died', error => {
	  console.error('mediasoup worker has died')
	  setTimeout(() => process.exit(1), 2000) // exit in 2 seconds
	})

	router = await worker.createRouter({mediaCodecs,});
	rtpcap = router.rtpCapabilities
  }

  initsetup()

let count = 0

io.on('connection', async(socket) => {

	count++
	
	let curismaster

	if(count == 1){
		curismaster = true
	}
	else{
		curismaster = false
	}


	curclient = {socket: socket , peerid: count, devicertpCapabilities: null, transports: {producertransport: null, consumertransport: null}, producer: null, consumers: [], ismaster: curismaster}


	socket.on("disconnect", () => {

		console.log("socket disconnected")
		count--
		curindex = clients.indexOf(clients.find(el => el.socket == socket))

		if(curindex !== undefined){
			clients.splice(curindex,1)
		}

	  });


	socket.on('getRtpCap',(callback) => {

		callback({rtpcap})

	})

	socket.on('makeTransports', async({sender}, callback) => {

			producertransport = await createTransport()
			curclient.transports.producertransport = producertransport

			consumertransport = await createTransport()
			curclient.transports.consumertransport = consumertransport
			
			let producerparams = {
				id: producertransport.id,
				iceParameters: producertransport.iceParameters,
				iceCandidates: producertransport.iceCandidates,
				dtlsParameters: producertransport.dtlsParameters,
		  	}

			  let consumerparams = {
				id: consumertransport.id,
				iceParameters: consumertransport.iceParameters,
				iceCandidates: consumertransport.iceCandidates,
				dtlsParameters: consumertransport.dtlsParameters,
		  	}

			params = {
				producerparams: producerparams,
				consumerparams: consumerparams
			}


			clients.push(curclient)



			callback(params)	

	})

    socket.on('transport-produce-connect', async ({ dtlsParameters }) => {

		socketproducertransport = clients.find(el => el.socket == socket).transports.producertransport

    	await socketproducertransport.connect({ dtlsParameters })
  	})

	  socket.on('transport-recv-connect', async ({ dtlsParameters }) => {

		socketconsumertransport = clients.find(el => el.socket == socket).transports.consumertransport

    	await socketconsumertransport.connect({ dtlsParameters })
  	})
  
  	socket.on('transport-produce', async ({ kind, rtpParameters,devicertpcap, appData }, callback) => {

		curpeer = clients.find(el => el.socket == socket)


    	curproducer = await createProducer(curpeer.transports.producertransport, {
			kind,
			rtpParameters,
		  })

		  curpeer.producer = curproducer

		curpeer.devicertpCapabilities = devicertpcap

		await consume()

		callback({
			id: curproducer.id
		  })
		 
  	})

  	consume = async () => {

		let masterid = (clients.find(el => el.ismaster)).peerid

		if(curismaster){

			for (let i = 1; i <= clients.length; i++){
				if(i != masterid){
					connectpeers(i,masterid)
				}
			}	
		}

		else{

			console.log("connectpeers",count,masterid)
			console.log("clients",clients)

			connectpeers(count,masterid)
		}

  	}


	  socket.on('consumer-resume', async () => {
		socketel = clients.find(el => el.socket == socket)

		consumerssocket = socketel.consumers

		for(let i = 0;i < consumerssocket.length;i++){
			await consumerssocket[i].resume()

		}

	  }) 


})

//Generalfunctions

async function createTransport(){

	let transport
	
    try {

	    transport = await router.createWebRtcTransport(

		{
		  listenIps    : [ { ip: "127.0.0.1", announcedIp: "127.0.0.1" } ],
		  enableUdp    : true,
		  enableTcp    : true,
		  preferUdp    : true
		});

		transport.on('dtlsstatechange', dtlsState => {


			if (dtlsState === 'closed') {
			  transport.close()
			}
		  })
	  
		  transport.on('close', () => {

			console.log('transport closed')
		  })
	

	} catch (error) {
		console.log(error)
		callback({
		  params: {
			error: error
		  }
		})
	  }

	  return transport

}

async function createProducer(transport, {kind,rtpParameters}){

	let producer = await transport.produce({
		kind,
		rtpParameters,
	  })
  
	  producer.on('transportclose', () => {
	
		producer.close()
	  })

	return producer

}

async function createConsumer(transport,producer,rtpCapabilities){

	let consumer
	
	if (router.canConsume({
		  producerId: producer.id,
		  rtpCapabilities
	})) 
	{
		consumer = await transport.consume({
		producerId: producer.id,
		rtpCapabilities,
		paused: true,
	})
  
		consumer.on('transportclose', () => {
	
	})
  
		consumer.on('producerclose', () => {
	
	})
		
	}

	//make consumer on client side
	return consumer

}

async function connectpeers(peerid1, peerid2){

	try{

	peer1 = clients.find(el => el.peerid == peerid1)
	peer2 = clients.find(el => el.peerid == peerid2)

	peer1producer = peer1.producer
	peer2producer = peer2.producer

	consumertransportpeer1 = peer1.transports.consumertransport
	consumertransportpeer2 = peer2.transports.consumertransport

	//console.log("transportstest", consumertransportpeer1,consumertransportpeer2,"ids",consumertransportpeer1.id,consumertransportpeer2.id)

	peer1rtpcap = peer1.devicertpCapabilities
	peer2rtpcap = peer2.devicertpCapabilities

	consumerpeer1 = await createConsumer(consumertransportpeer1,peer2producer,peer1rtpcap)
	consumerpeer2 = await createConsumer(consumertransportpeer2,peer1producer,peer2rtpcap)

	const consumerpeer1params = {
		id: consumerpeer1.id,
		producerId: peer2producer.id,
		kind: consumerpeer1.kind,
		rtpParameters: consumerpeer1.rtpParameters,
		}

	const consumerpeer2params = {
		id: consumerpeer2.id,
		producerId: peer1producer.id,
		kind: consumerpeer2.kind,
		rtpParameters: consumerpeer2.rtpParameters,
		}	

	//console.log("parameterstest", consumerpeer1params, consumerpeer2params)	

	const consumerpeer1paramsandid = {params: consumerpeer1params, id: peerid2}
	const consumerpeer2paramsandid = {params: consumerpeer2params, id: peerid1}
	
	peer1.socket.emit("makeconsumer",consumerpeer1paramsandid,(message) => {} )
	peer1.consumers.push(consumerpeer1)

	peer2.socket.emit("makeconsumer",consumerpeer2paramsandid,(message) => {} )
	peer2.consumers.push(consumerpeer2)

	}
	catch{
		console.log("error connecting peers")
	}
}