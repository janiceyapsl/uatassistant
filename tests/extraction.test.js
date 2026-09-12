import test from 'node:test';
import assert from 'node:assert/strict';
import {extractIssues,validateExtraction,extractionPrompt} from '../src/extraction.js';
const input={segments:[{id:'s1',start:10,speakerId:'joji',testCaseId:'t1',text:'Approval should update the student status.'},{id:'s2',start:14,speakerId:'joji',testCaseId:'t1',text:'I click approve but nothing happens.'},{id:'s3',start:17,speakerId:'del',testCaseId:'t1',text:'The student is still pending.'}],testCases:[{id:'t1',title:'Student approval'}],existingIssues:[{id:'bug1',title:'Approval fails',status:'Confirmed'}]};
const candidate={classification:'BUG',title:'Approval button does not update student status',description:'Clicking approve leaves the student pending.',expectedBehaviour:'Student status updates.',actualBehaviour:'Student remains pending.',evidenceIds:['s1','s2','s3'],reportedEvidenceId:'s2',testCaseId:'t1',testCaseReason:'The participants are testing approval.',duplicateOf:'bug1',duplicateReason:'Same approval symptom.',expectedQuote:'Approval should update the student status.',actualQuote:'The student is still pending.'};
test('sample combines multiple speakers with grounded reporter and review-only duplicate',()=>{
 const [issue]=validateExtraction({issues:[candidate]},input,'fixture-model');assert.equal(issue.reportedBy,'joji');assert.equal(issue.timestamp,14);assert.equal(issue.status,'New');assert.equal(issue.suggestedDuplicateOf,'bug1');assert.equal(issue.testCaseId,'t1');assert.deepEqual(issue.evidenceIds,['s1','s2','s3']);assert.equal(input.existingIssues[0].status,'Confirmed');
});
test('fabricated evidence, behavior support, test case, duplicate, reporter and category are rejected',()=>{
 for(const patch of [{evidenceIds:['fake']},{expectedQuote:'A made-up requirement'},{testCaseId:'fake'},{duplicateOf:'fake'},{reportedEvidenceId:'fake'},{classification:'CRITICAL'}])assert.throws(()=>validateExtraction({issues:[{...candidate,...patch}]},input,'fixture-model'));
});
test('unstated behaviors remain blank and empty response creates no issue',()=>{
 const [i]=validateExtraction({issues:[{...candidate,expectedBehaviour:'',expectedQuote:'',actualBehaviour:'',actualQuote:''}]},input,'test');assert.equal(i.expectedBehaviour,'');assert.equal(i.priority,'Unscored');assert.deepEqual(validateExtraction({issues:[]},input,'test'),[]);
});
test('OpenRouter text adapter sends strict schema and bounded context without media',async()=>{
 let sent;const issues=await extractIssues({...input,screenshots:['private-image']},{env:{OPENROUTER_API_KEY:'test-key',OPENROUTER_TEXT_MODEL:'test/model'},request:async(url,opts)=>{assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(opts.headers.Authorization,'Bearer test-key');sent=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({issues:[candidate]})}}]})};}});
 assert.equal(sent.response_format.json_schema.strict,true);assert.equal(sent.provider.require_parameters,true);assert.equal(sent.model,'test/model');assert.ok(!sent.messages[1].content.includes('private-image'));assert.match(extractionPrompt,/untrusted/);assert.equal(issues.length,1);
});
test('missing config, provider errors, truncated output and invalid JSON fail without fallback',async()=>{
 await assert.rejects(()=>extractIssues(input,{env:{}}),/OPENROUTER_TEXT_MODEL/);
 const env={OPENROUTER_API_KEY:'test',OPENROUTER_TEXT_MODEL:'test/model'};
 await assert.rejects(()=>extractIssues(input,{env,request:async()=>({ok:false,status:429})}),/429/);
 for(const choice of [{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{content:'not json'}}])await assert.rejects(()=>extractIssues(input,{env,request:async()=>({ok:true,json:async()=>({choices:[choice]})})}));
});
