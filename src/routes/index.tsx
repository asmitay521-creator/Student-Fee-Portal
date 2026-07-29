import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
  SCHEMES,
  YEARS,
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
  const [enrolmentId, setEnrolmentId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // New Student Registration state
  const [isRegistering, setIsRegistering] = useState(false);
  const [mobile, setMobile] = useState("");
  const [scheme, setScheme] = useState<string>("I-Scheme");
  const [year, setYear] = useState<string>("1st Year");
  const [deptFees, setDeptFees] = useState<Record<string, { tuition_fee: number; exam_fee: number }> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const feeDoc = await getDoc(doc(db, "settings", "department_fees"));
        if (feeDoc.exists()) setDeptFees(feeDoc.data() as any);
      } catch (e) {}
    })();
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const cleanEnrolment = enrolmentId.trim();
    const cleanName = name.trim().toLowerCase();

    if (!cleanEnrolment) return toast.error("Please enter your Enrolment ID / Roll No");
    if (!cleanName || cleanName.length < 2) return toast.error("Please enter your registered full name");

    setLoading(true);
    try {
      // Fetch all students to ensure robust matching across uppercase/lowercase/formatting
      const snap = await getDocs(collection(db, "students"));
      const students = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as any[];

      const targetNormEnrolment = cleanEnrolment.toLowerCase().replace(/[^a-z0-9]/g, "");

      // 1. Find student matching enrolment_id, mobile, or doc id
      const matchedStudent = students.find((s) => {
        const sEnr = (s.enrolment_id || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const sMobile = (s.mobile || "").toString().trim();
        const sId = (s.id || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        return (
          sEnr === targetNormEnrolment ||
          sMobile === cleanEnrolment ||
          sId === targetNormEnrolment
        );
      });

      if (!matchedStudent) {
        toast.error(`No student record found for Enrolment ID "${cleanEnrolment}". Please verify your details or register below.`);
        setLoading(false);
        return;
      }

      // 2. Validate Student Full Name
      const sNameNorm = (matchedStudent.name || "").trim().toLowerCase();
      const isNameMatch =
        sNameNorm === cleanName ||
        sNameNorm.replace(/[^a-z0-9]/g, "") === cleanName.replace(/[^a-z0-9]/g, "") ||
        sNameNorm.includes(cleanName) ||
        cleanName.includes(sNameNorm);

      if (!isNameMatch) {
        toast.error(`Enrolment ID matches, but Student Full Name does not match registered name.`);
        setLoading(false);
        return;
      }

      toast.success(`Welcome back, ${matchedStudent.name}! Accessing fee dashboard...`);
      navigate({ to: "/dashboard/$studentId", params: { studentId: matchedStudent.id } });
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Failed to sign in"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const cleanEnrolment = enrolmentId.trim();
    const cleanName = name.trim();
    if (!cleanEnrolment) return toast.error("Enter your Enrolment ID / Roll No");
    if (!cleanName || cleanName.length < 2) return toast.error("Enter your full name");
    if (!/^\d{10}$/.test(mobile)) return toast.error("Mobile must be 10 digits");
    if (!scheme) return toast.error("Select academic scheme");
    if (!year) return toast.error("Select studying year");

    setLoading(true);
    try {
      // Check if student with enrolment ID already exists
      const existingSnap = await getDocs(query(collection(db, "students"), where("enrolment_id", "==", cleanEnrolment)));
      if (!existingSnap.empty) {
        toast.error("A student account with this Enrolment ID already exists. Please switch to Sign In.");
        setLoading(false);
        return;
      }

      let examFee = 50000;
      let tuitionFee = 850;
      if (deptFees && deptFees[scheme]) {
        tuitionFee = deptFees[scheme].tuition_fee;
        examFee = deptFees[scheme].exam_fee;
      } else {
        tuitionFee = 850;
      }

      const docRef = await addDoc(collection(db, "students"), {
        enrolment_id: cleanEnrolment,
        name: cleanName,
        mobile,
        scheme,
        year,
        course: scheme,
        branch: year,
        exam_fee: examFee,
        tuition_fee: tuitionFee,
        exam_paid: false,
        tuition_paid_amount: 0,
        college_paid_amount: 0,
        first_half_amount: Math.ceil(tuitionFee / 2),
        created_at: new Date().toISOString(),
      });

      toast.success("Student account registered successfully!");
      navigate({ to: "/dashboard/$studentId", params: { studentId: docRef.id } });
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Failed to register"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="h-screen h-[100dvh] w-full bg-cover bg-center bg-no-repeat relative flex flex-col justify-between overflow-hidden"
      style={{ backgroundImage: `url('/college_bg.png')` }}
    >
      {/* Subtle overlay */}
      <div className="absolute inset-0 bg-black/25 sm:bg-black/15 z-0" />

      {/* Compact Navbar */}
      <header className="shrink-0 z-30 w-full bg-white/98 backdrop-blur border-b border-orange-100 shadow-sm">
        <div className="mx-auto flex max-w-6xl w-full items-center justify-between px-3 sm:px-6 py-1.5 sm:py-2">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img src="/college_logo.png" alt="NPC Dhule Logo" className="h-8 sm:h-9 w-auto object-contain shrink-0 filter drop-shadow-sm" />
            <div className="leading-tight">
              <span className="font-extrabold text-xs sm:text-base tracking-tight text-slate-900 block">
                Netaji Polytechnic College, Dhule
              </span>
              <span className="text-[10px] sm:text-xs text-orange-600 font-bold tracking-wide">Student Fee Portal</span>
            </div>
          </div>

          <Link
            to="/admin/auth"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 transition-colors border border-slate-200"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-orange-600" />
            <span>Admin Portal</span>
          </Link>
        </div>
      </header>

      {/* Main Container - fixed 100vh non-scrolling stable layout */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-3 sm:px-4 py-2 sm:py-4 overflow-y-auto">
        <div className="bg-white/96 backdrop-blur text-foreground border border-white/60 shadow-xl w-full max-w-md rounded-2xl p-4 sm:p-6 space-y-3 my-auto">
          {/* Tab Switcher for Sign In / Manual Registration */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setIsRegistering(false)}
              className={`py-1.5 rounded-lg transition-all ${!isRegistering ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Student Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsRegistering(true)}
              className={`py-1.5 rounded-lg transition-all ${isRegistering ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              New Student Register
            </button>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-1 shadow-sm">
              <GraduationCap className="h-6 w-6 text-orange-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
              {isRegistering ? "New Student Manual Registration" : "Student Portal Sign In"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRegistering
                ? "Create a new student profile manually using your Enrolment ID."
                : "Log in with your Enrolment ID and registered Full Name."}
            </p>
          </div>

          {!isRegistering ? (
            <form onSubmit={handleSignIn} className="space-y-3">
              {/* Enrolment ID */}
              <div className="space-y-1">
                <Label htmlFor="enrolmentId" className="text-xs font-bold text-slate-700">Enter your enrolment no/id</Label>
                <Input
                  id="enrolmentId"
                  placeholder="Enter your enrolment no/id"
                  value={enrolmentId}
                  onChange={(e) => setEnrolmentId(e.target.value)}
                  className="bg-white border-slate-200 h-10 text-xs sm:text-sm px-3 rounded-xl focus-visible:ring-orange-400 font-mono"
                  required
                />
              </div>

              {/* Student Full Name */}
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-bold text-slate-700">Student Full Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your registered full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white border-slate-200 h-10 text-xs sm:text-sm px-3 rounded-xl focus-visible:ring-orange-400"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold h-10 text-sm rounded-xl shadow-md shadow-orange-600/30 transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Authenticating…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Sign In to Portal <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <div className="pt-1 text-center text-xs text-slate-500">
                Not registered yet?{" "}
                <button
                  type="button"
                  onClick={() => setIsRegistering(true)}
                  className="font-bold text-orange-600 underline hover:text-orange-700"
                >
                  Create Student Account
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="regEnrolment" className="text-xs font-bold text-slate-700">Enter your enrolment no/id</Label>
                <Input
                  id="regEnrolment"
                  placeholder="Enter your enrolment no/id"
                  value={enrolmentId}
                  onChange={(e) => setEnrolmentId(e.target.value)}
                  className="bg-white border-slate-200 h-10 text-xs sm:text-sm px-3 rounded-xl focus-visible:ring-orange-400 font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="regName" className="text-xs font-bold text-slate-700">Student Full Name</Label>
                <Input
                  id="regName"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white border-slate-200 h-10 text-xs sm:text-sm px-3 rounded-xl focus-visible:ring-orange-400"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="regMobile" className="text-xs font-bold text-slate-700">Mobile Number</Label>
                <Input
                  id="regMobile"
                  placeholder="10-digit mobile number"
                  inputMode="numeric"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="bg-white border-slate-200 h-10 font-mono text-xs sm:text-sm px-3 rounded-xl focus-visible:ring-orange-400"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Academic Scheme</Label>
                  <Select value={scheme} onValueChange={setScheme}>
                    <SelectTrigger className="bg-white border-slate-200 h-10 text-xs px-3 rounded-xl">
                      <SelectValue placeholder="Select scheme" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEMES.map((sc) => (
                        <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Studying Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="bg-white border-slate-200 h-10 text-xs px-3 rounded-xl">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((yr) => (
                        <SelectItem key={yr} value={yr}>{yr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold h-10 text-sm rounded-xl shadow-md shadow-orange-600/30 transition-all"
              >
                {loading ? "Registering…" : "Complete Registration"}
              </Button>

              <div className="pt-1 text-center text-xs text-slate-500">
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="font-bold text-orange-600 underline hover:text-orange-700"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 shrink-0 w-full py-1.5 text-center text-[10px] text-white/80 bg-black/20 backdrop-blur-sm">
        Student Fee Portal &copy; {new Date().getFullYear()} — All rights reserved.
      </footer>
    </div>
  );
}
