export function wav(pcm,rate){const buffer=new ArrayBuffer(44+pcm.length*2),view=new DataView(buffer);const str=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};str(0,'RIFF');view.setUint32(4,36+pcm.length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,pcm.length*2,true);pcm.forEach((v,i)=>view.setInt16(44+i*2,Math.max(-1,Math.min(1,v))*(v<0?32768:32767),true));return new Blob([buffer],{type:'audio/wav'});}
export class MeetingCapture {
  constructor(options){Object.assign(this,options);this.tracks=[];this.queue=Promise.resolve();this.pending=0;this.chunk=0;}
  async start(){try{
    this.onState('Choose the meeting tab and enable Share tab audio');
    this.display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,systemAudio:'include'});this.tracks.push(...this.display.getTracks());
    if(!this.display.getAudioTracks().length)throw Error('No meeting audio shared. Select a browser tab and enable Share tab audio.');
    if(this.includeMic){this.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});this.tracks.push(...this.mic.getTracks());}
    this.context=new AudioContext();await this.context.audioWorklet.addModule('/pcm-worklet.js');await this.context.resume();
    this.node=new AudioWorkletNode(this.context,'chunk-capture');
    this.flushed=new Promise(resolve=>this.resolveFlush=resolve);
    this.node.port.onmessage=({data})=>{if(data.done){this.resolveFlush();return;}this.enqueue(data);};
    this.offset=this.getOffset();
    for(const stream of [this.display,this.mic].filter(Boolean))this.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(this.node);
    this.node.connect(this.context.destination);
    for(const track of this.tracks)track.addEventListener('ended',()=>this.stop(),{once:true});
    if(this.tracks.some(t=>t.readyState==='ended'))throw Error('Audio sharing ended during setup.');
    this.onState('Meeting audio • OpenRouter • 10-second batches');
  }catch(e){this.cleanup();throw e;}}
  enqueue({pcm,offset,sampleRate}){
    const chunk=++this.chunk,start=this.offset+offset/sampleRate;
    if(this.pending>=6){this.onError('Transcription backlog exceeded one minute. Capture stopped; this interval was not transcribed.');this.stop();return;}
    this.pending++;const audio=wav(pcm,sampleRate);
    this.queue=this.queue.then(async()=>{
      const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:audio,signal:AbortSignal.timeout(70000)});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      for(const s of result.segments)this.onSegment({...s,start:start+s.start,end:start+s.end,speakerId:s.speakerId==='unknown'?'unknown':`chunk${chunk}_${s.speakerId}`});
    }).catch(e=>{this.onError(`Audio at ${start.toFixed(1)}s could not be transcribed: ${e.message}. Capture stopped; this interval is missing.`);this.stop();}).finally(()=>this.pending--);
  }
  stop(){if(this.stopping)return this.stopping;this.stopping=this.finish();return this.stopping;}
  async finish(){this.onState('Finishing OpenRouter transcript…');
    this.node?.port.postMessage('flush');
    let timer;await Promise.race([this.flushed,new Promise(resolve=>{timer=setTimeout(()=>{this.onError('Audio flush timed out; the last words may be missing.');resolve();},2000);})]);clearTimeout(timer);
    this.tracks.forEach(t=>t.stop());await this.context?.close();await this.queue;this.cleanup();
  }
  cleanup(){if(this.cleaned)return;this.cleaned=true;this.tracks.forEach(t=>t.stop());this.context?.close().catch(()=>{});this.onInterim('');this.onState('Stopped');}
}
