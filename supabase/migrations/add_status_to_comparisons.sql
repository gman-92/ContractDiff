alter table comparisons
  add column if not exists status text not null default 'done',
  add column if not exists error_message text;

alter table comparisons
  drop constraint if exists comparisons_status_check;

alter table comparisons
  add constraint comparisons_status_check
    check (status in ('pending', 'processing', 'done', 'error'));
