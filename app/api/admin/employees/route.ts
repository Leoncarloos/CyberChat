export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UserMetadata = {
  role?: string;
  approval_status?: string;
  ruc?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  business_name?: string;
  owner_name?: string;
  registered_at?: string;
};

type EmployeeRow = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  ruc: string;
  status: "active" | "pending" | "rejected";
  created_at: string;
};

function parseMetadata(value: unknown): UserMetadata {
  if (!value || typeof value !== "object") return {};
  return value as UserMetadata;
}

function toEmployeeRow(
  user: { id: string; email?: string | null; user_metadata?: unknown; created_at?: string },
  ruc: string
): EmployeeRow | null {
  const metadata = parseMetadata(user.user_metadata);
  if (metadata.role !== "employee" || metadata.ruc !== ruc) return null;

  const firstName = metadata.first_name?.trim() ?? "";
  const lastName = metadata.last_name?.trim() ?? "";
  const fullName = metadata.full_name?.trim() || `${firstName} ${lastName}`.trim() || "Sin nombre";
  const rawStatus = metadata.approval_status;
  const status: EmployeeRow["status"] =
    rawStatus === "active" || rawStatus === "rejected" ? rawStatus : "pending";

  return {
    id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    ruc,
    status,
    created_at: metadata.registered_at ?? user.created_at ?? new Date().toISOString(),
  };
}

async function getAdminContext() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error) return { error: error.message, status: 401 as const };
  if (!data.user) return { error: "No auth", status: 401 as const };

  const metadata = parseMetadata(data.user.user_metadata);
  if (metadata.role !== "admin") return { error: "No autorizado", status: 403 as const };
  if (!metadata.ruc) return { error: "El administrador no tiene RUC configurado", status: 400 as const };

  return { user: data.user, ruc: metadata.ruc };
}

export async function GET() {
  try {
    const context = await getAdminContext();
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const admin = supabaseAdmin();
    const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const employees = (result.data.users ?? [])
      .map((user) => toEmployeeRow(user, context.ruc))
      .filter((user): user is EmployeeRow => Boolean(user));

    const counts = {
      all: employees.length,
      active: employees.filter((user) => user.status === "active").length,
      pending: employees.filter((user) => user.status === "pending").length,
      rejected: employees.filter((user) => user.status === "rejected").length,
    };

    return NextResponse.json({ employees, counts, ruc: context.ruc });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const context = await getAdminContext();
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const body = (await req.json()) as {
      userId?: string;
      action?: "approve" | "reject" | "edit";
      firstName?: string;
      lastName?: string;
    };

    if (!body.userId || !body.action) {
      return NextResponse.json({ error: "userId y action requeridos" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const userRes = await admin.auth.admin.getUserById(body.userId);
    const user = userRes.data.user;

    if (!user) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

    const metadata = parseMetadata(user.user_metadata);
    if (metadata.role !== "employee" || metadata.ruc !== context.ruc) {
      return NextResponse.json({ error: "Empleado fuera de tu organización" }, { status: 403 });
    }

    const nextMetadata: UserMetadata = { ...metadata };

    if (body.action === "approve") nextMetadata.approval_status = "active";
    if (body.action === "reject") nextMetadata.approval_status = "rejected";

    if (body.action === "edit") {
      nextMetadata.first_name = (body.firstName ?? metadata.first_name ?? "").trim();
      nextMetadata.last_name = (body.lastName ?? metadata.last_name ?? "").trim();
      nextMetadata.full_name =
        `${nextMetadata.first_name ?? ""} ${nextMetadata.last_name ?? ""}`.trim() || metadata.full_name;
    }

    const updateRes = await admin.auth.admin.updateUserById(body.userId, {
      user_metadata: nextMetadata,
    });

    if (updateRes.error) {
      return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
