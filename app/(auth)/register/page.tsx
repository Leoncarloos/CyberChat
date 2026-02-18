"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);

    // Si supabase no pide confirmación por email, ya queda logueado
    if (data.session) router.push("/chat");
    else setMsg("Revisa tu correo para confirmar tu cuenta (si está activado).");
  }

  return (
    <div style={{ maxWidth: 360, margin: "60px auto" }}>
      <h1>Registro</h1>
      <form onSubmit={onRegister}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <br />
        <input
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br />
        <button type="submit">Crear cuenta</button>
      </form>
      {msg && <p>{msg}</p>}
      <p>
        ¿Ya tienes cuenta? <a href="/login">Inicia sesión</a>
      </p>
    </div>
  );
}
