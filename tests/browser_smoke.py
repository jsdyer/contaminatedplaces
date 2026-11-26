"""Exercise search, site details, deep links, CSV and mobile at a project subpath."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main():
    screenshots = ROOT / 'browser-checks'; screenshots.mkdir(exist_ok=True)
    source = json.loads((ROOT/'dist/data/sites.json').read_text())['sites']
    sample = next(s for s in source if s['province']=='Nova Scotia' and 'halifax' in s['municipality'].lower() and s['geo'])
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT/'dist', Path(temporary)/'contaminatedplaces')
        server = ThreadingHTTPServer(('127.0.0.1',0), partial(QuietHandler,directory=temporary))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
                browser = p.chromium.launch(executable_path=executable)
                page = browser.new_page(viewport={'width':1280,'height':1000}, accept_downloads=True)
                errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
                url=f'http://127.0.0.1:{server.server_port}/contaminatedplaces/'
                page.goto(url); page.wait_for_function("document.querySelector('#result-count').textContent.includes('matching sites')")
                page.locator('#q').fill(sample['id'])
                page.wait_for_function("document.querySelectorAll('#results .result').length === 1")
                page.locator('#results .result').click()
                assert page.locator('#detail-title').inner_text()==sample['name']
                assert page.get_by_role('link',name='Open the official federal record').get_attribute('href').endswith(f"/{sample['id']}-eng.aspx")
                assert f"id={sample['id']}" in page.get_by_role('link',name='Explore year-by-year history in Toxic Ground').get_attribute('href')
                assert f"site={sample['id']}" in page.url
                with page.expect_download() as downloaded: page.locator('#download').click()
                csv=Path(downloaded.value.path()).read_text(encoding='utf-8-sig');assert sample['id'] in csv
                deep=page.url;page.reload();page.wait_for_function("document.querySelector('#detail-title').textContent !== 'Choose a site'")
                assert page.locator('#detail-title').inner_text()==sample['name'];assert page.url==deep
                page.locator('#q').fill('zzzz-no-matching-record')
                page.wait_for_selector('#results .empty');assert page.locator('#download').is_disabled()
                page.locator('#q').fill('<img src=x onerror=alert(1)>');page.wait_for_timeout(250)
                assert page.locator('#results img').count()==0
                page.locator('#reset').click();page.get_by_text('More filters and nearby search',exact=True).click()
                page.locator('#latitude').fill(str(sample['geo'][0]));page.locator('#longitude').fill(str(sample['geo'][1]));page.locator('#radius').fill('5');page.locator('#near-coordinates').click()
                assert 'Within 5 km' in page.locator('#near-status').inner_text();assert 'latitude' not in page.url
                assert page.locator('#results .result').count()>0
                page.locator('#clear-near').click();page.locator('[data-province="British Columbia"]').click()
                assert page.locator('#province').input_value()=='British Columbia'
                page.screenshot(path=str(screenshots/'desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots/'mobile.png'),full_page=True)
                assert not errors, errors
                page.goto(url + 'langley.html')
                page.wait_for_function("document.querySelector('#province').value === 'British Columbia' && document.querySelector('#q').value === 'Langley' && document.querySelector('#results .result') !== null")
                assert page.locator('link[rel="canonical"]').get_attribute('href') == 'https://coolcode.ca/contaminatedplaces/langley.html'
                page.goto(url + 'halifax.html')
                page.wait_for_function("document.querySelector('#province').value === 'Nova Scotia' && document.querySelector('#q').value === 'Halifax' && document.querySelector('#results .result') !== null")
                assert page.locator('link[rel="canonical"]').get_attribute('href') == 'https://coolcode.ca/contaminatedplaces/halifax.html'
                browser.close()
        finally: server.shutdown();server.server_close()
if __name__=='__main__':main()
