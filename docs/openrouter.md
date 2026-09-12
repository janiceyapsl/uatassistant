# OpenRouter STT setup

The application now uses OpenRouter exclusively for uploaded audio and meeting capture. A Deepgram account/key is no longer needed; the WebSocket dependency and Deepgram adapter were removed.

Set these values in the local `.env` file:

```dotenv
OPENROUTER_API_KEY=your-key-here
OPENROUTER_STT_MODEL=openai/whisper-large-v3
OPENROUTER_STT_RESPONSE_FORMAT=verbose_json
```

Restart `npm start` and reload the app. The key stays on the Node server and `.env` is excluded from Git. The model is configurable; choose a transcription model available to your OpenRouter account. No key was supplied or live provider call made during implementation.

**Meeting capture:** use desktop Chrome/Edge, select the meeting tab, enable Share tab audio and optionally include the microphone. AudioWorklet captures mono PCM continuously, then submits independently decodable 10-second WAV files. The last partial packet is submitted on stop. There is no Deepgram WebSocket, and this does not read platform captions. Expect at least the batch duration plus provider processing time before text arrives. Keep the tab active; browser suspension may interrupt capture.

**Timing:** WAV chunk offsets use captured sample counts; provider segment times are added to each chunk's session offset. Models without structured timestamps can use `OPENROUTER_STT_RESPONSE_FORMAT=json`; their text is marked approximate and placed at chunk/recording start. For uploaded recordings, specify the recording start offset yourself. File upload is capped at 25 MB and provider processing timeouts may require splitting long files.

**Speakers:** Whisper does not supply guaranteed diarization. Missing labels remain Unknown. If a model supplies labels, they are scoped per chunk to avoid falsely joining different people. Mapping a label in one batch does not identify that voice in future batches. Automatic cross-batch voice recognition and reliable 30-speaker identification are not implemented.

Some models support diarization via provider-specific options. To use one, set the exact model ID and optionally `OPENROUTER_STT_PROVIDER_OPTIONS` to a JSON object keyed by provider slug. For example, the documented Azure diarization options are `{"azure":{"diarization":{"enabled":true}}}` for a compatible model. Unsupported options may be rejected or ignored; validate with a representative recording. `verbose_json` is not supported by every model; use a supported model or explicitly choose `json`. No silent fallback or paid retry is performed.

**Failure handling:** requests are serial to preserve transcript order. Six outstanding batches trigger a visible stop rather than unlimited memory growth. Provider errors stop capture and identify the missing interval; completed transcript remains saved. Raw audio is not archived, and missing intervals cannot be replayed. Finish waits for submitted work. Audio is sent to OpenRouter and its selected provider; obtain meeting consent and check their applicable retention policies.

Official API reference: [OpenRouter speech-to-text](https://openrouter.ai/docs/guides/overview/multimodal/stt). Endpoint: `POST https://openrouter.ai/api/v1/audio/transcriptions`; bearer authentication; base64 JSON audio; normalized transcript response.

Verified locally: request/auth/model serialization, response normalization and error handling, WAV encoding, uninterrupted worklet sample offsets/final flush, ordered chunk delivery and separate speaker namespaces. Real provider transcription, microphone/screen-sharing permission flows and speech accuracy still require a pilot with your key.
