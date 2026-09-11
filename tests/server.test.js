import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
let server;
before(async()=>{process.env.PORT='3099';({server}=await import('../server.js'));if(!server.listening)await new Promise(r=>server.once('listening',r));});
after(()=>new Promise(r=>server.close(r)));
test('serves app without exposing source configuration',async()=>{assert.equal((await fetch('http://127.0.0.1:3099/')).status,200);assert.equal((await fetch('http://127.0.0.1:3099/.env')).status,404);});
test('rejects foreign origins',async()=>{const r=await fetch('http://127.0.0.1:3099/api/analyze',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'});assert.equal(r.status,403);});
test('detects draft from API and rejects malformed input',async()=>{
 const post=body=>fetch('http://127.0.0.1:3099/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await (await post({mode:'rules',segments:[{id:'1',start:10,speakerId:'a',testCaseId:'t',text:'The approval button is broken.'}]})).json();assert.equal(result.issues[0].status,'New');assert.deepEqual(result.issues[0].evidenceIds,['1']);assert.equal((await post({segments:[{}]})).status,400);
});
