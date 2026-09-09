# PLAN — v0.5.5: שליטה בשפה טבעית (הקלדה)

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר 09/09). כל ההחלטות המוצריות כבר נסגרו
שם — התוכנית הזו היא רק "איך". **מחליף** את התוכן הישן שהיה כאן (זה היה `PLAN.md` של
`v0.5.0`, גרסה אחרת שכבר שודרגה).

## החלטה טכנית אחת שדורשת עצירה — לא מוכרעת כאן

**איזו ספריית WebGPU/WASM תריץ את המודל המקומי בפועל** (מועמדות: WebLLM, wllama,
transformers.js, או משהו אחר) **לא נבחרה**, כי אף אחת מהסקירות הקודמות לא בדקה זאת, ואין
תקדים בקוד היום. זו לא רק "עוד תלות" — היא ה-block הכי גדול בגודל באנדל, בזמן טעינה,
וברישוי, שהצוות (סעיף 7 ב-`directions.md`, "AI תלוי מחקר") כבר סימן כבלתי-ודאי מראש.

**איך זה לא חוסם את שאר התוכנית:** הפרוסה מתוכננת בשני שלבים (ר' סעיף 2) — שלב 1 בונה
ובודק את כל הצנרת (UI, ולידציה, קטלוג כלים, state machine) מול `AIProvider` **מדומה
ודטרמיניסטי** (בלי WebGPU, בלי הורדת מודל, נבדק במלואו בסביבה המרוחקת הזו). שלב 2, האחרון,
הוא spike קצר וממוקד לבחירת הספרייה + מדידת זמן טעינה אמיתי — **מוצג לשלום כהחלטה, לא
מוכרע כאן מראש**.

## 1. ארכיטקטורה נוכחית וזרימת הנתונים הרלוונטית

**Port קיים, לא שלם** (`src/core/ports/ai.ts`): `AIProvider { id, available, suggest(prompt,
context): Promise<AISuggestion[]> }`. `AISuggestion { action: ControlAction, value, reason,
confidence }`. אף מקום בקוד לא מייבא אותו מלבד הבארל (`core/ports/index.ts:13`) — stub
טהור, שום מימוש.

**מה `directions.md:150-159` מתאר** (`chat(msgs, tools?): AsyncIterable<ChatChunk>`,
`kind`, `capabilities[]`) — זה מה ש-v0.5.5 צריך בפועל (שיחה/tool-calling עם מסלול הבהרה),
לא ה-`suggest()` החד-פעמי. `Msg`/`ChatChunk`/`ToolDef` לא קיימים בקוד היום מעבר לשם
בהערה.

**`ControlAction`/`Binding`** (`core/mapping/mapping.ts:5-41`) — שפה MIDI-ית גולמית: ערך
0-127, `param: number`. `manager.ts`'s `dispatch` (**פרטי**, `manager.ts:112-234`) ממיר
בייטים→קריאה ל-`controls.ts`. AI לא יכול לקרוא ל-`dispatch` (פרטי, ומיועד ל-MIDI), וגם לא
כדאי לו "לדבר" באוצר המילים הגולמי הזה — מודל שפה אמור לפלוט `{deck:'B', beats:8}`, לא
`{param:100, mode:'button'}`.

**`controls.ts`** — צוואר הבקבוק היחיד, **מחוץ** לשלוש השכבות (`CLAUDE.md`). ~50 פונקציות
מיוצאות (`play`, `pause`, `togglePlay`, `setTempo`, `toggleLoop`, `setLoopBeats`,
`pressHotCue`, `syncDeck`, `setFilter`, `setEq`, `setCrossfader`, `tapTempo` ועוד — נבדק
ב-`controls.ts` השלם). כל פונקציה עושה `guard` על `hasTrack`/`deck` בעצמה — שום דבר חדש לא
צריך להמציא guard משלו, רק לקרוא לפונקציה הקיימת.

**דפוס Worker לחישוב כבד אופציונלי** (`platform/analyzer-worker/index.ts`): `Worker` נפרד,
`postMessage`/transferable, `Map<id, resolve>` לבקשות תלויות, `worker.onerror` דוחה **את
כולן** במקום לתקוע (שורות 33-37), נפילה חזרה ל-main thread כש-`capabilities.webWorker`
כבוי. זה הדפוס להעתיק ל-AI המקומי — WebGPU זמין בתוך Worker.

**`Capabilities`** (`platform/capabilities.ts`) — כבר בודק `webgpu: 'gpu' in nav`,
`webWorker`. **אין** היום מצב "המודל בהורדה/בטעינה" — זה משהו אחר, אסינכרוני, לא בדיקת
boot סינכרונית.

**Store** (`app/state/store.ts`) — `NoticeSource` (שורה 16) היא union סגור בלי ערך ל-AI.
`notice`/`setNotice`/`clearNotice` (183-201) הם המנגנון הקיים ל"משהו נדחה/השתנה — תגיד
למה". `activeTransition`/`pendingMixRating`/`loopRollState`-style module-level state הם
התקדים ל"state זמני, לא ל-store" (טיימרים, closures).

**UI idiom לרצועה מותנית** (`App.tsx:177-191`, `TransitionRatingPrompt.tsx`): רכיב
שמופיע/נעלם לפי state, `shrink-0`, יושב מתחת ל-`TopBar` ומעל הדקים — **אין עלות גובה
במנוחה**. `Pill`/`Button`/`tone={color}` (`app/components/controls.tsx`) הם שפת העיצוב
הקיימת.

## 2. הפרוסה הדקה מקצה־לקצה

**שלב 1 — הצנרת המלאה מול provider מדומה** (נבדק כאן, בסביבה המרוחקת, בלי חומרה מיוחדת):
טקסט → קטלוג כלים → `MockAiProvider` (תשובות דטרמיניסטיות, מקודדות ביד לפי הקורפוס של 10
המשפטים + כמה מקרי קצה) → ולידציה → אישור/הבהרה/דחייה → dispatch לפונקציית `controls.ts`
האמיתית. כל 11 קריטריוני הקבלה נבדקים בשלב הזה **מלבד** האמינות של מודל אמיתי.

**שלב 2 — המודל המקומי האמיתי**: מחליף רק את המימוש מאחורי ה-port (`platform/ai-local/`)
— שום שינוי בשאר הצנרת. זה בדיוק העניין ב-port: שלב 1 כבר מוכיח שהחלפה כזו לא נוגעת
ב-UI/ולידציה/state machine.

## 3. קבצים לשינוי/הוספה, ותפקיד כל שינוי

### `src/core/ports/ai.ts`
מורחב, לא מוחלף. מוסיף **לצד** `suggest`/`AISuggestion` הקיימים:
```ts
export type AIRole = 'user' | 'assistant' | 'tool'
export interface AIMessage { role: AIRole; content: string }
export interface AIToolDef { name: string; description: string; parameters: JsonSchema }
export interface AIToolCall { name: string; args: unknown }
export type AIChatChunk =
  | { kind: 'text'; delta: string }
  | { kind: 'toolCall'; call: AIToolCall }
  | { kind: 'done' }

export interface AIProvider {
  readonly id: string
  readonly kind: 'local' | 'byo-key' | 'self-hosted'
  readonly available: boolean
  readonly capabilities: ('chat' | 'embed-audio')[]
  suggest(prompt: string, context: unknown): Promise<AISuggestion[]>
  chat(msgs: AIMessage[], tools?: AIToolDef[]): AsyncIterable<AIChatChunk>
  /** רק ספקים שצריכים הורדה/אתחול חד-פעמי מממשים את זה (מקומי). BYO-key לא. */
  load?(onProgress: (pct: number) => void): Promise<void>
}
```
`JsonSchema` — טיפוס מינימלי משלו (לא תלות חדשה — רק המפתחות שבאמת בשימוש: `type`,
`properties`, `required`, `enum`).

### `docs/architecture/directions.md`
עדכון §4 (שורות 150-159) כך שהסקיצה תואמת בדיוק את מה ש-`ai.ts` מכיל בפועל, ועדכון שורת
הסטטוס של AIProvider (שורה 64: "⬜ stub v0.5.5" → "🔶 v0.5.5, מקומי בלבד"). **באותו commit**
כמו השינוי ל-`ai.ts` — זה בדיוק הכלל של "שני קבצים לא זזים לבד".

### `src/core/ai/toolCatalog.ts` (חדש, טהור — אין import של controls.ts/store/React)
- `AI_TOOL_CATALOG: AIToolDef[]` — כלי אמיתי אחד לכל פעולה "בטוחה ל-AI" (הרשימה הראשונית:
  play, pause, toggleLoop+setLoopBeats כ-`loop(deck, beats)` משולב, `jumpToHotCue(deck,
  index)`, `setTempo(deck, bpm)`, `syncDeck(deck)`, `setFilter(deck, amount)`,
  `setCrossfader(position)`, `tapTempo(deck)`) **+ שני כלים מיוחדים תמיד זמינים**:
  `clarify(question: string)` ו-`decline(reason: string)`. המודל **חייב** לבחור כלי אחד
  מתוך הרשימה הזו בכל תשובה — זה מה שהופך "לא ברור"/"לא נתמך" למסלולים מפורשים בתוך
  ה-tool-calling עצמו, לא ניחוש שהצנרת צריכה לזהות אחר כך.
- `validateToolCall(call: AIToolCall): { ok: true; call: AIToolCall } | { ok: false; reason:
  string }` — בודק שם קיים בקטלוג + פרמטרים תואמים סכימה (deck הוא 'A'|'B', beats במספרים
  חוקיים וכו'). **זה שער הולידציה** — כל מה שלא עובר כאן נדחה עם `reason` קריא, אף פעם לא
  מגיע ל-`controls.ts`.
- `AI_SAFE_ACTIONS: (keyof typeof import('@/controls'))[]` — רשימה מפורשת (לא מחושבת)
  של שמות הפונקציות ב-`controls.ts` שנחשבות "בטוחות ל-AI" בגרסה הזו — זה מה שבדיקת
  השלמות (סעיף 6) משווה מול `AI_TOOL_CATALOG`.

### `src/controls.ts`
פונקציות choke-point חדשות, ליד הקיימות:
- `submitAiCommand(text: string): Promise<void>` — בונה `AIMessage[]` + `AI_TOOL_CATALOG`,
  קורא ל-provider הפעיל (ר' `platform/ai-local` למטה) דרך `chat()`, צובר chunks, בסיום
  קורא ל-`validateToolCall`. תוצאה תקינה `clarify`/`decline` → מעדכן state בהתאם. תוצאה
  תקינה עם פעולה אמיתית → `confirm-pending` + מתחיל טיימר תפוגה (`AI_PROPOSAL_EXPIRY_MS`,
  module-level `setTimeout`, לא ב-store — אותו דפוס כמו `loopRollState`). תוצאה לא-תקינה
  (ולידציה נכשלה) → `setNotice({ text: '...', tone: 'warn', source: 'ai' })`, חוזר ל-idle.
- `confirmAiProposal(): void` — מנקה את הטיימר, קורא **ישירות** לפונקציית `controls.ts`
  שהכלי מייצג (switch פנימי קטן, tool name → קריאה לפונקציה הקיימת — `loop` →
  `setLoopBeats`+`toggleLoop`, `jumpToHotCue` → `pressHotCue`, וכו'), חוזר ל-idle.
- `cancelAiProposal(reason: 'user' | 'expired'): void` — מנקה טיימר, `setNotice` רק אם
  `reason === 'expired'` ("ההצעה בוטלה — עברו X שניות"), חוזר ל-idle. לחיצת Cancel של
  המשתמש לא צריכה הודעה — היא כבר הפעולה הגלויה בעצמה.
- `toggleAiControl(on: boolean): void` — הדלקה/כיבוי הפיצ'ר (ברירת מחדל כבוי).
- קבוע `AI_PROPOSAL_EXPIRY_MS = 8000` ליד קבועי הכיול האחרים (`MAX_SYNC_BEND` וכו') —
  **לא** נחשף ב-Settings (CLAUDE.md v0.2.5).

### `src/app/state/store.ts`
- `NoticeSource` (שורה 16): מוסיף `'ai'`.
- `AppState` slice חדש:
  ```ts
  ai: {
    enabled: boolean
    phase: 'idle' | 'typing' | 'thinking' | 'confirm' | 'clarify' | 'decline'
           | 'model-loading' | 'model-error'
    input: string
    proposal: { summary: string; deckId?: DeckId; call: AIToolCall } | null
    clarifyQuestion: string | null
    declineReason: string | null
    loadProgressPct: number | null
    loadError: string | null
  }
  ```
  + `setAiInput`/`patchAi` פעולות פשוטות, באותה צורה כמו `patchDeck`/`setLibrary`.

### `src/platform/ai-local/index.ts` (חדש)
מממש `AIProvider` (`kind: 'local'`, `capabilities: ['chat']`). מראה על משקל
`platform/analyzer-worker/index.ts` **בדיוק**: `Worker` יחיד, `pending: Map<id, resolve>`,
`worker.onerror` דוחה הכל. `chat()` שולח בקשה ל-Worker ומזרים chunks בחזרה דרך
`postMessage` סדרתיים (טקסט חלקי/tool-call/done). `load(onProgress)` — מפעיל את הורדת
המשקלים בתוך ה-Worker, מדווח progress חזרה.

### `src/platform/ai-local/worker.ts` (חדש)
טוען את המודל (הספרייה נבחרת ב"שלב 2" — ר' ההחלטה הפתוחה למעלה), מריץ tool-calling
inference, כותב חזרה chunks. **לא נכתב בשלב 1** — שלב 1 עובד מול `MockAiProvider` בלבד.

### `src/platform/ai-mock/index.ts` (חדש, זמני-לצמיתות — נשאר גם אחרי שלב 2 לבדיקות)
`AIProvider` מדומה, `kind: 'local'` (מתחזה לאותה צורה), תשובות דטרמיניסטיות: טבלת
`Record<string, AIToolCall>` שממפה תת-מחרוזות ידועות (10 משפטי הבדיקה + "תכניס אקפלה" +
משפט מעורפל אחד) לתגובה קבועה. זה מה שהופך את כל שאר הצנרת לבדיקה — נבדק בסביבה המרוחקת
הזו בלי WebGPU בכלל.

### `src/app/components/AiControlBar.tsx` (חדש)
רצועה מותנית, אותו idiom כמו `TransitionRatingPrompt.tsx` — `shrink-0`, מוצג ב-`App.tsx`
מיד אחרי ה-`notice` bar הקיים, `null` כש-`ai.phase === 'idle'` וגם אין input פתוח.
- `typing`: `<input>` פשוט + Enter → `ctl.submitAiCommand`.
- `thinking`: תווית "חושב…" (לא רק spinner).
- `confirm`: `Pill tone={color-of-targeted-deck}` + טקסט + `Button` Go/Cancel.
- `clarify`: `Pill tone="warn"` + השאלה + אפשרות להקליד שוב.
- `decline`: `Pill tone="warn"` + הסיבה, נעלם אחרי כמה שניות (כמו notice).
- `model-loading`/`model-error`: progress % / הודעת כישלון ממוקדת.

### `src/app/components/TopBar.tsx`
כפתור טקסט/מיקרופון קטן (רק טקסט בגרסה זו — אין אייקון מיקרופון) ליד `MidiBadge`/Settings,
`onClick` פותח את `AiControlBar` (`ctl.toggleAiControl`), מוצג רק כש-`ai.enabled` נכון
(המשתמש הדליק את הפיצ'ר, לא ברירת מחדל).

### `tests/core/ai-toolcatalog.test.ts` (חדש)
- `validateToolCall`: כלי תקין עם ארגומנטים תקינים → `ok`; שם לא קיים → `ok:false`;
  ארגומנטים לא תואמי סכימה (deck='C', beats=-5) → `ok:false`.
- **בדיקת שלמות** (סגנון `tests/core/hints.test.ts`): כל שם ב-`AI_SAFE_ACTIONS` יש לו
  ערך תואם ב-`AI_TOOL_CATALOG`, ולהפך — נכשלת אם מישהו מוסיף פעולה בטוחה בלי כלי, או כלי
  בלי פעולה אמיתית מאחוריו.

### `tests/core/ai-translate.test.ts` (חדש)
קורפוס 10 המשפטים + "תכניס אקפלה" + משפט מעורפל אחד, רץ מול `MockAiProvider` (דטרמיניסטי
— vitest אמיתי, לא mock-של-mock) → `submitAiCommand` מייצר את ה-`AIToolCall` הצפוי /
`clarify`/`decline` הצפוי. **זה לא מודד את איכות המודל האמיתי** (זה שלב 2) — זה מודד
שהצנרת (קטלוג→ולידציה→state) לא שוברת תשובה תקינה.

## 4. שינויי API/טיפוסים, כולל התנהגות כשל

| שינוי | כשל אפשרי | טיפול |
|---|---|---|
| `AIProvider.chat()` חדש | Worker לא עולה (שלב 2) | `onerror` דוחה כל בקשה תלויה, `phase: 'model-error'`, הודעה גלויה |
| `validateToolCall` | שם/ארגומנטים לא תואמים קטלוג | נדחה עם `reason`, `setNotice(source:'ai')`, אף פעם לא מגיע ל-`confirm-pending` |
| `confirm-pending` + טיימר | תפוגה בזמן שהמשתמש בדיוק לוחץ Go | טיימר מנוקה בתוך `confirmAiProposal` לפני הקריאה — race מטופל ב-JS single-thread רגיל, אין תנאי מרוץ אמיתי |
| `load(onProgress)` (שלב 2) | אין רשת / WebGPU לא נתמך / אין מקום באחסון | `phase: 'model-error'` עם `loadError` קריא, שאר האפליקציה לא מושפעת |
| `AI_SAFE_ACTIONS` מתרחב בעתיד | מישהו מוסיף פעולה בלי כלי תואם | בדיקת השלמות נכשלת ב-`npm test`, לא דילוג שקט |

## 5. מודל state של ה-UI ותלויות נתונים

```
AppState.ai               — סריאלייזבילי, ב-store (phase/input/proposal/וכו')
controls.ts (module-level) — aiProposalTimer: number | null (טיימר תפוגה, לא ב-store)
platform/ai-local/index.ts — worker instance + pending map (כמו analyzer-worker)
```
`AiControlBar.tsx` קורא `useStore((s) => s.ai)` ישירות (לא prop-drilling מ-`App.tsx`) —
אותו נימוק כמו `shiftHeld` ב-v0.5.0: התגובה חייבת להיות מיידית בלי להעביר state דרך כל
העץ.

## 6. בדיקות בשכבה הזולה ביותר

- `core/ai/toolCatalog.ts` — vitest אמיתי, טהור, כולל בדיקת השלמות (ר' סעיף 3).
- `tests/core/ai-translate.test.ts` — קורפוס 10+2 המשפטים מול `MockAiProvider` הדטרמיניסטי.
- **בדפדפן** (שלב 1, `npm run dev` + Playwright/Chromium, `javascript_tool`/
  `read_console_messages`): הקלדת כל משפט מהקורפוס, וידוא `confirm`/`clarify`/`decline`
  נכון, וידוא ש-Go קורא בדיוק לפונקציית `controls.ts` הצפויה (בדיקה דרך ה-store), וידוא
  תפוגה עם הודעה, וידוא ה-toggle כבוי כברירת מחדל.
- **שלב 2 בלבד**: מדידת הקורפוס מול המודל האמיתי, שיעור הצלחה נרשם ב-`HANDOFF.md`
  (סגנון v0.1.7) — זו לא vitest, זו מדידה מתועדת כי המודל לא דטרמיניסטי טהור.
- `npm run check` ירוק לפני כל commit, בכל שלב.

## 7. סיכונים, נסיגה, ולא-מטרות מכוונות

- **סיכון גדול (שלב 2 בלבד):** אין עדיין ספריית WebGPU/WASM נבחרת — ר' ההחלטה הפתוחה
  למעלה. **מיטיגציה:** מבודד לחלוטין ל-`platform/ai-local/` ול-spike קצר; שאר המערכת לא
  תלויה בבחירה. **נסיגה:** אם הספרייה שנבחרת לא עובדת טוב על המחשב של שלום, `MockAiProvider`
  נשאר קיים ל-fallback פיתוח, וה-port לא צריך לזוז.
- **סיכון:** תרגום שגוי שעדיין עובר ולידציה (למשל דק לא נכון אבל תחבירית תקין).
  **מיטיגציה:** בדיוק בשביל זה יש `confirm-pending` — שלב האישור הוא קו ההגנה האחרון,
  לא הולידציה. **לא מטופל טכנית**, זה בדיוק מה שה-UX מכסה.
- **לא-מטרה מכוונת:** קול (Web Speech API) — נדחה לגמרי מהספסיפיקציה, אין קוד בתוכנית הזו
  שנוגע בו.
- **לא-מטרה מכוונת:** BYO-API-key/self-hosted — ה-port פתוח לזה (`kind` union כבר כולל
  אותם), אבל שום מימוש לא נבנה כאן.
- **נסיגה כללית:** הפיצ'ר כולו מאחורי `ai.enabled` (כבוי כברירת מחדל) — אפשר להסיר את
  `TopBar.tsx`'s כפתור ו-`AiControlBar.tsx` בלי לגעת בשום קוד קיים.

## 8. סדר ביצוע עם אימות אחרי כל צעד משמעותי

1. **`core/ports/ai.ts` + `directions.md:64,150-159`** (באותו commit) — טיפוסים חדשים
   לצד הקיימים. אימות: `tsc -b` ירוק.
2. **`core/ai/toolCatalog.ts` + `tests/core/ai-toolcatalog.test.ts`** — קטלוג, ולידציה,
   בדיקת שלמות. אימות: `npm test` ירוק על הקובץ הזה.
3. **`platform/ai-mock/index.ts`** — provider מדומה לבדיקות. אימות: `tsc -b` ירוק, אין
   עדיין קורא.
4. **`controls.ts`**: `submitAiCommand`/`confirmAiProposal`/`cancelAiProposal`/
   `toggleAiControl` מול ה-mock provider. **`tests/core/ai-translate.test.ts`**. אימות:
   `npm test` ירוק — הקורפוס עובר מול ה-mock.
5. **`store.ts`**: `ai` slice + `'ai'` ל-`NoticeSource`. אימות: `tsc -b` ירוק.
6. **`AiControlBar.tsx` + `TopBar.tsx`**: ה-UI המלא, מחובר ל-mock provider. אימות: בדפדפן
   (`npm run dev` + Playwright) — כל 11 קריטריוני הקבלה מה-spec, אחד־אחד, מלבד איכות מודל
   אמיתי.
7. **`npm run check` מלא** + `HANDOFF.md` מעודכן + `context_check.py` + commit + push —
   **זו נקודת עצירה טבעית**: הפיצ'ר שלם ונבדק מול provider מדומה, אבל עוד לא מול מודל
   אמיתי. ראוי לעצור כאן ולהראות לשלום לפני שלב 2.
8. **Spike קצר** (שלב 2, אחרי אישור שלום להמשיך): בחירת ספריית WebGPU/WASM, מדידת זמן
   טעינה על מחדד אמיתי אם אפשר, `platform/ai-local/worker.ts`. אימות: הורדה+טעינה
   מצליחה בדפדפן, progress גלוי.
9. **`platform/ai-local/index.ts`** מחליף את ה-mock כברירת המחדל (ה-mock נשאר זמין
   לבדיקות). אימות: קריאה חוזרת על כל קריטריוני הקבלה מול המודל האמיתי.
10. **מדידת הקורפוס מול המודל האמיתי**, תוצאה נרשמת ב-`HANDOFF.md` (סגנון v0.1.7).
11. **`npm run check` מלא** + `HANDOFF.md`/`ROADMAP.md` מעודכנים + `context_check.py` +
    commit + push, לפי הנוהל המלא ב-CLAUDE.md.
