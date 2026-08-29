# HANDOFF — מצב עבודה נוכחי

מסמך העברת ההקשר בין שיחות. **לקרוא ראשון בכל שיחה חדשה.** לעדכן בסוף כל גרסה /
תת‑גרסה. **מחזיק את ההווה בלבד** — גרסה שנסגרת עוברת ל‑[`docs/handoff/`](docs/handoff/README.md).

---

## סטטוס נוכחי

- **גרסה נוכחית:** `v0.2.1` — זה גם מה ש‑`package.json` אומר, ובדיקה מקבעת את
  השוויון (`tests/repo/version-in-step.test.ts`). **לשנות את שניהם יחד.**
- **branch:** `claude/read-handoff-continue-coding-18o0gy`
- **מצב הריפו מול origin:** אין כאן קביעה — היא מתיישנת בקומיט הבא ויוצרת בדיוק את
  ההכרזה השקרית שהאינווריאנטים נבנו נגדה. לבדוק בפועל: `git fetch && git status -sb`
- **`npm run check`** = `tsc -b` + `oxlint` + `depcruise` + `vitest run`. ירוק.
  **להריץ לפני כל commit.**

### מה פתוח עכשיו

| # | מה | למה זה תקוע |
| --- | --- | --- |
| ① | **v0.2.0 — בדיקה מול ה‑FLX4 ומול העכבר.** הקוד כתוב ואומת בקונסולה ובהכשלה מכוונת; המחווה עצמה לא נוגעה ביד | דורש את החומרה של המשתמש. לא ניתן לביצוע מסביבה מרוחקת |
| ② | **באג MIDI שחוסם את מצב ויניל בחומרה.** ב‑`mappings/flx4.ts` גם CC `0x22` וגם `0x21` ממופים ל‑`jog`, ו‑`manager.ts` קורא ל‑`nudgeDeck` בלי תנאי. בחומרה אלה שני פקדים שונים — `0x22` משטח המגע (scratch), `0x21` טבעת הצד (bend). צריך `jogScratch`/`jogBend`/`jogTouch`/`vinylMode` ב‑`ControlAction`, ב‑`dispatch` ובפריסט | נתפס בתכנון v0.2.0b ולא תוקן. חלק מ‑① |
| ③ | **לאמת בעין** שעמודות Artist/BPM/Key/Time בספרייה מתמלאות ושפריסת 7 העמודות סבירה. הפרסר נבדק מול 360 קבצים; הטבלה עצמה מעולם לא נבדקה על מסך | פתוח מ‑v0.1.7. דורש דפדפן של המשתמש |
| ④ | **סבב `ui-ux-review` + `drop-generic-design` "אחרי"** שהיה בתכולת v0.1.5 ולא בוצע | — |
| ⑤ | **קריסה שדווחה 28/08 ולא אומתה.** תוקנה בעיית זיכרון אמיתית (`analyzeWaveform`, ‏+63MB→+2MB) אבל **לא ידוע שזו הייתה הקריסה.** אם היא חוזרת: לשאול אם הטאב מת / נתקע / מסך לבן, ועל איזה קובץ | חסר מידע מהמשתמש |

**הבא בתור בקוד:** אחרי ש‑① יאומת — `v0.2.5` (פתיחה עם הספרייה כבר טעונה) ואז
`v0.3.0` (beatgrid + phase sync). שניהם מאופיינים במלואם ב‑`ROADMAP.md`.

### היסטוריה — לא כאן

הבלוקים של הגרסאות שנסגרו עברו ל‑[`docs/handoff/`](docs/handoff/README.md):
[v0.1.5](docs/handoff/v0.1.5.md) · [v0.1.7](docs/handoff/v0.1.7.md) ·
[v0.2.0](docs/handoff/v0.2.0.md) · [v0.2.1](docs/handoff/v0.2.1.md).
יומן השיחות נמצא שם גם הוא. **לקרוא משם רק כששאלה היסטורית דורשת** — הקובץ הזה
נקרא בכל שיחה, הם לא.

