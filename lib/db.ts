// /lib/db.ts
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Role = "user" | "assistant";

export async function listConversations(user_id: string) {
  const supabase = supabaseBrowser();
  return supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false });
}

export async function createConversation(user_id: string) {
  const supabase = supabaseBrowser();
  return supabase
    .from("conversations")
    .insert({ user_id, title: "Nuevo chat" })
    .select("*")
    .single();
}

export async function listMessages(conversation_id: string) {
  const supabase = supabaseBrowser();
  return supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true });
}

export async function addMessage(conversation_id: string, role: Role, content: string) {
  const supabase = supabaseBrowser();
  return supabase
    .from("messages")
    .insert({ conversation_id, role, content })
    .select("*")
    .single();
}

export async function renameConversation(conversation_id: string, title: string) {
  const supabase = supabaseBrowser();
  return supabase.from("conversations").update({ title }).eq("id", conversation_id);
}

export async function deleteConversation(conversation_id: string) {
  const supabase = supabaseBrowser();

  const messagesResult = await supabase.from("messages").delete().eq("conversation_id", conversation_id);
  if (messagesResult.error) return messagesResult;

  return supabase.from("conversations").delete().eq("id", conversation_id);
}
