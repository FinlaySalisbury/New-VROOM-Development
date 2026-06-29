// SolutionsGrid.jsx — clickable solution cards with hover state
function SolutionsGrid() {
  const [hover, setHover] = React.useState(null);
  const items = [
    { id: 1, tag: "Adaptive control", title: "Make every junction smarter", icon: "traffic-light", grad: "linear-gradient(135deg,#688ABA 0%,#DEECFF 50%,#AFFAD7 100%)" },
    { id: 2, tag: "Highway & tunnel", title: "Automate the corridor",       icon: "highway",       grad: "linear-gradient(135deg,#1E2ED9,#9DBBFF)" },
    { id: 3, tag: "V2X",              title: "Connect vehicles to infrastructure", icon: "globe", grad: "linear-gradient(135deg,#9DBBFF 0%,#DEECFF 55%,#FFFFFF 100%)" },
    { id: 4, tag: "Tolling",          title: "Free-flow, every flow",       icon: "activity",      grad: "linear-gradient(135deg,#DEECFF 0%,#E4EDED 50%,#AFFAD7 100%)" },
  ];
  return (
    <section style={ytSol.wrap}>
      <div style={ytSol.head}>
        <div style={ytSol.eyebrow}>Solutions</div>
        <h2 style={ytSol.title}>The broadest end-to-end portfolio<br/>of intelligent traffic technology.</h2>
      </div>
      <div style={ytSol.grid}>
        {items.map((it) => (
          <a key={it.id} href="#" style={ytSol.card}
             onMouseEnter={() => setHover(it.id)}
             onMouseLeave={() => setHover(null)}>
            <div style={{ ...ytSol.cardImg, background: it.grad }}>
              <img src={`../../assets/icons/${it.icon}.svg`} alt=""
                   style={{ ...ytSol.cardIco, transform: hover === it.id ? "translate(-4px,4px)" : "none" }}/>
            </div>
            <div style={ytSol.cardBody}>
              <div style={ytSol.cardTag}>{it.tag}</div>
              <div style={ytSol.cardTitle}>{it.title}</div>
              <div style={{ ...ytSol.cardArrow, transform: hover === it.id ? "translateX(6px)" : "none" }}>→</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

const ytSol = {
  wrap: { background: "#000", color: "#fff", padding: "120px 64px",
          fontFamily: 'Inter, system-ui, sans-serif' },
  head: { maxWidth: 1200, margin: "0 auto 72px" },
  eyebrow: { fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
             color: "#9DBBFF", fontWeight: 600, marginBottom: 18 },
  title: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
           fontWeight: 700, fontSize: 48, letterSpacing: "-0.025em", lineHeight: 1.08,
           margin: 0, textWrap: "balance" },
  grid: { maxWidth: 1200, margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  card: { background: "#0d0d0d", borderRadius: 18, overflow: "hidden",
          textDecoration: "none", color: "#fff", borderBottom: 0,
          transition: "transform .22s cubic-bezier(.22,.61,.36,1)" },
  cardImg: { height: 220, position: "relative", overflow: "hidden" },
  cardIco: { position: "absolute", right: 24, bottom: 24, width: 64, height: 64,
             color: "#000", transition: "transform .35s cubic-bezier(.22,.61,.36,1)" },
  cardBody: { padding: "20px 24px 28px", display: "flex", alignItems: "center",
              justifyContent: "space-between" },
  cardTag: { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
             color: "#9DBBFF", fontWeight: 600, marginBottom: 6 },
  cardTitle: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
               fontWeight: 700, fontSize: 22, letterSpacing: "-0.01em",
               lineHeight: 1.2, flex: 1 },
  cardArrow: { fontSize: 22, marginLeft: 16,
               transition: "transform .22s cubic-bezier(.22,.61,.36,1)" },
};

window.SolutionsGrid = SolutionsGrid;
