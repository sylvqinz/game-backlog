import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

if (!supabaseUrl || !secretKey || !adminEmail) {
  console.error(
    "Variables manquantes. Exemple: SUPABASE_URL=... SUPABASE_SECRET_KEY=... ADMIN_EMAIL=toi@example.com npm run admin:add",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey);

const adminUser = await findUserByEmail(adminEmail);

if (!adminUser?.email) {
  console.error(
    `${adminEmail} est introuvable dans Supabase Auth. Crée d'abord ce compte, puis relance npm run admin:add.`,
  );
  process.exit(1);
}

const { error } = await supabase
  .from("admins")
  .upsert({ user_id: adminUser.id, email: adminUser.email.toLowerCase() });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`${adminEmail} est admin.`);

async function findUserByEmail(email) {
  const perPage = 100;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    const user = data.users.find(
      (currentUser) => currentUser.email?.toLowerCase() === email,
    );

    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
}
