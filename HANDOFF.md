# HANDOFF — מצב עבודה נוכחי

מסמך העברת הקשר בין שיחות. **לקרוא ראשון בכל שיחה חדשה.** לעדכן בסוף כל גרסה / תת‑גרסה.

---

## סטטוס נוכחי

- **גרסה אחרונה שהושלמה:** `v0.1.0` (MVP)
- **גרסה בעבודה:** `v0.1.5 — Design Overhaul` — כל הקוד נכתב, build + lint ירוקים.
  **חסר:** בדיקה ויזואלית מול Serato/rekordbox (קריטריון "הושלם"), וסבב ליטוש
  אחרי שרואים את זה רץ. ה‑Browser pane לא הצליח לרנדר בשיחה שבה נכתב — צריך
  לפתוח אותו / להריץ `npm run dev` ידנית ולצלם.
- **branch:** `main` · **build:** ירוק · **דחוף ל‑origin:** לא (3 commits מקומיים של v0.1.5)
- **דגל CLEAR:** —

### מה נעשה ב‑v0.1.5 (commits מקומיים)
1. `design tokens, pro knob/fader/button, deck + platter + waveform` — `src/index.css`
   שוכתב: surface tokens שכבתיים, Inter Variable (`@fontsource-variable/inter`),
   type/radius/motion scale, elevation shadows, utilities `.tnum/.label/.panel`.
   `controls.tsx` שוכתב לגמרי: `Button` (transport/toggle/ghost), `Knob` (SVG arc
   + readout on hover + מקלדת), `Fader` (מסילה חרוצה, ticks, detent, cap עם אחיזה).
   `Deck` — היררכיה שם→זמן→BPM, readouts ב‑tabular, disabled בלי טראק.
   `Platter.tsx` חדש — טבעת מיקום + סמן מסתובב (בסיס לג'וג של v0.2).
   `Waveform` — גוף מלא עם gradient, spine, beat grid, cue flags, playhead עם glow,
   מצבי loading/empty. `PadGrid` — עומק + a11y.
2. `mixer, topbar, library redesign + designed states` — `Mixer` מיושר לגריד הדקים,
   EQ ב‑well שקוע. `TopBar` — status pills עם נקודה. `Library` — כותרת טבלה דביקה,
   עמודות BPM/Time, בורר accent, שורות 44px, מצבי empty/scanning/unsupported אמיתיים.
3. token contrast fix (grid-muted/dim ל‑WCAG AA).
4. fix: רשימת הספרייה לא נגללה עם הרבה טראקים (הפאנל לא היה מוגבל בגובה) —
   `h-full + overflow-hidden` על ה‑section.
5. feat: גרירת טראק מהספרייה אל דק (DnD) + overlay "Drop to load deck X".
6. docs: `docs/reference/serato-formats.md` — פורמטים של Serato (database V2/crate
   TLV, GEOB tags: Markers2/BeatGrid/Autotags/Overview) מ‑reverse engineering
   של ההתקנה המקומית. בסיס ל‑import של v0.16 ולקליינט דסקטופ post‑1.0.
   **המשתמש רוצה גרסאות דסקטופ ל‑Windows+Mac לקראת סוף הפרויקט** (ROADMAP v1.0/Tauri).

### לשיחה הבאה
- לפתוח Browser pane / `npm run dev`, לצלם, להשוות מול Serato/rekordbox.
- לכוונן: זום/צבע ה‑waveform, גודל ה‑Platter, ריווח פאנלים, גובה ברירת מחדל של Library.
- אם תקין: לסמן v0.1.5 ✅ ב‑ROADMAP, `git push`.

### הקשר ל‑v0.1.5 (מהמשתמש)
העיצוב הנוכחי "מגושם מדי". הצבעים יפים ונשארים (טורקיז deck A, כתום deck B, סגול accent).
היעד: **יפה יותר מ‑Serato ומ‑rekordbox**. הבעיה במבנה/ריווח/טיפוגרפיה/פקדים, לא בפלטה.
להשתמש בסקילים `ui-ux-review` ו‑`drop-generic-design`. פרטים מלאים ב‑`ROADMAP.md#v015`.

### codegraph
המשתמש התקין את הכלי `@colbymchenry/codegraph` גלובלית (`codegraph` ב‑PATH), והרצנו
`codegraph init` בפרויקט (`.codegraph/codegraph.db` נבנה, 278 nodes). **עדיין לא רשום
כ‑MCP server ב‑Claude Code.** המשתמש צריך להריץ `codegraph install -t claude -l global -y`
ואז לפתוח שיחה חדשה כדי שכלי ה‑MCP (`codegraph_explore`, `codegraph_node` וכו') ייטענו.
לאחר מכן: להשתמש בהם לניווט בקוד במקום קריאה גורפת של קבצים. להריץ `codegraph sync` אחרי
שינויים גדולים.

---

## איך עובדים (נוהל שיחה)

1. **תחילת שיחה:** קרא `HANDOFF.md` → `ROADMAP.md` (סעיף הגרסה הרלוונטית) → `git log --oneline -5`.
2. **במהלך העבודה:** commit אחרי כל יחידה שעובדת ובונה. הודעת commit מתחילה ב‑`vX.Y.Z:`.
3. **סיום גרסה / תת‑גרסה:**
   - `npm run build` + `npm run lint` ירוקים.
   - עדכן `ROADMAP.md` (סמן ✅) ו‑`HANDOFF.md` (הסעיפים למטה).
   - commit + push.
   - **בדיקת CLEAR אוטומטית** (ראה קריטריון למטה) → אם צריך, אמור למשתמש במפורש:
     "גרסה X הושלמה, HANDOFF מעודכן — מומלץ `/clear` עכשיו" או "מומלץ לפתוח שיחה חדשה".
4. **שיחה חדשה:** ה‑HANDOFF הוא נקודת האמת. אם משהו לא כתוב פה — הוא לא הועבר.

### קריטריון CLEAR / שיחה חדשה
המלץ על `/clear` כאשר מתקיים אחד מ:
- הושלמה גרסת MINOR שלמה (`v0.X.0`).
- ההקשר עבר ~50% מהחלון (יש system-reminder על summarization, או השיחה > ~30 סבבי כלים).
- מעבר לתחום אחר בקוד (למשל מ‑audio engine ל‑library UI).
המלץ על **שיחה חדשה לגמרי** (לא רק clear) כשמתחילים גרסת MINOR חדשה עם תכולה גדולה.
אם אף תנאי לא מתקיים — המשך באותה שיחה.

> הערה: אין לי כלי בשם `dcodegraph`. ניהול ההקשר נעשה דרך המסמך הזה + פקודות
> ה‑session של Claude Code (`/clear`, שיחה חדשה). אם התכוונת לכלי ספציפי — תפרט ואבדוק.

---

## ארכיטקטורה — מפה מהירה

```
src/
  types.ts              טיפוסים משותפים (DeckState, MixerState, Track, ...)
  controls.ts           ★ שכבת הפעולות המשותפת ל‑UI ול‑MIDI. כל פעולת משתמש עוברת פה.
  audio/
    engine.ts           AudioEngine singleton — ניתוב 4ch/סטריאו, crossfader, setSinkId, decode
    deck.ts             Deck — גרף Web Audio לדק בודד, מיקום sample-accurate, loops, tempo
    analyze.ts          computePeaks, detectBpm
    constants.ts        TEMPO_RANGE, EQ, צבעי hot cue
  state/store.ts        zustand — כל ה‑UI state. patchDeck/patchChannel/patchMixer/set*
  hooks/useRenderLoop.ts  rAF יחיד שמושך position מהמנוע ל‑store
  library/library.ts    File System Access — pick/scan/restore, idb-keyval לזכירת התיקייה
  midi/
    mapping.ts          טיפוסים + parseMessage + relativeDelta
    manager.ts          ★ MidiManager singleton — Web MIDI, dispatch לפי mapping, Learn
    mappings/flx4.ts     פריסט DDJ-FLX4 (note/CC — best-effort, לתקן דרך Learn)
  components/           TopBar, Deck, Mixer, Library, Waveform, PadGrid, controls (Knob/Fader)
```

**כללי זהב:**
- מנוע האודיו אימפרטיבי וחי מחוץ ל‑React. ה‑store מחזיק רק state סריאליזבילי.
- פעולה חדשה → מוסיפים ל‑`controls.ts`, קוראים ממנה גם ב‑UI וגם ב‑`midi/manager.ts:dispatch`.
- פעולת MIDI חדשה → מוסיפים ל‑`ControlAction` ב‑`mapping.ts` + case ב‑`dispatch` + entry ב‑`flx4.ts`.
- Chromium בלבד. לא לשבור fallback סטריאו / מקלדת.

---

## החלטות פתוחות / להחליט מול המשתמש

- key‑lock (master tempo): phase‑vocoder ב‑`AudioWorklet` — לבנות עצמאית או WASM? (רלוונטי v0.9)
- ייבוא תגיות Serato/rekordbox — פורמט קדימות? (v0.16)
- Ableton Link — WASM port מול שרת גשר מקומי (v0.19)
- stems — מודל on-device: איזה? רישוי? (v0.20)

## חובות טכניים ידועים

- `detectBpm` פשטני (energy autocorrelation) — יוחלף ב‑v0.3 עם beatgrid אמיתי.
- אין טיפול ב‑sample-rate mismatch בין הקובץ ל‑AudioContext (v0.18).
- `syncDeck` מיישר BPM בלבד, לא פאזה (v0.3).
- אין persistence ל‑cue points / tempo בין טעינות (v0.4 / v0.16).
- Waveform מרונדר ב‑canvas רגיל ב‑main thread (v0.12).

---

## יומן שיחות

| תאריך | גרסה | מה נעשה | CLEAR אחרי? |
| --- | --- | --- | --- |
| 2026-08-27 | v0.1.0 | scaffold, מנוע אודיו, decks, mixer, waveform, library, MIDI + FLX4, ריפו ציבורי בגיטהאב | — |
| 2026-08-28 | — | ROADMAP.md (20 גרסאות), HANDOFF.md, נוהל שיחה | — |
| 2026-08-28 | — | codegraph init בפרויקט; הוספת v0.1.5 (design overhaul) לרודמפ | 🟢 שיחה חדשה לפני v0.1.5 |
| 2026-08-28 | v0.1.5 | שכתוב שפת עיצוב: tokens+Inter, Button/Knob/Fader, Deck+Platter, Waveform, Mixer, TopBar, Library + מצבים. build+lint ירוק. ממתין לבדיקה ויזואלית | אחרי ליטוש |
