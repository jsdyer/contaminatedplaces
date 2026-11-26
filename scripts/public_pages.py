"""Build working, directly linkable views of the tool from its page template."""
from html import escape
import json
import re

from urllib.parse import parse_qs, quote

from search_metadata import add_search_metadata


def municipal_records(sites, query):
    fields = parse_qs(query)
    place = fields["q"][0].casefold()
    province = fields["province"][0]
    rows = [site for site in sites if site.get("province") == province and place in (site.get("municipality") or "").casefold()]
    rows.sort(key=lambda site: (site["updated"], site["id"]), reverse=True)
    lines = []
    for site in rows[:4]:
        url = "https://www.tbs-sct.gc.ca/fcsi-rscf/fsi-isf/" + quote(site["id"], safe="") + "-eng.aspx"
        lines.append(f'<li><a href="{url}">{escape(site["name"])}</a> · {escape(site["status"])} · {escape(site["id"])}</li>')
    return "<p>Recent records with a matching municipality</p><ul>" + "".join(lines) + "</ul>" if lines else ""


def publish_pages(stage, page, tool, sites):
    cases = json.loads((stage / "use-cases.json").read_text(encoding="utf-8"))
    for case in cases:
        filename = case["slug"] + ".html"
        preset = {**tool, "title": case["title"], "url": tool["url"] + filename,
                  "description": case["description"]}
        title = escape(case["title"])
        summary = escape(case["description"])
        result = re.sub(r"<title>.*?</title>", lambda _: "<title>" + title + " · CoolCode</title>", page, count=1)
        result = re.sub(r"(<h1\b[^>]*>).*?</h1>", lambda m: m[1] + title + "</h1>", result, count=1, flags=re.S)
        result = re.sub(r'<meta name="description" content="[^"]*">', lambda _: '<meta name="description" content="' + summary + '">', result, count=1)
        result = re.sub(r"<body(?=[ >])", lambda _: '<body data-' + case["setting"] + '="' + escape(case["value"]) + '"', result, count=1)
        result = result.replace("<!-- case-context -->", '<p class="case-context">' + summary + ' <a href="./">Open the full tool</a></p>')
        result = result.replace('<div id="results" aria-label="Site results"></div>',
                                '<div id="results" aria-label="Site results">' + municipal_records(sites, case["value"]) + '</div>')
        (stage / filename).write_text(add_search_metadata(result, preset), encoding="utf-8")
    (stage / "index.html").write_text(add_search_metadata(page, tool), encoding="utf-8")
