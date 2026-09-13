# PLAN — v0.8.3: היסטוריית סט + ייצוא

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר מול שלום, 13/09 — שלוש
ההחלטות המהותיות נסגרו ב‑`AskUserQuestion`). לא פותח מחדש שום החלטת מוצר —
כל מה שלמטה הוא "איך", לא "מה".

## 1. ארכיטקטורה נוכחית ותזרים נתונים רלוונטי

- **אין state של היסטוריה היום.** `AppState` (`src/app/state/store.ts:116-329`)
  מחזיק `library`, `decks`, `recording` וכו' — שום מערך כרונולוגי. `Track`
  (`src/core/types.ts:3-57`) כן מחזיק `lastPlayedAt?: number` (שורה 56) —
  ערך יחיד, נדרס בכל טעינה, לא לוג.
- **נקודת המחסום היחידה ל"נטען לדק":** `loadTrackToDeck` (`src/controls.ts:197`).
  אחרי decode מוצלח, אם `contentHash` נפתר (שורה 277 `if (contentHash)`),
  הקוד כבר עושה בדיוק את התבנית הדרושה — כתיבה אופטימית ל‑store (שורות
  281-285) + כתיבה אסינכרונית ל‑persistence עם `.catch` שהופך לכשל ל‑
  `setNotice` (שורות 286-292). ההוספה להיסטוריה נכנסת **באותו בלוק, אחרי
  שורה 285**, לא בנקודה נפרדת.
- **תבנית "מסך מלא, בלי ראוטר":** `App.tsx:18` (`useState(settingsOpen)`) +
  `App.tsx:211` (`{settingsOpen && <SettingsScreen onClose={...} />}`) +
  `Settings.tsx:32-48` (`absolute inset-0 z-40 flex flex-col bg-surface-0/97
  backdrop-blur-sm`, Escape-to-close בשורות 39-45). `TopBar` מקבל
  `onOpenSettings` כ‑prop (`TopBar.tsx:10`, נקרא מ‑`App.tsx:182`).
- **תבנית "כפתור מותנה שמופיע רק כשיש מה להראות":** `RecordingBadge`
  (`TopBar.tsx:186-276`) — שלושה מצבים לפי `recording.active`/`savedState`,
  ולא מוצג כלל (`{audioReady && <RecordingBadge />}`, שורה 133) לפני
  שההקלטה קיימת. אותו עיקרון בדיוק ישמש לכפתור "History".
- **תבנית ייצוא לקובץ חדש:** `platform/recorder-fsaccess/writer.ts:26-47`
  (`saveMasterRecording`) — `showSaveFilePicker` feature-detected inline
  (`getSaveFilePicker`, שורות 21-24), `AbortError` → `'cancelled'`, כל דבר
  אחר נזרק הלאה. `controls.ts:1922-1954` (`saveRecordedMaster`) הוא התבנית
  המדויקת ל"קרא לכתיבה, טפל בתוצאה, עדכן store, `setNotice` על הצלחה/כשל":
  `try`/`catch` חיצוני עם `setNotice({tone:'warn', source:'recording'})``
  בכישלון (שורות 1945-1952), `setNotice({tone:'info', ...})` בהצלחה (שורות
  1938-1942). `core/recording.ts:114-120` (`buildCueSheet`) הוא התבנית
  לפונקציית-טקסט טהורה ונבדקת ביחידה שמייצרת בדיוק את מה שנכתב לקובץ.
- **שם תצוגה לטראק:** `track.title ?? track.name` הוא הפולבק הקיים
  (`Library.tsx:1141`) — נעתק כמו שהוא, לא ממציא נוסחה חדשה.

## 2. הפרוסה הדקה מקצה-לקצה

`loadTrackToDeck` (אחרי `contentHash` נפתר) → `appendHistoryEntry` ב‑store
→ `TopBar`'s "History" button הופך גלוי → לחיצה פותחת `SetHistoryScreen`
(`boolean` חדש ב‑`App.tsx`, זהה ל‑`settingsOpen`) → המסך מרנדר את
`useStore((s) => s.history)` → כפתור Export קורא ל‑`ctl.exportSetHistory()`
→ `formatSetHistory` (חדש, `core/`) בונה מחרוזת → `saveSetHistoryText`
(חדש, `platform/history-export-fsaccess/writer.ts`) פותח את תיבת השמירה.

## 3. קבצים לשינוי/הוספה

### 3.1 `src/core/types.ts` — הוספה בלבד

הוספת טיפוס חדש, ליד `Track`/`DeckId` (דאטה טהור, בלי התנהגות):

```ts
/** One track loaded to a deck during the current page session (v0.8.3) — a snapshot, not a live reference, so a track later removed from the library doesn't blank out its own history row. */
export interface HistoryEntry {
  deckId: DeckId
  contentHash: string
  /** `track.title ?? track.name` at the moment of loading — same fallback Library.tsx already uses. */
  name: string
  artist: string | null
  loadedAtMs: number
}
```

### 3.2 `src/core/set-history.ts` — קובץ חדש, לוגיקה טהורה בלבד

```ts
import type { HistoryEntry } from '@/core/types'

