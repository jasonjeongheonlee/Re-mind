import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo, getBubbleStyle } from '../utils/urgency'

const MIN_SCALE = 0.25
const MAX_SCALE = 4.0
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const URGENCY_ORDER = { overdue: 0, critical: 1, high: 2, medium: 3, low: 4, none: 5 }

function getBubbleSize(item) {
  const m = bubbleMetrics(item)
  return { w: m.rx * 2, h: m.ry * 2 }
}

// Push dragged bubble out of all overlapping bubbles (AABB, up to 4 passes)
function resolveOverlap(draggedItem, proposedPos, allItems) {
  const { w: dW, h: dH } = getBubbleSize(draggedItem)
  let rx = proposedPos.x, ry = proposedPos.y
  const others = allItems.filter((i) => !i.completed && !i.deferred && i.id !== draggedItem.id)
  for (let pass = 0; pass < 4; pass++) {
    let anyOverlap = false
    for (const other of others) {
      const { w: oW, h: oH } = getBubbleSize(other)
      const ox = other.position.x, oy = other.position.y
      const overlapX = Math.max(0, Math.min(rx + dW, ox + oW) - Math.max(rx, ox))
      const overlapY = Math.max(0, Math.min(ry + dH, oy + oH) - Math.max(ry, oy))
      if (overlapX > 0 && overlapY > 0) {
        anyOverlap = true
        if (overlapX <= overlapY) rx += (rx + dW / 2 < ox + oW / 2) ? -overlapX : overlapX
        else                       ry += (ry + dH / 2 < oy + oH / 2) ? -overlapY : overlapY
      }
    }
    if (!anyOverlap) break
  }
  return { x: rx, y: ry }
}

const SNAP_GAP = 22

// Snap to 0 gap against the nearest bubble if within SNAP_GAP
function snapIfClose(draggedItem, pos, allItems) {
  const { w: dW, h: dH } = getBubbleSize(draggedItem)
  const others = allItems.filter((i) => !i.completed && !i.deferred && i.id !== draggedItem.id)
  let best = null, bestDist = Infinity
  for (const other of others) {
    const { w: oW, h: oH } = getBubbleSize(other)
    const ox = other.position.x, oy = other.position.y
    const gapX = Math.max(0, Math.max(pos.x, ox) - Math.min(pos.x + dW, ox + oW))
    const gapY = Math.max(0, Math.max(pos.y, oy) - Math.min(pos.y + dH, oy + oH))
    const dist = Math.sqrt(gapX * gapX + gapY * gapY)
    if (dist < SNAP_GAP && dist < bestDist) {
      bestDist = dist
      const dCx = pos.x + dW / 2, oCx = ox + oW / 2
      const dCy = pos.y + dH / 2, oCy = oy + oH / 2
      if (gapX <= gapY) best = { x: dCx < oCx ? ox - dW : ox + oW, y: pos.y }
      else              best = { x: pos.x, y: dCy < oCy ? oy - dH : oy + oH }
    }
  }
  return best ?? pos
}

// Estimate bubble pill geometry in world coordinates
function bubbleMetrics(item) {
  const { level } = getUrgencyInfo(item.deadline)
  const bs = getBubbleStyle(level)
  const fontSize = Math.round(13 * bs.scale * 0.95)
  const padV = Math.round(8 * bs.scale)
  const padH = Math.round(16 * bs.scale)
  const textW = item.mainKeyword.length * fontSize * 0.58
  const halfW = textW / 2 + padH
  const halfH = fontSize / 2 + padV
  return {
    cx: item.position.x + halfW,
    cy: item.position.y + halfH,
    rx: halfW,
    ry: halfH,
  }
}

// ─── ZoomControls (minimal Apple-style) ───────────────────────────────────────
function ZoomControls({ scale, onZoom }) {
  const pct = Math.round(scale * 100)
  return (
    <div style={zcStyles.wrap} onPointerDown={(e) => e.stopPropagation()}>
      <span style={zcStyles.label}>{pct}%</span>
      <input
        type="range"
        min={Math.round(MIN_SCALE * 100)}
        max={Math.round(MAX_SCALE * 100)}
        step={5}
        value={pct}
        onChange={(e) => onZoom(Number(e.target.value) / 100)}
        style={zcStyles.slider}
      />
    </div>
  )
}

