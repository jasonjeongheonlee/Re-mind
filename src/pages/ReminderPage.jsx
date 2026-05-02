import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, useTransform, AnimatePresence, animate } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import {
  getUrgencyInfo,
  getBubbleStyle,
  sortByUrgency,
  getCountdown,
  getDeadlineLabel,
  getActiveItems,
  getMomentum,
} from '../utils/urgency'
import AddModal from '../components/AddModal'

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(deadline) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return getCountdown(deadline)
}

// ─── Long-press hook ──────────────────────────────────────────────────────────
function useLongPress(cb, ms = 500) {
  const timer = useRef(null)
  const start = useCallback(() => {
    timer.current = setTimeout(cb, ms)
  }, [cb, ms])
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])
  return { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel }
}

// ─── InfiniteMarquee ──────────────────────────────────────────────────────────
const MARQUEE_COPIES = 8

function InfiniteMarquee({ bubbleItems }) {
  const trackRef = useRef(null)
  const xMotion = useMotionValue(0)
  const animRef = useRef(null)

  // Stable key: restart animation only when item list actually changes
  const itemsKey = bubbleItems.map((i) => i.id).join('|')

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    // Stop any previous animation
    if (animRef.current) { animRef.current.stop(); animRef.current = null }

    const start = () => {
      const singleWidth = track.scrollWidth / MARQUEE_COPIES
      if (singleWidth <= 0) return
      xMotion.set(0)
      animRef.current = animate(xMotion, -singleWidth, {
        duration: singleWidth / 80,   // 80 px/s → slow, constant speed
        ease: 'linear',
        repeat: Infinity,
        repeatType: 'loop',
      })
    }

    // Brief delay so DOM finishes layout before we measure
    const t = setTimeout(start, 60)
    return () => {
      clearTimeout(t)
      if (animRef.current) { animRef.current.stop(); animRef.current = null }
    }
  }, [itemsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderCopy = (copyIdx) =>
    bubbleItems.map((item) => {
      const { level } = getUrgencyInfo(item.deadline)
      const bStyle = getBubbleStyle(level)
      // clamp()-based sizes so bubbles scale with viewport width
      const fs  = `clamp(${10 + Math.round(bStyle.scale * 3)}px, ${(0.55 + bStyle.scale * 0.38).toFixed(2)}vw, ${15 + Math.round(bStyle.scale * 7)}px)`
      const pv  = `clamp(${6  + Math.round(bStyle.scale * 3)}px, ${(0.35 + bStyle.scale * 0.18).toFixed(2)}vw, ${11 + Math.round(bStyle.scale * 5)}px)`
      const ph  = `clamp(${13 + Math.round(bStyle.scale * 5)}px, ${(0.75 + bStyle.scale * 0.45).toFixed(2)}vw, ${22 + Math.round(bStyle.scale * 9)}px)`
      return (
        <div
          key={`c${copyIdx}-${item.id}`}
          className="bubble"
          style={{
            background: bStyle.bg,
            color: bStyle.color,
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
            border: (level === 'medium' || level === 'low' || level === 'none')
              ? '1px solid rgba(255,255,255,0.25)'
              : 'none',
            fontSize: fs,
            padding: `${pv} ${ph}`,
            opacity: bStyle.opacity,
            flexShrink: 0,
            boxShadow: bStyle.glow ? '0 0 20px rgba(192,254,55,0.4)' : 'none',
          }}
        >
          {item.mainKeyword}
        </div>
      )
    })

  return (
    <motion.div
      ref={trackRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: 'max-content',
        gap: 'clamp(8px, 0.75vw, 18px)',
        x: xMotion,
        willChange: 'transform',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {Array.from({ length: MARQUEE_COPIES }, (_, i) => renderCopy(i))}
    </motion.div>
  )
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
function SwipeCard({ item, onDone, onDefer, isCenter, offset }) {
  const countdown = useCountdown(item.deadline)
  const { level } = getUrgencyInfo(item.deadline)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-18, 18])
  const doneOpacity = useTransform(x, [0, 80], [0, 1])
  const laterOpacity = useTransform(x, [-80, 0], [1, 0])
  const [showSubs, setShowSubs] = useState(false)

  const longPress = useLongPress(() => setShowSubs(true))

  const handleDragEnd = (_, info) => {
    if (info.offset.x > 100)       onDone()
    else if (info.offset.x < -100) onDefer()
  }

  const isUrgent = level === 'critical' || level === 'overdue' || level === 'high'
  const deadlineLabel = getDeadlineLabel(item.deadline)

  if (!isCenter) {
    const side = offset > 0 ? 1 : -1
    return (
      <div style={{
        ...sStyles.sideCard,
        transform: `translateX(${side * 240}px) scale(0.88)`,
        opacity: 0.35,
        filter: 'blur(3px)',
        pointerEvents: 'none',
      }}>
        <div style={{ ...sStyles.cardKeywordPill, background: isUrgent ? '#C0FE37' : 'rgba(255,255,255,0.2)', color: isUrgent ? '#000' : '#fff' }}>
          {item.mainKeyword}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      drag="x"
      dragMomentum={false}
      dragElastic={0.18}
      style={{ x, rotate, ...sStyles.centerCard }}
      onDragEnd={handleDragEnd}
      whileTap={{ cursor: 'grabbing' }}
      {...longPress}
    >
      {/* Done / Later overlays */}
      <motion.div style={{ ...sStyles.swipeHint, ...sStyles.swipeHintDone, opacity: doneOpacity }}>
        Done
      </motion.div>
      <motion.div style={{ ...sStyles.swipeHint, ...sStyles.swipeHintLater, opacity: laterOpacity }}>
        Later
      </motion.div>

      {/* Keyword header */}
      <div style={{
        ...sStyles.cardKeywordPill,
        background: isUrgent ? '#C0FE37' : 'rgba(255,255,255,0.2)',
        color: isUrgent ? '#000' : '#fff',
        fontSize: 26,
        fontWeight: 800,
        padding: '14px 28px',
        marginBottom: 16,
      }}>
        {item.mainKeyword}
      </div>

      {/* Body grid */}
      <div style={sStyles.cardBody}>
        {/* Sub-keywords */}
        <div style={sStyles.subGrid}>
          <AnimatePresence>
            {(showSubs ? item.subKeywords : item.subKeywords.slice(0, 1)).map((sk, i) => (
              <motion.span
                key={sk.id}
                style={sStyles.subChip}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: i * 0.06, type: 'spring', damping: 18, stiffness: 260 }}
              >
                {sk.text}
              </motion.span>
            ))}
            {!showSubs && item.subKeywords.length > 1 && (
              <motion.span
                key="more"
                style={{ ...sStyles.subChip, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={(e) => { e.stopPropagation(); setShowSubs(true) }}
              >
                +{item.subKeywords.length - 1} more
              </motion.span>
            )}
          </AnimatePresence>
          {!showSubs && (
            <p style={sStyles.longPressHint}>Hold to reveal all</p>
          )}
        </div>

        {/* Date panel */}
        {item.deadline && (
          <div style={sStyles.datePanelWrap}>
            <div style={sStyles.datePanel}>
              <div style={sStyles.datePanelLabel}>{deadlineLabel}</div>
              <div style={sStyles.datePanelCountdown}>{countdown}</div>
            </div>
          </div>
        )}
      </div>

      {/* Location chip (last sub-keyword or type) */}
      <div style={sStyles.locationChip}>
        {item.subKeywords[item.subKeywords.length - 1]?.text || (item.type === 'idea' ? 'Idea' : 'Task')}
      </div>
    </motion.div>
  )
}

// ─── SwipeMode overlay ────────────────────────────────────────────────────────
function SwipeMode({ items, onExit }) {
  const { completeItem, deferItem } = useAppStore()
  const [doneCount, setDoneCount] = useState(0)
  // Use a queue of item IDs so we control order independently of store state
  const allActive = items.filter((i) => !i.completed && !i.deferred)
  const [queue, setQueue] = useState(() => allActive.map((i) => i.id))
  const [processedIds, setProcessedIds] = useState([])

  // Pending = in queue and not yet processed
  const pendingIds = queue.filter((id) => !processedIds.includes(id))
  const currentId = pendingIds[0] ?? null
  const currentItem = currentId ? allActive.find((i) => i.id === currentId) ?? null : null
  const nextId = pendingIds[1] ?? null
  const nextItem = nextId ? allActive.find((i) => i.id === nextId) ?? null : null
  const prevProcessedId = processedIds[processedIds.length - 1] ?? null
  const prevItem = prevProcessedId ? items.find((i) => i.id === prevProcessedId) ?? null : null

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const advance = (id, action) => {
    if (action === 'done') { completeItem(id); setDoneCount((n) => n + 1) }
    else deferItem(id)
    setProcessedIds((prev) => [...prev, id])
  }

  const allDone = pendingIds.length === 0

  if (allDone) {
    return (
      <motion.div style={sStyles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.03em' }}>All clear</div>
          <div style={{ opacity: 0.5, marginBottom: 32 }}>No more items to review.</div>
          <button style={sStyles.exitBtn} onClick={onExit}>Back to overview</button>
        </div>
      </motion.div>
    )
  }

  if (!currentItem) return null

  return (
    <motion.div
      style={sStyles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Exit */}
      <button style={sStyles.exitBtn} onClick={onExit}>✕</button>

      {/* Header */}
      <div style={sStyles.swipeHeader}>
        <div style={sStyles.swipeH1}>Swipe right to done</div>
        <div style={sStyles.swipeH2}>Swipe left to later</div>
      </div>

      {/* Cards area */}
      <div style={sStyles.cardsArea}>
        {/* Left ghost (previous processed) */}
        {prevItem && (
          <SwipeCard item={prevItem} isCenter={false} offset={-1} />
        )}
        {/* Center */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentItem.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 280 }}
          >
            <SwipeCard
              item={currentItem}
              isCenter
              onDone={() => advance(currentItem.id, 'done')}
              onDefer={() => advance(currentItem.id, 'defer')}
            />
          </motion.div>
        </AnimatePresence>
        {/* Right next */}
        {nextItem && (
          <SwipeCard item={nextItem} isCenter={false} offset={1} />
        )}
      </div>

      {/* Done counter */}
      <div style={sStyles.doneCounter}>
        <span style={sStyles.doneNumber}>{doneCount}</span>
        <span style={sStyles.doneLabel}>done</span>
      </div>

      {/* Progress */}
      <div style={sStyles.progressRow}>
        {queue.map((id) => (
          <div
            key={id}
            style={{
              ...sStyles.progressDot,
              background: processedIds.includes(id)
                ? '#C0FE37'
                : id === currentId
                ? '#fff'
                : 'rgba(255,255,255,0.25)',
              width: id === currentId ? 20 : 6,
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}

// ─── ReminderPage ─────────────────────────────────────────────────────────────
export default function ReminderPage({ onAdd }) {
  const items = useAppStore((s) => s.items)
  const [showSwipe, setShowSwipe] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const active = getActiveItems(items)
  const sorted = sortByUrgency(active)
  const momentum = getMomentum(items)
  const urgentCount = active.filter((i) => {
    const { level } = getUrgencyInfo(i.deadline)
    return level === 'critical' || level === 'overdue' || level === 'high'
  }).length

  const momentumColor = { high: '#C0FE37', medium: '#88AEDB', low: 'rgba(255,255,255,0.5)', none: 'rgba(255,255,255,0.4)' }

  return (
    <div className="" style={styles.page}>
      {/* Hero — vh-based vertical padding so marquee stays visible on short windows */}
      <div style={{ ...styles.inner, padding: 'clamp(12px, 3.5vh, 40px) 48px clamp(8px, 2vh, 24px)' }}>
        <div style={styles.hero}>
          <h1 style={styles.h1}>Remind your tasks</h1>
          <h2 style={styles.h2}>Rewind your thoughts</h2>
          <p style={styles.subtitle}>Here's what needs your attention now.</p>
        </div>
      </div>

      {/* ── Full-width infinite marquee ── */}
      <div style={styles.marqueeWrapper}>
        <InfiniteMarquee bubbleItems={sorted} />
      </div>

      <div style={styles.inner}>
        {/* Overview section */}
        <div style={styles.overviewSection}>
          <p style={styles.overviewLabel}>Take a Look Today</p>
          <p style={styles.overviewText}>
            You have{' '}
            <span style={styles.overviewHighlight}>{urgentCount} items</span>
            {' '}needing your attention today.<br />
            Your current momentum is{' '}
            <span style={{ ...styles.overviewHighlight, color: momentumColor[momentum] }}>
              {momentum}
            </span>
          </p>
        </div>

        {/* Preview cards + CTA */}
        <div style={styles.previewRow}>
          {sorted.slice(0, 3).map((item, i) => {
            const { level, label } = getUrgencyInfo(item.deadline)
            const isUrgent = level === 'critical' || level === 'overdue' || level === 'high'
            return (
              <motion.div
                key={item.id}
                className="glass-card"
                style={{
                  ...styles.previewCard,
                  cursor: 'pointer',
                  borderColor: isUrgent ? 'rgba(192,254,55,0.3)' : 'rgba(255,255,255,0.12)',
                }}
                whileHover={{ scale: 1.03, borderColor: 'rgba(255,255,255,0.35)' }}
                onClick={() => setShowSwipe(true)}
              >
                <div style={{
                  ...styles.previewCardKeyword,
                  color: isUrgent ? '#C0FE37' : '#fff',
                }}>
                  {item.mainKeyword}
                </div>
                <div style={styles.previewCardLabel}>{label}</div>
                {item.subKeywords[0] && (
                  <div style={styles.previewCardSub}>{item.subKeywords[0].text}</div>
                )}
              </motion.div>
            )
          })}
        </div>

        {/* Start swiping CTA */}
        <div style={styles.ctaRow}>
          <motion.button
            style={styles.ctaBtn}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowSwipe(true)}
          >
            Start Swiping
            <span style={{ marginLeft: 8, fontSize: 16 }}>→</span>
          </motion.button>
          <p style={styles.ctaHint}>or press any card above</p>
        </div>
      </div>

      {/* FAB */}
      <motion.button
        style={styles.fab}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setShowAddModal(true)}
      >
        +
      </motion.button>

      {/* SwipeMode overlay */}
      <AnimatePresence>
        {showSwipe && (
          <SwipeMode items={items} onExit={() => setShowSwipe(false)} />
        )}
      </AnimatePresence>

      {/* AddModal */}
      {showAddModal && <AddModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  page: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflowY: 'auto',
    position: 'relative',
  },
  inner: {
    width: '100%',
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    padding: '40px 48px 32px',
    gap: 32,
  },
  hero: { display: 'flex', flexDirection: 'column', gap: 6 },
  h1: { color: '#fff', fontSize: 'clamp(48px, 6vw, 80px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 },
  h2: { color: 'rgba(255,255,255,0.65)', fontSize: 'clamp(32px, 4.5vw, 58px)', fontWeight: 300, letterSpacing: '-0.025em' },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: 400, marginTop: 6 },
  marqueeWrapper: {
    width: '100%',
    overflow: 'hidden',
    padding: '6px 0',
    flexShrink: 0,          /* 창이 낮아져도 마퀴 영역이 압축되지 않음 */
    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
    maskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
  },
  overviewSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  overviewLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
  overviewText: { color: '#fff', fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.4 },
  overviewHighlight: { color: '#C0FE37', fontWeight: 700 },
  previewRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  previewCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minWidth: 180,
    maxWidth: 240,
    flex: '1 1 180px',
    padding: '22px 20px',
    transition: 'border-color 0.2s',
  },
  previewCardKeyword: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' },
  previewCardLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 500 },
  previewCardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 400 },
  ctaRow: { display: 'flex', alignItems: 'center', gap: 16 },
  ctaBtn: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 9999,
    color: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    padding: '13px 32px',
    letterSpacing: '-0.01em',
  },
  ctaHint: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  fab: {
    alignItems: 'center',
    background: '#C0FE37',
    border: 'none',
    borderRadius: 9999,
    bottom: 32,
    color: '#000',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 28,
    fontWeight: 300,
    height: 56,
    justifyContent: 'center',
    position: 'fixed',
    right: 32,
    width: 56,
    boxShadow: '0 4px 20px rgba(192,254,55,0.45)',
    zIndex: 50,
  },
}

const sStyles = {
  overlay: {
    alignItems: 'center',
    background: 'linear-gradient(160deg, #1A2675 0%, #1E54BA 45%, #2B6ED4 75%, #88AEDB 100%)',
    display: 'flex',
    flexDirection: 'column',
    inset: 0,
    justifyContent: 'center',
    position: 'fixed',
    zIndex: 100,
    gap: 24,
  },
  exitBtn: {
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 9999,
    color: '#fff',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 20px',
    position: 'absolute',
    right: 28,
    top: 28,
  },
  swipeHeader: { textAlign: 'center', userSelect: 'none' },
  swipeH1: { color: '#fff', fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 800, letterSpacing: '-0.02em' },
  swipeH2: { color: 'rgba(255,255,255,0.55)', fontSize: 'clamp(18px, 2.2vw, 24px)', fontWeight: 300, letterSpacing: '-0.015em' },
  cardsArea: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
    height: 380,
  },
  sideCard: {
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 28,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'absolute',
    width: 280,
    height: 320,
    transition: 'all 0.3s ease',
  },
  centerCard: {
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 28,
    cursor: 'grab',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '24px 24px 20px',
    position: 'relative',
    width: 340,
    minHeight: 320,
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    userSelect: 'none',
    touchAction: 'none',
  },
  swipeHint: {
    alignItems: 'center',
    borderRadius: 9999,
    display: 'flex',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 18,
    fontWeight: 800,
    justifyContent: 'center',
    letterSpacing: '0.04em',
    padding: '8px 20px',
    position: 'absolute',
    top: 18,
    pointerEvents: 'none',
    textTransform: 'uppercase',
    border: '3px solid',
  },
  swipeHintDone: {
    border: '3px solid #C0FE37',
    color: '#C0FE37',
    right: 16,
    transform: 'rotate(12deg)',
  },
  swipeHintLater: {
    border: '3px solid rgba(255,100,100,0.9)',
    color: 'rgba(255,100,100,0.9)',
    left: 16,
    transform: 'rotate(-12deg)',
  },
  cardKeywordPill: {
    borderRadius: 9999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    padding: '10px 22px',
    fontSize: 20,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  cardBody: {
    display: 'flex',
    gap: 10,
    flex: 1,
  },
  subGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
    flex: 1,
    alignContent: 'flex-start',
    paddingTop: 4,
  },
  subChip: {
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.9)',
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 12px',
  },
  longPressHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontStyle: 'italic',
    width: '100%',
    marginTop: 4,
  },
  datePanelWrap: { display: 'flex', alignItems: 'flex-start', paddingTop: 4 },
  datePanel: {
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
    padding: '14px 10px',
    gap: 4,
  },
  datePanelLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: 700 },
  datePanelCountdown: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em' },
  locationChip: {
    alignSelf: 'stretch',
    background: '#C0FE37',
    borderRadius: 9999,
    color: '#000',
    fontSize: 13,
    fontWeight: 700,
    marginTop: 12,
    padding: '10px 20px',
    textAlign: 'center',
  },
  doneCounter: {
    alignItems: 'flex-end',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    position: 'absolute',
    right: 40,
    top: '50%',
    transform: 'translateY(-50%)',
  },
  doneNumber: { color: '#fff', fontSize: 'clamp(48px, 7vw, 72px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 },
  doneLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 500 },
  progressRow: {
    alignItems: 'center',
    display: 'flex',
    gap: 5,
    justifyContent: 'center',
  },
  progressDot: {
    borderRadius: 9999,
    height: 6,
    background: 'rgba(255,255,255,0.25)',
    transition: 'all 0.3s ease',
  },
}
