alter table if exists public.devices
  add column if not exists pbx_number text,
  add column if not exists position text,
  add column if not exists qa_owner text,
  add column if not exists os_version text,
  add column if not exists photo_url text;

alter table if exists public.devices
  alter column status set default 'not_identified';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'device-photos',
  'device-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "device_photos_insert" on storage.objects;
create policy "device_photos_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'device-photos');

drop policy if exists "device_photos_delete" on storage.objects;
create policy "device_photos_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'device-photos');
