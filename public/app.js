import {createSession,uid,time,nearestIssue,mergeIssues,report,classifications,statuses} from '/domain.js';
import {MeetingCapture} from '/meeting.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=createSession(),db,recognition,listening=false,reviewId,config={},queue=Promise.resolve(),busy=0;
let meeting=null,meetingBusy=false;
const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').classList.toggle('error',error);};
const elapsed=()=>Math.max(0,((session.endTime||Date.now())-session.startTime)/1000);
async function api(path,body,headers={'Content-Type':'application/json'}){const r=await fetch(path,{method:'POST',headers,body:headers['Content-Type']==='application/json'?JSON.stringify(body):body});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
function save(){if(!db)return;const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(session,'current');tx.onerror=()=>notice('Could not save locally. Export a JSON backup now.',true);}
function options(values,selected){return values.map(v=>{const [value,label]=Array.isArray(v)?v:[v,v];return `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;}).join('');}
function render(){
  $('project').value=session.project;
  $('case-count').textContent=session.testCases.length;
  $('cases').innerHTML=session.testCases.map(t=>`<div class="case ${t.id===session.activeTestCase?'active':''}"><button data-case="${t.id}">${t.id===session.activeTestCase?'●':'○'} &nbsp;${esc(t.title)}</button><button class="check" data-check="${t.id}" title="Toggle completed">${t.status==='Completed'?'✓':'□'}</button></div>`).join('')||'<p class="muted">Add your first workflow below.</p>';
  const speaker=$('speaker').value;
  $('speaker').innerHTML=options(Object.entries(session.participants),speaker);
  $('participants').innerHTML=Object.entries(session.participants).map(([id,name])=>`<label><span title="${esc(id)}">${esc(id)}</span><input data-person="${esc(id)}" aria-label="Name for ${esc(id)}" value="${esc(name)}"></label>`).join('');
  $('segment-count').textContent=`${session.transcript.length} segments`;
  $('transcript').innerHTML=session.transcript.map(s=>`<article class="segment" id="seg-${esc(s.id)}"><div class="avatar">${esc((session.participants[s.speakerId]||'?').slice(0,2).toUpperCase())}</div><div><strong>${esc(session.participants[s.speakerId]||s.speakerId)}</strong><time>${time(s.start)}</time><p>${esc(s.text)}</p><small>${esc(session.testCases.find(t=>t.id===s.testCaseId)?.title||'No test case')} · ${esc(s.source||'Imported')}</small></div></article>`).join('')||'<div class="empty"><b>A clear record starts here.</b>Your conversation will appear as<br>timestamped, attributed segments.</div>';
  $('transcript').scrollTop=$('transcript').scrollHeight;
  $('issue-count').textContent=session.issues.length;
  const active=session.issues.filter(i=>!['Rejected','Duplicate'].includes(i.status));
  $('stats').innerHTML=`<span><b>${active.filter(i=>i.classification==='BUG').length}</b>Bugs</span><span><b>${active.filter(i=>i.classification==='ENHANCEMENT').length}</b>Enhancements</span><span><b>${active.filter(i=>i.status==='New').length}</b>Awaiting review</span>`;
  $('issues').innerHTML=session.issues.filter(i=>!$('filter').value||i.classification===$('filter').value).map(i=>`<article class="issue"><div class="issue-top"><span class="badge ${esc(i.classification)}">${esc(i.classification)}</span><span>${time(i.timestamp)}</span><span class="status">${esc(i.status)}</span></div><h3>${esc(i.title)}</h3><p>${esc(session.testCases.find(t=>t.id===i.testCaseId)?.title||'Unassigned test case')} · ${esc(i.priority)}</p><div class="issue-footer"><span>${esc(session.participants[i.reportedBy]||i.reportedBy)} · ${i.evidenceIds.length} evidence</span><button data-review="${i.id}">Review ↗</button></div></article>`).join('')||'<div class="empty"><b>Nothing lost in the discussion.</b>Detected bugs and enhancements will<br>arrive here, ready for your review.</div>';
  $('shots').innerHTML=session.screenshots.map(s=>`<div class="shot"><a href="${esc(s.data)}" download="${esc(s.name)}"><img src="${esc(s.data)}" alt="${esc(s.name)}"></a><input data-shot-time="${s.id}" type="number" min="0" step="0.1" value="${s.timestamp}" aria-label="Screenshot seconds"><select data-shot-link="${s.id}" aria-label="Associated issue">${options([['','Unassigned'],...session.issues.map(i=>[i.id,i.title])],s.issueId||'')}</select><button data-shot-delete="${s.id}">Remove</button></div>`).join('')||'<p class="muted">Images within 30 seconds of an issue are suggested automatically.</p>';
  $('state').textContent=listening?'Listening to microphone':session.endTime?'Session ended':'Session workspace';
}
function matchScreenshots(){for(const s of session.screenshots)if(!s.manual&&!s.issueId)s.issueId=nearestIssue(session.issues,s.timestamp);}
function analyze(segments){
  const sessionId=session.id,mode=$('mode').value;
  busy++;
  queue=queue.then(async()=>{
    if(session.id!==sessionId)return;
    notice('Analyzing transcript evidence…');
    const result=await api('/api/analyze',{segments,mode,testCases:session.testCases,activeTestCase:session.activeTestCase,existingIssues:session.issues.slice(-200)});
    if(session.id!==sessionId)return;
    let count=0;
    for(const i of result.issues){if(session.issues.some(old=>old.classification===i.classification&&((mode!=='openrouter'&&old.evidenceIds.at(-1)===i.evidenceIds.at(-1))||(old.title===i.title&&i.evidenceIds.every(id=>old.evidenceIds.includes(id))))))continue;session.issues.push(i);count++;}
    matchScreenshots();save();render();notice(`${count} new draft${count===1?'':'s'} detected. Review and confirm the evidence.`);
  }).catch(e=>notice(`Analysis failed: ${e.message}. Transcript retained; retry Analyze transcript.`,true)).finally(()=>busy--);
  return queue;
}
function addSegment(text,start=elapsed(),speakerId=$('speaker').value||'unknown',extra={}){
  if(!text.trim())return;
  const s={id:uid(),start,end:start,speakerId,text:text.trim(),testCaseId:session.activeTestCase,source:'Manual',...extra};
  session.transcript.push(s);session.transcript.sort((a,b)=>a.start-b.start);save();render();
  if($('mode').value==='openrouter'&&!$('live-ai').checked)return;
  const index=session.transcript.indexOf(s);analyze(session.transcript.slice(Math.max(0,index-11),index+1));
}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function stopMic(){const wasListening=listening, current=recognition;listening=false;const stopped=new Promise(resolve=>{if(!wasListening||!current)return resolve();const timer=setTimeout(()=>{current.abort();resolve();},3000);current.addEventListener('end',()=>{clearTimeout(timer);resolve();},{once:true});current.stop();});$('mic').textContent='● Start microphone';$('dot').classList.remove('live');render();return stopped;}
$('mic').onclick=()=>{
  if(meeting||meetingBusy){notice('Stop meeting capture before starting microphone-only mode.',true);return;}
  if(listening){stopMic();return;}
  if(session.endTime){notice('Create a new session to record again.',true);return;}
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){notice('Speech recognition is unavailable in this browser. Try Chrome/Edge or import a recording/transcript.',true);return;}
  if(!confirm('Start microphone transcription? Your browser may send audio to its speech service. Confirm participant consent before recording. This mode does not capture meeting audio directly or identify speakers automatically.'))return;
  recognition=new Speech();recognition.continuous=true;recognition.interimResults=true;recognition.lang='en-US';
  const recordingSessionId=session.id;
  let speechStart=elapsed();recognition.onspeechstart=()=>speechStart=elapsed();
  recognition.onresult=e=>{if(session.id!==recordingSessionId)return;let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal){addSegment(e.results[i][0].transcript,speechStart,$('speaker').value,{source:'Browser speech · approximate time'});speechStart=elapsed();}else interim+=e.results[i][0].transcript;}$('interim').textContent=interim;};
  recognition.onerror=e=>{notice(`Microphone transcription: ${e.error}. You can import a transcript instead.`,true);if(e.error!=='no-speech')stopMic();};
  recognition.onend=()=>{if(listening){try{recognition.start();}catch{stopMic();}}};
  try{recognition.start();listening=true;$('mic').textContent='■ Stop microphone';$('dot').classList.add('live');render();notice('Microphone active. Select the current speaker manually; timestamps are approximate.');}catch(e){notice(e.message,true);}
};
function meetingState(text){
  $('meeting-status').textContent=text;
  const active=text!=='Stopped';
  $('meeting').textContent=active?'■ Stop meeting capture':'● Capture meeting audio';
  $('dot').classList.toggle('live',active||listening);
  for(const id of ['new','demo','import','audio','include-mic'])$(id).disabled=active;
  if(!active){meeting=null;meetingBusy=false;}
}
$('meeting').onclick=async()=>{
  if(meetingBusy)return;
  if(meeting){await meeting.stop();return;}
  if(listening)return notice('Stop microphone-only mode first.',true);
  if(session.endTime)return notice('Create a new session before capturing a meeting.',true);
  if(!config.audio)return notice('Live meeting capture needs OPENROUTER_API_KEY in the local .env file. Set it and restart the server, then reload. Do not paste your key into the chat.',true);
  if(!confirm('Stream shared meeting audio'+($('include-mic').checked?' and your microphone':'')+' to OpenRouter for transcription? Confirm recording consent. Choose the meeting tab and enable Share tab audio. Screen video stays on your device.'))return;
  meetingBusy=true;
  const sessionId=session.id,namespace='live_'+uid().slice(0,8);
  const capture=new MeetingCapture({includeMic:$('include-mic').checked,getOffset:elapsed,
    onState:meetingState,onError:message=>notice(message,true),onInterim:text=>$('interim').textContent=text,
    onSegment:s=>{if(session.id!==sessionId)return;const speakerId=namespace+'_'+s.speakerId;session.participants[speakerId]??=s.speakerId==='unknown'?'Unknown live speaker':`Unmapped ${s.speakerId}`;addSegment(s.text,s.start,speakerId,{end:s.end,source:'Meeting audio · OpenRouter · '+s.timing+' timing'});}
  });
  meeting=capture;
  try{await capture.start();notice('Meeting audio is sent to OpenRouter in 10-second batches. Use headphones. Speaker labels are local to each batch and require review.');}
  catch(e){notice(e.message,true);}
  finally{meetingBusy=false;}
};
$('project').onchange=()=>{session.project=$('project').value.trim()||'Untitled UAT';save();};
$('case-form').onsubmit=e=>{e.preventDefault();const t={id:uid(),title:$('case-name').value.trim(),status:'Pending'};if(!t.title)return;session.testCases.push(t);session.activeTestCase=t.id;$('case-name').value='';save();render();};
$('cases').onclick=e=>{if(e.target.dataset.case)session.activeTestCase=e.target.dataset.case;if(e.target.dataset.check){const t=session.testCases.find(t=>t.id===e.target.dataset.check);t.status=t.status==='Completed'?'Pending':'Completed';}save();render();};
$('participants').onchange=e=>{if(e.target.dataset.person){session.participants[e.target.dataset.person]=e.target.value.trim()||e.target.dataset.person;save();render();}};
$('add-person').onclick=()=>{const name=prompt('Participant name');if(!name?.trim())return;const id='speaker_'+uid().slice(0,8);session.participants[id]=name.trim();save();render();$('speaker').value=id;};
$('segment-form').onsubmit=e=>{e.preventDefault();addSegment($('text').value,$('offset').value===''?elapsed():Number($('offset').value));$('text').value='';$('offset').value='';};
$('filter').onchange=render;
$('analyze').onclick=async()=>{if(!session.transcript.length)return notice('Add or import transcript segments first.');$('analyze').disabled=true;try{for(let i=0;i<session.transcript.length;i+=50)await analyze(session.transcript.slice(Math.max(0,i-5),i+50));}finally{$('analyze').disabled=false;}};
function review(id){
  reviewId=id;const i=session.issues.find(i=>i.id===id);
  const field=(key,label,type='text',values)=>`<label class="${['title','description','expectedBehaviour','actualBehaviour'].includes(key)?'wide':''}">${label}${values?`<select name="${key}">${options(values,i[key])}</select>`:type==='textarea'?`<textarea name="${key}">${esc(i[key])}</textarea>`:`<input name="${key}" value="${esc(i[key])}">`}</label>`;
  $('fields').innerHTML=field('title','Title')+field('classification','Classification','',classifications)+field('status','Review status','',statuses)+field('description','Description','textarea')+field('expectedBehaviour','Expected behavior (leave blank if unstated)','textarea')+field('actualBehaviour','Actual behavior','textarea')+field('testCaseId','Test case','',[['','Unassigned'],...session.testCases.map(t=>[t.id,t.title])])+field('reportedBy','Reported by','',Object.entries(session.participants))+field('priority','Priority','',['Unscored','P0','P1','P2','P3']);
  $('evidence').textContent=i.source+'\n\n'+i.evidenceIds.map(id=>session.transcript.find(s=>s.id===id)).filter(Boolean).map(s=>`${time(s.start)} ${session.participants[s.speakerId]||s.speakerId}: ${s.text}`).join('\n\n');
  $('merge-target').innerHTML=options([['','Choose target'],...session.issues.filter(other=>other.id!==id&&!['Duplicate','Rejected'].includes(other.status)).map(other=>[other.id,other.title])],'');
  $('ai-suggestions').textContent=[i.testCaseReason?'Test-case suggestion: '+i.testCaseReason:'',i.suggestedDuplicateOf?'Possible duplicate: '+(session.issues.find(other=>other.id===i.suggestedDuplicateOf)?.title||'Target no longer available')+'. '+i.duplicateReason:''].filter(Boolean).join('\n');
  if(i.suggestedDuplicateOf)$('merge-target').value=i.suggestedDuplicateOf;
  $('review').showModal();
}
$('issues').onclick=e=>{if(e.target.dataset.review)review(e.target.dataset.review);};
$('close').onclick=()=>$('review').close();
$('review-form').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));if(!values.title.trim())return notice('Issue title is required.',true);Object.assign(session.issues.find(i=>i.id===reviewId),values);save();render();$('review').close();notice('Review saved.');};
$('delete').onclick=()=>{if(!confirm('Delete this detected issue? Transcript evidence will be retained.'))return;session.issues=session.issues.filter(i=>i.id!==reviewId);session.screenshots.filter(s=>s.issueId===reviewId).forEach(s=>{s.issueId=null;s.manual=true;});save();render();$('review').close();};
$('merge').onclick=()=>{try{mergeIssues(session,reviewId,$('merge-target').value);save();render();$('review').close();notice('Merged evidence and screenshots. Source marked Duplicate.');}catch(e){notice(e.message,true);}};
async function imageData(file){if(file.size>8*1024*1024)throw Error('Image limit is 8 MB');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use PNG, JPEG or WebP');return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function addShot(data,name,timestamp){session.screenshots.push({id:uid(),name,data,timestamp,issueId:nearestIssue(session.issues,timestamp),manual:false});save();render();notice('Screenshot saved. Check its timestamp and suggested issue below.');}
$('screenshot').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const value=prompt('Screenshot capture time in seconds from session start (upload time is only a default):',elapsed().toFixed(1));if(value===null)return;const stamp=Number(value);if(!Number.isFinite(stamp)||stamp<0)throw Error('Enter a nonnegative number of seconds');addShot(await imageData(file),file.name,stamp);}catch(e){notice(e.message,true);}finally{e.target.value='';}};
$('capture').onclick=async()=>{let stream;try{stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const video=document.createElement('video');video.srcObject=stream;await video.play();const stamp=elapsed(),canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);addShot(canvas.toDataURL('image/png'),`capture-${Math.floor(stamp)}.png`,stamp);}catch(e){notice(`Screen capture: ${e.message}`,true);}finally{stream?.getTracks().forEach(t=>t.stop());}};
$('shots').onchange=e=>{const id=e.target.dataset.shotTime||e.target.dataset.shotLink,s=session.screenshots.find(s=>s.id===id);if(!s)return;if(e.target.dataset.shotTime){const t=Number(e.target.value);if(!Number.isFinite(t)||t<0)return;s.timestamp=t;if(!s.manual)s.issueId=nearestIssue(session.issues,t);}else{s.issueId=e.target.value||null;s.manual=true;}save();render();};
$('shots').onclick=e=>{if(e.target.dataset.shotDelete){session.screenshots=session.screenshots.filter(s=>s.id!==e.target.dataset.shotDelete);save();render();}};
$('backup').onclick=()=>download('uat-session.json',JSON.stringify(session,null,2),'application/json');
$('finish').onclick=async()=>{if(meetingBusy)return notice('Wait for meeting capture setup to finish first.');$('finish').disabled=true;await meeting?.stop();await stopMic();await queue;session.endTime=Date.now();save();render();download('uat-report.md',report(session),'text/markdown');$('finish').disabled=false;notice('Session finished. Report exported; JSON backup includes images and all review records.');};
function replaceSession(next){stopMic();session=next;save();render();}
$('new').onclick=()=>{if(!confirm('Start a new session? The current session will be downloaded as a backup first.'))return;download('uat-session-backup.json',JSON.stringify(session,null,2),'application/json');replaceSession(createSession());notice('New session ready. Add a project name and test cases.');};
$('demo').onclick=async()=>{if(session.transcript.length&&!confirm('Replace this workspace with demo data? A backup will download first.'))return;if(session.transcript.length)download('uat-session-backup.json',JSON.stringify(session,null,2),'application/json');const s=createSession('Student portal · Acceptance testing');s.startTime=Date.now()-180000;s.participants={joji:'Joji',del:'Del',myles:'Myles'};s.testCases=['Student login','Student search','Student approval','Course assignment','Reporting'].map((title,i)=>({id:uid(),title,status:i<2?'Completed':'Pending'}));s.activeTestCase=s.testCases[2].id;const lines=[[20,'joji',"I'm opening the student record. The approval should update the student's status."],[32,'joji','When I click approve, nothing happens.'],[40,'del',"The student is still pending. I can reproduce the same bug."],[75,'myles','Could we add search by name or email to the student list?'],[93,'del',"I'll follow up with the engineering team after this session."]];s.transcript=lines.map(([start,speakerId,text])=>({id:uid(),start,end:start+5,speakerId,text,testCaseId:s.activeTestCase,source:'Demo fixture'}));replaceSession(s);await analyze(s.transcript);};
function validateBackup(s){
  if(!s||typeof s.id!=='string'||typeof s.project!=='string'||!Number.isFinite(s.startTime)||!s.participants||Array.isArray(s.participants)||Object.values(s.participants).some(v=>typeof v!=='string'))throw Error('Invalid session backup');
  for(const key of ['testCases','transcript','issues','screenshots'])if(!Array.isArray(s[key]))throw Error('Invalid backup '+key);
  for(const key of ['testCases','transcript','issues','screenshots'])if(s[key].some(row=>typeof row.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(row.id))||new Set(s[key].map(row=>row.id)).size!==s[key].length)throw Error('Invalid or duplicate record IDs');
  if(s.transcript.some(t=>typeof t.id!=='string'||typeof t.text!=='string'||typeof t.speakerId!=='string'||!Number.isFinite(t.start)||t.start<0))throw Error('Invalid transcript');
  if(s.testCases.some(t=>typeof t.id!=='string'||typeof t.title!=='string'))throw Error('Invalid test case');
  const ids=new Set(s.transcript.map(t=>t.id));if(s.issues.some(i=>typeof i.id!=='string'||typeof i.title!=='string'||!classifications.includes(i.classification)||!statuses.includes(i.status)||!Number.isFinite(i.timestamp)||!Array.isArray(i.evidenceIds)||i.evidenceIds.some(id=>!ids.has(id))))throw Error('Invalid issue evidence');
  if(s.screenshots.some(i=>typeof i.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.data)||!Number.isFinite(i.timestamp)||i.timestamp<0))throw Error('Invalid screenshot');
  return s;
}
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>40*1024*1024)throw Error('Import limit is 40 MB');const raw=await file.text();if(file.name.endsWith('.json')){const next=validateBackup(JSON.parse(raw));if(!confirm('Replace this workspace with the backup? The current session will download first.'))return;download('uat-before-import.json',JSON.stringify(session,null,2),'application/json');replaceSession(next);notice('Session restored.');}else{const lines=raw.split(/\r?\n/).filter(s=>s.trim());const parsed=lines.map(line=>{const m=line.match(/^\[?(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)\]?\s*(?:—|-)??\s*([^:]+):\s*(.+)$/);if(!m||+m[2]>59||+m[3]>=60)throw Error('Each line must use [HH:MM:SS] Speaker: text');return {name:m[4].trim(),text:m[5],start:+m[1]*3600 + +m[2]*60 + +m[3]};});for(const row of parsed){let id=Object.keys(session.participants).find(id=>session.participants[id]===row.name);if(!id){id='speaker_'+uid();session.participants[id]=row.name;}session.transcript.push({id:uid(),start:row.start,end:row.start,speakerId:id,text:row.text,testCaseId:session.activeTestCase,source:'Imported TXT'});}session.transcript.sort((a,b)=>a.start-b.start);save();render();$('analyze').click();}}catch(e){notice(e.message,true);}finally{e.target.value='';}};
$('audio').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(!config.audio)throw Error('Set OPENROUTER_API_KEY in .env and restart the server first.');if(file.size>25*1024*1024)throw Error('Audio limit is 25 MB');if(!confirm('Send this audio to OpenRouter for transcription (speaker labels depend on the model)? Confirm participants have consented.'))return;const offset=prompt('Recording start offset in session seconds:','0');if(offset===null)return;if(!Number.isFinite(+offset)||+offset<0)throw Error('Invalid offset');const sessionId=session.id,testCaseId=session.activeTestCase;notice('Transcribing recording…');const result=await api('/api/transcribe',file,{'Content-Type':file.type||'application/octet-stream'});if(session.id!==sessionId)return;const recordingId=uid().slice(0,8);for(const s of result.segments){s.speakerId=recordingId+'_'+s.speakerId;session.participants[s.speakerId]??=s.speakerId;session.transcript.push({...s,start:s.start + +offset,end:s.end + +offset,id:uid(),testCaseId,source:'OpenRouter recording · '+s.timing+' timing'});}session.transcript.sort((a,b)=>a.start-b.start);save();render();$('analyze').click();if(!result.segments.length)notice('No speech was returned for this recording.',true);}catch(e){notice(e.message,true);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(listening||busy||meeting||meetingBusy){e.preventDefault();e.returnValue='';}});
setInterval(()=>$('clock').textContent=time(elapsed()),1000);
try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('fieldnotes-uat',1);r.onupgradeneeded=()=>r.result.createObjectStore('sessions');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const stored=await new Promise((resolve,reject)=>{const r=db.transaction('sessions').objectStore('sessions').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(stored)session=validateBackup(stored);}catch(e){notice('Local storage unavailable or saved data invalid. Use JSON backups. '+e.message,true);}
try{config=await (await fetch('/api/config')).json();$('mode').querySelector('[value="ai"]').disabled=!config.ai;$('mode').querySelector('[value="openrouter"]').disabled=!config.openrouterAI;}catch{notice('Backend unavailable. Start the Node server.',true);}
render();
