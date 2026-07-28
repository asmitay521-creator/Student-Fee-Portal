import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  Phone,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  getCountFromServer,
  doc,
  getDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BRANCHES,
  COURSES,
  DEFAULT_TUITION_FEE_BY_COURSE,
  type Course,
} from "@/lib/courses";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Student Fee Portal" },
      { name: "description", content: "Enter your details to access your personal fee dashboard." },
    ],
  }),
  component: Entry,
});

function Entry() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [course, setCourse] = useState<string>("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deptFees, setDeptFees] = useState<Record<string, { tuition_fee: number; exam_fee: number }> | null>(null);
  const [courseBranchConfig, setCourseBranchConfig] = useState<{
    courses: string[];
    branches: Record<string, string[]>;
  }>({ courses: [...COURSES], branches: { ...BRANCHES } });

  const availableBranches = course ? courseBranchConfig.branches[course] || [] : [];

  useEffect(() => {
    (async () => {
      try {
        const feeDoc = await getDoc(doc(db, "settings", "department_fees"));
        if (feeDoc.exists()) setDeptFees(feeDoc.data() as any);

        const cbDoc = await getDoc(doc(db, "settings", "course_branches"));
        if (cbDoc.exists()) {
          const d = cbDoc.data() as any;
          if (d.courses && d.branches) setCourseBranchConfig({ courses: d.courses, branches: d.branches });
        }
      } catch (e) {}
    })();
  }, []);

  // Auto-login when 10-digit mobile matches existing student
  useEffect(() => {
    if (mobile.length === 10) {
      (async () => {
        try {
          const q = query(collection(db, "students"), where("mobile", "==", mobile));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const data = d.data() as any;
            toast.success(`Welcome back, ${data.name}! Logging in...`);
            navigate({ to: "/dashboard/$studentId", params: { studentId: d.id } });
          }
        } catch (e) {}
      })();
    }
  }, [mobile, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) return toast.error("Enter your full name");
    if (!/^\d{10}$/.test(mobile)) return toast.error("Mobile must be 10 digits");
    if (!course) return toast.error("Select course");
    if (!branch) return toast.error("Select branch");

    setLoading(true);
    try {
      const q = query(collection(db, "students"), where("mobile", "==", mobile));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const existing = { id: docSnap.id, ...docSnap.data() } as { id: string; name: string };
        if (existing.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
          toast.error("This mobile number is registered under a different name.");
          setLoading(false);
          return;
        }
        toast.success(`Welcome back, ${existing.name}!`);
        navigate({ to: "/dashboard/$studentId", params: { studentId: existing.id } });
        return;
      }

      let examFee = 50000;
      let tuitionFee = 850;
      if (deptFees && deptFees[course]) {
        tuitionFee = deptFees[course].tuition_fee;
        examFee = deptFees[course].exam_fee;
      } else {
        tuitionFee = DEFAULT_TUITION_FEE_BY_COURSE[course as Course] || 850;
      }

      const docRef = await addDoc(collection(db, "students"), {
        name: name.trim(),
        mobile,
        course,
        branch,
        exam_fee: examFee,
        tuition_fee: tuitionFee,
        exam_paid: false,
        tuition_paid_amount: 0,
        first_half_amount: Math.ceil(tuitionFee / 2),
        created_at: new Date().toISOString(),
      });

      toast.success("Account created successfully!");
      navigate({ to: "/dashboard/$studentId", params: { studentId: docRef.id } });
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat relative flex flex-col"
      style={{ backgroundImage: `url('/college_bg.png')` }}
    >
      {/* Subtle overlay — no blur */}
      <div className="absolute inset-0 bg-black/10 z-0" />

      {/* Sticky Navbar */}
      <header className="sticky top-0 z-30 w-full bg-white border-b border-orange-100 shadow-sm">
        <div className="mx-auto flex max-w-5xl w-full items-center px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-600 shadow-md shadow-orange-600/20 shrink-0">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-black text-base sm:text-lg tracking-tight text-slate-900">
              Student Fee Portal
            </span>
          </div>
        </div>
      </header>

      {/* Main — scrollable on mobile, centered on larger screens */}
      <main className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-10">
        <div className="bg-white/96 text-foreground border border-white/50 shadow-2xl w-full max-w-md rounded-2xl p-5 sm:p-7 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Student Sign In</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your details to sign in or access your fee dashboard.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs font-bold text-slate-700">Student Full Name</Label>
              <Input
                id="name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white border-slate-200 h-11 text-sm px-3 rounded-xl focus-visible:ring-orange-400"
              />
            </div>

            {/* Mobile Number */}
            <div className="space-y-1">
              <Label htmlFor="mobile" className="text-xs font-bold text-slate-700">Mobile Number</Label>
              <Input
                id="mobile"
                placeholder="10-digit mobile number"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="bg-white border-slate-200 h-11 font-mono text-sm px-3 rounded-xl focus-visible:ring-orange-400"
              />
            </div>

            {/* Course & Branch — stacked on mobile, side-by-side on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Department / Course</Label>
                <Select value={course} onValueChange={(v) => { setCourse(v); setBranch(""); }}>
                  <SelectTrigger className="bg-white border-slate-200 h-11 text-sm px-3 rounded-xl">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseBranchConfig.courses.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Branch</Label>
                <Select value={branch} onValueChange={setBranch} disabled={!course}>
                  <SelectTrigger className="bg-white border-slate-200 h-11 text-sm px-3 rounded-xl">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sign In Button — full width, large touch target */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold h-12 text-base rounded-xl shadow-lg shadow-orange-600/30 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processing…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Sign In <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-3 text-center text-[11px] text-white/70">
        Student Fee Portal &copy; {new Date().getFullYear()} — All rights reserved.
      </footer>
    </div>
  );
}
