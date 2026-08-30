-- V2 performance hardening: covering indexes for new training/workout foreign keys.
-- This migration intentionally targets only the foreign keys introduced by V2.

-- exercise_library
create index if not exists exercise_library_created_by_idx
  on public.exercise_library (created_by)
  where created_by is not null;

create index if not exists exercise_library_primary_muscle_group_idx
  on public.exercise_library (primary_muscle_group_id)
  where primary_muscle_group_id is not null;

-- member_training_programs
create index if not exists member_training_programs_created_by_idx
  on public.member_training_programs (created_by)
  where created_by is not null;

create index if not exists member_training_programs_member_fk_idx
  on public.member_training_programs (member_id, organization_id);

create index if not exists member_training_programs_trainer_fk_idx
  on public.member_training_programs (trainer_user_id, organization_id)
  where trainer_user_id is not null;

-- member_program_muscle_targets
create index if not exists member_program_targets_member_fk_idx
  on public.member_program_muscle_targets (member_id, organization_id);

create index if not exists member_program_targets_muscle_fk_idx
  on public.member_program_muscle_targets (muscle_group_id, organization_id);

-- pt_packages extension
create index if not exists pt_packages_membership_fk_idx
  on public.pt_packages (membership_id, organization_id)
  where membership_id is not null;

-- pt_session_exercises
create index if not exists pt_session_exercises_exercise_fk_idx
  on public.pt_session_exercises (exercise_id, organization_id)
  where exercise_id is not null;

create index if not exists pt_session_exercises_member_fk_idx
  on public.pt_session_exercises (member_id, organization_id);

create index if not exists pt_session_exercises_session_fk_idx
  on public.pt_session_exercises (pt_session_id, organization_id);

-- pt_session_muscles
create index if not exists pt_session_muscles_member_fk_idx
  on public.pt_session_muscles (member_id, organization_id);

create index if not exists pt_session_muscles_muscle_fk_idx
  on public.pt_session_muscles (muscle_group_id, organization_id);

-- pt_session_workouts
create index if not exists pt_session_workouts_completed_by_idx
  on public.pt_session_workouts (completed_by)
  where completed_by is not null;

create index if not exists pt_session_workouts_member_fk_idx
  on public.pt_session_workouts (member_id, organization_id);

create index if not exists pt_session_workouts_program_fk_idx
  on public.pt_session_workouts (program_id, organization_id)
  where program_id is not null;

create index if not exists pt_session_workouts_trainer_fk_idx
  on public.pt_session_workouts (trainer_user_id, organization_id);
