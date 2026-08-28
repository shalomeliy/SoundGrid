# HANDOFF — מצב עבודה נוכחי

מסמך העברת הקשר בין שיחות. **לקרוא ראשון בכל שיחה חדשה.** לעדכן בסוף כל גרסה / תת‑גרסה.

---

## סטטוס נוכחי

- **גרסה אחרונה שהושלמה:** `v0.1.0` (MVP)
- **גרסה בעבודה:** `v0.1.5 — Design Overhaul` — כל הקוד נכתב, build + lint ירוקים,
  הפריסה מכוילת למסך של המשתמש (Latitude 7440, 1920×1080 @ 125% = viewport אפקטיבי
  1536×864, לדף נשאר ~1536×710). לפי מדידות DOM: TopBar 53 + decks/mixer ~385 +
  ספרייה ~272 — נכנס.
  **חסר:** אישור ויזואלי סופי מהמשתמש + סבב ליטוש קטן. הבדיקה מול Serato/rekordbox
  (קריטריון "הושלם") עדיין לא נעשתה.
- **branch:** `main` · **build:** ירוק · **דחוף ל‑origin:** ❌ לא — **13 commits מקומיים**
- **דגל CLEAR:** 🟢 שיחה חדשה נפתחת אחרי העדכון הזה

### מה נעשה ב‑v0.1.5 (13 commits מקומיים, ראה `git log`)
1. **design tokens + Inter** — `index.css` שוכתב: surface tokens שכבתיים,
   `@fontsource-variable/inter`, type/radius/motion scale, elevation shadows,
   utilities `.tnum/.label/.panel`, `prefers-reduced-motion`.
2. **`controls.tsx` שוכתב** — `Button` (transport/toggle/ghost, idle→armed→active),
   `Knob` (SVG arc + readout on‑hover + מקלדת), `Fader` (מסילה חרוצה, ticks, detent, cap).
