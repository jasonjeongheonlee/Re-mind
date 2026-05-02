# AGENTS.md — Re:minder

> 이 파일은 AI 에이전트와 새로운 기여자가 이 코드베이스를 빠르게 파악할 수 있도록 작성된 레퍼런스입니다.

---

## 1. 프로젝트 개요

**Re:minder**는 키워드 중심의 리마인더 웹앱입니다. 마감 임박도에 따라 버블 크기와 색상이 달라지고, Tinder 스타일 스와이프로 항목을 처리하며, 무한 캔버스에서 버블을 자유롭게 배치할 수 있습니다.

### 기술 스택

| 역할 | 라이브러리 | 버전 |
|---|---|---|
| UI 프레임워크 | React | 18.3 |
| 빌드 도구 | Vite | 5.4 |
| 애니메이션 / 드래그 | framer-motion | 11.3 |
| 전역 상태 | zustand (+ persist 미들웨어) | 4.5 |
| 폰트 | Rethink Sans (Google Fonts) | — |
| 배포 | GitHub Pages + GitHub Actions | — |

**의존성 없는 것**: TypeScript, CSS 모듈, Tailwind, 테스트 프레임워크, 라우터

---

## 2. 디렉토리 구조

```
Re-mind/
├── index.html                  # Google Fonts 로드, #root 마운트 포인트
├── vite.config.js              # base: '/Re-mind/' (GitHub Pages 필수)
├── .github/
│   └── workflows/deploy.yml   # main push → npm ci → build → gh-pages 자동 배포
└── src/
    ├── main.jsx                # ReactDOM.createRoot 진입점
    ├── index.css               # 전역 스타일 (aurora 배경, 유틸 클래스만)
    ├── App.jsx                 # 탭 라우팅 (reminder / mindmap / rewinder)
    ├── components/
    │   ├── Navbar.jsx          # 로고 + 탭 GNB + 날짜 칩
    │   └── AddModal.jsx        # 플로팅 모달 (키워드 입력, 데드라인 설정)
    ├── pages/
    │   ├── ReminderPage.jsx    # 버블 스트립 + 스와이프 카드 모드
    │   ├── MindmapPage.jsx     # 무한 캔버스 + 버블 드래그 + 입력 패널
    │   └── RewinderPage.jsx    # 완료/미룬 항목 아카이브
    ├── store/
    │   └── useAppStore.js      # zustand 스토어 (localStorage persist)
    └── utils/
        └── urgency.js          # 긴급도 계산 순수 함수 모음
```

---

## 3. 코딩 컨벤션

### 파일 & 네이밍

- **컴포넌트 / 페이지**: `PascalCase.jsx` (예: `ReminderPage.jsx`)
- **유틸 / 스토어**: `camelCase.js` (예: `useAppStore.js`, `urgency.js`)
- **기본 export만 사용**: 모든 컴포넌트는 `export default function ...`
- **named export**: 유틸 함수만 (`urgency.js`)

### 스타일 작성 방식

이 프로젝트는 **CSS 모듈이나 Tailwind를 사용하지 않습니다.** 모든 스타일은 인라인 JS 객체로 작성합니다.

```js
// 파일 하단에 const styles = {} 로 모아서 선언
const styles = {
  page: { height: '100%', width: '100%', ... },
  hero: { display: 'flex', flexDirection: 'column', gap: 6 },
}

// 파일 내 여러 영역이 있을 때 prefix로 구분
const sStyles = {}   // SwipeMode 관련 (ReminderPage)
const mStyles = {}   // Mindmap 캔버스 관련
const ipStyles = {}  // Input Panel 관련
```

`index.css`는 다음 유틸 클래스만 포함합니다:
- `.app-bg` — 전체 aurora 그라디언트 배경 (루트 `.app` div에 적용)
- `.bubble` — 공통 pill 형태 (border-radius: 9999px)
- `.bubble-urgent`, `.bubble-glass` — 긴급도별 버블 variant
- `.glass-card`, `.glass-input` — glassmorphism 공통 카드/입력

### 상태 관리 패턴

```js
// 항상 selector로 구독 (불필요한 리렌더 방지)
const items = useAppStore((s) => s.items)
const { addItem, updateItem } = useAppStore()
```

zustand persist key: `'reminder-app-store-v2'` — 스토어 구조 변경 시 버전을 올리고 `migrate` 함수를 작성해야 합니다.

### 컴포넌트 내 훅 패턴

페이지 파일 내부에 로컬 훅을 직접 선언합니다 (별도 파일 분리 없음):

```js
// 파일 상단, export default 전에 선언
function useCountdown(deadline) { ... }
function useLongPress(cb, ms = 500) { ... }
```

---

## 4. 주요 명령어

```bash
# 개발 서버 (http://localhost:5173)
npm run dev

# 프로덕션 빌드 → dist/
npm run build

# 빌드 결과 로컬 미리보기
npm run preview
```

**배포**: `main` 브랜치에 push하면 GitHub Actions가 자동으로 빌드 후 GitHub Pages에 배포합니다. 수동 배포는 불필요합니다.

---

## 5. 아키텍처 결정 사항

### 긴급도 시스템 (`utils/urgency.js`)

항목의 시각적 표현을 결정하는 핵심 로직입니다.

```
overdue  → #C0FE37(라임) 버블, scale 1.6, glow
critical → #C0FE37 버블, scale 1.4, glow  (< 24h)
high     → #C0FE37 버블, scale 1.15       (< 72h)
medium   → 흰색 반투명 glass, scale 1.0   (< 7일)
low      → 흰색 반투명 glass, scale 0.85  (> 7일)
none     → 흰색 반투명 glass, scale 0.8   (데드라인 없음)
```

