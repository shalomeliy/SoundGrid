# PLAN — v0.8.5: חיפוש סמנטי בספרייה

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר מול שלום, 14/09, קומיט `38940b6`).
המסמך הזה הוא ה"איך" — קובץ-אחרי-קובץ, לפי סדר מימוש — ולא חוזר על שום החלטת
מוצר מה‑spec (embedder קלאסי כברירת מחדל, CLAP מאחורי מדידה, כפתור אפור לטראק
לא-מנותח, שדרוג מודל שקט ברקע — כל אלה סגורים, לא נפתחים כאן מחדש).

**שלושה milestones, כל אחד בר-הרצה ובר-קומיט בפני עצמו:**
1. פורט + embedder קלאסי + cache + מתמטיקת דמיון + חיווט לתור הקיים + טסטים
2. מדידת CLAP אמיתית (script, לא UI) → **עצירה חובה בסיום** — ר' "שער יציאה מ‑M2" למטה
3. UI ב‑`Library.tsx` — רק אחרי ש‑1 עובד קצה-לקצה, ורק אחרי שהוחלט איזה embedder ברירת המחדל

**שער יציאה מ‑M2 (הוחלט מול שלום, 14/09 — אחרי שהוא כמעט קיבל החלטה על בסיס
המספר הלא נכון: המספר שנמדד ב‑M1 היה של השיטה הקלאסית, לא של CLAP):**
ברגע שיש מספר אמיתי על CLAP (זמן לטראק בודד, מוכפל לספרייה של שלום), **לעצור
ולשאול את שלום שוב איזו שיטה להשתמש — עם `AskUserQuestion`, שתי האפשרויות
בשפה פשוטה, כולל שני המספרים האמיתיים זה מול זה** (קלאסי מ‑M1 מול CLAP מ‑M2).
**אסור** להניח שהתשובה הקודמת שלו ("AI חכם") עדיין תקפה ברגע שיש מספר אמיתי —
הוא ביקש לשאול מחדש, לא לבחור בשבילו. רק אחרי תשובה מפורשת ב‑M2 הזה ממשיכים
ל‑M3 (ה‑UI) עם ה‑embedder שנבחר בפועל.

