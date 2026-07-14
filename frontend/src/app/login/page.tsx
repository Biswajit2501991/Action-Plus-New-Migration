import { Manrope, Syne } from "next/font/google";
import { LoginForm } from "@/features/auth/login-form";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-login-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-login-sans",
  display: "swap",
});

export default function LoginPage() {
  return (
    <div className={`${syne.variable} ${manrope.variable}`}>
      <LoginForm />
    </div>
  );
}
