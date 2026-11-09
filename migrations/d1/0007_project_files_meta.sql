-- Project file metadata enhancements (additive)
ALTER TABLE project_files ADD COLUMN extracted_text TEXT NOT NULL DEFAULT '';
ALTER TABLE project_files ADD COLUMN kind TEXT NOT NULL DEFAULT 'document';
ALTER TABLE project_files ADD COLUMN r2_key TEXT;
