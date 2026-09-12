#!/usr/bin/env python3
"""Generate static chapter/phrase MP3s with Azure bookmarks (no browser credentials).

Requires ffmpeg and `pip install azure-cognitiveservices-speech==1.51.2`.
Example (block numbers are one-based, manually reviewed speaking parts only):
  python scripts/generate-chapter-audio.py books/jusu-iprastas-uzsakymas.json \
    --chapter 1 --female-blocks 49 51 --work-dir /tmp/book-speech

The work directory caches lossless audio and offsets to avoid repeat API usage.
Azure bookmark reference:
https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-structure#bookmark-element
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import unicodedata
import wave
from xml.sax.saxutils import escape


def plain_text(text):
    # Remove stress accents only; keep Lithuanian letters (ą, ė, ū, č, ...).
    return unicodedata.normalize("NFC", "".join(
        c for c in unicodedata.normalize("NFD", text) if c not in "\u0300\u0301\u0303"
    ))


def build_ssml(chapter, female_blocks, narrator_spans):
    phrases, parts, used = [], ['<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="lt-LT">'], set()
    previous_voice = None
    for bi, block in enumerate(chapter["blocks"]):
        voice = "lt-LT-OnaNeural" if bi + 1 in female_blocks else "lt-LT-LeonasNeural"
        block_parts = []
        for ii, item in enumerate(block["items"]):
            mark, text = f"p-{bi:03d}-i-{ii:03d}", plain_text(item["text"])
            key = f"{bi + 1}:{ii + 1}"
            spans = narrator_spans.get(key, [])
            if key in narrator_spans:
                used.add(key)
            ranges = []
            for span in spans:
                if not span or text.count(span) != 1:
                    raise ValueError(f"Narrator span must match exactly once at {key}: {span!r}")
                ranges.append((text.index(span), text.index(span) + len(span)))
            segments, cursor = [], 0
            for start, end in sorted(ranges):
                if start < cursor:
                    raise ValueError(f"Overlapping narrator spans at {key}")
                if start > cursor:
                    segments.append(dict(text=text[cursor:start], voice=voice))
                segments.append(dict(text=text[start:end], voice="lt-LT-LeonasNeural"))
                cursor = end
            if cursor < len(text):
                segments.append(dict(text=text[cursor:], voice=voice))
            phrase = dict(mark=mark, block=bi, item=ii, text=text, voice=voice)
            if spans:
                phrase["segments"] = segments
            phrases.append(phrase)
            for si, segment in enumerate(segments):
                markup = (f'<bookmark mark="{mark}"/>' if si == 0 else "") + escape(segment["text"])
                if si == len(segments) - 1:
                    markup += " "
                block_parts.append((segment["voice"], markup))
        for index, (part_voice, markup) in enumerate(block_parts):
            if part_voice != previous_voice:
                if index:
                    parts.append("</p>")
                if previous_voice:
                    parts.append("</voice>")
                parts.append(f'<voice name="{part_voice}"><p>')
                previous_voice = part_voice
            elif index == 0:
                parts.append("<p>")
            parts.append(markup)
        parts.append("</p>")
    if used != set(narrator_spans):
        raise ValueError("Narrator spans refer to missing phrases")
    parts.append("</voice></speak>")
    return "".join(parts), phrases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book", type=Path)
    parser.add_argument("--chapter", type=int, required=True)
    parser.add_argument("--female-blocks", type=int, nargs="*", default=[])
    parser.add_argument("--casting", type=Path, help="Reviewed femaleBlocks/narratorSpans JSON, or a previous manifest")
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--credentials", type=Path,
                        default=Path.home() / ".azure/lietuviskos-knygos-speech.json")
    args = parser.parse_args()
    book_path = args.book.resolve()
    book = json.loads(book_path.read_text())
    if not 1 <= args.chapter <= len(book["chapters"]):
        parser.error("Chapter number is out of range")
    chapter = book["chapters"][args.chapter - 1]
    casting = json.loads(args.casting.read_text()) if args.casting else {}
    casting = casting.get("casting", casting)
    args.female_blocks = casting.get("femaleBlocks", args.female_blocks)
    narrator_spans = casting.get("narratorSpans", {})
    for number in args.female_blocks:
        if not 1 <= number <= len(chapter["blocks"]) or chapter["blocks"][number - 1]["type"] != "dialogue":
            parser.error("Female block numbers must identify reviewed dialogue blocks")

    ssml, phrases = build_ssml(chapter, args.female_blocks, narrator_spans)
    digest = hashlib.sha256(ssml.encode()).hexdigest()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    wav_path = args.work_dir / f"{digest}.wav"
    marks_path = args.work_dir / f"{digest}.json"
    if wav_path.exists() and marks_path.exists():
        offsets = json.loads(marks_path.read_text())
        print("Using cached synthesis", flush=True)
    else:
        import azure.cognitiveservices.speech as speechsdk
        credentials = json.loads(args.credentials.read_text())
        if credentials.get("sku") != "F0":
            raise SystemExit("Expected the configured free F0 resource")
        config = speechsdk.SpeechConfig(subscription=credentials["SPEECH_KEY"],
                                       region=credentials["SPEECH_REGION"])
        config.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm)
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=None)
        offsets = {}
        synthesizer.bookmark_reached.connect(lambda event: offsets.update({event.text: event.audio_offset / 10000000}))
        print(f"Synthesizing {len(phrases)} phrases, {sum(len(p['text']) for p in phrases)} characters", flush=True)
        result = synthesizer.speak_ssml_async(ssml).get()
        if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
            raise SystemExit(f"Synthesis failed: {result.cancellation_details}")
        wav_path.write_bytes(result.audio_data)
        marks_path.write_text(json.dumps(offsets, indent=2) + "\n")
        (args.work_dir / f"{digest}.ssml").write_text(ssml)

    if set(offsets) != {p["mark"] for p in phrases}:
        raise SystemExit("Missing/extra bookmarks; refusing to attach incomplete audio")
    with wave.open(str(wav_path), "rb") as recording:
        params = recording.getparams()
        frames = recording.readframes(params.nframes)
    duration = params.nframes / params.framerate
    starts = [offsets[p["mark"]] for p in phrases]
    starts[0] = 0  # Include the initial breath/silence in the first clip.
    if not all(0 <= a < b <= duration for a, b in zip(starts, starts[1:] + [duration])):
        raise SystemExit("Invalid bookmark timing; refusing to cut audio")

    relative_dir = Path("assets/audio") / book["id"] / chapter["id"]
    output = book_path.parent.parent / relative_dir
    output.mkdir(parents=True, exist_ok=True)

    def encode(pcm, target):
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as clip:
            clip.setparams(params)
            clip.writeframes(pcm)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", str(target)],
                       input=buffer.getvalue(), check=True)

    encode(frames, output / "chapter.mp3")
    frame_bytes = params.nchannels * params.sampwidth
    for index, phrase in enumerate(phrases):
        start = starts[index]
        end = starts[index + 1] if index + 1 < len(phrases) else duration
        first = round(start * params.framerate) * frame_bytes
        last = round(end * params.framerate) * frame_bytes
        filename = phrase["mark"] + ".mp3"
        encode(frames[first:last], output / filename)
        phrase.update(start=start, end=end, audio=str(relative_dir / filename))

    # Re-read to preserve unrelated edits made while the cloud request was running.
    current = json.loads(book_path.read_text())
    current_chapter = current["chapters"][args.chapter - 1]
    if current_chapter != chapter:
        raise SystemExit("Chapter changed during synthesis; audio saved, book left untouched")
    current_chapter["audio"] = str(relative_dir / "chapter.mp3")
    for phrase in phrases:
        current_chapter["blocks"][phrase["block"]]["items"][phrase["item"]]["audio"] = phrase["audio"]
    manifest = dict(provider="Azure Speech", sourceSha256=digest, sampleRate=params.framerate,
                    duration=duration, phrases=phrases,
                    casting=dict(femaleBlocks=args.female_blocks, narratorSpans=narrator_spans))
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    temporary = book_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(book_path)
    print(f"Saved chapter ({duration:.2f}s) and {len(phrases)} clips to {output}", flush=True)


if __name__ == "__main__":
    main()
