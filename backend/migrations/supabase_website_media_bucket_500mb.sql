-- Raise website-media storage limit for Music Portal uploads (500 MB).
-- Additive: keeps existing image/video types; adds common audio MIME types.
UPDATE storage.buckets
SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mp4',
    'audio/mpeg',
    'audio/x-m4a'
  ]
WHERE id = 'website-media';
