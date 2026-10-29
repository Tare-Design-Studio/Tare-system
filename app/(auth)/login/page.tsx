import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign In — Tare system" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { reset } = await searchParams;
  return <LoginForm passwordReset={reset === "1"} />;
}
