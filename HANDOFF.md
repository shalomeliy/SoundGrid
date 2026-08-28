# HANDOFF — מצב עבודה נוכחי

מסמך העברת הקשר בין שיחות. **לקרוא ראשון בכל שיחה חדשה.** לעדכן בסוף כל גרסה / תת‑גרסה.

---

## סטטוס נוכחי

- **גרסאות שהושלמו:** `v0.1.5 — Design Overhaul` ✅ · `v0.1.7 — Tag read` ✅ (שתיהן 2026-08-28)
- **branch:** `main` · **build + lint:** ירוקים · **דחוף ל‑origin:** ✅ כן
- **דגל CLEAR:** 🟢 מומלץ `/clear` — שתי גרסאות נסגרו
- **הבא בתור:** v0.1.6 (seams/ports) או v0.2.0 (jog wheels)

### סבב הליטוש שסגר את v0.1.5 (2026-08-28)
המשתמש השווה מול Serato על אותו מסך ואמר "נראה גרוע יותר". שלושה כשלים נפרדים:

1. **טיפוגרפיה לא מכוילת לגודל פיזי.** מסך **14 אינץ'** = 12.2" רוחב, כלומר
   1536 CSS px על פני 12.2" = **126 CSS px לאינץ'** מול 96 בייחוס. 125% של
   Windows לא מפצה על 157 PPI (היה צריך ~164%), אז **הכל קטן פיזית ב‑24%**
   ממה שהמספר אומר — טקסט 11px נמדד כמו 8.4px.
   Serato על אותו מסך: שורות ~31px עם טקסט ~16px — **צפוף יותר וגם קריא יותר**.
   אצלנו היה ההפך: שורות 44px עם טקסט 12px. עברנו ל‑**36px/14px** → 5 שורות
   גלויות במקום 4, ואותיות גדולות יותר. עלה 4px בגובה ה‑main; 710 עדיין מחזיק.
   **כלל אצבע להמשך: הכפל כל גודל CSS ב‑0.76 כדי לדעת מה הוא באמת רואה.**
2. **ויוופורם מרובע.** 2400 דליים קבועים = 16/שנייה, אבל מציירים ב‑150px/שנייה →
   כל דלי נמרח על 9 פיקסלים. הציור הישן (`lineTo`) אינטרפולל וטשטש; הציור לפי
   עמודות חשף בר‑צ'ארט. **הדליים גדלים עם האורך (~200/שנייה, תקרה 120k)**
   וכל פיקסל **מאגד** את כל הדליים שתחתיו (לא דוגם אחד — אחרת טרנזיאנטים נופלים
   והמעטפת מרצדת בגלילה). נמדד על 145 שניות: רצף שטוח 10px→1px, גבהים 50→435.
3. **צבעים חלשים.** הייתי "ריככתי את הפרימריים כדי לא לסנוור" — טעות על פאנל
   כמעט‑שחור, שם אין סנוור למנוע רק ניגודיות להרוויח. + החצי שלא נוגן היה
   ב‑50% שקיפות ונראה מת (עכשיו 82%). + **לא היה נרמול** — טראק ממוסטר חלש
   צייר קו דק; `computePeaks` מנרמל עכשיו לשיא של הטראק (display gain בלבד).

**באג שההשוואה חשפה:** הדק הראה `123.5` והספרייה `124` לאותו טראק — `detectBpm`
הגס דרס ערך תגית של Serato, ו‑SYNC נסחף על ההפרש. **התגית מנצחת עכשיו**
(`track.bpm ?? detectBpm(buffer)`) עד ל‑beatgrid אמיתי ב‑v0.3, ואז זה מתהפך בחזרה.

**⚠️ לא בוצע:** סבב `ui-ux-review` + `drop-generic-design` "אחרי" שהיה בתכולת v0.1.5.

### מה נעשה ב‑v0.1.7 (commit `be3c783`)
`src/library/tags.ts` חדש — קריאת מטא‑דאטה מכותרות הקבצים, **בלי decode**, הכל
byte‑range reads על ה‑`File` (אף פעם לא טוענים טראק שלם לזיכרון). קריאה בלבד,
לא כותבים חזרה לקבצי המשתמש.
- **פורמטים:** ID3v2.2/2.3/2.4 (כולל TXXX, ו‑fallback ל‑GEOB `Serato Autotags`),
  MP4/M4A atoms (`tmpo`, `©ART`, `©nam`, freeform `----`), FLAC/OGG Vorbis
  comments, ו‑RIFF/AIFF chunks.
- **duration אמיתי לכל פורמט:** Xing/VBRI או bitrate (MP3), `mvhd` (MP4),
  `STREAMINFO` (FLAC), `fmt`+`data` (WAV), `COMM` (AIFF). TLEN כמעט לא קיים בפועל.
- **⚠️ WAV:** Serato כותב את ה‑ID3 בצ'אנק `ID3 ` **אחרי** צ'אנק ה‑`data`. לכן
  `readChunked` עושה seek לפי offset של כל צ'אנק ולא קורא חלון מתחילת הקובץ —
  בלי זה 40 קבצי ה‑WAV של המשתמש נשארו ריקים. **אל תחזיר לקריאת חלון.**
- **`parseKey`** מנרמל כתיב מוזיקלי (`Am`/`F#m`/`A minor`), Camelot (`8A`) ו‑Open
  Key (`1m`) לקוד Camelot אחד + כתיב תצוגה אחיד (`Gbm` → `F#m`).
  `Track` קיבל `key`, `camelot`, `artist`, `title`, `album`.
