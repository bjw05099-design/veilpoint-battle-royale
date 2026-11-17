"""Real Chromium check; does not assert Safari or Unreal validation."""
from pathlib import Path
import subprocess, shutil, tempfile
browser=shutil.which('google-chrome') or shutil.which('chromium')
if not browser: raise RuntimeError('Chromium required')
page=Path('dist/ch01-production/workshop.html').resolve().as_uri()+'?verify=1'
for width,height in [(820,1180),(1180,820),(768,1024)]:
 with tempfile.TemporaryDirectory() as profile:
  result=subprocess.run([browser,'--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--user-data-dir='+profile,'--window-size='+str(width)+','+str(height),'--dump-dom',page],capture_output=True,text=True,timeout=30)
  if result.returncode or 'data-audit="passed"' not in result.stdout:
   import re
   print('DOM audit:', re.findall(r'data-audit=.[^>]*', result.stdout)[-1:])
   print('Page status:', re.findall(r'<output[^>]*>.*?</output>',result.stdout))
   Path('dist/ch01-production/failed-browser-dom.html').write_text(result.stdout)
   raise RuntimeError('Workshop browser check failed at '+str((width,height))+': '+result.stderr[-500:])
print('Chromium: both chapter branches, JSON restore and three tablet-size layouts PASS; actual Safari not tested')
