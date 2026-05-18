import LoginClient from "./LoginClient";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawRegistered = resolvedSearchParams.registered;
  const registered = Array.isArray(rawRegistered) ? rawRegistered[0] : rawRegistered;

  return <LoginClient registered={registered} />;
}
