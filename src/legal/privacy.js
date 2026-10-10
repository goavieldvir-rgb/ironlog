// The privacy notice, kept in source like the terms so git shows exactly
// what each version said. It is shown on the /privacy page, in the consent
// screen and (via the terms) is referred to in the wording people accept.
//
// Raising PRIVACY_VERSION is only a marker for you; the thing that asks
// people to accept again is TERMS_VERSION in terms.js, so bump that too
// whenever this changes in a way people should agree to.
//
// NOT LEGAL ADVICE. This is a plain-language starting point written to be
// clear and calm rather than dramatic. Have an Israeli lawyer review it
// before relying on it — especially the health-data, minors and
// international-transfer parts.

export const PRIVACY_VERSION = 1

// MUST be filled in before merging: the person responsible for the data and
// how to reach them. These appear in the notice below.
export const COACH_NAME = '[COACH NAME]'
export const COACH_CONTACT = '[CONTACT EMAIL]'

export const privacy = {
  en: {
    title: 'Privacy notice',
    updated: 'Version 1',
    sections: [
      {
        heading: 'Who is responsible',
        body: `${COACH_NAME}, your coach, is responsible for the information in Ironlog. For any question about your data, write to ${COACH_CONTACT}.`,
      },
      {
        heading: 'What is collected',
        body:
          'Your account email and name. The workouts, sets and notes you log, and your body weight if you choose to record it. If you are under 18, the name and contact of your parent or guardian. A record that you accepted the terms, with the date and the wording you saw. Your reminder settings and, if you turn reminders on, the address your phone or browser gives the app so it can send them. Technical error reports when something breaks, which include the page address and the error text. The photo you pick for a share card stays on your phone and is never uploaded.',
      },
      {
        heading: 'Health and fitness data',
        body:
          'What you log about your training and body is health and fitness information, which is sensitive. It is processed only with the consent you give when you accept the terms, and only to run your training.',
      },
      {
        heading: 'Who can see it',
        body:
          'You and your coach. Your coach is automatically alerted by email and phone notification when you set a personal record or haven\'t trained for a while, and those alerts include your name and the exercise or record. Other trainees cannot see it. It is not sold, not used for advertising, and there is no analytics or tracking in the app.',
      },
      {
        heading: 'Services the app relies on',
        body:
          'Supabase stores the database and handles sign-in. Its servers are in Japan (the Tokyo region).\n\nGitHub Pages hosts the app files. Like any website, it sees your IP address when you open the app.\n\nGoogle Fonts supplies the fonts. They load from Google, which sees your IP address.\n\nYouTube shows the exercise demo videos through the YouTube player. The player loads from YouTube only when you open a video. YouTube\'s Terms of Service (https://www.youtube.com/t/terms) and Google\'s Privacy Policy (https://policies.google.com/privacy) apply to it.\n\nThe push services of your phone or browser maker (Apple, Google, Mozilla, Microsoft) deliver reminders. They only see the encrypted message.\n\nResend sends the coach email alerts (your name and the alert text).\n\nntfy.sh delivers alerts to the coach\'s phone (your name and the alert text).',
      },
      {
        heading: 'Storage on your device',
        body:
          'The app keeps your sign-in, your language and your unsaved workout draft in your browser\'s local storage. It does not use advertising cookies.',
      },
      {
        heading: 'How long it is kept',
        body:
          'While your account exists. Deleting your account removes your data, including the record that you accepted the terms. Error reports are deleted after 90 days; if you delete your account sooner, they stay until then without your name. Backups are cleared by the host on its normal cycle.',
      },
      {
        heading: 'Your rights',
        body:
          `You can download your information and delete your account from the Account page. To correct something, edit it in the app where it was logged, or ask your coach at ${COACH_CONTACT}. You can turn reminders off at any time. You can complain to Israel's Privacy Protection Authority, and if you are in the EU, to your local data protection authority.`,
      },
      {
        heading: 'Under 18',
        body: 'If you are under 18, a parent or guardian needs to agree before you use the app.',
      },
      {
        heading: 'Changes',
        body: 'If anything important changes, you will be asked to accept again.',
      },
    ],
  },

  he: {
    title: 'הודעת פרטיות',
    updated: 'גרסה 1',
    sections: [
      {
        heading: 'מי אחראי',
        body: `${COACH_NAME}, המאמן שלכם, אחראי למידע ב-Ironlog. לכל שאלה על המידע שלכם אפשר לכתוב אל ${COACH_CONTACT}.`,
      },
      {
        heading: 'מה נאסף',
        body:
          'האימייל והשם של החשבון. האימונים, הסטים וההערות שתיעדתם, ומשקל הגוף אם בחרתם לתעד אותו. אם אתם מתחת לגיל 18 — שם ופרטי קשר של ההורה או האפוטרופוס. רישום על כך שאישרתם את התנאים, עם התאריך והנוסח שראיתם. הגדרות התזכורות שלכם, ואם הפעלתם תזכורות — הכתובת שהטלפון או הדפדפן נותנים לאפליקציה כדי לשלוח אותן. דוחות שגיאה טכניים כשמשהו מתקלקל, שכוללים את כתובת הדף ואת טקסט השגיאה. התמונה שבחרתם לכרטיס שיתוף נשארת בטלפון שלכם ולא מועלית לשום מקום.',
      },
      {
        heading: 'מידע על בריאות וכושר',
        body:
          'מה שתיעדתם על האימון והגוף שלכם הוא מידע על בריאות וכושר, והוא רגיש. הוא מעובד רק בהסכמה שנתתם כשאישרתם את התנאים, ורק כדי לנהל את האימון שלכם.',
      },
      {
        heading: 'מי יכול לראות',
        body:
          'אתם והמאמן. המאמן מקבל התראה אוטומטית באימייל ובהודעה לטלפון כשקבעתם שיא אישי או כשלא התאמנתם זמן מה, וההתראות כוללות את שמכם ואת התרגיל או השיא. מתאמנים אחרים אינם רואים. המידע לא נמכר, לא משמש לפרסום, ואין באפליקציה ניתוח נתונים או מעקב.',
      },
      {
        heading: 'שירותים שהאפליקציה נשענת עליהם',
        body:
          'Supabase מאחסן את מסד הנתונים ומטפל בכניסה לחשבון. השרתים שלו ביפן (אזור טוקיו).\n\nGitHub Pages מארח את קבצי האפליקציה. כמו בכל אתר, הוא רואה את כתובת ה-IP שלכם כשאתם פותחים את האפליקציה.\n\nGoogle Fonts מספק את הגופנים. הם נטענים מ-Google, שרואה את כתובת ה-IP שלכם.\n\nYouTube מציג את סרטוני ההדגמה של התרגילים דרך נגן YouTube. הנגן נטען מ-YouTube רק כשאתם פותחים סרטון. עליו חלים תנאי השימוש של YouTube (https://www.youtube.com/t/terms) ומדיניות הפרטיות של Google (https://policies.google.com/privacy).\n\nשירותי ההודעות של יצרן הטלפון או הדפדפן (Apple, Google, Mozilla, Microsoft) מעבירים את התזכורות. הם רואים רק הודעה מוצפנת.\n\nResend שולח למאמן התראות באימייל (שמכם וטקסט ההתראה).\n\nntfy.sh מעביר התראות לטלפון של המאמן (שמכם וטקסט ההתראה).',
      },
      {
        heading: 'אחסון במכשיר שלכם',
        body:
          'האפליקציה שומרת את הכניסה לחשבון, את השפה ואת טיוטת האימון שלא נשמרה באחסון המקומי של הדפדפן. היא לא משתמשת בעוגיות פרסום.',
      },
      {
        heading: 'כמה זמן זה נשמר',
        body:
          'כל עוד החשבון קיים. מחיקת החשבון מסירה את הנתונים שלכם, כולל הרישום על כך שאישרתם את התנאים. דוחות שגיאה נמחקים אחרי 90 יום; אם תמחקו את החשבון לפני כן, הם יישארו עד אז בלי שמכם. הגיבויים מתנקים אצל המארח במחזור הרגיל שלו.',
      },
      {
        heading: 'הזכויות שלכם',
        body:
          `אפשר להוריד את המידע שלכם ולמחוק את החשבון מעמוד החשבון. כדי לתקן משהו, ערכו אותו באפליקציה במקום שבו תועד, או פנו למאמן בכתובת ${COACH_CONTACT}. אפשר לכבות תזכורות בכל עת. אפשר להגיש תלונה לרשות להגנת הפרטיות בישראל, ומי שנמצא באיחוד האירופי יכול לפנות גם לרשות להגנת מידע המקומית שלו.`,
      },
      {
        heading: 'מתחת לגיל 18',
        body: 'אם אתם מתחת לגיל 18, נדרשת הסכמה של הורה או אפוטרופוס לפני השימוש באפליקציה.',
      },
      {
        heading: 'שינויים',
        body: 'אם משהו חשוב ישתנה, תתבקשו לאשר שוב.',
      },
    ],
  },
}
