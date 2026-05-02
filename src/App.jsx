import { useState } from 'react'
import Navbar from './components/Navbar'
import ReminderPage from './pages/ReminderPage'
import MindmapPage from './pages/MindmapPage'
import RewinderPage from './pages/RewinderPage'
import AddModal from './components/AddModal'

export default function App() {
  const [activeTab, setActiveTab] = useState('reminder')
  const [showAddModal, setShowAddModal] = useState(false)

  return (
    <div className="app">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="page-container">
        {activeTab === 'reminder' && (
          <ReminderPage onAdd={() => setShowAddModal(true)} />
        )}
        {activeTab === 'mindmap' && <MindmapPage />}
        {activeTab === 'rewinder' && <RewinderPage />}
      </div>

      {showAddModal && <AddModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
