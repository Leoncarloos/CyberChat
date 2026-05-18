export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    const body = (await req.json()) as {
      ruc?: string;
      businessName?: string;
      tradeName?: string;
      ownerName?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    const ruc = body.ruc?.trim() ?? "";
    const businessName = body.businessName?.trim() ?? "";
    const ownerName = body.ownerName?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.trim() ?? "";
    const password = body.password ?? "";

    if (!ruc || !businessName || !ownerName || !email || !phone || !password) {
      return NextResponse.json({ error: "Completa todos los campos obligatorios" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
    }

    const duplicatedRuc = (usersResult.data.users ?? []).some((user) => {
      const metadata = parseMetadata(user.user_metadata);
      return metadata.role === "admin" && metadata.ruc === ruc;
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
      user_metadata: {
        role: "admin",
        account_type: "company_admin",
        approval_status: "active",
        ruc,
        business_name: businessName,
        trade_name: body.tradeName?.trim() ?? "",
        owner_name: ownerName,
        phone,
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
