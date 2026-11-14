"""Verify FFmpeg/ffprobe with a synthetic calibration tone, not a game sound."""
import json
import subprocess
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory(prefix='veilpoint-audio-') as folder:
    output = Path(folder)/'calibration.wav'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
                    'sine=frequency=1000:duration=0.125', '-ar', '48000', '-ac', '1',
                    '-c:a', 'pcm_s16le', str(output)], check=True, timeout=30)
    result = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                        '-of', 'json', str(output)], text=True, timeout=30))['streams'][0]
    assert result['sample_rate'] == '48000' and result['channels'] == 1
    assert abs(float(result['duration'])-.125) < .001
    print(json.dumps({'ffmpegPcmRoundTrip': True, 'sampleRate': 48000, 'channels': 1,
                      'syntheticTestToneOnly': True}))
