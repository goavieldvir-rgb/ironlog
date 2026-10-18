// What a trainee agrees to when turning progress photos on. Separate from the
// training terms on purpose: photos are optional, off by default, and can be
// switched off again at any time, which deletes them.
//
// Raising PHOTOS_VERSION records new acceptances under the new number; it
// does not switch anyone off by itself.
//
// NOT LEGAL ADVICE. Have an Israeli privacy lawyer review this wording
// before trainees use the feature.

import { hashText } from './terms.js'

export const PHOTOS_VERSION = 1
export const PHOTOS_DOC_KEY = 'progress-photos'
// Photos of anyone inactive this long are removed automatically.
export const PHOTOS_RETENTION_MONTHS = 12

export const photosConsent = {
  en: {
    title: 'Progress photos',
    intro: 'Photos let you and your coach see changes the scale and the numbers miss. They are optional.',
    points: [
      'You choose what to add: front, side or back, whenever you like. Wear what you would wear at the gym.',
      'Only you and your coach can see them. They are never public, never shared, and never used for marketing or social media.',
      'They are stored privately on Supabase, on servers in Japan, with your other Ironlog data. Each photo is resized and its location and camera details removed before upload.',
      'You can delete any photo at any time. Turning photos off deletes all of them.',
      `If you stop training for ${PHOTOS_RETENTION_MONTHS} months, your photos are deleted automatically. Deleting your account deletes them too.`,
      'Body photos can count as health information. By turning this on you explicitly agree to them being processed for your training as described here and in the Privacy notice.',
    ],
    accept: 'Turn on progress photos',
  },
  he: {
    title: 'תמונות התקדמות',
    intro: 'תמונות עוזרות לכם ולמאמן לראות שינויים שהמשקל והמספרים לא מראים. השימוש בהן הוא לבחירתכם.',
    points: [
      'אתם בוחרים מה להוסיף: מקדימה, מהצד או מאחור, מתי שתרצו. לבשו מה שהייתם לובשים בחדר כושר.',
      'רק אתם והמאמן יכולים לראות אותן. הן לעולם לא ציבוריות, לא משותפות עם אף אחד, ולא משמשות לשיווק או לרשתות חברתיות.',
      'הן נשמרות באופן פרטי ב-Supabase, בשרתים ביפן, יחד עם שאר המידע שלכם ב-Ironlog. כל תמונה מוקטנת, ופרטי המיקום והמצלמה נמחקים ממנה לפני ההעלאה.',
      'אפשר למחוק כל תמונה בכל עת. כיבוי התמונות מוחק את כולן.',
      `אם לא תתאמנו ${PHOTOS_RETENTION_MONTHS} חודשים, התמונות יימחקו אוטומטית. גם מחיקת החשבון מוחקת אותן.`,
      'תמונות גוף עשויות להיחשב מידע על בריאות. בהפעלה אתם מסכימים במפורש לעיבוד שלהן לצורך האימון, כפי שמתואר כאן ובהודעת הפרטיות.',
    ],
    accept: 'הפעלת תמונות התקדמות',
  },
}

export function photosPlainText(lang) {
  const doc = photosConsent[lang] || photosConsent.en
  return [doc.title, doc.intro, ...doc.points, doc.accept].join('\n\n')
}

export function photosTextHash(lang) {
  return hashText(photosPlainText(lang))
}
