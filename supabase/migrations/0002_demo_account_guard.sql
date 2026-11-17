-- The demo account's credentials are effectively public, so anyone signed in as
-- the demo user could otherwise change its password or email through the auth
-- API and lock everyone else out. This trigger freezes those fields.

create schema if not exists private;

create or replace function private.guard_demo_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce((old.raw_app_meta_data ->> 'demo')::boolean, false) then
    if tg_op = 'DELETE' then
      raise exception 'The demo account cannot be deleted';
    end if;
    if new.encrypted_password is distinct from old.encrypted_password
      or new.email is distinct from old.email
      or new.email_change is distinct from old.email_change
      or new.phone is distinct from old.phone
      or new.raw_app_meta_data is distinct from old.raw_app_meta_data
      or new.raw_user_meta_data is distinct from old.raw_user_meta_data
    then
      raise exception 'The demo account is read-only';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_demo_account
  before update or delete on auth.users
  for each row execute function private.guard_demo_account();
