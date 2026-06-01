-- 067_project_scope.sql
-- Adds a `scope` column to projects so an owner can declare whether a project
-- is design-only or covers design + execution. Existing rows default to the
-- inclusive 'design_and_execution' value (backward compatible).

alter table projects
  add column if not exists scope text not null default 'design_and_execution';

alter table projects
  drop constraint if exists projects_scope_check;

alter table projects
  add constraint projects_scope_check
  check (scope in ('design_only', 'design_and_execution'));

create index if not exists idx_projects_scope on projects (scope) where deleted_at is null;
