"""Recut cached narration into sentences; never call a speech provider."""

import argparse
import array
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import unicodedata
import wave


def plain(text):
    return unicodedata.normalize('NFC', ''.join(
        c for c in unicodedata.normalize('NFD', text) if c not in '\u0300\u0301\u0303'))


def tokens(text):
    return re.findall(r'[^\W_]+', plain(text))


def key(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.casefold())
                   if not unicodedata.combining(c))


def sentences(text):
    result = []
    start = 0
    for match in re.finditer(r'[.!?]+[»“”"]*(?=\s|$)', text):
        result.append(text[start:match.end()].strip())
        start = match.end()
    if text[start:].strip():
        result.append(text[start:].strip())
    return result


def sentence_items(items):
    result = []
    pending = []
    for item in items:
        texts = sentences(item['text'])
        translations = sentences(item['translation'])
        assert len(texts) == len(translations), ('translation split needs review', item)
        notes = item.get('note', '').splitlines()
        assigned = set()
        for text, translation in zip(texts, translations):
            words = {key(t) for t in tokens(text)}
            relevant = []
            for index, line in enumerate(notes):
                headers = re.findall(r'(?:^|;\s*)\*\*(.*?)\*\*\s*—', line)
                current_form = headers[1] if len(headers) > 1 else (headers[0] if headers else '')
                markers = {key(t) for t in tokens(current_form)}
                if len(texts) == 1 or words & markers:
                    relevant.append(line)
                    assigned.add(index)
            pending.append({'text': text, 'translation': translation, 'note': '\n'.join(relevant)})
            if re.search(r'[.!?][»“”"]*$', text):
                result.append({
                    'text': ' '.join(x['text'] for x in pending),
                    'translation': ' '.join(x['translation'] for x in pending),
                    'note': '\n'.join(dict.fromkeys(
                        line for x in pending for line in x['note'].splitlines() if line.strip()))})
                pending = []
        assert len(assigned) == len(notes), ('dictionary split needs review', item['text'],
                                           [n for i, n in enumerate(notes) if i not in assigned])
    assert not pending, ('unfinished sentence', pending)
    assert ' '.join(x['text'] for x in result) == ' '.join(x['text'] for x in items)
    assert ' '.join(x['translation'] for x in result) == ' '.join(x['translation'] for x in items)
    return result


def read_wav(path, rate):
    with wave.open(str(path)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, rate)
        return w.readframes(w.getnframes())


