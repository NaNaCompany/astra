# Astra practice site

Public site: https://nanalab.kr/astra/

The dedicated sitemap is published at https://nanalab.kr/astra/sitemap.xml.
It contains the homepage and public HTML exercise, recipe, shop and other detail
pages. Development/test directories and pages marked `noindex` are excluded.
Dates are omitted when the source does not provide a reliable modification date.

GitHub Pages builds recipe download pages first, then runs
`python scripts/build_sitemap.py`, so new generated pages enter the sitemap on
deployment. To regenerate or check the saved XML locally:

```text
python scripts/build_sitemap.py
python scripts/build_sitemap.py --check
```

The parent site's root sitemap index links this file. Advertising and AdSense
must remain absent from Astra, including generated exercise pages.
