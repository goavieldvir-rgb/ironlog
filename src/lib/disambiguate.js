// If two exercises share the same name but are tracked differently (one
// in kg, one in lb; one bodyweight, one not; one by RPE, one by heart-rate
// zone) — which the exercise-lock feature makes possible via "create a new
// exercise instead" — this appends a short disambiguating suffix so lists
// and dropdowns don't show two identical-looking entries. Only appends the
// suffix when a name actually collides; a normal, unique exercise name is
// left exactly as-is.
export function unitSuffix(item, t) {
  const category = item.category
  if (category === 'cardio') {
    const intensityType = item.intensityType || item.intensity_type
    return intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')
  }
  if (item.bodyweight) return t('exercises.bodyweightWord')
  return item.unit || 'kg'
}

export function disambiguateLabels(list, getName, t) {
  const counts = {}
  for (const item of list) {
    const name = getName(item)
    counts[name] = (counts[name] || 0) + 1
  }
  return list.map((item) => {
    const name = getName(item)
    return counts[name] > 1 ? `${name} (${unitSuffix(item, t)})` : name
  })
}
