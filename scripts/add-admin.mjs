import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL;

if (!supabaseUrl || !secretKey || !adminEmail) {
  console.error(
    "Variables manquantes. Exemple: SUPABASE_URL=... SUPABASE_SECRET_KEY=... ADMIN_EMAIL=toi@example.com npm run admin:add",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey);
const { error } = await supabase.from("admins").upsert({ email: adminEmail });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`${adminEmail} est admin.`);