---

### סביבת המשתמש

- לפטופ **Dell Latitude 7440**, מסך 1920×1080 @ **125% scale** → viewport CSS 1536×864,
  ואחרי סרגלי דפדפן ~**1536×710** לדף. **לתכנן פריסה לגובה ~710px**, ולזכור שהכל
  נראה פיזית קטן ב‑24% ממה שהמספר אומר (הכפל כל גודל CSS ב‑0.76).
- מסתכל ב‑Chrome האמיתי שלו, לא ב‑Browser pane של Claude. **צילום מסך מה‑pane לא
  עובד** בסביבה הזו ("pane is not displayed"). מה שכן עובד: `javascript_tool` למדידת
  DOM ו‑`read_console_messages` לשגיאות.
- **שרת ה‑dev:** `preview_start` עם `name: soundgrid-dev` (סעיף 1 בנוהל השיחה).
  **שרת שהורם בשיחה קודמת מת איתה** — תמיד להרים מחדש, לא להתחבר ל‑`url` ישן.
- הספרייה של המשתמש: `C:\Users\Shalom\Music\Tracks` (תת‑תיקיות HipHop/House/Techno/
  Trance/Mizrahi/Final). folderName שנשמר = "Tracks".
- **שיחה שרצה בסביבה מרוחקת (ענן) לא רואה כלום מזה** — אין את הספרייה, ואין דפדפן
  שהמשתמש יכול להגיע אליו. עבודה שדורשת אימות חי לא שייכת לשם.

### codegraph
ה‑MCP של codegraph **פעיל** — `codegraph_explore` זמין וגם הזרקת הקשר אוטומטית ב‑prompt.
להשתמש בו לניווט בקוד במקום קריאה גורפת. להריץ `codegraph sync` אחרי שינויים גדולים
(v0.1.5 הוסיף `recommend.ts`, `Platter.tsx` — שווה sync בתחילת השיחה הבאה).

---

## איך עובדים (נוהל שיחה)

1. **תחילת שיחה — קודם כל להרים את השרת.** לפני קריאת מסמכים ולפני כל קוד:
   `preview_start` עם `soundgrid-dev` מתוך `.claude/launch.json` (**לא** `npm run dev` דרך
   Bash — שרת שמורם ככה לא שורד ואי אפשר להגיע אליו מהכלים). לוודא שהפורט מאזין
   ולדווח למשתמש שהוא באוויר, כדי שיוכל לבדוק את המערכת במקביל לעבודה.
   **שרת שהורם בשיחה קודמת מת איתה** — תמיד להרים מחדש, לא להניח שהוא חי.
   רק אחר כך: קרא `HANDOFF.md` → `ROADMAP.md` (סעיף הגרסה הרלוונטית) → `git log --oneline -5`.
2. **במהלך העבודה:** commit אחרי כל יחידה שעובדת ובונה. הודעת commit מתחילה ב‑`vX.Y.Z:`.
3. **סיום גרסה / תת‑גרסה:**
   - `npm run build` + `npm run lint` ירוקים.
   - עדכן `ROADMAP.md` (סמן ✅) ו‑`HANDOFF.md` (הסעיפים למטה).
   - commit + push.
   - **הרץ `context_check.py`** ופעל לפי הוורדיקט (ראה "Context discipline" ב‑`CLAUDE.md`).
     🟡/🔴 = **שיחה חדשה, לא `/clear`**. הקריטריון הידני שהיה כאן בוטל — הוא נמדד עכשיו.
4. **שיחה חדשה:** ה‑HANDOFF הוא נקודת האמת. אם משהו לא כתוב פה — הוא לא הועבר.

---

## ארכיטקטורה — מפה מהירה

