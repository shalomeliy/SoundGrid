# PLAN — v0.8.0: עמודות ממיינות + חיפוש

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר מול שלום, 09/11). המסמך הזה
הוא ה"איך" — קובץ-אחרי-קובץ — ולא חוזר על שום החלטת מוצר מה-spec.

## 1. הארכיטקטורה הקיימת והזרימה הרלוונטית

`Library.tsx` (748 שורות) הוא רכיב שטוח אחד: טבלת `<table table-fixed>` עם
כותרות קבועות, שורה אחת בלבד ניתנת ללחיצה למיון בפועל (עמודת Key, שמחליפה
musical/Camelot — לא סדר). `list = mixOnly ? preMixList.filter(...) :
preMixList`, כש‑`preMixList = ctl.filteredTracks()` (`controls.ts:2509`) —
היום רק תואם טקסט חופשי מול `path`/`artist`/`title`/`genre`. אין מיון עמודות,
אין וירטואליזציה — `list.map()` (שורה 732) מרנדר כל שורה.

זרימת נתונים: `runScan`/`addFiles` (שתיהן ב‑`Library.tsx`) → `Track[]` דרך
שלושה מעברים (`scanLibrary` → `readLibraryTags` → `queueLibraryAnalysis`,
כולם ב‑`platform/source-fsaccess/library.ts`), כל אחד כותב ל‑
`useStore().library.tracks` דרך `setLibrary`. **דפוס הצד-אחסון הקיים** (מה
שהתשתית החדשה הזו מעתיקה): `genre-overrides-idb/store.ts` — Map פשוט על
`idb-keyval`, מפתח = `contentHash`, getter שלא זורק אף פעם, setter שכן זורק;
מוחל בשני מקומות — `applyGenreOverrides(scan)` בזמן סריקה (רוב הטראקים עוד
בלי hash), ואז שוב בתוך `applyAnalysisQueue` ברגע שכל טראק מקבל hash
(`Library.tsx:426,441-443`) — כי רוב ה‑hash-ים לא קיימים ברגע הסריקה עצמה.

`contentHash` מחושב גם ב‑`controls.ts`'s `loadTrackToDeck` (שורה 236, לפני
`engine.decode`) — הנקודה הקיימת היחידה שבה אפליקציה כבר "יודעת" שטראק עלה
לדק, עם hash כבר בעבודה.

## 2. הפרוסה הדקה מקצה-לקצה המוצעת

לחיצה על כל כותרת עמודה (לא רק Key) ממיינת את הרשימה; חיפוש טווח BPM/סולם
מצטרף לחיפוש הטקסט הקיים; רשימה מוירטואלת גוללת חלק גם על ספרייה גדולה
מהאמיתית של שלום. הערה (`note`) ונוגן-לאחרונה (`lastPlayedAt`) מצטרפים כעמודות
נוספות שניתנות למיון, על אותה תשתית וירטואליזציה+מיון.

## 3. קבצים מדויקים

**חדשים:**

- `src/core/library-sort.ts` — מיון טהור: `type SortKey = 'title'|'artist'|
  'bpm'|'key'|'durationSec'|'note'|'lastPlayedAt'`, `sortTracks(tracks,
  sortKey, sortDir): Track[]`. `undefined`/`null` תמיד בסוף בכל כיוון (טראק
  בלי BPM לא "הכי איטי"). בדיקות יחידה אמיתיות (vitest) — לוגיקה טהורה.
- `src/core/library-search.ts` — מרחיב את חוקי ההתאמה שהיום חיים בתוך
  `filteredTracks` (`controls.ts:2509`): `matchesQuery(track, query):
  boolean`, מפענח `120-130` כטווח BPM ו‑`8A`/סולם מוזיקלי כהתאמת key,
  ונופל חזרה לטקסט חופשי קיים (path/artist/title/genre) לכל מה שלא טווח/סולם.
  טווח הפוך (`130-120`) או לא-מספרי — מתעלם משקט מהחלק הזה, ממשיך כטקסט
  (per spec: "מתעלם בשקט מהטווח, לא שגיאה חוסמת").
