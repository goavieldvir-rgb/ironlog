// The wording people accept, kept in source on purpose: git is the record
// of exactly what version 1 said versus version 2, which is what makes a
// stored acceptance meaningful.
//
// Raising TERMS_VERSION asks everyone to accept again next time they open
// the app. Earlier acceptances stay in the log, so the chain is kept.
//
// NOT LEGAL ADVICE. This is a plain-language starting point written to be
// clear and calm rather than dramatic. Have an Israeli lawyer review it
// before relying on it — especially the injury and minors sections.

export const TERMS_VERSION = 2
export const TERMS_DOC_KEY = 'training-terms'

export const terms = {
  en: {
    adult: {
      title: 'Before you start',
      intro:
        'Ironlog is a training log shared between you and your coach. Please read this once and accept it to continue.',
      sections: [
        {
          heading: 'Training involves risk',
          body:
            'Lifting weights and exercising carry a risk of injury. You take part at your own risk and are responsible for training within your ability, using equipment properly, and stopping when something hurts. If you have an injury, a medical condition, are pregnant, or have been away from training for a long time, check with a doctor before starting.',
        },
        {
          heading: 'This is coaching, not medical advice',
          body:
            'Your coach plans and reviews your training. Nothing here is medical advice, diagnosis or treatment, and it does not replace a doctor or physiotherapist. Tell your coach about injuries, pain or health conditions that affect your training, and follow medical advice over anything in the app.',
        },
        {
          heading: 'What the app stores',
          body:
            'The workouts you log, the exercises and routines you create, your notes, and your body weight if you choose to record it. Your name and email come from your account. This includes health and fitness information. By accepting, you explicitly agree to it being processed for your training as described in the Privacy notice. It is kept so you can see your own history and so your coach can follow your progress.',
        },
        {
          heading: 'Who can see it',
          body:
            'You and your coach. Your coach can open your account to build routines, review sessions and leave feedback, and is automatically alerted by email and phone notification when you set a personal record or have not trained for a while. Those alerts include your name and the exercise or record. Other trainees cannot see your data. It is not sold, and it is not used for advertising.',
        },
        {
          heading: 'Where it is kept',
          body:
            'On Supabase, a hosting service, on servers in Japan. It is kept while your account exists. The Privacy notice lists every service involved.',
        },
        {
          heading: 'Your data is yours',
          body:
            'From the Account page you can download everything you have logged at any time, and delete your account. Deleting it permanently removes your data, including the record that you accepted these terms; error reports are kept without your name for up to 90 days. Backups are cleared by the host on its normal cycle. You can also ask your coach to do either for you.',
        },
        {
          heading: 'Keeping it honest',
          body:
            'Use the app for your own training. Do not share your login. If something looks wrong in your data, tell your coach.',
        },
        {
          heading: 'Limits of responsibility',
          body:
            'To the extent the law allows, your coach is not liable for injury or loss that comes from training you choose to do, from incorrect data you enter, or from the app being unavailable. Nothing here limits liability that the law does not allow to be limited, for example in cases of gross negligence.',
        },
        {
          heading: 'Changes and ending',
          body:
            'Your coach may update these terms and will ask you to accept again when they do. Either of you can stop at any time, and you can delete your account whenever you like.',
        },
        {
          heading: 'Governing law',
          body: 'These terms are governed by Israeli law, and the courts in Israel decide any dispute.',
        },
      ],
      accept: 'I have read and accept the above',
    },
    minor: {
      title: 'Before you start',
      intro:
        'You have said you are under 18. You can still use Ironlog, with a parent or guardian involved. Please read this with them.',
      sections: [
        {
          heading: 'A parent or guardian needs to agree',
          body:
            'Because you are under 18, a parent or guardian has to agree to you training with this coach and to your training data being kept here. Fill in their name and how to reach them below. Your coach will contact them to confirm before, or shortly after, you start.',
        },
        {
          heading: 'Training involves risk',
          body:
            'Lifting weights and exercising carry a risk of injury. Train within your ability, use equipment the way you were shown, and stop if something hurts. If you have an injury or a medical condition, a doctor should say it is fine before you start.',
        },
        {
          heading: 'This is coaching, not medical advice',
          body:
            'Your coach plans and reviews your training. Nothing here is medical advice and it does not replace a doctor or physiotherapist. Tell your coach and your parent or guardian about any pain or injury.',
        },
        {
          heading: 'What the app stores and who sees it',
          body:
            'The workouts you log, your exercises and routines, your notes, and your body weight if you record it, along with your name and email. This includes health and fitness information. By accepting, you and your parent or guardian explicitly agree to it being processed for your training as described in the Privacy notice. It is kept on Supabase servers in Japan, and the Privacy notice lists every service involved. You and your coach can see it, and your coach is automatically alerted by email and phone notification, including your name and the exercise or record, when you set a personal record or have not trained for a while. Your parent or guardian may ask the coach to see it or to have it deleted at any time. Other trainees cannot see it. It is not sold or used for advertising.',
        },
        {
          heading: 'Your data is yours',
          body:
            'From the Account page you can download everything you have logged, or delete your account. Deleting it permanently removes your data, including the record that you accepted these terms; error reports are kept without your name for up to 90 days. Backups are cleared by the host on its normal cycle. Your parent or guardian can ask the coach to do this for you.',
        },
        {
          heading: 'Limits of responsibility',
          body:
            'To the extent the law allows, your coach is not liable for injury or loss that comes from training you choose to do, from incorrect data you enter, or from the app being unavailable. Nothing here limits liability that the law does not allow to be limited, for example in cases of gross negligence.',
        },
        {
          heading: 'Changes and ending',
          body:
            'Your coach may update these terms and will ask you and your parent or guardian to accept again when they do. Either side can stop at any time, and you can delete your account whenever you like.',
        },
        {
          heading: 'Governing law',
          body: 'These terms are governed by Israeli law, and the courts in Israel decide any dispute.',
        },
      ],
      accept: 'My parent or guardian has read this and agrees',
      guardianName: "Parent or guardian's name",
      guardianContact: 'Their phone or email',
    },
  },

  he: {
    adult: {
      title: 'לפני שמתחילים',
      intro: 'Ironlog הוא יומן אימונים משותף לכם ולמאמן. קראו את זה פעם אחת ואשרו כדי להמשיך.',
      sections: [
        {
          heading: 'באימון יש סיכון',
          body:
            'הרמת משקולות ואימון גופני כרוכים בסיכון לפציעה. ההשתתפות היא על אחריותכם, ואתם אחראים להתאמן בהתאם ליכולת שלכם, להשתמש בציוד כראוי ולעצור כשמשהו כואב. אם יש לכם פציעה או מצב רפואי, אם אתם בהריון, או אם לא התאמנתם תקופה ארוכה, היוועצו ברופא לפני שמתחילים.',
        },
        {
          heading: 'זה אימון, לא ייעוץ רפואי',
          body:
            'המאמן בונה ובוחן את התוכנית שלכם. שום דבר כאן אינו ייעוץ רפואי, אבחון או טיפול, והוא אינו מחליף רופא או פיזיותרפיסט. ספרו למאמן על פציעות, כאבים או מצבים רפואיים שמשפיעים על האימון, ובכל מקרה של סתירה פעלו לפי ההנחיות הרפואיות ולא לפי האפליקציה.',
        },
        {
          heading: 'מה נשמר באפליקציה',
          body:
            'האימונים שתיעדתם, התרגילים והתוכניות שיצרתם, ההערות שלכם, ומשקל הגוף אם בחרתם לתעד אותו. השם והאימייל מגיעים מהחשבון שלכם. זה כולל מידע על בריאות וכושר. באישור אתם מסכימים במפורש לעיבוד שלו לצורך האימון שלכם, כמתואר בהודעת הפרטיות. זה נשמר כדי שתוכלו לראות את ההיסטוריה שלכם וכדי שהמאמן יוכל לעקוב אחרי ההתקדמות.',
        },
        {
          heading: 'מי יכול לראות',
          body:
            'אתם והמאמן. המאמן יכול להיכנס לחשבון שלכם כדי לבנות תוכניות, לעבור על אימונים ולהשאיר משוב, והוא מקבל התראה אוטומטית באימייל ובהודעה לטלפון כשקבעתם שיא אישי או כשלא התאמנתם זמן מה. ההתראות כוללות את שמכם ואת התרגיל או השיא. מתאמנים אחרים אינם רואים את הנתונים שלכם. הנתונים לא נמכרים ולא משמשים לפרסום.',
        },
        {
          heading: 'איפה זה נשמר',
          body: 'ב-Supabase, שירות אחסון, על שרתים ביפן. הנתונים נשמרים כל עוד החשבון קיים. הודעת הפרטיות מפרטת את כל השירותים המעורבים.',
        },
        {
          heading: 'הנתונים שלכם הם שלכם',
          body:
            'בעמוד החשבון אפשר להוריד בכל רגע את כל מה שתיעדתם, ולמחוק את החשבון. המחיקה מסירה לצמיתות את הנתונים שלכם, כולל הרישום על כך שאישרתם את התנאים; דוחות שגיאה נשמרים בלי שמכם עד 90 יום. הגיבויים מתנקים אצל המארח במחזור הרגיל שלו. אפשר גם לבקש מהמאמן לעשות זאת עבורכם.',
        },
        {
          heading: 'שמירה על אמינות',
          body:
            'השתמשו באפליקציה לאימונים שלכם בלבד ואל תשתפו את פרטי ההתחברות. אם משהו בנתונים נראה לא נכון, ספרו למאמן.',
        },
        {
          heading: 'הגבלת אחריות',
          body:
            'במידה שהחוק מתיר, המאמן אינו אחראי לפציעה או להפסד שנובעים מאימון שבחרתם לבצע, מנתונים שגויים שהזנתם, או מכך שהאפליקציה אינה זמינה. שום דבר כאן אינו מגביל אחריות שהחוק אינו מתיר להגביל, למשל במקרה של רשלנות רבתי.',
        },
        {
          heading: 'שינויים וסיום',
          body:
            'המאמן רשאי לעדכן את התנאים, ובמקרה כזה תתבקשו לאשר אותם שוב. כל צד רשאי להפסיק בכל עת, ואפשר למחוק את החשבון בכל עת.',
        },
        {
          heading: 'הדין החל',
          body: 'על התנאים האלה חל הדין הישראלי, ובתי המשפט בישראל מוסמכים לדון בכל מחלוקת.',
        },
      ],
      accept: 'קראתי ואני מאשר/ת את האמור לעיל',
    },
    minor: {
      title: 'לפני שמתחילים',
      intro: 'ציינתם שאתם מתחת לגיל 18. אפשר בהחלט להשתמש ב-Ironlog, בשיתוף הורה או אפוטרופוס. קראו את זה יחד איתם.',
      sections: [
        {
          heading: 'צריך אישור של הורה או אפוטרופוס',
          body:
            'מכיוון שאתם מתחת לגיל 18, נדרשת הסכמה של הורה או אפוטרופוס לכך שתתאמנו עם המאמן ושנתוני האימון יישמרו כאן. מלאו למטה את שם ההורה או האפוטרופוס ואת דרך יצירת הקשר איתם. המאמן ייצור איתם קשר לאישור לפני שתתחילו או זמן קצר אחרי.',
        },
        {
          heading: 'באימון יש סיכון',
          body:
            'הרמת משקולות ואימון גופני כרוכים בסיכון לפציעה. התאמנו בהתאם ליכולת שלכם, השתמשו בציוד כפי שהודרכתם, ועצרו אם משהו כואב. אם יש פציעה או מצב רפואי, יש לקבל אישור מרופא לפני שמתחילים.',
        },
        {
          heading: 'זה אימון, לא ייעוץ רפואי',
          body:
            'המאמן בונה ובוחן את התוכנית שלכם. שום דבר כאן אינו ייעוץ רפואי והוא אינו מחליף רופא או פיזיותרפיסט. ספרו למאמן ולהורה על כל כאב או פציעה.',
        },
        {
          heading: 'מה נשמר ומי רואה',
          body:
            'האימונים שתיעדתם, התרגילים והתוכניות, ההערות, ומשקל הגוף אם תיעדתם אותו, יחד עם השם והאימייל. זה כולל מידע על בריאות וכושר. באישור אתם וההורה או האפוטרופוס מסכימים במפורש לעיבוד שלו לצורך האימון שלכם, כמתואר בהודעת הפרטיות. הנתונים נשמרים בשרתי Supabase ביפן, והודעת הפרטיות מפרטת את כל השירותים המעורבים. אתם והמאמן רואים אותם, והמאמן מקבל התראה אוטומטית באימייל ובהודעה לטלפון, הכוללת את שמכם ואת התרגיל או השיא, כשקבעתם שיא אישי או כשלא התאמנתם זמן מה. הורה או אפוטרופוס רשאים לבקש מהמאמן לראות את הנתונים או למחוק אותם בכל עת. מתאמנים אחרים אינם רואים אותם. הנתונים לא נמכרים ולא משמשים לפרסום.',
        },
        {
          heading: 'הנתונים שלכם הם שלכם',
          body:
            'בעמוד החשבון אפשר להוריד את כל מה שתיעדתם, או למחוק את החשבון. המחיקה מסירה לצמיתות את הנתונים שלכם, כולל הרישום על כך שאישרתם את התנאים; דוחות שגיאה נשמרים בלי שמכם עד 90 יום. הגיבויים מתנקים אצל המארח במחזור הרגיל שלו. הורה או אפוטרופוס יכולים לבקש מהמאמן לעשות זאת עבורכם.',
        },
        {
          heading: 'הגבלת אחריות',
          body:
            'במידה שהחוק מתיר, המאמן אינו אחראי לפציעה או להפסד שנובעים מאימון שבחרתם לבצע, מנתונים שגויים שהזנתם, או מכך שהאפליקציה אינה זמינה. שום דבר כאן אינו מגביל אחריות שהחוק אינו מתיר להגביל, למשל במקרה של רשלנות רבתי.',
        },
        {
          heading: 'שינויים וסיום',
          body:
            'המאמן רשאי לעדכן את התנאים, ובמקרה כזה תתבקשו אתם וההורה או האפוטרופוס לאשר אותם שוב. כל צד רשאי להפסיק בכל עת, ואפשר למחוק את החשבון בכל עת.',
        },
        {
          heading: 'הדין החל',
          body: 'על התנאים האלה חל הדין הישראלי, ובתי המשפט בישראל מוסמכים לדון בכל מחלוקת.',
        },
      ],
      accept: 'הורה או אפוטרופוס קרא/ה את זה ומסכים/ה',
      guardianName: 'שם ההורה או האפוטרופוס',
      guardianContact: 'טלפון או אימייל ליצירת קשר',
    },
  },
}

// The exact text someone was shown, flattened the same way every time so
// the fingerprint is reproducible.
export function termsPlainText(lang, variant) {
  const doc = terms[lang]?.[variant] || terms.en[variant]
  return [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.heading, s.body]), doc.accept].join('\n\n')
}

export async function hashText(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
