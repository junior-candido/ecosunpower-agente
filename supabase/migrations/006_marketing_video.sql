-- Add video support to marketing_drafts
alter table marketing_drafts
  add column if not exists video_url text,
  add column if not exists content_type text default 'image';

-- Storage bucket for generated videos (public read)
insert into storage.buckets (id, name, public)
values ('marketing-videos', 'marketing-videos', true)
on conflict (id) do nothing;
