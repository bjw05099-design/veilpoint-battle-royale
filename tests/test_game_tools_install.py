"""Behavior checks for the installer; no downloads, global installs or secrets."""
import hashlib
import importlib.util
import io
import json
import stat
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]/'scripts/install-game-tools.py'
spec = importlib.util.spec_from_file_location('game_tools_install', SOURCE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class PortableInstallTests(unittest.TestCase):
    def test_rejects_path_traversal_and_windows_ads(self):
        for name in ['/outside', '../outside', 'a/../../outside', 'C:/evil', 'a:stream', '\\\\host\\file']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                installer.safe_member(name)

    def test_zip_traversal_is_rejected_before_any_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root/'bad.zip'
            with zipfile.ZipFile(archive, 'w') as bundle:
                bundle.writestr('safe.txt', 'safe')
                bundle.writestr('../escape.txt', 'escape')
            with self.assertRaises(ValueError):
                installer.unpack(archive, root/'out')
            self.assertFalse((root/'out/safe.txt').exists())
            self.assertFalse((root/'escape.txt').exists())

    def test_zip_symlink_and_tar_outside_link_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            member = zipfile.ZipInfo('link')
            member.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(root/'bad.zip', 'w') as bundle:
                bundle.writestr(member, '../outside')
            with self.assertRaises(ValueError):
                installer.unpack(root/'bad.zip', root/'out')
            with tarfile.open(root/'bad.tar', 'w') as bundle:
                member = tarfile.TarInfo('link')
                member.type = tarfile.SYMTYPE
                member.linkname = '../outside'
                bundle.addfile(member)
            with self.assertRaises(tarfile.FilterError):
                installer.unpack(root/'bad.tar', root/'out')

    def fixture(self, root):
        cache = root/'downloads'
        cache.mkdir()
        archive = cache/'fixture.zip'
        with zipfile.ZipFile(archive, 'w') as bundle:
            bundle.writestr('tool', b'fixture binary')
        sha = hashlib.sha256(archive.read_bytes()).hexdigest()
        return {'tools': {'fixture': {'version': '1', 'source': 'https://github.com/example/tool',
                'license': 'test', 'platforms': {'linux-x64': {
                    'url': 'https://github.com/example/tool/releases/download/v1/fixture.zip',
                    'sha256': sha, 'executable': 'tool'}}}}}

    def test_cached_install_is_verified_idempotent_and_detects_tampering(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lock = self.fixture(root)
            with patch.object(installer.urllib.request, 'urlopen', side_effect=AssertionError('No network allowed')):
                executable = Path(installer.install('fixture', root, 'linux-x64', lock))
                self.assertTrue(executable.stat().st_mode & stat.S_IXUSR)
                self.assertEqual(installer.install('fixture', root, 'linux-x64', lock), str(executable))
                executable.write_bytes(b'changed')
                with self.assertRaisesRegex(RuntimeError, 'executable changed'):
                    installer.install('fixture', root, 'linux-x64', lock)

    def test_bad_download_hash_does_not_install(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lock = self.fixture(root)
            (root/'downloads/fixture.zip').unlink()
            with patch.object(installer.urllib.request, 'urlopen', return_value=io.BytesIO(b'corrupt')), self.assertRaisesRegex(RuntimeError, 'SHA-256 mismatch'):
                installer.install('fixture', root, 'linux-x64', lock)
            self.assertFalse((root/'fixture-1').exists())
            self.assertFalse((root/'downloads/fixture.zip.part').exists())

    def test_existing_unowned_directory_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lock = self.fixture(root)
            (root/'fixture-1').mkdir()
            (root/'fixture-1/keep').write_text('my file')
            with self.assertRaisesRegex(RuntimeError, 'Unowned'):
                installer.install('fixture', root, 'linux-x64', lock)
            self.assertEqual((root/'fixture-1/keep').read_text(), 'my file')

    def test_current_manifest_has_exact_versions_and_hashes(self):
        lock = json.loads(installer.LOCK.read_text())
        for tool in lock['tools'].values():
            self.assertRegex(tool['version'], r'^\d+\.\d+\.\d+$')
            for entry in tool['platforms'].values():
                self.assertRegex(entry['sha256'], r'^[a-f0-9]{64}$')
                installer.safe_member(entry['executable'])


if __name__ == '__main__':
    unittest.main()
