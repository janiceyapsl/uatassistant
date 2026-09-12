import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalizeTranscript,transcribe} from '../src/stt.js';
import {wav,MeetingCapture} from '../public/meeting.js';
test('OpenRouter request uses bearer key, selected model, base64 audio and verbose timing',async()=>{
 let payload;
 const result=await transcribe(Buffer.from('sample'),'audio/wav',{env:{OPENROUTER_API_KEY:'test-key',OPENROUTER_STT_MODEL:'test/model'},request:async(url,options)=>{assert.equal(url,'https://openrouter.ai/api/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer test-key');payload=JSON.parse(options.body);return {ok:true,json:async()=>({text:'A bug',segments:[{text:'A bug',start:1,end:2,speaker:0}]})};}});
 assert.equal(payload.model,'test/model');assert.equal(payload.input_audio.data,Buffer.from('sample').toString('base64'));assert.equal(payload.response_format,'verbose_json');assert.deepEqual(payload.timestamp_granularities,['segment']);assert.equal(result.segments[0].speakerId,'0');
});
test('plain text is explicitly approximate and unattributed',()=>{assert.deepEqual(normalizeTranscript({text:'hello'}),[{text:'hello',start:0,end:0,speakerId:'unknown',timing:'approximate'}]);assert.deepEqual(normalizeTranscript({text:''}),[]);assert.throws(()=>normalizeTranscript({text:'bad',segments:[{text:'bad',start:-1,end:1}]}));});
test('missing key, unsupported format and provider errors fail clearly without leaking provider text',async()=>{
 await assert.rejects(()=>transcribe(Buffer.from('x'),'audio/wav',{env:{}}),/OPENROUTER_API_KEY/);
 await assert.rejects(()=>transcribe(Buffer.from('x'),'text/html',{env:{OPENROUTER_API_KEY:'test'}}),/Use WAV/);
 await assert.rejects(()=>transcribe(Buffer.from('x'),'audio/wav',{env:{OPENROUTER_API_KEY:'test'},request:async()=>({ok:false,status:401})}),/401/);
});
test('WAV packets contain valid mono PCM headers and clipped samples',async()=>{
 const view=new DataView(await wav(new Float32Array([-2,0,2]),48000).arrayBuffer());assert.equal(view.byteLength,50);assert.equal(view.getUint32(24,true),48000);assert.equal(view.getUint32(40,true),6);assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(48,true),32767);
});
test('worklet preserves sample counts across complete chunks and final flush',async()=>{
 let Processor;const messages=[];class Base{constructor(){this.port={postMessage:m=>messages.push(m)};}}
 vm.runInNewContext(await readFile(new URL('../public/pcm-worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor:Base,sampleRate:4,Float32Array,registerProcessor:(_,p)=>Processor=p});
 const p=new Processor();for(let i=0;i<11;i++)p.process([[new Float32Array([1,1,1,1])]]);p.port.onmessage();assert.equal(messages[0].pcm.length,40);assert.equal(messages[1].offset,40);assert.equal(messages[1].pcm.length,4);assert.equal(messages[2].done,true);
});
test('meeting batches keep ordering, time offsets, and separate speaker namespaces',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>({ok:true,json:async()=>({segments:[{start:1,end:2,text:'bug',speakerId:'0',timing:'provider'}]})});
 const segments=[];const capture=new MeetingCapture({onSegment:s=>segments.push(s),onError:assert.fail});capture.offset=100;
 capture.enqueue({pcm:new Float32Array(10),offset:0,sampleRate:1});capture.enqueue({pcm:new Float32Array(10),offset:10,sampleRate:1});await capture.queue;
 assert.deepEqual(segments.map(s=>s.start),[101,111]);assert.notEqual(segments[0].speakerId,segments[1].speakerId);assert.equal(capture.pending,0);
});
