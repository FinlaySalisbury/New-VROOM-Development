// CaseStudy.jsx — full-bleed case study highlight
function CaseStudy() {
  return (
    <section style={ytCase.wrap}>
      <div style={ytCase.media}>
        <svg viewBox="0 0 800 540" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="cs-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#688ABA"/>
              <stop offset="0.5" stopColor="#DEECFF"/>
              <stop offset="1" stopColor="#AFFAD7"/>
            </linearGradient>
          </defs>
          <rect width="800" height="540" fill="url(#cs-grad)"/>
          {/* abstracted city */}
          <g fill="#FFFFFF" opacity="0.6">
            <rect x="60"  y="320" width="80"  height="220"/>
            <rect x="140" y="280" width="60"  height="260"/>
            <rect x="200" y="350" width="100" height="190"/>
            <rect x="300" y="240" width="60"  height="300"/>
            <rect x="360" y="300" width="80"  height="240"/>
            <rect x="440" y="260" width="50"  height="280"/>
            <rect x="490" y="320" width="80"  height="220"/>
            <rect x="570" y="280" width="60"  height="260"/>
            <rect x="630" y="340" width="100" height="200"/>
          </g>
          <g stroke="#000" strokeWidth="2" strokeDasharray="14 10" opacity="0.55">
            <line x1="0" y1="460" x2="800" y2="460"/>
          </g>
          <g fill="#000">
            <circle cx="180" cy="460" r="6"/>
            <circle cx="280" cy="460" r="6"/>
            <circle cx="360" cy="460" r="6"/>
            <circle cx="500" cy="460" r="6"/>
          </g>
          <g transform="translate(560,80)">
            <circle r="64" fill="#000"/>
            <circle cy="-26" r="11" fill="url(#cs-grad)"/>
            <circle r="11" fill="#FFE564"/>
            <circle cy="26" r="11" fill="#00E38C"/>
          </g>
        </svg>
      </div>
      <div style={ytCase.body}>
        <div style={ytCase.tag}>Case study · Birmingham</div>
        <h2 style={ytCase.head}>1,200 junctions,<br/>one operations view.</h2>
        <p style={ytCase.p}>
          Birmingham City Council unified its signals onto our adaptive
          platform — reducing average delay <span style={ytCase.hl}>18%</span> across
          the city centre and giving operators a single, real-time picture
          of the network.
        </p>
        <ul style={ytCase.list}>
          <li>−18% average delay</li>
          <li>+24% bus punctuality</li>
          <li>1 control room, 1,200 junctions</li>
        </ul>
        <a href="#" style={ytCase.cta}>Read the full story <span style={ytCase.arrow}/></a>
      </div>
    </section>
  );
}

const ytCase = {
  wrap: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    minHeight: 540, background: "#fff", fontFamily: 'Inter, system-ui, sans-serif',
  },
  media: { background: "#000", overflow: "hidden" },
  body: { padding: "96px 64px", display: "flex", flexDirection: "column", justifyContent: "center" },
  tag: { fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
         color: "#1E2ED9", fontWeight: 600, marginBottom: 18 },
  head: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
          fontWeight: 700, fontSize: 48, letterSpacing: "-0.025em", lineHeight: 1.05,
          color: "#000", margin: "0 0 24px" },
  p: { fontSize: 17, lineHeight: 1.55, color: "#1c1c1c", margin: "0 0 24px", maxWidth: 460 },
  hl: { color: "#1E2ED9", fontWeight: 500 },
  list: { margin: "0 0 36px", padding: 0, listStyle: "none", display: "flex",
          flexDirection: "column", gap: 8, fontSize: 14, color: "#000" },
  cta: { display: "inline-flex", alignItems: "center", gap: 10, alignSelf: "flex-start",
         color: "#000", fontWeight: 600, textDecoration: "none",
         borderBottom: "1px solid #000", paddingBottom: 4, fontSize: 15 },
  arrow: { width: 16, height: 1.5, background: "currentColor", display: "inline-block" },
};

window.CaseStudy = CaseStudy;
