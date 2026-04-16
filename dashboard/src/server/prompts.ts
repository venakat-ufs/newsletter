// Prompt templates embedded at build time — avoids runtime file reads on Vercel.
// Each template uses {data} as the placeholder for the JSON data blob.

export const SECTION_PROMPTS: Record<string, string> = {
  market_pulse: `You are writing the "Market Pulse" section of The Disposition Desk, a weekly REO industry newsletter for real estate agents.

RULES:
- Only use facts from the provided data. Do NOT invent statistics or numbers.
- If data is limited, say "data was limited this week" rather than making things up.
- Write in a professional but accessible tone.
- Use specific numbers and percentages when available.
- Prefer short sentences and direct statements over narrative filler.

DATA PROVIDED:
{data}

WRITE:
1. A compelling title (8-12 words)
2. A teaser (max 2 short sentences) — this goes in the email. Keep it direct, specific, and easy to scan.
3. A full body (2 short paragraphs max) — this is the full article behind the login gate. Cover:
   - Weekly REO volume trends (up/down from last week if data available)
   - Key geographic activity
   - Notable market indicators
   - What this means for REO agents
- Lead with the most important number or movement.
- If multiple facts matter, group them into compact statements rather than long explanation.

Return as JSON:
{"title": "...", "teaser": "...", "body": "..."}`,

  top_banks: `You are writing the "Top Institutions Listing" section of The Disposition Desk, a weekly REO industry newsletter.

RULES:
- Only use facts from the provided data. Do NOT invent institution names, numbers, or rankings.
- If data is limited, acknowledge it honestly.
- Write in a professional but accessible tone.
- Keep the copy factual and skimmable.

DATA PROVIDED:
{data}

WRITE:
1. A compelling title (8-12 words)
2. A teaser (max 2 short sentences) — for the email. Highlight which banks, agencies, or GSE channels are most active.
3. A full body (2 short paragraphs max) — Cover:
   - Which banks, agencies, or GSE channels surfaced the strongest live REO inventory signals this week
   - Geographic breakdown if available
   - What this signals for agents looking for business
- Use institution names and counts early.

Return as JSON:
{"title": "...", "teaser": "...", "body": "..."}`,

  hot_markets: `You are writing the "Hot Markets" section of The Disposition Desk, a weekly REO industry newsletter.

RULES:
- Only use facts from the provided data. Do NOT invent market names or numbers.
- Rank the top 5 markets by REO activity if data supports it.
- Write in a professional but accessible tone.
- Keep each sentence concrete and data-led.

DATA PROVIDED:
{data}

WRITE:
1. A compelling title (8-12 words)
2. A teaser (max 2 short sentences) — for the email. Highlight the hottest markets.
3. A full body (2 short paragraphs max) — Cover:
   - Top 5 counties/metros with highest REO activity
   - Why these markets are hot (if data suggests reasons)
   - Opportunities for agents in these areas
- Avoid generic market commentary if the data does not support it.

Return as JSON:
{"title": "...", "teaser": "...", "body": "..."}`,

  industry_news: `You are writing the "Industry News" section of The Disposition Desk, a weekly REO industry newsletter.

RULES:
- Only summarize news from the provided articles/posts. Do NOT invent news stories.
- Cite the source name for each story (e.g., "According to HousingWire...").
- Pick the 3-5 most relevant stories for REO agents.
- Write in a professional but accessible tone.
- Make it read like an executive digest, not a long article.

DATA PROVIDED:
{data}

WRITE:
1. A compelling title (8-12 words)
2. A teaser (max 2 short sentences) — for the email. Highlight the biggest story of the week.
3. A full body (3 compact paragraphs max) — Cover:
   - Top 3-5 news stories relevant to REO agents
   - Each story gets 1-2 sentences with the source cited
   - What these developments mean for the REO industry

Return as JSON:
{"title": "...", "teaser": "...", "body": "..."}`,

  bank_hiring_intel: `You are writing the "Bank Hiring Intel" section of The Disposition Desk, a weekly REO industry newsletter.

RULES:
- Only use facts from the provided job data. Do NOT invent employers, job counts, or role names.
- Focus on banks, servicers, and institutions posting REO, foreclosure, loss mitigation, default servicing, and mortgage servicing roles.
- If the data is thin, say the hiring signal was limited this cycle instead of making things up.
- Keep the tone professional and practical for REO agents, asset managers, and servicing operators.
- Keep it concise and data-forward.

DATA PROVIDED:
{data}

WRITE:
1. A compelling title (8-12 words)
2. A teaser (max 2 short sentences) — for the email. Explain which employers are hiring and why it matters.
3. A full body (2 short paragraphs max) — Cover:
   - Which employers are posting the most relevant roles
   - The role types showing up most often
   - What that hiring activity suggests about default, servicing, or REO volume

Return as JSON:
{"title": "...", "teaser": "...", "body": "..."}`,

  ufs_spotlight: `You are writing the "UFS Spotlight" section of The Disposition Desk, a weekly REO industry newsletter published by United Field Services.

RULES:
- If manual input content is provided, polish and format it professionally.
- If no manual input is provided, write a generic but professional UFS service highlight.
- Keep it subtle — informative, not salesy.
- UFS provides: property inspections, occupancy checks, maintenance, and preservation orders for REO agents, banks, and asset managers.
- Keep it clear, useful, and restrained.

DATA PROVIDED:
{data}

WRITE:
1. A compelling title (8-12 words)
2. A teaser (max 2 short sentences) — for the email. Subtle service highlight.
3. A full body (1 short paragraph max) — A brief, professional UFS service spotlight or client success story.

Return as JSON:
{"title": "...", "teaser": "...", "body": "..."}`,
};
