export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { readAccessClaims } from "@/lib/accessClaims";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { employeePatchSchema } from "@/lib/validators/employees";
import { flattenFieldErrors } from "@/lib/validators/shared";

type UserMetadata = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
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
  user: { id: string; email?: string | null; user_metadata?: unknown; app_metadata?: unknown; created_at?: string },
  ruc: string
): EmployeeRow | null {
  const claims = readAccessClaims(user);
  if (claims.role !== "employee" || claims.ruc !== ruc) return null;
  const metadata = parseMetadata(user.user_metadata);

  const firstName = metadata.first_name?.trim() ?? "";
  const lastName = metadata.last_name?.trim() ?? "";
  const fullName = metadata.full_name?.trim() || `${firstName} ${lastName}`.trim() || "Sin nombre";
  const status: EmployeeRow["status"] = claims.approvalStatus;

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

export async function GET() {
  try {
    const auth = await requireAdmin({ forbiddenMessage: "No autorizado" });
    if (!auth.ok) return auth.response;
    const context = { ruc: auth.claims.ruc };

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
    const auth = await requireAdmin({ forbiddenMessage: "No autorizado" });
    if (!auth.ok) return auth.response;
    const context = { ruc: auth.claims.ruc };

    const rawBody = await req.json();
    const parsed = employeePatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", fieldErrors: flattenFieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const admin = supabaseAdmin();
    const userRes = await admin.auth.admin.getUserById(body.userId);
    const user = userRes.data.user;

    if (!user) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

    const claims = readAccessClaims(user);
    if (claims.role !== "employee" || claims.ruc !== context.ruc) {
      return NextResponse.json({ error: "Empleado fuera de tu organización" }, { status: 403 });
    }

    const metadata = parseMetadata(user.user_metadata);
    let update: { user_metadata: UserMetadata } | { app_metadata: Record<string, unknown> };
    if (body.action === "edit") {
      const firstName = (body.firstName ?? metadata.first_name ?? "").trim();
      const lastName = (body.lastName ?? metadata.last_name ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim() || metadata.full_name;
      update = {
        user_metadata: { ...metadata, first_name: firstName, last_name: lastName, full_name: fullName },
      };
    } else {
      update = {
        app_metadata: {
          ...user.app_metadata,
          approval_status: body.action === "approve" ? "active" : "rejected",
        },
      };
    }

    const updateRes = await admin.auth.admin.updateUserById(body.userId, update);

    if (updateRes.error) {
      return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
