import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readAccessClaims } from "@/lib/accessClaims";

const DIAGNOSTIC_REQUIRED = ["/chat", "/admin", "/manage", "/dashboard", "/org-dashboard"];
const ACTIVE_REQUIRED = [...DIAGNOSTIC_REQUIRED, "/diagnostic"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

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
  if (!user) return res;

  const claims = readAccessClaims(user);

  // Un empleado pendiente o rechazado puede tener sesión (la obtuvo antes de que se
  // cerrara en el login, o lo rechazaron con la sesión abierta). Las rutas /api ya lo
  // bloquean; aquí se le cierra la sesión para que no quede en páginas que no cargan.
  if (matches(pathname, ACTIVE_REQUIRED) && (!claims.role || claims.approvalStatus !== "active")) {
    const blocked = claims.approvalStatus === "rejected" ? "rejected" : "pending";
    const redirect = NextResponse.redirect(new URL(`/login?blocked=${blocked}`, req.url));
    for (const cookie of req.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) redirect.cookies.delete(cookie.name);
    }
    return redirect;
  }

  if (matches(pathname, DIAGNOSTIC_REQUIRED) && !claims.diagnosticDone) {
    return NextResponse.redirect(new URL("/diagnostic", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
