function fail(message) {
  console.error(`Supabase target guard failed: ${message}`);
  process.exit(1);
}

const expectedRef = process.env.EXPECTED_SUPABASE_PROJECT_REF?.trim();
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!expectedRef || !rawUrl || !serviceRoleKey) {
  fail("required environment is missing");
}

let projectRef;
try {
  const url = new URL(rawUrl);
  const suffix = ".supabase.co";
  projectRef = url.hostname.endsWith(suffix)
    ? url.hostname.slice(0, -suffix.length)
    : null;
} catch {
  fail("database URL is invalid");
}

if (projectRef !== expectedRef) {
  fail("database URL does not target the expected production project");
}

const parts = serviceRoleKey.split(".");
if (parts.length !== 3) {
  fail("service-role key is not a legacy project JWT");
}

let claims;
try {
  claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
} catch {
  fail("service-role key JWT payload is invalid");
}

if (claims?.ref !== expectedRef) {
  fail("service-role key does not belong to the expected production project");
}
if (claims?.role !== "service_role") {
  fail("database key does not carry the service_role claim");
}

console.log(`Supabase target verified: ${expectedRef}`);
