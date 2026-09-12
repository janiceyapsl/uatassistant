# Fieldnotes — UAT Meeting Assistant

A functional, local prototype of the UAT review workflow. Node 22+; no runtime dependencies and no build step.

```powershell
npm ci
npm start
```

Open http://127.0.0.1:3000 in Chrome or Edge. Select **Load demo** for an immediate walkthrough. Run `npm test` for domain and HTTP tests.

## What works

- Timestamped microphone transcription using browser speech recognition, where supported. Select the current speaker manually. Browser timestamps are approximate speech-start times, not word alignments.
- Automatic rules-based draft detection; optional schema-constrained local AI through Ollama.
- Import timestamped TXT and restore JSON backups. Example: `docs/sample-transcript.txt`. TXT timestamps are elapsed session time, not wall-clock time.
- Optional recorded-audio transcription with OpenRouter and model-dependent speaker labels; map labels to participant names. Separate uploads get separate speaker namespaces.
- Active test cases and completion tracking; editable issue fields, classification, speaker, status, and priority.
- Screenshot upload or one-shot screen capture; nearest-issue association within 30 seconds, editable time and association. Capture uses the frame-capture instant. Upload requires a user-supplied elapsed timestamp.
- Merge duplicates while preserving evidence; delete false detections without deleting transcript.
- Session data and images persist in browser IndexedDB. JSON backups include images and review state; Markdown report contains the complete transcript and screenshot names.
- Finish waits for queued analysis and exports the report. Rejected/duplicate issues are excluded from issue summaries, retained in backups.

## OpenRouter STT

The STT engine now uses OpenRouter only. See [OpenRouter setup](docs/openrouter.md) for key/model configuration, meeting capture, timing, speaker limitations and provider options. Set OPENROUTER_API_KEY in .env, restart npm start and reload the page.

Meeting audio is transcribed in 10-second WAV batches plus processing time. Speaker labels are optional and scoped per batch. Uploaded recordings use the same OpenRouter endpoint. Ollama remains optional for issue extraction, separate from STT.

## Boundaries of this prototype

The separate **Start microphone** mode uses browser speech recognition, may use a remote browser service, and does not diarize. **Capture meeting audio** uses OpenRouter in 10-second batches. Browser support and microphone permissions vary; use desktop Chrome/Edge instead of the Codex embedded preview for real meetings.

The rules detector is a transparent baseline, not semantic AI. It can miss issues, over-detect generic bug mentions, and does not resolve complex negation or cross-window references. AI mode can synthesize related turns but still needs human review. Evidence IDs are checked for existence; that does not guarantee that a model's claim is entailed by the evidence.

No 30-speaker accuracy guarantee, meeting bot, native caption integration, automatic test-case inference, ticket submission, authentication, multi-user database, or production privacy controls are included. Priority is manually editable and starts Unscored. Screenshots are retained locally and are not sent to the model. Raw audio is not archived.

IndexedDB holds one active session per browser origin. New session/demo/restore downloads the old session first. Save JSON backups regularly; clearing browser data deletes the local copy. Use a single browser tab per session to avoid last-write-wins overwrites. Changing the host or port changes the browser storage origin.

The server binds to loopback only, checks Host/Origin, serves an allowlist of files and limits request bodies. This is a single-user development application, not an authenticated production service. Do not expose it publicly. The repository is in a OneDrive folder: exported files saved there may sync through OneDrive.

See [architecture and research](docs/architecture.md) for feasibility, vendor comparisons, privacy boundaries, implementation milestones, and the production repository proposal. See [verification](docs/verification.md) for executed checks and remaining validation.

## AI issue extraction

OpenRouter text-model extraction is available alongside rules and Ollama. Set OPENROUTER_TEXT_MODEL and use AI · OpenRouter. Test a sample first; Auto AI for new speech is off by default. See [setup and validation](docs/ai-extraction.md).
