export function normalizeTranscript(result) {
  if(typeof result?.text!=='string')throw Error('OpenRouter returned an invalid transcript');
  if(Array.isArray(result.segments)&&result.segments.length)return result.segments.map(s=>{
    if(typeof s.text!=='string'||!Number.isFinite(s.start)||s.start<0||!Number.isFinite(s.end)||s.end<s.start)throw Error('Invalid transcript timestamps');
    return {text:s.text,start:s.start,end:s.end,speakerId:s.speaker==null?'unknown':String(s.speaker),timing:'provider'};
  }).filter(s=>s.text.trim());
  return result.text.trim()?[{text:result.text,start:0,end:Number.isFinite(result.duration)?result.duration:0,speakerId:'unknown',timing:'approximate'}]:[];
}
export async function transcribe(audio,contentType,{env=process.env,request=fetch}={}) {
  if(!env.OPENROUTER_API_KEY)throw Error('Set OPENROUTER_API_KEY in .env and restart');
  const formats={'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp3':'mp3','audio/webm':'webm','video/webm':'webm','audio/ogg':'ogg','audio/flac':'flac','audio/x-flac':'flac','audio/mp4':'m4a','audio/aac':'aac'};
  const format=formats[contentType.split(';')[0].trim()];
  if(!format)throw Error('Use WAV, MP3, WebM, OGG, FLAC, M4A or AAC audio');
  if(!audio.length)throw Error('Audio is empty');
  const response_format=env.OPENROUTER_STT_RESPONSE_FORMAT||'verbose_json';
  if(!['json','verbose_json'].includes(response_format))throw Error('STT response format must be json or verbose_json');
  const payload={model:env.OPENROUTER_STT_MODEL||'openai/whisper-large-v3',input_audio:{data:audio.toString('base64'),format},response_format};
  if(response_format==='verbose_json')payload.timestamp_granularities=['segment'];
  if(env.OPENROUTER_STT_PROVIDER_OPTIONS)payload.provider={options:JSON.parse(env.OPENROUTER_STT_PROVIDER_OPTIONS)};
  const response=await request('https://openrouter.ai/api/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});
  if(!response.ok)throw Error(`OpenRouter STT failed (${response.status}). Check key, credits, model and response-format support. No automatic retry was charged.`);
  return {segments:normalizeTranscript(await response.json())};
}
