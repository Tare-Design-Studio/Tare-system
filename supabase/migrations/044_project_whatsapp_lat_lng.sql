-- Phase 10 · WhatsApp Group URL on projects
-- site_lat, site_lng, site_geofence_radius_m already exist (010_phase1_projects.sql).
-- Just adding the WhatsApp group URL column.

ALTER TABLE projects ADD COLUMN whatsapp_group_url text NULL;
