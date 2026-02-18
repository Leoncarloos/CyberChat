import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  // ✅ en tu Next, cookies() es async (Promise)
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Supabase SSR necesita getAll/setAll
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // En algunos contextos cookieStore puede ser readonly (pero en Route Handlers suele permitir set)
          // Para no romper el build, lo manejamos seguro.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // @ts-ignore
              cookieStore.set(name, value, options);
            });
          } catch {
            // si estás en un contexto donde no se puede setear cookies (RSC puro),
            // no hacemos nada (pero en /api routes debería poder)
          }
        },
      },
    }
  );
}
