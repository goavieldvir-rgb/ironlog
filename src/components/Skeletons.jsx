import React from 'react'
import { Skeleton, SkeletonGroup } from './Loading.jsx'

// Each heavy screen's skeleton. The rule: the real cards at their real
// sizes, so nothing moves when the content lands, with only a line or two
// inside each. No stand-ins for buttons, inputs or charts: a quiet outline
// of the page, not a grey copy of it.

const ROW_LINE = 'border-t border-white/[0.06] first:border-t-0'

// Title, a meta line and a category tag: the top of a routine or a workout.
// Row heights follow the real header, whose title row holds 44px buttons.
function DetailHeader({ tagRow = 'h-6' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-11 flex items-center">
        <Skeleton className="h-7 w-1/2 rounded-lg" />
      </div>
      <div className="h-5 flex items-center">
        <Skeleton className="h-3 w-2/5" />
      </div>
      <div className={`${tagRow} mt-1`} />
    </div>
  )
}

// Routines list: two cards the size of a three-exercise routine.
export function RoutineListSkeleton() {
  return (
    <SkeletonGroup className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="card p-4 min-h-[239px] flex flex-col gap-3">
          <div className="h-[71px] flex flex-col gap-2.5 pt-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <div className="flex flex-col gap-[11px] pt-1">
            <Skeleton className="h-2.5 w-1/2" />
            <Skeleton className="h-2.5 w-2/5" />
            <Skeleton className="h-2.5 w-[45%]" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  )
}

// One routine, read-only: header and its exercise rows.
export function RoutineViewSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-5">
      <DetailHeader />
      <div className="bg-surface rounded-[20px] overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${ROW_LINE}`}>
            <span className="w-5 shrink-0" />
            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
            <Skeleton className="h-3 flex-1 max-w-[40%]" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}

// A saved workout: header, then each exercise card at its real height.
export function SessionDetailSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-5">
      <DetailHeader tagRow="h-11" />
      {[0, 1].map((i) => (
        <div key={i} className="bg-surface rounded-[20px] overflow-hidden">
          <div className="h-[96px] flex items-start gap-3 px-4 pt-4">
            <Skeleton className="w-9 h-9 rounded-lg shrink-0 mt-1" />
            <div className="flex-1 flex flex-col gap-2.5 pt-3">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
          {[0, 1, 2].map((j) => (
            <div key={j} className="h-11 flex items-center px-4 border-t border-white/[0.06]">
              <Skeleton className="h-2.5 w-20 ms-7" />
            </div>
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}

// Stats: the headline sentence and two chart cards, left empty but for
// their titles and a baseline.
export function StatsSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-6">
      <div className="h-[59px] flex flex-col justify-between py-1">
        <Skeleton className="h-6 w-1/2 rounded-lg" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="bg-surface rounded-[22px] pt-[18px] px-[18px] pb-3.5 flex flex-col gap-4">
          <div className="h-[21px] flex items-center">
            <Skeleton className="h-3 w-2/5" />
          </div>
          <div className="h-[150px] pb-6 flex">
            <div className="flex-1 border-b border-white/[0.06]" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  )
}

// A workout before its exercises are ready: cards the size of a three-set
// exercise, with the name and a line per set. The header (close, title,
// Finish) is drawn by the screen itself.
export function WorkoutSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-3">
      <div className="h-[3px] rounded-full bg-surface2" />
      {[0, 1].map((i) => (
        <div key={i} className="bg-surface rounded-[22px] min-h-[371px] pt-[18px] px-3.5 flex flex-col">
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
            <div className="flex-1 flex flex-col gap-2.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-2.5 w-1/5" />
            </div>
          </div>
          <div className="mt-[104px] flex flex-col gap-[10px]">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-11 flex items-center ps-9">
                <Skeleton className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  )
}
