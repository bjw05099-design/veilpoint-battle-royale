"""Cross-platform authoring/tool verification. Does not register a PC or build UE."""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(arguments):
    subprocess.run([str(a) for a in arguments], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install-python', action='store_true')
    parser.add_argument('--tool-root', type=Path, default=ROOT/'.tools')
    args = parser.parse_args()
    root = args.tool_root.resolve()
    os.environ['VEILPOINT_TOOL_ROOT'] = str(root)
    paths = json.loads((root/'paths.json').read_text(encoding='utf-8'))
    venv = root/'asset-python'
    python = venv/('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if args.install_python:
        run([sys.executable, '-m', 'venv', venv])
        run([python, '-m', 'pip', 'install', '--only-binary=:all:', '-r',
             'tools/game-dev/python-requirements.txt', '--report', root/'python-install-report.json'])
    run(['node', 'scripts/game-dev-doctor.cjs', '--strict-assets', '--output', 'dist/game-dev/current-host.json'])
    run(['node', 'scripts/export-harbor-blender-recipe.cjs'])
    run([paths['blender'], '--background', '--factory-startup', '--threads', '2',
         '--python-exit-code', '1', '--python', 'scripts/blender-build-harbor.py', '--',
         'dist/game-assets/harbor/recipe.json', 'dist/game-assets/harbor'])
    run(['node', 'tools/game-dev/process-harbor.mjs'])
    run([python, 'tools/game-dev/smoke-python-tools.py'])
    run(['node', 'tools/game-dev/smoke-tracy.cjs'])
    if shutil.which('ffmpeg') and shutil.which('ffprobe'):
        run([sys.executable, 'scripts/verify-audio-toolchain.py'])
    else:
        print('FFmpeg audio smoke NOT RUN on this host (install FFmpeg/ffprobe).')


if __name__ == '__main__':
    main()
