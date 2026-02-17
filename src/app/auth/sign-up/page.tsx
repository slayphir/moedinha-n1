import { SignUpForm } from "./_components/sign-up-form";

export default function SignUpPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Criar Conta</h1>
                    <p className="mt-2 text-muted-foreground">
                        Comece a controlar suas finanças hoje
                    </p>
                </div>
                <SignUpForm />
            </div>
        </div>
    );
}
