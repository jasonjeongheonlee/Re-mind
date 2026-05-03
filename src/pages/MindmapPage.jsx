import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo, getBubbleStyle, getCountdown } from '../utils/urgency'

function useCountdownTick(deadline) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!deadline) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [deadline])
  return getCountdown(deadline)
}

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
  // 0.53 is more accurate for Rethink Sans Bold (was 0.58 which overestimated → asymmetric padding)
  const textW = item.mainKeyword.length * fontSize * 0.53
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

// ─── ChunkBackground — single solid merged fill via SVG goo ──────────────────
function ChunkBackground({ items }) {
  const active = items.filter((i) => !i.completed && !i.deferred && i.chunkId)
  const chunks = {}
  active.forEach((item) => {
    if (!chunks[item.chunkId]) chunks[item.chunkId] = []
    chunks[item.chunkId].push(item)
  })
  const entries = Object.entries(chunks).filter(([, m]) => m.length >= 2)
  if (entries.length === 0) return null

  // Uniform offset from each bubble's border; rx follows the bubble's own pill radius
  const PAD = 14

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
    >
      <defs>
        {/*
          Single-pass goo: blur expands each pill, threshold snaps back to a sharp
          solid edge. Overlapping pills merge into ONE continuous filled shape —
          no holes, no double border.
        */}
        <filter id="chunk-goo" filterUnits="objectBoundingBox" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 28 -13"
          />
        </filter>
      </defs>

      {entries.map(([chunkId, members]) => (
        <g key={chunkId} filter="url(#chunk-goo)" opacity={0.20}>
          {members.map((item) => {
            const { level } = getUrgencyInfo(item.deadline)
            const bs = getBubbleStyle(level)
            const fontSize = Math.round(13 * bs.scale * 0.95)
            const padV = Math.round(8 * bs.scale)
            const padH = Math.round(16 * bs.scale)
            // Directly use position.x/y as left/top edge — left padding is always exact PAD
            const bW = item.mainKeyword.length * fontSize * 0.53 + 2 * padH
            const bH = fontSize + 2 * padV
            return (
              <rect
                key={item.id}
                x={item.position.x - PAD}
                y={item.position.y - PAD}
                width={bW + 2 * PAD}
                height={bH + 2 * PAD}
                rx={bH / 2 + PAD}
                fill="white"
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
    // Use edge-to-edge distance so bubbles only group when visually close
    const draggedWithPos = { ...item, position: newPos }
    const { w: dW, h: dH } = getBubbleSize(draggedWithPos)
    // Trigger grouping when edges are within SNAP_GAP (same distance that triggers snap)
    const EDGE_THRESHOLD = SNAP_GAP

    const active = allItems.filter((i) => !i.completed && !i.deferred && i.id !== id)
    let closest = null, closestEdgeDist = Infinity
    active.forEach((other) => {
      const { w: oW, h: oH } = getBubbleSize(other)
      const ox = other.position.x, oy = other.position.y
      const gapX = Math.max(0, Math.max(newPos.x, ox) - Math.min(newPos.x + dW, ox + oW))
      const gapY = Math.max(0, Math.max(newPos.y, oy) - Math.min(newPos.y + dH, oy + oH))
      const edgeDist = Math.sqrt(gapX * gapX + gapY * gapY)
      if (edgeDist < EDGE_THRESHOLD && edgeDist < closestEdgeDist) {
        closestEdgeDist = edgeDist
        closest = other
      }
    })
    if (closest) {
      const chunkId = closest.chunkId || `chunk-${closest.id}`
      updateChunk(closest.id, chunkId)
      updateChunk(id, chunkId)
    } else {
      updateChunk(id, null)
    }
  }, [allItems, updateChunk, item])

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
      if (moved) setDragDelta({ x: dx, y: dy })
    }

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved) {
        const dx = (ev.clientX - startX) / scale
        const dy = (ev.clientY - startY) / scale
        const newPos = { x: origX + dx, y: origY + dy }
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
          backdropFilter: isUrgent ? 'none' : 'blur(28px)',
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
  const { deleteItem } = useAppStore()
  const { level, label } = getUrgencyInfo(item.deadline)
  const isUrgent = ['overdue', 'critical', 'high'].includes(level)
  const { cx, cy, ry } = bubbleMetrics(item)
  const countdown = useCountdownTick(item.deadline)

  // Convert world center to artboard coordinates
  const screenX = cx * scale + panOffset.x
  const screenY = (cy - ry) * scale + panOffset.y - 14

  const deadlineStr = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null

  const handleDelete = () => {
    deleteItem(item.id)
    onClose()
  }

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -100%)',
        zIndex: 40,
        pointerEvents: 'auto',
        minWidth: 240,
        maxWidth: 320,
      }}
      initial={{ opacity: 0, y: 12, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.92 }}
      transition={{ type: 'spring', damping: 22, stiffness: 340 }}
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

        {/* Deadline info */}
        {item.deadline && (
          <div style={dpStyles.deadlineBlock}>
            <div style={dpStyles.deadlineRow}>
              <div style={dpStyles.deadlineStat}>
                <span style={dpStyles.deadlineStatLabel}>Remaining</span>
                <span style={{
                  ...dpStyles.deadlineStatVal,
                  color: isUrgent ? '#FF7070' : '#C0FE37',
                }}>
                  {countdown ?? 'Overdue'}
                </span>
              </div>
              <div style={dpStyles.deadlineDivider} />
              <div style={dpStyles.deadlineStat}>
                <span style={dpStyles.deadlineStatLabel}>Target</span>
                <span style={dpStyles.deadlineStatDate}>{deadlineStr}</span>
              </div>
            </div>
            <div style={{ ...dpStyles.urgencyPill, background: isUrgent ? 'rgba(255,100,100,0.12)' : 'rgba(192,254,55,0.08)', borderColor: isUrgent ? 'rgba(255,100,100,0.22)' : 'rgba(192,254,55,0.18)', color: isUrgent ? '#FF9090' : 'rgba(192,254,55,0.75)' }}>
              {label}
            </div>
          </div>
        )}

        {/* Meta row */}
        <div style={dpStyles.metaRow}>
          <span style={{ ...dpStyles.metaBadge, background: item.type === 'idea' ? 'rgba(136,174,219,0.18)' : 'rgba(255,255,255,0.10)', color: item.type === 'idea' ? '#88AEDB' : 'rgba(255,255,255,0.55)', borderColor: item.type === 'idea' ? 'rgba(136,174,219,0.25)' : 'rgba(255,255,255,0.12)' }}>
            {item.type === 'idea' ? 'Idea' : 'Task'}
          </span>
          {!item.deadline && (
            <span style={{ ...dpStyles.metaBadge, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.30)', borderColor: 'rgba(255,255,255,0.08)' }}>
              No deadline
            </span>
          )}
        </div>

        {/* Delete button */}
        <button style={dpStyles.deleteBtn} onClick={handleDelete}>
          Delete
        </button>

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

// ─── QueueItem ────────────────────────────────────────────────────────────────
function QueueItem({ item, onComplete, onRestore }) {
  const controls = useDragControls()
  const { level } = getUrgencyInfo(item.deadline)
  const isUrgent = ['overdue', 'critical', 'high'].includes(level)

  const deadline = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <Reorder.Item
      as="div"
      value={item}
      dragListener={false}
      dragControls={controls}
      style={{ ...rStyles.queueItem, opacity: item.completed ? 0.55 : 1 }}
      whileDrag={{
        scale: 1.04,
        boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
        background: 'rgba(255,255,255,0.11)',
        zIndex: 30,
        cursor: 'grabbing',
      }}
      transition={{ type: 'spring', damping: 26, stiffness: 360 }}
    >
      {/* Drag handle — grab to reorder */}
      <div
        style={{
          ...rStyles.queueHandle,
          cursor: item.completed ? 'default' : 'grab',
          opacity: item.completed ? 0.3 : 1,
        }}
        onPointerDown={(e) => {
          if (!item.completed) {
            e.preventDefault()
            controls.start(e)
          }
        }}
        title="Drag to reorder"
      >
        <span style={rStyles.queueHandleDots}>⠿</span>
      </div>

      {/* Content */}
      <div style={rStyles.queueContent}>
        {deadline && (
          <span style={{
            ...rStyles.queueDate,
            color: isUrgent ? '#FF9090' : 'rgba(255,255,255,0.32)',
          }}>
            {deadline}
          </span>
        )}
        <span style={{
          ...rStyles.queueKw,
          color: item.completed ? 'rgba(255,255,255,0.40)' : isUrgent ? '#C0FE37' : 'rgba(255,255,255,0.88)',
          textDecoration: item.completed ? 'line-through' : 'none',
        }}>
          {item.mainKeyword}
        </span>
      </div>

      {/* Circular checkbox */}
      <button
        style={{
          ...rStyles.checkCircle,
          background: item.completed ? '#C0FE37' : 'transparent',
          borderColor: item.completed ? '#C0FE37' : isUrgent ? 'rgba(192,254,55,0.45)' : 'rgba(255,255,255,0.22)',
        }}
        onClick={() => item.completed ? onRestore() : onComplete()}
        title={item.completed ? 'Restore' : 'Mark done'}
      >
        {item.completed && (
          <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>
        )}
      </button>
    </Reorder.Item>
  )
}

// ─── QueueCardList ────────────────────────────────────────────────────────────
function QueueCardList({ items }) {
  const { completeItem, updateItem, restoreItem } = useAppStore()
  const [filter, setFilter] = useState('active')

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

  const [localOrder, setLocalOrder] = useState(sorted)
  const localOrderRef = useRef(sorted)

  // Sync when filter changes or item count changes (not on deadline changes from drag)
  const syncKey = filter + '-' + sorted.length
  const prevSyncKey = useRef(syncKey)
  useEffect(() => {
    if (prevSyncKey.current !== syncKey) {
      prevSyncKey.current = syncKey
      setLocalOrder(sorted)
      localOrderRef.current = sorted
    }
  })

  const handleReorder = useCallback((newOrder) => {
    setLocalOrder(newOrder)
    localOrderRef.current = newOrder
  }, [])

  // On drag end: set deadline to midpoint between neighbors in the new order
  const handleDragEnd = useCallback((draggedItem) => {
    const order = localOrderRef.current
    const idx = order.findIndex((i) => i.id === draggedItem.id)
    if (idx < 0) return
    const prev = order[idx - 1]
    const next = order[idx + 1]

    let newDeadline = draggedItem.deadline

    if (prev?.deadline && next?.deadline) {
      newDeadline = new Date(
        (new Date(prev.deadline).getTime() + new Date(next.deadline).getTime()) / 2
      ).toISOString()
    } else if (prev?.deadline && !next?.deadline) {
      const d = new Date(prev.deadline)
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      newDeadline = d.toISOString()
    } else if (!prev?.deadline && next?.deadline) {
      const d = new Date(next.deadline)
      d.setTime(d.getTime() - 60 * 60 * 1000)
      newDeadline = d.toISOString()
    }

    if (newDeadline !== draggedItem.deadline) {
      updateItem(draggedItem.id, { deadline: newDeadline })
    }
  }, [updateItem])

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
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={rStyles.queueCountRow}>
        <span style={rStyles.queueCountText}>
          {localOrder.length} / {items.filter((i) => !i.deferred).length}
        </span>
      </div>

      {localOrder.length === 0 ? (
        <div style={{ ...rStyles.queueList, justifyContent: 'center', alignItems: 'center' }}>
          <span style={rStyles.queueEmptyText}>
            {filter === 'done' ? 'Nothing completed yet.' : 'All clear!'}
          </span>
        </div>
      ) : (
        <Reorder.Group
          as="div"
          axis="y"
          values={localOrder}
          onReorder={handleReorder}
          style={rStyles.queueList}
        >
          {localOrder.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              onComplete={() => completeItem(item.id)}
              onRestore={() => restoreItem(item.id)}
              onDragEnd={() => handleDragEnd(item)}
            />
          ))}
        </Reorder.Group>
      )}
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
        <QueueCardList items={items} />
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
    background: 'rgba(6,12,42,0.92)',
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
    border: '1px solid rgba(255,255,255,0.11)',
    borderRadius: 20,
    boxShadow: '0 16px 48px rgba(0,0,0,0.60)',
    padding: '16px 18px 18px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
    boxShadow: '0 0 8px rgba(192,254,55,0.8)',
    flexShrink: 0,
  },
  keyword: {
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 14,
    fontWeight: 500,
    height: 24,
    justifyContent: 'center',
    lineHeight: 1,
    width: 24,
    flexShrink: 0,
  },
  subRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
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
  deadlineBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '12px 14px',
  },
  deadlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  deadlineStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
  },
  deadlineStatLabel: {
    color: 'rgba(255,255,255,0.30)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  deadlineStatVal: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  deadlineStatDate: {
    color: 'rgba(255,255,255,0.80)',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1,
  },
  deadlineDivider: {
    width: 1,
    height: 32,
    background: 'rgba(255,255,255,0.10)',
    flexShrink: 0,
  },
  urgencyPill: {
    alignSelf: 'flex-start',
    border: '1px solid',
    borderRadius: 9999,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: '3px 10px',
    textTransform: 'uppercase',
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
  deleteBtn: {
    background: 'rgba(255,70,70,0.08)',
    border: '1px solid rgba(255,70,70,0.18)',
    borderRadius: 9999,
    color: 'rgba(255,100,100,0.75)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
    fontWeight: 700,
    padding: '6px 16px',
    alignSelf: 'center',
    transition: 'all 0.18s',
    letterSpacing: '0.02em',
  },
  arrow: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '8px solid transparent',
    borderRight: '8px solid transparent',
    borderTop: '8px solid rgba(6,12,42,0.92)',
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

  // Queue list
  listPanel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
    background: 'rgba(30,45,100,0.22)',
    backdropFilter: 'blur(36px)',
    WebkitBackdropFilter: 'blur(36px)',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  listHeader: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '14px 14px 6px',
    flexShrink: 0,
  },
  filterPills: { display: 'flex', gap: 3 },
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
    border: '1px solid rgba(192,254,55,0.28)',
    color: '#C0FE37',
  },
  queueCountRow: {
    padding: '0 14px 6px',
    flexShrink: 0,
  },
  queueCountText: {
    color: 'rgba(255,255,255,0.18)',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  queueList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  queueItem: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    display: 'flex',
    gap: 8,
    padding: '9px 10px 9px 6px',
    position: 'relative',
    userSelect: 'none',
    transition: 'background 0.15s',
  },
  queueHandle: {
    alignItems: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.22)',
    cursor: 'grab',
    display: 'flex',
    flexShrink: 0,
    fontSize: 14,
    height: 28,
    justifyContent: 'center',
    padding: 0,
    transition: 'color 0.15s',
    width: 22,
  },
  queueHandleDots: {
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: '-1px',
  },
  queueContent: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  queueDate: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.01em',
  },
  queueKw: {
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  checkCircle: {
    alignItems: 'center',
    border: '2px solid',
    borderRadius: 9999,
    cursor: 'pointer',
    display: 'flex',
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    transition: 'all 0.18s',
    width: 22,
    background: 'transparent',
  },
  queueEmpty: {
    alignItems: 'center',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    padding: '28px 0',
  },
  queueEmptyText: {
    color: 'rgba(255,255,255,0.25)',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
  },
}
