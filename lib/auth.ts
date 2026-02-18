import { supabaseBrowser } from "@/lib/supabaseBrowser";

export async function getUserOrNull() {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