- **`readLibraryTags`** ב‑`library.ts` — פאס שני אחרי `scanLibrary` (pool של 8,
  batching כל 50 קבצים / 400ms) כדי שהרשימה תופיע מיד ותתמלא. ערך קיים תמיד גובר,
  כך שניתוח (v0.3/v0.4) לא נדרס.
- **`mixRecommendations`** משתמש בסולם כששני הצדדים מתויגים: התנגשות Camelot
  מורידה התאמת‑טמפו הדוקה ל‑loose, **אף פעם לא מסננת החוצה**.
- **ספרייה:** עמודות Artist ו‑Key (badge עם tooltip Camelot); הפילטר מחפש גם
  באמן/כותרת.

**נמדד על הספרייה האמיתית** (360 קבצים — 281 mp3, 40 wav, 39 m4a):
**BPM 96.9% · Key 97.2% · Duration 100% · 0.6 שנייה** לכל הסריקה.
ה‑11 שנשארו הם m4a שפשוט לא מתויגים (ריפים, לא באג).
26 מקרי בדיקה ל‑`parseKey`/`keysCompatible` עברו.
> הרצת האימות נעשתה ב‑Node ישירות מול `C:\Users\Shalom\Music\Tracks` עם shim
> קטן ל‑`File` (רק `size` + `slice().arrayBuffer()`) — דרך טובה לבדוק פרסרים
> בלי לעבור דרך ה‑file picker של הדפדפן.

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

### לשיחה הבאה
1. **לאמת את v0.1.7 מול העין** — לבחור תיקיית מוזיקה ולוודא שעמודות Artist/BPM/Key/Time
   מתמלאות ושהפריסה של הטבלה עם 7 העמודות סבירה (רוחב Title 42% / Artist 24%).
   זה הדבר היחיד ב‑v0.1.7 שלא נבדק — הפרסר עצמו נבדק מול 360 הקבצים האמיתיים.
2. **לסיים v0.1.5** — הכל תלוי במשתמש:
   - **ליטוש** לפי מה שיגיד: זום/צבע waveform, גודל Platter, ריווח, גובה waveform
     (כרגע ברצפה של `min-h-[96px]`).
   - **בדיקה מול Serato/rekordbox** — צילום מסך זה‑לצד‑זה (קריטריון "הושלם").
   - אם תקין: `ui-ux-review` + `drop-generic-design` סבב "אחרי", לסמן v0.1.5 ✅.
3. **`git push`** — 16 commits מקומיים ממתינים.
4. אחר כך: v0.1.6 (seams/ports) או v0.2.0 (jog wheels).

**צילום מסך מה‑Browser pane לא עובד** בסביבה הזו ("pane is not displayed") —
המשתמש מסתכל ב‑Chrome האמיתי שלו. מה שכן עובד: `mcp__Claude_Browser__javascript_tool`
על tabId `seed` למדידת DOM, ו‑`read_console_messages` לשגיאות.
שרת ה‑dev על 5173 שייך לשיחה אחרת — `preview_start` עם `name` ייכשל על התנגשות
פורט; להשתמש ב‑`preview_start` עם `url: http://localhost:5173` (אותה תיקייה, HMR
מרים את השינויים).

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
  library/library.ts    File System Access — pick/scan/restore, idb-keyval לזכירת התיקייה,
                        readLibraryTags (פאס תגיות שני, batched)
  library/tags.ts       ★ readTags — ID3v2/MP4/Vorbis/RIFF/AIFF, parseKey → Camelot.
                        byte-range reads בלבד, אף פעם לא decode ולא כתיבה לקבצים
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

---

## יומן שיחות

| תאריך | גרסה | מה נעשה | CLEAR אחרי? |
| --- | --- | --- | --- |
| 2026-08-27 | v0.1.0 | scaffold, מנוע אודיו, decks, mixer, waveform, library, MIDI + FLX4, ריפו ציבורי בגיטהאב | — |
| 2026-08-28 | — | ROADMAP.md (20 גרסאות), HANDOFF.md, נוהל שיחה | — |
| 2026-08-28 | — | codegraph init בפרויקט; הוספת v0.1.5 (design overhaul) לרודמפ | 🟢 שיחה חדשה לפני v0.1.5 |
| 2026-08-28 | v0.1.5 | שכתוב שפת עיצוב: tokens+Inter, Button/Knob/Fader, Deck+Platter, Waveform, Mixer, TopBar, Library + מצבים. build+lint ירוק. ממתין לבדיקה ויזואלית | אחרי ליטוש |
| 2026-08-28 | v0.1.5 | +DnD, +recommend.ts (mix highlight), תיקון גלילה, תיקון feedback loop של הקנבס, כיול פריסה ל‑1536×710. docs: serato-formats + architecture/directions. ROADMAP: גרסאות .5/.6/.7. 13 commits מקומיים, לא נדחף | 🟢 שיחה חדשה — לסיים ליטוש + push |
| 2026-08-28 | v0.1.7 ✅ | `library/tags.ts` — ID3v2/MP4/Vorbis/RIFF/AIFF + parseKey→Camelot; `readLibraryTags` פאס שני batched; עמודות Artist/Key; `mixRecommendations` עם התאמת סולם. נמדד: BPM 96.9%, Key 97.2%, Duration 100%, 0.6ש' על 360 קבצים | 🟢 מומלץ `/clear` |
