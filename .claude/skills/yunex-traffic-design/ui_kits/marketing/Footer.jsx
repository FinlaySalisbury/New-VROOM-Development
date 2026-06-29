// Footer.jsx — site footer in dark with brand wordmark
function Footer() {
  const cols = [
    { h: "Solutions", l: ["Adaptive control", "Highway & tunnel", "V2X", "Tolling", "Stratos"] },
    { h: "Industries", l: ["Cities", "Highways", "Operators", "Public safety"] },
    { h: "Company",   l: ["Who we are", "Press", "Careers", "Contact"] },
    { h: "Resources", l: ["Case studies", "Insights", "Support", "Privacy"] },
  ];
  return (
    <footer style={ytFoot.wrap}>
      <div style={ytFoot.top}>
        <a href="#" style={ytFoot.brand} aria-label="Yunex Traffic">
          <img src="../../assets/logo-yunex-traffic-white.png" alt="Yunex Traffic" style={{height: 32, width: "auto", display: "block"}}/>
        </a>
        <p style={ytFoot.tag}>Uniting what's next in traffic.</p>
        <div style={ytFoot.cta}>
          Get in touch
          <span style={ytFoot.arrow}/>
        </div>
      </div>
      <div style={ytFoot.cols}>
        {cols.map((c) => (
          <div key={c.h}>
            <div style={ytFoot.h}>{c.h}</div>
            <ul style={ytFoot.list}>
              {c.l.map((x) => <li key={x}><a href="#" style={ytFoot.link}>{x}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div style={ytFoot.bottom}>
        <span>© 2026 Yunex Traffic UK Ltd.</span>
        <span style={{ display: "flex", gap: 24 }}>
          <a href="#" style={ytFoot.linkSm}>Imprint</a>
          <a href="#" style={ytFoot.linkSm}>Privacy</a>
          <a href="#" style={ytFoot.linkSm}>Cookies</a>
        </span>
      </div>
    </footer>
  );
}

const ytFoot = {
  wrap: { background: "#000", color: "#fff", padding: "80px 64px 32px",
          fontFamily: 'Inter, system-ui, sans-serif' },
  top: { maxWidth: 1200, margin: "0 auto 64px",
         display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" },
  brand: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
           fontSize: 32, letterSpacing: "-0.04em", color: "#fff",
           textDecoration: "none", borderBottom: 0 },
  tag: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
         fontWeight: 400, fontSize: 22, letterSpacing: "-0.01em",
         color: "#9DBBFF", margin: 0, flex: 1 },
  cta: { display: "inline-flex", alignItems: "center", gap: 10,
         border: "1px solid #fff", borderRadius: 999,
         padding: "12px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  arrow: { width: 14, height: 1.5, background: "currentColor", display: "inline-block" },
  cols: { maxWidth: 1200, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 32,
          paddingBottom: 56, borderBottom: "1px solid #1f1f1f" },
  h: { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
       color: "#9DBBFF", fontWeight: 600, marginBottom: 16 },
  list: { margin: 0, padding: 0, listStyle: "none",
          display: "flex", flexDirection: "column", gap: 10 },
  link: { color: "#dcdcdc", textDecoration: "none", fontSize: 14, borderBottom: 0 },
  bottom: { maxWidth: 1200, margin: "32px auto 0",
            display: "flex", justifyContent: "space-between",
            fontSize: 12, color: "#888" },
  linkSm: { color: "#888", textDecoration: "none", borderBottom: 0 },
};

window.Footer = Footer;
