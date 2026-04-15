"""
Auto-sync script: rebuilds graphify graph + Obsidian vault when api/ source files change.
Runs as a Claude Code PostToolUse hook or manually.

Usage:
  python sync_graph.py           # smart rebuild (only if .py files newer than graph.json)
  python sync_graph.py --force   # always rebuild
"""

import json
import os
import pathlib
import shutil
import sys
from collections import defaultdict

BASE = pathlib.Path(__file__).parent
API_DIR = BASE / "api"
GRAPH_JSON = API_DIR / "graphify-out" / "graph.json"
VAULT_DIR = pathlib.Path.home() / "Documents" / "Obsidian Vault" / "ufs-newsletter"

FORCE = "--force" in sys.argv


def _needs_rebuild() -> bool:
    if FORCE:
        return True
    if not GRAPH_JSON.exists():
        return True
    graph_mtime = GRAPH_JSON.stat().st_mtime
    for py in API_DIR.rglob("*.py"):
        if "graphify-out" in str(py) or "__pycache__" in str(py):
            continue
        if py.stat().st_mtime > graph_mtime:
            return True
    return False


def _rebuild_graph() -> bool:
    """Call graphify's internal rebuild directly (no subprocess needed)."""
    try:
        from graphify.watch import _rebuild_code
        old_cwd = os.getcwd()
        os.chdir(API_DIR)
        result = _rebuild_code(pathlib.Path("."))
        os.chdir(old_cwd)
        return bool(result)
    except Exception as e:
        print(f"[sync_graph] graph rebuild error: {e}")
        return False