- `src/core/virtual-list.ts` — מתמטיקה טהורה: `visibleRange(scrollTop,
  viewportH, rowH, total, overscan): {start, end, padTop, padBottom}`. בלי
  React, בלי DOM — טסטבילי ישירות.
- `src/app/hooks/useVirtualRows.ts` — hook דק: `ref` על מכל הגלילה,
  `scroll`/`ResizeObserver` listeners, קורא ל‑`core/virtual-list.ts`,
  מחזיר `{containerRef, start, end, padTop, padBottom}`. שכבת app/ בלבד
  (React) — שום לוגיקה כאן, רק חיווט.
- `src/platform/track-meta-idb/store.ts` — מראה מדויקת של
  `genre-overrides-idb/store.ts`: `getTrackMetaByHash(): Promise<Map<string,
  {note?: string; lastPlayedAt?: number}>>` (לא זורק, Map ריק בכישלון),
  `setTrackNote(contentHash, note): Promise<void>` (זורק), `setLastPlayed
  (contentHash, ts): Promise<void>` (זורק). **אין** `core/ports/persistence.ts`
  חדש — אותה סיבה שכבר כתובה ב‑`genre-overrides-idb/store.ts`'s doc comment:
  הפורט הגנרי מיועד לצרכן אחר, ובניית מימוש לו עכשיו תקפוץ קדימה על העבודה
  שהוא נועד לה.

**משתנים:**

- `src/core/types.ts` — `Track` מקבל `note?: string` ו‑`lastPlayedAt?:
  number`, **בדיוק כמו `genre`**: לא persisted-by-scan, ממולא בזמן ריצה
  מ‑merge, לא שדה שהתגיות מייצרות. תיעוד קצר על כל שדה שמסביר את המקור
  (כמו התיעוד הקיים על `genre`/`contentHash`).
- `src/app/state/store.ts` — `library` state מקבל `sortKey: SortKey | null`
  ו‑`sortDir: 'asc' | 'desc'` (ברירת מחדל `null`/`'asc'` — סדר סריקה, כמו
  היום). שני שדות פרימיטיביים, אותו דפוס כמו `query`/`selectedId`.
