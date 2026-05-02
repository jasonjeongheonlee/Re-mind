export default function Navbar({ activeTab, onTabChange }) {
  const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const now = new Date()
  const dateStr = `${DAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]} ${String(now.getFullYear()).slice(2)}`

  const tabs = [
    { id: 'reminder',  label: 'Reminder'  },
    { id: 'mindmap',   label: 'Mindmap'   },
    { id: 'rewinder',  label: 'Rewinder'  },
  ]

  return (
    <nav style={styles.nav}>
      <div style={styles.logo}>re:minder</div>

      <div style={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.dateChip}>{dateStr}</div>
    </nav>
  )
}

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 28px',
    background: 'transparent',
    position: 'relative',
    zIndex: 10,
    flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logo: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    opacity: 0.95,
    minWidth: 120,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 9999,
    padding: '4px',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    padding: '6px 18px',
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    transition: 'all 0.2s ease',
    letterSpacing: '-0.01em',
  },
  tabActive: {
    background: 'rgba(255,255,255,0.18)',
    color: '#fff',
    fontWeight: 600,
  },
  dateChip: {
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    padding: '6px 14px',
    minWidth: 120,
    textAlign: 'right',
  },
}
