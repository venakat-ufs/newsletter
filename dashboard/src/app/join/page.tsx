import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Join the Disposition Desk | United Field Services",
  description:
    "Registered REO agents get the full weekly Disposition Desk newsletter — live bank rankings, market data, and industry intel.",
};

type FromKey = "pulse" | "news" | "banks" | "markets" | "hiring" | "insights";
type Highlight = FromKey | "none";

const ALLOWED_FROM = new Set<string>([
  "pulse", "news", "banks", "markets", "hiring", "insights",
]);
const REGISTER_URL = "https://clients.unitedffs.com/register/client";
const SIGNIN_URL = "https://clients.unitedffs.com";

// ── Newsletter-matched palette (Issue #46) ─────────────────────────────────
const BG       = "#F1F5F9";
const WHITE    = "#FFFFFF";
const BORDER   = "#E5E7EB";
const BLUE     = "#3B82F6";
const BLUE_D   = "#2563EB";
const BLUE_LO  = "rgba(59,130,246,0.06)";
const BLUE_BR  = "rgba(59,130,246,0.18)";
const BLUE_LT  = "#BFDBFE";
const TEXT     = "#111827";
const TEXT_MD  = "#6B7280";
const TEXT_LT  = "#9CA3AF";
const GREEN    = "#16a34a";
const RED_C    = "#dc2626";

// ── Per-variant text ────────────────────────────────────────────────────────
interface ContentItem {
  eyebrow: string;
  h1: string;
  sub: string;
  gateHed: string;
  gateSub: string;
  highlight: Highlight;
}

const CONTENT: Record<FromKey, ContentItem> = {
  banks: {
    eyebrow: "Top Banks Listing · Members Only",
    h1: "The REO bank rankings\nyour market is reading.",
    sub: "Every week, registered UFS agents see exactly which servicers and GSEs are moving distressed inventory — ranked, counted, and tracked with week-over-week deltas.",
    gateHed: "Get the full bank rankings — free.",
    gateSub: "Every institution ranked, every market counted, every delta tracked. Delivered to registered agents every Monday.",
    highlight: "banks",
  },
  pulse: {
    eyebrow: "Market Pulse · Members Only",
    h1: "This week's live REO\ninventory — full picture.",
    sub: "Registered agents get the complete market pulse — every bank, every state, every listing signal, with trend data — every week.",
    gateHed: "Get the full market pulse — free.",
    gateSub: "1,084 tracked listings across 4 institutions and 10 states. Full breakdown, every week.",
    highlight: "pulse",
  },
  news: {
    eyebrow: "Industry News · Members Only",
    h1: "The REO industry brief\nyour week depends on.",
    sub: "15 curated stories from 20+ monitored sources — foreclosure, default servicing, and REO — every week.",
    gateHed: "Get the full industry news — free.",
    gateSub: "15 stories per week. 20+ sources monitored. Zero noise.",
    highlight: "news",
  },
  markets: {
    eyebrow: "Hot Markets · Members Only",
    h1: "The REO markets moving\ninventory right now.",
    sub: "State-level pipeline data with lead counts and agent activity. Registered agents see the full ranked list — updated every week.",
    gateHed: "Get the full hot markets report — free.",
    gateSub: "State-level REO pipeline ranked by activity. 17 new leads inserted this week.",
    highlight: "markets",
  },
  hiring: {
    eyebrow: "Bank Hiring Intel · Members Only",
    h1: "Which servicers are\nstaffing up this week.",
    sub: "35+ open REO roles tracked. Registered agents see the full list — company, role, location, and hiring focus — every week.",
    gateHed: "Get the full hiring intel — free.",
    gateSub: "35+ open REO and default-servicing roles tracked weekly. 10+ employers monitored.",
    highlight: "hiring",
  },
  insights: {
    eyebrow: "The Disposition Desk · Members Only",
    h1: "The complete REO brief —\nfree for registered agents.",
    sub: "1,084 listings tracked. 4 banks ranked. 15 stories curated. 35+ roles open. Delivered every Monday. Zero cost.",
    gateHed: "Unlock the full Disposition Desk — free.",
    gateSub: "Every section. Every week. Bank rankings, market pulse, industry news, and hiring intel — all in one brief.",
    highlight: "none",
  },
};

