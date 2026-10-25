"""Add the subtle shared app-directory link to generated pages."""
import re

SNIPPET = '<!-- NaNa app directory link -->\n<style>\n#nana-more-apps{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(6px,env(safe-area-inset-bottom));z-index:20;margin:0;padding:0;background:none;border:0;line-height:1}\n#nana-more-apps a{display:inline-block;padding:2px 3px;font:400 11px/1.4 Arial,sans-serif;letter-spacing:normal;text-transform:none;color:#888;text-decoration:none;background:none;border:0;box-shadow:none}\n#nana-more-apps a:hover,#nana-more-apps a:focus-visible{color:#777;text-decoration:underline}\n#nana-more-apps a:focus-visible{outline:1px solid currentColor;outline-offset:2px}\n@media print{#nana-more-apps{display:none}}\n</style>\n<div id="nana-more-apps"><a href="https://nanalab.kr/apps/">More Apps</a></div>\n<!-- /NaNa app directory link -->'

def add_more_apps(source):
    if 'id="nana-more-apps"' in source:
        return source
    return re.sub(r'</body\s*>', lambda _: SNIPPET + '\n</body>', source, count=1, flags=re.I)
