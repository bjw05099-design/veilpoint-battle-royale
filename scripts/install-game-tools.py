"""Install reviewed portable tools; no elevated privileges, services or listeners.

Python >=3.12. Archive origin and SHA-256 are pinned in the repository. Never
execute fetched scripts or delete/overwrite an existing unowned installation.
"""
import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'tools/game-dev/toolchain.lock.json'


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def safe_member(name):
    name = name.replace('\\', '/')
    parts = PurePosixPath(name)
    if not name or parts.is_absolute() or '..' in parts.parts or ':' in name:
        raise ValueError('Unsafe archive member')
    return name


def unpack(archive, destination):
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as bundle:
            for item in bundle.infolist():
                safe_member(item.filename)
                if (item.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('ZIP symbolic links are not accepted')
            bundle.extractall(destination)
            for item in bundle.infolist():
                mode = (item.external_attr >> 16) & 0o777
                if mode:
                    (Path(destination)/item.filename).chmod(mode)
    else:
        with tarfile.open(archive) as bundle:
            for item in bundle.getmembers():
                safe_member(item.name)
            bundle.extractall(destination, filter='data')


def executable_mode(destination, spec, host):
    if host == 'linux-x64':
        for name in spec.get('executables', [spec['executable']]):
            safe_member(name)
            file = destination/name
            if not file.is_file():
                raise RuntimeError('Declared tool executable is missing')
            file.chmod(file.stat().st_mode | 0o111)


def install(name, tool_root, host, lock=None):
    lock = lock or json.loads(LOCK.read_text(encoding='utf-8'))
    tool = lock['tools'][name]
    spec = tool['platforms'][host]
    destination = tool_root / (name + '-' + tool['version'])
    executable = destination / spec['executable']
    receipt = destination / 'veilpoint-install.json'
    if destination.exists():
        if not receipt.is_file():
            raise RuntimeError(f'Unowned installation exists: {destination}')
        old = json.loads(receipt.read_text(encoding='utf-8'))
        if old.get('archiveSha256') != spec['sha256'] or not executable.is_file():
            raise RuntimeError(f'Installation receipt mismatch: {destination}')
        if old.get('executableSha256') != digest(executable):
            raise RuntimeError(f'Installed executable changed: {destination}')
        executable_mode(destination, spec, host)
        return str(executable)
    url = urllib.parse.urlparse(spec['url'])
    if url.scheme != 'https' or url.hostname not in ('github.com', 'download.blender.org'):
        raise ValueError('Only reviewed HTTPS tool publishers are allowed')
    cache = tool_root / 'downloads'
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / Path(url.path).name
    if not archive.exists() or digest(archive) != spec['sha256']:
        temporary = archive.with_suffix(archive.suffix + '.part')
        print(f'Downloading {name} {tool["version"]}', flush=True)
        with urllib.request.urlopen(spec['url'], timeout=60) as source, temporary.open('wb') as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
        if digest(temporary) != spec['sha256']:
            temporary.unlink()
            raise RuntimeError('Archive SHA-256 mismatch; nothing installed')
        temporary.replace(archive)
    staging = Path(tempfile.mkdtemp(prefix=name+'-staging-', dir=tool_root))
    try:
        unpack(archive, staging)
        candidate = staging / spec['executable']
        if not candidate.is_file():
            raise RuntimeError('Publisher archive lacks expected executable')
        executable_mode(staging, spec, host)
        data = {'tool': name, 'version': tool['version'], 'platform': host,
                'source': tool['source'], 'license': tool['license'],
                'archiveSha256': spec['sha256'], 'executableSha256': digest(candidate)}
        (staging / receipt.name).write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return str(executable)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', nargs='+', choices=['agent-desktop', 'blender', 'runner', 'tracy'],
                        default=['agent-desktop', 'blender'])
    parser.add_argument('--tool-root', type=Path, default=ROOT / '.tools')
    parser.add_argument('--with-agent-source', action='store_true')
    args = parser.parse_args()
    host_os = {'Linux': 'linux', 'Windows': 'windows'}.get(platform.system())
    if not host_os or platform.machine().lower() not in ('x86_64', 'amd64'):
        parser.error('This reviewed toolchain supports Windows/Linux x64 only')
    host = host_os+'-x64'
    root = args.tool_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    paths = {name: install(name, root, host, lock) for name in args.tools}
    if args.with_agent_source:
        tool = lock['tools']['agent-desktop']
        source = root / 'sources/agent-desktop'
        if not source.exists():
            source.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(['git', 'clone', '--depth', '1', '--branch', 'v'+tool['version'],
                            tool['source']+'.git', str(source)], check=True)
        actual = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
        if actual != tool['sourceCommit']:
            raise RuntimeError('Agent source checkout differs from reviewed commit')
    index = root / 'paths.json'
    prior = json.loads(index.read_text(encoding='utf-8')) if index.is_file() else {}
    prior.update(paths)
    index.write_text(json.dumps(prior, indent=2)+'\n', encoding='utf-8')
    if 'agent-desktop' in prior:
        (root / 'mcp.agent-desktop.json').write_text(json.dumps({'mcpServers': {
            'agent-desktop': {'command': prior['agent-desktop'], 'args': ['mcp']}}}, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'installedOn': host, 'paths': paths, 'remotePcConnected': False}, indent=2))


if __name__ == '__main__':
    main()