```
src/
  controls.ts             ★ choke point — כל פעולת משתמש (עכבר/מקלדת/MIDI/AI) עוברת פה
  main.tsx                bootstrap
  core/                   TS טהור: בלי React, בלי DOM, בלי AudioContext, בלי Web MIDI
    types.ts              DeckState, MixerState, Track, ...
    constants.ts          TEMPO_RANGE, EQ, צבעי hot cue
    recommend.ts          mixRecommendations() — טראקים תואמי BPM/סולם לדק המנגן
    mapping/mapping.ts    ControlAction + parseMessage + relativeDelta
    ports/                audio · source · transport · clock · analyzer · capabilities ·
                          persistence · ai — הגבול שכל תלות בפלטפורמה עוברת דרכו
  platform/               המימושים שמאחורי ה‑ports
    audio-webaudio/       engine.ts (ניתוב 4ch/סטריאו, crossfader, setSinkId, decode) ·
                          deck.ts (גרף לדק בודד, loops, tempo) ·
                          players.ts (SourcePlayer: worklet + fallback, anchors) ·
                          scratch-processor.ts (ה‑AudioWorklet עצמו)
    source-fsaccess/      library.ts (pick/scan/restore + idb-keyval) ·
                          tags.ts (★ byte-range בלבד — אף פעם לא decode, אף פעם לא כתיבה)
    transport-webmidi/    manager.ts (Web MIDI, dispatch, Learn) · mappings/flx4.ts
    analyzer-js/analyze.ts  computePeaks, detectBpm
    capabilities.ts · clock-audio.ts
  app/                    React בלבד
    App.tsx · components/ (TopBar, Deck, Mixer, Library, Waveform, Platter, PadGrid,
    controls.tsx) · hooks/useRenderLoop.ts · state/store.ts (zustand)
tests/repo/               אינווריאנטים על הריפו כמערכת (v0.2.1)
```

**כללי זהב:**
- imports חוצי‑קובץ דרך alias `@/*`, **אף פעם לא `../`** — נתיב יחסי מסתיר איזו שכבה
  הוא חוצה, וזה מה שהפך את השכבות לבלתי נראות עד `f8f5cf8`.
- מנוע האודיו אימפרטיבי וחי מחוץ ל‑React. ה‑store מחזיק רק state סריאליזבילי.
- פעולה חדשה → `controls.ts`, ונקראת גם מה‑UI וגם מ‑`transport-webmidi/manager.ts:dispatch`.
- פעולת MIDI חדשה → `ControlAction` ב‑`core/mapping/mapping.ts` + case ב‑`dispatch`
  + entry ב‑`mappings/flx4.ts`.
- Chromium בלבד. לא לשבור fallback סטריאו / מקלדת.
- הגבולות נאכפים ע"י `.dependency-cruiser.cjs`, לא ע"י מוסכמה. `npm run check` נופל אחרת.

---

## אינווריאנטים ברמת הריפו (v0.2.1)

`tests/repo/` בודק את **הריפו כמערכת**, לא את הקוד. הכלל שנגזר מ‑ESOP: **כל באג
שנתפס פעם אחת הופך לבדיקה קבועה.** חמש בדיקות, כל אחת מקבעת באג שקרה כאן:

| הבדיקה | הבאג שהיא מקבעת |
| --- | --- |
| `handoff-size.test.ts` | הקובץ הזה גדל ב‑97% ביום אחד ונקרא ראשון בכל שיחה |
| `version-in-step.test.ts` | `package.json` אמר `"0.0.0"` בזמן ש‑v0.2.0 כבר ב‑main |
| `doc-paths.test.ts` | מפת הארכיטקטורה הדריכה דרך `library/tags.ts` ו‑`midi/manager.ts` — נתיבים שמתו ב‑v0.1.6 <!-- dead-path -->, וקישור שבור ב‑`README.md` |
| `doc-commits.test.ts` | הקובץ הזה קיבע SHA בשורת מצב ה‑push, והשורה הזדקנה לשקר (`969f004`) |
| `claude-md-pair.test.ts` | הכלל "שני קבצי ה‑CLAUDE משתנים באותו commit" היה הכלל היחיד בפרויקט בלי אכיפה |

