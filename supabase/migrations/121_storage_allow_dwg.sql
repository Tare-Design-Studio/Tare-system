-- 121 · Let the storage bucket accept the file types the app already allows
--
-- 117 widened chat attachments to PDF and DWG and taught the upload route the
-- several MIME types browsers use for a drawing. What it did not do is widen
-- the bucket. `media-private.allowed_mime_types` was still the 020 image list
-- plus application/pdf, so storage rejected every DWG at the object write:
--
--   "mime type application/acad is not supported"
--
-- The route resolved the file correctly, then failed with a 500 at upload. PDF
-- was unaffected — it was already on the list — which is why the gap survived
-- 117's testing.
--
-- Both DWG spellings the route can produce are added (application/acad from the
-- Windows registry, image/vnd.dwg from some CAD installs, application/dwg and
-- drawing/dwg from the rest), matching DOC_TYPES in
-- app/api/chat/attachments/route.ts. The route never stores an empty type — it
-- falls back to a type derived from the extension — so "" needs no entry here.
--
-- media-customer-public carries the same list for consistency: the portal
-- serves drawings from it, and a divergence between the two buckets is exactly
-- the kind of thing that bites later.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
     'application/pdf',
     'application/acad', 'image/vnd.dwg', 'application/dwg', 'drawing/dwg'
   ]
 WHERE id IN ('media-private', 'media-customer-public');
