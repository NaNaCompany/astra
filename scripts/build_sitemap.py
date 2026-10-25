"""Generate Astra's canonical XML sitemap after recipe pages are built."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
import argparse
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://nanalab.kr/astra/'
EXCLUDED = {'scripts', 'tests', 'node_modules', 'previews', 'artifacts'}


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.html = False
        self.noindex = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'html':
            self.html = True
        if tag == 'meta' and attrs.get('name', '').lower() in {'robots', 'googlebot'}:
            if re.search(r'(^|[\s,])noindex($|[\s,])', attrs.get('content', ''), re.I):
                self.noindex = True


def generate():
    urls = set()
    for file in ROOT.rglob('*.html'):
        relative = file.relative_to(ROOT)
        if any(part.startswith(('.', '_')) or part in EXCLUDED for part in relative.parts[:-1]):
            continue
        if file.name.lower().startswith('test') or not file.resolve().is_relative_to(ROOT):
            continue
        page = Page(file.read_text(encoding='utf-8-sig'))
        if page.html and not page.noindex:
            urls.add(BASE + quote(relative.as_posix().removesuffix('index.html'), safe='/'))
    assert BASE in urls and len(urls) <= 50000
    tree = ET.Element('urlset', xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')
    for url in sorted(urls):
        ET.SubElement(ET.SubElement(tree, 'url'), 'loc').text = url
    ET.indent(tree, space='  ')
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(tree, encoding='unicode') + '\n', len(urls)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text, count = generate()
    target = ROOT / 'sitemap.xml'
    if args.check:
        assert target.is_file() and target.read_text(encoding='utf-8') == text, 'Stale sitemap.xml'
    else:
        target.write_text(text, encoding='utf-8', newline='\n')
    print(f'{"Checked" if args.check else "Built"} Astra sitemap: {count} URLs')
