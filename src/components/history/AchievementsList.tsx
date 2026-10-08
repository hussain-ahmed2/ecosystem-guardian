import { Check, Lock } from 'lucide-react'

import { cn } from '@/components/ui/cn'
import type { AchievementId } from '@/types/game'

const ACHIEVEMENTS: Array<{ id: AchievementId; title: string; detail: string }> = [
  { id: 'survive-1-year', title: 'A year of stewardship', detail: 'Reach year 2' },
  { id: 'survive-10-years', title: 'Decade of the Elderwood', detail: 'Reach year 11' },
  { id: 'discover-10-species', title: 'Ten thriving species', detail: '10 populations above 50' },
  { id: 'discover-50-species', title: 'Fifty thriving species', detail: '50 populations above 50' },
  { id: 'restore-1000-trees', title: 'A thousand trees', detail: 'Plant 1,000 trees' },
  { id: 'restore-10000-trees', title: 'Ten thousand trees', detail: 'Plant 10,000 trees' },
  {
    id: 'reintroduce-predators',
    title: 'Predators return',
    detail: 'Complete the wolf reintroduction',
  },
  {
    id: 'recover-damaged-habitat',
    title: 'Cause corrected',
    detail: 'Resolve an active discovery',
  },
  {
    id: 'stable-90-for-5-years',
    title: 'Five steady years',
    detail: 'Hold stability at 90+ for 5 years',
  },
]

export type AchievementsListProps = {
  earned: AchievementId[]
}

export default function AchievementsList({ earned }: AchievementsListProps) {
  const earnedSet = new Set(earned)

  return (
    <ul className="grid grid-cols-1 gap-1.5">
      {ACHIEVEMENTS.map((achievement) => {
        const has = earnedSet.has(achievement.id)
        return (
          <li
            key={achievement.id}
            className={cn(
              'flex items-start gap-2 border px-2 py-1.5',
              has
                ? 'border-moss-600 bg-moss-600/15'
                : 'border-bark-700 bg-bark-900/60 opacity-60',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center border',
                has ? 'border-moss-600 bg-moss-600 text-parchment-50' : 'border-bark-600 text-bark-500',
              )}
              aria-hidden="true"
            >
              {has ? <Check className="size-3" /> : <Lock className="size-2.5" />}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-[11px] font-semibold',
                  has ? 'text-parchment-50' : 'text-parchment-300',
                )}
              >
                {achievement.title}
              </span>
              <span className="block text-[10px] text-parchment-300">{achievement.detail}</span>
            </span>
            <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wide text-parchment-300">
              {has ? 'Earned' : 'Locked'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
