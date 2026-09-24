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

export const TERMS_VERSION = 1
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
            'The workouts you log, the exercises and routines you create, your notes, and your body weight if you choose to record it. Your name and email come from your account. This is kept so you can see your own history and so your coach can follow your progress.',
        },
        {
          heading: 'Who can see it',
          body:
            'You and your coach. Your coach can open your account to build routines, review sessions and leave feedback, and is notified when you set a personal record or go a while without training. Other trainees cannot see your data. It is not sold, and it is not used for advertising.',
        },
        {
          heading: 'Where it is kept',
          body:
            'On Supabase, a hosting service, on servers outside Israel. It is kept while your account exists.',
        },
        {
          heading: 'Your data is yours',
          body:
            'From the Account page you can download everything you have logged at any time, and delete your account and all its data permanently. You can also ask your coach to do either for you.',
        },
        {
          heading: 'Keeping it honest',
          body:
            'Use the app for your own training. Do not share your login. If something looks wrong in your data, tell your coach.',
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
            'The workouts you log, your exercises and routines, your notes, and your body weight if you record it, along with your name and email. You and your coach can see it. Your parent or guardian may ask the coach to see it or to have it deleted at any time. Other trainees cannot see it. It is not sold or used for advertising.',
        },
        {
          heading: 'Your data is yours',
          body:
            'From the Account page you can download everything you have logged, or delete your account and all of its data permanently. Your parent or guardian can ask the coach to do this for you.',
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
            'הרמת משקולות ואימון גופני כרוכים בסיכון לפציעה. ההשתתפות היא על אחריותכם, ואתם אחראים להתאמן בהתאם ליכולת שלכם, להשתמש בציוד כראוי ולעצור כשמשהו כואב. אם יש לכם פציעה, מצב רפואי, אם אתן בהיריון, או אם לא התאמנתם תקופה ארוכה — היוועצו ברופא לפני שמתחילים.',
        },
        {
          heading: 'זה אימון, לא ייעוץ רפואי',
          body:
            'המאמן בונה ובוחן את התוכנית שלכם. שום דבר כאן אינו ייעוץ רפואי, אבחון או טיפול, והוא אינו מחליף רופא או פיזיותרפיסט. ספרו למאמן על פציעות, כאבים או מצבים רפואיים שמשפיעים על האימון, ופעלו לפי הנחיות רפואיות לפני כל דבר באפליקציה.',
        },
        {
          heading: 'מה נשמר באפליקציה',
          body:
            'האימונים שתיעדתם, התרגילים והתוכניות שיצרתם, ההערות שלכם, ומשקל הגוף אם בחרתם לתעד אותו. השם והאימייל מגיעים מהחשבון שלכם. זה נשמר כדי שתוכלו לראות את ההיסטוריה שלכם וכדי שהמאמן יוכל לעקוב אחרי ההתקדמות.',
        },
        {
          heading: 'מי יכול לראות',
          body:
            'אתם והמאמן. המאמן יכול להיכנס לחשבון שלכם כדי לבנות תוכניות, לעבור על אימונים ולהשאיר משוב, ומקבל התראה כששברתם שיא אישי או כשלא התאמנתם זמן מה. מתאמנים אחרים לא רואים את הנתונים שלכם. הנתונים לא נמכרים ולא משמשים לפרסום.',
        },
        {
          heading: 'איפה זה נשמר',
          body: 'ב-Supabase, שירות אחסון, על שרתים מחוץ לישראל. הנתונים נשמרים כל עוד החשבון קיים.',
        },
        {
          heading: 'הנתונים שלכם הם שלכם',
          body:
            'בעמוד החשבון אפשר להוריד בכל רגע את כל מה שתיעדתם, ולמחוק את החשבון ואת כל הנתונים לצמיתות. אפשר גם לבקש מהמאמן לעשות זאת עבורכם.',
        },
        {
          heading: 'שימוש הוגן',
          body:
            'השתמשו באפליקציה לאימונים שלכם. אל תשתפו את פרטי ההתחברות. אם משהו נראה לא נכון בנתונים, ספרו למאמן.',
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
            'מכיוון שאתם מתחת לגיל 18, הורה או אפוטרופוס צריך להסכים לכך שתתאמנו עם המאמן ושנתוני האימון יישמרו כאן. מלאו למטה את שמו ואיך אפשר ליצור איתו קשר. המאמן ייצור איתו קשר לאישור לפני שתתחילו או זמן קצר אחרי.',
        },
        {
          heading: 'באימון יש סיכון',
          body:
            'הרמת משקולות ואימון גופני כרוכים בסיכון לפציעה. התאמנו בהתאם ליכולת שלכם, השתמשו בציוד כפי שהודרכתם, ועצרו אם משהו כואב. אם יש פציעה או מצב רפואי, רופא צריך לאשר לפני שמתחילים.',
        },
        {
          heading: 'זה אימון, לא ייעוץ רפואי',
          body:
            'המאמן בונה ובוחן את התוכנית שלכם. שום דבר כאן אינו ייעוץ רפואי והוא אינו מחליף רופא או פיזיותרפיסט. ספרו למאמן ולהורה על כל כאב או פציעה.',
        },
        {
          heading: 'מה נשמר ומי רואה',
          body:
            'האימונים שתיעדתם, התרגילים והתוכניות, ההערות, ומשקל הגוף אם תיעדתם אותו, יחד עם השם והאימייל. אתם והמאמן רואים את זה. ההורה או האפוטרופוס רשאי לבקש מהמאמן לראות את הנתונים או למחוק אותם בכל עת. מתאמנים אחרים לא רואים. הנתונים לא נמכרים ולא משמשים לפרסום.',
        },
        {
          heading: 'הנתונים שלכם הם שלכם',
          body:
            'בעמוד החשבון אפשר להוריד את כל מה שתיעדתם, או למחוק את החשבון ואת כל הנתונים לצמיתות. ההורה או האפוטרופוס יכול לבקש מהמאמן לעשות זאת עבורכם.',
        },
      ],
      accept: 'הורה או אפוטרופוס קרא/ה את זה ומסכים/ה',
      guardianName: 'שם ההורה או האפוטרופוס',
      guardianContact: 'טלפון או אימייל שלו/ה',
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
