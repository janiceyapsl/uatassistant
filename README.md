# Fieldnotes — UAT Meeting Assistant

A functional, local prototype of the UAT review workflow. Node 22+; one WebSocket dependency and no build step.

```powershell
npm ci
npm start
```

Open http://127.0.0.1:3000 in Chrome or Edge. Select **Load demo** for an immediate walkthrough. Run `npm test` for domain and HTTP tests.

## What works

- Timestamped microphone transcription using browser speech recognition, where supported. Select the current speaker manually. Browser timestamps are approximate speech-start times, not word alignments.
- Automatic rules-based draft detection; optional schema-constrained local AI through Ollama.
- Import timestamped TXT and restore JSON backups. Example: `docs/sample-transcript.txt`. TXT timestamps are elapsed session time, not wall-clock time.
- Optional recorded-audio transcription with Deepgram and anonymous speaker labels; map labels to participant names. Separate uploads get separate speaker namespaces.
- Active test cases and completion tracking; editable issue fields, classification, speaker, status, and priority.
- Screenshot upload or one-shot screen capture; nearest-issue association within 30 seconds, editable time and association. Capture uses the frame-capture instant. Upload requires a user-supplied elapsed timestamp.
- Merge duplicates while preserving evidence; delete false detections without deleting transcript.
- Session data and images persist in browser IndexedDB. JSON backups include images and review state; Markdown report contains the complete transcript and screenshot names.
- Finish waits for queued analysis and exports the report. Rejected/duplicate issues are excluded from issue summaries, retained in backups.

## Optional services

### Live meeting audio (new)

1. Copy `.env.example` to `.env`, set `DEEPGRAM_API_KEY` locally, then restart `npm start` and reload the page. Never commit or paste the key into chat.
2. Open the assistant and your browser meeting in desktop Chrome or Edge. Obtain participants' recording consent.
3. Click **Capture meeting audio**. In the browser chooser select the Zoom/Teams/Meet meeting tab and enable **Share tab audio**.
4. Leave **Include my microphone** checked to include your own voice. Use headphones to minimize echo. If unchecked, only the selected source's audio is transcribed.
5. Final transcript segments flow into issue detection. Rename anonymous **Live speaker** labels under Participants. Stop capture or finish the session to flush final words before exporting.

This captures shared audio and creates a new live transcript; it does not read Zoom/Teams/Meet captions or join a meeting as a bot. Browser meeting tabs are the preferred path. Native desktop meetings require a screen/system-audio source supported by the browser and OS; window sharing often supplies no audio. The app rejects a selection with no audio track. System audio can include unrelated sounds, so select a meeting tab when possible. Screen video is needed for the browser sharing chooser but is never streamed to the server or Deepgram.

Audio is mixed with the optional microphone, encoded as one continuous WebM/Opus stream, and sent through a local WebSocket proxy to Deepgram. The provider key stays server-side. Word timestamps are aligned to the capture start; speaker IDs stay within one stream and are namespaced on restart. Reconnect is manual and explicitly reported; gaps are not reconstructed. There is no raw-audio archive or guaranteed 30-speaker accuracy. The proxy is tested against a fake provider; actual meeting audio and Deepgram require a consented pilot with your key.

Copy `.env.example` to `.env` and set only what you need. Restart the server after changes.

For AI extraction, install Ollama separately, download a suitable instruction model and set `OLLAMA_MODEL` to its installed name. Default `OLLAMA_URL` is `http://127.0.0.1:11434`. Choose **Local AI · Ollama** in the interface. No automatic fallback hides AI errors; transcript stays available for retries. Model choice and accuracy require testing on your own UAT recordings.

Set `DEEPGRAM_API_KEY` to enable **Transcribe audio file**. Uploads (25 MB maximum) go through the local server to Deepgram Nova-3 with batch diarization v2. The audio is not retained by this server; provider retention depends on your account terms. The API key stays server-side. The upload's start offset aligns audio timestamps with session timestamps.

## Boundaries of this prototype

The separate **Start microphone** mode uses browser speech recognition, may use a remote browser service, and does not diarize. **Capture meeting audio** uses the new Deepgram streaming path described above. Browser support and microphone permissions vary; use desktop Chrome/Edge instead of the Codex embedded preview for real meetings.

The rules detector is a transparent baseline, not semantic AI. It can miss issues, over-detect generic bug mentions, and does not resolve complex negation or cross-window references. AI mode can synthesize related turns but still needs human review. Evidence IDs are checked for existence; that does not guarantee that a model's claim is entailed by the evidence.

No 30-speaker accuracy guarantee, meeting bot, native caption integration, automatic test-case inference, ticket submission, authentication, multi-user database, or production privacy controls are included. Priority is manually editable and starts Unscored. Screenshots are retained locally and are not sent to the model. Raw audio is not archived.

IndexedDB holds one active session per browser origin. New session/demo/restore downloads the old session first. Save JSON backups regularly; clearing browser data deletes the local copy. Use a single browser tab per session to avoid last-write-wins overwrites. Changing the host or port changes the browser storage origin.

The server binds to loopback only, checks Host/Origin, serves an allowlist of files and limits request bodies. This is a single-user development application, not an authenticated production service. Do not expose it publicly. The repository is in a OneDrive folder: exported files saved there may sync through OneDrive.

See [architecture and research](docs/architecture.md) for feasibility, vendor comparisons, privacy boundaries, implementation milestones, and the production repository proposal. See [verification](docs/verification.md) for executed checks and remaining validation.
