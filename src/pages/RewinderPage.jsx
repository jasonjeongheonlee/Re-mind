import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo } from '../utils/urgency'

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function groupByDate(items) {
  const groups = {}
  items.forEach((item) => {
    const dateKey = item.completedAt || item.deferredAt || item.createdAt
    const dayLabel = dateKey
      ? new Date(dateKey).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : 'Unknown'
    if (!groups[dayLabel]) groups[dayLabel] = []
    groups[dayLabel].push(item)
  })
  return Object.entries(groups).sort((a, b) => {
    const aDate = new Date(a[1][0].completedAt || a[1][0].deferredAt || 0)
    const bDate = new Date(b[1][0].completedAt || b[1][0].deferredAt || 0)
    return bDate - aDate
  })
}

function RewinderCard({ item }) {
  const { restoreItem, deleteItem } = useAppStore()
  const { level } = getUrgencyInfo(item.deadline)
  const isUrgent = level === 'critical' || level === 'overdue' || level === 'high'

  return (
    <motion.div
      style={styles.card}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      layout
    >
      <div style={styles.cardLeft}>
        <div style={styles.cardStatus}>
          {item.completed ? (
            <span style={styles.badge}>Done</span>
          ) : (
            <span style={{ ...styles.badge, background: 'rgba(255,200,80,0.15)', color: 'rgba(255,200,80,0.9)', borderColor: 'rgba(255,200,80,0.25)' }}>
              Deferred
            </span>
          )}
        </div>
        <div style={styles.cardKeyword}>{item.mainKeyword}</div>
        {item.subKeywords.length > 0 && (
          <div style={styles.subRow}>
            {item.subKeywords.slice(0, 3).map((sk) => (
              <span key={sk.id} style={styles.subChip}>{sk.text}</span>
            ))}
            {item.subKeywords.length > 3 && (
              <span style={{ ...styles.subChip, opacity: 0.5 }}>+{item.subKeywords.length - 3}</span>
            )}
          </div>
        )}
        <div style={styles.cardMeta}>
          {item.type === 'idea' && <span style={styles.ideaBadge}>Idea</span>}
          {item.completedAt && (
            <span style={styles.metaText}>Completed {formatDate(item.completedAt)}</span>
          )}
          {item.deferredAt && !item.completedAt && (
            <span style={styles.metaText}>Deferred {formatDate(item.deferredAt)}</span>
          )}
        </div>
      </div>

      <div style={styles.cardActions}>
        <motion.button
          style={styles.restoreBtn}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => restoreItem(item.id)}
        >
          Restore
        </motion.button>
        <motion.button
          style={styles.deleteBtn}
          whileHover={{ scale: 1.05, opacity: 0.8 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => deleteItem(item.id)}
        >
          Delete
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function RewinderPage() {
  const items = useAppStore((s) => s.items)
  const archived = items.filter((i) => i.completed || i.deferred)
  const groups = groupByDate(archived)

  return (
    <div className="" style={styles.page}>
      <div style={styles.inner}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.h1}>Rewinder</h1>
          <p style={styles.subtitle}>
            {archived.length === 0
              ? 'Nothing archived yet.'
              : `${archived.length} item${archived.length !== 1 ? 's' : ''} rewound`}
          </p>
        </div>

        {/* Stats */}
        {archived.length > 0 && (
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <div style={styles.statNum}>{items.filter((i) => i.completed).length}</div>
              <div style={styles.statLabel}>Completed</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNum, color: 'rgba(255,200,80,0.9)' }}>
                {items.filter((i) => i.deferred && !i.completed).length}
              </div>
              <div style={styles.statLabel}>Deferred</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNum, color: '#88AEDB' }}>
                {items.filter((i) => !i.completed && !i.deferred).length}
              </div>
              <div style={styles.statLabel}>Active</div>
            </div>
          </div>
        )}

        {/* Groups */}
        <div style={styles.groups}>
          <AnimatePresence>
            {archived.length === 0 ? (
              <motion.div
                style={styles.empty}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, textAlign: 'center', lineHeight: 1.6 }}>
                  Complete or defer items in the Reminder tab<br />
                  and they'll rewind here.
                </p>
              </motion.div>
            ) : (
              groups.map(([dayLabel, groupItems]) => (
                <motion.div key={dayLabel} style={styles.group} layout>
                  <div style={styles.groupLabel}>{dayLabel}</div>
                  <div style={styles.groupItems}>
                    <AnimatePresence>
                      {groupItems.map((item) => (
                        <RewinderCard key={item.id} item={item} />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    overflowY: 'auto',
    position: 'relative',
    width: '100%',
  },
  inner: {
    width: '100%',
    maxWidth: 960,
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    padding: '40px 48px 48px',
  },
  header: { display: 'flex', flexDirection: 'column', gap: 6 },
  h1: { color: '#fff', fontSize: 'clamp(48px, 6vw, 80px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
  statsRow: { display: 'flex', gap: 12 },
  statCard: {
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '16px 20px',
    minWidth: 100,
  },
  statNum: { color: '#C0FE37', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' },
  statLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' },
  groups: { display: 'flex', flexDirection: 'column', gap: 28 },
  group: { display: 'flex', flexDirection: 'column', gap: 12 },
  groupLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
  groupItems: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 18,
    display: 'flex',
    gap: 16,
    justifyContent: 'space-between',
    padding: '18px 20px',
  },
  cardLeft: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
  cardStatus: {},
  badge: {
    background: 'rgba(192,254,55,0.12)',
    border: '1px solid rgba(192,254,55,0.25)',
    borderRadius: 9999,
    color: '#C0FE37',
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '3px 10px',
    textTransform: 'uppercase',
  },
  cardKeyword: { color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' },
  subRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  subChip: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 10px',
    display: 'inline-block',
  },
  cardMeta: { alignItems: 'center', display: 'flex', gap: 8 },
  ideaBadge: {
    background: 'rgba(136,174,219,0.15)',
    border: '1px solid rgba(136,174,219,0.25)',
    borderRadius: 9999,
    color: '#88AEDB',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    letterSpacing: '0.04em',
  },
  metaText: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  cardActions: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  restoreBtn: {
    background: 'rgba(192,254,55,0.12)',
    border: '1px solid rgba(192,254,55,0.3)',
    borderRadius: 9999,
    color: '#C0FE37',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 12,
    fontWeight: 700,
    padding: '7px 16px',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.3)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    padding: '7px 16px',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  empty: { display: 'flex', justifyContent: 'center', padding: '60px 0' },
}
