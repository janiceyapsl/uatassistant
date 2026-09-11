import {WebSocket, WebSocketServer} from 'ws';

// The provider key and provider URL never come from browser input.
export function attachLive(server, {port, key=()=>process.env.DEEPGRAM_API_KEY,
  connect=()=>new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-3&diarize_model=v1&interim_results=true&smart_format=true&endpointing=500',
    {headers:{Authorization:`Token ${key()}`},handshakeTimeout:10000})}={}) {
  const wss=new WebSocketServer({noServer:true,maxPayload:1024*1024});
  server.on('upgrade',(req,socket,head)=>{
    const origin=`http://${req.headers.host}`;
    if(req.url!=='/api/live'||!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||req.headers.origin!==origin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    if(!key()){socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');return;}
    if(wss.clients.size>=2){socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,client=>wss.emit('connection',client));
  });
  wss.on('connection',client=>{
    let upstream,draining=false,timer,keepAlive;
    const send=value=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(value));};
    const fail=message=>{send({type:'error',message});client.close(1011,'Transcription stopped');};
    try{upstream=connect();}catch{fail('Could not connect to transcription provider.');return;}
    timer=setTimeout(()=>fail('Transcription connection timed out.'),12000);
    upstream.on('open',()=>{
      clearTimeout(timer);
      if(client.readyState!==WebSocket.OPEN){upstream.close();return;}
      send({type:'ready'});
      keepAlive=setInterval(()=>{if(upstream.readyState===WebSocket.OPEN&&!draining)upstream.send(JSON.stringify({type:'KeepAlive'}));},4000);
    });
    upstream.on('message',data=>{
      try{const event=JSON.parse(data.toString());
        if(event.type==='Results')send(event);
        if(event.type==='Error')fail('Transcription provider rejected the stream. Check the server API key and account.');
      }catch{fail('Invalid response from transcription provider.');}
    });
    upstream.on('error',()=>fail('Transcription provider connection failed. Check the API key, account and network.'));
    upstream.on('close',()=>{clearInterval(keepAlive);clearTimeout(timer);send({type:draining?'finished':'error',message:'Transcription connection closed. Start capture again to reconnect.'});client.close();});
    client.on('message',(data,binary)=>{
      if(draining)return;
      if(upstream.readyState!==WebSocket.OPEN){fail('Audio arrived before the provider was ready.');return;}
      if(binary){
        if(upstream.bufferedAmount>2*1024*1024){fail('Connection too slow. Capture stopped to avoid losing audio silently.');return;}
        upstream.send(data,{binary:true});
      }else{
        try{if(JSON.parse(data.toString()).type!=='stop')throw Error();}catch{fail('Invalid streaming control message.');return;}
        draining=true;clearInterval(keepAlive);
        upstream.send(JSON.stringify({type:'CloseStream'}));
        timer=setTimeout(()=>fail('Final transcript flush timed out; the last words may be missing.'),10000);
      }
    });
    client.on('error',()=>client.terminate());
    client.on('close',()=>{clearTimeout(timer);clearInterval(keepAlive);if(upstream.readyState===WebSocket.CONNECTING)upstream.terminate();else if(upstream.readyState===WebSocket.OPEN)upstream.close();});
  });
  return wss;
}