- `src/controls.ts` — `filteredTracks()` (שורה 2509) עובר ל‑
  `core/library-search.ts`'s `matchesQuery`; פונקציה חדשה `sortedFilteredTracks
  ()` עוטפת אותה ב‑`core/library-sort.ts`'s `sortTracks` לפי `library.sortKey/
  sortDir`. `setTrackNote(trackId, note)` — עותק מדויק של `setTrackGenre`
  (שורה 2540): כתיבה אופטימית ל‑store, אז `persistTrackNote` א-סינכרוני
  שמדווח כישלון ב‑notice בדיוק כמו `persistGenreOverride`. `loadTrackToDeck`
  (שורה 186-240): אחרי ש‑`contentHash` מחושב בהצלחה (שורה 236), `void
  ctl.setLastPlayed(contentHash, Date.now())` — לא חוסם טעינה, לא מדווח
  כישלון (כמו ה‑hash עצמו: "לא זוהה עדיין" הוא מצב תקין, לא שגיאה).
- `src/app/components/Library.tsx` — `Th` (שורה 750) מקבל `sortKey`+`onClick`
  אופציונליים, עם חץ קטן (`▲`/`▼`) כש‑`sortKey === library.sortKey`; כל
  כותרת רלוונטית (Title/Artist/BPM/Key/Time + שתי החדשות) מקבלת אותו.
  `list = mixOnly ? ... ` (שורה 468) עובר ל‑`ctl.sortedFilteredTracks()`.
  `list.map()` (שורה 732) מוחלף ב‑`useVirtualRows` — עמודות ריפוד (padTop/
  padBottom כ‑`<tr style={{height}}>` ריקות, לא `position:absolute`, כדי
  לשמור על ה‑`<table>` הסמנטי הקיים ואת ה‑sticky header). שתי עמודות
  חדשות: `Note` (`<input>` טקסט חופשי, `onBlur` שומר — לא `onChange` בכל
  הקשה, כדי לא להציף כתיבות IDB) ו‑`Last played` (זמן יחסי, `fmtRelative`
  חדש קטן ב‑`Library.tsx` עצמו, לצד `fmtTime` הקיים — "–" כש‑`undefined`).
  שתי הקריאות ל‑`applyGenreOverrides(scan)` (`runScan` שורה 289, `addFiles`
  שורה 352) מקבלות שכנה `applyTrackMeta(scan)` חדשה, באותה צורה בדיוק.
  `applyAnalysisQueue` (שורה 419-462) מקבל `trackMetaByHash` לצד
  `hashOverrides` הקיים (שורה 426), ומוחל באותו merge (שורה 441-443).

**לא משתנה בכוונה:** `tags.ts`, `library.ts` (סריקה עצמה), `core/ports/*`,
`.dependency-cruiser.cjs` (אין שכבה חדשה, רק קבצים בתוך השכבות הקיימות).

## 4. שינויי API/טיפוסים והתנהגות כשל

- `getTrackMetaByHash()`/`setTrackNote`/`setLastPlayed` — אותו חוזה בדיוק כמו
  `genre-overrides-idb`: read לעולם לא זורק (Map ריק בכישלון — הערה שלא
  נטענה שקולה ל"אין הערה"), write כן זורק (הקורא, `controls.ts`, מדווח
  ב‑notice; לא כתיבה שקטה שנראית כמו הצלחה).
- `matchesQuery`: טווח BPM לא-תקין → מתעלם מהחלק הזה, ממשיך כהתאמת טקסט על
  המחרוזת המלאה (לא זורק, לא חוסם).
- `sortTracks`: `undefined`/`null` תמיד אחרון בשני הכיוונים — טראק בלי BPM
  לא "הכי מהיר" כשממיינים יורד.
- **וירטואליזציה בלי ספרייה חדשה** — `react-window`/`react-virtual` לא
  ב‑`package.json` (0 תלויות UI חדשות מלכתחילה: `idb-keyval`, `react`,
  `zustand` בלבד). גובה שורה קבוע (`h-9` = 36px, כבר מתועד ב‑`Library.tsx`
  שורה 680-682) הופך חישוב טווח נראה לפעולה של כמה שורות (`core/virtual-
  list.ts`) — לא מצדיק תלות חדשה על פרויקט שכבר שומר על שש תלויות runtime.

## 5. מודל מצב ה‑UI ותלויות נתונים

`library.sortKey`/`sortDir` ב‑store — פרימיטיביים, לא נגזרים. `sortedFiltered
Tracks()` נגזר בכל render (כמו `filteredTracks()` היום) — לא memo נפרד;
`useMemo` הקיים ב‑`Library.tsx` (שורה 111, ל‑Mix Assist) לא נוגע בזה.
`useVirtualRows` תלוי רק ב‑`list.length` וגובה ה‑container — לא ב‑`list`
עצמו, כדי לא לחשב מחדש את הטווח על כל שינוי תוכן שורה.

## 6. בדיקות בשכבה הזולה ביותר

- **`core/library-sort.ts`, `core/library-search.ts`, `core/virtual-list.ts`
  — vitest אמיתי.** מקרי קצה: BPM חסר בשני הכיוונים, טווח הפוך, טווח
  לא-מספרי, סולם ב‑spelling שונה (מוזיקלי/Camelot — `parseKey` כבר קיים
  ב‑`tags.ts`, נעשה בו שימוש חוזר), `visibleRange` בקצוות (total=0,
  scrollTop שלילי/חורג).
- **`platform/track-meta-idb/store.ts` — לא ניתן לבדיקת יחידה אמיתית**
  (IndexedDB אמיתי) — מדגם ידני בדפדפן, אותו סטטוס שיש כבר ל‑
  `genre-overrides-idb`.
- **וירטואליזציה בפועל על 5,000 שורות — בנצ'מרק סינתטי**, לא נתוני אודיו
  אמיתיים: לרנדר 5,000 `Track` מדומים (שם/BPM/key אקראיים, בלי `handle`
  אמיתי), למדוד frame time עם `performance.mark/measure` תוך גלילה
  מתוכנתת. מודד את שכבת התצוגה בלבד — לא I/O.
- **מול הספרייה האמיתית של שלום — סקריפט בדפוס v0.1.7, לא בקונטיינר הזה.**
  שלום או שיחה עם גישה למחשב שלו: למדוד גלילה/מיון/חיפוש בפועל, לרשום
  מספרים.
- `npm run check` ירוק לפני כל commit.

## 7. סיכונים, נסיגה ולא-מטרות מכוונות

- **סיכון אמיתי:** וירטואליזציה עם `<tr>` ריפוד עלולה לשבור screen-reader
  navigation אם לא נבדק (aria-rowcount/aria-rowindex) — נבדוק ידנית עם
  VoiceOver/NVDA לא זמין בקונטיינר הזה; מסומן כפער ב‑HANDOFF אם לא נסגר.
- **נסיגה:** כל קובץ חדש עומד לבד; אם הוירטואליזציה מתגלה כשבורה בדפדפן
  האמיתי, `useVirtualRows` מוחלף ב‑no-op (מחזיר את כל הטווח) בלי לגעת
  במיון/חיפוש/הערה/נוגן-לאחרונה — ארבעת החלקים עצמאיים בכוונה.
- **לא-מטרות (כפי שנקבע ב‑spec):** Crates, דירוג, artwork, היסטוריה מלאה —
  אף אחד מהם לא נוגע בקבצים שהתוכנית הזו נוגעת בהם, אז אין קשר-הדדי לבדוק.
- **MIDI:** אין כפתור FLX4 ייעודי למיון עמודה בשלב הזה (כמו החיפוש הקיים
  היום) — עכבר/מקלדת בלבד, מתועד ב‑spec ולא נסתר.

## 8. סדר ביצוע מסודר, עם אימות אחרי כל שלב

1. `core/library-sort.ts` + `core/library-search.ts` + טסטים. אימות:
   `npx vitest run tests/core/library-sort` ירוק, מכסה את מקרי הקצה למעלה.
2. `core/virtual-list.ts` + טסטים. אימות: `npx vitest run tests/core/virtual-list`.
3. `platform/track-meta-idb/store.ts`. אימות: `npm run check` (tsc+depcruise)
   ירוק — אין עדיין צרכן, זה רק מוודא שהשכבה לא מפרה גבול.
4. `core/types.ts` (`note`/`lastPlayedAt` על `Track`) + `controls.ts`
   (`setTrackNote`, `setLastPlayed`, `sortedFilteredTracks`, שינוי `filteredTracks`
   הפנימי). אימות: `tsc -b` ירוק, `npm test`.
5. `store.ts` (`sortKey`/`sortDir`). אימות: `tsc -b` ירוק.
6. `Library.tsx`: `Th` ניתנת ללחיצה על כל העמודות הקיימות + מיון בפועל
   (עדיין בלי וירטואליזציה, בלי עמודות חדשות) — פרוסה נראית ראשונה. אימות:
   דפדפן אמיתי (Playwright/Chromium בקונטיינר, או שלום בשלו) — קליק על
   כותרת BPM ממיין, קליק שני הופך כיוון.
7. `Library.tsx`: `useVirtualRows` מוחלף פנימה סביב `list.map()` הקיים.
   אימות: אותה בדיקה ידנית + הבנצ'מרק הסינתטי מסעיף 6 למעלה.
8. `Library.tsx`: עמודות Note + Last played, `applyTrackMeta` בשני מקומות,
   מיזוג ב‑`applyAnalysisQueue`. אימות: כתיבת הערה שורדת רענון עמוד +
   סריקה מחדש של אותה תיקייה (טראק לא זז).
9. `HANDOFF.md`/`ROADMAP.md` מסומן ✅ ל‑v0.8.0, `docs/handoff/v0.8.0.md`
   נכתב, `context_check.py` רץ.

**מוכן לביצוע רק אחרי אישור שלום למסמך הזה.** אחרי האישור: משימות גלויות
(TaskCreate) אחת לכל שלב למעלה, אחת "בעבודה" בכל רגע, אימות כמשימה נפרדת
ומפורשת.
