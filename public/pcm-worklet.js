class ChunkCapture extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.length=0;this.offset=0;this.active=true;this.port.onmessage=()=>{this.flush();this.active=false;this.port.postMessage({done:true});};}
  flush(){if(!this.length)return;const pcm=new Float32Array(this.length);let at=0;for(const block of this.samples){pcm.set(block,at);at+=block.length;}this.port.postMessage({pcm,offset:this.offset,sampleRate},[pcm.buffer]);this.offset+=this.length;this.samples=[];this.length=0;}
  process(inputs){const channels=inputs[0];if(!this.active||!channels?.length)return true;const mixed=new Float32Array(channels[0].length);for(const channel of channels)for(let i=0;i<mixed.length;i++)mixed[i]+=channel[i]/channels.length;this.samples.push(mixed);this.length+=mixed.length;if(this.length>=sampleRate*10)this.flush();return true;}
}
registerProcessor('chunk-capture',ChunkCapture);
