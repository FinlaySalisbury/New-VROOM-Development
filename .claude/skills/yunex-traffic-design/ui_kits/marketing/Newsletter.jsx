// Newsletter.jsx — frosted gradient newsletter strip
function Newsletter() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);
  return (
    <section style={ytNws.wrap}>
      <div style={ytNws.bg}/>
      <div style={ytNws.inner}>
        <div style={ytNws.eyebrow}>Stay in the loop</div>
        <h2 style={ytNws.head}>Mobility news, once a month.<br/>No fluff.</h2>
        {done ? (
          <div style={ytNws.thanks}>Thanks — we'll be in touch.</div>
        ) : (
          <form style={ytNws.form} onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yunextraffic.com"
              style={ytNws.input}
            />
            <button type="submit" style={ytNws.btn}>Subscribe<span style={ytNws.arrow}/></button>
          </form>
        )}
        <p style={ytNws.fine}>We never share your email. Read our <a href="#" style={{color:"#1E2ED9",borderBottom:"1px solid currentColor"}}>privacy policy</a>.</p>
      </div>
    </section>
  );
}

const ytNws = {
  wrap: { position: "relative", overflow: "hidden", padding: "96px 64px",
          fontFamily: 'Inter, system-ui, sans-serif' },
  bg: { position: "absolute", inset: 0,
        background: "linear-gradient(135deg,#9DBBFF 0%,#DEECFF 55%,#FFFFFF 100%)",
        zIndex: 0 },
  inner: { position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", textAlign: "left" },
  eyebrow: { fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
             color: "#1E2ED9", fontWeight: 600, marginBottom: 16 },
  head: { fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
          fontWeight: 700, fontSize: 44, letterSpacing: "-0.025em", lineHeight: 1.05,
          color: "#000", margin: "0 0 32px" },
  form: { display: "flex", gap: 8, maxWidth: 520 },
  input: { flex: 1, fontFamily: "inherit", fontSize: 16, padding: "14px 18px",
           border: "1px solid #000", borderRadius: 999, background: "rgba(255,255,255,0.7)",
           outline: "none", boxSizing: "border-box" },
  btn: { display: "inline-flex", alignItems: "center", gap: 10,
         background: "#000", color: "#fff", border: 0,
         padding: "14px 24px", borderRadius: 999, fontWeight: 600, fontSize: 15,
         fontFamily: "inherit", cursor: "pointer" },
  arrow: { width: 14, height: 1.5, background: "currentColor", display: "inline-block" },
  thanks: { fontSize: 18, color: "#000", fontWeight: 500, padding: "16px 0" },
  fine: { marginTop: 16, fontSize: 13, color: "#3a3a3a" },
};

window.Newsletter = Newsletter;
