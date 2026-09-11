import LoginClient from "./LoginClient";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const registered = firstValue(resolvedSearchParams.registered);
  const reset = firstValue(resolvedSearchParams.reset);

  return <LoginClient registered={registered} reset={reset} />;
}