긴급도 판단 함수를 수정할 때는 `getBubbleStyle`의 scale/opacity도 함께 검토하세요.

### 버블 드래그 vs 캔버스 팬 (MindmapPage)

**문제**: 버블 드래그와 캔버스 팬이 동일한 pointerDown 이벤트를 공유합니다.

**해결 패턴**:
```js
// 버블: onPointerDownCapture + stopPropagation → 캔버스 팬 차단
onPointerDownCapture={(e) => {
  e.stopPropagation()
  onDragStart()
}}

// 캔버스: onPointerDown (캡처 단계 이후) → 버블이 처리하면 도달 안 함
<div onPointerDown={handlePointerDown} ...>
```

`isDraggingBubble` ref로 팬 상태를 동기적으로 차단합니다.

### framer-motion 드래그 구현 원칙

캔버스 버블 드래그는 **delta 방식**을 사용합니다:
```js
// useMotionValue(0)으로 드래그 델타만 추적
const bx = useMotionValue(0)
const by = useMotionValue(0)

onDragEnd: (_, info) => {
  // 실제 위치 = 기존 store 위치 + 드래그 오프셋
  updatePosition(item.id, {
    x: item.position.x + info.offset.x,
    y: item.position.y + info.offset.y,
  })
  bx.set(0)  // 반드시 리셋
  by.set(0)
}
```

### SwipeMode ID 기반 큐

인덱스 기반 큐를 사용하면 store 업데이트 후 배열이 줄어 크래시가 발생합니다. **반드시 ID 기반 큐**를 유지하세요:

```js
// ❌ 금지 — store 변경 시 index가 범위를 벗어남
const currentItem = activeItems[currentIdx]

// ✅ 올바른 방식
const [queue] = useState(() => allActive.map((i) => i.id))
const currentItem = allActive.find((i) => i.id === currentId) ?? null
```

### 배경 그라디언트 구조

`app-bg` 클래스는 반드시 **루트 `.app` div 하나에만** 적용합니다. 개별 페이지 div에 중복 적용하면 그라디언트가 이중으로 쌓입니다.

```jsx
// App.jsx — 여기에만 app-bg
<div className="app app-bg">
  <Navbar />
  <div className="page-container">
    {/* 각 페이지 div는 app-bg 없이 */}
  </div>
</div>
```

### 금지 사항

| 금지 | 이유 |
|---|---|
| `className="app-bg"` in page divs | 루트에 이미 있음, 이중 적용 금지 |
| index 기반 SwipeMode 큐 | 크래시 발생 (ID 기반 유지) |
| `vite.config.js`에서 `base` 제거 | GitHub Pages 경로 깨짐 |
| zustand persist key 무단 변경 | 기존 localStorage 충돌, migrate 필수 |
| `fontFamily: 'Inter, sans-serif'` | Rethink Sans로 통일됨 |

---

## 6. 자주 수정하는 파일

### 시각적 디자인 변경 시

| 목적 | 파일 |
|---|---|
| 배경 그라디언트 색상/강도 | `src/index.css` → `.app-bg` |
| 버블 색상 / 크기 / 투명도 | `src/utils/urgency.js` → `getBubbleStyle()` |
| 긴급도 시간 기준 (24h / 72h 등) | `src/utils/urgency.js` → `getUrgencyInfo()` |
| Navbar 레이아웃 / 탭 스타일 | `src/components/Navbar.jsx` |

### 기능 추가 시

| 목적 | 파일 |
|---|---|
| 새 항목 필드 추가 | `src/store/useAppStore.js` → `addItem`, `SAMPLE_ITEMS` |
| Reminder 탭 레이아웃 | `src/pages/ReminderPage.jsx` → `styles` 객체 |
| 마인드맵 버블 동작 | `src/pages/MindmapPage.jsx` → `BubbleNode` |
| 마인드맵 입력 흐름 | `src/pages/MindmapPage.jsx` → `KeywordInputPanel`, `DeadlineToast` |
| 스와이프 카드 동작 | `src/pages/ReminderPage.jsx` → `SwipeCard`, `SwipeMode` |
| 아카이브 표시 | `src/pages/RewinderPage.jsx` |
| 플로팅 추가 모달 | `src/components/AddModal.jsx` |

### 데이터 모델 (항목 스키마)

```js
{
  id: string,             // Date.now().toString(36) + random
  mainKeyword: string,    // 메인 버블 텍스트
  subKeywords: [{ id, text }],
  deadline: ISO string | null,
  remindEvery: number | null,  // 아이디어용, 단위: 주
  type: 'task' | 'idea',
  completed: boolean,
  deferred: boolean,
  deferredUntil: ISO string | null,
  position: { x: number, y: number },  // 마인드맵 캔버스 좌표
  chunkId: string | null,  // 근접 그룹 ID
  createdAt: ISO string,
  completedAt?: ISO string,
  deferredAt?: ISO string,
}
```

---

## 7. GitHub Pages 배포 구조

```
push to main
  → .github/workflows/deploy.yml
  → npm ci && npm run build
  → dist/ 를 GitHub Pages environment에 업로드
  → https://jasonjeongheonlee.github.io/Re-mind/
```

`vite.config.js`의 `base: '/Re-mind/'`가 없으면 JS/CSS 파일 경로가 `/` 기준으로 생성되어 404가 발생합니다.

---

*마지막 업데이트: 2026-05-02*
