# PLAN — v0.8.1: Crates

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר מול שלום, 12/09). המסמך
הזה הוא ה"איך" — קובץ-אחרי-קובץ — ולא חוזר על שום החלטת מוצר מה‑spec.

## 1. הארכיטקטורה הקיימת והזרימה הרלוונטית

**גרירה, כבר קיימת:** `Library.tsx:996-1019` — כל `<tr draggable>` שם
`dataTransfer.setData('application/x-soundgrid-track', track.id)`
ב‑`onDragStart`. שני צרכנים קיימים: `Deck.tsx:113-122` (`onDragOver` בודק
`e.dataTransfer.types.includes(TRACK_MIME)`, `onDrop` קורא `getData`,
מוצא את הטראק ב‑`useStore.getState().library.tracks`, קורא
`ctl.loadTrackToDeck`) ו‑`PadGrid.tsx` (אותו דפוס, יעד ספציפי יותר בתוך
`Deck.tsx` — `closest('[data-drop-zone="sampler"]')` קובע מי מהשניים
מטפל בכל drop). crate יהיה יעד שלישי, עצמאי, לא בתוך `Deck.tsx`.

**hash-על-פי-דרישה, כבר קיים, לא לולאת patch:** `controls.ts:2579-2605`
(`setTrackGenre`/`persistGenreOverride`) ו‑`2612-2638`
(`setTrackNote`/`persistTrackNote`) הן שתי הדוגמאות הקיימות ל"פעולת
משתמש על טראק שאולי אין לו `contentHash` עדיין": עדכון אופטימי מיידי של
הסטור, ואז קריאה אסינכרונית (`void ...catch(...)`) שבודקת `track.contentHash`,
ואם חסר — `hashFile(track.handle)` על‑אתר, פאץ' לסטור, ואז persist
לפי ה‑hash. כישלון מוצג ב‑`setNotice({tone:'warn', source:'library'})`.
`addTrackToCrate` הולכת בדיוק באותה תבנית — לא לולאת patch נפרדת (תיקון
ל‑spec אחרי קריאת הקוד, ר' `FEATURE_SPEC.md`).

**חנות תואמת:** `platform/track-meta-idb/store.ts` — `idb-keyval` מפתח
אחד, `Record<contentHash, T>`, getter שלא זורק (Map ריקה בכישלון),
setter שכן זורק, merge (לא replace) על מה שכבר קיים. `crates-idb/store.ts`
הולכת באותה תבנית בדיוק.

**סינון, כבר קיים:** `core/library-search.ts`'s `matchesQuery(track,
rawQuery): boolean` — פונקציה טהורה, טווח BPM + טקסט חופשי. crate חכם
שומר `rawQuery` כמו שהוא ומריץ את אותה פונקציה ללא שינוי.

**עיצוב-נאב תואם:** `Settings.tsx:23-30,51-65` — `GROUPS` כמערך
`{id,label}`, `useState` לנבחר, `bg-surface-3` לנבחר / `hover:bg-surface-2`
לא-נבחר, `rounded-[var(--radius-sm)] px-2.5 py-1 text-xs`. הרכיב החדש
משתמש באותם טוקנים, לא ממציא צבעים.

**באדג' "לא-שקט", כבר קיים:** `Library.tsx:633-692` — `bg-surface-2
px-1.5 py-0.5 text-2xs font-semibold text-warn` + `title` tooltip, לכל
אחד מ‑skipped/unreadable/unrecognized-genre/queued/analysis-failed.
staleness של crate חכם ותג "לא נמצא" על חבר-crate משתמשים באותה תבנית.

**אין דיאלוג אישור קיים בכלל באפליקציה** (נבדק: אין `confirm(`, אין
`ConfirmDialog`). מחיקת crate היא הפעולה ההרסנית הראשונה שדורשת אחת —
הבחירה: `window.confirm()` הדפדפני, לא רכיב מודאל חדש. פעולה חד-פעמית,
לא שווה תשתית UI חדשה בשביל כפתור אחד.

## 2. הפרוסה הדקה מקצה-לקצה

יצירת crate ידני → גרירת טראק אליו מהטבלה → הצגתו ברשימה עם ספירת חברים
→ מחיקתו (עם אישור). זה מוכיח: החנות, ה‑controls action, יעד ה‑drop,
וה‑UI — בלי לגעת עדיין ב‑crate חכם. crate חכם (שמירת שאילתה + רענון) הוא
השלב השני, נבנה על אותה חנות.

## 3. קבצים — מה משתנה ולמה

### חדש: `src/platform/crates-idb/store.ts`

```ts
export interface CrateRecord {
  id: string
  name: string
  kind: 'manual' | 'smart'
  members?: string[]      // contentHash[], ידני בלבד, בלי כפילויות
  query?: string           // חכם בלבד — אותה מחרוזת שהחיפוש כבר מבין
  materialized?: string[]  // contentHash[], חכם בלבד — תמונת-מצב מהרענון האחרון
  refreshedAt?: number     // חכם בלבד — חותמת הרענון האחרון, לחישוב staleness (ר' סעיף 5)
}
```

`getCrates(): Promise<Map<string, CrateRecord>>` — לא זורק לעולם (Map
ריקה בכישלון). `saveCrate(record): Promise<void>` — זורק בכישלון,
מתמזג על מה שכבר קיים (כמו `set(KEY, {...stored, [id]: record})`).
`deleteCrateRecord(id): Promise<void>` — זורק בכישלון, מוחק מפתח יחיד
מתוך האובייקט המאוחסן. שלוש פונקציות, לא יותר — כל הלוגיקה העסקית
(איך בונים `CrateRecord` חדש, מיזוג members) יושבת ב‑`controls.ts`, לא
כאן, כמו שכל שאר החנויות עושות.

### חדש: `src/app/components/CratesRail.tsx`

רכיב UI טהור: מציג את `useStore().crates` (רשימה שטוחה), כפתור "+ New
crate" (prompt-style שם, כמו שאין דיאלוג קיים באפליקציה — `window.prompt`
לשם, עקבי עם הבחירה ב‑`window.confirm` למחיקה), drop target לכל שורת
crate ידני (`onDragOver`/`onDrop` על `application/x-soundgrid-track`,
בדיוק כמו `Deck.tsx:113-122`), כפתור מחיקה (עם `window.confirm`), וכפתור
רענון + באדג' staleness לכל crate חכם. אין state עסקי כאן — הכל נקרא
מה‑store וכל פעולה קוראת ל‑`ctl.*`.

### עריכה: `src/app/components/Library.tsx`

- ייבוא `CratesRail`.
- שורות 531-734 (בערך): עוטפים את ה‑`<div ref={containerRef}>` הקיים
  ב‑`<div className="flex min-h-0 flex-1">` חדש, עם `<CratesRail />`
  כאח ראשון (רכס בצד, לא שורה שנייה למעלה — התקציב האנכי כבר כמעט
  מנוצל). שינוי מבני קטן, אין נגיעה בפנים ה‑`<table>` עצמו.
- הוספת "not found" marker: כל שורת חבר-crate בתוך `CratesRail` בודקת
  אם ה‑`contentHash` שלה קיים ב‑`library.tracks` הנוכחי; אם לא — מסומנת.
  זו בדיקה בתוך `CratesRail`, לא שינוי ל‑`Library.tsx` עצמו.

### עריכה: `src/app/state/store.ts`

הוספת `crates: Map<string, CrateRecord>` לסטור (סריאלייזבילי — Map של
אובייקטים פשוטים, כמו `library.tracks`), נטען פעם אחת ב‑boot (איפה
שהספרייה עצמה נטענת) מ‑`getCrates()`.

### עריכה: `src/controls.ts`

שבע פונקציות חדשות, כולן עוקבות אחרי התבנית של `setTrackGenre`/
`setTrackNote` (עדכון אופטימי של הסטור, ואז persist אסינכרוני עם
`setNotice` בכישלון):

- `createCrate(name: string)` — מוסיף `CrateRecord` חדש (`kind:'manual'`,
  `members: []`) עם `id` חדש (`crypto.randomUUID()`).
- `renameCrate(id: string, name: string)`.
- `deleteCrate(id: string)` — **הקריאה נעשית רק אחרי `window.confirm`
  ב‑UI** (ב‑`CratesRail.tsx`, לא כאן — `controls.ts` היא הצוואר-בקבוק
  לפעולה, לא למנגנון האישור).
- `addTrackToCrate(crateId: string, track: Track)` — אם `track.contentHash`
  קיים, מוסיף אותו ל‑`members`; אם לא, עוקבת אחרי `persistGenreOverride`'s
  תבנית בדיוק: `hashFile` על-אתר, פאץ' `contentHash` לטראק בסטור, ואז
  מוסיפה את ה‑hash. Idempotent — `members` הוא סט מבחינה לוגית (בדיקת
  `includes` לפני push), גרירה כפולה היא no-op גלוי (אין שינוי בממשק,
  ולא כפילות בחנות).
- `removeTrackFromCrate(crateId: string, hash: string)`.
- `createSmartCrate(name: string, query: string)` — `kind:'smart'`,
  `query`, `materialized: []` (ריק עד רענון ראשון — לא ממלא אוטומטית
  ביצירה, עקבי עם "רק בלחיצה").
- `refreshSmartCrate(crateId: string)` — קורא ל‑`matchesQuery` על
  `library.tracks` הנוכחי עם ה‑`query` השמור, כותב את התוצאה (רשימת
  `contentHash`) ל‑`materialized`, ומעדכן חותמת-זמן `refreshedAt` (כדי
  ש‑`CratesRail` תדע אם stale — ר' סעיף 5).

### אין שינוי ב‑`core/`

אין `CrateRecord`/`FilterRule` חדש שם — הנתונים משרתים חנות אחת ורכיב
UI אחד, בדיוק כמו ל‑genre overrides. `matchesQuery` נשארת כמו שהיא.

## 4. שינויי API/טיפוסים והתנהגות כישלון

- `CrateRecord` (חדש, ב‑`platform/crates-idb/store.ts` — לא `core/types.ts`,
  ר' סעיף 3).
- כל שבע הפעולות ב‑`controls.ts` הן `void`-מוחזרות (לא `Promise` שהקורא
  מחכה לו) — עדכון הסטור מיידי, persist ברקע. כישלון persist בכל אחת
  מהן → `setNotice({tone:'warn', source:'library', text: '...applied
  but not saved: <error>'})`, אותה מחרוזת-דפוס כמו genre/note.
- `deleteCrateRecord`/`saveCrate` (ב‑store.ts) זורקות; `getCrates` לא
  זורקת לעולם — אותו חוזה בדיוק כמו `track-meta-idb`.

## 5. מודל מצב UI ותלויות נתונים

- `library.tracks` (קיים) — המקור היחיד לאמת על אילו hash-ים "קיימים";
  `CratesRail` משווה מול זה כדי לסמן "לא נמצא".
- `crates: Map<string, CrateRecord>` (חדש בסטור) — נטען ב‑boot, מתעדכן
  אופטימית מכל פעולת `controls.ts`.
- **Staleness של crate חכם:** `refreshedAt` (בתוך `CrateRecord`, סעיף 3)
  מול `library.tracks`'s עדכון אחרון (יש כבר `scanMsg`/מונה שינויים
  מרומז דרך `library.tracks.length` + `analysisState` — הכי פשוט: אם
  `library.tracks` השתנה (reference חדש) אחרי `refreshedAt`, ה‑badge
  מוצג). זה חישוב נגזר ב‑`CratesRail` בזמן רינדור, לא state נשמר בנפרד.
- אין state חדש ב‑`core/` ואין data flow חדש מעבר לסטור הקיים.

## 6. בדיקות בשכבה הזולה ביותר שיש בה משמעות

- **אין `core/` חדש → אין `tests/core/` חדש.** `matchesQuery` כבר
  מכוסה (אם יש לה בדיקה קיימת; אם אין — לא נפתח כאן, מחוץ לתכולה).
- **חנות (`crates-idb/store.ts`):** אין תקדים לבדיקת יחידה על חנויות
  idb-keyval דומות (`track-meta-idb`/`genre-overrides-idb` — אין להן
  קובץ בדיקה ב‑`tests/`) — לא נפתח תקדים חדש כאן; מאומת ידנית דרך
  `javascript_tool` (קריאת מפתח ה‑idb-keyval אחרי קריאה ישירה ל‑
  `ctl.createCrate`/`ctl.addTrackToCrate`, בלי גרירה אמיתית).
- **גרירה עצמה:** לא ניתנת לסימולציה משמעותית ב‑`javascript_tool`
  (אין `DataTransfer` אמיתי בסביבה הזאת) — מאומתת רק ע"י שלום בכרום
  האמיתי שלו, בסוף היחידה, עם הוראות בעברית.
- **`npm run check`** אחרי כל קובץ שנוגע ב‑`core/`/`platform/`
  (dependency-cruiser רגיש לזה) — כאן בעיקר `platform/crates-idb/`
  מול הכללים הקיימים, לא אמור להכשיל כלום (אותה צורה כמו stores קיימים).

## 7. סיכונים, נסיגה, ולא-בתכולה מכוונת

- **סיכון:** `addTrackToCrate`'s hash-על-פי-דרישה מוסיף עוד קורא שלישי
  ל‑`hashFile` על אותו טראק (אחרי genre, note) — אם שלושתם רצים על אותו
  טראק כמעט-בו-זמנית (גרירה + עריכת הערה מהירה), כל אחד עלול לחשב hash
  בנפרד לפני שהראשון סיים לפאץ' את הסטור. השפעה בפועל: עבודה כפולה
  (hashFile רץ פעמיים-שלוש), לא איבוד נתונים — כל קריאה כותבת לאותו
  `contentHash` הסופי. לא נפתר כאן (אותו סיכון קיים כבר בין genre/note,
  לא נולד עם crates) — מתועד כחוב קיים, לא כחדש.
- **נסיגה:** כל שינוי מאחורי `crates: Map` חדש בסטור ורכיב `CratesRail`
  עצמאי — הסרת שני אלה (ועריכת ה‑wrapper ב‑`Library.tsx` חזרה) מחזירה
  את האפליקציה למצב v0.8.0 המדויק, בלי מיגרציה הפוכה (החנות ב‑IndexedDB
  פשוט מפסיקה להיקרא, לא נמחקת).
- **לא בתכולה (חוזר מה‑spec, לא נפתח כאן):** עץ/היררכיה, מנוע כללים
  רב-שדות, מיון ידני בתוך crate, הוספה למקלדת/תפריט, ייצוא/שיתוף.

## 8. סדר ביצוע, עם אימות אחרי כל צעד משמעותי

1. `platform/crates-idb/store.ts` (טיפוס + 3 פונקציות) → `npm run check`.
2. שבע הפעולות ב‑`controls.ts` + `crates` בסטור + טעינה ב‑boot →
   `npm run check`, ואימות ב‑`javascript_tool`: קריאה ל‑`ctl.createCrate`
   ישירות מהקונסולה, בדיקה שה‑idb-keyval מתעדכן.
3. `CratesRail.tsx` (רשימה + יצירה + מחיקה, **בלי** drop target עדיין) →
   מוצג ב‑`Library.tsx`. אימות: הרכיב מופיע, יצירה/מחיקה עובדות ב‑UI.
4. drop target (`onDragOver`/`onDrop` על `CratesRail`'s שורות) →
   `npm run check`. אימות: **שלום** בכרום האמיתי שלו — גרירת טראק
   לתוך crate, ספירת חברים עולה.
5. crate חכם: `createSmartCrate`/`refreshSmartCrate` + UI (כפתור רענון,
   באדג' stale) → אימות: יצירת crate חכם משאילתה קיימת, רענון, בדיקת
   badge אחרי הוספת טראק חדש לספרייה.
6. "לא נמצא" marker + חסימת drop על crate חכם עם הודעה → אימות ידני.
7. `npm run check` מלא, סקירת `change-reviewer`, `HANDOFF.md`+`ROADMAP.md`
   מסומנים ✅, הוראות בדיקה בעברית לשלום, commit + push.
