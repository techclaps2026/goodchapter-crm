-- Public social assets are separate from private order artwork. Buffer needs
-- a stable URL that remains reachable when a scheduled post is published.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('social-media','social-media',true,26214400,array['image/jpeg','image/png','image/webp','video/mp4']);

create policy social_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id='social-media'
  and public.can_manage_users()
  and (storage.foldername(name))[1]=auth.uid()::text
);
-- No update/delete policy: scheduled posts must not lose their media URL.