// ─── ChunkBackground — frosted white offset outline via SVG goo ───────────────
function ChunkBackground({ items }) {
  const active = items.filter((i) => !i.completed && !i.deferred && i.chunkId)
  const chunks = {}
  active.forEach((item) => {
    if (!chunks[item.chunkId]) chunks[item.chunkId] = []
    chunks[item.chunkId].push(item)
  })
  const entries = Object.entries(chunks).filter(([, m]) => m.length >= 2)
  if (entries.length === 0) return null

  const PAD = 10

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
    >
      <defs>
        {/* Goo: blur then sharp alpha-threshold — merges adjacent expanded pill outlines */}
        <filter id="chunk-goo" filterUnits="objectBoundingBox" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 24 -11"
          />
        </filter>
      </defs>

      {entries.map(([chunkId, members]) => (
        // Low-opacity white group: goo filter merges outlines into one continuous frosted border
        <g key={chunkId} filter="url(#chunk-goo)" opacity={0.22}>
          {members.map((item) => {
            const { cx, cy, rx, ry } = bubbleMetrics(item)
            return (
              <rect
                key={item.id}
                x={cx - rx - PAD}
                y={cy - ry - PAD}
                width={(rx + PAD) * 2}
                height={(ry + PAD) * 2}
                rx={ry + PAD}
                fill="none"
                stroke="white"
                strokeWidth={22}
              />
            )
          })}
        </g>
      ))}
    </svg>
  )
}

