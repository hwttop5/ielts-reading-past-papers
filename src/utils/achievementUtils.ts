export const getAchievementIcon = (id: string) => {
  const icons: Record<string, string> = {
    first_practice: 'auto_awesome',
    practice_10: 'trending_up',
    practice_50: 'workspace_premium',
    practice_100: 'military_tech',
    accuracy_80: 'verified',
    accuracy_90: 'psychology',
    perfect_score: 'star',
    speed_run: 'bolt',
    study_1h: 'timer',
    study_10h: 'hourglass_top',
    study_50h: 'history',
    streak_3: 'local_fire_department',
    streak_7: 'whatshot',
    streak_14: 'wb_sunny',
    streak_30: 'flare',
    perfect_3: 'stars',
    perfect_10: 'diamond',
    early_bird: 'wb_twilight',
    night_owl: 'nights_stay',
    weekend_warrior: 'weekend',
    share_master: 'share',
    click_easter_egg: 'catching_pokemon',
    review_master: 'rate_review',
    marathon_runner: 'directions_run',
    scholar: 'school',
    interaction_master: 'forum',
    login_streak: 'login',
    legend: 'emoji_events'
  }
  return icons[id] || 'emoji_events'
}

export const getAchievementColor = (id: string) => {
  const colors = [
    'color-blue', 'color-cyan', 'color-indigo', 'color-purple', 
    'color-green', 'color-pink', 'color-gold', 'color-orange'
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