3. **`Deck`** — היררכיה שם→זמן→BPM, readouts tabular, אזהרת 30ש' אחרונות, disabled בלי טראק.
4. **`Platter.tsx`** חדש — טבעת מיקום + סמן מסתובב (בסיס לג'וג v0.2), `size` prop.
5. **`Waveform`** — גוף מלא gradient, spine, beat grid, cue flags, playhead glow,
   loading/empty. **הקנבס `position:absolute`** כדי שהגודל האינטרינזי שלו לא יזין
   feedback loop שמנפח את גובה הדק (באג שתוקן — אל תחזיר ל‑`block`).
6. **`Mixer`** — EQ+Filter ב‑well **אופקי**, master/cue knobs בשורה, crossfader נעוץ
   בתחתית (`mt-auto`). קומפקטי (~360px) בכוונה, אחרת הספרייה נחנקת ב‑1536×710.
7. **`TopBar`** — status pills עם נקודת חיווי. **`Library`** — כותרת טבלה דביקה,
   עמודות BPM/Time, בורר accent, שורות 44px, מצבי empty/scanning/unsupported/no‑match.
8. token contrast → WCAG AA.
9. **fix גלילת ספרייה** — `h-full + overflow-hidden` על ה‑section.
10. **feat DnD** — גרירת טראק מהספרייה לדק + overlay "Drop to load deck X".
11. **feat `recommend.ts`** — `mixRecommendations()` מדגיש טראקים תואמי‑BPM לדק המנגן
    (bold + נקודה בצבע הדק, טוגל "N mixable"). `loadTrackToDeck` כותב bpm/duration
    חזרה ל‑library entry. גרסה בסיסית של v0.4.5. subscription צר עם `useShallow`.
12. **fix פריסה אנכית** — `App`: main `shrink-0` (גובה טבעי), library `flex-1 min-h`.
    `Deck` `min-h-0`, waveform `flex-1`, ResizeObserver. Platter 54, tempo fader 92.
13. **docs** — ראה למטה.

### לשיחה הבאה — לסיים v0.1.5
1. **לרנדר ולצלם** — Browser pane של Claude לא הצליח לצלם בשיחות האלו (המשתמש
   מסתכל ב‑Chrome האמיתי שלו). דרך שעבדה: `mcp__Claude_Browser__javascript_tool`
   על tabId `seed` למדידת גדלים ב‑DOM.
2. **ליטוש** לפי מה שהמשתמש יגיד: זום/צבע waveform, גודל Platter, ריווח, גובה waveform
   (כרגע ברצפה של `min-h-[96px]`).
3. **בדיקה מול Serato/rekordbox** — צילום מסך זה‑לצד‑זה (קריטריון "הושלם" של v0.1.5).
4. אם תקין: `ui-ux-review` + `drop-generic-design` סבב "אחרי", לסמן v0.1.5 ✅, **`git push`**.

### v0.1.7 — אושר ע"י המשתמש (2026-08-28)
המשתמש אישר להוסיף `v0.1.7 — Tag read`: קריאת BPM/key/duration/artist מתגיות הקבצים
(ID3 `TBPM`/`TKEY`/`TLEN`/`TPE1`, MP4 atoms, Vorbis) בזמן `scanLibrary`, בלי decode.
הספרייה של המשתמש כבר מתויגת ע"י Serato (BPM ל‑410, key ל‑397). פרטים ב‑`ROADMAP.md#v017`.
צריך להוסיף `key?/artist?/title?` ל‑`Track`.

### docs שנוספו ב‑v0.1.5
- `docs/reference/serato-formats.md` — פורמטים של Serato (database V2/crate TLV,
  GEOB: Markers2/BeatGrid/Autotags/Overview) מ‑reverse engineering של ההתקנה המקומית
  (`C:\Users\Shalom\Music\_Serato_`). בסיס ל‑v0.1.7, v0.16, וקליינט דסקטופ.
- `docs/architecture/directions.md` — עקרון "`core/` בלי פלטפורמה", רשימת ה‑ports
  ל‑v0.1.6, חוזה שכבת AI (אופציונלי/model‑agnostic/דרך `controls.ts`), בידול מול
  Serato/rekordbox, יעדי חומרה. **המשתמש רוצה גרסאות דסקטופ Windows+Mac לקראת סוף
  הפרויקט** (Tauri, v1.0).
- ROADMAP קיבל גרסאות `.5`/`.6`/`.7`: v0.1.6 seams, v0.1.7 tag‑read, v0.4.5 next‑song,
  v0.5.5 NL control, v0.8.5 semantic search, v0.9.5 coaching, v0.11.5 plugin API,
  v0.13.5 live co‑pilot.

### סביבת המשתמש
- לפטופ **Dell Latitude 7440**, מסך 1920×1080 @ **125% scale** → viewport CSS 1536×864,
  ואחרי סרגלי דפדפן ~**1536×710** לדף. **לתכנן פריסה לגובה ~710px.**
- מסתכל ב‑Chrome האמיתי (לא ב‑Browser pane של Claude). `npm run dev` → localhost:5173.
- הספרייה של המשתמש: `C:\Users\Shalom\Music\Tracks` (תת‑תיקיות HipHop/House/Techno/
  Trance/Mizrahi/Final). folderName שנשמר = "Tracks".

### הקשר ל‑v0.1.5 (מהמשתמש)
העיצוב הנוכחי "מגושם מדי". הצבעים יפים ונשארים (טורקיז deck A, כתום deck B, סגול accent).
היעד: **יפה יותר מ‑Serato ומ‑rekordbox**. הבעיה במבנה/ריווח/טיפוגרפיה/פקדים, לא בפלטה.
להשתמש בסקילים `ui-ux-review` ו‑`drop-generic-design`. פרטים מלאים ב‑`ROADMAP.md#v015`.

### codegraph
ה‑MCP של codegraph **פעיל** — `codegraph_explore` זמין וגם הזרקת הקשר אוטומטית ב‑prompt.
להשתמש בו לניווט בקוד במקום קריאה גורפת. להריץ `codegraph sync` אחרי שינויים גדולים
(v0.1.5 הוסיף `recommend.ts`, `Platter.tsx` — שווה sync בתחילת השיחה הבאה).

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
  components/           TopBar, Deck, Mixer, Library, Waveform, Platter, PadGrid,
                        controls (Button/Knob/Fader)
  recommend.ts          mixRecommendations() — טראקים תואמי‑BPM לדק המנגן (בסיס v0.4.5)
```

**כללי זהב:**
- מנוע האודיו אימפרטיבי וחי מחוץ ל‑React. ה‑store מחזיק רק state סריאליזבילי.
- פעולה חדשה → מוסיפים ל‑`controls.ts`, קוראים ממנה גם ב‑UI וגם ב‑`midi/manager.ts:dispatch`.
- פעולת MIDI חדשה → מוסיפים ל‑`ControlAction` ב‑`mapping.ts` + case ב‑`dispatch` + entry ב‑`flx4.ts`.
- Chromium בלבד. לא לשבור fallback סטריאו / מקלדת.

---

## החלטות פתוחות / להחליט מול המשתמש

- `AIProvider` — מודל מקומי (WebGPU/WASM) מול BYO‑key מול self‑hosted? איזה מודל מקומי? (v0.5.5)
- key‑lock (master tempo): phase‑vocoder ב‑`AudioWorklet` — לבנות עצמאית או WASM? (v0.9)
- ייבוא תגיות Serato/rekordbox — פורמט קדימות? (v0.16). לתגיות פשוטות (BPM/key) — v0.1.7.
- Ableton Link — WASM port מול שרת גשר מקומי (v0.19)
- stems — מודל on-device: איזה? רישוי? (v0.20)

## חובות טכניים ידועים

- `detectBpm` פשטני (energy autocorrelation) — יוחלף ב‑v0.3 עם beatgrid אמיתי. v0.1.7
  יקרא BPM מתגיות במקום לנתח כשאפשר.
- ל‑`Track` אין `key` — נוסף ב‑v0.1.7.
- הפריסה של v0.1.5 מכוילת ל‑~710px גובה. ה‑waveform ברצפה (`min-h-[96px]`) — אם
  המשתמש על מסך גדול יותר יש מקום להגדיל, אבל אין כרגע לוגיקת breakpoint.
- אין טיפול ב‑sample-rate mismatch בין הקובץ ל‑AudioContext (v0.18).
- `syncDeck` מיישר BPM בלבד, לא פאזה (v0.3).
- אין persistence ל‑cue points / tempo בין טעינות (v0.4 / v0.16).
- Waveform מרונדר ב‑canvas רגיל ב‑main thread, מצויר מחדש כל frame (v0.12).

---

## יומן שיחות

| תאריך | גרסה | מה נעשה | CLEAR אחרי? |
| --- | --- | --- | --- |
| 2026-08-27 | v0.1.0 | scaffold, מנוע אודיו, decks, mixer, waveform, library, MIDI + FLX4, ריפו ציבורי בגיטהאב | — |
| 2026-08-28 | — | ROADMAP.md (20 גרסאות), HANDOFF.md, נוהל שיחה | — |
| 2026-08-28 | — | codegraph init בפרויקט; הוספת v0.1.5 (design overhaul) לרודמפ | 🟢 שיחה חדשה לפני v0.1.5 |
| 2026-08-28 | v0.1.5 | שכתוב שפת עיצוב: tokens+Inter, Button/Knob/Fader, Deck+Platter, Waveform, Mixer, TopBar, Library + מצבים. build+lint ירוק. ממתין לבדיקה ויזואלית | אחרי ליטוש |
| 2026-08-28 | v0.1.5 | +DnD, +recommend.ts (mix highlight), תיקון גלילה, תיקון feedback loop של הקנבס, כיול פריסה ל‑1536×710. docs: serato-formats + architecture/directions. ROADMAP: גרסאות .5/.6/.7. 13 commits מקומיים, לא נדחף | 🟢 שיחה חדשה — לסיים ליטוש + push |
