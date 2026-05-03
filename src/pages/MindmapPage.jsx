import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo, getBubbleStyle } from '../utils/urgency'

const MIN_SCALE = 0.25
const MAX_SCALE = 4.0
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const URGENCY_ORDER = { overdue: 0, critical: 1, high: 2, medium: 3, low: 4, none: 5 }

// ─── ZoomControls ─────────────────────────────────────────────────────────────
function ZoomControls({ scale, onZoom }) {
  const pct = Math.round(scale * 100)
  return (
    <div style={zcStyles.panel} onPointerDown={(e) => e.stopPropagation()}>
      <input
        type="range"
        min={Math.round(MIN_SCALE * 100)}
        max={Math.round(MAX_SCALE * 100)}
        step={5}
        value={pct}
        onChange={(e) => onZoom(Number(e.target.value) / 100)}
        style={zcStyles.slider}
      />
      <button style={zcStyles.btn} onClick={() => onZoom(scale * 1.25)}>+</button>
      <span style={zcStyles.label}>{pct}%</span>
      <button style={zcStyles.btn} onClick={() => onZoom(scale / 1.25)}>−</button>
    </div>
  )
}

// ─── BubbleNode ───────────────────────────────────────────────────────────────
function BubbleNode({ item, isDraggingAny, onDragStart, onDragEnd, isSelected, onSelect, scale }) {
  const { updatePosition, updateChunk } = useAppStore()
  const allItems = useAppStore((s) => s.items)
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)

  const { level } = getUrgencyInfo(item.deadline)
  const bStyle = getBubbleStyle(level)
  const isUrgent = level === 'critical' || level === 'overdue' || level === 'high'
  const fontSize = Math.round(13 * bStyle.scale * 0.95)
  const padV = Math.round(8 * bStyle.scale)
  const padH = Math.round(16 * bStyle.scale)

  const checkProximity = useCallback((id, newPos) => {
    const THRESHOLD = 110
    const active = allItems.filter((i) => !i.completed && !i.deferred && i.id !== id)
    let closest = null, closestDist = Infinity
    active.forEach((other) => {
      const dx = newPos.x - other.position.x
      const dy = newPos.y - other.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < THRESHOLD && dist < closestDist) { closestDist = dist; closest = other }
    })
    if (closest) {
      const chunkId = closest.chunkId || `chunk-${closest.id}`
      updateChunk(closest.id, chunkId)
      updateChunk(id, chunkId)
    } else {
      updateChunk(id, null)
    }
  }, [allItems, updateChunk])

  const handlePointerDown = useCallback((e) => {
    e.stopPropagation()
    onSelect()
    onDragStart()

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
  }, [item.position.x, item.position.y, item.id, scale, onSelect, onDragStart, onDragEnd, updatePosition, checkProximity])

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
          border: isUrgent ? 'none' : '1px solid rgba(255,255,255,0.22)',
          boxShadow: isDraggingNow
            ? `0 20px 60px rgba(0,0,0,0.38), ${isUrgent ? '0 0 28px rgba(192,254,55,0.55)' : '0 0 0 1px rgba(255,255,255,0.25)'}`
            : isUrgent
            ? '0 0 28px rgba(192,254,55,0.55)'
            : item.chunkId
            ? '0 0 0 2px rgba(255,255,255,0.25), 0 4px 20px rgba(0,0,0,0.25)'
            : '0 2px 12px rgba(0,0,0,0.22)',
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

