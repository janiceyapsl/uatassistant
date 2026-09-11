import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {attachLive} from '../src/live.js';
import {splitResult} from '../public/meeting.js';

test('final transcript splits speaker changes and preserves provider timestamps',()=>{
 const result={type:'Results',is_final:true,start:2,channel:{alternatives:[{transcript:'Hello there.',words:[{word:'Hello',start:2,end:2.2,speaker:0},{punctuated_word:'there.',start:2.3,end:2.6,speaker:1}]}]}};
 assert.deepEqual(splitResult(result),[{speakerId:'0',start:2,end:2.2,text:'Hello'},{speakerId:'1',start:2.3,end:2.6,text:'there.'}]);
 assert.deepEqual(splitResult({...result,is_final:false}),[]);
 assert.equal(splitResult({type:'Results',is_final:true,start:5,duration:1,channel:{alternatives:[{transcript:'Unassigned'}]}})[0].speakerId,'unknown');
});

test('stream proxy relays audio, flushes final results, and rejects foreign origin',async t=>{
 const provider=new WebSocketServer({port:0,host:'127.0.0.1'});await once(provider,'listening');
 const server=http.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 const wss=attachLive(server,{port,key:()=> 'test-only',connect:()=>new WebSocket(`ws://127.0.0.1:${provider.address().port}`)});
 t.after(async()=>{for(const c of wss.clients)c.terminate();for(const c of provider.clients)c.terminate();wss.close();await new Promise(r=>server.close(r));await new Promise(r=>provider.close(r));});
 let audio;
 provider.on('connection',socket=>socket.on('message',(data,binary)=>{
   if(binary)audio=data;
   else if(JSON.parse(data).type==='CloseStream'){
     socket.send(JSON.stringify({type:'Results',is_final:true,start:0,channel:{alternatives:[{transcript:'Final words.'}]}}));socket.close();
   }
 }));
 const client=new WebSocket(`ws://127.0.0.1:${port}/api/live`,{origin:`http://127.0.0.1:${port}`});
 const events=[];client.on('message',data=>events.push(JSON.parse(data)));
 await once(client,'message');assert.equal(events[0].type,'ready');
 client.send(Buffer.from([1,2,3]));client.send(JSON.stringify({type:'stop'}));await once(client,'close');
 assert.deepEqual(audio,Buffer.from([1,2,3]));assert.ok(events.some(e=>e.type==='Results'&&e.is_final));assert.equal(events.at(-1).type,'finished');
 const bad=new WebSocket(`ws://127.0.0.1:${port}/api/live`,{origin:'https://foreign.example'});
 const [error]=await once(bad,'error');assert.match(error.message,/403/);
});

test('missing provider key fails without connecting to a provider',async t=>{
 const server=http.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 const wss=attachLive(server,{port,key:()=>''});t.after(()=>{wss.close();server.close();});
 const client=new WebSocket(`ws://127.0.0.1:${port}/api/live`,{origin:`http://127.0.0.1:${port}`});
 const [error]=await once(client,'error');assert.match(error.message,/503/);
});
