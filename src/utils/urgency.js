export function getUrgencyInfo(deadline) {
  if (!deadline) {
    return { level: 'none', hoursLeft: Infinity, label: 'No deadline' }
  }
  const hoursLeft = (new Date(deadline) - Date.now()) / (1000 * 60 * 60)

  if (hoursLeft < 0)   return { level: 'overdue',  hoursLeft, label: 'Overdue' }
  if (hoursLeft < 24)  return { level: 'critical', hoursLeft, label: formatHours(hoursLeft) }
  if (hoursLeft < 72)  return { level: 'high',     hoursLeft, label: `${Math.ceil(hoursLeft / 24)}d left` }
  if (hoursLeft < 168) return { level: 'medium',   hoursLeft, label: `${Math.ceil(hoursLeft / 24)}d left` }
  return                      { level: 'low',      hoursLeft, label: `${Math.round(hoursLeft / 24)}d left` }
}

function formatHours(h) {
  if (h < 0) return 'Overdue'
  const hours = Math.floor(h)
  const mins  = Math.floor((h - hours) * 60)
  if (hours === 0) return `${mins}m left`
  return `${hours}h ${mins}m left`
}

export function getBubbleStyle(level) {
  const styles = {
    overdue:  { bg: '#C0FE37', color: '#000', scale: 1.6,  opacity: 1.0,  glow: true  },
    critical: { bg: '#C0FE37', color: '#000', scale: 1.4,  opacity: 1.0,  glow: true  },
    high:     { bg: '#C0FE37', color: '#000', scale: 1.15, opacity: 0.9,  glow: false },
    medium:   { bg: 'rgba(255,255,255,0.28)', color: 'rgba(255,255,255,1.0)',  scale: 1.0,  opacity: 0.92, glow: false },
    low:      { bg: 'rgba(255,255,255,0.20)', color: 'rgba(255,255,255,0.90)', scale: 0.85, opacity: 0.78, glow: false },
    none:     { bg: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.82)', scale: 0.8,  opacity: 0.65, glow: false },
  }
  return styles[level] ?? styles.none
}

export function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const aHours = a.deadline ? (new Date(a.deadline) - Date.now()) / 3600000 : Infinity
    const bHours = b.deadline ? (new Date(b.deadline) - Date.now()) / 3600000 : Infinity
    return aHours - bHours
  })
}

export function getCountdown(deadline) {
  if (!deadline) return null
  const diff = new Date(deadline) - Date.now()
  if (diff <= 0) return 'Overdue'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function getDeadlineLabel(deadline) {
  if (!deadline) return null
  const diff = new Date(deadline) - Date.now()
  const days = diff / 86400000
  if (diff < 0) return 'Overdue'
  if (days < 1) return 'Today'
  if (days < 2) return 'Tomorrow'
  return new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getActiveItems(items) {
  return items.filter((i) => !i.completed && !i.deferred)
}

export function getMomentum(items) {
  const total = items.length
  const done  = items.filter((i) => i.completed).length
  if (total === 0) return 'none'
  const ratio = done / total
  if (ratio >= 0.6) return 'high'
  if (ratio >= 0.3) return 'medium'
  return 'low'
}