// ── Brief section rendering helpers ────────────────────────────────────────
const SEC_STYLE: CSSProperties = {
  padding: "14px 20px 12px",
  borderBottom: `1px solid ${BORDER}`,
};
const SEC_HL_STYLE: CSSProperties = {
  ...SEC_STYLE,
  background: BLUE_LO,
  borderLeft: `3px solid ${BLUE}`,
  paddingLeft: 17,
};

function SecTag({ label, hl }: { label: string; hl: boolean }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
      color: hl ? BLUE_D : TEXT_LT,
      display: "flex", alignItems: "center", gap: 5, marginBottom: 8,
    }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      {label}
    </div>
  );
}

function SectionIntro({ text }: { text: string }) {
  return <div style={{ fontSize: 11.5, color: TEXT_MD, marginBottom: 10, lineHeight: 1.5 }}>{text}</div>;
}

function BarSection({ hl }: { hl: boolean }) {
  const rows = [
    { label: "Freddie Mac / HomeSteps", pct: 87, value: "784", delta: "—",    dColor: TEXT_LT },
    { label: "HUD",                     pct: 29, value: "259", delta: "+6%",  dColor: GREEN   },
    { label: "Bank of America",         pct:  1, value: "9",   delta: "−10%", dColor: RED_C   },
  ];
  return (
    <div style={hl ? SEC_HL_STYLE : SEC_STYLE}>
      <SecTag label="Market Pulse" hl={hl} />
      <SectionIntro text="1,084 tracked listings · 4 institutions · 10 states" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(0,160px) 1fr 50px 40px", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${r.pct}%`, height: "100%", background: BLUE, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: r.dColor, textAlign: "right" }}>{r.delta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankSection({ label, hl, rows }: {
  label: string;
  hl: boolean;
  rows: Array<{ n: string; name: string; count: string; loc: string }>;
}) {
  return (
    <div style={hl ? SEC_HL_STYLE : SEC_STYLE}>
      <SecTag label={label} hl={hl} />
      <div>
        {rows.map((r, i) => (
          <div key={r.n} style={{
            display: "grid", gridTemplateColumns: "22px 1fr 50px 44px", gap: 8,
            alignItems: "center", padding: "7px 0",
            borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_LT }}>{r.n}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT }}>{r.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
            <span style={{ fontSize: 10, color: TEXT_LT, textAlign: "right" }}>{r.loc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StateSection({ hl }: { hl: boolean }) {
  const rows = [
    { code: "FL", pct: 100, value: "75" },
    { code: "TX", pct: 77,  value: "58" },
    { code: "CA", pct: 75,  value: "56" },
    { code: "IL", pct: 48,  value: "36" },
  ];
  return (
    <div style={hl ? SEC_HL_STYLE : SEC_STYLE}>
      <SecTag label="Hot Markets" hl={hl} />
      <SectionIntro text="5 states ranked · 17 new leads this week" />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <div key={r.code} style={{ display: "grid", gridTemplateColumns: "28px 1fr 32px", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{r.code}</span>
            <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${r.pct}%`, height: "100%", background: `linear-gradient(90deg,${BLUE},${BLUE_D})`, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT, textAlign: "right" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsSection({ hl }: { hl: boolean }) {
  const rows = [
    { src: "Insurance Journal", hed: "CA mortgage servicer settles for $4.6M over pandemic foreclosure violations" },
    { src: "Military.com",      hed: "New VA mortgage assistance program — warning for veterans facing foreclosure" },
  ];
  return (
    <div style={hl ? SEC_HL_STYLE : SEC_STYLE}>
      <SecTag label="Industry News" hl={hl} />
      <div>
        {rows.map((r, i) => (
          <div key={r.src} style={{ padding: "8px 0", borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: BLUE_D, marginBottom: 3 }}>{r.src}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, lineHeight: 1.4 }}>{r.hed}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HiringSection({ hl }: { hl: boolean }) {
  return (
    <RankSection
      label="Bank Hiring Intel"
      hl={hl}
      rows={[
        { n: "1", name: "LoanCare",          count: "12", loc: "National" },
        { n: "2", name: "PENNYMAC",           count: "8",  loc: "TX · FL" },
        { n: "3", name: "Selene Finance LP",  count: "2",  loc: "DFW"     },
      ]}
    />
  );
}

function BlurredSection({ lines }: { lines: string[] }) {
  return (
    <div style={{ padding: "12px 20px" }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          fontSize: 12, color: "rgba(17,24,39,0.08)",
          filter: "blur(3.5px)", userSelect: "none",
          padding: "7px 0",
          borderBottom: i < lines.length - 1 ? `1px solid ${BORDER}` : "none",
        }}>{line}</div>
      ))}
    </div>
  );
}

function BriefSections({ highlight }: { highlight: Highlight }) {
  switch (highlight) {
    case "banks":
      return (
        <>
          <BarSection hl={false} />
          <RankSection label="Top Banks Listing" hl={true} rows={[
            { n: "#1", name: "Freddie Mac / HomeSteps", count: "784", loc: "TX" },
            { n: "#2", name: "HUD",                     count: "259", loc: "IL" },
            { n: "#3", name: "Bank of America",         count: "9",   loc: "CA" },
          ]} />
          <BlurredSection lines={["#4  Selene Finance  ████  National","#5  Auction.com  ██  FL · TX"]} />
        </>
      );
    case "pulse":
      return (
        <>
          <BarSection hl={true} />
          <BlurredSection lines={["Auction.com  ████  █ states","Williams & Williams  ██  FL · GA"]} />
        </>
      );
    case "news":
      return (
        <>
          <NewsSection hl={true} />
          <BlurredSection lines={["████████████ ████████████████████████████████████████","████████ ████████ ████████████████ ██████ ████████"]} />
        </>
      );
    case "markets":
      return (
        <>
          <StateSection hl={true} />
          <BlurredSection lines={["OH  ████████████████  ██ leads","PA  █████████████   ██ leads"]} />
        </>
      );
    case "hiring":
      return (
        <>
          <HiringSection hl={true} />
          <BlurredSection lines={["████████ · ██████████████████ · ████████████","███████ · ████████████████████ · ████"]} />
        </>
      );
    default: // insights
      return (
        <>
          <BarSection hl={false} />
          <NewsSection hl={false} />
          <BlurredSection lines={["▶ TOP BANKS · ██████████████████████████████████████","▶ HOT MARKETS · ████████████████████████████████","▶ HIRING INTEL · ████████████████████████████"]} />
        </>
      );
  }
}

// ── Lock SVG ───────────────────────────────────────────────────────────────
function LockSvg() {
  return (
    <svg width="8" height="9" viewBox="0 0 8 9" fill="none">
      <rect x="1" y="4" width="6" height="4.5" rx="1" stroke={BLUE_D} strokeWidth="1" />
      <path d="M2.5 4V3a1.5 1.5 0 013 0v1" stroke={BLUE_D} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JoinPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawFrom = typeof params.from === "string" ? params.from : "";
  const from: FromKey = ALLOWED_FROM.has(rawFrom) ? (rawFrom as FromKey) : "insights";
  const c = CONTENT[from];

  return (
    <>
      <style>{`
        @keyframes fi { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .f1 { animation: fi .35s ease both .04s; }
        .f2 { animation: fi .35s ease both .12s; }
        .f3 { animation: fi .35s ease both .20s; }
        .f4 { animation: fi .35s ease both .28s; }
        .gate-btn { transition: background .12s, transform .12s, box-shadow .12s; }
        .gate-btn:hover { background: #1d4ed8 !important; transform: translateY(-1px); box-shadow: 0 6px 22px rgba(37,99,235,0.45) !important; }
        .gate-btn:active { transform: none; }
        .signin-a { transition: color .12s; }
        .signin-a:hover { color: ${BLUE} !important; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Inter',-apple-system,'Segoe UI',Arial,sans-serif", color: TEXT, padding: "20px 16px 56px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Header card ── */}
          <div className="f1" style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Image
              src="/logo.jpeg"
              alt="United Field Services"
              width={150}
              height={75}
              priority
              style={{ objectFit: "contain", width: "auto", height: 36 }}
            />
            <div style={{ textAlign: "right", fontSize: 12, color: TEXT_LT, lineHeight: 1.6 }}>
              <span style={{ color: TEXT, fontWeight: 600 }}>The Disposition Desk</span><br />
              Weekly REO Intelligence
            </div>
          </div>

          {/* ── Hero card ── */}
          <div className="f2" style={{ background: "linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 55%,#3B82F6 100%)", borderRadius: 12, padding: "26px 26px 22px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: BLUE_LT, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              {c.eyebrow}
            </div>
            <h1 style={{ fontSize: "clamp(1.45rem,4.5vw,1.95rem)", fontWeight: 800, color: WHITE, letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 10px", whiteSpace: "pre-line" }}>
              {c.h1}
            </h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,0.78)", margin: 0, maxWidth: 500 }}>
              {c.sub}
            </p>
          </div>

          {/* ── Brief document ── */}
          <div className="f3" style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            {/* Brief topbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", background: "#F8FAFC", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MD }}>Issue #47</span>
                <div style={{ width: 1, height: 10, background: BORDER }} />
                <span style={{ fontSize: 11, color: TEXT_LT }}>Jul 2, 2026</span>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: BLUE_D, background: BLUE_LO, border: `1px solid ${BLUE_BR}`, borderRadius: 5, padding: "3px 9px" }}>
                <LockSvg />
                Full access required
              </span>
            </div>

            {/* Sections */}
            <BriefSections highlight={c.highlight} />

            {/* Gate overlay */}
            <div style={{ position: "relative", marginTop: -52, padding: "0 18px 20px", background: `linear-gradient(to bottom, transparent 0%, ${WHITE} 56px)`, zIndex: 10 }}>
              <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderTop: `3px solid ${BLUE}`, borderRadius: 8, padding: "18px 18px 16px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: BLUE_D, background: BLUE_LO, border: `1px solid ${BLUE_BR}`, borderRadius: 4, padding: "3px 9px" }}>
                  <LockSvg />
                  Members only
                </span>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                  {c.gateHed}
                </div>
                <div style={{ fontSize: 12.5, color: TEXT_MD, lineHeight: 1.65 }}>
                  {c.gateSub}
                </div>
                <a
                  href={REGISTER_URL}
                  rel="noopener noreferrer"
                  className="gate-btn"
                  style={{ display: "inline-block", background: BLUE_D, color: WHITE, font: "600 13.5px/1 'Inter',sans-serif", textDecoration: "none", padding: "12px 22px", borderRadius: 8, boxShadow: "0 2px 12px rgba(37,99,235,0.3)" }}
                >
                  Create your free account →
                </a>
                <div style={{ fontSize: 11.5, color: TEXT_LT }}>
                  Already registered?{" "}
                  <a href={SIGNIN_URL} rel="noopener noreferrer" className="signin-a" style={{ color: BLUE_D, textDecoration: "none", fontWeight: 600 }}>
                    Sign in to your portal
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stat strip ── */}
          <div className="f4" style={{ display: "flex", flexWrap: "wrap", background: `linear-gradient(135deg,${BLUE} 0%,#60A5FA 100%)`, borderRadius: 12, overflow: "hidden" }}>
            {([
              { num: "1,084", txt: "tracked listings" },
              { num: "4",     txt: "active institutions" },
              { num: "15",    txt: "industry stories" },
              { num: "35+",   txt: "open REO roles" },
            ] as const).map((s, i, arr) => (
              <div key={s.num} style={{ flex: 1, minWidth: 120, padding: "16px 14px", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.2)" : "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: "1.45rem", fontWeight: 800, color: WHITE, lineHeight: 1, letterSpacing: "-0.02em", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{s.num}</div>
                <div style={{ fontSize: 9.5, fontWeight: 500, color: "rgba(255,255,255,0.75)", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>{s.txt}</div>
              </div>
            ))}
          </div>

          {/* ── Footer ── */}
          <p style={{ textAlign: "center", fontSize: 11, color: TEXT_LT, lineHeight: 1.9, margin: 0 }}>
            United Field Services · The Disposition Desk<br />
            Sent weekly to registered REO professionals
          </p>

        </div>
      </div>
    </>
  );
}
