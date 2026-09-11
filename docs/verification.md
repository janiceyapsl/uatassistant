# Verification — 11 September 2026

## Executed

- `node --check public/app.js`, `node --check server.js`, `node --check src/domain.js` pass.
- `npm test`: 10 tests pass. Coverage includes bug/enhancement distinction, simple negative examples, evidence ID rejection, bounded screenshot association, merge evidence preservation, report content, app serving, configuration-file isolation, cross-origin rejection and HTTP extraction.
- Browser walkthrough against `http://127.0.0.1:3000`: empty state renders; Load demo creates five transcript segments and four drafts (two bugs, one enhancement, one action).
- Edited a bug title and expected behavior, changed status to Confirmed, saved, and verified the visible issue card.
- Reloaded and verified IndexedDB retained the edited title and confirmation.
- Reanalyzed the same transcript: zero new drafts; existing reviewed issue retained.
- Visually inspected the three-panel desktop layout.

## Not validated with live services/hardware

- Microphone recognition and OS screen capture permission flows.
- Deepgram transcription/diarization (no API key supplied).
- Ollama inference (no installed model configured).
- Accuracy, latency, long-session behavior, 30-speaker diarization, cross-browser and mobile interaction.
- File chooser upload/download behavior end to end; report formatting is covered by the domain test and import/export code is implemented.

Automated tests prove the tested data-flow invariants, not meeting-understanding accuracy. Use `sample-transcript.txt`, a consented recording and representative screenshots for the next pilot. No meeting was recorded and no client/student data was sent to an AI provider during development.