/** Plain-text setlist, one numbered line per entry, for pasting into a post-set caption — not a data format, so no deck/BPM/timestamp columns (v0.8.3 decision 2). */
export function formatSetHistory(entries: HistoryEntry[], setDate: Date): string {
  const header = `SoundGrid set — ${setDate.toISOString().slice(0, 10)}`
  const lines = entries.map((e, i) => `${i + 1}. ${e.artist ? `${e.artist} — ` : ''}${e.name}`)
  return [header, ...lines].join('\n') + '\n'
}
```

`setDate` מגיע כפרמטר (לא `new Date()` בפנים) כדי שהפונקציה תישאר טהורה
ונבדקת ביחידה בלי תלות בשעון האמיתי — אותו עיקרון כמו `buildCueSheet`
שמקבל `sampleRate` כפרמטר במקום לקרוא משהו גלובלי.

### 3.3 `src/app/state/store.ts`

1. **`NoticeSource`** (שורה 21-32) — הוספת `'history'` לרשימה.
2. **`AppState`** (בתוך הממשק, ליד `recording`) — הוספת שדה:
   ```ts
   /** Every track loaded to a deck this page session, in load order (v0.8.3). In-memory only — cleared on reload, same as `recording`/`activeTransition` (v0.8.3 decision 3). */
   history: HistoryEntry[]
   ```
   וב‑action list:
   ```ts
   appendHistoryEntry: (entry: HistoryEntry) => void
   ```
3. **ה‑`create<AppState>` הראשוני** — `history: []`.
4. **המימוש:**
   ```ts
   appendHistoryEntry: (entry) => set((s) => ({ history: [...s.history, entry] })),
   ```
5. **import** — `HistoryEntry` מ‑`@/core/types` (מצטרף לייבוא הקיים).

### 3.4 `src/controls.ts`

1. **בתוך `loadTrackToDeck`, מיד אחרי שורה 285** (סוף בלוק `setLibrary` של
   `lastPlayedAt`, לפני `void persistLastPlayedByHash(...)` בשורה 286 —
   או מיד אחריו, סדר לא משנה כי שניהם סינכרוניים ביחס לזרימה):
   ```ts
   useStore.getState().appendHistoryEntry({
     deckId,
     contentHash,
     name: track.title ?? track.name,
     artist: track.artist ?? null,
     loadedAtMs: stampedAt,
   })
   ```
   משתמש ב‑`stampedAt` שכבר מחושב שורה 281 — לא `Date.now()` שני קריאות
   נפרדות שעלולות להיפרד במיקרו-שניות.
2. **פונקציה חדשה, ליד `saveRecordedMaster`** (אחרי שורה 1954), אותה
   תבנית `try`/`catch` בדיוק:
   ```ts
   export async function exportSetHistory(): Promise<'ok' | 'cancelled' | 'empty'> {
     const entries = useStore.getState().history
     if (entries.length === 0) return 'empty'
     const text = formatSetHistory(entries, new Date())
     try {
       const result = await saveSetHistoryText(text, `soundgrid-setlist-${new Date().toISOString().slice(0, 10)}.txt`)
       if (result === 'ok') {
         useStore.getState().setNotice({ text: 'Setlist saved.', tone: 'info', source: 'history' })
       }
       return result
     } catch (err) {
       console.error('[history] export failed', err)
       useStore.getState().setNotice({
         text: `Setlist couldn't be saved — try again. (${err instanceof Error ? err.message : String(err)})`,
         tone: 'warn',
         source: 'history',
       })
       throw err
     }
   }
   ```
3. **imports** — `formatSetHistory` מ‑`@/core/set-history`,
   `saveSetHistoryText` מ‑`@/platform/history-export-fsaccess/writer`.

### 3.5 `src/platform/history-export-fsaccess/writer.ts` — קובץ חדש

מעתיק את התבנית המדויקת של `saveMasterRecording`
(`recorder-fsaccess/writer.ts:21-47`), לטקסט במקום bytes:

```ts
const TEXT_FILE_TYPES = [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

function getSaveFilePicker(): ((o?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>) | undefined {
  return (window as unknown as { showSaveFilePicker?: (o?: SaveFilePickerOptions) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker
}

export async function saveSetHistoryText(text: string, suggestedName: string): Promise<'ok' | 'cancelled'> {
  const picker = getSaveFilePicker()
  if (typeof picker !== 'function') throw new Error('this browser has no file save dialog')
  let handle: FileSystemFileHandle
  try {
    handle = await picker({ suggestedName, types: TEXT_FILE_TYPES })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    throw err
  }
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
  return 'ok'
}
```

**כפילות קוד מול `recorder-fsaccess/writer.ts` מקובלת במפורש** — אותה
תבנית `getSaveFilePicker`/`SaveFilePickerOptions` תופיע פעמיים. חילוץ
helper משותף (`platform/fsaccess-common.ts`?) הוא הכללה מוקדמת על שני
מופעים בלבד — בדיוק מה ש‑`CLAUDE.md` אוסר ("שלוש שורות דומות עדיפות על
הפשטה מוקדמת"). אם ייוסף מופע שלישי בעתיד, זה הרגע לחלץ.

### 3.6 `src/app/components/SetHistory.tsx` — קומפוננטה חדשה

מעתיקה את מעטפת `SettingsScreen` (`Settings.tsx:32-48`, Escape בשורות
39-45) כמעט מילה במילה:

```tsx
import { useEffect, useState } from 'react'
import * as ctl from '@/controls'
import { useStore } from '@/app/state/store'
import { Button } from '@/app/components/controls'

const DECK_COLOR = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' } as const

export function SetHistoryScreen({ onClose }: { onClose: () => void }) {
  const history = useStore((s) => s.history)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-surface-0/97 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <h2 className="text-sm font-bold tracking-tight">Set history</h2>
        <span className="text-2xs text-grid-dim">{history.length} loaded this session</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xs text-grid-dim">Esc to close</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || history.length === 0}
            onClick={async () => {
              setSaving(true)
              try {
                await ctl.exportSetHistory()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Export'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>
      <ul aria-label={`Set history, ${history.length} entries`} className="flex-1 overflow-y-auto p-4">
        {history.map((e, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-hairline py-1.5 text-xs">
            <span className="tnum w-6 text-right text-grid-dim">{i + 1}.</span>
            <span
              aria-label={`Loaded on deck ${e.deckId}`}
              className="grid h-4 w-4 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[10px] font-bold leading-none"
              style={{ background: `color-mix(in srgb, ${DECK_COLOR[e.deckId]}, transparent 82%)`, color: DECK_COLOR[e.deckId] }}
            >
              {e.deckId}
            </span>
            <span className="flex-1 truncate">{e.artist ? `${e.artist} — ${e.name}` : e.name}</span>
            <span className="tnum text-grid-dim">
              {new Date(e.loadedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**אין מצב ריק לטפל בו בפועל** — הכפתור שפותח את המסך (ראו 3.7) מוצג רק
כש‑`history.length > 0`, אז ה‑`<ul>` הריק לא נגיש דרך הממשק הרגיל. אם
בכל זאת ייפתח ריק (למשל דרך `javascript_tool` בבדיקה) — רשימה ריקה, בלי
קריסה, מספיק.

### 3.7 `src/app/components/TopBar.tsx`

1. **חתימת `TopBar`** (שורה 10) — פרמטר נוסף: `onOpenHistory: () => void`.
2. **שורה חדשה בתוך ה‑selectors** (ליד שורה 11-18): `const historyCount =
   useStore((s) => s.history.length)`.
3. **בתוך `<div className="ml-auto ...">` (שורות 132-172), לפני כפתור
   Settings (שורה 166-171):**
   ```tsx
   {historyCount > 0 && (
     <Button variant="ghost" size="sm" onClick={onOpenHistory}>
       History ({historyCount})
     </Button>
   )}
   ```
   בלי `HintIcon` — זה לא פקד חדש שדורש הסבר, אותו עיקרון כמו כפתור
   Settings עצמו שגם הוא בלי hint צמוד.

### 3.8 `src/app/App.tsx`

1. **שורה 18** (ליד `settingsOpen`) — `const [historyOpen, setHistoryOpen] = useState(false)`.
2. **import** — `SetHistoryScreen` מ‑`@/app/components/SetHistory`.
3. **שורה 182** (`<TopBar onOpenSettings={...} />`) — הוספת
   `onOpenHistory={() => setHistoryOpen(true)}`.
4. **שורה 211** (ליד `{settingsOpen && <SettingsScreen .../>}`) — הוספת
   `{historyOpen && <SetHistoryScreen onClose={() => setHistoryOpen(false)} />}`.

**שום קובץ אחר לא נוגעים בו** — לא `platform/track-meta-idb/`, לא
`Library.tsx` (מלבד ה‑`DECK_COLOR` שמועתק, לא מיובא, כדי לא ליצור תלות
חוצה-קובץ על קבוע פנימי של `Library.tsx`).

## 4. שינויי טיפוס / API והתנהגות כשל

- **טיפוס חדש:** `HistoryEntry` (`core/types.ts`) — לא משנה טיפוס קיים.
- **`NoticeSource`** מקבל ערך נוסף (`'history'`) — הרחבת union, לא שינוי
  שובר.
- **כשל hash:** אם `contentHash` לא נפתר, אין רשומת היסטוריה בכלל (אותו
  שער כמו `lastPlayedAt`) — לא כשל, התדרדרות מכוונת ותועדת.
- **כשל כתיבת קובץ:** `exportSetHistory` זורק הלאה אחרי `setNotice` —
  אותה תבנית בדיוק כמו `saveRecordedMaster`. הקריאה מ‑`SetHistoryScreen`
  לא צריכה `try`/`catch` נוסף — ה‑`finally` שם רק מכבה `saving`, השגיאה
  עצמה כבר הפכה להודעה לפני שהיא נזרקת.
- **דפדפן בלי `showSaveFilePicker`:** `saveSetHistoryText` זורק הודעה
  קבועה, נתפסת באותו `catch` ב‑`exportSetHistory`, הופכת ל‑`notice`.

## 5. מודל מצב UI ותלויות נתונים

- **כפתור הכניסה (`TopBar`):** נגזר מ‑`history.length > 0` בלבד — אין
  state UI נפרד.
- **המסך:** `historyOpen` (boolean ב‑`App.tsx`) קובע אם הוא מרונדר בכלל.
  בתוכו: `saving` (boolean מקומי) קובע את מצב כפתור ה‑Export
  (disabled/"Saving…"), זהה ל‑`RecordingBadge`'s `saving`.
- **תלות המסך:** `useStore((s) => s.history)` בלבד — לא selector מורכב,
  לא תלוי ב‑`decks`/`library`.

## 6. בדיקות בשכבה הזולה ביותר שיש לה משמעות

- **`tests/core/set-history.test.ts` (חדש):** `formatSetHistory` —
  מקרה ריק (`entries: []`, מוודא רק כותרת), רשומה אחת בלי `artist`,
  שתי רשומות עם `artist`, וידוא מספור נכון (`1.`, `2.`) וסדר. פונקציה
  טהורה לגמרי (מחרוזת פנימה, מחרוזת החוצה) — בדיוק המקרה ש‑`CLAUDE.md`
  דורש בדיקת יחידה עבורו.
- **`npm run check`** — `tsc -b` (טיפוס `HistoryEntry` חדש, `NoticeSource`
  מורחב), `depcruise` (וידוא ש‑`platform/history-export-fsaccess/` לא
  מייבא מ‑`app/`, ו‑`core/set-history.ts` לא מייבא React/DOM), `oxlint`,
  `vitest run`.
- **`javascript_tool` מול שרת ה‑dev:**
  1. לטעון שני שירים שונים לשני דקים דרך `ctl.loadTrackToDeck` ישירות →
     לבדוק `useStore.getState().history` — שתי רשומות, סדר נכון, שדות
     נכונים (`deckId`, `name`, `artist`, `contentHash`, `loadedAtMs`).
  2. לטעון את אותו שיר פעמיים ברצף → לוודא **שתי** רשומות (לא דה-דופ,
     החלטה 1).
  3. לבדוק ש‑`TopBar` מציג את כפתור "History" רק אחרי הרשומה הראשונה —
     לא לפני.
  4. לפתוח את המסך (סימולציה: קריאה ישירה ל‑state שמדמה `historyOpen`,
     או לחיצה על הכפתור אם נגיש ל‑DOM) → לוודא שכל הרשומות מוצגות בסדר,
     עם התג (A/B) הנכון.
  5. `location.reload()` → לוודא ש‑`history` התאפס ל‑`[]`.
- **מה רק שלום יכול לאמת בפועל:** שהטקסט המיוצא באמת קריא ומוכן להעתקה
  לפוסט (ר' תוכנית האימות ב‑`FEATURE_SPEC.md`) — רק עין אנושית על תוצאה
  אמיתית יכולה לאשר את זה.

## 7. סיכונים, נסיגה, לא-בתכולה מכוונת

- **סיכון יחיד אמיתי:** הוספת שדה חדש ל‑`AppState` שמתעדכן בכל טעינה
  (לא frame-rate, אבל כן משתנה תדיר יחסית לשאר ה‑state) — אם מישהו בעתיד
  יקרא `s.history` בתוך selector רחב במקום `s.history.length` (כמו
  ב‑`TopBar`), זה יכול לגרום לרינדור מיותר. נכתב כהערה בקוד ליד השדה עצמו
  ב‑`store.ts`, לא רק כאן.
- **נסיגה:** שינוי בשישה קבצים (שניים חדשים: `set-history.ts`,
  `history-export-fsaccess/writer.ts`, `SetHistory.tsx`; ארבעה קיימים
  ערוכים: `types.ts`, `store.ts`, `controls.ts`, `TopBar.tsx`, `App.tsx`)
  — `git revert` של קומיט אחד מספיק, אין מיגרציית נתונים (אין persistence
  חדש בכלל).
- **לא בתכולה** (חוזר מה‑Spec, לא מוחלט כאן מחדש): בלי שמירה בין רענונים,
  בלי דה-דופ, בלי CSV, בלי דק/BPM/שעה בקובץ המיוצא, בלי כפתור "נקה
  היסטוריה", בלי וירטואליזציה.

## 8. סדר ביצוע מסודר + אימות אחרי כל שלב

1. **`core/types.ts` + `core/set-history.ts`** — הטיפוס והפונקציה הטהורה,
   עם `tests/core/set-history.test.ts`. אימות: `npm test` ירוק.
2. **`store.ts`** — שדה `history`, action `appendHistoryEntry`,
   `NoticeSource` מורחב. אימות: `npm run check` ירוק (טיפוסים בלבד, אין
   עדיין שימוש).
3. **`controls.ts` + `platform/history-export-fsaccess/writer.ts`** —
   ההוספה ל‑`loadTrackToDeck` ופונקציית `exportSetHistory`. אימות:
   `npm run check` ירוק + `javascript_tool` תרחישים 1-2 מסעיף 6.
4. **`SetHistory.tsx` + `TopBar.tsx` + `App.tsx`** — החיווט המלא. אימות:
   `npm run check` ירוק + `javascript_tool` תרחישים 3-5 מסעיף 6.
5. **commit:** `v0.8.3: היסטוריית סט + ייצוא — מסך מלא ורשימה משותפת`.
6. **`change-reviewer`** על הדיף.
7. **הוראות בדיקה בעברית לשלום** + `HANDOFF.md`/`ROADMAP.md` עדכון +
   `context_check.py`.
