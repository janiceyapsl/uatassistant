export const classifications = ['BUG','ENHANCEMENT','QUESTION','ACTION','OTHER'];
export const statuses = ['New','Confirmed','Rejected','Duplicate','Resolved'];
export const uid = () => crypto.randomUUID();
export const time = seconds => {const n=Math.floor(Math.max(0,Number(seconds)||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');};
export function createSession(project='Untitled UAT') {
  return {id:uid(),project,date:new Date().toISOString(),startTime:Date.now(),endTime:null,participants:{unknown:'Unassigned speaker'},testCases:[],activeTestCase:'',transcript:[],issues:[],screenshots:[]};
}
export function detect(segment, context=[]) {
  const text=segment.text;
  let classification;
  if (/\b(not a bug|no (bugs?|issues?)|works? (fine|correctly|as expected)|is fixed)\b/i.test(text)) return [];
  if (/\b(would be (nice|useful)|feature request|enhancement|can we add|could we add|please add|need a way)\b/i.test(text)) classification='ENHANCEMENT';
  else if (/\b(bug|broken|error|crash|crashes|doesn't|does not|isn't|not responding|nothing happens|nothing seems to happen|unable|cannot|can't|fails?|missing)\b/i.test(text)) classification='BUG';
  else if (/\b(follow up|follow-up|action item|i will|i'll)\b/i.test(text)) classification='ACTION';
  else if (/\?\s*$/.test(text)) classification='QUESTION';
  else return [];
  const evidence=[...context.filter(s=>s.testCaseId===segment.testCaseId).slice(-2),segment];
  return [{classification,title:text.slice(0,120),description:text,expectedBehaviour:'',actualBehaviour:classification==='BUG'?text:'',evidenceIds:evidence.map(s=>s.id),source:'Rules • review required'}];
}
export function materialize(candidate, transcript) {
  if(!classifications.includes(candidate.classification)||typeof candidate.title!=='string'||!candidate.title.trim()) throw Error('Invalid issue classification or title');
  if(!Array.isArray(candidate.evidenceIds)||!candidate.evidenceIds.length) throw Error('Issue needs transcript evidence');
  const evidence=candidate.evidenceIds.map(id=>transcript.find(s=>s.id===id));
  if(evidence.some(s=>!s)) throw Error('Unknown transcript evidence');
  const first=evidence.at(-1);
  return {id:uid(),classification:candidate.classification,title:candidate.title.slice(0,240),description:String(candidate.description||''),expectedBehaviour:String(candidate.expectedBehaviour||''),actualBehaviour:String(candidate.actualBehaviour||''),evidenceIds:[...new Set(candidate.evidenceIds)],timestamp:first.start,reportedBy:first.speakerId,testCaseId:first.testCaseId,priority:'Unscored',status:'New',source:candidate.source||'AI • review required'};
}
export function nearestIssue(issues, timestamp, window=30) {
  return issues.filter(i=>!['Rejected','Duplicate'].includes(i.status)).map(i=>({id:i.id,distance:Math.abs(i.timestamp-timestamp)})).filter(i=>i.distance<=window).sort((a,b)=>a.distance-b.distance)[0]?.id||null;
}
export function mergeIssues(session, sourceId, targetId) {
  if(sourceId===targetId) throw Error('Select a different issue');
  const source=session.issues.find(i=>i.id===sourceId),target=session.issues.find(i=>i.id===targetId);
  if(!source||!target) throw Error('Issue not found');
  target.evidenceIds=[...new Set([...target.evidenceIds,...source.evidenceIds])];
  target.description+='\n\nMerged report: '+source.description;
  source.status='Duplicate';source.duplicateOf=targetId;
  session.screenshots.filter(s=>s.issueId===sourceId).forEach(s=>s.issueId=targetId);
}
export function report(session) {
  const valid=session.issues.filter(i=>!['Rejected','Duplicate'].includes(i.status));
  const lines=['# UAT Session Report','',`Project: ${session.project}`,`Date: ${session.date}`,`Participants: ${Object.values(session.participants).join(', ')}`,'', '## Summary',`Test cases discussed: ${new Set(session.transcript.map(s=>s.testCaseId).filter(Boolean)).size}`,...classifications.map(c=>`${c}: ${valid.filter(i=>i.classification===c).length}`),'','Drafts are included with their review status. Rejected and duplicate records remain in the JSON backup.'];
  for(const c of classifications) {
    lines.push('',`## ${c}`);
    for(const i of valid.filter(i=>i.classification===c)) lines.push('',`### ${i.title}`,`Status: ${i.status} | Priority: ${i.priority}`,`Test case: ${session.testCases.find(t=>t.id===i.testCaseId)?.title||'Unassigned'}`,`Reported by: ${session.participants[i.reportedBy]||i.reportedBy} | Timestamp: ${time(i.timestamp)}`, '',i.description,'',`Expected: ${i.expectedBehaviour||'Not stated'}`,`Actual: ${i.actualBehaviour||'Not stated'}`,'','Transcript evidence:',...i.evidenceIds.map(id=>session.transcript.find(s=>s.id===id)).filter(Boolean).map(s=>`> ${time(s.start)} ${session.participants[s.speakerId]||s.speakerId}: ${s.text}`),'',...session.screenshots.filter(s=>s.issueId===i.id).map(s=>`Screenshot: ${s.name} at ${time(s.timestamp)} (image embedded in JSON backup)`));
  }
  lines.push('','## Complete transcript',...session.transcript.map(s=>`${time(s.start)} — ${session.participants[s.speakerId]||s.speakerId}: ${s.text}`));
  return lines.join('\n');
}
