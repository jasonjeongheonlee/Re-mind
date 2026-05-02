import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, useMotionValue, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { getUrgencyInfo, getBubbleStyle, sortByUrgency } from '../utils/urgency'
import AddModal from '../components/AddModal'

// ─── Long-press hook ──────────────────────────────────────────────────────────
function useLongPress(cb, ms = 500) {
  const timer = useRef(null)
  const start = useCallback((e) => {
    e.stopPropagation()
    timer.current = setTimeout(cb, ms)
  }, [cb, ms])
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])
  return { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel }
}

// ─── BubbleNode ───────────────────────────────────────────────────────────────
function BubbleNode({ item, canvasRef, panOffset, isDraggingAny, onDragStart, onDragEnd }) {
  const { updatePosition, updateChunk } = useAppStore()
  const allItems = useAppStore((s) => s.items)
  const [showSubs, setShowSubs] = useState(false)
  const bx = useMotionValue(0)
  const by = useMotionValue(0)
  const dragStartPos = useRef(null)

  const { level } = getUrgencyInfo(item.deadline)
  const bStyle = getBubbleStyle(level)
  const isUrgent = level === 'critical' || level === 'overdue' || level === 'high'
  const BASE_FONT = 13
  const fontSize = Math.round(BASE_FONT * bStyle.scale * 0.95)
  const padV = Math.round(8 * bStyle.scale)
  const padH = Math.round(16 * bStyle.scale)

  const longPress = useLongPress(() => setShowSubs((s) => !s))

  const checkProximity = useCallback((id, newPos) => {
    const THRESHOLD = 110
    const active = allItems.filter((i) => !i.completed && !i.deferred && i.id !== id)
    let closest = null
    let closestDist = Infinity
    active.forEach((other) => {
      const dx = newPos.x - other.position.x
      const dy = newPos.y - other.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < THRESHOLD && dist < closestDist) {
        closestDist = dist
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
  }, [allItems, updateChunk])

  return (
    <div style={{ position: 'absolute', left: item.position.x, top: item.position.y, zIndex: showSubs ? 10 : 1 }}>
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0}
        style={{ x: bx, y: by, touchAction: 'none' }}
        onPointerDownCapture={(e) => {
          e.stopPropagation()
          onDragStart()
          dragStartPos.current = { x: item.position.x, y: item.position.y }
        }}
        onDragEnd={(_, info) => {
          const newPos = {
            x: item.position.x + info.offset.x,
            y: item.position.y + info.offset.y,
          }
          updatePosition(item.id, newPos)
          checkProximity(item.id, newPos)
          bx.set(0)
          by.set(0)
          onDragEnd()
        }}
        whileTap={{ scale: 1.05 }}
      >
        <motion.div
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
            boxShadow: isUrgent
              ? '0 0 28px rgba(192,254,55,0.55)'
              : item.chunkId
              ? '0 0 0 2px rgba(255,255,255,0.4), 0 4px 20px rgba(0,0,0,0.15)'
              : '0 2px 12px rgba(0,0,0,0.12)',
            cursor: 'grab',
            position: 'relative',
          }}
          {...longPress}
          onClick={(e) => { if (!isDraggingAny.current) e.stopPropagation() }}
        >
          {item.mainKeyword}
        </motion.div>
      </motion.div>

      {/* Sub-keywords fan */}
      <AnimatePresence>
        {showSubs && item.subKeywords.map((sk, i) => (
          <motion.span
            key={sk.id}
            style={{
              background: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.38)',
              borderRadius: 9999,
              color: 'rgba(255,255,255,0.85)',
              display: 'inline-block',
              fontSize: 10,
              fontWeight: 500,
              padding: '4px 10px',
              position: 'absolute',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
            animate={{
              opacity: 0.85,
              x: Math.cos(((i / item.subKeywords.length) * 2 * Math.PI) - Math.PI / 2) * (60 + i * 8),
              y: Math.sin(((i / item.subKeywords.length) * 2 * Math.PI) - Math.PI / 2) * (50 + i * 6) + 30,
              scale: 1,
            }}
            exit={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
            transition={{ type: 'spring', damping: 16, stiffness: 220, delay: i * 0.05 }}
          >
            {sk.text}
          </motion.span>
        ))}
      </AnimatePresence>
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
      initial={{ y: 24, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 16, opacity: 0, scale: 0.97 }}
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

// ─── Keyword input panel ──────────────────────────────────────────────────────
function KeywordInputPanel({ panOffset, onClose }) {
  const { addItem } = useAppStore()
  const [step, setStep] = useState('main') // 'main' | 'sub'
  const [mainKeyword, setMainKeyword] = useState('')
  const [subInput, setSubInput] = useState('')
  const [subKeywords, setSubKeywords] = useState([])
  const [type, setType] = useState('task')
  const [showToast, setShowToast] = useState(false)
  const mainRef = useRef(null)
  const subRef = useRef(null)

  useEffect(() => { mainRef.current?.focus() }, [])
  useEffect(() => { if (step === 'sub') subRef.current?.focus() }, [step])

  const handleMainKey = (e) => {
    if (e.key === 'Enter' && mainKeyword.trim()) setStep('sub')
    if (e.key === 'Escape') onClose()
  }

  const handleSubKey = (e) => {
    if (e.key === 'Enter') {
      if (subInput.trim()) {
        setSubKeywords((p) => [...p, subInput.trim()])
        setSubInput('')
      } else {
        // 두번째 엔터 → 데드라인 토스트
        setShowToast(true)
      }
    }
    if (e.key === 'Escape') onClose()
  }

  const doAdd = (deadlineIso) => {
    if (!mainKeyword.trim()) return
    addItem({
      mainKeyword: mainKeyword.trim(),
      subKeywords,
      type,
      deadline: deadlineIso || null,
      position: {
        x: -panOffset.x + window.innerWidth / 2 - 60 + (Math.random() - 0.5) * 120,
        y: -panOffset.y + window.innerHeight / 2 - 80 + (Math.random() - 0.5) * 100,
      },
    })
    onClose()
  }

  const handleDeadlineSelect = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(9, 0, 0, 0)
    doAdd(d.toISOString())
  }

  return (
    <motion.div
      style={ipStyles.panelWrap}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* ── Deadline toast (floats above) ── */}
      <AnimatePresence>
        {showToast && (
          <DeadlineToast
            onSelect={handleDeadlineSelect}
            onSkip={() => doAdd(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Main panel ── */}
      <motion.div
        style={ipStyles.panel}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
      >
        {/* Floating sub-keyword bubbles (step === 'sub') */}
        <AnimatePresence>
          {step === 'sub' && (
            <motion.div
              style={ipStyles.bubbleRow}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Main keyword bubble */}
              <span style={ipStyles.mainBubble}>{mainKeyword}</span>
              {/* Sub chips */}
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

        {/* Input row */}
        <div style={ipStyles.inputRow}>
          {/* Type badge left */}
          <div style={ipStyles.typePill}>
            {['task', 'idea'].map((t) => (
              <button
                key={t}
                style={{ ...ipStyles.typeBtn, ...(type === t ? ipStyles.typeBtnActive : {}) }}
                onClick={() => setType(t)}
              >
                {t === 'task' ? '📋 Task' : '💡 Idea'}
              </button>
            ))}
          </div>

          {step === 'main' ? (
            <input
              ref={mainRef}
              value={mainKeyword}
              onChange={(e) => setMainKeyword(e.target.value)}
              onKeyDown={handleMainKey}
              placeholder="키워드를 입력하세요..."
              style={ipStyles.input}
            />
          ) : (
            <input
              ref={subRef}
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={handleSubKey}
              placeholder="세부 키워드... (Enter ×2 완료)"
              style={ipStyles.input}
            />
          )}

          <motion.button
            style={ipStyles.arrowBtn}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              if (step === 'main' && mainKeyword.trim()) { setStep('sub'); return }
              if (step === 'sub') { setShowToast(true) }
            }}
          >→</motion.button>

          <button style={ipStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
      </motion.div>
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
          <div
            key={chunkId}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              borderRadius: 36,
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.12)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )
      })}
    </>
  )
}

