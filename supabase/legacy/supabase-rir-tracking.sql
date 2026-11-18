-- Adds the ability to track Reps in Reserve (RIR) per set, as an opt-in
-- toggle per exercise — not everyone wants to track it for every
-- exercise, so it only shows up where explicitly turned on.

alter table exercises add column if not exists track_rir boolean not null default false;
