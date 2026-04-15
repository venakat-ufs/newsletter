const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data', 'ufs-newsletter.json');
const db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const drafts = Array.isArray(db.drafts)
  ? db.drafts.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  : [];

if (drafts.length === 0) {
  console.log(JSON.stringify({ error: 'no_drafts' }, null, 2));
  process.exit(0);
}

function getTopBankRows(draft) {
  let ai = draft.ai_draft;
  try {
    if (typeof ai === 'string') ai = JSON.parse(ai);
  } catch {}
  const sections = Array.isArray(ai?.sections) ? ai.sections : [];
  const top = sections.find((s) => s.section_type === 'top_banks');
  const rows = Array.isArray(top?.metadata?.rows) ? top.metadata.rows : [];
  return rows.map((r) => ({
    name: r?.name ?? '',
    count: r?.count ?? 0,
    state: r?.top_state ?? '',
    delta: r?.wow_delta_pct ?? null,
  }));
}

const latest = drafts[0];
const prev = drafts[1] ?? null;
const latestRows = getTopBankRows(latest);
const prevRows = prev ? getTopBankRows(prev) : [];
const prevNames = new Set(prevRows.map((r) => String(r.name).toLowerCase().trim()).filter(Boolean));
const newInLatest = latestRows.filter(
  (r) => !prevNames.has(String(r.name).toLowerCase().trim()),
);

console.log(
  JSON.stringify(
    {
      latest_draft_id: latest.id,
      latest_created_at: latest.created_at,
      latest_top_banks: latestRows,
      previous_draft_id: prev?.id ?? null,
      previous_created_at: prev?.created_at ?? null,
      new_bank_entries_vs_previous: newInLatest,
    },
    null,
    2,
  ),
);