def write_wav(path, pcm, rate):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def gaps(path, rate, frames):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path),
                        '-af', 'silencedetect=noise=-42dB:d=0.12', '-f', 'null', '-'],
                       check=True, capture_output=True, text=True)
    result = []
    start = None
    for kind, time in re.findall(r'silence_(start|end):\s*([\d.]+)', r.stderr):
        frame = round(float(time) * rate)
        if kind == 'start':
            start = frame
        elif start is not None:
            result.append((start, frame))
            start = None
    if start is not None:
        result.append((start, frames))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('book', type=Path)
    parser.add_argument('--source-wavs', type=Path, required=True)
    parser.add_argument('--output-directory', type=Path, required=True)
    parser.add_argument('--work-directory', type=Path, required=True)
    parser.add_argument('--output-book', type=Path, required=True)
    args = parser.parse_args()
    book = json.loads(args.book.read_text())
    args.work_directory.mkdir(parents=True, exist_ok=True)
    padded = args.work_directory / 'asr-inputs'
    padded.mkdir(exist_ok=True)
    overrides_path = args.work_directory / 'boundary-overrides.json'
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    for chapter in book['chapters']:
        source_audio = Path(chapter['audio'])
        old = json.loads((source_audio.parent / 'manifest.json').read_text())
        rate = old['sampleRate']
        source_wav = args.source_wavs / chapter['id'] / 'chapter.wav'
        pcm = read_wav(source_wav, rate)
        assert len(pcm) // 2 == old['frameCount']
        quiet = gaps(source_wav, rate, old['frameCount'])
        words_by_block = {}
        for phrase in old['phrases']:
            words_by_block.setdefault(phrase['block'], []).extend(phrase['words'])
        phrases = []
        for bi, block in enumerate(chapter['blocks']):
            block['items'] = sentence_items(block['items'])
            words = words_by_block[bi]
            assert [key(w['word']) for w in words] == [key(t) for i in block['items'] for t in tokens(i['text'])]
            at = 0
            for ii, item in enumerate(block['items']):
                n = len(tokens(item['text']))
                phrases.append({'mark': f'p-{bi:03d}-i-{ii:03d}', 'block': bi, 'item': ii,
                                'text': plain(item['text']), 'words': words[at:at+n]})
                at += n
        cuts = [0]
        boundaries = []
        runs = {r['partId']: r for r in old['voiceRuns']}
        for left, right in zip(phrases, phrases[1:]):
            last, first = left['words'][-1], right['words'][0]
            hint = (last['endFrame'] + first['startFrame']) // 2
            lower, upper = last['startFrame'], first['endFrame']
            if last['part'] != first['part']:
                hint = runs[first['part']]['startFrame']
                lower = hint - round(rate * .8)
                upper = hint + round(rate * .8)
            candidates = []
            for a, b in quiet:
                lo = max(a+round(rate*.01), cuts[-1]+1, lower-round(rate*.1))
                hi = min(b-round(rate*.01), upper+round(rate*.1))
                distance = max(a-hint, hint-b, 0)
                if lo <= hi and distance <= rate*.8:
                    cut = min(max((a+b)//2, lo), hi)
                    candidates.append((distance, cut, a, b))
            assert candidates, ('sentence has no safe pause', chapter['id'], left['text'], right['text'], hint/rate)
            _, cut, a, b = min(candidates)
            override = overrides.get(chapter['id'] + ':' + left['mark'])
            if override is not None:
                cut = round(override * rate)
                a, b = next((a, b) for a, b in quiet if a <= cut <= b)
            cuts.append(cut)
            boundaries.append({'before': left['mark'], 'after': right['mark'], 'hintFrame': hint,
                               'cutFrame': cut, 'pause': {'startFrame': a, 'endFrame': b, 'thresholdDbfs': -42},
                               'shiftMs': (cut-hint)/rate*1000})
        cuts.append(len(pcm)//2)
        destination = args.output_directory / chapter['id']
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_audio, destination / 'chapter.mp3')
        chapter['audio'] = str(destination / 'chapter.mp3')
        for index, phrase in enumerate(phrases):
            start, end = cuts[index:index+2]
            clip = pcm[start*2:end*2]
            samples = array.array('h', clip)
            spoken = [i for i, v in enumerate(samples) if abs(v) > 261]
            assert spoken
            phrase.update(startFrame=start, endFrame=end, start=start/rate, end=end/rate,
                          speechStartFrame=start+max(0, spoken[0]-120),
                          speechEndFrame=start+min(len(samples), spoken[-1]+121),
                          audio=str(destination / (phrase['mark']+'.mp3')))
            chapter['blocks'][phrase['block']]['items'][phrase['item']]['audio'] = phrase['audio']
            temp = args.work_directory / 'encode.wav'
            write_wav(temp, clip, rate)
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(temp), '-codec:a', 'libmp3lame',
                            '-q:a', '2', phrase['audio']], check=True)
            write_wav(padded / (chapter['id']+'-'+phrase['mark']+'.wav'), bytes(rate*2)+clip+bytes(rate*2), rate)
        manifest = dict(old, timingVersion=5, phrases=phrases, waveformBoundaries=boundaries,
                        sourceAudioSha256=hashlib.sha256(pcm).hexdigest(), audioSegmentation='sentences',
                        alignmentMethod='Sentence boundaries from word alignment and measured pauses on cached PCM')
        (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps({'chapter': chapter['id'], 'sentences': len(phrases), 'duration': old['duration']}), flush=True)
    args.output_book.write_text(json.dumps(book, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    main()
