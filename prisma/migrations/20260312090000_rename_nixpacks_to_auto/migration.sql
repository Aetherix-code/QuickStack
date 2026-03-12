-- Rename NIXPACKS build method to AUTO
UPDATE "App" SET "buildMethod" = 'AUTO' WHERE "buildMethod" = 'NIXPACKS';
