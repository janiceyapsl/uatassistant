// One uninterrupted WebM/Opus stream preserves decoder state and speaker IDs.
export function splitResult(event) {
  if(event.type!=='Results'||!event.is_final)return [];
  const alternative=event.channel?.alternatives?.[0];
  if(!alternative?.transcript?.trim())return [];
  const groups=[];
  for(const word of alternative.words||[]){
    if(!Number.isFinite(word.start)||!Number.isFinite(word.end))continue;
    const speakerId=word.speaker==null?'unknown':String(word.speaker);
    let group=groups.at(-1);
    if(!group||group.speakerId!==speakerId){group={speakerId,start:word.start,end:word.end,text:''};groups.push(group);}
    group.text+=(group.text?' ':'')+(word.punctuated_word||word.word||'');group.end=word.end;
  }
  return groups.length?groups:[{speakerId:'unknown',start:event.start||0,end:(event.start||0)+(event.duration||0),text:alternative.transcript}];
}

export class MeetingCapture {
  constructor({onSegment,onInterim,onState,onError,getOffset,includeMic=true}){Object.assign(this,{onSegment,onInterim,onState,onError,getOffset,includeMic});this.tracks=[];this.seen=new Set();}
  async start(){
    try{
      if(!navigator.mediaDevices?.getDisplayMedia||!globalThis.MediaRecorder)throw Error('Use Chrome or Edge on desktop for meeting audio capture.');
      if(!MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))throw Error('This browser cannot record WebM/Opus. Use desktop Chrome or Edge.');
      this.onState('Choose the meeting tab and enable Share tab audio');
      this.display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,systemAudio:'include'});
      this.tracks.push(...this.display.getTracks());
      if(!this.display.getAudioTracks().length)throw Error('No meeting audio was shared. Choose a browser tab and check Share tab audio. Window sharing may not include sound.');
      if(this.includeMic){this.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});this.tracks.push(...this.mic.getTracks());}
      this.context=new AudioContext();await this.context.resume();
      const destination=this.context.createMediaStreamDestination();
      for(const stream of [this.display,this.mic].filter(Boolean)){
        const input=new MediaStream(stream.getAudioTracks());
        this.context.createMediaStreamSource(input).connect(destination);
      }
      this.recorder=new MediaRecorder(destination.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:64000});
      this.tracks.push(...destination.stream.getTracks());
      this.onState('Connecting to live transcription…');
      this.ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/live`);
      this.done=new Promise(resolve=>this.resolveDone=resolve);
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Live transcription did not connect. Check Deepgram configuration.')),15000);
        this.ws.onmessage=e=>{
          const event=JSON.parse(e.data);
          if(event.type==='ready'){clearTimeout(timer);resolve();return;}
          if(event.type==='error'){this.failed=true;this.onError(event.message);reject(Error(event.message));this.cleanup();this.resolveDone();return;}
          if(event.type==='finished'){this.finished=true;return;}
          if(event.type==='Results'){
            if(!event.is_final)this.onInterim(event.channel?.alternatives?.[0]?.transcript||'');
            else{this.onInterim('');for(const segment of splitResult(event)){
              const key=JSON.stringify([segment.start,segment.end,segment.speakerId,segment.text]);
              if(!this.seen.has(key)){this.seen.add(key);this.onSegment({...segment,start:this.offset+segment.start,end:this.offset+segment.end});}
            }}
          }
        };
        this.ws.onerror=()=>{clearTimeout(timer);reject(Error('Could not open live transcription. Check the server and API key.'));};
        this.ws.onclose=()=>{
          clearTimeout(timer);reject(Error('Live transcription closed before becoming ready.'));
          if(!this.finished&&!this.failed)this.onError('Live transcription disconnected. The last words may be missing. Start capture again to reconnect.');
          this.cleanup();this.resolveDone();
        };
      });
      this.recorder.ondataavailable=e=>{if(e.data.size&&this.ws.readyState===WebSocket.OPEN){if(this.ws.bufferedAmount>2*1024*1024){this.onError('Network is too slow; capture stopped.');this.stop();return;}this.ws.send(e.data);}};
      this.recorder.onerror=()=>{this.onError('Audio recording failed.');this.stop();};
      this.recorder.onstop=()=>{if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'stop'}));};
      for(const track of this.tracks)track.addEventListener('ended',()=>this.stop(),{once:true});
      if(this.display.getAudioTracks().some(t=>t.readyState==='ended'))throw Error('Meeting audio sharing ended during setup. Start capture again.');
      this.offset=this.getOffset();this.recorder.start(250);
      this.onState('Live meeting audio • transcribing');
    }catch(e){this.cleanup();this.ws?.close();this.resolveDone?.();throw e;}
  }
  async stop(){
    if(this.stopping)return this.done;
    this.stopping=true;this.onState('Finishing live transcript…');
    if(this.recorder?.state==='recording')this.recorder.stop();
    else this.ws?.close();
    this.tracks.forEach(t=>t.stop());
    const timer=setTimeout(()=>{this.onError('Final transcript timed out; the last words may be missing.');this.ws?.close();this.cleanup();this.resolveDone?.();},12000);
    await this.done;clearTimeout(timer);
  }
  cleanup(){if(this.cleaned)return;this.cleaned=true;this.tracks.forEach(t=>t.stop());if(this.recorder?.state==='recording')this.recorder.stop();this.context?.close().catch(()=>{});this.onInterim('');this.onState('Stopped');}
}
