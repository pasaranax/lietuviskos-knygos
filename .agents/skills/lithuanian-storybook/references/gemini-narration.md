# Gemini narration by role

Use this workflow for this project's new chapter narration and audio repairs. Gemini is the default; `scripts/generate-chapter-audio.py` and Azure casting remain a legacy narration path only when explicitly requested. Do not regenerate accepted audio merely to change providers or clip boundaries. Follow the user's requested stage; updating this skill or committing files does not trigger synthesis or deployment.

## Persistent cast

Read the canonical book and `author-plans/<book-id>-voices.json`. Keep a separate narrator and a stable `voiceId` for each character. Preserve accepted voices across turns and chapters. For a new role, define its vocal age, register, timbre, articulation, baseline pace and acoustics before creating or auditioning it. Vocal age is a performance choice, not a new story fact. Save the chosen voice, provider/model, design prompt and user feedback in the casting file.

A voice ID alone does not preserve delivery: repeat the role's baseline pace and relevant age/acoustic traits in each synthesis part's style. Use dry, clear studio speech when that is the accepted sound. Compare new samples using the same Lithuanian passage and measured loudness. Generated voice-creation previews may speak another language; only offer a sample after verifying that it reads the intended Lithuanian text.

Keep secrets in the ignored root `.env` as `GEMINI_API_KEY`. Use the configured project and model recorded in the casting file; the existing working cast uses `gemini-3.8-flash-tts`. Follow the user's current billing authorization rather than assuming this project is free. When paid synthesis is authorized, preserve accepted audio, synthesize only changed or missing speech, cache successful responses, and retain request usage for a final cost report using the current official tariff. Distinguish a usage-based calculation from an actual billing charge. If an accepted voice becomes unavailable, report that and prepare a replacement audition instead of silently changing the character's voice.

## Contextual performance plan

The agent assigns roles and emotional delivery from the surrounding scene; the user does not need to mark every sentence. Store a reviewed local plan with ordered parts, each containing:

- Stable part ID, chapter/block location, speaker and exact spoken `text`.
- `style`: role baseline plus the line's intention, emotion, intensity, pace and meaningful pauses.
- Source/casting fingerprints and batches of compatible parts for one voice.

Resolve who actually speaks. Split author insertions such as “he asked” into narrator parts even when they occur inside dialogue. Letters, quoted thoughts and stories within stories may use a character's voice when the plan explicitly assigns it. Verify that concatenating all parts in narrative order preserves every source word and punctuation, without duplicates.

Use the canonical Lithuanian text verbatim. Remove only the added stress accents U+0300/U+0301/U+0303 after Unicode decomposition, then restore NFC; preserve ą č ę ė į š ų ū ž. Never add spoken headings, identifiers, Russian translations or English performance instructions to the transcript.

Use the current engine’s emotional performance capabilities, especially in direct speech. Infer specific emotions and their intensity from the scene: anger, delight, fear, irony, tenderness or distress should be audible when appropriate, rather than flattened into uniformly restrained delivery. A restrained line is a character or scene choice, not a global ceiling. Preserve the character's vocal identity and a natural, clearly articulated pace that lets the learner follow the written text and understand the speech. Avoid fast voices when casting. In voice-design prompts, auditions and every synthesis part's style, omit directions that encourage faster speech, such as rapid, brisk, hurried or fast-paced delivery. Express urgency, excitement and interruption through tone, emphasis and pauses without requesting acceleration. Do not add a generic 'speak slowly' instruction to every voice. A naturally slow or measured character may retain that pace; carry the character's baseline into chapter styles as well as the audition prompt.

## Synthesis and caching

For the working Interactions API shape, sustained direction belongs in each text part's `speech_metadata.style`, separate from spoken text:

```json
{
  "model": "<model from casting>",
  "input": [{
    "type": "user_input",
    "content": [{
      "type": "text",
      "text": "<verbatim Lithuanian part>",
      "annotations": [{"type": "speech_metadata", "style": "<role baseline and contextual delivery>"}]
    }]
  }],
  "response_format": {"type": "audio", "mime_type": "audio/l16", "sample_rate": 24000},
  "generation_config": {"speech_config": [{"voice": "<saved voiceId>"}]}
}
```

This is the request shape used successfully in the project's current recordings. Check current official provider documentation if the API rejects the schema or before adopting another model. Point-event tags are optional; use only documented tags and verify that tags/instructions are not spoken. Do not use arbitrary numeric or alphabetic markers as separators: they can leak into the audio.

With these custom voices, a batch contains one role. Combine compatible paragraphs or separated parts of that role within the current chapter, preserving per-part style and enough detectable pauses to restore scene order. Respect current input/output limits; a larger request is useful only if its parts can be aligned reliably. Cache the request fingerprint, response metadata and original lossless PCM before further processing. Cache identity includes model, voice, text and performance instructions. Resume from matching cached recordings instead of repeating successful requests.

