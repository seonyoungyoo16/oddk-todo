// Prepare disposable test identity SQL locally; never print passwords or tokens.
import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const fixture = new URL(".sync-auth-fixture.json", root);
if (existsSync(fixture)) throw new Error("Existing fixture must be cleaned up before preparing a new run.");
const marker = `oddk-verification-${randomUUID()}`;
const users = [1, 2].map((index) => ({ id: randomUUID(), email: `${marker}-${index}@example.invalid`, password: `${randomBytes(24).toString("base64url")}A!8`, marker }));
const q = (value) => `'${value.replaceAll("'", "''")}'`;
const seed = users.map((user) => `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',${q(user.id)},'authenticated','authenticated',${q(user.email)},extensions.crypt(${q(user.password)},extensions.gen_salt('bf')),now(),'','','','',jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'oddk_test_run',${q(marker)}),'{}',now(),now());\ninsert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values(${q(user.id)},${q(user.id)},jsonb_build_object('sub',${q(user.id)},'email',${q(user.email)},'email_verified',true),'email',now(),now());`).join("\n");
const cleanup = `begin; delete from auth.sessions where user_id in(select id from auth.users where raw_app_meta_data->>'oddk_test_run'=${q(marker)}); delete from auth.users where raw_app_meta_data->>'oddk_test_run'=${q(marker)}; select count(*) as test_users_remaining from auth.users where raw_app_meta_data->>'oddk_test_run'=${q(marker)}; commit;`;
mkdirSync(new URL(".sync-test-runtime/", root), { recursive: true });
writeFileSync(fixture, JSON.stringify(users), { mode: 0o600 });
writeFileSync(new URL(".sync-test-runtime/seed-accounts.sql", root), `begin;\n${seed}\ncommit;`, { mode: 0o600 });
writeFileSync(new URL(".sync-test-runtime/cleanup-accounts.sql", root), cleanup, { mode: 0o600 });
console.log("Prepared ignored fixture and seed/cleanup SQL in .sync-test-runtime. Execute with a trusted DB admin, then clean up this test run. Credentials omitted.");
