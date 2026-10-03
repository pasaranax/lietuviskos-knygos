import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('ffprobe'), 'ffprobe is required for audio checks')
class ChapterSeekingTest(unittest.TestCase):
    def test_chapter_byte_seeks_stay_on_the_phrase_timeline(self):
        """Browser byte-based MP3 seeking must not jump to different speech."""
        book = json.loads((ROOT / 'books/keliaujanti-biblioteka.json').read_text())
        for chapter in book['chapters']:
            with self.subTest(chapter=chapter['id']):
                packets = json.loads(subprocess.check_output([
                    'ffprobe', '-v', 'error', '-show_packets', '-show_entries',
                    'packet=pts_time,pos,size,duration_time', '-of', 'json',
                    str(ROOT / chapter['audio']),
                ]))['packets']
                first_byte = int(packets[0]['pos'])
                last = packets[-1]
                byte_count = int(last['pos']) + int(last['size']) - first_byte
                duration = float(last['pts_time']) + float(last['duration_time'])
                drift = max(abs(
                    float(packet['pts_time']) -
                    (int(packet['pos']) - first_byte) / byte_count * duration
                ) for packet in packets)
                self.assertLess(drift, 0.1, f"byte seek drifts by {drift:.3f}s")


if __name__ == '__main__':
    unittest.main()
