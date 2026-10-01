export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { registerAdminSchema, flattenFieldErrors } from "@/lib/validators/auth";
import { translateAuthError } from "@/lib/authErrors";
import { readAccessClaims } from "@/lib/accessClaims";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerAdminSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Revisa los datos ingresados",
          fieldErrors: flattenFieldErrors(parsed.error),
        },
        { status: 400 }
      );
    }

    const { ruc, businessName, tradeName, ownerName, email, phone, password } = parsed.data;

    const admin = supabaseAdmin();
    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
    }

    const duplicatedRuc = (usersResult.data.users ?? []).some((user) => {
      const claims = readAccessClaims(user);
      return claims.role === "admin" && claims.ruc === ruc;
    });

    if (duplicatedRuc) {
      return NextResponse.json(
        { error: "Ya existe un administrador registrado con ese RUC" },
        { status: 409 }
      );
    }

    const createResult = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "admin", ruc, approval_status: "active" },
      user_metadata: {
        account_type: "company_admin",
        business_name: businessName,
        trade_name: tradeName,
        owner_name: ownerName,
        phone,
        registered_at: new Date().toISOString(),
      },
    });

    if (createResult.error) {
      return NextResponse.json({ error: translateAuthError(createResult.error) }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