// ─── BubbleNode ───────────────────────────────────────────────────────────────
function BubbleNode({ item, onDragStart, onDragEnd, isSelected, onSelect, onDoubleClick, scale }) {
  const { updatePosition, updateChunk } = useAppStore()
  const allItems = useAppStore((s) => s.items)
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const clickCount = useRef(0)
  const clickTimer = useRef(null)

  const { level } = getUrgencyInfo(item.deadline)
  const bStyle = getBubbleStyle(level)
  const isUrgent = level === 'critical' || level === 'overdue' || level === 'high'
  const fontSize = Math.round(13 * bStyle.scale * 0.95)
  const padV = Math.round(8 * bStyle.scale)
  const padH = Math.round(16 * bStyle.scale)

  const checkProximity = useCallback((id, newPos) => {
    const GROUP_GAP = 8  // group when bounding-box gap < 8px
    const draggedItem = allItems.find((i) => i.id === id)
    if (!draggedItem) return
    const { w: dW, h: dH } = getBubbleSize(draggedItem)
    const active = allItems.filter((i) => !i.completed && !i.deferred && i.id !== id)
    let closestGroup = null, closestGap = Infinity
    active.forEach((other) => {
      const { w: oW, h: oH } = getBubbleSize(other)
      const ox = other.position.x, oy = other.position.y
      const gapX = Math.max(0, Math.max(newPos.x, ox) - Math.min(newPos.x + dW, ox + oW))
      const gapY = Math.max(0, Math.max(newPos.y, oy) - Math.min(newPos.y + dH, oy + oH))
      const gap = gapX + gapY
      if (gap < GROUP_GAP && gap < closestGap) { closestGap = gap; closestGroup = other }
    })
    if (closestGroup) {
      const chunkId = closestGroup.chunkId || `chunk-${closestGroup.id}`
      updateChunk(closestGroup.id, chunkId)
      updateChunk(id, chunkId)
    } else {
      updateChunk(id, null)
    }
  }, [allItems, updateChunk])

  const handlePointerDown = useCallback((e) => {
    e.stopPropagation()
    onSelect()
    onDragStart()

    // Double-click detection via rapid pointer-down
    clickCount.current += 1
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 300)
    } else if (clickCount.current === 2) {
      clearTimeout(clickTimer.current)
      clickCount.current = 0
      onDoubleClick?.()
      return
    }

    const startX = e.clientX
    const startY = e.clientY
    const origX  = item.position.x
    const origY  = item.position.y
    let moved = false

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / scale
      const dy = (ev.clientY - startY) / scale
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        moved = true
        dragging.current = true
      }
      if (moved) {
        // Prevent overlapping other bubbles in real time
        const proposed = { x: origX + dx, y: origY + dy }
        const resolved = resolveOverlap(item, proposed, allItems)
        setDragDelta({ x: resolved.x - origX, y: resolved.y - origY })
      }
    }

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved) {
        const dx = (ev.clientX - startX) / scale
        const dy = (ev.clientY - startY) / scale
        // Resolve overlap, then snap to touch if within SNAP_GAP
        let newPos = resolveOverlap(item, { x: origX + dx, y: origY + dy }, allItems)
        newPos = snapIfClose(item, newPos, allItems)
        newPos = resolveOverlap(item, newPos, allItems)  // re-check after snap
        updatePosition(item.id, newPos)
        checkProximity(item.id, newPos)
      }
      setDragDelta({ x: 0, y: 0 })
      dragging.current = false
      setTimeout(() => onDragEnd(), 50)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [item.position.x, item.position.y, item.id, scale, onSelect, onDragStart, onDragEnd, onDoubleClick, updatePosition, checkProximity])

  const isDraggingNow = dragging.current

  return (
    <div
      style={{
        position: 'absolute',
        left: item.position.x + dragDelta.x,
        top:  item.position.y + dragDelta.y,
        zIndex: isDraggingNow ? 20 : isSelected ? 5 : 1,
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
    >
      <div
        className="bubble"
        style={{
          background: bStyle.bg,
          color: bStyle.color,
          fontSize,
          padding: `${padV}px ${padH}px`,
          opacity: bStyle.opacity,
          backdropFilter: isUrgent ? 'none' : 'blur(22px)',
          WebkitBackdropFilter: isUrgent ? 'none' : 'blur(22px)',
          border: isUrgent ? 'none' : '1px solid rgba(255,255,255,0.18)',
          boxShadow: isDraggingNow
            ? `0 20px 60px rgba(0,0,0,0.38)`
            : isUrgent
            ? '0 0 28px rgba(192,254,55,0.55)'
            : '0 2px 14px rgba(0,0,0,0.20)',
          outline: isSelected ? '2px solid rgba(255,255,255,0.75)' : '2px solid transparent',
          outlineOffset: 4,
          cursor: isDraggingNow ? 'grabbing' : 'grab',
          position: 'relative',
          transform: isDraggingNow ? 'scale(1.07)' : 'scale(1)',
          transition: isDraggingNow ? 'transform 0.1s' : 'outline 0.15s, transform 0.15s, box-shadow 0.15s',
        }}
      >
        {item.mainKeyword}
      </div>
    </div>
  )
}

// ─── BubbleDetailPopup ────────────────────────────────────────────────────────
function BubbleDetailPopup({ item, panOffset, scale, onClose }) {
  const { level, label } = getUrgencyInfo(item.deadline)
  const isUrgent = ['overdue', 'critical', 'high'].includes(level)
  const { cx, cy, ry } = bubbleMetrics(item)

  // Convert world center to artboard coordinates
  const screenX = cx * scale + panOffset.x
  const screenY = (cy - ry) * scale + panOffset.y - 12  // above bubble top edge

  const deadlineStr = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -100%)',
        zIndex: 40,
        pointerEvents: 'auto',
        minWidth: 200,
        maxWidth: 280,
      }}
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.94 }}
      transition={{ type: 'spring', damping: 24, stiffness: 360 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={dpStyles.card}>
        {/* Header */}
        <div style={dpStyles.header}>
          <div style={dpStyles.headerLeft}>
            {isUrgent && <span style={dpStyles.urgentDot} />}
            <span style={{ ...dpStyles.keyword, color: isUrgent ? '#C0FE37' : '#fff' }}>
              {item.mainKeyword}
            </span>
          </div>
          <button style={dpStyles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Sub-keywords */}
        {item.subKeywords.length > 0 && (
          <div style={dpStyles.subRow}>
            {item.subKeywords.map((sk) => (
              <span key={sk.id} style={dpStyles.subChip}>{sk.text}</span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div style={dpStyles.metaRow}>
          <span style={{ ...dpStyles.metaBadge, background: item.type === 'idea' ? 'rgba(136,174,219,0.18)' : 'rgba(255,255,255,0.10)', color: item.type === 'idea' ? '#88AEDB' : 'rgba(255,255,255,0.55)', borderColor: item.type === 'idea' ? 'rgba(136,174,219,0.25)' : 'rgba(255,255,255,0.12)' }}>
            {item.type === 'idea' ? 'Idea' : 'Task'}
          </span>
          {deadlineStr && (
            <span style={{ ...dpStyles.metaBadge, background: isUrgent ? 'rgba(255,100,100,0.12)' : 'rgba(255,255,255,0.08)', color: isUrgent ? '#FF7070' : 'rgba(255,255,255,0.45)', borderColor: isUrgent ? 'rgba(255,100,100,0.22)' : 'rgba(255,255,255,0.10)' }}>
              {label} · {deadlineStr}
            </span>
          )}
        </div>

        {/* Arrow pointing down */}
        <div style={dpStyles.arrow} />
      </div>
    </motion.div>
  )
}

// ─── DeadlineToast ────────────────────────────────────────────────────────────
function DeadlineToast({ onSelect, onSkip }) {
  const [picked, setPicked] = useState(null)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      offset: i,
      weekday: DAY_ABBR[d.getDay()],
      date: d.getDate(),
      badge: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : `+${i}d`,
    }
  })

  const handlePick = (offset) => {
    setPicked(offset)
    setTimeout(() => onSelect(offset), 180)
  }

  return (
    <motion.div
      style={ipStyles.toast}
      initial={{ y: 16, opacity: 0, scale: 0.97 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 10, opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={ipStyles.toastHeader}>
        <p style={ipStyles.toastQuestion}>Remind me on…</p>
        <p style={ipStyles.toastSub}>We'll ping you at 9:00 am</p>
      </div>

      <div style={ipStyles.dayGrid}>
        {days.map((day) => {
          const active = picked === day.offset
          return (
            <motion.button
              key={day.offset}
              style={{ ...ipStyles.dayBtn, ...(active ? ipStyles.dayBtnActive : {}) }}
              whileHover={!active ? { scale: 1.08, background: 'rgba(255,255,255,0.18)' } : {}}
              whileTap={{ scale: 0.93 }}
              onClick={() => handlePick(day.offset)}
            >
              <span style={{ ...ipStyles.dayWeekday, ...(active ? { color: 'rgba(255,255,255,0.7)' } : {}) }}>
                {day.weekday}
              </span>
              <span style={{ ...ipStyles.dayDate, ...(active ? { color: '#fff' } : {}) }}>
                {day.date}
              </span>
              <span style={{ ...ipStyles.dayBadge, ...(active ? ipStyles.dayBadgeActive : {}) }}>
                {day.badge}
              </span>
            </motion.button>
          )
        })}
      </div>

      <button style={ipStyles.toastSkipBtn} onClick={onSkip}>No deadline</button>
    </motion.div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ items }) {
  const active    = items.filter((i) => !i.completed && !i.deferred)
  const overdue   = active.filter((i) => ['overdue', 'critical'].includes(getUrgencyInfo(i.deadline).level))
  const completed = items.filter((i) => i.completed)

  const onTimePercent = active.length > 0
    ? Math.round(((active.length - overdue.length) / active.length) * 100)
    : 100

  const dotItems = items.slice(0, 40)

  return (
    <div style={rStyles.dashboard}>
      <div style={rStyles.dashTop}>
        <div style={rStyles.dashLeft}>
          <span style={rStyles.dashBigNum}>{active.length}</span>
          <span style={rStyles.dashBigLabel}>active</span>
        </div>
        <div style={rStyles.dashRight}>
          <div style={rStyles.dashSmallStat}>
            <span style={{ ...rStyles.dashSmallNum, color: '#FF7070' }}>{overdue.length}</span>
            <span style={rStyles.dashSmallLabel}>overdue</span>
          </div>
          <div style={rStyles.dashSmallStat}>
            <span style={{ ...rStyles.dashSmallNum, color: 'rgba(255,255,255,0.45)' }}>{completed.length}</span>
            <span style={rStyles.dashSmallLabel}>done</span>
          </div>
        </div>
      </div>

      {dotItems.length > 0 && (
        <div style={rStyles.dotMatrix}>
          {dotItems.map((item) => {
            const { level } = getUrgencyInfo(item.deadline)
            const bg = item.completed
              ? 'rgba(255,255,255,0.14)'
              : level === 'overdue' || level === 'critical' ? '#FF7070'
              : level === 'high' ? '#C0FE37'
              : level === 'medium' ? 'rgba(255,255,255,0.55)'
              : 'rgba(255,255,255,0.20)'
            return <div key={item.id} style={{ ...rStyles.dot, background: bg }} />
          })}
        </div>
      )}

      <div style={rStyles.percentRow}>
        <span style={rStyles.percentNum}>{onTimePercent}%</span>
        <span style={rStyles.percentLabel}>on time</span>
      </div>
    </div>
  )
}

// ─── SwipeableKeywordCard ─────────────────────────────────────────────────────
function SwipeableKeywordCard({ item, stackIdx, isTop, isUrgent, onComplete, onSnooze }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-120, 120], [-8, 8])
  const completeOpacity = useTransform(x, [20, 70], [0, 1])
  const snoozeOpacity   = useTransform(x, [-70, -20], [1, 0])

  const handleDragEnd = (_, info) => {
    if (info.offset.x > 80)       onComplete()
    else if (info.offset.x < -80) onSnooze()
  }

  const deadline = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  if (!isTop) {
    return (
      <div style={{
        ...rStyles.stackCard,
        transform: `translateY(${stackIdx * 5}px) scale(${1 - stackIdx * 0.04})`,
        zIndex: 10 - stackIdx,
        opacity: 1 - stackIdx * 0.25,
        pointerEvents: 'none',
      }} />
    )
  }

  return (
    <motion.div
      drag="x"
      dragMomentum={false}
      dragElastic={0.12}
      style={{ x, rotate, ...rStyles.stackCard, zIndex: 20, cursor: 'grab' }}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 300 }}
      onDragEnd={handleDragEnd}
    >
      <motion.span style={{ ...rStyles.swipeBadge, ...rStyles.swipeBadgeLeft,  opacity: snoozeOpacity }}>+1d</motion.span>
      <motion.span style={{ ...rStyles.swipeBadge, ...rStyles.swipeBadgeRight, opacity: completeOpacity }}>✓</motion.span>

      <div style={rStyles.stackCardInner}>
        <span style={{ ...rStyles.stackKw, color: isUrgent ? '#C0FE37' : 'rgba(255,255,255,0.90)' }}>
          {item.mainKeyword}
        </span>
        <div style={rStyles.stackMeta}>
          {deadline && <span style={rStyles.stackDl}>{deadline}</span>}
          {item.type === 'idea' && <span style={rStyles.stackTypeBadge}>Idea</span>}
        </div>
      </div>

      <div style={rStyles.stackSwipeHints}>
        <span style={rStyles.stackHint}>← snooze</span>
        <span style={rStyles.stackHint}>done →</span>
      </div>
    </motion.div>
  )
}

