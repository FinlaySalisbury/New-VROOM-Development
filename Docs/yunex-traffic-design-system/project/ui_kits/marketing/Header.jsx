// Header.jsx — top nav for the Yunex Traffic marketing site
function Header() {
  const [open, setOpen] = React.useState(null);
  const items = [
    { label: "Solutions",   menu: ["Adaptive control", "Highway & tunnel", "V2X", "Tolling", "Stratos platform"] },
    { label: "Industries",  menu: ["Cities", "Highways", "Operators"] },
    { label: "Insights",    menu: ["Case studies", "Press", "White papers"] },
    { label: "About",       menu: ["Who we are", "Careers", "Contact"] },
  ];

  return (
    <header style={ytHeader.bar}>
      <a href="#" style={ytHeader.brand} aria-label="Yunex Traffic">
        <img src="../../assets/logo-yunex-traffic-black.png" alt="Yunex Traffic" style={ytHeader.logo}/>
      </a>

      <nav style={ytHeader.nav}>
        {items.map((it) => (
          <div key={it.label}
               onMouseEnter={() => setOpen(it.label)}
               onMouseLeave={() => setOpen(null)}
               style={ytHeader.navItemWrap}>
            <button style={{ ...ytHeader.navItem, ...(open === it.label ? ytHeader.navItemActive : {}) }}>
              {it.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            {open === it.label && (
              <div style={ytHeader.dropdown}>
                {it.menu.map((m) => (
                  <a key={m} href="#" style={ytHeader.dropdownItem}>{m}</a>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div style={ytHeader.actions}>
        <button style={ytHeader.iconBtn} aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/>
          </svg>
        </button>
        <button style={ytHeader.iconBtn} aria-label="Language">EN</button>
        <a href="#" style={ytHeader.cta}>
          Get in touch
          <span style={ytHeader.arrow}/>
        </a>
      </div>
    </header>
  );
}

const ytHeader = {
  bar: {
    height: 72, background: "#fff", borderBottom: "1px solid #E4EDED",
    display: "flex", alignItems: "center", padding: "0 32px", gap: 32,
    position: "sticky", top: 0, zIndex: 50,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  brand: {
    display: "flex", alignItems: "center", textDecoration: "none", borderBottom: 0,
  },
  logo: { height: 26, width: "auto", display: "block" },
  nav: { display: "flex", gap: 4, marginLeft: 16 },
  navItemWrap: { position: "relative" },
  navItem: {
    background: "transparent", border: 0, padding: "10px 14px",
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, fontWeight: 500,
    color: "#000", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
    borderRadius: 6,
  },
  navItemActive: { background: "#E4EDED" },
  dropdown: {
    position: "absolute", top: "100%", left: 0,
    background: "#fff", border: "1px solid #E4EDED", borderRadius: 12,
    minWidth: 240, padding: 8, boxShadow: "0 18px 48px rgba(15,28,64,0.12)",
    display: "flex", flexDirection: "column", marginTop: 4,
  },
  dropdownItem: {
    padding: "10px 12px", borderRadius: 8, fontSize: 14, color: "#000",
    textDecoration: "none", borderBottom: 0,
  },
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 },
  iconBtn: {
    background: "transparent", border: 0, color: "#000", cursor: "pointer",
    width: 36, height: 36, borderRadius: 999,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 600,
  },
  cta: {
    display: "inline-flex", alignItems: "center", gap: 10,
    background: "#000", color: "#fff",
    padding: "10px 20px", borderRadius: 999, textDecoration: "none",
    fontSize: 14, fontWeight: 600, borderBottom: 0,
  },
  arrow: {
    width: 14, height: 1.5, background: "currentColor", position: "relative",
    display: "inline-block",
  },
};

window.Header = Header;
