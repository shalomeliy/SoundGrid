# SoundGrid — מפת דרכים / Roadmap

תוכנית פיתוח מ‑MVP ועד `v1.0`.
כל גרסה עומדת בפני עצמה (בונה, נדחפת, שמישה). סדר הפיצ'רים גמיש — אפשר להזיז לפי צורך.

> כיווני ארכיטקטורה ארוכי‑טווח (תפרים/ports, שכבת AI, בידול מול Serato/rekordbox,
> חומרה): `docs/architecture/directions.md`. גרסאות ה‑`.5` למטה נגזרות משם.

**עקרונות מנחים**
- Chromium‑first (Web Audio / Web MIDI / File System Access / `setSinkId`).
- Controller‑first: כל פקד שעובד בעכבר חייב לעבוד גם דרך MIDI.
- אפס קוד/נכסים קנייניים מ‑Serato / rekordbox. קריאת תגיות מקבצים של המשתמש בלבד.
- כל שינוי מלווה ב‑build ירוק (`npm run build`) ובדיקת lint.

**סכימת גרסאות:** `0.MINOR.PATCH` עד `v1.0.0`. MINOR זוגי‑עגול = אבן דרך גדולה;
`.5` (v0.1.5, v0.4.5…) = יחידה קטנה/גזירה מ‑`directions.md` שנכנסת בין אבני הדרך.