**כשבדיקה נופלת, ההודעה אומרת מה לעשות.** אל תחליש בדיקה כדי לעבור — זה בדיוק
מה שהופך אותה לחסרת ערך. תקציב הגודל נקבע עם מרווח מכוון מהסיבה הזאת.

---

## החלטות פתוחות / להחליט מול המשתמש

- `AIProvider` — מודל מקומי (WebGPU/WASM) מול BYO‑key מול self‑hosted? איזה מודל מקומי? (v0.5.5)
- key‑lock (master tempo): phase‑vocoder ב‑`AudioWorklet` — לבנות עצמאית או WASM? (v0.9)
- ייבוא תגיות Serato/rekordbox — פורמט קדימות? (v0.16). לתגיות פשוטות (BPM/key) — v0.1.7.
- Ableton Link — WASM port מול שרת גשר מקומי (v0.19)
- stems — מודל on-device: איזה? רישוי? (v0.20)

---

## חובות טכניים ידועים

- `detectBpm` פשטני (energy autocorrelation) — יוחלף ב‑v0.3 עם beatgrid אמיתי.
  **שים לב:** מאז v0.1.7 יש BPM מתגיות ל‑97% מהספרייה, ו‑`loadTrackToDeck` נותן
  ל‑`detectBpm` לדרוס אותו. אם הזיהוי הגרוע דורס ערך תגית טוב — זו כנראה הבעיה.
- תוצאות התגיות לא נשמרות בין טעינות — נסרק מחדש בכל בחירת תיקייה (0.6 שנייה
  ל‑360 קבצים, אז לא דחוף). מטמון קבוע ב‑IndexedDB מגיע ב‑v0.4.
- `readTags` על WAV/AIFF לא מוצא ID3 אם הוא יושב אחרי הצ'אנק ה‑64 (cap של הלולאה).
- OGG נקרא best-effort (חיפוש ה‑comment header ב‑256KB הראשונים, בלי הרכבת
  Ogg packets) — אין קבצי OGG בספרייה של המשתמש, אז זה לא נבדק על אמת.
- הפריסה של v0.1.5 מכוילת ל‑~710px גובה. ה‑waveform ברצפה (`min-h-[96px]`) — אם
  המשתמש על מסך גדול יותר יש מקום להגדיל, אבל אין כרגע לוגיקת breakpoint.
- אין טיפול ב‑sample-rate mismatch בין הקובץ ל‑AudioContext (v0.18).
- `syncDeck` מיישר BPM בלבד, לא פאזה (v0.3).
- אין persistence ל‑cue points / tempo בין טעינות (v0.4 / v0.16).
- Waveform מרונדר ב‑canvas רגיל ב‑main thread, מצויר מחדש כל frame (v0.12).
- **`strict` לא מופעל באף `tsconfig`** — לא ב‑`app`, לא ב‑`node`, ולא ב‑`test`
  שנוסף ב‑v0.2.1. ‏`CLAUDE.md` מכריז "TypeScript (strict)" והריפו לא. חוב קיים
  שהתגלה בסקירת v0.2.1; להפעיל כמשימה בפני עצמה, לא באמצע פיצ'ר.
- **הפרת גבול `platform/` → `app/`** — `transport-webmidi/manager.ts` מייבא את
  `@/app/state/store` ואת `@/controls` במקום לפלוט `ControlActions` דרך הפורט. נכנס
  ב‑`f1ae061` (v0.2.0). מתועד ביושר ב‑`.dependency-cruiser.cjs:29‑33` עם severity
  `warn` כדי שיישאר גלוי — כלומר `npm run check` נשאר ירוק בזמן שהכלל מופר.
