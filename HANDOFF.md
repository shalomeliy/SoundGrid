# HANDOFF — מצב עבודה נוכחי

מסמך העברת הקשר בין שיחות. **לקרוא ראשון בכל שיחה חדשה.** לעדכן בסוף כל גרסה / תת‑גרסה.

---

## סטטוס נוכחי

- **גרסאות שהושלמו:** `v0.1.5 — Design Overhaul` ✅ · `v0.1.7 — Tag read` ✅ (2026-08-28) · `v0.1.6 — Seams` ✅ (2026-08-29)
- **בעבודה:** `v0.2.0 — Jog wheels & scratching` — **v0.2.0a (מנוע) + v0.2.0b (פלטר/ויניל/ג'וג) נכתבו**. חסר: בדיקה מול חומרה
- **branch:** `main` · **`npm run check`:** ירוק (tsc + oxlint + dependency-cruiser) · **דחוף ל‑origin:** ❌ 2 commits מקומיים
- **מבנה חדש מ‑v0.1.6:** `core/` (TS טהור) · `platform/` (מימושים) · `app/` (React) ·
  `controls.ts` (choke point). imports דרך alias `@/*`. **לפני commit: `npm run check`.**
- **הבא בתור:** ① לבדוק את v0.2.0 עם ה‑FLX4 ועם העכבר ② להכשיל את ה‑worklet בכוונה
  ולוודא שהפיל `no scratch` מופיע (הדבר היחיד שנשאר פתוח מהסקירה) ③ ואז v0.3.0 (beatgrid)
- **⚠️ פתוח:** המשתמש דיווח על קריסה ב‑28/08 ולא סיפק פרטים; תוקנה בעיית זיכרון
  אמיתית (`analyzeWaveform` — +63MB→+2MB) אבל **לא אומת שזו הייתה הקריסה**.
  אם היא חוזרת: לשאול אם הטאב מת / נתקע / מסך לבן, ועל איזה קובץ.

### סקירת v0.2.0a — נסגרה ב‑`8ead1d1` (2026-08-29)

השיחה שכתבה את v0.2.0a (המנוע, `fe6ff9e` + `dd7a3ba`) קיבלה סקירה עצמאית שחזרה REPAIR,
והעבירה את הממצאים לשיחה שכתבה את v0.2.0b במקום לתקן — כדי לא לדרוס אותה באותו עץ עבודה.
**כל הממצאים תוקנו ואומתו ב‑`8ead1d1`.** נשמר כאן כי הבעיות עצמן חוזרות בקלות:

| הממצא | איפה זה נסגר |
| --- | --- |
| **חוסם — `ended` מתנגש ב‑`seek`.** סינון ה‑epoch חל גם על `ended`; seek לקראת סוף טראק זרק את ההודעה, `playing` לא התאפס, ו‑`process()` חזר ריק לנצח — דק אילם שהפלייהד שלו ממשיך לזוז, ו‑`play()` לא עושה כלום | `players.ts` — `ended` פטור מהסינון כטרנזיציה סופית. ההעברה הציעה לתלות ב‑`playing`; המתקן זיהה שזה פותח מרוץ אחר (אין סדר מובטח בין הכיוונים) ופתר אחרת |
| **חוסם — ספירת ערוצים.** מונו יצא משמאל בלבד (‑7.4 / ‑999 dBFS); >2 ערוצים זרקו TypeError **בתוך** `process()` = מעבד מת לצמיתות | `scratch-processor.ts` (פאן־אאוט של מונו) + `players.ts:load` (קיפול שווה־עוצמה של הערוצים העודפים). אומת: אות בערוץ 2 בלבד → L/R שניהם ‑23dB |
| `node.onprocessorerror` לא היה מחובר, אז מוות של המעבד היה שקט | `players.ts` — מחובר ל‑`scratchError` ולפיל ב‑TopBar |
| `ctxTimeSec` נזרק והוחלף בזמן הגעה ב‑main thread — פלייהד רועד ~43/שנייה | `players.ts` — משתמש בשעון של המעבד |
| `Deck.load` שחרר את הנגן לפני שבנה את הבא | `deck.ts:129` — בונה קודם, משחרר אחרי |
| סוף לופ מעבר לסוף הטראק לא נחתך | `scratch-processor.ts:104` |
| הערות ב‑`controls.ts`/`deck.ts` נימקו את סדר הטעינה ב‑"transfer detaches the AudioBuffer" — נימוק **שגוי**, כי `players.ts` משתמש ב‑`copyFromChannel` דווקא כדי שלא ינותק | תוקן. הסוג הזה של הערה מסוכן יותר מבאג: מי שיבדוק אותה יאמין לה ויבטל את הסדר |

נמדד עם ffprobe על הספרייה: 357 מ‑360 נבדקו, **כולם סטריאו** — אז באגי המונו היו לטנטיים,
אבל אקפלות וסטמים ווקאליים הם מונו באופן שגרתי.

**⚠️ מה שעדיין לא אומת:** אף אחד לא הכשיל את ה‑worklet בכוונה כדי לראות שה‑TopBar באמת
מציג `no scratch · <reason>`. הקוד מחובר, המסלול לא הורץ.

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

### מה נעשה ב‑v0.2.0b — פלטר, ויניל, וג'וג (`1ee9380`, `9eee845`, `f1ae061`)

**המלכודת המרכזית: ramp שובר את חישוב המיקום.** `positionSec` עושה אקסטרפולציה
בין ה‑anchors של ה‑worklet, והיא הניחה **קצב קבוע**. אבל המצביע נע לפי
ה‑**אינטגרל** של הקצב, אז תחת שיפוע המיקום ריבועי בזמן. נמדד על בלימה 1→0
לאורך 0.5 שניות: המרחק האמיתי **0.25ש'**, אקסטרפולציה בקצב קבוע טוענת **0.5ש'**
— **250ms של חריגה, ~37px של playhead** על ויוופורם ב‑150px/שנייה, בכל בלימה.
`travelled()` מבצע אינטגרציה על ה‑ramp; המיקום המדווח נוחת על 0.25 עם **שגיאה 0**.

- `SourcePlayer.rampRate(target, seconds)`. `BufferSourcePlayer` מתדרדר ביושר —
  הוא לא יכול לעבור דרך אפס (קצב 0 מקפיא את המצביע ופולט DC), אז בלימה שם נגמרת
  בעצירה.
- `Deck.brakeToStop` / `spinUpToPlay`; `togglePlay` עובר דרכם במצב ויניל.
  **ה‑pause נוחת כשהפטיפון באמת עצר**, לא כשהפקודה נשלחה. play/seek באמצע גובר.
- `beginScratch` / `scratchRate` / `endScratch`. הדק ממשיך לדווח `playing` בזמן
  שיד על הפלטר — אצבע על תקליט מסתובב לא עצרה את הטרנספורט, והבהוב שלו בכל נגיעה
  היה מהבהב ב‑UI. scratch על דק עצור עדיין מזין את המצביע כדי שיישמע.
- **פלטר גריר** (`Platter.tsx`). היחס ויזואלי 1:1 ולא פקטור שרירותי: סיבוב אחד =
  `SEC_PER_REV` של אודיו, אז סחיפה במהירות שהסמן מסתובב בה נותנת קצב 1.
  שלושה דברים שגרסה נאיבית שוברת: **התפר ב‑±180°** (בלי unwrap חצייה שלו נקראת
  כסיבוב מלא וקופצת קצב), **אצבע במנוחה** (אירועי pointer נפסקים, אז הקצב האחרון
  היה ממשיך לנגן — timeout של 60ms מאפס), ו**ה‑easing של 120ms** בטבעת שנקרא
  כפיגור תחת scratch.
  **תוקן גם באג ישן:** שני הדקים פלטו `radialGradient` עם אותו `id="platter-face"`.
- **ג'וג ב‑MIDI פוצל.** היה מחובר ל‑`nudgeDeck` שהוא **seek** — הזזת playhead,
  ומ‑v0.3 עם beatgrid אמיתי זו הפעולה ההפוכה. עכשיו: **מגע** (note 0x36) מכריע.
  אחוז = הגלגל הוא התקליט, טיקים → קצב scratch (מומר לפי זמן שחלף, לא ישירות).
  לא אחוז = טיקים → **pitch bend** שדועך חזרה לקצב הגריד אחרי 90ms.
- **`JOG_TICKS_PER_REV = 600` הוא ניחוש**, כמו שאר הפריסט. קבוע בעל שם — לתקן שם.

**⚠️ לא נבדק מול חומרה.** ה‑note של המגע וספירת הטיקים לסיבוב הם best-effort.
גם הגרירה בעכבר לא נוסתה על טראק אמיתי — צריך לטעון שיר ולגרור.

### מה נעשה ב‑v0.2.0a — מנוע ה‑scratch (commits `fe6ff9e`, `dd7a3ba`)

**הממצא שהניע את הכל:** ‏Chrome **לא מסוגל** לגרד דרך `AudioBufferSourceNode`.
נמדד ב‑Chrome 148 דרך `OfflineAudioContext`: ב‑`playbackRate` ‏‎-1, ‎-0.5 ו‑0 הוא לא
מנגן אחורה ולא משתיק — **מצביע הקריאה קופא והצומת פולט את הדגימה האחרונה כ‑DC**.
לכן מקור הניגון הוחלף ב‑`AudioWorklet` עם מצביע קריאה **חתום**.

- `platform/audio-webaudio/scratch-processor.ts` — המעבד עצמו. **אסור שייבא כלום**:
  ל‑`AudioWorkletGlobalScope` אין DOM, וייבוא עקיף אחד שנוגע ב‑DOM הופך ל‑rejection
  אטום של `addModule`. הקצב הוא **AudioParam יחיד ב‑a-rate** — כך שעקומת עצירת
  הוויניל של v0.2.0b תהיה `linearRampToValueAtTime` בלי הודעות בכלל.
- `platform/audio-webaudio/players.ts` — `SourcePlayer` עם שני מימושים:
  `BufferSourcePlayer` (המנוע הישן, התנהגות זהה) ו‑`WorkletPlayer`. **מחלקת `Deck`
  אחת**, לא שני `DeckBackend` — כל מה שמ‑`trim` והלאה (EQ, פילטרים, gains, ניתוב)
  משותף, ורק ראש השרשרת מתחלף.
- **מיקום חוזר כ‑anchors ולא כמיקומים**: `{epoch, positionSec, ctxTimeSec}` בערך
  43 פעמים בשנייה, והצד הראשי מבצע אקסטרפולציה. **ה‑epoch חובה** — בלעדיו anchor
  שעדיין באוויר בזמן seek דורס את המיקום החדש וה‑playhead קופץ אחורה.
- **מתחת ל‑|rate| של 0.02 הפלט דועך לשקט.** מצביע עצור פולט DC; פטיפון במנוחה שותק.
- **סוף טראק הוא הודעה מפורשת.** ל‑worklet אין `onended`, ובלי ההודעה `playing`
  היה נשאר true לנצח בסוף כל טראק.

**סדר הטעינה ב‑`loadTrackToDeck` הפוך עכשיו** (`fe6ff9e`): מנתחים את ה‑buffer ואז
מוסרים אותו לדק, לא להפך. ה‑worklet מקבל את הדגימות ב‑transfer, מה שמנתק את
ה‑AudioBuffer — ובסדר הישן `analyzeWaveform`/`detectBpm`/`buffer.duration` היו
קוראים גופה. נמדד: ניתוח על buffer מנותק מחזיר **0 מתוך 600 דליים לא‑אפסיים,
שיא 0.0, ו‑`duration` עדיין מדווח 3 שניות — בלי לזרוק שום שגיאה.**
`Deck` מחזיק עכשיו `_hasTrack` ו‑`_durationSec` משלו במקום לשאול את ה‑buffer.

**אימות** (מול המודול שנשלח בפועל, דרך פרוטוקול ההודעות האמיתי שלו,
ב‑`OfflineAudioContext` — ל‑Node אין `OfflineAudioContext`, אז זו הצורה
המקבילה לסקריפט של v0.1.7, לא בדיקה מוחלשת):

| בדיקה | תוצאה |
| --- | --- |
| זהות למנוע הישן במהירות 1.0 | 43,700 דגימות, **0 שונות**, הפרש מקסימלי **0** |
| אחורה במהירות ‎-1 | **4500/4500** מדויק |
| מהירות 0 | **‎-999 dBFS** — שקט, לא DC |
| לולאה | שגיאה **0** מול המקור, שגיאת מחזוריות **0** |
| סוף טראק | **הודעה אחת** ב‑0.300 שנ' מתוך 0.300; 12 anchors |

**שני באגים שהאימות תפס והאוזן לא הייתה תופסת:**
1. **הגברת האנטי‑נקישה התנדנדה.** היא הוסיפה צעד בלי תנאי וקיצצה אחר כך, אז בהגיעה
   ל‑1.0 היא חרגה, ירדה, וחרגה שוב — אפנון משרעת 0.45% **כל דגימה שנייה**, כלומר
   ב‑Nyquist. התגלה כי **בדיוק חצי** מהדגימות נכשלו בהשוואת הזהות.
2. **`addModule` שמצליח לא מוכיח שהמעבד קיים.** מכוון אל מודול ה‑URL של Vite
   (92 בתים) הוא מחזיר "ok" ולא רושם כלום; הכשל היה מתגלה רק אחר כך. `ensureScratchEngine`
   בונה עכשיו probe node ובודק את פרמטר ה‑`rate` לפני שהוא מכריז על הצלחה.

**נפילה חזרה גלויה:** אם הוורקלט לא נטען, הדקים נשארים על המנוע הישן — שמנגן נכון
אבל לא יודע לגרד — וה‑TopBar מציג `no scratch · <סיבה>`. זה **הצרכן הראשון** של
תשתית ה‑capabilities מ‑v0.1.6, שעד היום לא היו לה צרכנים בכלל.

**Vite:** ‏`import url from './scratch-processor?worker&url'`. ה‑build מייצר
`dist/assets/scratch-processor-*.js` בגודל 2.37KB, IIFE עצמאי **בלי ייבואים**.

### לשיחה הבאה — v0.2.0b (הפלטר והג'וג)

1. **הפלטר קטן מדי כדי לגרד עליו.** `Deck.tsx` מעביר `size={54}` (דורס את 60 שב‑`Platter.tsx`)
   → **41px נתפסים ≈ 11 מ"מ**. היעד: **142 CSS px**, וזה **לא עולה שום גובה** —
   מפסיקים לערום את פאדר הטמפו מתחת לפלטר ומציבים אותם זה לצד זה:
   `142 + 4 + צ'יפ VINYL 32 = 178` בדיוק כמו גובה העמודה השמאלית.
   **רצפה: לא לשלוח פלטר אינטראקטיבי מתחת ל‑120 CSS px.**
2. **גרירה אופקית (ציר X), לא זווית.** ליד המרכז 1px = 5.7° ובשפה 0.77° — פי 7 הבדל
   בגיין לפי איפה שתפסת; ותנועה מהירה שחוצה 180° בין אירועים מתפרשת ב‑`atan2`
   ככיוון ההפוך. `Knob` כבר עושה בדיוק את זה — פקד עגול, גרירה ישרה.
3. **באג MIDI קיים שהעיצוב חשף:** ב‑`mappings/flx4.ts:23-24` גם CC `0x22` וגם `0x21`
   ממופים לאותה פעולה `jog`, ו‑`manager.ts:126-127` קורא ל‑`nudgeDeck` בלי תנאי.
   בחומרה אלה **שני פקדים פיזיים שונים** — `0x22` משטח המגע העליון (scratch),
   `0x21` טבעת הצד (bend בלבד). **כרגע מצב ויניל לא יכול לעבוד בחומרה.**
   צריך לפצל ל‑`jogScratch`/`jogBend` + `jogTouch` + `vinylMode` ב‑`ControlAction`,
   ב‑`dispatch`, ובפריסט.
4. **מקלדת:** bend כן (החזקה, ‎±4%, להתעלם מ‑`e.repeat`); scratch **לא** — מחווה
   רציפה לא ניתנת לביטוי במקש, ו"מקש scratch" היה פקד שנראה כמו פיצ'ר ואינו.
5. `useRenderLoop.ts:24` מעדכן רק כשההפרש > 0.001 שנ' — **גירוד איטי ייפול מתחת לסף
   והפלטר יקפא בזמן שהאודיו זז.** לעקוף את הסף כש‑`platterHeld`.
6. עדיין פתוח מ‑v0.1.7: **לאמת בעין** שעמודות Artist/BPM/Key/Time מתמלאות ושפריסת
   7 העמודות סבירה. הפרסר נבדק מול 360 קבצים; הטבלה עצמה לא נבדקה במסך.

**צילום מסך מה‑Browser pane לא עובד** בסביבה הזו ("pane is not displayed") —
המשתמש מסתכל ב‑Chrome האמיתי שלו. מה שכן עובד: `mcp__Claude_Browser__javascript_tool`
על tabId `seed` למדידת DOM, ו‑`read_console_messages` לשגיאות.
**שרת ה‑dev:** `preview_start` עם `name: soundgrid-dev` (ראה סעיף 1 בנוהל השיחה).
ההערה הישנה כאן — "השרת שייך לשיחה אחרת, להתחבר דרך `url`" — כבר לא נכונה:
אותו שרת מת עם השיחה שהרימה אותו, ואז 5173 היה ריק לגמרי. תמיד להרים חדש.

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
| 2026-08-29 | v0.2.0a ✅ | מנוע scratch: `AudioWorklet` עם מצביע קריאה חתום מחליף את `AudioBufferSourceNode` (שקופא ופולט DC באחורה/עצירה). `SourcePlayer` עם fallback גלוי, anchors+epoch למיקום, סוף‑טראק כהודעה. נמדד: זהות ביט‑לביט במהירות 1.0, 4500/4500 אחורה, ‎-999dBFS ב‑0. תפס אפנון Nyquist ב‑gain ו‑`addModule` שמשקר | — |
| 2026-08-28 | v0.1.7 ✅ | `library/tags.ts` — ID3v2/MP4/Vorbis/RIFF/AIFF + parseKey→Camelot; `readLibraryTags` פאס שני batched; עמודות Artist/Key; `mixRecommendations` עם התאמת סולם. נמדד: BPM 96.9%, Key 97.2%, Duration 100%, 0.6ש' על 360 קבצים | 🟢 מומלץ `/clear` |
