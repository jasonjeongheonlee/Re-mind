export default function Navbar({ activeTab, onTabChange }) {
  const DAYS   = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const now    = new Date()
  const dateStr = `${DAYS[now.getDay()]},  ${String(now.getDate()).padStart(2,'0')} ${MONTHS[now.getMonth()]} ${String(now.getFullYear()).slice(2)}`

  const tabs = [
    { id: 'reminder', label: 'Reminder' },
    { id: 'rewinder', label: 'Rewinder' },
  ]

  return (
    <nav style={s.nav}>
      <div style={s.logoRow}>
        <span style={s.logo}>re:minder</span>
      </div>

      <div style={s.separator} />

      <div style={s.tabsRow}>
        <div style={s.tabGroup}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={s.dateChip}>{dateStr}</div>
      </div>
    </nav>
  )
}

const s = {
  nav: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  logoRow: {
    padding: '20px 36px 14px',
  },
  logo: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    opacity: 0.95,
  },
  separator: {
    height: 1,
    background: 'linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)',
    margin: '0 36px',
  },
  tabsRow: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 28px 12px',
  },
  tabGroup: {
    display: 'flex',
    gap: 2,
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.40)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    padding: '6px 18px',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontWeight: 700,
  },
  dateChip: {
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    padding: '6px 16px',
  },
}
