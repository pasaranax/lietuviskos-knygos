import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('chapter_audio', Path(__file__).resolve().parents[1] / 'scripts/generate-chapter-audio.py')
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


class CastingTest(unittest.TestCase):
    def test_narrator_inside_female_dialogue_keeps_text_and_one_bookmark(self):
        self.assertTrue(hasattr(audio, 'build_ssml'), 'reviewed mixed-voice casting is missing')
        text = '— Ačiū. Aš Ieva, — pasakė ji.'
        chapter = {'blocks': [{'type': 'dialogue', 'items': [{'text': text}]}]}
        ssml, phrases = audio.build_ssml(chapter, [1], {'1:1': ['— pasakė ji.']})
        root = ET.fromstring(ssml)
        ns = {'s': 'http://www.w3.org/2001/10/synthesis'}
        voices = root.findall('s:voice', ns)
        self.assertEqual(['lt-LT-OnaNeural', 'lt-LT-LeonasNeural'], [v.attrib['name'] for v in voices])
        self.assertEqual(text, ''.join(root.itertext()).strip())
        self.assertEqual(1, len(root.findall('.//s:bookmark', ns)))
        self.assertEqual(text, ''.join(s['text'] for s in phrases[0]['segments']))
        self.assertIn('pasakė ji', ''.join(voices[1].itertext()))

    def test_narration_can_precede_resumed_female_speech(self):
        self.assertTrue(hasattr(audio, 'build_ssml'))
        text = '— pasakė Ieva. — Taip buvo parašyta.'
        chapter = {'blocks': [{'type': 'dialogue', 'items': [{'text': text}]}]}
        _, phrases = audio.build_ssml(chapter, [1], {'1:1': ['— pasakė Ieva.']})
        self.assertEqual(['lt-LT-LeonasNeural', 'lt-LT-OnaNeural'], [s['voice'] for s in phrases[0]['segments']])

    def test_stale_casting_is_rejected_before_synthesis(self):
        self.assertTrue(hasattr(audio, 'build_ssml'))
        chapter = {'blocks': [{'type': 'dialogue', 'items': [{'text': '— Ačiū.'}]}]}
        with self.assertRaises(ValueError):
            audio.build_ssml(chapter, [1], {'1:1': ['missing words']})
        with self.assertRaises(ValueError):
            audio.build_ssml(chapter, [1], {'2:1': ['— Ačiū.']})


if __name__ == '__main__':
    unittest.main()
