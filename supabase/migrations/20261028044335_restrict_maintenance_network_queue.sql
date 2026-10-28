-- Verification: hosted supabase_admin grants cannot be revoked by postgres.
-- These attempted revokes have no effective ACL change on this project.
-- Enforce API schema isolation; send only one-use, 2-minute job tickets.
-- See UX10-DESIGN.md and actual 406/permission-denied API tests.
-- pg_net's default grants permit browser roles to read the transient queue.
-- It contains short-lived internal job tickets, so restrict the newly installed
-- extension to server/database roles before enabling the scheduler.
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;
revoke all on schema net from public, anon, authenticated;
grant usage on schema net to postgres, service_role;
