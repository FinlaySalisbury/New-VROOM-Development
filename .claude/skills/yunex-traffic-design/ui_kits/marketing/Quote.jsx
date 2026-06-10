// Quote.jsx — pull quote between sections
function Quote() {
  return (
    <section style={ytQ.wrap}>
      <div style={ytQ.eyebrow}>Brand stance</div>
      <p style={ytQ.q}>
        We don't talk about <span style={ytQ.hl}>innovation</span>.<br/>
        We do it. It's our DNA.
      </p>
      <div style={ytQ.attr}>— Yunex Traffic</div>
    </section>
  );
}
const ytQ = {
  wrap: { background: "#fff", padding: "120px 64px",
          fontFamily: 'Inter, system-ui, sans-serif',
          maxWidth: 1100, margin: "0 auto" },
  eyebrow: { fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
             color: "#1E2ED9", fontWeight: 600, marginBottom: 18 },
  q: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
       fontWeight: 400, fontSize: 64, letterSpacing: "-0.02em", lineHeight: 1.1,
       color: "#000", margin: 0, textWrap: "balance" },
  hl: { color: "#1E2ED9", fontWeight: 600 },
  attr: { marginTop: 32, fontSize: 13, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "#000" },
};

window.Quote = Quote;
