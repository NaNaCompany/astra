"""Astra practice analytics only. Advertising and AdSense must remain absent."""
import re
GTM = "<script>\n        (function (w, d, s, l, i) {\n            w[l] = w[l] || []; w[l].push({\n                'gtm.start':\n                    new Date().getTime(), event: 'gtm.js'\n            });\n            var f = d.getElementsByTagName(s)[0],\n                j = d.createElement(s),\n                dl = l != 'dataLayer' ? '&l=' + l : '';\n            j.async = true;\n            j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;\n            f.parentNode.insertBefore(j, f);\n        })\n            (window, document, 'script', 'dataLayer', 'GTM-NV2WWQXB');\n    </script>"
GA = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-2ZYSF0173P"></script>\n<script>\n        window.dataLayer = window.dataLayer || [];\n        function gtag() { dataLayer.push(arguments); }\n        gtag(\'js\', new Date());\n        gtag(\'config\', \'G-2ZYSF0173P\');\n    </script>'
BODY = '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NV2WWQXB" height="0" width="0"\n            style="display:none;visibility:hidden"></iframe></noscript>'
CF = '<script>\n(function () {\n  function ensureBeacon() {\n    // Cloudflare may inject its beacon at the edge. Reuse that script when present.\n    if (document.querySelector(\'script[src*="static.cloudflareinsights.com/beacon.min.js"]\')) return;\n    var beacon = document.createElement(\'script\');\n    beacon.defer = true;\n    beacon.src = \'https://static.cloudflareinsights.com/beacon.min.js\';\n    beacon.setAttribute(\'data-cf-beacon\', JSON.stringify({token: \'9f3423bb0d034d91bbe1a12afeff2429\'}));\n    document.head.appendChild(beacon);\n  }\n  if (document.readyState === \'loading\') document.addEventListener(\'DOMContentLoaded\', ensureBeacon, {once: true});\n  else ensureBeacon();\n})();\n</script>'

def complete_tracking(source):
    if '<html' not in source.lower() or '__PUBLISHER_HEAD__' in source:
        return source
    head = []
    for name, pattern, snippet in [('GTM', r'GTM-[A-Z0-9]+', GTM), ('Analytics', r'G-[A-Z0-9]+', GA)]:
        if not re.search(pattern, source):
            head.append(f'<!-- NaNa publisher: {name} -->\n{snippet}\n<!-- /NaNa publisher: {name} -->')
    body = '' if 'googletagmanager.com/ns.html' in source else f'<!-- NaNa publisher: GTM fallback -->\n{BODY}\n<!-- /NaNa publisher: GTM fallback -->'
    cf = '' if 'cloudflareinsights.com/beacon.min.js' in source else f'<!-- NaNa publisher: Cloudflare fallback -->\n{CF}\n<!-- /NaNa publisher: Cloudflare fallback -->'
    if not head and not body and not cf:
        return source
    if not re.search(r'<head\b', source, re.I):
        # Some small utility pages rely on implicit HTML head/body elements.
        opening = re.search(r'<html\b[^>]*>', source, re.I)
        first_body = re.search(r'<(?:a|h1|main|header|div|p)\b', source[opening.end():], re.I)
        if not first_body:
            raise ValueError('Cannot locate implicit body')
        at = opening.end() + first_body.start()
        source = source[:at] + '</head><body>' + source[at:]
        source = source[:opening.end()] + '<head>' + source[opening.end():]
        source = re.sub(r'</html\s*>', '</body></html>', source, count=1, flags=re.I)
    if head:
        source = re.sub(r'</head\s*>', lambda _: '\n' + '\n'.join(head) + '\n</head>', source, count=1, flags=re.I)
    if body:
        source = re.sub(r'<body\b[^>]*>', lambda m: m[0] + '\n' + body + '\n', source, count=1, flags=re.I)
    if cf:
        source = re.sub(r'</body\s*>', lambda _: '\n' + cf + '\n</body>', source, count=1, flags=re.I)
    return source
