const mediasoupClient = require("mediasoup-client");

var socket = io();

let device;
let producerTransport;
let consumerTransport;

let clientconsumers = [];

let params = {
    // mediasoup params
    encodings: [
      {
        rid: 'r0',
        maxBitrate: 100000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
        scalabilityMode: 'S1T3',
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000
    }
  }

window.onload = () => {
    document.getElementById('my-button').onclick = async () => {

   

      const displayMediaOptions = {
        video: {
          cursor: "always"
        },
        audio: false
      };

      //captureStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)

      const stream = await navigator.mediaDevices.getUserMedia({ video: true })

      document.getElementById("video"+ 1).srcObject = stream
      
      const track = stream.getVideoTracks()[0]

  
      params = {
        track,
        ...params
      }
  
      createDevice()
      createTransports()

    }
}

async function createDevice(){

    try
	{
        
  	device = new mediasoupClient.Device();
    
	}
	catch (error)
	{
  		if (error.name === 'UnsupportedError')
    	console.warn('browser not supported');
	}


    socket.emit('getRtpCap',( capabs ) => {

        var capabsobj = {
      // see getRtpCapabilities() below
      routerRtpCapabilities: capabs.rtpcap
    }

        device.load(capabsobj)
        })
}

async function createTransports(){

 

    await socket.emit('makeTransports', { sender: true }, ( params ) => {

    //create producer transport
    console.log("params",params)
   

    producerTransport = device.createSendTransport(params.producerparams)

    console.log("producertransport",producerTransport)

    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {

        try {

          await socket.emit('transport-produce-connect', {
            dtlsParameters,
          })

          callback()
  
        } catch (error) {
          errback(error)
        }
      })
  
      producerTransport.on('produce', async (parameters, callback, errback) => {

        try {
          await socket.emit('transport-produce', {
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            devicertpcap: device.rtpCapabilities,
            appData: parameters.appData,
          }, ({ id }) => {

            callback({ id })
          })
        } catch (error) {
          errback(error)
        }
      })

      
      createProducer()
      
     
 
      //createconsumertransport
      
      consumerTransport = device.createRecvTransport(params.consumerparams)

      consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {

        try {
          await socket.emit('transport-recv-connect', {
            dtlsParameters,
          })
    
          callback()
        } catch (error) {

           errback(error)
        }
      })

      
    })

    

  }

    const createProducer = async () => {

        const producer = await producerTransport.produce(params) 

        producer.on('trackended', () => {
        console.log('track ended')
        })
      
        producer.on('transportclose', () => {
          console.log('transport ended')
        })

    }

 
    
    socket.on("makeconsumer",async(params, callback) => { 


      createConsumer(params.params,params.id)
  
      callback("consumer generated");
  
    }); 
      
      const createConsumer = async (params,consumerid) => {
 
          const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
          })

          clientconsumers.push(consumer)
      
          const { track } = consumer

          var incomingstream = new MediaStream([track])

          console.log("stream",incomingstream)

          console.log("streamid",consumerid)

          document.getElementById("video"+ consumerid).srcObject = incomingstream

          //resumeconsumers
          socket.emit('consumer-resume')
          
        }
       



      