def _rebuild_vault() -> None:
    """Regenerate the Obsidian vault from the updated graph.json."""
    try:
        with open(GRAPH_JSON, encoding="utf-8") as f:
            g = json.load(f)
    except Exception as e:
        print(f"[sync_graph] vault: can't read graph.json: {e}")
        return

    nodes = {n["id"]: n for n in g["nodes"]}
    links = g["links"]

    adj: dict = defaultdict(list)
    for lk in links:
        adj[lk.get("source", "")].append((lk.get("relation", ""), lk.get("target", "")))

    communities: dict = defaultdict(list)
    for nid, n in nodes.items():
        communities[n.get("community", 0)].append(n)

    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    (VAULT_DIR / "sources").mkdir(exist_ok=True)
    (VAULT_DIR / "architecture").mkdir(exist_ok=True)

    # index.md
    n_nodes = len(nodes)
    n_edges = len(links)
    n_comm = len(communities)
    index_lines = [
        "# UFS Newsletter — Knowledge Graph",
        "",
        f"> **{n_nodes} nodes · {n_edges} edges · {n_comm} communities** — auto-synced by graphify v4",
        "",
        "## Architecture",
        "",
        "| Layer | Key Files |",
        "|-------|-----------|",
        "| Data Sources | 12 sources in `api/services/sources/` |",
        "| Aggregator | `data_aggregator.py` |",
        "| AI Drafting | `ai_drafter.py` |",
        "| Email | `mailchimp_client.py`, `email_notifier.py` |",
        "| API Routes | `pipeline.py`, `drafts.py`, `newsletter.py`, `articles.py`, `sources.py` |",
        "| Models | `newsletter.py`, `draft.py`, `article.py`, `approval_log.py` |",
        "",
        "## God Nodes",
        "",
        "| Node | Edges | Role |",
        "|------|-------|------|",
        "| `SourceResult` | ~43 | Return type for every data collector |",
        "| `BaseSource` | ~40 | Abstract base — all sources extend this |",
        "| `Draft` | ~15 | Core content model |",
        "| `Article` | ~13 | Published article record |",
        "",
        "## Communities",
        "",
    ]
    for cid in sorted(communities.keys()):
        cnodes = communities[cid]
        labels = [n.get("label", "") for n in cnodes[:3]]
        index_lines.append(
            f"- [[architecture/Community_{cid}|Community {cid}]] ({len(cnodes)} nodes) — {' · '.join(labels)}"
        )
    index_lines += [
        "",
        "## Sources",
        "",
        "- [[sources/grok_source|Grok / X API]]",
        "- [[sources/reddit_source|Reddit]]",
        "- [[sources/news_api_source|News API]]",
        "- [[sources/foreclosure_scraper|Foreclosure.com]]",
        "- [[sources/zillow_source|Zillow]]",
        "- [[sources/housingwire_source|HousingWire RSS]] ✨",
        "- [[sources/mortgagepoint_source|The MortgagePoint RSS]] ✨",
        "- [[sources/redfin_source|Redfin S3 Market Data]] ✨",
        "- [[sources/fred_source|FRED API]] ✨",
        "- [[sources/fdic_source|FDIC BankFind]] ✨",
        "- [[sources/homesteps_source|Freddie Mac HomeSteps]] ✨",
        "",
        "---",
        f"_Last sync: auto-updated by `sync_graph.py` · {n_nodes} nodes · [[GRAPH_REPORT]]_",
    ]
    (VAULT_DIR / "index.md").write_text("\n".join(index_lines), encoding="utf-8")

    # Community notes
    for cid in sorted(communities.keys()):
        cnodes = communities[cid]
        lines = [f"# Community {cid}", "", f"**{len(cnodes)} nodes**", "", "## Members", ""]
        for n in cnodes:
            lines.append(f"- `{n.get('label', '')}` — {n.get('source_file', '')}:{n.get('source_location', '')}")
        ext = [
            (rel, tgt)
            for nid in [n["id"] for n in cnodes]
            for rel, tgt in adj.get(nid, [])
            if nodes.get(tgt, {}).get("community") != cid
        ][:10]
        if ext:
            lines += ["", "## External Connections", ""]
            for rel, tgt in ext:
                lines.append(f"- `{nodes.get(tgt, {}).get('label', tgt)}` via `{rel}`")
        (VAULT_DIR / "architecture" / f"Community_{cid}.md").write_text("\n".join(lines), encoding="utf-8")

    # Source notes (regenerate from live file listing)
    SOURCE_META = {
        "grok_source": ("Grok / X API", "GrokSource", "GROK_API_KEY", "industry_news"),
        "reddit_source": ("Reddit", "RedditSource", "Optional", "industry_news"),
        "news_api_source": ("News API", "NewsApiSource", "NEWS_API_KEY", "industry_news"),
        "foreclosure_scraper": ("Foreclosure.com", "ForeclosureScraper", "Cookie optional", "market_pulse"),
        "zillow_source": ("Zillow", "ZillowResearchSource + ZillowListingSource", "Cookie optional", "industry_news"),
        "housingwire_source": ("HousingWire RSS ✨", "HousingWireSource", "None", "industry_news"),
        "mortgagepoint_source": ("The MortgagePoint ✨", "MortgagePointSource", "None", "industry_news"),
        "redfin_source": ("Redfin S3 ✨", "RedfinMarketSource", "None", "market_pulse, hot_markets"),
        "fred_source": ("FRED API ✨", "FredSource", "FRED_API_KEY (free)", "market_pulse"),
        "fdic_source": ("FDIC BankFind ✨", "FdicSource", "None", "top_banks"),
        "homesteps_source": ("Freddie Mac HomeSteps ✨", "HomeStepsSource", "None", "top_banks"),
    }
    for key, (name, cls, auth, section) in SOURCE_META.items():
        src_file = API_DIR / "services" / "sources" / f"{key}.py"
        lines = [
            f"# {name}",
            "",
            f"**Class:** `{cls}`  ",
            f"**File:** `api/services/sources/{key}.py`  ",
            f"**Auth:** `{auth}`  ",
            f"**Section:** `{section}`",
            "",
            "## Relationships",
            "",
            "- Extends [[BaseSource]]",
            "- Returns [[SourceResult]]",
            "- Registered in [[data_aggregator]]",
        ]
        if src_file.exists():
            stat = src_file.stat()
            import datetime
            mtime = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
            lines += ["", f"_File last modified: {mtime}_"]
        lines.append("\n#source #data-pipeline")
        (VAULT_DIR / "sources" / f"{key}.md").write_text("\n".join(lines), encoding="utf-8")

    # Copy latest GRAPH_REPORT.md
    report_src = API_DIR / "graphify-out" / "GRAPH_REPORT.md"
    if report_src.exists():
        shutil.copy(str(report_src), str(VAULT_DIR / "GRAPH_REPORT.md"))

    # .obsidian config
    obsidian_dir = VAULT_DIR / ".obsidian"
    obsidian_dir.mkdir(exist_ok=True)
    (obsidian_dir / "app.json").write_text(
        '{"defaultViewMode":"source","livePreview":true}', encoding="utf-8"
    )

    print(f"[sync_graph] Vault updated: {VAULT_DIR}")


def main() -> None:
    if not _needs_rebuild():
        return  # Nothing changed — skip silently

    print("[sync_graph] Source files changed — rebuilding graph + vault…")
    ok = _rebuild_graph()
    if ok:
        _rebuild_vault()
        print(f"[sync_graph] Done. {VAULT_DIR}")
    else:
        print("[sync_graph] Graph rebuild failed — vault not updated")


if __name__ == "__main__":
    main()
