import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — Student Fee Portal" },
      { name: "description", content: "Admin sign in to manage students and fees." },
      { property: "og:title", content: "Admin Sign In — Student Fee Portal" },
      { property: "og:description", content: "Admin sign in." },
    ],
  }),
  component: AdminAuth,
});

function AdminAuth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Please enter email and password");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Welcome to Admin Control Panel!");
      navigate({ to: "/admin" });
    } catch (error: any) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found") {
        toast.error("Account not found. Try switching to 'Create Admin Account' tab.");
      } else {
        toast.error(error.message || "Failed to sign in");
      }
    } finally {
      setLoading(false);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Please enter email and password");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      if (res.user) {
        await setDoc(doc(db, "user_roles", res.user.uid), {
          user_id: res.user.uid,
          role: "admin",
          created_at: new Date().toISOString(),
        });
      }
      toast.success("Admin account created successfully! Accessing admin panel...");
      navigate({ to: "/admin" });
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        // If email already exists, try signing in directly
        try {
          await signInWithEmailAndPassword(auth, email, password);
          toast.success("Signed in to Admin Panel!");
          navigate({ to: "/admin" });
        } catch (signInErr: any) {
          toast.error("Email is already in use. Please sign in with your password.");
        }
      } else {
        toast.error(error.message || "Failed to create admin account");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-hero grid place-items-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-purple/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-mint/30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Student Portal
        </Link>

        <div className="glass rounded-3xl p-8 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-purple shadow-glow-purple">
                <ShieldCheck className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Admin Portal Access</h1>
                <p className="text-xs text-muted-foreground">
                  Sign in or create administrator account
                </p>
              </div>
            </div>
          </div>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Admin</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="mt-4 space-y-4">
                <Field label="Admin Email Address" value={email} onChange={setEmail} type="email" placeholder="admin@college.edu" />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="••••••••"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-purple text-primary-foreground font-semibold h-11"
                >
                  {loading ? "Signing in…" : "Sign In to Admin Panel"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="mt-4 space-y-4">
                <Field label="Admin Email Address" value={email} onChange={setEmail} type="email" placeholder="admin@college.edu" />
                <Field
                  label="Create Password (min. 6 chars)"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="••••••••"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-mint text-mint-foreground font-semibold h-11"
                >
                  {loading ? "Creating Account…" : "Create & Access Admin Panel"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
      />
    </div>
  );
}