| גרסה | נושא | סטטוס |
| --- | --- | --- |
| v0.1.0 | MVP — דקים, מיקסר, ספרייה, waveform, MIDI, פריסט FLX4 | ✅ הושלם |
| v0.1.5 | **Design overhaul** — שפת עיצוב חדשה, יפה מסראטו/רקורדבוקס | ✅ אושר ויזואלית ע"י המשתמש (2026-08-28) |
| v0.1.6 | **Seams** — ports/interfaces לפני שהקוד גדל (audio, transport, clock, caps) | ✅ |
| v0.1.7 | **Tag read** — קריאת BPM/key/duration/artist מתגיות הקבצים בזמן סריקה | ✅ |
| v0.2.0 | Jog wheels & scratching | 🔶 v0.2.0a (מנוע scratch) ✅ · v0.2.0b (פלטר/ג'וג) בעבודה |
| v0.3.0 | Beatgrid & phase‑sync | ⬜ |
| v0.4.0 | ניתוח מתמשך + מטא‑דאטה קבועה | ⬜ |
| v0.4.5 | סימון "השיר הבא" — הדגשת טראקים תואמים ל‑BPM/סולם של הדק המנגן | ⬜ (גרסה בסיסית ב‑v0.1.5) |
| v0.5.0 | Pad modes | ⬜ |
| v0.5.5 | שליטה בשפה טבעית / קול → `ControlAction` | ⬜ |
| v0.6.0 | Sampler / performance decks | ⬜ |
| v0.7.0 | FX units | ⬜ |
| v0.8.0 | ניהול ספרייה — crates, עמודות, היסטוריה | ⬜ |
| v0.8.5 | חיפוש סמנטי בספרייה (embeddings על האודיו) | ⬜ |
| v0.9.0 | זיהוי סולם + מיקס הרמוני | ⬜ |
| v0.9.5 | מצב קואצ'ינג — ביקורת AI על הסט (drift, EQ, מעברים, gain) | ⬜ |
| v0.10.0 | הקלטה + שידור | ⬜ |
| v0.11.0 | עורך מיפוי חומרה + LED feedback | ⬜ |
| v0.11.5 | Plugin API — `controls.ts` ציבורי, pad modes/FX/סקריפטים קהילתיים | ⬜ |
| v0.12.0 | שדרוג waveform (overview + צבע תדרים) | ⬜ |
| v0.13.0 | Auto‑mix / מעברים חכמים | ⬜ |
| v0.13.5 | קו‑פיילוט מיקס חי — הצעת טראק הבא + אזהרות בזמן אמת | ⬜ |
| v0.14.0 | מצב 4 דקים | ⬜ |
| v0.15.0 | מקורות ענן / סטרימינג + locker | ⬜ |
| v0.16.0 | Cue/loop שמורים לכל טראק + ייבוא תגיות | ⬜ |
| v0.17.0 | ליטוש UI + layouts + מגע | ⬜ |
| v0.18.0 | Latency ואיכות אודיו (AudioWorklet) | ⬜ |
| v0.19.0 | MIDI clock / Ableton Link | ⬜ |
| v0.20.0 | Stems + הפרדה בזמן אמת | ⬜ |
| v1.0.0 | יציבות, PWA, onboarding, טסטים, אריזה | ⬜ |

---

## v0.1.5 — Design Overhaul
**מטרה:** להחליף את ה‑UI ה"מגושם" בשפת עיצוב מוקפדת שנראית טוב יותר מ‑Serato ומ‑rekordbox.
הצבעים הנוכחיים (טורקיז/כתום לדקים, סגול accent) נשארים — הבעיה היא במבנה, בריווח, בטיפוגרפיה ובפקדים.
- **Design system:** קובץ tokens אחד (spacing scale, radii, elevation, type scale, motion),
  מעבר מ‑Tailwind ad-hoc לקומפוננטות עם וריאנטים עקביים
- **פקדים מקצועיים:** knobs עם arc/indicator אמיתי + ערך on-hover, faders עם פס אחיזה
  ו‑cap ריאליסטי, כפתורי transport עם משוב מצב ברור (idle/armed/active), טבעות סביב הג'וג
- **פריסה:** גריד מדויק, יישור אנכי של המיקסר לדקים, hierarchy ברור (שם טראק → זמן → BPM),
  צמצום borders/מסגרות כפולות, שימוש ב‑elevation במקום קווים
- **טיפוגרפיה:** פונט אחד איכותי (למשל Inter/Geist למספרים — tabular-nums), גדלים עקביים,
  labels בצורה אחידה (uppercase tracking בשליטה)
- **Waveform:** שדרוג צבע/עובי/רקע כך שייראה premium (מקדימה ל‑v0.12 המלא)
- **מצבים:** loading, empty, error — מעוצבים ולא טקסט חשוף
- **מיקרו‑אנימציות:** transitions על מצב כפתורים, פידבק לחיצה, ללא ג'אנק (60fps)
- **מצב כהה בלבד** (כמו עכשיו) אבל עם עומק — לא שטוח לגמרי
- שימוש בסקילים `ui-ux-review` + `drop-generic-design` לפני ואחרי
- **תוספות שנכנסו תוך כדי:** תיקון גלילת ספרייה · גרירת טראק מהספרייה לדק (DnD) ·
  גרסה בסיסית של סימון "השיר הבא" (ראה v0.4.5)
- **הושלם כאשר:** צילום מסך של SoundGrid ליד Serato/rekordbox — SoundGrid נראה נקי ומודרני יותר,
  וכל פקד קריא במבט חטוף. build + lint ירוקים, אין regression בפונקציונליות.
- **✅ אושר** ע"י המשתמש אחרי השוואה מול Serato על אותו מסך. הסבב האחרון (2026-08-28)
  תיקן שלושה דברים שההשוואה חשפה — פרטים ב‑`HANDOFF.md`:
  - **טיפוגרפיה מכוילת לגודל פיזי** — מסך 14" = 126 CSS px לאינץ' מול 96 בייחוס,
    כלומר הכל קטן ב‑24% ממה שהמספר אומר. Serato על אותו מסך צפוף יותר **וגם**
    קריא יותר: שורות ~31px עם טקסט ~16px. עברנו ל‑36px/14px (היה 44px/12px).
  - **צבעי סולם מגלגל Camelot** (OKLCH) — סולמות תואמים מקבלים גוונים שכנים,
    מתנגשים נופלים רחוק. ב‑Serato הצבע הוא תווית שרירותית; כאן הוא נושא מידע.
  - **ויוופורם בצבעי תדר** + תיקון רזולוציה, רוויה ונרמול.
- **⚠️ לא בוצע:** סבב `ui-ux-review` + `drop-generic-design` "אחרי" (היה בתכולה).

## v0.1.6 — Seams (ports/interfaces)
**מטרה:** להגדיר את התפרים תלויי‑הפלטפורמה כ‑interfaces לפני שהקוד גדל, כדי ש‑stack /
חומרה / backend יהיו ניתנים להחלפה ע"י adapter ולא כתיבה מחדש. פרטים מלאים:
`docs/architecture/directions.md`.
- `src/core/ports/` — interfaces: `AudioBackend`, `TrackSource`, `ControlTransport`,
  `Analyzer` + `AnalysisCache`, `Clock`, `Persistence`, `Capabilities`, `AIProvider` (stub)
- העברת הקוד הקיים למאחורי ה‑ports: `engine.ts`/`deck.ts` → `platform/audio-webaudio/`,
  `library.ts` → `platform/source-fsaccess/`, `midi/manager.ts` צד‑קלט → `transport-webmidi/`
- `Clock` יחיד מעל `audioContext.currentTime`; `useRenderLoop` נרשם אליו
- אובייקט `Capabilities` מחושב ב‑boot; ה‑UI מתדרדר בחן לפיו
- `dependency-cruiser` ב‑CI: `core/**` אסור לייבא `react`/`react-dom`/`*.tsx`
- **הושלם כאשר:** אין import של `AudioContext`/DOM/React ב‑`core/`; build + lint ירוקים;
  אפס שינוי התנהגות למשתמש.
- **✅ הושלם (2026-08-29).** ל‑`core/` שלושה imports בסך הכל, כולם פנימיים.
  `npm run check` = tsc + oxlint + dependency-cruiser, 0 errors.
  - `constants.ts` הועבר ל‑`core/` — הוא לא הכיל שום דבר Web Audio, ו‑`recommend.ts`
    (מודול טהור) ייבא ממנו `TEMPO_RANGE` דרך שכבת האודיו.
  - alias `@/*` במקום imports יחסיים: `../types` לא מסגיר לאיזו שכבה נכנסים,
    וכל הזזה שובר אותו.
  - **אזהרה שהושארה גלויה בכוונה:** `transport-webmidi/manager.ts` כותב ל‑store
    וקורא ל‑`controls.ts` ישירות במקום לפלוט `ControlAction` דרך ה‑port.
    ניתוקו הוא שינוי בפני עצמו; הכלל מונע מזה להפוך לנורמה בשקט.

## v0.1.7 — Tag read
**מטרה:** הנתונים כבר קיימים בקבצים (הספרייה מתויגת ע"י Serato — BPM ל‑410 טראקים,
key ל‑397). לקרוא, לא לנתח — כך עמודות ה‑BPM/Key/Time מתמלאות מיד לכל הספרייה,
בלי תלות במנוע הניתוח (v0.3/v0.4).
- קריאת תגיות בזמן `scanLibrary` (בלי decode של האודיו):
  - **ID3v2** (MP3): `TBPM`, `TKEY`/`TKE`, `TLEN`, `TPE1` (artist), `TIT2` (title), `TALB`
  - **MP4/M4A** atoms: `tmpo`, `----:com.apple.iTunes:initialkey`, `©ART`, `©nam`
  - **FLAC/OGG** Vorbis comments: `BPM`, `KEY`/`INITIALKEY`, `ARTIST`, `TITLE`
  - fallback ל‑GEOB של Serato (`Serato Autotags` → BPM+gain; ראה `docs/reference/serato-formats.md`)
- הוספת `key?`, `artist?`, `title?` ל‑`Track` (`types.ts`)
- הצגה בעמודות הספרייה; `mixRecommendations` משתמש ב‑key כשקיים (Camelot ±1)
- קריאה בלבד — לא כותבים חזרה לקבצים. ניתוח (v0.3/v0.4) גובר על ערך תגית אם קיים
- **הושלם כאשר:** סריקת הספרייה של המשתמש ממלאת BPM ו‑Key ל‑>90% מהטראקים בלי
  לטעון אף אחד לדק; אין האטה מורגשת בסריקה.
- **✅ הושלם.** נמדד על הספרייה של המשתמש (360 קבצים: 281 mp3, 40 wav, 39 m4a):
  **BPM 96.9% · Key 97.2% · Duration 100% · 0.6 שנייה** לכל הסריקה.
  ה‑11 שנשארו הם קובצי m4a שפשוט לא מתויגים (ריפים, לא באג).
  מה שנוסף מעבר לתכולה המקורית:
  - **RIFF/AIFF** — קבצי ה‑WAV מתויגים ע"י Serato בצ'אנק `ID3 ` **אחרי** צ'אנק
    ה‑`data`, לכן ההליכה על הצ'אנקים היא seek לפי offset ולא חלון קריאה מהתחלה
    (בלי זה 40 קבצים נשארו ריקים).
  - **duration אמיתי לכל פורמט** — Xing/VBRI או bitrate ל‑MP3, `mvhd` ל‑MP4,
    `STREAMINFO` ל‑FLAC, `fmt`+`data` ל‑WAV, `COMM` ל‑AIFF. TLEN כמעט לא קיים בפועל.
  - **נרמול סולם** — `parseKey` מקבל כתיב מוזיקלי (`Am`, `F#m`, `A minor`),
    Camelot (`8A`) ו‑Open Key (`1m`) ומחזיר קוד Camelot אחד + כתיב תצוגה אחיד
    (`Gbm` → `F#m`). `Track` קיבל `key`+`camelot`.
  - `mixRecommendations` — התנגשות סולם מורידה התאמת‑טמפו הדוקה ל‑loose,
    אף פעם לא מסננת החוצה. עמודות Artist ו‑Key בספרייה; הפילטר מחפש גם באמן/כותרת.

## v0.2.0 — Jog Wheels & Scratching
**מטרה:** לגעת בג'וג של ה‑FLX4 ולנגן איתו — scratch, pitch‑bend, עצירה.

> **v0.2.0a — מנוע ה‑scratch ✅ (2026-08-29).** התברר ש‑`AudioBufferSourceNode` של
> Chrome לא מסוגל לגרד: במהירות ‎-1/‎-0.5/0 מצביע הקריאה קופא ופולט DC (נמדד ב‑148).
> לכן מקור הניגון הוחלף ב‑`AudioWorklet` עם מצביע חתום, מאחורי `SourcePlayer` עם
> נפילה חזרה **גלויה** למנוע הישן. ניגון רגיל זהה ביט‑לביט. פרטים ומספרים ב‑`HANDOFF.md`.
> **v0.2.0b** הוא כל מה שלמטה: המחווה, הפלטר, מצב ויניל, והעצירה.
- זיהוי מגע בג'וג (`note` על הפלטר) → מצב scratch מול מצב bend
- מנוע scratch: מיפוי דלתא ג'וג למהירות/כיוון של ה‑`AudioBufferSourceNode` בזמן אמת
- Vinyl braking (עצירה/התנעה עם עקומת האטה), כפתור "vinyl mode"
- Pitch‑bend זמני בזמן שהדק מנגן (בלי לגעת ב‑tempo)
- **הושלם כאשר:** אפשר לגרד ידנית עם הג'וג ולנגן bend מבלי ש‑playhead קופץ.

## v0.3.0 — Beatgrid & Phase Sync
**מטרה:** רשת ביט אמינה ו‑SYNC שמיישר גם פאזה, לא רק BPM.
- זיהוי downbeat ראשוני, שמירת beatgrid (offset + BPM) לטראק
- עריכת רשת ידנית: הזזה, half/double, "set downbeat here", tap‑tempo
- Phase‑align ב‑SYNC: יישור הביט הקרוב לדק המאסטר
- Quantize ל‑hot cues, loops, ו‑beat‑jump
- בורר "master deck" ידני/אוטומטי
- **הושלם כאשר:** שני טראקים באותו BPM נשארים בפאזה אחרי SYNC לאורך 2 דקות.

## v0.4.0 — ניתוח מתמשך + מטא‑דאטה קבועה
**מטרה:** לנתח פעם אחת, לזכור לתמיד.
- Web Worker לניתוח ברקע (decode, peaks, BPM, beatgrid) עם תור ומגבלת concurrency
- מטמון ב‑IndexedDB לפי hash קובץ: peaks, BPM, grid, duration, cue points
- אינדיקציית "מנותח / בתור / נכשל" בספרייה, ניתוח באצווה של תיקייה שלמה
- טעינת דק מיידית ממטמון (בלי המתנה לניתוח)
- **הושלם כאשר:** טעינה שנייה של אותו טראק היא < 200ms ללא ניתוח מחדש.

## v0.4.5 — סימון "השיר הבא"
**מטרה:** כשדק מנגן, הספרייה מדגישה (bold + סמן) טראקים שמתמזגים איתו יפה.
גרסה בסיסית כבר קיימת מ‑v0.1.5 (התאמת BPM לטראקים שכבר נותחו). כאן הופכים אותה
לאמינה ולעשירה על בסיס הניתוח המתמשך של v0.4.
- דירוג התאמה מול הדק/ים המנגנים: קרבת BPM (כולל half/double‑time), קרבת סולם
  (Camelot ±1 / relative — תלוי v0.9 לזיהוי אמיתי), קרבת אנרגיה
- הדגשה מדורגת: התאמה חזקה = bold + נקודה בצבע הדק; בינונית = עמעום קל של השאר
- טוגל "recommendations" + סינון "רק תואמים"; מתעדכן חי עם שינוי tempo/טראק
- העמודה/סימון לא מסתמכים על צבע בלבד (נגישות)
- **הושלם כאשר:** החלפת טראק בדק מעדכנת את ההדגשות < 100ms; טראק ב‑±6% BPM
  ובמפתח תואם מודגש, טראק לא‑תואם לא.

## v0.5.0 — Pad Modes
**מטרה:** גריד הפדים עושה יותר מ‑hot cues.
- מצבים: Hot Cue, Auto Loop, Loop Roll, Beat Jump, Sampler (מעבר במצב + shift)
- שכבת shift גלובלית לפקדים (כפתור SHIFT בקונטרולר / מקש)
- אינדיקציה ויזואלית של המצב הפעיל לכל דק, צבעי פדים לפי מצב
- מיפוי FLX4: כפתורי בחירת מצב הפדים (Hot Cue / Pad FX / Beat Jump / Sampler)
- **הושלם כאשר:** אפשר להחליף מצב פדים מהקונטרולר וכל מצב מפעיל את הפעולה הנכונה.

## v0.5.5 — שליטה בשפה טבעית / קול
**מטרה:** לומר/להקליד "לופ על הדרופ 8 תיבות", "תכניס אקפלה מדק B", "פילטר סוויפ
לתוך הברייקדאון" — וזה קורה. אפשרי רק אחרי ש‑`controls.ts` בשל (v0.5). ראה
`docs/architecture/directions.md` §4.
- שכבת translate: טקסט → `ControlAction[]` דרך `AIProvider` (tool‑calling מול
  קטלוג הפעולות של `controls.ts`). **לא עוקפת את ה‑choke point**
- `AIProvider` model‑agnostic: מקומי (WebGPU/WASM) · מפתח API של המשתמש · self‑hosted
- קלט קול דרך Web Speech API (אופציונלי, מאחורי capability)
- הכל אופציונלי — כבוי כברירת מחדל, האפליקציה עובדת מלא בלעדיו
- **הושלם כאשר:** 10 פקודות נפוצות מתורגמות נכון לפעולות; פקודה לא ברורה מחזירה
  בקשת הבהרה ולא פעולה שגויה.

## v0.6.0 — Sampler / Performance Decks
**מטרה:** בנק סאמפלים שמתנגן בסנכרון.
- בנק של 8–16 slots, טעינה מהספרייה או הקלטה מהמאסטר
- לכל slot: gain, מצב (one‑shot / loop / gated), sync ל‑BPM המאסטר, trigger מ‑pad
- ערוץ sampler נפרד במיקסר (volume + לכיוון master/cue)
- שמירת בנקים ל‑IndexedDB, ייצוא/ייבוא בנק
- **הושלם כאשר:** הפעלת slot ב‑loop נשארת בסנכרון עם דק שמנגן.

## v0.7.0 — FX Units
**מטרה:** אפקטים מסונכרני‑ביט.
- שני FX racks, כל אחד: בחירת אפקט, wet/dry, זמן (1/4…4 beats), on/off
- אפקטים: Delay, Echo, Reverb, Filter (LP/HP), Flanger, Phaser, Bit Crusher, Roll
- ניתוב FX: לכל ערוץ / מאסטר / send
- מיפוי FX ל‑FLX4 (beat knob, לחצני on, paddle) ול‑MIDI Learn
- מימוש דרך גרף Web Audio; אפקטים כבדים כ‑`AudioWorklet`
- **הושלם כאשר:** Delay 1/4 על דק ב‑128 BPM מתיישר לביט בשמיעה.

## v0.8.0 — ניהול ספרייה
**מטרה:** ספרייה שאפשר לעבוד איתה על אלפי טראקים.
- Crates / playlists (עץ), גרירת טראקים לתוכם, crates חכמים (סינון שמור)
- עמודות: אמן, שם, BPM, key, זמן, דירוג, הערה, נגן לאחרונה — מיון וסינון
- פרסינג תגיות ID3 / Vorbis / MP4 (אמן/כותרת/אלבום/artwork)
- History / session log של מה שנוגן, ייצוא רשימת סט
- חיפוש מהיר עם אינדקס (שם/אמן/BPM range/key)
- **הושלם כאשר:** ספרייה של 5,000 טראקים נגללת ומסתננת ב‑60fps.

## v0.8.5 — חיפוש סמנטי בספרייה
**מטרה:** "פסייטראנס 138 פיק‑טיים שמתמזג מזה", "טראקים שנשמעים כמו זה" — מעבר לתגיות.
- audio embeddings דרך `Analyzer` (מודל on‑device: CLAP‑style / MFCC+ML), נשמרים
  ב‑`AnalysisCache` לפי hash תוכן, ניידים בין מכשירים
- חיפוש קרבה (cosine) + סינון היברידי עם המטא‑דאטה הקיים
- "more like this" מטראק נבחר או מהדק המנגן
- הכל מקומי; אין שליחת אודיו לרשת
- **הושלם כאשר:** "more like this" על טראק מחזיר 10 תוצאות סבירות מספרייה של 1000+.

## v0.9.0 — זיהוי סולם + מיקס הרמוני
**מטרה:** לדעת את הסולם ולמזג לפיו.
- זיהוי key (chroma + template matching), תצוגת Camelot + מוזיקלי
- Key‑lock (master tempo) — שינוי tempo בלי שינוי pitch (phase vocaser / `AudioWorklet`)
- Key‑sync: התאמת pitch של דק לדק השני
- הדגשה בספרייה של טראקים תואמים הרמונית לדק המנגן
- **הושלם כאשר:** key‑lock ב‑±8% לא משנה גובה צליל בשמיעה; זיהוי key נכון ב‑>70% במדגם.

## v0.9.5 — מצב קואצ'ינג
**מטרה:** ביקורת AI על הביצוע — משהו שאין לו מקבילה טובה ב‑Serato/rekordbox. ענק
ל‑DJ שלומד. ראה `docs/architecture/directions.md` §4–§5.
- מדדים אובייקטיביים (בלי AI): beat drift בין הדקים, התנגשות EQ (אנרגיה חופפת
  בבנד), קפיצות gain, אורך מעבר, clipping על המאסטר
- שכבת AI: סיכום מילולי אחרי הסט ("המעבר ב‑12:30 היה חד; ה‑bass של שני הדקים רץ
  יחד 8 שניות") + נדנוד עדין בזמן אמת (אופציונלי, כבוי כברירת מחדל)
- session log מוקלט (פעולות + מדדים) → ניתן לצפייה חוזרת ולייצוא
- **הושלם כאשר:** אחרי סט של 20 דק' מתקבל דו"ח עם 3+ הערות ממוקדות‑זמן ומדדים.

## v0.10.0 — הקלטה + שידור
**מטרה:** להקליט את הסט ולשדר.
- הקלטת המאסטר ל‑WAV/FLAC/OGG דרך `MediaRecorder` / worklet, כולל מד זמן וגודל
- חלוקה לקבצים לפי טראק (cue markers), ייצוא cue sheet
- שידור אופציונלי ל‑Icecast/SHOUTcast (WebSocket/HTTP), בקרת bitrate
- הגנת clipping — לימיטר על המאסטר לפני ההקלטה
- **הושלם כאשר:** הקלטה של 30 דק' יוצאת ללא drift וללא clipping.

## v0.11.0 — עורך מיפוי חומרה + LED Feedback
**מטרה:** להתאים כל קונטרולר, לא רק FLX4.
- UI ויזואלי למיפוי: בחר פעולה → הזז פקד → נשמר
- פריסטים מרובים, ייבוא/ייצוא JSON, שיתוף פריסטים
- MIDI output — הדלקת LED/טבעות לפי מצב (play, cue, loop, pad)
- טיפול ב‑14‑bit faders, soft‑takeover לפקדים אבסולוטיים
- פריסטים נוספים: DDJ‑FLX2, DDJ‑REV1, generic 2‑channel
- **הושלם כאשר:** משתמש ממפה קונטרולר לא מוכר במלואו בלי לגעת בקוד.

## v0.11.5 — Plugin API
**מטרה:** SoundGrid extensible — משהו ש‑Serato/rekordbox לא באמת מאפשרים.
- `controls.ts` נחשף כ‑API ציבורי יציב + מודל אירועים (state, ControlAction log, clock)
- plugins בארגז חול: pad modes מותאמים, FX (Web Audio graph), סקריפטים, פאנלים ב‑UI
- מניפסט + הרשאות מפורשות; טעינה מ‑URL / קובץ מקומי
- דוגמאות ראשונות: pad mode "beat repeat", FX "gater", פאנל "set notes"
- **הושלם כאשר:** plugin חיצוני מוסיף pad mode עובד בלי build מחדש של הליבה.

## v0.12.0 — שדרוג Waveform
**מטרה:** waveform ברמת Serato.
- Overview מלא של הטראק + waveform מזוום, גרירה על ה‑overview לניווט
- צביעת RGB לפי תדר (פיצול 3 בנדים → low=אדום, mid=ירוק, high=כחול)
- רינדור ב‑`OffscreenCanvas` / WebGL לביצועים
- סימוני cue/loop/grid על שני התצוגות, "needle drop" מדויק
- מצב waveform אנכי / אופקי, waveform תואם לזוג דקים (stacked)
- **הושלם כאשר:** שני waveforms + overview רצים יחד ב‑60fps.

## v0.13.0 — Auto‑Mix / מעברים חכמים
**מטרה:** תור שמתנגן לבד עם מעברים סבירים.
- תור השמעה (drag מהספרייה), auto‑load לדק הפנוי
- זיהוי intro/outro, crossfade אוטומטי בנקודה הנכונה עם beat‑match
- אסטרטגיות מעבר: cut, fade, EQ blend; משך מתכוונן
- סידור תור לפי אנרגיה / key / BPM proximity
- **הושלם כאשר:** 5 טראקים בתור מתנגנים רצף שעה ללא התערבות ובלי train‑wreck.

## v0.13.5 — קו‑פיילוט מיקס חי
**מטרה:** לא auto‑mix — עוזר שממשיך לתת לך לנגן, אבל מייעץ בזמן אמת. ה‑moat
האמיתי מול Serato/rekordbox. ראה `docs/architecture/directions.md` §4.
- הצעת "השיר הבא" חכמה (מעל v0.4.5): מדרג את התור/הספרייה לפי התאמה לדק המנגן +
  קשת אנרגיה של הסט עד עכשיו
- אזהרות חיות: "התנגשות הרמונית", "שני basslines רצים יחד", "האנרגיה יורדת 3 טראקים"
- הצעת נקודת מעבר ("הבא את דק B ב‑phrase הבא, ~0:24 מכאן")
- הכל הצעות בלבד — דרך `controls.ts`, המשתמש מחליט. אופציונלי, כבוי כברירת מחדל
- **הושלם כאשר:** במהלך סט חי הקו‑פיילוט מציע טראק הבא סביר ומזהה לפחות סוג אחד
  של train‑wreck לפני שהוא קורה.

## v0.14.0 — מצב 4 דקים
**מטרה:** C ו‑D.
- דקים C/D עם אותו מנוע, layout 2×2 או deck‑focus
- "deck switch" בקונטרולר 2‑ערוצי (כפתור shift מחליף בין A/C ו‑B/D)
- מיקסר 4 ערוצים, crossfader assign (thru / A / B) לכל ערוץ
- **הושלם כאשר:** 4 טראקים מנגנים בו‑זמנית עם ניתוב crossfader נכון.

## v0.15.0 — מקורות ענן / סטרימינג
**מטרה:** לא רק קבצים מקומיים.
- שכבת מקור מופשטת (`TrackSource`): local FS, URL, ספק מקושר
- אינטגרציה עם שירותי סטרימינג לפי מה שה‑TOS מתיר (OAuth של המשתמש, ניגון דרך ה‑SDK הרשמי)
- Locker: קבצים שהמשתמש מעלה ל‑storage שלו, cache אופליין (Cache API)
- טיפול ב‑buffering / התנתקות באמצע טראק
- **הושלם כאשר:** אפשר לטעון לדק טראק ממקור מקושר ולנגן אותו יציב.

## v0.16.0 — Cue/Loop שמורים + ייבוא תגיות
**מטרה:** נקודות שמורות לכל טראק.
- Memory cues + saved loops לכל טראק ב‑IndexedDB, קפיצה מהירה ביניהם
- Loop rolls, saved loops עם שם, beat‑jump מתוך cue
- ייבוא read‑only של beatgrid/cues מקבצי המשתמש (GEOB/Serato Markers, rekordbox XML) — רק מהקבצים שלו
- ייצוא ה‑crates/cues של SoundGrid ל‑JSON
- **הושלם כאשר:** טעינת טראק מציגה את כל ה‑cues השמורים; ייבוא XML של rekordbox עובד.

## v0.17.0 — ליטוש UI + Layouts + מגע
**מטרה:** ממשק ביצוע רציני.
- פאנלים ניתנים לשינוי גודל/הסתרה, layout presets (2‑deck / 4‑deck / library‑focus)
- מצב ביצוע מסך‑מלא, deck skins / themes
- תמיכת מגע (טאבלט): פדים גדולים, גלילת ספרייה, ג'וג וירטואלי
- קיצורי מקלדת מלאים + עורך קיצורים
- נגישות: ARIA לכל הפקדים, ניווט מקלדת, ניגודיות
- **הושלם כאשר:** אפשר לנהל סט שלם על טאבלט בלי עכבר.

## v0.18.0 — Latency ואיכות אודיו
**מטרה:** צליל הדוק ונקי.
- מעבר המנוע ל‑`AudioWorklet` (mixing, scratch, key‑lock ב‑worklet thread)
- בחירת buffer size / latency hint, מדידת latency בפועל והצגה
- הנחיות ASIO / WASAPI exclusive ב‑Windows, טיפול ב‑sample‑rate mismatch
- לימיטר + soft‑clip על המאסטר, מד VU/peak אמיתי, gain staging
- Dithering בהקלטה
- **הושלם כאשר:** round‑trip latency < 15ms על FLX4 עם דרייבר; אין xruns בסט של שעה.

## v0.19.0 — MIDI Clock / Ableton Link
**מטרה:** סנכרון עם ציוד חיצוני.
- שליחה/קבלה של MIDI clock (24 ppqn), start/stop
- Ableton Link (session tempo, phase) — דרך WASM port או שרת גשר מקומי
- SoundGrid כ‑master או slave, הצגת peers
- **הושלם כאשר:** דראם מכונה חיצונית נשארת נעולה ל‑BPM של SoundGrid.

## v0.20.0 — Stems + הפרדה בזמן אמת
**מטרה:** לשלוט בתופים/בס/ווקאל/מלודיה בנפרד.
- מודל הפרדת stems on‑device (WASM / WebGPU), ניתוח מראש ל‑4 ערוצי stem
- פאדרי stem + mute/solo לכל דק, מיפוי לקונטרולר
- פדים: acapella / instrumental / drums‑only בלחיצה
- Fallback: אם אין GPU — הפרדה offline בלבד עם מטמון
- **הושלם כאשר:** mute של ערוץ ה‑vocal בזמן ניגון נשמע נקי וללא latency מורגש.

## v1.0.0 — יציבות ושחרור
**מטרה:** מוצר שאפשר לתת לאנשים.
- PWA — התקנה, עבודה אופליין, service worker
- שמירת כל ההגדרות (audio, MIDI, layout, themes) + פרופילים
- Onboarding: בחירת קונטרולר, בחירת פלט, סריקת ספרייה — wizard
- חבילת טסטים: unit למנוע האודיו/analyze, e2e לזרימות מפתח, CI
- תיעוד משתמש + תיעוד מיפוי, דף נחיתה
- אופציונלי: build דסקטופ ב‑Tauri לגישת אודיו נייטיב (ASIO)
- **הושלם כאשר:** משתמש חדש מתקין, מחבר FLX4, ומנגן סט תוך 5 דקות בלי עזרה.

---

## רעיונות ל‑post‑1.0 (לא ממוספר)
- שיתוף פעולה לייב (שני DJ, WebRTC), video mixing, ניתוח sentiment של קהל,
  MIDI mapping marketplace, ענן sync של הספרייה בין מכשירים, גרסת מובייל מלאה.
