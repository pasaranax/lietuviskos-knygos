#!/usr/bin/env python3
"""Generate static MP3s from sample-aligned single-voice Azure recordings.

Requires ffmpeg and `pip install azure-cognitiveservices-speech==1.51.2`.
Example (block numbers are one-based, manually reviewed speaking parts only):
  python scripts/generate-chapter-audio.py books/jusu-iprastas-uzsakymas.json \
    --chapter 1 --female-blocks 49 51 --work-dir /tmp/book-speech

The work directory caches lossless audio and word events to avoid repeat API usage.
Azure bookmark reference:
https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-structure#bookmark-element
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import time
import unicodedata
import wave
from xml.sax.saxutils import escape


AUDIO_TIMING_VERSION = 3


def plain_text(text):
    # Remove stress accents only; keep Lithuanian letters (ą, ė, ū, č, ...).
    return unicodedata.normalize("NFC", "".join(
        c for c in unicodedata.normalize("NFD", text) if c not in "\u0300\u0301\u0303"
    ))


def chapter_word_count(chapter):
    return sum(
        len(re.findall(r"[^\W\d_]+(?:[-’'][^\W\d_]+)*", plain_text(item["text"])))
        for block in chapter["blocks"] for item in block["items"]
    )


def chapter_length_report(chapter, limits):
    count = chapter_word_count(chapter)
    if not 0 < limits["min"] <= limits["max"]:
        raise ValueError("Invalid chapter length guidance")
    report = f"Chapter length: {count} words (usual range {limits['min']}–{limits['max']})"
    if not limits["min"] <= count <= limits["max"]:
        report += (
            ". Needs editorial review of scene completeness and learning load; "
            "length alone does not decide readiness."
        )
    return report


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


def build_voice_runs(chapter, female_blocks, narrator_spans):
    """Keep paragraph prosody; a cloud request never switches voices."""
    _, phrases = build_ssml(chapter, female_blocks, narrator_spans)
    runs = []
    previous_block = None
    for phrase in phrases:
        for index, segment in enumerate(phrase.get("segments") or [phrase]):
            if not runs or runs[-1]["voice"] != segment["voice"]:
                if runs:
                    runs[-1]["ssml"] += "</p></voice></speak>"
                runs.append(dict(
                    voice=segment["voice"], parts=[],
                    ssml='<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
                         f'xml:lang="lt-LT"><voice name="{segment["voice"]}"><p>',
                ))
            elif phrase["block"] != previous_block:
                runs[-1]["ssml"] += "</p><p>"
            run = runs[-1]
            mark = phrase["mark"] + (f"-s-{index}" if index else "")
            run["ssml"] += f'<bookmark mark="{mark}"/>'
            run["ssml"] += escape(segment["text"])
            run["parts"].append(dict(mark=mark, phraseMark=phrase["mark"],
                                     text=segment["text"]))
            if index == len(phrase.get("segments") or [phrase]) - 1:
                run["ssml"] += " "
            previous_block = phrase["block"]
    runs[-1]["ssml"] += "</p></voice></speak>"
    return runs, phrases


def align_voice_runs(phrases, runs):
    """Derive phrase cuts from covered words, and join by integer PCM lengths."""
    sample_rate = runs[0]["sampleRate"]
    aligned = {p["mark"]: dict(p) for p in phrases}
    pcm, provenance, base = [], [], 0
    word_tokens = lambda text: re.findall(r"[^\W_]+(?:[-’'][^\W_]+)*", text.casefold())
    previous_phrase = None
    for run in runs:
        if run["sampleRate"] != sample_rate or len(run["pcm"]) % 2:
            raise ValueError("Incompatible PCM recordings")
        frame_count = len(run["pcm"]) // 2
        previous_end = 0
        cursor = 0
        events = sorted(run["words"], key=lambda w: w["start"])
        for part in run["parts"]:
            # Azure can return textOffset=-1 after closing quotes. Match the exact
            # spoken token sequence instead; punctuation is not a spoken word.
            expected = word_tokens(part["text"])
            words, tokens = [], []
            while cursor < len(events) and len(tokens) < len(expected):
                word = events[cursor]
                words.append(word)
                tokens += word_tokens(word["text"])
                cursor += 1
            if not words or tokens != expected:
                raise ValueError(f"Incomplete word coverage at {part['mark']}")
            for word in words:
                if not 0 <= word["start"] <= word["end"] <= frame_count / sample_rate:
                    raise ValueError(f"Word outside its recording at {part['mark']}")
                if word["start"] * sample_rate < previous_end - 1:
                    raise ValueError(f"Word overlap at {part['mark']}")
                previous_end = round(word["end"] * sample_rate)
            first = round(words[0]["start"] * sample_rate)
            last = round(words[-1]["end"] * sample_rate)
            phrase = aligned[part["phraseMark"]]
            if "startFrame" not in phrase:
                # Split the gap between words, not a guessed gap between voices.
                prior_end = 0 if previous_phrase is None else aligned[previous_phrase]["speechEndFrame"] - base
                cut = 0 if part is run["parts"][0] else (prior_end + first) // 2
                phrase["startFrame"] = base + cut
                phrase["speechStartFrame"] = base + first
            phrase["speechEndFrame"] = base + last
            previous_phrase = part["phraseMark"]
        if cursor != len(events):
            raise ValueError("Extra words outside submitted phrase ranges")
        provenance.append(dict(voice=run["voice"], startFrame=base, frameCount=frame_count,
                               sourceSha256=hashlib.sha256(run["ssml"].encode()).hexdigest()))
        pcm.append(run["pcm"])
        base += frame_count
    result = [aligned[p["mark"]] for p in phrases]
    for index, phrase in enumerate(result):
        end = result[index + 1]["startFrame"] if index + 1 < len(result) else base
        phrase["endFrame"] = end
        if not 0 <= phrase["startFrame"] <= phrase["speechStartFrame"] <= phrase["speechEndFrame"] <= end <= base:
            raise ValueError(f"Phrase cut truncates speech at {phrase['mark']}")
        if end <= phrase["startFrame"]:
            raise ValueError("Empty phrase recording")
        phrase.update(start=phrase["startFrame"] / sample_rate, end=end / sample_rate)
    return b"".join(pcm), result, provenance


def synthesize_voice_runs(runs, work_dir, credentials_path):
    synthesizer, last_request = None, 0
    for index, run in enumerate(runs):
        digest = hashlib.sha256(run["ssml"].encode()).hexdigest()
        wav_path = work_dir / f"{digest}.wav"
        events_path = work_dir / f"{digest}.words.json"
        if wav_path.exists() and events_path.exists():
            events = json.loads(events_path.read_text())
            print(f"Using cached voice run {index + 1}/{len(runs)}", flush=True)
        else:
            import azure.cognitiveservices.speech as speechsdk
            if synthesizer is None:
                credentials = json.loads(credentials_path.read_text())
                if credentials.get("sku") != "F0":
                    raise SystemExit("Expected the configured free F0 resource")
                config = speechsdk.SpeechConfig(subscription=credentials["SPEECH_KEY"],
                                               region=credentials["SPEECH_REGION"])
                config.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm)
                synthesizer = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=None)
                events = {}
                synthesizer.synthesis_word_boundary.connect(lambda e: events["words"].append(
                    dict(text=e.text, start=e.audio_offset / 10000000,
                         end=e.audio_offset / 10000000 + e.duration.total_seconds(),
                         textOffset=e.text_offset, wordLength=e.word_length)
                ) if e.boundary_type == speechsdk.SpeechSynthesisBoundaryType.Word else None)
            # F0 allows 20 requests/minute. This throttle affects requests, never timing.
            time.sleep(max(0, 3.1 - (time.monotonic() - last_request)))
            events = dict(words=[])
            last_request = time.monotonic()
            print(f"Synthesizing voice run {index + 1}/{len(runs)} ({run['voice']})", flush=True)
            result = synthesizer.speak_ssml_async(run["ssml"]).get()
            if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
                raise SystemExit(f"Synthesis failed: {result.cancellation_details}")
            wav_path.write_bytes(result.audio_data)
            events_path.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n")
            (work_dir / f"{digest}.ssml").write_text(run["ssml"])
        with wave.open(str(wav_path), "rb") as recording:
            if recording.getnchannels() != 1 or recording.getsampwidth() != 2 or recording.getframerate() != 24000:
                raise ValueError("Expected mono 24 kHz 16-bit PCM")
            run.update(sampleRate=recording.getframerate(), pcm=recording.readframes(recording.getnframes()),
                       words=events["words"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book", type=Path)
    parser.add_argument("--chapter", type=int, required=True)
    parser.add_argument("--female-blocks", type=int, nargs="*", default=[])
    parser.add_argument("--casting", type=Path, help="Reviewed femaleBlocks/narratorSpans JSON, or a previous manifest")
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--check-length-only", action="store_true", help="Report narrative length and editorial guidance without synthesis")
    parser.add_argument("--credentials", type=Path,
                        default=Path.home() / ".azure/lietuviskos-knygos-speech.json")
    args = parser.parse_args()
    book_path = args.book.resolve()
    book = json.loads(book_path.read_text())
    if not 1 <= args.chapter <= len(book["chapters"]):
        parser.error("Chapter number is out of range")
    chapter = book["chapters"][args.chapter - 1]
    policies = json.loads((Path(__file__).resolve().parents[1] / "author-plans/chapter-lengths.json").read_text())
    limits = policies.get(book["id"])
    if limits is None and args.check_length_only:
        parser.error("Record the book's length guidance in author-plans/chapter-lengths.json first")
    if limits is not None:
        try:
            report = chapter_length_report(chapter, limits)
        except ValueError as error:
            parser.error(str(error))
        print(report, flush=True)
    if args.check_length_only:
        return
    if args.work_dir is None:
        parser.error("--work-dir is required for synthesis")
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
    runs, phrases = build_voice_runs(chapter, args.female_blocks, narrator_spans)
    synthesize_voice_runs(runs, args.work_dir, args.credentials)
    frames, phrases, voice_runs = align_voice_runs(phrases, runs)
    sample_rate = runs[0]["sampleRate"]
    frame_count = len(frames) // 2
    params = (1, 2, sample_rate, frame_count, "NONE", "not compressed")
    duration = frame_count / sample_rate

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
    for phrase in phrases:
        first = phrase["startFrame"] * 2
        last = phrase["endFrame"] * 2
        filename = phrase["mark"] + ".mp3"
        encode(frames[first:last], output / filename)
        phrase["audio"] = str(relative_dir / filename)

    # Re-read to preserve unrelated edits made while the cloud request was running.
    current = json.loads(book_path.read_text())
    current_chapter = current["chapters"][args.chapter - 1]
    if current_chapter != chapter:
        raise SystemExit("Chapter changed during synthesis; audio saved, book left untouched")
    current_chapter["audio"] = str(relative_dir / "chapter.mp3")
    for phrase in phrases:
        current_chapter["blocks"][phrase["block"]]["items"][phrase["item"]]["audio"] = phrase["audio"]
    manifest = dict(provider="Azure Speech", sourceSha256=digest,
                    timingVersion=AUDIO_TIMING_VERSION,
                    alignmentMethod="single-voice-word-boundaries",
                    voiceRuns=voice_runs, frameCount=frame_count,
                    sampleRate=sample_rate,
                    duration=duration, phrases=phrases,
                    casting=dict(femaleBlocks=args.female_blocks, narratorSpans=narrator_spans))
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    temporary = book_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(book_path)
    print(f"Saved chapter ({duration:.2f}s) and {len(phrases)} clips to {output}", flush=True)


if __name__ == "__main__":
    main()
