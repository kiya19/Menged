-- material_issues.serial_no — the "Serial No." field on the Issue Material
-- form (and materials.routes.js) has always sent/read this column, but no
-- migration ever created it, so every create/update to a material issue
-- failed with: column "serial_no" of relation "material_issues" does not exist.
alter table material_issues add column if not exists serial_no text;
