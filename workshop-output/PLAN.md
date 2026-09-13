# PLAN — v0.8.2: פס "מתנגן עכשיו"

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר מול שלום, 13/09). לא פותח
מחדש שום החלטת מוצר — כל מה שלמטה הוא "איך", לא "מה".

## 1. ארכיטקטורה נוכחית ותזרים נתונים רלוונטי

- `src/app/components/Library.tsx` — קומפוננטת `Library()` (שורה 89) מחזיקה
  selector צר של פרימיטיבים מ‑`decks.A`/`decks.B` (`useShallow`, שורות
  133-140: `aP, aB, aT, aId, aK, bP, bB, bT, bId, bK`) המוזן ל‑
  `mixRecommendations` (שורה 151) ומייצר `recs: Map<trackId, MixMatch>`
  (נצרך בשורה 886: `recs.get(t.id)`).
- כל שורה מרונדרת ע"י `Row` (הגדרה שורה 999, לא `TrackRow` — תיקון שם
  ביחס לתקצירי הסקירה), מקבל `track`, `selected`, `match`, `keyMode`,
  `onSelect`, `removableFromCrateId` (שורות 882-890 — נקודת הקריאה
  היחידה).
- תא הכותרת של השורה (שורות 1059-1095) כבר בונה אשכול `<span
  className="flex items-center gap-1.5">` עם `AnalysisIcon` (שורה 969,
  מוגדר) ואז נקודת ההתאמה של Mix Assist (שורות 1067-1091, `DECK_COLOR`
  שורה 36), אז שם הטראק החתוך (שורה 1092), אז `chipLabel` אופציונלי
  (שורה 1093).
- `LoadBtn` (שורה 1181) הוא התקדים העיצובי המדויק לפילול: `color-mix(in
  srgb, ${tone}, transparent 82%)` לרקע + `tone` לטקסט, `tone` = משתנה
  ה‑CSS של הדק.
- `Track.contentHash?: string` (`src/core/types.ts:38`), `DeckState.track:
  Track | null` (`src/core/types.ts:105`) — שניהם קיימים, בלי שינוי טיפוס
  נדרש.
- אומת ישירות ב‑`controls.ts:236-333` (`loadTrackToDeck`): `hashBytes`
  (שורה 247) תמיד מסתיים — הצלחה או כישלון תפוס — *לפני* ש‑`patchDeck`
  קובע `decks[id].track` לראשונה (שורות 330-331). אין חלון "טעון בלי
  hash" לטפל בו.

## 2. הפרוסה הדקה מקצה-לקצה

Selector קיים (2 primitives נוספים) → שני props חדשים ל‑`<Row>` → השוואת
`===` בתוך `Row` → רינדור פילול טקסט אחד או שניים בתוך תא הכותרת הקיים.
שום קובץ מחוץ ל‑`Library.tsx` לא משתנה.

## 3. קבצים לשינוי (קובץ יחיד)

**`src/app/components/Library.tsx`** — כל השינוי כאן:

1. **שורות 133-140** — הרחבת ה‑`useShallow` tuple בשני ערכים בסוף:
   ```ts
   const [aP, aB, aT, aId, aK, bP, bB, bT, bId, bK, aHash, bHash] = useStore(
     useShallow((s) => [
       s.decks.A.playing, s.decks.A.bpm, s.decks.A.tempo, s.decks.A.track?.id ?? null,
       s.decks.A.track?.camelot ?? null,
       s.decks.B.playing, s.decks.B.bpm, s.decks.B.tempo, s.decks.B.track?.id ?? null,
       s.decks.B.track?.camelot ?? null,
       s.decks.A.track?.contentHash ?? null,
       s.decks.B.track?.contentHash ?? null,
     ]),
   )
   ```
   **אזהרה מפורשת מהסקירה הארכיטקטונית, לשמור עליה תוך כדי העריכה:** אסור
   להוסיף `positionSec`/`peaks`/כל שדה שמתעדכן בקצב frame לתוך אותו tuple
   — זה מה ש‑`useShallow` על מערך פרימיטיבים שומר מפני רינדור-מחדש של כל
   הטבלה 60 פעם בשנייה, וזו בדיוק הסיבה ש‑`positionSec` לא נמצא שם כבר
   היום.
