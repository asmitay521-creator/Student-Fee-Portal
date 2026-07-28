import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Phone,
  HelpCircle,
  BookOpen,
  CheckCircle2,
  Building2,
  FileText,
  Lock,
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
  DEFAULT_EXAM_FEE,
  DEFAULT_TUITION_FEE_BY_COURSE,
  type Course,
} from "@/lib/courses";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Student Fee Portal" },
      {
        name: "description",
        content: "Enter your details to access your personal fee dashboard.",
      },
      { property: "og:title", content: "Sign in — Student Fee Portal" },
      {
        property: "og:description",
        content: "Enter your details to access your personal fee dashboard.",
      },
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
  const [existingStudent, setExistingStudent] = useState<{ id: string; name: string; course: string; branch: string } | null>(null);
  const [totalStudentsCount, setTotalStudentsCount] = useState<number | null>(null);
  const [deptFees, setDeptFees] = useState<Record<string, { tuition_fee: number; exam_fee: number }> | null>(null);
  const [courseBranchConfig, setCourseBranchConfig] = useState<{ courses: string[]; branches: Record<string, string[]> }>({
    courses: [...COURSES],
    branches: { ...BRANCHES },
  });

  const [showFeeStructureModal, setShowFeeStructureModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const availableBranches = course ? courseBranchConfig.branches[course] || [] : [];

  // Fetch live stats & courses/branches configuration from Firestore
  useEffect(() => {
    (async () => {
      try {
        const coll = collection(db, "students");
        const snapshot = await getCountFromServer(coll);
        setTotalStudentsCount(snapshot.data().count);

        const feeDoc = await getDoc(doc(db, "settings", "department_fees"));
        if (feeDoc.exists()) {
          setDeptFees(feeDoc.data() as any);
        }

        const cbDoc = await getDoc(doc(db, "settings", "course_branches"));
        if (cbDoc.exists()) {
          const d = cbDoc.data() as any;
          if (d.courses && d.branches) {
            setCourseBranchConfig({ courses: d.courses, branches: d.branches });
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // Dynamic mobile lookup when 10 digits are typed
  useEffect(() => {
    if (mobile.length === 10) {
      (async () => {
        try {
          const q = query(collection(db, "students"), where("mobile", "==", mobile));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const data = d.data() as any;
            setExistingStudent({ id: d.id, name: data.name, course: data.course, branch: data.branch });
            setName(data.name);
            if (data.course) setCourse(data.course);
            if (data.branch) setBranch(data.branch);
          } else {
            setExistingStudent(null);
          }
        } catch (e) {
          // ignore
        }
      })();
    } else {
      setExistingStudent(null);
    }
  }, [mobile]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (existingStudent) {
      toast.success(`Welcome back, ${existingStudent.name}!`);
      navigate({ to: "/dashboard/$studentId", params: { studentId: existingStudent.id } });
      return;
    }

    if (!name.trim() || name.trim().length < 2) {
      toast.error("Enter your full name");
      return;
    }
    if (!/^\d{10}$/.test(mobile)) {
      toast.error("Mobile must be 10 digits");
      return;
    }
    if (!course) {
      toast.error("Select course");
      return;
    }
    if (!branch) {
      toast.error("Select branch");
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, "students"), where("mobile", "==", mobile));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const existing = { id: docSnap.id, ...docSnap.data() } as { id: string; name: string; mobile: string };
        if (existing.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
          toast.error("This mobile number is registered under a different name.");
          setLoading(false);
          return;
        }
        toast.success(`Welcome back, ${existing.name}!`);
        navigate({ to: "/dashboard/$studentId", params: { studentId: existing.id } });
        return;
      }

      // Check dynamic department fee structure or fallback
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
    } catch (error: any) {
      toast.error("Error creating student record: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-cover bg-center bg-no-repeat relative flex flex-col justify-between"
      style={{ backgroundImage: `url('/college_bg.png')` }}
    >
      {/* Dark overlay for optimal contrast */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-0" />

      {/* Navigation Bar - Clean Header */}
      <header className="w-full bg-white border-b border-orange-100 shadow-xs px-4 sm:px-6 py-3 z-30 shrink-0">
        <div className="mx-auto flex max-w-6xl w-full items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-orange-600 shadow-md shadow-orange-600/20 shrink-0">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 block truncate">
                Student Fee Portal
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content: Perfectly Centered Static Sign In Card (NO SCROLL VIEW) */}
      <main className="mx-auto max-w-6xl w-full px-4 flex-1 flex items-center justify-center z-10 py-2 overflow-hidden">
        <div className="bg-white/95 text-foreground border border-white/60 shadow-2xl backdrop-blur-xl max-w-md w-full rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-3.5 sm:space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground">Student Sign In</h2>
            <p className="text-xs text-muted-foreground">
              Enter your details to sign in or access your fee dashboard.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs font-bold">Student Full Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-card font-medium border-border h-9 text-xs sm:text-sm px-3"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="mobile" className="text-xs font-bold">Mobile Number</Label>
              <Input
                id="mobile"
                placeholder="10-digit mobile number"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="bg-card font-medium font-mono text-xs sm:text-sm border-border h-9 px-3"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Department / Course</Label>
                <Select value={course} onValueChange={(v) => { setCourse(v); setBranch(""); }}>
                  <SelectTrigger id="course-trigger" className="bg-card border-border h-9 text-xs px-3">
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
                <Label className="text-xs font-bold">Branch</Label>
                <Select value={branch} onValueChange={setBranch} disabled={!course}>
                  <SelectTrigger id="branch-trigger" className="bg-card border-border h-9 text-xs px-3">
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-extrabold py-4 sm:py-5 text-sm sm:text-base rounded-xl shadow-md shadow-orange-600/30 transition-all mt-1"
            >
              {loading ? (
                "Processing…"
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  Sign In <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </main>

      {/* Footer - Fixed Bottom */}
      <footer className="mx-auto max-w-6xl w-full px-6 py-2 text-center text-[11px] text-white/80 z-10 shrink-0">
        Student Fee Portal &copy; {new Date().getFullYear()} — All rights reserved.
      </footer>

      {/* Fee Structure Modal */}
      <Dialog open={showFeeStructureModal} onOpenChange={setShowFeeStructureModal}>
        <DialogContent className="bg-card border-border w-[92vw] max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
              <BookOpen className="h-5 w-5 text-orange-600" /> College Fee Structure Overview
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Official fee breakdown and payment half options for students.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm">
            <div className="rounded-2xl bg-orange-50/80 border border-orange-100 p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
              <div className="flex justify-between font-bold text-orange-950">
                <span>College Fee (Total)</span>
                <span className="text-sm sm:text-base text-orange-600">₹50,000</span>
              </div>
              <p className="text-xs text-muted-foreground">
                College fee covers annual academic tuition & examination facilities. Can be paid full or split into 2 half installments of ₹25,000 each.
              </p>
            </div>

            <div className="rounded-2xl bg-amber-50/80 border border-amber-100 p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
              <div className="flex justify-between font-bold text-amber-950">
                <span>Tuition Fee (Total)</span>
                <span className="text-sm sm:text-base text-amber-700">₹850</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tuition fee covers lab, library & activity charges. Can be paid in custom amounts or 2 half installments.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowFeeStructureModal(false)} className="bg-orange-600 text-white font-bold w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help & Support Modal */}
      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="bg-card border-border w-[92vw] max-w-md max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
              <HelpCircle className="h-5 w-5 text-orange-600" /> Student Help & Support
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Have questions regarding fee payments or technical issues?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <Phone className="h-5 w-5 text-orange-600 shrink-0" />
              <div>
                <div className="font-bold">Student Helpline</div>
                <div className="text-xs text-muted-foreground">+91 1800-123-4567 (Mon-Sat, 9 AM - 6 PM)</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <ShieldCheck className="h-5 w-5 text-orange-600 shrink-0" />
              <div>
                <div className="font-bold">Accounts & Fee Counter</div>
                <div className="text-xs text-muted-foreground">Building A, Ground Floor, Accounts Office</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowHelpModal(false)} className="bg-orange-600 text-white font-bold w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
