-- material_issues.plate_no — the "Plate No." field added to the Issue
-- Material form (and materials.routes.js) so a material issue can be tied
-- to the vehicle it was issued for, not just the cashier.
alter table material_issues add column if not exists plate_no text;
