-- The project was created with "Automatically expose new tables" OFF, so the server-side role
-- (service_role, used only by Edge Functions) must be granted access explicitly.
-- Edge Functions write meta_connections, ad_accounts and audit_log. The browser never can.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
