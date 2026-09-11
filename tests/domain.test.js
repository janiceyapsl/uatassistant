import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,detect,materialize,nearestIssue,mergeIssues,report} from '../src/domain.js';
const segment=(text,id='s1',start=32)=>({id,text,start,speakerId:'joji',testCaseId:'approval'});
test('bug keeps evidence and does not invent expected behavior or priority',()=>{
 const s=segment('When I click approve, nothing happens.');const i=materialize(detect(s)[0],[s]);
 assert.equal(i.classification,'BUG');assert.equal(i.reportedBy,'joji');assert.equal(i.timestamp,32);assert.equal(i.expectedBehaviour,'');assert.equal(i.priority,'Unscored');assert.equal(i.status,'New');
});
test('enhancement is distinct from a bug',()=>assert.equal(detect(segment('Could we add search by email?'))[0].classification,'ENHANCEMENT'));
test('obvious non-issue and ordinary discussion do not generate defects',()=>{assert.deepEqual(detect(segment('This is not a bug, it works as expected.')),[]);assert.deepEqual(detect(segment('Opening the student record.')),[]);});
test('fabricated evidence and invalid categories are rejected',()=>{assert.throws(()=>materialize({classification:'BUG',title:'Error',evidenceIds:['fake']},[]));assert.throws(()=>materialize({classification:'SECURITY',title:'Error',evidenceIds:['s1']},[segment('Error')]));});
test('screenshot matching is bounded, bidirectional, and ignores rejected issues',()=>{const issues=[{id:'a',timestamp:32,status:'New'},{id:'b',timestamp:38,status:'Rejected'}];assert.equal(nearestIssue(issues,38),'a');assert.equal(nearestIssue(issues,28),'a');assert.equal(nearestIssue(issues,63),null);});
test('merge retains both evidence sets and moves screenshots',()=>{const s=createSession();s.issues=[{id:'a',description:'a',evidenceIds:['s1']},{id:'b',description:'b',evidenceIds:['s2']}];s.screenshots=[{issueId:'a'}];mergeIssues(s,'a','b');assert.deepEqual(s.issues[1].evidenceIds,['s2','s1']);assert.equal(s.issues[0].status,'Duplicate');assert.equal(s.screenshots[0].issueId,'b');assert.throws(()=>mergeIssues(s,'b','b'));});
test('report includes review state, named evidence, and complete transcript',()=>{const s=createSession('Portal');s.participants={joji:'Joji'};s.transcript=[segment('Approval is broken.')];s.issues=[materialize(detect(s.transcript[0])[0],s.transcript)];const md=report(s);assert.match(md,/Status: New/);assert.match(md,/00:00:32 Joji: Approval is broken/);assert.match(md,/Expected: Not stated/);assert.match(md,/Complete transcript/);});
