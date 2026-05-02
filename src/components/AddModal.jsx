import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'

export default function AddModal({ onClose, initialPosition }) {
  const addItem = useAppStore((s) => s.addItem)
  const [mainKeyword, setMainKeyword] = useState('')
  const [subInput, setSubInput] = useState('')
  const [subKeywords, setSubKeywords] = useState([])
  const [type, setType] = useState('task')
  const [deadline, setDeadline] = useState('')
  const [remindEvery, setRemindEvery] = useState('')
  const [step, setStep] = useState('main') // 'main' | 'sub'
  const mainInputRef = useRef(null)
  const subInputRef = useRef(null)

  useEffect(() => {
    mainInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (step === 'sub') subInputRef.current?.focus()
  }, [step])

  const handleMainKeyDown = (e) => {
    if (e.key === 'Enter' && mainKeyword.trim()) {
      setStep('sub')
    }
    if (e.key === 'Escape') onClose()
  }

  const handleSubKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (subInput.trim()) {
        setSubKeywords((prev) => [...prev, subInput.trim()])
        setSubInput('')
      }
    }
    if (e.key === 'Escape') onClose()
  }

  const removeSubKeyword = (idx) => {
    setSubKeywords((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = () => {
    if (!mainKeyword.trim()) return
    addItem({
      mainKeyword: mainKeyword.trim(),
      subKeywords,
      type,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      remindEvery: remindEvery ? parseInt(remindEvery) : null,
      position: initialPosition,
    })
    onClose()
  }

  return (
    <motion.div
      style={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        style={styles.modal}
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1,    opacity: 1, y: 0 }}
        exit={{    scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
      >
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>New Reminder</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Type toggle */}
        <div style={styles.typeRow}>
          {['task', 'idea'].map((t) => (
            <button
              key={t}
              style={{ ...styles.typeBtn, ...(type === t ? styles.typeBtnActive : {}) }}
              onClick={() => setType(t)}
            >
              {t === 'task' ? 'Task' : 'Idea'}
            </button>
          ))}
        </div>

        {/* Main keyword input */}
        <div style={styles.section}>
          <label style={styles.label}>Main keyword</label>
          <input
            ref={mainInputRef}
            value={mainKeyword}
            onChange={(e) => setMainKeyword(e.target.value)}
            onKeyDown={handleMainKeyDown}
            placeholder="e.g. 최종발표"
            style={styles.input}
          />
          {step === 'main' && mainKeyword.trim() && (
            <p style={styles.hint}>Press Enter to add sub-keywords</p>
          )}
        </div>

        {/* Sub-keywords */}
        <AnimatePresence>
          {step === 'sub' && (
            <motion.div
              style={styles.section}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
            >
              <label style={styles.label}>Related keywords</label>
              {subKeywords.length > 0 && (
                <div style={styles.chips}>
                  {subKeywords.map((kw, i) => (
                    <span key={i} style={styles.chip}>
                      {kw}
                      <button style={styles.chipRemove} onClick={() => removeSubKeyword(i)}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={subInputRef}
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={handleSubKeyDown}
                placeholder="Type keyword and press Enter..."
                style={styles.input}
              />
              <p style={styles.hint}>Press Enter to add each keyword</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deadline / remind */}
        <div style={styles.section}>
          {type === 'task' ? (
            <>
              <label style={styles.label}>Deadline</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={{ ...styles.input, colorScheme: 'dark' }}
              />
            </>
          ) : (
            <>
              <label style={styles.label}>Remind every (weeks)</label>
              <input
                type="number"
                min={1}
                max={52}
                value={remindEvery}
                onChange={(e) => setRemindEvery(e.target.value)}
                placeholder="e.g. 2"
                style={styles.input}
              />
            </>
          )}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...styles.submitBtn,
              opacity: mainKeyword.trim() ? 1 : 0.4,
              cursor: mainKeyword.trim() ? 'pointer' : 'default',
            }}
            onClick={handleSubmit}
            disabled={!mainKeyword.trim()}
          >
            Add to Re:minder
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 20, 60, 0.65)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: 'rgba(18, 30, 80, 0.85)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 24,
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: 420,
    margin: '0 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontFamily: 'Inter, sans-serif',
  },
  typeRow: {
    display: 'flex',
    gap: 8,
    background: 'rgba(255,255,255,0.06)',
    padding: 4,
    borderRadius: 9999,
  },
  typeBtn: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '6px 0',
    transition: 'all 0.2s',
  },
  typeBtnActive: {
    background: '#C0FE37',
    color: '#000',
    fontWeight: 700,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
  input: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 12,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
    fontSize: 15,
    outline: 'none',
    padding: '11px 16px',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    alignItems: 'center',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.85)',
    display: 'inline-flex',
    fontSize: 12,
    fontWeight: 500,
    gap: 6,
    padding: '4px 10px 4px 12px',
  },
  chipRemove: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: 9,
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1,
    padding: 0,
  },
  actions: { display: 'flex', gap: 10 },
  cancelBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 9999,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    flex: 1,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    padding: '11px 0',
    transition: 'all 0.2s',
  },
  submitBtn: {
    background: '#C0FE37',
    border: 'none',
    borderRadius: 9999,
    color: '#000',
    cursor: 'pointer',
    flex: 2,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    padding: '11px 0',
    transition: 'opacity 0.2s',
  },
}
