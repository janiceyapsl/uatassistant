# Feasibility, research, and implementation plan

Research date: 11 September 2026. Recommendation: prove evidence-linked issue review first; treat meeting capture and speaker attribution as independently replaceable adapters. The workflow is feasible. Reliable 30-speaker diarization from one mixed microphone is an evaluation question, not a solved requirement.

## Capture and transcription choices

| Component | Recommendation | Tradeoff / alternative |
|---|---|---|
| Meeting capture | Production: participant-separated streams through a meeting capture adapter | Recall documents separate streams for Zoom, Teams and Meet; service dependency and meeting permissions. Browser mic is a limited prototype path. |
| Live STT | Benchmark Deepgram Nova streaming against a self-hosted baseline | Streaming API supplies interim/final results, timestamps and speaker labels. Use final results for extraction; latency must be measured. |
| Local STT | faster-whisper plus a streaming wrapper/worker | CTranslate2 implementation; hardware and model size determine throughput. It is not inherently a complete live meeting service. |
| Mixed-audio diarization | pyannote.audio Community-1, with reconciliation after the session | Local processing, model access conditions, GPU and deployment work. Speaker identities are anonymous clusters. |
| Issue extraction | Schema-constrained instruction model behind a provider adapter | Ollama supports JSON-schema outputs locally. A schema ensures shape, not truth. |
| Screenshots | Browser capture plus manual upload | Screen chooser requires a user gesture; timestamps belong to the capture event, not upload or file modification time. |