// ─── MindmapPage ──────────────────────────────────────────────────────────────
export default function MindmapPage() {
  const items = useAppStore((s) => s.items)
  const activeItems = items.filter((i) => !i.completed && !i.deferred)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [showInput, setShowInput] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const isDraggingBubble = useRef(false)
  const panRef = useRef(panOffset)
  panRef.current = panOffset

  const handlePointerDown = useCallback((e) => {
    if (isDraggingBubble.current) return
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

  const handlePointerUp = useCallback(() => {
    isPanning.current = false
  }, [])

  return (
    <div
      className=""
      style={mStyles.container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Canvas world */}
      <div
        style={{
          ...mStyles.world,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
      >
        <ChunkBackground items={activeItems} />
        {activeItems.map((item) => (
          <BubbleNode
            key={item.id}
            item={item}
            panOffset={panOffset}
            isDraggingAny={isDraggingBubble}
            onDragStart={() => { isDraggingBubble.current = true; isPanning.current = false }}
            onDragEnd={() => { setTimeout(() => { isDraggingBubble.current = false }, 50) }}
          />
        ))}
      </div>

      {/* Pan hint */}
      {activeItems.length === 0 && (
        <div style={mStyles.emptyHint}>
          <p style={{ color: 'rgba(30,84,186,0.6)', fontSize: 16, fontWeight: 500, textAlign: 'center' }}>
            No reminders yet.<br />
            <span style={{ fontSize: 13, opacity: 0.7 }}>Tap the field below to add your first keyword.</span>
          </p>
        </div>
      )}

      {/* Bottom input panel */}
      <div style={mStyles.bottomArea}>
        <AnimatePresence>
          {showInput && (
            <KeywordInputPanel
              panOffset={panOffset}
              onClose={() => setShowInput(false)}
            />
          )}
        </AnimatePresence>

        {!showInput && (
          <motion.div
            style={mStyles.inputTrigger}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowInput(true)}
          >
            <span style={mStyles.inputTriggerText}>Add a keyword...</span>
            <motion.button
              style={mStyles.arrowBtnSmall}
              whileHover={{ scale: 1.1 }}
            >
              →
            </motion.button>
          </motion.div>
        )}
      </div>

      {/* FAB */}
      <motion.button
        style={mStyles.fab}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setShowAddModal(true)}
      >
        +
      </motion.button>

      {showAddModal && (
        <AddModal
          onClose={() => setShowAddModal(false)}
          initialPosition={{
            x: -panOffset.x + window.innerWidth / 2 - 60,
            y: -panOffset.y + window.innerHeight / 2 - 80,
          }}
        />
      )}
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
    width: 'min(520px, calc(100vw - 48px))',
    zIndex: 20,
  },
  inputTrigger: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.8)',
    borderRadius: 9999,
    cursor: 'text',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '14px 14px 14px 22px',
    boxShadow: '0 8px 32px rgba(30,84,186,0.12)',
  },
  inputTriggerText: {
    color: 'rgba(30,40,100,0.45)',
    fontSize: 15,
    fontWeight: 400,
  },
  arrowBtnSmall: {
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
  },
  fab: {
    alignItems: 'center',
    background: '#C0FE37',
    border: 'none',
    borderRadius: 9999,
    bottom: 32,
    color: '#000',
    cursor: 'pointer',
    display: 'none', // hidden on mindmap (using input panel instead)
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 28,
    fontWeight: 300,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 32,
    width: 52,
    zIndex: 30,
  },
}

