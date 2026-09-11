export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { registerEmployeeSchema, flattenFieldErrors } from "@/lib/validators/auth";

type UserMetadata = {
  role?: string;
  ruc?: string;
};

function parseMetadata(value: unknown): UserMetadata {
  if (!value || typeof value !== "object") return {};
  return value as UserMetadata;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Revisa los datos ingresados",
          fieldErrors: flattenFieldErrors(parsed.error),
        },
        { status: 400 }
      );
    }

    const { ruc, firstName, lastName, email, password } = parsed.data;

    const admin = supabaseAdmin();
    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
    }

    const hasAdminForRuc = (usersResult.data.users ?? []).some((user) => {
      const metadata = parseMetadata(user.user_metadata);
      return metadata.role === "admin" && metadata.ruc === ruc;
    });

    if (!hasAdminForRuc) {
      return NextResponse.json(
        { error: "No existe un administrador registrado con ese RUC" },
        { status: 404 }
      );
    }

    const createResult = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "employee",
        account_type: "company_employee",
        approval_status: "pending",
        ruc,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        registered_at: new Date().toISOString(),
      },
    });

    if (createResult.error) {
      return NextResponse.json({ error: createResult.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
