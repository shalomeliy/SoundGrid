# HANDOFF — מצב עבודה נוכחי

מסמך העברת הקשר בין שיחות. **לקרוא ראשון בכל שיחה חדשה.** לעדכן בסוף כל גרסה / תת‑גרסה.

---

## סטטוס נוכחי

- **גרסה אחרונה שהושלמה:** `v0.1.0` (MVP)
- **גרסה בעבודה:** אין — הבאה בתור: `v0.1.5 — Design Overhaul`
- **branch:** `main` · **build:** ירוק · **דחוף ל‑origin:** כן
- **דגל CLEAR:** 🟢 שיחה חדשה לפני `v0.1.5` (גם כדי לטעון את codegraph MCP)

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
