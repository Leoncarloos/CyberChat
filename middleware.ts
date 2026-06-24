import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const DIAGNOSTIC_REQUIRED = ["/chat", "/admin", "/manage", "/dashboard", "/org-dashboard"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const pathname = req.nextUrl.pathname;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresca la sesión en cookies
  const { data: { user } } = await supabase.auth.getUser();

  const requiresDiagnostic = DIAGNOSTIC_REQUIRED.some((p) =>
    pathname === p || pathname.startsWith(p + "/")
  );

  if (requiresDiagnostic && user && user.user_metadata?.diagnostic_done !== true) {
    return NextResponse.redirect(new URL("/diagnostic", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
