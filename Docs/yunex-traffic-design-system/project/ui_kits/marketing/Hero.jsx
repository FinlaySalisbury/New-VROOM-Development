// Hero.jsx — homepage hero on Yunex Silver gradient
function Hero() {
  return (
    <section style={ytHero.wrap}>
      <div style={ytHero.gradBg} />
      <div style={ytHero.inner}>
        <div style={ytHero.tag}>UK · Intelligent Traffic Management</div>
        <h1 style={ytHero.head}>
          Uniting what's<br/>
          <span style={ytHero.headHl}>next</span> in traffic.
        </h1>
        <p style={ytHero.lead}>
          Yunex Traffic helps cities and transport authorities <span style={ytHero.hl}>improve safety</span>,
          reduce congestion, and create more sustainable mobility networks — with the
          broadest end-to-end portfolio of intelligent road traffic technology in the market.
        </p>
        <div style={ytHero.actions}>
          <a href="#" style={ytHero.primary}>Explore solutions <span style={ytHero.arrow}/></a>
          <a href="#" style={ytHero.secondary}>Watch the film</a>
        </div>

        <div style={ytHero.stats}>
          <div><div style={ytHero.statNum}>600+</div><div style={ytHero.statLbl}>cities</div></div>
          <div style={ytHero.statSep}/>
          <div><div style={ytHero.statNum}><span style={{color:'#1E2ED9'}}>+</span>1,936</div><div style={ytHero.statLbl}>vehicles / minute</div></div>
          <div style={ytHero.statSep}/>
          <div><div style={ytHero.statNum}>−18%</div><div style={ytHero.statLbl}>average delay</div></div>
        </div>
      </div>
    </section>
  );
}

const ytHero = {
  wrap: {
    position: "relative", overflow: "hidden",
    minHeight: 640, padding: "96px 64px 64px",
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  gradBg: {
    position: "absolute", inset: 0,
    background: "linear-gradient(135deg,#688ABA 0%,#FFFFFF 38%,#DEECFF 70%,#AFFAD7 100%)",
    zIndex: 0,
  },
  inner: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" },
  tag: {
    display: "inline-block", background: "#000", color: "#fff",
    padding: "6px 14px", borderRadius: 999,
    fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600,
    marginBottom: 28,
  },
  head: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700, fontSize: 96, lineHeight: 1.02, letterSpacing: "-0.03em",
    color: "#000", margin: 0, textWrap: "balance",
  },
  headHl: { color: "#1E2ED9" },
  lead: {
    marginTop: 28, maxWidth: 680, fontSize: 19, lineHeight: 1.55, color: "#1c1c1c",
  },
  hl: { color: "#1E2ED9", fontWeight: 500 },
  actions: { marginTop: 40, display: "flex", gap: 12, alignItems: "center" },
  primary: {
    display: "inline-flex", alignItems: "center", gap: 10,
    background: "#000", color: "#fff", padding: "14px 24px",
    borderRadius: 999, textDecoration: "none", borderBottom: 0,
    fontWeight: 600, fontSize: 15,
  },
  arrow: {
    width: 16, height: 1.5, background: "currentColor",
    display: "inline-block", position: "relative",
  },
  secondary: {
    color: "#000", fontWeight: 600, fontSize: 15, padding: "14px 8px",
    textDecoration: "none", borderBottom: "1px solid #000",
  },
  stats: {
    marginTop: 80, display: "flex", gap: 40, alignItems: "flex-end",
    flexWrap: "wrap",
  },
  statNum: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700, fontSize: 48, letterSpacing: "-0.025em", lineHeight: 1, color: "#000",
  },
  statLbl: { marginTop: 6, fontSize: 13, color: "#1c1c1c" },
  statSep: { width: 1, height: 56, background: "rgba(0,0,0,0.2)" },
};

window.Hero = Hero;
