import React from 'react'
import { Skeleton, SkeletonGroup } from './Loading.jsx'

// Each heavy screen's skeleton, drawn in the shape of what it is waiting for
// so nothing jumps when the real content lands. Built from the blocks in
// Loading.jsx; only placeholder shapes here, no data.

const ROW_LINE = 'border-t border-white/[0.06] first:border-t-0'

// Title, a meta line and a category tag: the top of a routine or a workout.
function DetailHeader() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-8 w-2/3 rounded-lg" />
      <Skeleton className="h-3 w-2/5" />
      <Skeleton className="h-6 w-16 rounded-full mt-0.5" />
    </div>
  )
}

// Routines list: two cards' worth (one per row on a phone).
export function RoutineListSkeleton() {
  return (
    <SkeletonGroup className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`card p-4 flex flex-col gap-3 ${i > 1 ? 'hidden sm:flex' : ''}`}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[18px] w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex justify-between gap-6">
                <Skeleton className="h-3 flex-1 max-w-[55%]" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-full mt-1" />
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
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${ROW_LINE}`}>
            <span className="w-5 shrink-0" />
            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
            <Skeleton className="h-3.5 flex-1 max-w-[45%]" />
            <Skeleton className="h-3 w-14 ms-auto shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}

// A saved workout: header, then each exercise with its set rows.
export function SessionDetailSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-5">
      <DetailHeader />
      {[3, 3, 2].map((sets, i) => (
        <div key={i} className="bg-surface rounded-[20px] overflow-hidden">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
            <Skeleton className="h-4 w-2/5" />
          </div>
          {Array.from({ length: sets }, (_, j) => (
            <div key={j} className="flex items-center gap-4 px-4 py-3 border-t border-white/[0.06]">
              <Skeleton className="h-3 w-4 shrink-0" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}

// Stats: the headline sentence and two chart boxes.
export function StatsSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-7 w-3/4 rounded-lg" />
        <Skeleton className="h-3.5 w-11/12" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="bg-surface rounded-[22px] pt-[18px] px-[18px] pb-3.5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-[150px] w-full rounded-xl" />
        </div>
      ))}
    </SkeletonGroup>
  )
}

// A workout before its exercises are ready: the cards with their set rows.
// The header (close, title, Finish) is drawn by the screen itself.
export function WorkoutSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-3">
      <Skeleton className="h-[3px] w-full rounded-full" />
      {[0, 1].map((i) => (
        <div key={i} className="bg-surface rounded-[22px] pt-[18px] px-3.5 pb-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          {[0, 1, 2].map((j) => (
            <div key={j} className="grid grid-cols-[28px_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_44px] items-center gap-2">
              <Skeleton className="h-3 w-3 justify-self-center" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-9 rounded-[10px]" />
              <Skeleton className="h-9 rounded-[10px]" />
              <Skeleton className="w-11 h-11 rounded-[11px]" />
            </div>
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}
