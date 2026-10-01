import LoginForm from "./LoginForm";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm expiredLink={Boolean(error)} />;
}
