-- READ ONLY. Run in the signed-in SQL Editor if available.
-- No passwords, pg_authid, grants, role creation/deletion, or session termination.
select statement_timestamp() as observed_at,
       current_database() as database_name,
       current_user as observing_role,
       current_setting('server_version') as server_version;

select rolname, rolcanlogin, rolvaliduntil,
       case when rolvaliduntil is null then null
            else rolvaliduntil > statement_timestamp() end as password_window_unexpired,
       rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolconnlimit
from pg_roles
where starts_with(rolname, 'cli_login_')
order by rolname;

select member_role.rolname as member,
       granted_role.rolname as granted_role,
       grantor_role.rolname as grantor,
       membership.admin_option
from pg_auth_members membership
join pg_roles member_role on member_role.oid = membership.member
join pg_roles granted_role on granted_role.oid = membership.roleid
join pg_roles grantor_role on grantor_role.oid = membership.grantor
where starts_with(member_role.rolname, 'cli_login_')
   or starts_with(granted_role.rolname, 'cli_login_')
order by member, granted_role;

select usename, application_name, state, count(*) as sessions,
       min(backend_start) as oldest_session_start,
       max(backend_start) as newest_session_start
from pg_stat_activity
where starts_with(usename, 'cli_login_')
group by usename, application_name, state
order by usename, application_name, state;

-- pg_roles has no role-creation timestamp. A row proves current existence,
-- not that the interrupted probe created it. No row now cannot prove no role
-- was created and later expired/removed. Attribution requires retained logs
-- or a pre-probe catalog snapshot; do not infer it from a name alone.
