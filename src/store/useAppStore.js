import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const now = Date.now()

const SAMPLE_ITEMS = [
  {
    id: 's1',
    mainKeyword: 'User testing',
    subKeywords: [
      { id: 'sk1', text: 'Investment UX' },
      { id: 'sk2', text: 'Emma' },
      { id: 'sk3', text: 'David' },
      { id: 'sk4', text: 'Jason' },
      { id: 'sk5', text: 'Meeting Room 3' },
    ],
    deadline: new Date(now + 2.5 * 60 * 60 * 1000).toISOString(),
    remindEvery: null,
    type: 'task',
    completed: false,
    deferred: false,
    deferredUntil: null,
    position: { x: 320, y: 260 },
    chunkId: null,
    createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 's2',
    mainKeyword: 'House party',
    subKeywords: [
      { id: 'sk6', text: 'Venue booking' },
      { id: 'sk7', text: 'Invites' },
      { id: 'sk8', text: 'Playlist' },
    ],
    deadline: new Date(now + 20 * 60 * 60 * 1000).toISOString(),
    remindEvery: null,
    type: 'task',
    completed: false,
    deferred: false,
    deferredUntil: null,
    position: { x: 620, y: 180 },
    chunkId: null,
    createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 's3',
    mainKeyword: 'Team meeting',
    subKeywords: [
      { id: 'sk9', text: 'Q2 Review' },
      { id: 'sk10', text: 'Slides deck' },
      { id: 'sk11', text: 'Action items' },
    ],
    deadline: new Date(now + 44 * 60 * 60 * 1000).toISOString(),
    remindEvery: null,
    type: 'task',
    completed: false,
    deferred: false,
    deferredUntil: null,
    position: { x: 900, y: 340 },
    chunkId: null,
    createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 's4',
    mainKeyword: 'User Interview',
    subKeywords: [
      { id: 'sk12', text: 'Screener' },
      { id: 'sk13', text: 'Discussion guide' },
    ],
    deadline: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
    remindEvery: null,
    type: 'task',
    completed: false,
    deferred: false,
    deferredUntil: null,
    position: { x: 420, y: 500 },
    chunkId: null,
    createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 's5',
    mainKeyword: 'Design Sprint',
    subKeywords: [
      { id: 'sk14', text: 'Field Research' },
      { id: 'sk15', text: 'Hellen' },
      { id: 'sk16', text: 'UX Design' },
    ],
    deadline: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
    remindEvery: null,
    type: 'idea',
    completed: false,
    deferred: false,
    deferredUntil: null,
    position: { x: 780, y: 470 },
    chunkId: null,
    createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

export const useAppStore = create(
  persist(
    (set, get) => ({
      items: SAMPLE_ITEMS,

      addItem: (data) => {
        const item = {
          id: genId(),
          mainKeyword: data.mainKeyword || '',
          subKeywords: (data.subKeywords || []).map((t) =>
            typeof t === 'string' ? { id: genId(), text: t } : t
          ),
          deadline: data.deadline || null,
          remindEvery: data.remindEvery || null,
          type: data.type || 'task',
          completed: false,
          deferred: false,
          deferredUntil: null,
          position: data.position || {
            x: 300 + Math.random() * 400,
            y: 200 + Math.random() * 300,
          },
          chunkId: null,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ items: [...state.items, item] }))
        return item.id
      },

      updateItem: (id, updates) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        })),

      completeItem: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, completed: true, completedAt: new Date().toISOString() }
              : item
          ),
        })),

      deferItem: (id) => {
        const deferredUntil = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString()
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  deferred: true,
                  deferredUntil,
                  deferredAt: new Date().toISOString(),
                }
              : item
          ),
        }))
      },

      restoreItem: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  completed: false,
                  deferred: false,
                  deferredUntil: null,
                  completedAt: undefined,
                  deferredAt: undefined,
                }
              : item
          ),
        })),

      deleteItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      updatePosition: (id, position) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, position } : item
          ),
        })),

      addSubKeyword: (itemId, text) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  subKeywords: [
                    ...item.subKeywords,
                    { id: genId(), text },
                  ],
                }
              : item
          ),
        })),

      updateChunk: (id, chunkId) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, chunkId } : item
          ),
        })),
    }),
    {
      name: 'reminder-app-store-v2',
      version: 2,
      migrate: (persisted, version) => {
        // Always return valid state
        if (!persisted || !Array.isArray(persisted.items) || persisted.items.length === 0) {
          return { items: SAMPLE_ITEMS }
        }
        return persisted
      },
    }
  )
)
