import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET


spec = importlib.util.spec_from_file_location('chapter_audio', Path(__file__).resolve().parents[1] / 'scripts/generate-chapter-audio.py')
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


class AudioAlignmentTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(audio, 'build_voice_runs'), 'single-voice synthesis is missing')
        self.assertTrue(hasattr(audio, 'align_voice_runs'), 'sample-based alignment is missing')

    def recordings(self, runs, timings, lengths):
        for index, (run, intervals, frame_count) in enumerate(zip(runs, timings, lengths), 1):
            run.update(sampleRate=1000, pcm=index.to_bytes(2, 'little') * frame_count, words=[])
            for part, (start, end) in zip(run['parts'], intervals):
                text = part['text'].strip().rstrip('.')
                run['words'].append(dict(text=text, start=start, end=end,
                                         textOffset=run['ssml'].index(text), wordLength=len(text)))

    def test_cut_points_follow_words_and_actual_pcm_lengths_at_voice_changes(self):
        chapter = {'blocks': [
            {'type': 'paragraph', 'items': [{'text': 'Labas.'}, {'text': 'Rytas.'}]},
            {'type': 'dialogue', 'items': [{'text': 'Ačiū.'}]},
        ]}
        runs, phrases = audio.build_voice_runs(chapter, [2], {})
        self.recordings(runs, [[(.1, .4), (.65, .9)], [(.125, .475)]], [1337, 883])
        pcm, aligned, provenance = audio.align_voice_runs(phrases, runs)
        self.assertEqual(b'\x01\0' * 1337 + b'\x02\0' * 883, pcm)
        self.assertEqual([0, 525, 1337], [p['startFrame'] for p in aligned])
        self.assertEqual([525, 1337, 2220], [p['endFrame'] for p in aligned])
        self.assertEqual([100, 650, 1462], [p['speechStartFrame'] for p in aligned])
        self.assertEqual([400, 900, 1812], [p['speechEndFrame'] for p in aligned])
        self.assertEqual([0, 1337], [r['startFrame'] for r in provenance])

    def test_mixed_voice_phrase_is_not_split_or_advanced_by_voice_switches(self):
        chapter = {'blocks': [{'type': 'dialogue', 'items': [{'text': 'Taip. Sakė. Gerai.'}]}]}
        runs, phrases = audio.build_voice_runs(chapter, [1], {'1:1': ['Sakė.']})
        self.assertEqual(['lt-LT-OnaNeural', 'lt-LT-LeonasNeural', 'lt-LT-OnaNeural'], [r['voice'] for r in runs])
        self.recordings(runs, [[(.1, .4)], [(.1, .3)], [(.15, .5)]], [707, 613, 809])
        pcm, aligned, _ = audio.align_voice_runs(phrases, runs)
        self.assertEqual(1, len(aligned))
        self.assertEqual((0, 2129), (aligned[0]['startFrame'], aligned[0]['endFrame']))
        self.assertEqual(1820, aligned[0]['speechEndFrame'])
        self.assertEqual(4258, len(pcm))

    def test_missing_or_wrong_words_cannot_be_published_as_aligned_audio(self):
        chapter = {'blocks': [{'type': 'paragraph', 'items': [{'text': 'Labas.'}, {'text': 'Rytas.'}]}]}
        runs, phrases = audio.build_voice_runs(chapter, [], {})
        self.recordings(runs, [[(.1, .4), (.65, .9)]], [1000])
        runs[0]['words'].pop()
        with self.assertRaisesRegex(ValueError, 'word coverage'):
            audio.align_voice_runs(phrases, runs)

    def test_overlapping_words_are_rejected_instead_of_cutting_speech(self):
        chapter = {'blocks': [{'type': 'paragraph', 'items': [{'text': 'Labas.'}, {'text': 'Rytas.'}]}]}
        runs, phrases = audio.build_voice_runs(chapter, [], {})
        self.recordings(runs, [[(.1, .7), (.65, .9)]], [1000])
        with self.assertRaisesRegex(ValueError, 'overlap'):
            audio.align_voice_runs(phrases, runs)

    def test_words_after_closing_quotes_do_not_depend_on_invalid_ssml_offsets(self):
        chapter = {'blocks': [{'type': 'paragraph', 'items': [{'text': '„Rytas.“'}, {'text': 'Po juo.'}]}]}
        runs, phrases = audio.build_voice_runs(chapter, [], {})
        runs[0].update(sampleRate=1000, pcm=b'\0\0' * 1500, words=[
            dict(text='„Rytas', start=.1, end=.4, textOffset=148, wordLength=6),
            dict(text='“ Po', start=.8, end=.9, textOffset=-1, wordLength=4),
            dict(text='juo', start=1, end=1.2, textOffset=199, wordLength=3),
        ])
        _, aligned, _ = audio.align_voice_runs(phrases, runs)
        self.assertEqual((600, 800, 1200), (aligned[1]['startFrame'], aligned[1]['speechStartFrame'], aligned[1]['speechEndFrame']))

    def test_single_voice_runs_preserve_paragraphs_and_all_spoken_text(self):
        chapter = {'blocks': [
            {'type': 'paragraph', 'items': [{'text': 'Labas.'}]},
            {'type': 'paragraph', 'items': [{'text': 'Rytas.'}]},
            {'type': 'dialogue', 'items': [{'text': 'Ačiū.'}]},
        ]}
        runs, _ = audio.build_voice_runs(chapter, [3], {})
        ns = {'s': 'http://www.w3.org/2001/10/synthesis'}
        self.assertEqual(2, len(runs))
        self.assertEqual(2, len(ET.fromstring(runs[0]['ssml']).findall('.//s:p', ns)))
        self.assertEqual(['Labas. Rytas.', 'Ačiū.'], [' '.join(''.join(ET.fromstring(r['ssml']).itertext()).split()) for r in runs])
        self.assertTrue(all(len(ET.fromstring(r['ssml']).findall('s:voice', ns)) == 1 for r in runs))


if __name__ == '__main__':
    unittest.main()