2. **שורות 882-890** (קריאה ל‑`<Row>`) — שני props חדשים:
   ```tsx
   <Row
     key={t.id}
     track={t}
     selected={t.id === library.selectedId}
     match={recs.get(t.id)}
     keyMode={keyMode}
     onSelect={() => setLibrary({ selectedId: t.id })}
     removableFromCrateId={removableFromCrateId}
     loadedOnA={aHash != null && aHash === t.contentHash}
     loadedOnB={bHash != null && bHash === t.contentHash}
   />
   ```
   שני בוליאנים, לא hash גולמי — `Row` לא צריך לדעת את ה‑hash של אף דק,
   רק אם *השורה שלו* טעונה על A ו/או B. `aHash != null` שומר על ההתנהגות
   הנכונה כש‑hash נכשל (`undefined`/`null` בשני הצדדים לא ייחשב "שווה").
3. **חתימת `Row`** (שורה 999-1013) — שני props בוליאניים חדשים:
   `loadedOnA: boolean` , `loadedOnB: boolean`.
4. **תוך `Row`, בתוך תא הכותרת** (בין נקודת ה‑Mix-Assist, שורה 1091,
   לטקסט החתוך, שורה 1092) — פילול אחד לכל דק טעון:
   ```tsx
   {(loadedOnA || loadedOnB) && (
     <span className="flex shrink-0 items-center gap-0.5">
       {loadedOnA && (
         <span
           aria-label="Loaded on deck A"
           className="grid h-4 w-4 place-items-center rounded-[var(--radius-xs)] text-[10px] font-bold leading-none"
           style={{ background: 'color-mix(in srgb, var(--color-deck-a), transparent 82%)', color: 'var(--color-deck-a)' }}
         >
           A
         </span>
       )}
       {loadedOnB && (
         <span
           aria-label="Loaded on deck B"
           className="grid h-4 w-4 place-items-center rounded-[var(--radius-xs)] text-[10px] font-bold leading-none"
           style={{ background: 'color-mix(in srgb, var(--color-deck-b), transparent 82%)', color: 'var(--color-deck-b)' }}
         >
           B
         </span>
       )}
     </span>
   )}
   ```
   **בדוק בפועל (13/09): שום קובץ ב‑`src/app/components/` לא מכיל בפועל
   טקסט עברי גלוי למשתמש** — `grep -rl '[א-ת]{2,}' src` מוצא עברית רק
   בתוך הערות קוד/קובצי migrate פנימיים, לא במחרוזת UI אחת. ההחלטה
   "שפת הממשק: טקסט בעברית" שסגורה ב‑`HANDOFF.md` (02/09) מעולם לא בוצעה
   בפועל בקוד — כל ה‑UI הקיים, כולל `Library.tsx` עצמו, באנגלית. לתרגם
   את כל האפליקציה הוא לא בתחום v0.8.2 (שינוי לא-קשור לפיצ'ר, אסור לפי
   `CLAUDE.md`) — הפילול החדש נשאר **באנגלית**, תואם ל‑100% מהמוסכמה
   הקיימת בקובץ הזה בדיוק (`aria-label="Load to deck A"` שורה 1189,
   `aria-label="Remove from this crate"` שורה 1167). הפער בין ההחלטה
   הכתובה לקוד בפועל מדווח לשלום בנפרד — לא מוסתר, לא מתוקן כאן.

**שום קובץ אחר לא נוגעים בו** — לא `store.ts`, לא `controls.ts`, לא
`core/types.ts` (השדות שצריך כבר קיימים), לא שכבת `platform/`.

## 4. שינויי טיפוס / API והתנהגות כשל

- **אין שינוי טיפוס.** `loadedOnA`/`loadedOnB` הם `boolean` רגילים,
  מחושבים ב‑`Library()`, לא נשמרים בשום מקום.
- **כשל:** אין קריאת רשת/דיסק חדשה כאן — אין נתיב כשל חדש. hash חסר
  (`undefined`) פשוט לא מייצר התאמה (`!= null` guard למעלה).

## 5. מודל מצב UI ותלויות נתונים