const ipStyles = {
  /* outer wrapper — stacks toast above panel */
  panelWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  /* ── Deadline toast ── */
  toast: {
    background: 'rgba(10, 20, 60, 0.82)',
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
  toastOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
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

  /* ── Main input panel ── */
  panel: {
    background: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    border: '1px solid rgba(255,255,255,0.32)',
    borderRadius: 24,
    boxShadow: '0 12px 40px rgba(0,0,40,0.22)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '14px 14px 12px',
  },

  /* Floating bubble row (main kw + sub chips) */
  bubbleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
    alignItems: 'center',
    paddingBottom: 2,
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

  /* Input row */
  inputRow: {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
  },

  /* Type toggle pill (left side of input) */
  typePill: {
    background: 'rgba(0,0,0,0.18)',
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
    color: 'rgba(255,255,255,0.50)',
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

  input: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    flex: 1,
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 15,
    fontWeight: 500,
    outline: 'none',
    padding: '8px 4px',
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
    fontSize: 20,
    fontWeight: 600,
    height: 40,
    justifyContent: 'center',
    width: 40,
    flexShrink: 0,
    boxShadow: '0 2px 12px rgba(30,84,186,0.4)',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.55)',
    cursor: 'pointer',
    fontFamily: "'Rethink Sans', sans-serif",
    fontSize: 11,
    height: 30,
    width: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
}
