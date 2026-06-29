// Pillars.jsx — three column purpose section
function Pillars() {
  const items = [
    {
      icon: "../../assets/icons/colour/city.svg",
      n: "01",
      title: "We make cities more livable",
      body: "Intelligent traffic solutions to keep transport networks moving in cities, improving the quality of life of the citizens who live in them.",
    },
    {
      icon: "../../assets/icons/colour/shield.svg",
      n: "02",
      title: "We improve safety",
      body: "Our solutions save lives by improving safety levels of transport networks, intersections, and tunnels.",
    },
    {
      icon: "../../assets/icons/colour/leaf.svg",
      n: "03",
      title: "We care for our planet",
      body: "We help reduce emissions from road traffic and support the solution to the climate crisis.",
    },
  ];
  return (
    <section style={ytPillars.wrap}>
      <div style={ytPillars.head}>
        <div style={ytPillars.eyebrow}>Our purpose</div>
        <h2 style={ytPillars.title}>We connect the dots of a new mobility revolution<br/>that will transform cities all over the world.</h2>
      </div>
      <div style={ytPillars.grid}>
        {items.map((it) => (
          <div key={it.n} style={ytPillars.col}>
            <img src={it.icon} alt="" style={ytPillars.icon}/>
            <div style={ytPillars.n}>{it.n}</div>
            <h3 style={ytPillars.h}>{it.title}</h3>
            <p style={ytPillars.p}>{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const ytPillars = {
  wrap: {
    background: "#fff", padding: "120px 64px",
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  head: { maxWidth: 1200, margin: "0 auto 72px" },
  eyebrow: {
    fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
    color: "#1E2ED9", fontWeight: 600, marginBottom: 18,
  },
  title: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700, fontSize: 48, letterSpacing: "-0.025em", lineHeight: 1.08,
    color: "#000", margin: 0, textWrap: "balance",
  },
  grid: {
    maxWidth: 1200, margin: "0 auto",
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 48,
  },
  col: { display: "flex", flexDirection: "column" },
  icon: { width: 40, height: 40, marginBottom: 24, display: "block" },
  n: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700, fontSize: 13, letterSpacing: "0.1em",
    color: "#1E2ED9", marginBottom: 10,
  },
  h: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700, fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.01em",
    color: "#000", margin: "0 0 12px",
  },
  p: { fontSize: 15, lineHeight: 1.6, color: "#3a3a3a", margin: 0, maxWidth: 360 },
};

window.Pillars = Pillars;