שלושה מצבים אפשריים לכל שורה, נגזרים ישירות מה‑2 בוליאנים: אין סימון /
"A" בלבד / "B" בלבד / "A"+"B" יחד (4 קומבינציות, לא 3 — תיקון). תלוי אך
ורק ב‑`decks.A.track?.contentHash`, `decks.B.track?.contentHash`,
ו‑`track.contentHash` של השורה עצמה — שלושתם כבר קיימים ב‑state, בלי
תלות חדשה.

## 6. בדיקות בשכבה הזולה ביותר שיש לה משמעות

- **אין `core/` חדש ואין פונקציה טהורה עצמאית** — ההשוואה היא `===` בודד
  בתוך JSX, לא לוגיקה שמצדיקה חילוץ לפונקציה נבדקת (בניגוד ל‑`recommend`/
  `library-search`, ששניהם אלגוריתם רב-תנאי). חילוץ פונקציה כאן רק כדי
  "שתהיה בדיקה" הוא בדיוק סוג ה‑over-engineering ש‑`CLAUDE.md` אוסר
  ("שלוש שורות דומות עדיפות על הפשטה מוקדמת").
- **`npm run check`** (tsc+oxlint+depcruise+vitest) חייב להישאר ירוק —
  זה מוודא שההרחבה ל‑`Row` לא שוברת טיפוסים ושה‑`depcruise` לא תופס
  יבוא חדש שחוצה שכבה (לא אמור לקרות, אין יבוא חדש).
- **`javascript_tool`** אחרי המימוש: לטעון טראק לדק A/B ישירות דרך
  `ctl.loadTrackToDeck` (בלי גרירה/MIDI — לא ניתן לסימולציה כאן), לבדוק
  ב‑DOM שהפילול המתאים מופיע בשורה הנכונה; לטעון טראק שני לאותו דק ולוודא
  שהפילול עבר לשורה החדשה ונעלם מהישנה; לטעון את אותו טראק לשני הדקים
  ולוודא ששני הפילולים מופיעים יחד.

## 7. סיכונים, נסיגה, לא-בתכולה מכוונת

- **סיכון יחיד אמיתי:** מישהו (עתידי, כולל אני עצמי בהמשך) מוסיף שדה
  נוסף ל‑selector tuple בלי לשים לב שהוא frame-rate (`positionSec` הכי
  סביר) — נכתב כאזהרה מפורשת בקוד ליד ה‑tuple עצמו (הערה חדשה), לא רק
  כאן ב‑PLAN.
- **נסיגה:** שינוי בקובץ יחיד, שני בלוקים — `git revert` של הקומיט מספיק,
  אין מיגרציית נתונים להחזיר (אין נתונים חדשים בכלל).
- **לא בתכולה** (חוזר מה‑Spec, לא מוחלט כאן מחדש): בלי הודעת "מתנגן אבל
  מסונן", בלי הבחנת play/פאוזה, בלי מסך היסטוריה — v0.8.3.

## 8. סדר ביצוע מסודר + אימות אחרי כל שלב

1. ~~קרוא מוסכמת `aria-label`/עברית~~ — **בוצע כבר בשלב התכנון** (ר' סעיף 3
   סעיף-משנה 4 למעלה): אין שכבת i18n, כל הקובץ באנגלית, הפילול החדש
   הולך באנגלית.
2. **עריכה 1:** הרחבת ה‑`useShallow` tuple (שורות 133-140) + הערה קצרה
   ליד ה‑tuple על איסור frame-rate fields. אימות: `npm run check` ירוק,
   `git diff` מראה רק שינוי בשתי שורות + הערה.
3. **עריכה 2:** `loadedOnA`/`loadedOnB` בקריאה ל‑`<Row>` + בחתימת `Row` +
   הרינדור בתוך תא הכותרת. אימות: `npm run check` ירוק.
4. **אימות בדפדפן (`javascript_tool`):** שלושת התרחישים בסעיף 6 —
   טעינה בודדת, החלפה, שני דקים אותו טראק. תיעוד תוצאה (עובר/לא) לפני
   commit.
5. **commit:** `v0.8.2: פס "מתנגן עכשיו" — אות A/B ליד שם הטראק בספרייה`.
6. **`change-reviewer`** על הדיף.
7. **הוראות בדיקה בעברית לשלום** + `HANDOFF.md`/`ROADMAP.md` עדכון +
   `context_check.py`.
