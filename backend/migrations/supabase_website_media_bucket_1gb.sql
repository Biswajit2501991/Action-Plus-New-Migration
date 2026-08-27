-- Raise website-media storage limit for Music Portal uploads (1 GB).
UPDATE storage.buckets
SET file_size_limit = 1073741824
WHERE id = 'website-media';
