import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo, getBubbleStyle } from '../utils/urgency'

const MIN_SCALE = 0.25
const MAX_SCALE = 4.0

// ─── ZoomControls ─────────────────────────────────────────────────────────────
function ZoomControls({ scale, onZoom }) {
  const pct = Math.round(scale * 100)
  return (
    <div style={zcStyles.panel} onPointerDown={(e) => e.stopPropagation()}>
      <button style={zcStyles.btn} onClick={() => onZoom(scale * 1.25)}>+</button>
      <input
        type="range"
        min={Math.round(MIN_SCALE * 100)}
        max={Math.round(MAX_SCALE * 100)}
        step={5}
        value={pct}
        onChange={(e) => onZoom(Number(e.target.value) / 100)}
        style={zcStyles.slider}
      />
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
          border: isUrgent ? 'none' : '1px solid rgba(255,255,255,0.38)',
          boxShadow: isDraggingNow
            ? `0 20px 60px rgba(0,0,0,0.28), ${isUrgent ? '0 0 28px rgba(192,254,55,0.55)' : '0 0 0 1px rgba(255,255,255,0.3)'}`
            : isUrgent
            ? '0 0 28px rgba(192,254,55,0.55)'
            : item.chunkId
            ? '0 0 0 2px rgba(255,255,255,0.4), 0 4px 20px rgba(0,0,0,0.15)'
            : '0 2px 12px rgba(0,0,0,0.12)',
          outline: isSelected ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
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

// ─── Deadline toast ───────────────────────────────────────────────────────────
function DeadlineToast({ onSelect, onSkip }) {
  const QUICK = [
    { label: 'Today',     days: 0 },
    { label: 'Tomorrow',  days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'Next week', days: 7 },
  ]
  return (
    <motion.div
      style={ipStyles.toast}
      initial={{ y: 16, opacity: 0, scale: 0.97 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 10, opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p style={ipStyles.toastQuestion}>When should we remind you?</p>
      <div style={ipStyles.toastOptions}>
        {QUICK.map((opt) => (
          <motion.button
            key={opt.label}
            style={ipStyles.toastBtn}
            whileHover={{ scale: 1.06, background: 'rgba(192,254,55,0.18)' }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(opt.days)}
          >
            {opt.label}
          </motion.button>
        ))}
        <motion.button
          style={{ ...ipStyles.toastBtn, ...ipStyles.toastSkipBtn }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onSkip}
        >
          Skip
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Chunk backgrounds ────────────────────────────────────────────────────────
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
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.12)',
            pointerEvents: 'none', zIndex: 0,
          }} />
        )
      })}
    </>
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

  // ── Always-visible input state ──
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

  // ── Zoom toward viewport center (for buttons / slider) ──
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
    addItem({
      mainKeyword: mainKeyword.trim(),
      subKeywords: subKeywords.map((text, i) => ({ id: `sk-${Date.now()}-${i}`, text })),
      type,
      deadline: deadlineIso || null,
      position: {
        x: -panRef.current.x + window.innerWidth / 2 - 60 + (Math.random() - 0.5) * 120,
        y: -panRef.current.y + window.innerHeight / 2 - 80 + (Math.random() - 0.5) * 100,
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
    <div
      ref={containerRef}
      style={mStyles.container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* ── Canvas world ── */}
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

      {/* ── Zoom controls ── */}
      <ZoomControls scale={scale} onZoom={zoomToCenter} />

      {/* ── Empty hint ── */}
      {activeItems.length === 0 && (
        <div style={mStyles.emptyHint}>
          <p style={{ color: 'rgba(30,84,186,0.6)', fontSize: 16, fontWeight: 500, textAlign: 'center' }}>
            No reminders yet.<br />
            <span style={{ fontSize: 13, opacity: 0.7 }}>Tap the field below to add your first keyword.</span>
          </p>
        </div>
      )}

      {/* ── Bottom input area (always visible) ── */}
      <div
        style={mStyles.bottomArea}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Bubble preview row */}
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
            <DeadlineToast
              onSelect={handleDeadlineSelect}
              onSkip={() => doAdd(null)}
            />
          )}
        </AnimatePresence>

        {/* ── Always-visible pill ── */}
        <div style={mStyles.inputPill} onClick={() => { if (step === 'idle') { setStep('main') } }}>
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
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKey}
            onFocus={() => { if (step === 'idle') setStep('main') }}
            placeholder={placeholder}
            style={mStyles.inputField}
          />

          {/* → CTA */}
          <motion.button
            style={mStyles.arrowBtn}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={(e) => { e.stopPropagation(); handleArrow() }}
          >→</motion.button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const mStyles = {
  container: {
    height: '100%',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
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
    bottom: 32,
    left: '50%',
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 520,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  inputPill: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: 9999,
    display: 'flex',
    gap: 8,
    padding: '4px 4px 4px 8px',
    boxShadow: '0 8px 32px rgba(30,84,186,0.12)',
    cursor: 'text',
    flexShrink: 0,
  },
  inputField: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(20,30,90,0.85)',
    flex: 1,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 15,
    fontWeight: 400,
    outline: 'none',
    padding: '4px 0',
    minWidth: 0,
  },
  arrowBtn: {
    alignItems: 'center',
    background: '#1E54BA',
    border: 'none',
    borderRadius: 9999,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 18,
    fontWeight: 600,
    height: 36,
    justifyContent: 'center',
    width: 36,
    flexShrink: 0,
  },
}

const ipStyles = {
  toast: {
    background: 'rgba(10,20,60,0.82)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 20,
    boxShadow: '0 8px 36px rgba(0,0,0,0.30)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '18px 20px',
  },
  toastQuestion: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  toastOptions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  toastBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 9999,
    color: '#fff',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 16px',
    transition: 'background 0.18s',
  },
  toastSkipBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.4)',
  },

  bubbleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
    alignItems: 'center',
  },
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
    background: 'rgba(255,255,255,0.28)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.42)',
    borderRadius: 9999,
    color: '#fff',
    display: 'inline-flex',
    fontSize: 12,
    fontWeight: 600,
    gap: 5,
    padding: '5px 10px 5px 14px',
  },
  chipX: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.55)',
    cursor: 'pointer',
    fontSize: 9,
    fontFamily: "'Rethink Sans', sans-serif",
    lineHeight: 1,
    padding: '0 2px',
  },

  typePill: {
    background: 'rgba(0,0,0,0.10)',
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
    color: 'rgba(20,30,90,0.40)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    transition: 'all 0.18s',
    whiteSpace: 'nowrap',
  },
  typeBtnActive: {
    background: '#C0FE37',
    color: '#000',
  },
}

// ─── Zoom controls styles ─────────────────────────────────────────────────────
const zcStyles = {
  panel: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '10px 8px',
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: 20,
    boxShadow: '0 8px 32px rgba(30,84,186,0.12)',
    userSelect: 'none',
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    border: 'none',
    background: '#1E54BA',
    color: '#fff',
    fontSize: 16,
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
    accentColor: '#1E54BA',
  },
  label: {
    color: 'rgba(20,30,90,0.70)',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'Rethink Sans', sans-serif",
    letterSpacing: '-0.01em',
    textAlign: 'center',
  },
}