Use returned rate/channel/sample-width metadata, validate PCM, and keep exact sample counts. Treat quota responses as evidence: wait according to the retry information for a minute limit; preserve completed work and stop on an exhausted allowance. Do not enable billing or switch providers without the user's authorization; an already-authorized paid project does not require repeated permission. Playback in the reader must never call Gemini.

## Loudness and pace

Measure integrated LUFS and true peak for rendered voices. Use a common target from the casting file (the current book uses −23 LUFS and a −1.5 dBTP ceiling). Apply a measured constant gain rather than automatic gain changes inside a line; retain original PCM separately. Recheck loudness after any tempo processing.

Achieve a learner-friendly natural pace through voice selection and synthesis instructions without prescribing slow speech for every role. Review new auditions and recordings for speech the learner can comfortably follow while reading. Preserve accepted audio; do not regenerate it solely for this new pace rule.

If a recording needs a tempo correction for a separate audio-repair task, use processing that preserves pitch, record its factor and affected source, and realign afterwards. Tell the user whether a requested pace change was synthesis or postprocessing. An already slowed recording must not be slowed again on recut.

## Sentence clips and exact timeline

Choose tooltip fragments by the semantic and mobile-reading guidance in [language-and-reader.md](language-and-reader.md), including the 4–7 word target and soft 8-word review threshold. Short sentences may remain whole; long sentences should have several natural support fragments rather than becoming oversized tooltips. Whole sentences can remain synthesis/source-recording units so delivery stays connected; they are not the default learning-fragment size.

A clip boundary requires both a meaningful text boundary and a verified spoken pause. Prefer clause punctuation; an unpunctuated semantic boundary is also acceptable when the actual recording supplies a safe pause. An arbitrary space or a word count alone never justifies a cut. If a desired tooltip boundary has no safe audio pause, preserve the recording; independent tooltip and playback spans must be handled in authorized reader work rather than truncating speech or silently forcing oversized learning fragments. A skill-only request does not authorize that implementation. Match each fragment's translation and notes locally; preserve the joined paragraph text and translation exactly when merely resegmenting existing material.

Align the complete spoken word sequence to the reviewed plan, then restore original narrative order. Local Lithuanian recognition with word timestamps can provide lexical hints; its timing alone is not a safe cut. Inspect actual low-energy intervals on the waveform (and the spectrogram if needed), choose a cut inside the correct interval and check both adjacent clips' first/last spoken words. Quiet breath or a gap after a neighbouring word can look like a valid pause: verify that the last intended word remains on the left and the first intended word starts the right. Recognition may misspell names; resolve uncertain short clips using a wider source span rather than accepting a missing word.

Join processed runs by exact PCM sample counts. Never apply a fixed offset at a voice change, and never copy Azure-specific timing corrections to Gemini. Any safety padding stays inside the measured local pause; it is not a cumulative shift. Reject missing/duplicated words, overlapping cues and speech truncated by cuts.

For recutting existing aligned audio without synthesis, use `scripts/recut-gemini-sentence-audio.py`. It needs the active book/manifests with aligned word sequences and the matching cached chapter WAVs. Write to a new output directory and a candidate book file first:

```bash
python3 scripts/recut-gemini-sentence-audio.py books/<book-id>.json \
  --source-wavs author-plans/audio/<book-id>/<source-version> \
  --output-directory assets/audio/<book-id>/<new-version> \
  --work-directory author-plans/audio/<book-id>/<new-work-version> \
  --output-book /tmp/<book-id>-candidate.json
```

The recutter proposes boundaries from word hints and measured gaps; independently recognize/review its clips before installing the candidate. It supports reviewed `boundary-overrides.json` in the work directory. A boundary-only correction should reuse existing PCM, not regenerate narration.

## Reader delivery

Keep chapter MP3s, item MP3s and versioned manifests under `assets/audio/<book-id>/...`, and update the canonical book's audio references together. Manifest cues cover the whole joined PCM timeline without gaps/overlaps and identify the matching items. Increment `timingVersion` when boundaries change so the shared reader does not reuse stale audio/timing. Keep raw audio, recognition reports, audition artifacts and intermediate plans out of rendered site assets.

Before delivery, verify complete text/cast coverage, sentence boundaries, the suspect adjacent clips, contiguous PCM timing and decodable MP3s. Run the project's Node/Python checks, then check chapter and item playback with synchronization in the shared reader. Mute automated playback only for the check; restore ordinary audio and leave players stopped. For publishing scope and delivery of the authorized chapter or batch, follow [reader-delivery.md](reader-delivery.md) and the current user request; distinguish a local commit from a verified deployment.