// ─── ChunkBackground ──────────────────────────────────────────────────────────
function ChunkBackground({ items }) {
  const active = items.filter((i) => !i.completed && !i.deferred && i.chunkId)
  const chunks = {}
  active.forEach((item) => {
    if (!chunks[item.chunkId]) chunks[item.chunkId] = []
    chunks[item.chunkId].push(item)
  })
  return (
    <>
      {Object.entries(chunks).map(([chunkId, members]) => {
        if (members.length < 2) return null
        const xs = members.map((m) => m.position.x)
        const ys = members.map((m) => m.position.y)
        const pad = 60
        const x = Math.min(...xs) - pad
        const y = Math.min(...ys) - pad
        const w = Math.max(...xs) - Math.min(...xs) + pad * 2 + 120
        const h = Math.max(...ys) - Math.min(...ys) + pad * 2 + 50
        return (
          <div key={chunkId} style={{
            position: 'absolute', left: x, top: y, width: w, height: h,
            borderRadius: 36,
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.08)',
            pointerEvents: 'none', zIndex: 0,
          }} />
        )
      })}
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ items }) {
  const active   = items.filter((i) => !i.completed && !i.deferred)
  const overdue  = active.filter((i) => ['overdue', 'critical'].includes(getUrgencyInfo(i.deadline).level))
  const completed = items.filter((i) => i.completed)
  const deferred  = items.filter((i) => i.deferred && !i.completed)

  const stats = [
    { label: 'Active',   value: active.length,     color: '#C0FE37' },
    { label: 'Overdue',  value: overdue.length,    color: '#FF7070' },
    { label: 'Deferred', value: deferred.length,   color: 'rgba(255,200,80,0.9)' },
    { label: 'Done',     value: completed.length,  color: 'rgba(255,255,255,0.40)' },
  ]

  return (
    <div style={rStyles.dashboard}>
      <p style={rStyles.panelTitle}>Overview</p>
      <div style={rStyles.statsGrid}>
        {stats.map((s) => (
          <div key={s.label} style={rStyles.statCell}>
            <span style={{ ...rStyles.statNum, color: s.color }}>{s.value}</span>
            <span style={rStyles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── KeywordRow ───────────────────────────────────────────────────────────────
function KeywordRow({ item, onComplete, onDefer, onDelete, onRestore }) {
  const { level } = getUrgencyInfo(item.deadline)
  const isArchived = item.completed || item.deferred
  const dotColors = {
    overdue: '#C0FE37', critical: '#C0FE37', high: '#C0FE37',
    medium: 'rgba(255,255,255,0.60)', low: 'rgba(255,255,255,0.30)', none: 'rgba(255,255,255,0.18)',
  }

  return (
    <div style={rStyles.kwRow}>
      <div style={{ ...rStyles.urgencyDot, background: dotColors[level] || 'rgba(255,255,255,0.18)' }} />
      <div style={rStyles.kwContent}>
        <span style={{ ...rStyles.kwName, ...(isArchived ? rStyles.kwArchived : {}) }}>
          {item.mainKeyword}
        </span>
        <span style={rStyles.kwMeta}>
          {isArchived
            ? (item.completed ? 'Done' : 'Deferred')
            : item.deadline
            ? new Date(item.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : item.type === 'idea' ? 'Idea' : ''
          }
        </span>
      </div>
      <div style={rStyles.kwActions}>
        {isArchived ? (
          <>
            <button style={rStyles.kwBtn} onClick={onRestore} title="Restore">↺</button>
            <button style={{ ...rStyles.kwBtn, ...rStyles.kwBtnDel }} onClick={onDelete} title="Delete">×</button>
          </>
        ) : (
          <>
            <button style={rStyles.kwBtn} onClick={onComplete} title="Mark done">✓</button>
            <button style={rStyles.kwBtn} onClick={onDefer} title="Defer 1 day">›</button>
            <button style={{ ...rStyles.kwBtn, ...rStyles.kwBtnDel }} onClick={onDelete} title="Delete">×</button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── KeywordsList ─────────────────────────────────────────────────────────────
function KeywordsList({ items }) {
  const [sort, setSort]     = useState('urgency')
  const [filter, setFilter] = useState('all')
  const { completeItem, deferItem, deleteItem, restoreItem } = useAppStore()

  const visible = useMemo(() => {
    let list = [...items]
    if (filter === 'active')   list = list.filter((i) => !i.completed && !i.deferred)
    else if (filter === 'done')     list = list.filter((i) => i.completed)
    else if (filter === 'deferred') list = list.filter((i) => i.deferred && !i.completed)

    if (sort === 'urgency') {
      list.sort((a, b) => {
        const ao = URGENCY_ORDER[getUrgencyInfo(a.deadline).level] ?? 5
        const bo = URGENCY_ORDER[getUrgencyInfo(b.deadline).level] ?? 5
        return ao - bo
      })
    } else if (sort === 'deadline') {
      list.sort((a, b) => {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline) - new Date(b.deadline)
      })
    } else if (sort === 'name') {
      list.sort((a, b) => a.mainKeyword.localeCompare(b.mainKeyword))
    } else if (sort === 'type') {
      list.sort((a, b) => a.type.localeCompare(b.type))
    }
    return list
  }, [items, sort, filter])

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'done', label: 'Done' },
    { id: 'deferred', label: 'Deferred' },
  ]

  const SORTS = [
    { id: 'urgency',  label: '!' },
    { id: 'deadline', label: 'Date' },
    { id: 'name',     label: 'A–Z' },
    { id: 'type',     label: 'Type' },
  ]

  return (
    <div style={rStyles.listPanel}>
      <div style={rStyles.listHeader}>
        <span style={rStyles.panelTitle}>Keywords</span>
        <div style={rStyles.sortBtns}>
          {SORTS.map((s) => (
            <button
              key={s.id}
              style={{ ...rStyles.sortBtn, ...(sort === s.id ? rStyles.sortBtnActive : {}) }}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={rStyles.filterRow}>
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

      <div style={rStyles.listScroll}>
        {visible.length === 0 ? (
          <div style={rStyles.listEmpty}>No items</div>
        ) : (
          visible.map((item) => (
            <KeywordRow
              key={item.id}
              item={item}
              onComplete={() => completeItem(item.id)}
              onDefer={() => deferItem(item.id)}
              onDelete={() => deleteItem(item.id)}
              onRestore={() => restoreItem(item.id)}
            />
          ))
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

  // ── Bubble selection ──
  const [selectedId, setSelectedId] = useState(null)

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

  // ── Wheel zoom (passive:false required for preventDefault) ──
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

  // ── Zoom toward viewport center (buttons / slider) ──
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

  const inputValue = step === 'sub' ? subInput : step === 'main' ? mainKeyword : ''
  const setInputValue = (v) => {
    if (step === 'sub') setSubInput(v)
    else setMainKeyword(v)
  }
  const placeholder =
    step === 'idle' ? 'Add a keyword...' :
    step === 'main' ? 'Type your main keyword...' :
                      'Add sub-keywords... (Enter twice to finish)'

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
        {/* Zoom controls — top-left */}
        <ZoomControls scale={scale} onZoom={zoomToCenter} />

        {/* Canvas world */}
        <div style={{ ...mStyles.world, transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})` }}>
          <ChunkBackground items={activeItems} />
          {activeItems.map((item) => (
            <BubbleNode
              key={item.id}
              item={item}
              scale={scale}
              isDraggingAny={isDraggingBubble}
              isSelected={selectedId === item.id}
              onSelect={() => setSelectedId(item.id)}
              onDragStart={() => { isDraggingBubble.current = true; isPanning.current = false }}
              onDragEnd={() => { setTimeout(() => { isDraggingBubble.current = false }, 50) }}
            />
          ))}
        </div>

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

          {/* Sub-keyword chip preview */}
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

          {/* Deadline toast */}
          <AnimatePresence>
            {showToast && (
              <DeadlineToast onSelect={handleDeadlineSelect} onSkip={() => doAdd(null)} />
            )}
          </AnimatePresence>

          {/* Input row: pill + standalone CTA */}
          <div style={mStyles.inputRow}>
            <div style={mStyles.inputPill} onClick={() => { if (step === 'idle') setStep('main') }}>
              {/* Type toggle */}
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
              {/* Text input */}
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

            {/* Standalone lime CTA */}
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
        <KeywordsList items={items} />
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
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.09)',
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
    left: 20,
    right: 20,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  inputPill: {
    flex: 1,
    alignItems: 'center',
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 9999,
    display: 'flex',
    gap: 8,
    padding: '4px 4px 4px 8px',
    cursor: 'text',
  },
  inputField: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 15,
    fontWeight: 400,
    outline: 'none',
    padding: '6px 0',
    minWidth: 0,
  },
  ctaBtn: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    border: 'none',
    background: '#C0FE37',
    color: '#000',
    cursor: 'pointer',
    fontSize: 22,
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
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    border: '1px solid rgba(255,255,255,0.18)',
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
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    flexShrink: 0,
  },
  dayBtnActive: {
    background: '#1E54BA',
    border: '1px solid rgba(100,140,255,0.5)',
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
    background: 'rgba(255,255,255,0.08)',
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
    textDecorationColor: 'rgba(255,255,255,0.12)',
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
    background: 'rgba(255,255,255,0.14)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.25)',
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
    background: 'rgba(255,255,255,0.10)',
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
  panel: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 8px',
    background: 'rgba(255,255,255,0.09)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 16,
    userSelect: 'none',
  },
  btn: {
    width: 26,
    height: 26,
    borderRadius: 9999,
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.80)',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Rethink Sans', sans-serif",
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
  },
  slider: {
    writingMode: 'vertical-lr',
    direction: 'rtl',
    width: 4,
    height: 80,
    cursor: 'pointer',
    accentColor: '#C0FE37',
  },
  label: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'Rethink Sans', sans-serif",
    letterSpacing: '-0.01em',
    textAlign: 'center',
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
    background: 'rgba(200,208,240,0.14)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.16)',
    padding: '18px 20px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  panelTitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  statCell: { display: 'flex', flexDirection: 'column', gap: 3 },
  statNum: {
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1,
    fontFamily: "'Rethink Sans', sans-serif",
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },

  // Keywords list
  listPanel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
    background: 'rgba(65,80,138,0.20)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
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
  sortBtns: { display: 'flex', gap: 2 },
  sortBtn: {
    background: 'transparent',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.30)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 7px',
    transition: 'all 0.15s',
  },
  sortBtnActive: {
    background: 'rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.80)',
  },
  filterRow: {
    display: 'flex',
    gap: 4,
    padding: '0 16px 10px',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.35)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 9px',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: 'rgba(192,254,55,0.12)',
    border: '1px solid rgba(192,254,55,0.30)',
    color: '#C0FE37',
  },
  listScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 10px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  listEmpty: {
    color: 'rgba(255,255,255,0.22)',
    fontSize: 12,
    padding: '24px 4px',
    textAlign: 'center',
    fontFamily: "'Rethink Sans', sans-serif",
  },
  kwRow: {
    alignItems: 'center',
    borderRadius: 10,
    display: 'flex',
    gap: 8,
    padding: '7px 8px',
    transition: 'background 0.12s',
  },
  urgencyDot: { width: 6, height: 6, borderRadius: 9999, flexShrink: 0 },
  kwContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  kwName: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: "'Rethink Sans', sans-serif",
  },
  kwArchived: {
    opacity: 0.38,
    textDecoration: 'line-through',
    textDecorationColor: 'rgba(255,255,255,0.25)',
  },
  kwMeta: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 10,
    fontWeight: 500,
    fontFamily: "'Rethink Sans', sans-serif",
  },
  kwActions: { display: 'flex', gap: 2, flexShrink: 0 },
  kwBtn: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.07)',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.50)',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 12,
    fontWeight: 700,
    height: 24,
    justifyContent: 'center',
    width: 24,
    transition: 'all 0.12s',
    lineHeight: 1,
  },
  kwBtnDel: { color: 'rgba(255,100,100,0.55)' },
}
