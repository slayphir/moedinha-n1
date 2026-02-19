"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    try {
      // Supabase sends a confirmation email by default
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
        return;
      }

      setMessage({
        type: "success",
        text: "Cadastro realizado! Verifique seu e-mail para confirmar a conta.",
      });
    } catch (err) {
      const text =
        err instanceof Error && err.message
          ? err.message
          : "Falha de rede ao cadastrar. Verifique internet, URL do Supabase e Redirect URL permitida.";

      console.error("[sign-up] unexpected error", err);
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
      </div>
      {message && (
        <div
          className={`p-3 rounded text-sm ${
            message.type === "error" 
              ? "bg-destructive/15 text-destructive" 
              : "bg-green-100 text-green-700"
          }`}
        >
          {message.text}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Cadastrando..." : "Cadastrar"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Já tem uma conta?{" "}
        <Link href="/" className="underline hover:text-primary">
          Entrar
        </Link>
      </p>
    </form>
  );
}