**המספר האמיתי (15/09, מחשב שלום, לא ניחוש):** `scripts/measure-clap-embedding.mjs`
מריץ `Xenova/clap-htsat-unfused` דרך `@huggingface/transformers`. טעינת מודל
חד-פעמית 8.1 שנ'. עיבוד עצמו: טראק 30 שנ' → 0.32 שנ'; טראק 3.5 דק' (210 שנ')
→ 0.26 שנ'. **הזמן כמעט קבוע בלי קשר לאורך הטראק — זה לא באג, זו התנהגות
ה‑model.** קריאה ב‑`node_modules/@huggingface/transformers/src/models/clap/
feature_extraction_clap.js`: ברירת המחדל `truncation: 'rand_trunc'` — טראק
ארוך מ‑`nb_max_samples` (החלון הקבוע של CLAP-HTSAT, סדר גודל 10 שנ') נחתך
ל‑**קטע אקראי אחד** באורך החלון, והשאר נזרק. המודל לא "שומע" את השיר כולו,
רק פיסה קצרה ואקראית ממנו — בניגוד לקלאסי (M1, Meyda) שממצע על פני הקובץ
השלם. זה לא רק הבדל מהירות (CLAP מהיר משמעותית מהקלאסי לטראקים ארוכים,
כי הוא תמיד מעבד כמות קבועה) — זה **סיכון איכות אמיתי**: שתי גרסאות רימיקס
עם אותה פתיחה שקטה ופיתוח שונה לגמרי עשויות לצאת "דומות" כי המקטע האקראי
נפל על אותו חלק, ולהפך. שאלת שלום (`AskUserQuestion`) חייבת לכלול את זה,
לא רק את שני המספרים.

הפלאן הזה מפרט **Milestone 1 במלואו**. 2‑3 מפורטים ברמת קבצים/אחריות, לא
שורה-שורה — הם תלויים בתוצאה של 1 (במיוחד 2, שהמספר שהוא מפיק קובע אם בכלל
נכתב קוד production בשבילו).

---

## 1. הארכיטקטורה הקיימת והזרימה הרלוונטית

`queueLibraryAnalysis` (`src/platform/source-fsaccess/library.ts:353-427`) הוא
התור היחיד שכבר מריץ ניתוח כבד ברקע על כל טראק. לכל טראק: קורא בייטים →
`hashBytes` → `analysisCache.get(contentHash)` → אם miss: `engine.decode(data)`
(שורה 386, ה‑decode היקר) → `pcmFromAudioBuffer(buffer)` → `analyzerWorker.analyze(pcm)`
(שורה 387, ב‑Worker נפרד) → `analysisCache.put(contentHash, analysis)`. ה‑PCM
המפוענח כבר קיים בזיכרון בדיוק ברגע הזה — זו נקודת החיבור הטבעית להוספת embedding,
בלי decode שני.

`AnalysisCache` (`core/ports/analyzer.ts:40-43`) ו‑`resolveCacheEntry`
(`core/analysis-cache.ts:24-31`) הם התבנית להעתיק: `get`/`put` טהורים ב‑port,
ה‑IO ב‑`platform/analyze-cache-idb/store.ts` (IndexedDB דרך `idb-keyval`, מפתח
`soundgrid:analysisCache:<hash>`), מדיניות הרעננות (`analyzerVersion !== current`
→ miss) טהורה ונבדקת ב‑`tests/core/analysis-cache.test.ts` בלי IndexedDB אמיתי.
`ANALYZER_VERSION` (`platform/analyze-cache-idb/version.ts`) הוא הקבוע היחיד
שצריך העלאה ידנית כשההיגיון משתנה.

`analyzerWorker` (`platform/analyzer-worker/index.ts`) מדגים את תבנית ה‑Worker:
`?worker` import (לא `new Worker(new URL(...))` — נכשל שקט ב‑`vite build`,
`tests/repo/worker-import-syntax.test.ts` תופס את זה), נפילה ל‑main thread כש‑
`detectCapabilities().webWorker` הוא false, request/response עם `id` למיפוי תשובות.

## 2. הפרוסה הדקה מקצה-לקצה (Milestone 1)

טראק חדש נסרק → embedding מחושב פעם אחת מה‑PCM שכבר פוענח לצורך הניתוח הרגיל →
נשמר ב‑cache חדש לפי `(contentHash, modelId)` → פונקציית `rankBySimilarity` טהורה
ב‑`core/` מקבלת embedding של seed + מפת embeddings + מטא-דאטה קיים ומחזירה 10
תוצאות מדורגות. שום UI עדיין לא קורא לזה — האימות הוא vitest + script ידני מול
ספריית שלום (סעיף 6), בדיוק כמו ש‑`AnalysisCache`/`Analyzer` נבנו לפני שהיה להם
צרכן ב‑UI.

## 3. קבצים — Milestone 1

**חדש: `src/core/ports/embedder.ts`**
```ts
import type { PcmData } from '@/core/ports/analyzer'

export interface Embedder {
  readonly modelId: string
  embed(pcm: PcmData): Promise<Float32Array>
}
export interface EmbeddingCache {
  get(contentHash: string, modelId: string): Promise<Float32Array | null>
  put(contentHash: string, modelId: string, vector: Float32Array): Promise<void>
}
```
מייבא `PcmData` מ‑`core/ports/analyzer.ts` במקום לשכפל את הטיפוס — אותו קלט בדיוק
שה‑`Analyzer` הקיים כבר מקבל. שום ייבוא מ‑`@huggingface/transformers`/`essentia.js`
כאן — הפורט לא יודע איזה מימוש רץ מאחוריו.

**חדש: `src/core/embedding-search.ts`** — המתמטיקה הטהורה, ללא IO:
```ts
export function cosineSimilarity(a: Float32Array, b: Float32Array): number
export interface SimilarityCandidate {
  contentHash: string
  embedding: Float32Array
  bpm: number | null
  genre: string | null
}
export function rankBySimilarity(
  seed: SimilarityCandidate,
  candidates: SimilarityCandidate[],
  opts?: { limit?: number },
): { contentHash: string; score: number }[]
```
`rankBySimilarity` הוא cosine בלבד ב‑Milestone 1 (בלי בלנדינג היברידי BPM/genre
עדיין — QA-expert ביקש שהקריטריון ייבדק קודם על cosine נקי, ורק אז נחליט אם
בלנדינג משפר או מזיק; להוסיף כפרמטר אופציונלי כשיש נתון אמיתי לבדוק מולו, לא
כניחוש מראש). זורק על `seed.embedding.length !== candidate.embedding.length`
(מודלים שונים לא ברי-השוואה — נכשל בקול, לא מחזיר דירוג שקרי).

**חדש: `src/platform/embed-cache-idb/version.ts`** — `export const EMBEDDER_VERSION = 1`,
בדיוק כמו `analyze-cache-idb/version.ts`, לגרסת המימוש הקלאסי (לא ה‑modelId —
`modelId` כבר מבדיל בין Essentia למודל CLAP עתידי; הגרסה הזו קולטת שינוי
בהיגיון החילוץ עצמו בתוך אותו מודל, למשל תיקון פרמטרים ל‑MFCC).

**חדש: `src/core/embedding-cache.ts`** — מקביל ל‑`core/analysis-cache.ts`:
```ts
export interface StoredEmbeddingEntry {
  contentHash: string; modelId: string; embedderVersion: number
  vector: Float32Array; cachedAt: number
}
export function resolveEmbeddingEntry(
  stored: StoredEmbeddingEntry | undefined, modelId: string, currentVersion: number,
): Float32Array | null
```
Miss אם `modelId` לא תואם **או** `embedderVersion` לא תואם — שני תנאים, לא אחד,
כי שדרוג מודל (M2) ותיקון היגיון בתוך אותו מודל הם שני אירועים שונים שצריכים
שניהם לפסול cache.

**חדש: `src/platform/embed-cache-idb/store.ts`** — עותק מבני של
`analyze-cache-idb/store.ts`: `idb-keyval`, מפתח
`` `soundgrid:embeddingCache:${modelId}:${contentHash}` `` (modelId בתוך המפתח
עצמו, לא רק שדה בערך — כך ששדרוג מודל הוא namespace חדש לגמרי ברמת האחסון,
תואם החלטה 3 ב‑spec: ערכים ישנים נשארים כפי שהם, בלי מחיקה גורפת). `Float32Array`
עובר דרך `idb-keyval` בסדר (structured clone תומך בו), אין צורך בסריאליזציה ידנית.

**חדש: `src/platform/embed-classical/analyze.ts`** — `essentia.js`
(תלות חדשה, `npm install essentia.js`) בונה MFCC/chroma מ‑`PcmData`, ממוצע-זמן
לוקטור יחיד. פונקציה טהורה `computeEmbedding(pcm: PcmData): Promise<Float32Array>`
— מבודדת מה‑Worker כדי שהלוגיקה עצמה תיבדק (עם קלט סינתטי) בלי Worker אמיתי,
באותה חלוקה בדיוק כמו `analyzer-js/analyze.ts` מול `analyzer-worker/`.

**חדש: `src/platform/embed-classical/worker.ts` + `protocol.ts` + `index.ts`**
— מעתיק את תבנית `analyzer-worker/` שורה-שורה (`?worker` import, request/response
עם `id`, נפילה ל‑main thread כש‑`!detectCapabilities().webWorker`). Worker
**נפרד** מ‑`analyzer-worker` — Essentia.js הוא WASM module נוסף שאין סיבה
לטעון לתוך ה‑Worker הקיים למי שרק צריך BPM/waveform. `index.ts` חושף:
```ts
export const classicalEmbedder: Embedder = {
  modelId: 'essentia-mfcc-v1',
  async embed(pcm) { /* ... */ },
}
```

**עריכה: `src/platform/source-fsaccess/library.ts`** — בתוך `queueLibraryAnalysis`,
מיד אחרי שורה 387 (`analysis = await analyzerWorker.analyze(...)`) ולפני
`analysisCache.put` (שורה 388), **רק בענף cache-miss** (ה‑PCM כבר מפוענח ובזיכרון
שם, לא צריך decode שני):
```ts
const embeddingKey = { contentHash, modelId: classicalEmbedder.modelId }
if (!(await embeddingCache.get(embeddingKey.contentHash, embeddingKey.modelId))) {
  try {
    const vector = await classicalEmbedder.embed(pcm)
    await embeddingCache.put(embeddingKey.contentHash, embeddingKey.modelId, vector)
  } catch {
    // Milestone 1: כשל embedding לא מפיל את שאר הניתוח (BPM/waveform כבר
    // הצליחו) — לא נזרק, לא הופך את הטראק ל‑analysisState:'failed'. חשיפה
    // ב‑UI (badge "N נכשלו לדמיון" נפרד) היא M3, לא כאן.
  }
}
```
בכוונה **לא** בענף cache-hit של הניתוח הרגיל — טראק שכבר נותח לפני v0.8.5
(analysis cache hit) לא עובר decode מחדש היום; אילוץ decode רק כדי לחשב embedding
עליו הוא עבודה נוספת אמיתית שלא הייתה קיימת, ושייכת ל‑M3 (סריקת רקע נפרדת
לספרייה קיימת), לא ל‑M1. M1 מכסה רק טראקים שעוברים ניתוח מלא בכל מקרה.

## 4. שינויי API/טיפוסים והתנהגות כשל

- `Embedder.embed` דוחה (reject) על כשל — לא מחזיר `null`/וקטור ריק. הקורא
  (`queueLibraryAnalysis`) בולע ב‑M1 (סעיף 3 למעלה); M3 יחליט אם/איך זה מוצג.
- `rankBySimilarity` זורק `Error` על אורך embedding לא-תואם בין seed למועמד —
  לא מסנן אותם בשקט, כי זה סימן לבאג אמיתי (שני מודלים שונים הושוו), לא למקרה
  קצה נורמלי.
- `resolveEmbeddingEntry` תמיד מחזיר `null` על אי-התאמה (מודל **או** גרסה) —
  לעולם לא זורק, מראה `core/analysis-cache.ts` הקיים.
- אין שינוי לטיפוס `Track` (`core/types.ts`) ב‑M1 — שדה UI-facing חדש (סוג
  מצב embedding לתצוגה) הוא M3.

## 5. מודל מצב UI ותלויות נתונים

אין UI ב‑M1 (ר' §2). M3 יצטרך: שדה חדש על `Track` (למשל `embeddingState?:
'queued'|'embedding'|'embedded'|'failed'`, אותה תבנית בדיוק כמו `analysisState`,
`core/types.ts:40`), badge בכותרת שמרחיב את `queuedTotal`/`analysisFailedTotal`
(`Library.tsx:710-725`), וכפתור לכל שורה ליד `aria-label="Load to deck ${deck}"`
(`Library.tsx:1256`) שמנוטרל כש‑`embeddingState !== 'embedded'` עם `title`
מסביר (החלטת שלום — לא סמל שעון נפרד).

## 6. טסטים — בזול ביותר האפשרי

**`tests/core/embedding-search.test.ts`** (חדש, לפי תבנית
`tests/core/analysis-cache.test.ts`): `cosineSimilarity` על וקטורים זהים (=1),
מנוגדים (=‑1), ניצבים (=0); `rankBySimilarity` מחזיר סדר נכון על 3-5 מועמדים
מוכתבים; זורק על אי-התאמת אורך.

**`tests/core/embedding-cache.test.ts`** (חדש, מעתיק מבנית את
`analysis-cache.test.ts`): `resolveEmbeddingEntry` — `undefined` → null,
model+version תואמים → הוקטור, model לא תואם → null, version לא תואמת → null.

שני קבצי הטסט האלה הם לוגיקה טהורה — בדיוק כמו `analysis-cache.test.ts` — ורצים
היום ב‑`npm test`, בלי Essentia.js, בלי Worker, בלי ספרייה אמיתית.

**מה שלא ניתן לבדוק אוטומטית (כמו מנוע האודיו/הספרייה, `CLAUDE.md`):** האם
Essentia.js אכן מפיק embedding שמשקף דמיון אמיתי, וכמה זמן זה לוקח על קובץ
אמיתי. זה נמדד, לא מנוחש — script Node קטן (תבנית v0.1.7): טוען N טראקים
אמיתיים מספריית שלום (או, בקונטיינר מרוחק, קבצי בדיקה סינתטיים כתחליף גס
ומתועד ככזה — בדיוק כמו שההערה ב‑`platform/ai-local/index.ts` מתעדת אימות
דו-שלבי), מריץ `classicalEmbedder.embed` על כל אחד, כותב זמן-לטראק וזמן-סה"כ.
מספרים ב‑`docs/handoff/v0.8.5.md` בסיום, לא "זה עבד".

## 7. סיכונים, נסיגה, ו-non-goals מכוונים

- **סיכון:** Essentia.js כספריית WASM עלולה להתנגש עם `?worker` import syntax
  (`worker-import-syntax.test.ts` כבר תופס תבנית שגויה — לוודא שהבנייה עוברת
  `vite build` אמיתי, לא רק `npm run dev`, לפני commit — בדיוק המלכודת
  שתועדה ב‑`platform/ai-local/index.ts`).
- **סיכון:** גודל חבילת Essentia.js (WASM) על bundle size — לבדוק
  `npm run build` ולוודא שהיא נטענת lazy (רק כש‑`classicalEmbedder.embed`
  נקרא לראשונה), לא בבנדל הראשי.
- **נסיגה:** כל קובץ ב‑M1 הוא תוספת נטו (פורט חדש, cache חדש, קובץ core חדש) —
  מלבד השינוי הזעיר ל‑`queueLibraryAnalysis` (סעיף 3), שעטוף ב‑try/catch שלא
  יכול לשבור ניתוח קיים. הסרת M1 שלמה = מחיקת הקבצים החדשים + הפיכת אותו
  שינוי ל‑library.ts.
- **Non-goals מכוונים ל‑M1** (מה‑spec, לא נפתח מחדש כאן): שום UI, שום CLAP,
  שום בלנדינג היברידי BPM/genre בדירוג (cosine נקי בלבד), שום סריקה מחדש
  של טראקים שכבר נותחו לפני v0.8.5.

## 8. סדר מימוש עם אימות אחרי כל צעד

1. `core/ports/embedder.ts` + `core/embedding-search.ts` + `tests/core/embedding-search.test.ts`
   → `npm test` ירוק, אפס תלות ב‑Essentia.js עדיין.
2. `core/embedding-cache.ts` + `tests/core/embedding-cache.test.ts`
   → `npm test` ירוק.
3. `npm install essentia.js`, `platform/embed-classical/analyze.ts`
   → סמוק-טסט ידני (Node script קטן, PCM סינתטי) שמוודא שווקטור אמיתי (לא
   NaN, לא אפסים) חוזר.
4. `platform/embed-classical/worker.ts`+`protocol.ts`+`index.ts`
   → `npm run build` (לא רק `npm run dev`) בודק שה‑Worker נבנה תקין.
5. `platform/embed-cache-idb/version.ts`+`store.ts`
   → סמוק-טסט ידני: put/get דרך IndexedDB אמיתי (בדפדפן/Playwright).
6. חיווט ל‑`queueLibraryAnalysis` (סעיף 3)
   → מריצים סריקת ספרייה אמיתית (או תיקיית טסט) ומוודאים ב‑`read_console_messages`
   שאין שגיאות חדשות ושה‑embedding cache מתמלא (בדיקה ידנית ב‑DevTools/IndexedDB).
7. `npm run check` מלא ירוק (חוץ מ‑8 הכשלים הידועים הלא-קשורים ב‑`doc-commits.test.ts`).
8. script המדידה (סעיף 6 למעלה) רץ, מספרים נכתבים — זה שער היציאה מ‑M1,
   לא commit נוסף.
9. עצירה ודיווח לשלום עם המספרים, לפני שממשיכים ל‑M2 (מדידת CLAP) —
   המספר מ‑M1 עצמו רלוונטי להחלטה אם בכלל שווה למדוד CLAP בקרוב או שהקלאסי
   כבר "מספיק טוב" ולדחות את כל עניין ה‑AI קדימה.

---

# Milestone 3 — UI + backfill (15/09)

M2 בוצע ונסגר: CLAP נמדד בפועל על מחשב שלום (`HANDOFF.md`, 8.1 שנ' טעינה +
~0.3 שנ'/טראק — אבל `truncation:'rand_trunc'` חותך קטע אקראי קבוע, לא מנתח
את כל השיר) ונגנז לשימוש הזה. **קלאסי בלבד, ללא דגל** — `embed-clap/` לא
נבנה. M3 הוא מה שנשאר לפני שv0.8.5 נסגרת.

## 9. פער שהתגלה תוך כדי תכנון M3

M1 מחשב embedding **רק על cache-miss של הניתוח** (`library.ts:387`,
`if (!analysis)`) — טראק שכבר נותח לפני v0.8.5 (כל הספרייה האמיתית של שלום,
בפועל) אף פעם לא עובר את הענף הזה, ולעולם לא מקבל embedding בטעינה רגילה.
בלי מנגנון backfill, "מצא דומה" יראה כמעט כל טראק כ"לא נבדק" לצמיתות. **הוחלט
מול שלום (15/09): backfill רץ אוטומטית ברקע, לבד, מיד אחרי שהסריקה הרגילה
(`applyAnalysisQueue`) מסיימת** — לא ידני, לא דגל, לא חוסם שום דבר אחר.

## 10. מודל טיפוסים

**עריכה: `src/core/types.ts`** — על `Track` (ליד `analysisState`, שורה ~40):
```ts
embedding?: Float32Array
embeddingState?: 'queued' | 'embedding' | 'embedded' | 'failed'
embeddingError?: string
```
`embedding` יושב ישירות על ה‑Track בזיכרון (לא נקרא מה‑cache בכל render) —
הווקטור קטן מספיק (25 floats = 100 בייט, `CLASSICAL_EMBEDDING_LENGTH`) שאין
סיבה הנדסית לבנות שכבת "bulk read מה‑IndexedDB" נפרדת; אותו דפוס בדיוק כמו
`bpm`/`durationSec` שכבר מועתקים מהניתוח אל ה‑Track (`library.ts:422-423`).
`Track[]` עצמו לא persisted (נבנה מחדש בכל סריקה) אז אין בעיית סריאליזציה.

## 11. קבצים — Milestone 3

**עריכה: `src/platform/source-fsaccess/library.ts`** —
- בענף cache-**hit** של הניתוח (`if (!analysis)` false, שורה ~386), שהיום
  לא נוגע ב‑embedding בכלל: לבדוק `embeddingCache.get(contentHash,
  classicalEmbedder.modelId)` ולכלול `embedding`/`embeddingState:'embedded'`
  בפאץ' הסופי אם קיים (טראק שכבר קיבל embedding בהרצה קודמת, אבל ה‑Track
  בזיכרון עדיין לא יודע את זה בטעינה הזאת).
- בענף cache-**miss** (שורה 398-405, שכבר מחשב embedding): לשמור את
  `vector` (לא רק ל‑cache — גם) ולכלול אותו + `embeddingState:'embedded'`
  בפאץ' הסופי; ב‑`catch` הקיים (שורה 402) לכלול `embeddingState:'failed'`
  במקום לבלוע בשקט (M1 כתב "אין חשיפת UI עדיין, זה M3" — זה עכשיו).
- **פונקציה חדשה, מיוצאת: `queueEmbeddingBackfill(tracks, onUpdate, opts)`**
  — אותו מבנה worker-pool בדיוק כמו `queueLibraryAnalysis`, אבל: פועלת רק
  על טראקים עם `analysisState === 'analyzed'` **וללא** `embedding` עדיין;
  `concurrency` נמוך בכוונה (1, לא 2 כמו הניתוח הראשי — זו עבודה ברקע,
  לא לתחרות על משאבים עם שום דבר אחר שרץ); לכל טראק: `getFile` →
  `arrayBuffer` → `engine.decode` → `classicalEmbedder.embed` → `put` ל‑cache
  → פאץ' `{embedding, embeddingState:'embedded'}` או `{embeddingState:'failed'}`
  בכשל. אין ניתוח BPM/waveform חוזר — זה כבר קיים, המטרה היחידה כאן היא
  ה‑embedding החסר.

**עריכה: `src/core/embedding-search.ts`** — פונקציה טהורה חדשה, מעל
`rankBySimilarity` הקיים:
```ts
export function findSimilarTracks(
  seedId: string,
  tracks: Track[],
  opts: { limit?: number } = {},
): SimilarityMatch[]
```
בונה `SimilarityCandidate[]` מ‑`tracks` (מסנן טראקים בלי `embedding`/
`contentHash`), מוצא את ה‑seed לפי `id` (לא `contentHash` — זה מה שה‑UI
מחזיק), מחזיר `[]` (לא זורק) אם ה‑seed עצמו חסר embedding. מיובא ישירות
מ‑`Library.tsx` — לוגיקה טהורה שנבדקת בלי React, אותו עיקרון בדיוק כמו
`core/recommend.ts`'s `mixRecommendations`.

**עריכה: `src/app/components/Library.tsx`** —
- `const [similarTo, setSimilarTo] = useState<string | null>(null)` — אותו
  דפוס בדיוק כמו `mixOnly` הקיים (state מקומי, לא ב‑store).
- בשני מקומות הקריאה ל‑`Promise.all([applyTags(queued, scan),
  applyAnalysisQueue(queued, scan)])` (שורות 357, 405): אחרי ה‑`await`,
  `void applyEmbeddingBackfill(queued, scan)` — **לא** בתוך אותו `Promise.all`
  (חייב לרוץ אחרי שהסריקה הרגילה מסתיימת, לא במקביל אליה) ו‑**לא** מחכים
  לו (רקע אמיתי — מצב "הסריקה הסתיימה" לא תלוי בו).
- כפתור שורה חדש ליד `aria-label="Load to deck ${deck}"` (שורה ~1256):
  `disabled={!track.embedding}`, `title` דינמי ("Find similar tracks" /
  "Not yet analyzed for similarity"). לא תפריט קליק-ימני, לא פאנל שני —
  לחיצה קוראת ל‑`setSimilarTo(track.id)`.
- סינון: כש‑`similarTo` לא null, `list` (שורה ~527) מסונן/ממוין לפי
  `findSimilarTracks(similarTo, library.tracks)` במקום ל‑`preMixList` הרגיל
  — אותו מקום בדיוק שבו `mixOnly` כבר מסנן היום, לא לוגיקה מקבילה.
- צ'יפ פעיל "דומה ל: <שם> ×" ליד תיבת החיפוש (אותו אזור כמו ה‑badges
  הקיימים, ~שורה 650) — `onClick` מנקה ל‑`setSimilarTo(null)`.
- Badge חדש בכותרת (מרחיב את איזור ה‑badges, ~שורה 710-725): בזמן שה‑backfill
  רץ, "N analyzing for similarity" (אותו סגנון בדיוק כמו `queuedTotal`) —
  **שם נפרד** מ"queued" הרגיל, כדי לא לבלבל בין שני התורים (הניתוח הרגיל
  כבר הסתיים בשלב הזה; זה תור שני, איטי יותר, רץ אחריו).
- **אין סף מלאכותי להסתרת הכפתור** (למשל "רק אם 50+ טראקים") — הכפתור
  מנוטרל per-row לפי `!track.embedding` בכל מקרה; אין צורך בסף נפרד כשה‑UI
  כבר אומר "עדיין לא נבדק" בכל מקרה שאין מה להשוות אליו.

## 12. טסטים

**`tests/core/embedding-search.test.ts`** (מרחיב את הקובץ הקיים מ‑M1):
`findSimilarTracks` — מסנן טראקים בלי `embedding`; מסנן טראקים בלי
`contentHash`; מחזיר `[]` כש‑seed עצמו חסר embedding; מחזיר `[]` כש‑seed
לא נמצא ברשימה; סדר נכון על 3-5 טראקים מוכתבים (מעתיק את `rankBySimilarity`
הקיים, לא לוגיקה כפולה).

**מה שלא ניתן לבדוק אוטומטית:** חיווט ה‑UI ב‑`Library.tsx` (`tests/core/`
אין לו React) — אימות ידני: לטעון ספרייה אמיתית, לוודא שה‑backfill רץ אחרי
הסריקה (badge מופיע, נעלם כשמסתיים), ללחוץ "מצא דומה" על טראק אחרי backfill,
לוודא שהתוצאות הגיוניות (לפי הקריטריון המדיד מה‑spec: ≥7/10 חולקות ז'אנר
או BPM ±8%, על 5 טראקים מ‑3+ ז'אנרים).

## 13. סיכונים, נסיגה, non-goals

- **סיכון:** backfill מפענח כל טראק מחדש (decode) — עבודת CPU אמיתית על
  ספרייה גדולה, פעם אחת. `concurrency:1` ממתן, ולא חוסם שום דבר (מריץ אחרי
  הסריקה). אם זה עדיין מורגש כבד מדי בפועל אצל שלום — לדווח, לא לנחש מראש.
- **סיכון:** שני עדכוני state נפרדים (`applyAnalysisQueue` ואז
  `applyEmbeddingBackfill`) על אותו `library.tracks` — לוודא שהמיזוג (כמו
  ב‑שורה 490-503) לא דורס שדות שנכתבו בינתיים מה‑backfill; אותו דפוס
  "existing wins" קיים כבר, לא היגיון חדש.
- **נסיגה:** כל שינוי הוא תוספת (שדות אופציונליים חדשים, פונקציה חדשה,
  UI חדש) חוץ מהעריכה לענפי ה‑cache הקיימים ב‑`library.ts` — הסרה מלאה =
  מחיקת הקבצים/הבלוקים החדשים.
- **Non-goals (מה‑spec המקורי, לא נפתח מחדש):** שום אחוז דמיון מספרי; שום
  חיפוש טקסט חופשי (רק "more like this" מטראק נבחר); שום blending היברידי
  BPM/genre בדירוג (cosine נקי, כמו M1).

## 14. סדר מימוש עם אימות אחרי כל צעד

1. `core/types.ts` (שדות) + `core/embedding-search.ts` (`findSimilarTracks`)
   + טסטים → `npm test` ירוק.
2. `library.ts`: תיקון ענף cache-hit + cache-miss (סעיף 11) → סריקה חוזרת
   על ספרייה/תיקייה שכבר נותחה, לוודא ב‑DevTools/IndexedDB שטראקים ישנים
   מקבלים `embedding` בלי decode מחדש (ה‑cache כבר קיים מ‑M1 אצל חלקם).
3. `library.ts`: `queueEmbeddingBackfill` → סמוק-טסט ידני על תיקייה עם
   טראקים "ישנים" (נותחו לפני v0.8.5): מוודאים שרץ, ממלא embeddings, לא
   חוסם את שאר האפליקציה תוך כדי ריצה.
4. `Library.tsx`: חיווט הקריאה ל‑backfill + badge → `read_console_messages`
   ללא שגיאות חדשות, badge מופיע/נעלם נכון.
5. `Library.tsx`: כפתור שורה + סינון + צ'יפ → בדיקה ידנית מלאה: טראק לא-מנותח
   = כפתור אפור עם tooltip; לחיצה על טראק מנותח מסננת לתוצאות; צ'יפ מנקה.
6. `npm run check` מלא ירוק (חוץ מ‑8 הכשלים הידועים).
7. אימות מול הקריטריון המדיד של qa-expert (סעיף 12 למעלה) על ספריית שלום.
8. עצירה ודיווח לשלום עם התוצאה — זה שער היציאה מ‑M3, וגם סגירת v0.8.5
   כולה. `ROADMAP.md`/`HANDOFF.md` מסומנים ✅ + בלוק עובר ל‑`docs/handoff/
   v0.8.5.md` רק בשלב הזה.
