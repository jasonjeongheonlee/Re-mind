import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo, getBubbleStyle } from '../utils/urgency'

// ─── BubbleNode ───────────────────────────────────────────────────────────────
// Pure pointer-event drag — bypasses framer-motion drag to avoid stopPropagation conflicts
function BubbleNode({ item, isDraggingAny, onDragStart, onDragEnd, isSelected, onSelect }) {
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
    e.stopPropagation()   // prevent canvas pan
    onSelect()
    onDragStart()

    const startX = e.clientX
    const startY = e.clientY
    const origX  = item.position.x
    const origY  = item.position.y
    let moved = false

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
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
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
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
  }, [item.position.x, item.position.y, item.id, onSelect, onDragStart, onDragEnd, updatePosition, checkProximity])

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
    { label: '오늘', days: 0 },
    { label: '내일', days: 1 },
    { label: '3일 뒤', days: 3 },
    { label: '일주일 뒤', days: 7 },
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
      <p style={ipStyles.toastQuestion}>언제 리마인드 해드릴까요?</p>
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
          건너뛰기
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

  // ── Bubble selection ──
  const [selectedId, setSelectedId] = useState(null)

  // ── Always-visible input state ──
  const [step, setStep] = useState('idle')    // 'idle' | 'main' | 'sub'
  const [mainKeyword, setMainKeyword] = useState('')
  const [subInput, setSubInput] = useState('')
  const [subKeywords, setSubKeywords] = useState([])
  const [type, setType] = useState('task')
  const [showToast, setShowToast] = useState(false)
  const inputRef = useRef(null)

  // Focus input whenever step transitions away from idle
  useEffect(() => {
    if (step !== 'idle') inputRef.current?.focus()
  }, [step])

  // ── Canvas pointer handlers ──
  const handlePointerDown = useCallback((e) => {
    if (isDraggingBubble.current) return
    setSelectedId(null)   // deselect on canvas tap
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

  // Which value the input is bound to
  const inputValue = step === 'sub' ? subInput : step === 'main' ? mainKeyword : ''
  const setInputValue = (v) => {
    if (step === 'sub') setSubInput(v)
    else setMainKeyword(v)
  }
  const placeholder =
    step === 'idle' ? 'Add a keyword...' :
    step === 'main' ? '메인 키워드 입력...' :
                      '세부 키워드... (Enter ×2 완료)'

  return (
    <div
      style={mStyles.container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* ── Canvas world ── */}
      <div style={{ ...mStyles.world, transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}>
        <ChunkBackground items={activeItems} />
        {activeItems.map((item) => (
          <BubbleNode
            key={item.id}
            item={item}
            isDraggingAny={isDraggingBubble}
            isSelected={selectedId === item.id}
            onSelect={() => setSelectedId(item.id)}
            onDragStart={() => { isDraggingBubble.current = true; isPanning.current = false }}
            onDragEnd={() => { setTimeout(() => { isDraggingBubble.current = false }, 50) }}
          />
        ))}
      </div>

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
        {/* Bubble preview row (floats above pill) */}
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
                {t === 'task' ? '📋 Task' : '💡 Idea'}
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
    width: 520,           // Fixed — not responsive
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  /* Always-visible pill — shape never changes */
  inputPill: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: 9999,
    display: 'flex',
    gap: 8,
    padding: '10px 10px 10px 12px',
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
  /* Deadline toast */
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

  /* Bubble preview row */
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

  /* Type toggle */
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