// ─── SwipeableCardStack ───────────────────────────────────────────────────────
function SwipeableCardStack({ items }) {
  const { completeItem, updateItem } = useAppStore()
  const [filter, setFilter]    = useState('active')
  const [topIndex, setTopIndex] = useState(0)

  const sorted = useMemo(() => {
    let list = [...items]
    if (filter === 'active') list = list.filter((i) => !i.completed && !i.deferred)
    else if (filter === 'done') list = list.filter((i) => i.completed)
    list.sort((a, b) => {
      const ao = URGENCY_ORDER[getUrgencyInfo(a.deadline).level] ?? 5
      const bo = URGENCY_ORDER[getUrgencyInfo(b.deadline).level] ?? 5
      return ao - bo
    })
    return list
  }, [items, filter])

  useEffect(() => { setTopIndex(0) }, [filter])

  const snooze = useCallback((id) => {
    const item = items.find((i) => i.id === id)
    const base = item?.deadline ? new Date(item.deadline) : new Date()
    base.setDate(base.getDate() + 1)
    base.setHours(9, 0, 0, 0)
    updateItem(id, { deadline: base.toISOString() })
  }, [items, updateItem])

  const advance = useCallback(() => setTopIndex((i) => i + 1), [])

  const visibleSlice = sorted.slice(topIndex, topIndex + 3)
  const allDone      = sorted.length - topIndex <= 0

  const FILTERS = [
    { id: 'active', label: 'Active' },
    { id: 'done',   label: 'Done'   },
    { id: 'all',    label: 'All'    },
  ]

  return (
    <div style={rStyles.listPanel}>
      <div style={rStyles.listHeader}>
        <span style={rStyles.panelTitle}>Queue</span>
        <div style={rStyles.filterPills}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              style={{ ...rStyles.filterBtn, ...(filter === f.id ? rStyles.filterBtnActive : {}) }}
              onClick={() => { setFilter(f.id); setTopIndex(0) }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!allDone && sorted.length > 0 && (
        <div style={rStyles.stackProgress}>
          <span style={rStyles.stackProgressText}>{topIndex} / {sorted.length}</span>
        </div>
      )}

      <div style={rStyles.cardStackArea}>
        {allDone ? (
          <motion.div
            style={rStyles.stackEmpty}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <span style={rStyles.stackEmptyIcon}>✓</span>
            <span style={rStyles.stackEmptyText}>
              {sorted.length === 0 ? 'Nothing here yet.' : 'All reviewed'}
            </span>
            {sorted.length > 0 && (
              <button style={rStyles.stackResetBtn} onClick={() => setTopIndex(0)}>
                Start over
              </button>
            )}
          </motion.div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: 140 }}>
            {[...visibleSlice].reverse().map((item, rIdx) => {
              const stackIdx = visibleSlice.length - 1 - rIdx
              const { level } = getUrgencyInfo(item.deadline)
              const isUrgent = ['overdue', 'critical', 'high'].includes(level)
              return (
                <SwipeableKeywordCard
                  key={item.id}
                  item={item}
                  stackIdx={stackIdx}
                  isTop={stackIdx === 0}
                  isUrgent={isUrgent}
                  onComplete={() => { completeItem(item.id); advance() }}
                  onSnooze={() => { snooze(item.id); advance() }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MindmapPage ──────────────────────────────────────────────────────────────
export default function MindmapPage() {
  const items = useAppStore((s) => s.items)
  const { addItem } = useAppStore()
  const activeItems = items.filter((i) => !i.completed && !i.deferred)

  // ── Canvas pan ──
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const isDraggingBubble = useRef(false)
  const panRef = useRef(panOffset)
  panRef.current = panOffset

  // ── Canvas zoom ──
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const containerRef = useRef(null)

  // ── Bubble selection & detail popup ──
  const [selectedId, setSelectedId]   = useState(null)
  const [detailItemId, setDetailItemId] = useState(null)
  const detailItem = detailItemId ? items.find((i) => i.id === detailItemId) ?? null : null

  // ── Input state ──
  const [step, setStep] = useState('idle')
  const [mainKeyword, setMainKeyword] = useState('')
  const [subInput, setSubInput] = useState('')
  const [subKeywords, setSubKeywords] = useState([])
  const [type, setType] = useState('task')
  const [showToast, setShowToast] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (step !== 'idle') inputRef.current?.focus()
  }, [step])

  // ── Wheel zoom ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e) => {
      e.preventDefault()
      const sensitivity = e.ctrlKey ? 1 : 0.45
      const zoomFactor = Math.exp(-e.deltaY * sensitivity / 300)
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * zoomFactor))
      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      setPanOffset((prev) => ({
        x: mouseX - (mouseX - prev.x) * (newScale / scaleRef.current),
        y: mouseY - (mouseY - prev.y) * (newScale / scaleRef.current),
      }))
      setScale(newScale)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const zoomToCenter = useCallback((next) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    const cx = (containerRef.current?.clientWidth  ?? window.innerWidth)  / 2
    const cy = (containerRef.current?.clientHeight ?? window.innerHeight) / 2
    setPanOffset((prev) => ({
      x: cx - (cx - prev.x) * (clamped / scaleRef.current),
      y: cy - (cy - prev.y) * (clamped / scaleRef.current),
    }))
    setScale(clamped)
  }, [])

  // ── Canvas pointer handlers ──
  const handlePointerDown = useCallback((e) => {
    if (isDraggingBubble.current) return
    setSelectedId(null)
    setDetailItemId(null)
    isPanning.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!isPanning.current) return
    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    lastPointer.current = { x: e.clientX, y: e.clientY }
    setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const handlePointerUp = useCallback(() => { isPanning.current = false }, [])

  // ── Input helpers ──
  const resetInput = useCallback(() => {
    setStep('idle')
    setMainKeyword('')
    setSubInput('')
    setSubKeywords([])
    setShowToast(false)
    inputRef.current?.blur()
  }, [])

  const doAdd = useCallback((deadlineIso) => {
    if (!mainKeyword.trim()) return
    const rect = containerRef.current?.getBoundingClientRect()
    const w = rect?.width  ?? window.innerWidth
    const h = rect?.height ?? window.innerHeight
    addItem({
      mainKeyword: mainKeyword.trim(),
      subKeywords: subKeywords.map((text, i) => ({ id: `sk-${Date.now()}-${i}`, text })),
      type,
      deadline: deadlineIso || null,
      position: {
        x: -panRef.current.x + w / 2 - 60 + (Math.random() - 0.5) * 120,
        y: -panRef.current.y + h / 2 - 80 + (Math.random() - 0.5) * 100,
      },
    })
    resetInput()
  }, [mainKeyword, subKeywords, type, addItem, resetInput])

  const handleDeadlineSelect = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(9, 0, 0, 0)
    doAdd(d.toISOString())
  }

  const handleArrow = () => {
    if (step === 'idle') { setStep('main'); return }
    if (step === 'main') {
      if (mainKeyword.trim()) setStep('sub')
      return
    }
    if (step === 'sub') {
      if (subInput.trim()) {
        setSubKeywords((p) => [...p, subInput.trim()])
        setSubInput('')
      } else {
        setShowToast(true)
      }
    }
  }

  const handleInputKey = (e) => {
    if (e.key === 'Escape') { resetInput(); return }
    if (e.key === 'Enter') {
      if (step === 'main' && mainKeyword.trim()) { setStep('sub'); return }
      if (step === 'sub') {
        if (subInput.trim()) {
          setSubKeywords((p) => [...p, subInput.trim()])
          setSubInput('')
        } else {
          setShowToast(true)
        }
      }
    }
  }

  const inputValue    = step === 'sub' ? subInput : step === 'main' ? mainKeyword : ''
  const setInputValue = (v) => { if (step === 'sub') setSubInput(v); else setMainKeyword(v) }
  const placeholder   =
    step === 'idle' ? 'Add a keyword...' :
    step === 'main' ? 'Type your main keyword...' :
                      'Add sub-keywords… (Enter twice to finish)'

  return (
    <div style={mStyles.page}>

      {/* ── Artboard ── */}
      <div
        ref={containerRef}
        style={mStyles.artboard}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <ZoomControls scale={scale} onZoom={zoomToCenter} />

        {/* Canvas world */}
        <div style={{ ...mStyles.world, transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})` }}>
          <ChunkBackground items={activeItems} />
          {activeItems.map((item) => (
            <BubbleNode
              key={item.id}
              item={item}
              scale={scale}
              isSelected={selectedId === item.id}
              onSelect={() => setSelectedId(item.id)}
              onDoubleClick={() => setDetailItemId((prev) => prev === item.id ? null : item.id)}
              onDragStart={() => { isDraggingBubble.current = true; isPanning.current = false }}
              onDragEnd={() => { setTimeout(() => { isDraggingBubble.current = false }, 50) }}
            />
          ))}
        </div>

        {/* Bubble detail popup — artboard coordinate space */}
        <AnimatePresence>
          {detailItem && (
            <BubbleDetailPopup
              key={detailItem.id}
              item={detailItem}
              panOffset={panOffset}
              scale={scale}
              onClose={() => setDetailItemId(null)}
            />
          )}
        </AnimatePresence>

        {/* Empty hint */}
        {activeItems.length === 0 && (
          <div style={mStyles.emptyHint}>
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 15, fontWeight: 500, textAlign: 'center', lineHeight: 1.7 }}>
              No reminders yet.<br />
              <span style={{ fontSize: 13, opacity: 0.7 }}>Type below to add your first keyword.</span>
            </p>
          </div>
        )}

        {/* Bottom input area */}
        <div style={mStyles.bottomArea} onPointerDown={(e) => e.stopPropagation()}>
          <AnimatePresence>
            {step === 'sub' && (
              <motion.div
                style={ipStyles.bubbleRow}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              >
                <span style={ipStyles.mainBubble}>{mainKeyword}</span>
                {subKeywords.map((kw, i) => (
                  <motion.span
                    key={i}
                    style={ipStyles.subBubble}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 18, stiffness: 280 }}
                  >
                    {kw}
                    <button
                      style={ipStyles.chipX}
                      onClick={() => setSubKeywords((p) => p.filter((_, j) => j !== i))}
                    >✕</button>
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showToast && (
              <DeadlineToast onSelect={handleDeadlineSelect} onSkip={() => doAdd(null)} />
            )}
          </AnimatePresence>

          <div style={mStyles.inputRow}>
            <div style={mStyles.inputPill} onClick={() => { if (step === 'idle') setStep('main') }}>
              <div style={ipStyles.typePill}>
                {['task', 'idea'].map((t) => (
                  <button
                    key={t}
                    style={{ ...ipStyles.typeBtn, ...(type === t ? ipStyles.typeBtnActive : {}) }}
                    onClick={(e) => { e.stopPropagation(); setType(t) }}
                  >
                    {t === 'task' ? 'Task' : 'Idea'}
                  </button>
                ))}
              </div>
              <input
                ref={inputRef}
                className="kw-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKey}
                onFocus={() => { if (step === 'idle') setStep('main') }}
                placeholder={placeholder}
                style={mStyles.inputField}
              />
            </div>
            <motion.button
              style={mStyles.ctaBtn}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.90 }}
              onClick={(e) => { e.stopPropagation(); handleArrow() }}
            >→</motion.button>
          </div>
        </div>
      </div>

      {/* ── Right column ── */}
      <div style={rStyles.rightCol}>
        <Dashboard items={items} />
        <SwipeableCardStack items={items} />
      </div>
    </div>
  )
}

// ─── Artboard styles ──────────────────────────────────────────────────────────
const mStyles = {
  page: {
    height: '100%',
    width: '100%',
    display: 'flex',
    padding: 12,
    gap: 12,
  },
  artboard: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.07)',
    cursor: 'grab',
  },
  world: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    transformOrigin: '0 0',
    willChange: 'transform',
  },
  emptyHint: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 480,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  inputPill: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 9999,
    display: 'flex',
    gap: 8,
    padding: '4px 4px 4px 8px',
    cursor: 'text',
    boxSizing: 'border-box',
  },
  inputField: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 14,
    fontWeight: 400,
    outline: 'none',
    minWidth: 0,
  },
  ctaBtn: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    border: 'none',
    background: '#C0FE37',
    color: '#000',
    cursor: 'pointer',
    fontSize: 20,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: "'Rethink Sans', sans-serif",
    boxShadow: '0 4px 20px rgba(192,254,55,0.30)',
  },
}

// ─── Input area styles ────────────────────────────────────────────────────────
const ipStyles = {
  toast: {
    background: 'rgba(10,20,60,0.88)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 24,
    boxShadow: '0 8px 36px rgba(0,0,0,0.40)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '18px 20px',
  },
  toastHeader: { display: 'flex', flexDirection: 'column', gap: 2 },
  toastQuestion: { color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' },
  toastSub: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 500 },
  dayGrid: { display: 'flex', justifyContent: 'space-between', gap: 4 },
  dayBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    width: 56,
    padding: '10px 0 8px',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'rgba(255,255,255,0.06)',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    flexShrink: 0,
  },
  dayBtnActive: {
    background: '#1E54BA',
    border: '1px solid rgba(100,140,255,0.4)',
    boxShadow: '0 4px 16px rgba(30,84,186,0.45)',
  },
  dayWeekday: {
    color: 'rgba(255,255,255,0.40)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  dayDate: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1,
  },
  dayBadge: {
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.40)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.02em',
    padding: '2px 6px',
  },
  dayBadgeActive: { background: 'rgba(255,255,255,0.18)', color: '#fff' },
  toastSkipBtn: {
    alignSelf: 'center',
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.28)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 8px',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    textDecorationColor: 'rgba(255,255,255,0.10)',
  },
  bubbleRow: { display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  mainBubble: {
    background: '#C0FE37',
    borderRadius: 9999,
    color: '#000',
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    padding: '6px 16px',
  },
  subBubble: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.85)',
    display: 'inline-flex',
    fontSize: 12,
    fontWeight: 600,
    gap: 5,
    padding: '5px 10px 5px 14px',
  },
  chipX: {
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer', fontSize: 9,
    fontFamily: "'Rethink Sans', sans-serif",
    lineHeight: 1, padding: '0 2px',
  },
  typePill: {
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 9999,
    display: 'flex',
    gap: 2,
    padding: 3,
    flexShrink: 0,
  },
  typeBtn: {
    background: 'transparent',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.40)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    transition: 'all 0.18s',
    whiteSpace: 'nowrap',
  },
  typeBtnActive: { background: '#C0FE37', color: '#000' },
}

// ─── Zoom controls styles ─────────────────────────────────────────────────────
const zcStyles = {
  wrap: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    userSelect: 'none',
  },
  label: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 9,
    fontWeight: 600,
    fontFamily: "'Rethink Sans', sans-serif",
    letterSpacing: '0.01em',
  },
  slider: {
    writingMode: 'vertical-lr',
    direction: 'rtl',
    width: 4,
    height: 72,
    cursor: 'pointer',
    accentColor: '#C0FE37',
    opacity: 0.6,
  },
}

// ─── Detail popup styles ──────────────────────────────────────────────────────
const dpStyles = {
  card: {
    background: 'rgba(8,16,48,0.88)',
    backdropFilter: 'blur(36px)',
    WebkitBackdropFilter: 'blur(36px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 18,
    boxShadow: '0 12px 40px rgba(0,0,0,0.50)',
    padding: '14px 16px 16px',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  urgentDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#C0FE37',
    boxShadow: '0 0 6px rgba(192,254,55,0.7)',
    flexShrink: 0,
  },
  keyword: {
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    height: 22,
    lineHeight: 1,
    width: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 10,
  },
  subChip: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.62)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 10px',
    display: 'inline-block',
  },
  metaRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaBadge: {
    border: '1px solid',
    borderRadius: 9999,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.03em',
    padding: '3px 9px',
    display: 'inline-block',
  },
  // Small downward triangle caret
  arrow: {
    position: 'absolute',
    bottom: -7,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '7px solid transparent',
    borderRight: '7px solid transparent',
    borderTop: '7px solid rgba(8,16,48,0.88)',
  },
}

// ─── Right column styles ──────────────────────────────────────────────────────
const rStyles = {
  rightCol: {
    width: 252,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    flexShrink: 0,
  },

  // Dashboard
  dashboard: {
    borderRadius: 20,
    background: 'rgba(200,208,240,0.10)',
    backdropFilter: 'blur(36px)',
    WebkitBackdropFilter: 'blur(36px)',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '16px 18px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dashTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  dashLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  dashBigNum: {
    color: '#C0FE37',
    fontFamily: "'Space Grotesk', 'Rethink Sans', sans-serif",
    fontSize: 44,
    fontWeight: 700,
    letterSpacing: '-0.04em',
    lineHeight: 1,
  },
  dashBigLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  dashRight: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
  },
  dashSmallStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 1,
  },
  dashSmallNum: {
    fontFamily: "'Space Grotesk', 'Rethink Sans', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  dashSmallLabel: {
    color: 'rgba(255,255,255,0.28)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  dotMatrix: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
    flexShrink: 0,
  },
  percentRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 5,
  },
  percentNum: {
    color: '#fff',
    fontFamily: "'Space Grotesk', 'Rethink Sans', sans-serif",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  percentLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontFamily: "'Rethink Sans', sans-serif",
  },

  // Swipeable card stack
  listPanel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
    background: 'rgba(50,65,120,0.16)',
    backdropFilter: 'blur(36px)',
    WebkitBackdropFilter: 'blur(36px)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  listHeader: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 16px 8px',
    flexShrink: 0,
  },
  filterPills: { display: 'flex', gap: 4 },
  filterBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.32)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 9px',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: 'rgba(192,254,55,0.10)',
    border: '1px solid rgba(192,254,55,0.25)',
    color: '#C0FE37',
  },
  stackProgress: {
    padding: '0 16px 6px',
    flexShrink: 0,
  },
  stackProgressText: {
    color: 'rgba(255,255,255,0.20)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
  },
  cardStackArea: {
    flex: 1,
    padding: '4px 14px 16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  stackCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 16,
    padding: '14px 14px 10px',
    userSelect: 'none',
    touchAction: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transformOrigin: 'center bottom',
  },
  stackCardInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  stackKw: {
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stackMeta: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  stackDl: {
    color: 'rgba(255,255,255,0.38)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
  },
  stackTypeBadge: {
    background: 'rgba(136,174,219,0.12)',
    border: '1px solid rgba(136,174,219,0.16)',
    borderRadius: 9999,
    color: '#88AEDB',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 6px',
  },
  stackSwipeHints: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  stackHint: {
    color: 'rgba(255,255,255,0.16)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.01em',
  },
  swipeBadge: {
    borderRadius: 9999,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.02em',
    padding: '3px 8px',
    position: 'absolute',
    top: 10,
  },
  swipeBadgeLeft: {
    background: 'rgba(255,180,50,0.15)',
    border: '1px solid rgba(255,180,50,0.25)',
    color: 'rgba(255,190,60,0.90)',
    left: 10,
  },
  swipeBadgeRight: {
    background: 'rgba(192,254,55,0.12)',
    border: '1px solid rgba(192,254,55,0.25)',
    color: '#C0FE37',
    right: 10,
  },
  stackEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: '100%',
    padding: '24px 0',
  },
  stackEmptyIcon: {
    color: '#C0FE37',
    fontSize: 22,
    fontWeight: 700,
  },
  stackEmptyText: {
    color: 'rgba(255,255,255,0.28)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
  },
  stackResetBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.32)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    marginTop: 4,
    padding: '5px 14px',
    transition: 'all 0.15s',
  },
}
