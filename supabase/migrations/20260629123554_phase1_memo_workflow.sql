alter table public.user_profiles
  add column if not exists can_review boolean not null default false,
  add column if not exists can_approve boolean not null default false,
  add column if not exists is_active boolean not null default true;

update public.user_profiles
set
  can_review = is_approver,
  can_approve = is_approver
where is_approver = true;

alter table public.memos
  add column if not exists requester_profile_id bigint
    references public.user_profiles(id) on delete set null,
  add column if not exists current_approver_profile_id bigint
    references public.user_profiles(id) on delete set null,
  add column if not exists self_reviewed_at timestamp with time zone,
  add column if not exists source_memo_no text
    references public.memos(memo_no) on delete set null;

update public.memos
set
  status = 'rejected',
  current_approver_profile_id = null,
  updated_at = now()
where status = 'rejected_revision';

update public.memos m
set requester_profile_id = u.id
from public.user_profiles u
where m.requester_profile_id is null
  and (
    m.requester_name = u.full_name
    or m.requester_name = any(coalesce(u.name_aliases, '{}'::text[]))
  );

update public.memos m
set current_approver_profile_id = u.id
from public.user_profiles u
where m.current_approver_profile_id is null
  and m.status in ('pending', 'pending_a2', 'pending_a3')
  and (
    case m.status
      when 'pending_a2' then m.approvers -> 1 ->> 'name'
      when 'pending_a3' then m.approvers -> 2 ->> 'name'
      else m.approvers -> 0 ->> 'name'
    end = u.full_name
    or case m.status
      when 'pending_a2' then m.approvers -> 1 ->> 'name'
      when 'pending_a3' then m.approvers -> 2 ->> 'name'
      else m.approvers -> 0 ->> 'name'
    end = any(coalesce(u.name_aliases, '{}'::text[]))
  );

create index if not exists memos_requester_profile_id_idx
  on public.memos(requester_profile_id);

create index if not exists memos_current_approver_profile_id_idx
  on public.memos(current_approver_profile_id)
  where status in ('pending', 'pending_a2', 'pending_a3');