Sources: [Recall separate participant streams](https://docs.recall.ai/docs/how-to-get-separate-audio-per-participant-realtime), [Deepgram live audio API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [pyannote.audio](https://github.com/pyannote/pyannote-audio), [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

Browser SpeechRecognition has limited availability and may send microphone audio to a browser vendor's recognition service. It should not be sold as local-only speech processing or as a robust meeting diarizer. This prototype uses it for the smallest live path. [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

Deepgram batch diarization v2 is selected explicitly for reproducibility. Batch and streaming diarization capabilities are versioned separately; benchmark them separately. [Deepgram diarization](https://developers.deepgram.com/docs/diarization)

## Thirty speakers and real names

Thirty registered participants is straightforward. Thirty accurately distinguished voices is substantially harder, especially short turns, overlap, shared-room microphones, and similar voices. No source reviewed establishes a blanket 30-speaker accuracy guarantee for this scenario.

Prefer platform participant IDs carried with separate audio streams, mapped to a session roster. Recall documents a limit of 16 concurrent loudest speakers for separate streams on Zoom, Teams, and Meet; that is a concurrent-stream constraint, not evidence of a 30-person accuracy guarantee. Shared devices still require acoustic diarization. Active-speaker timeline events can be inaccurate. [Recall streams](https://docs.recall.ai/docs/how-to-get-separate-audio-per-participant-realtime), [Recall diarization approaches](https://docs.recall.ai/docs/diarization)

For mixed audio, retain stable anonymous IDs and let a human name clusters. Do not infer identities from names mentioned in speech. Reconcile short-window clusters against session embeddings only after calibration; preserve original labels and corrections. The prototype namespaces labels per uploaded recording to avoid falsely treating speaker_0 in two files as the same person.

## Recommended architecture

```text
Mic / meeting adapter / imported recording
  -> capture clock + stream IDs + consent state
  -> STT adapter (interim display, final transcript events)
  -> diarization / roster mapping
  -> append-only transcript store
  -> extraction worker (rolling context + test-case catalog)
  -> validated draft issues + evidence links
  -> human review + screenshot association
  -> report and optional approved ticket outbox
```

Use React + TypeScript for the production interface, a Node/TypeScript API, PostgreSQL for sessions/records/audit history, object storage for screenshots/audio, and a Python worker for local speech/diarization if required. Keep job retries idempotent using capture IDs and transcript revision IDs. Add a durable queue once background work must survive restarts. The initial prototype intentionally uses plain browser modules, Node's HTTP server and IndexedDB to run without dependency installation; that is a prototype implementation choice, not the production persistence recommendation.

Build the UAT ontology, extraction prompts/evaluation, evidence linking, test-case context, review UI, merge semantics and reports. Integrate STT, diarization and platform capture; do not build a speech model or meeting bot from scratch. Review dependency licenses, model access terms and supported versions before packaging the production stack. faster-whisper and pyannote are candidates evaluated from their official repositories, not installed by this prototype.

## Timestamp and screenshot design

Production timestamps should be integer milliseconds relative to one session epoch. Derive audio events from sample offsets; maintain per-stream offsets and drift measurements when joining remote capture clocks. Store absolute UTC separately for display and audit. On reconnect, keep original capture offsets rather than resetting the session clock. Screenshots use the actual captured frame instant. Prefer the currently discussed issue, then nearest evidence interval within a configurable window; show suggestions with uncertainty and require correction where ambiguous.

Prototype: seconds from session start, browser speech-start approximation, audio upload offset, and a 30-second nearest-issue window. Uploaded screenshot defaults are only suggestions and are editable. A manual association (including unassignment) is preserved. Wall-clock changes can affect the prototype's browser timestamps; sample-clock alignment is a production task.

## Extraction and duplicates

Provide recent finalized turns, stable segment IDs, active test case, catalog descriptions, glossary, and existing open issue summaries. Ask for minimal supported records: category, description, explicit expected/actual behavior, and evidence IDs. Empty values mean unstated. Separate extraction from priority scoring. Validate enums, IDs and scope server-side; check semantic support with a second pass or sampled human review. Treat transcript instructions as data, never tool authorization.

Prototype uses rolling five-turn windows for new entries, overlapping 50-turn batches for full analysis, and evidence-based duplicate suppression. It does not automatically infer test cases; the active case is attached at capture/import and can be corrected per issue. Its duplicate suppression is intentionally basic and may suppress two same-category issues rooted in one segment. The human merge retains both evidence sets, moves screenshots and marks the source Duplicate. Production should propose candidate merges by test case, symptoms and semantic similarity, never silently erase reports. Model output order is not enough to identify the original reporter; add an explicit reporter-evidence field and validate it in the production extractor.

## Privacy and security boundaries

Local default: browser transcript, names, issues and screenshots in IndexedDB; rules processing on the loopback server. Optional local AI sends transcript/test-case context to the configured Ollama endpoint. Optional audio upload sends the recording to Deepgram. Browser speech may use an external speech service independently of these settings. No screenshots are sent to any AI provider by this prototype.

Before real client/student sessions, define informed recording notice/consent, allowed data categories, tenant isolation, role-based access, regional processing, provider retention, deletion/export procedures and encryption requirements with the organization. Minimize personal data in audio and screenshots; add selective redaction and avoid retaining raw audio by default. Do not log transcript text or secrets. Production should use managed secrets, encrypted transport/storage, scoped ticket credentials and audited approvals. These are engineering requirements; jurisdiction-specific legal compliance needs separate review.

## Smallest viable MVP and staged delivery

1. **Delivered prototype:** one local session; browser microphone or imported transcript/recording; explicit test case and speaker correction; draft issue extraction; screenshot links; human review; report and backup. This proves the review workflow, with live multi-speaker capture still unproven.
2. **Capture pilot:** one platform and one provider; final streaming events, accurate offsets, reconnect/replay, participant mapping, consent state. Test 3–5 speakers first, then approximately 30. Store transcripts durably and compare with recorded ground truth.
3. **Extraction quality:** label 10–20 representative UAT meetings, including accents, overlap, non-issues, enhancements and repeated defects. Measure issue precision/recall, evidence correctness, attribution error and reviewer correction time. Add semantic support validation and test-case inference.
4. **Production foundations:** authentication, tenancy, encrypted media store, deletion policy, audit trail, durable queue, observability without sensitive payloads. Load test long meetings and interrupted connections.
5. **Phase 2 tickets:** draft preview, explicit human approval, field mapping, screenshot upload, idempotent outbox with remote ticket IDs. Then priority recommendations based on impact/blocking/workaround/security/data-loss evidence; do not infer urgency from emphatic wording.

Suggested pilot gates (targets, not measured results): p95 final transcript latency under 3 seconds, draft generation under 10 seconds after final text, at least 90% bug/enhancement precision and 80% recall on a held-out labeled set, zero nonexistent evidence IDs, screenshot drift under 2 seconds with sample clocks, and demonstrably lower review time than manual notes. Score diarization error rate and named-speaker attribution separately. Retain uncertain speakers as unknown; do not force names to meet a metric.

## Linear and Jira

Linear exposes GraphQL mutations such as issueCreate and an upload workflow; Jira Cloud exposes POST /rest/api/3/issue and uses Atlassian Document Format for rich descriptions. Fetch project/team-specific metadata before mapping fields. Ticket submission must remain a reviewed outbox action, not a response to transcript instructions. Neither integration is required or implemented in this prototype. [Linear GraphQL](https://linear.app/developers/graphql), [Linear uploads](https://linear.app/developers/how-to-upload-a-file-to-linear), [Jira issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)

## Repository structure

Current runnable prototype:

```text
server.js                  Local API and optional providers
src/domain.js              Issues, evidence, merging, reports
public/index.html          Review workspace
public/app.js              Capture, IndexedDB, review, imports
public/style.css           Responsive UI
tests/                     Domain and HTTP verification
docs/                      Research, plan, verification, sample
.env.example               Optional configuration, no secrets
```

Proposed production split:

```text
apps/web/                  React/TypeScript review workspace
apps/api/                  Session API, auth, streaming gateway
workers/extraction/        Structured extraction and validation
workers/speech/            Optional Python STT/diarization
packages/domain/           Versioned schema and shared invariants
packages/providers/        Capture/STT/model/ticket adapters
packages/evaluation/       Fixtures, annotations, quality metrics
db/migrations/             Relational model and audit history
infra/                     Deployment and secret references
docs/                      Operations and data policies
```

Relational entities: Session, Participant, TestCase, TranscriptSegment, Issue, IssueEvidence (many-to-many), Screenshot, ReviewEvent and TicketDraft. Keep source IDs, timestamps, revisions and provenance; use foreign keys rather than copied transcript text as the sole evidence.
