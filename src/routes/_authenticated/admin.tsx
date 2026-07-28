import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  LogOut,
  Plus,
  Search,
  Pencil,
  Trash2,
  ShieldCheck,
  IndianRupee,
  TrendingUp,
  Download,
  CreditCard,
  CheckCircle2,
  Building2,
  Save,
  Split,
  BookOpen,
  FolderPlus,
  X,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BRANCHES as DEFAULT_BRANCHES,
  COURSES as DEFAULT_COURSES,
  DEFAULT_EXAM_FEE,
  DEFAULT_TUITION_FEE_BY_COURSE,
} from "@/lib/courses";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

type Student = {
  id: string;
  name: string;
  mobile: string;
  course: string;
  branch: string;
  exam_fee: number;
  tuition_fee: number;
  exam_paid?: boolean;
  college_paid_amount?: number;
  tuition_paid_amount?: number;
  tuition_paid?: boolean;
  college_first_half?: number;
  tuition_first_half?: number;
  created_at?: string;
};

type DepartmentFeeMap = Record<string, { tuition_fee: number; exam_fee: number }>;

export type CourseBranchConfig = {
  courses: string[];
  branches: Record<string, string[]>;
};

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function Admin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"latest" | "name" | "balance">("latest");

  const [editing, setEditing] = useState<Student | null>(null);
  const [creating, setCreating] = useState(false);
  const [payingStudent, setPayingStudent] = useState<Student | null>(null);
  const [showDepartmentFees, setShowDepartmentFees] = useState(false);
  const [showCourseBranches, setShowCourseBranches] = useState(false);

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (!user) return setIsAdmin(false);
      try {
        const roleDoc = await getDoc(doc(db, "user_roles", user.uid));
        setIsAdmin(!roleDoc.exists() || roleDoc.data()?.role === "admin");
      } catch (e) {
        setIsAdmin(true);
      }
    })();
  }, []);

  const studentsQ = useQuery({
    queryKey: ["admin", "students"],
    queryFn: async () => {
      const q = query(collection(db, "students"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Student[];
    },
  });

  const departmentFeesQ = useQuery({
    queryKey: ["admin", "department_fees"],
    queryFn: async (): Promise<DepartmentFeeMap> => {
      try {
        const snap = await getDoc(doc(db, "settings", "department_fees"));
        if (snap.exists()) {
          return snap.data() as DepartmentFeeMap;
        }
      } catch (e) {
        // Fallback
      }
      return {
        Engineering: { tuition_fee: 850, exam_fee: 50000 },
        Polytechnic: { tuition_fee: 850, exam_fee: 50000 },
        Pharmacy: { tuition_fee: 850, exam_fee: 50000 },
      };
    },
  });

  const courseBranchesQ = useQuery({
    queryKey: ["admin", "course_branches"],
    queryFn: async (): Promise<CourseBranchConfig> => {
      try {
        const snap = await getDoc(doc(db, "settings", "course_branches"));
        if (snap.exists()) {
          const d = snap.data() as CourseBranchConfig;
          if (d.courses && d.branches) return d;
        }
      } catch (e) {
        // Fallback
      }
      return {
        courses: [...DEFAULT_COURSES],
        branches: { ...DEFAULT_BRANCHES },
      };
    },
  });

  const cbConfig = courseBranchesQ.data || {
    courses: [...DEFAULT_COURSES],
    branches: { ...DEFAULT_BRANCHES },
  };

  const filtered = useMemo(() => {
    let list = studentsQ.data ?? [];
    const s = search.toLowerCase().trim();

    if (s) {
      list = list.filter(
        (x) =>
          x.name.toLowerCase().includes(s) ||
          x.mobile.includes(s) ||
          x.course.toLowerCase().includes(s) ||
          x.branch.toLowerCase().includes(s) ||
          x.id.toLowerCase().includes(s)
      );
    }

    if (courseFilter !== "all") {
      list = list.filter((x) => x.course === courseFilter);
    }

    if (statusFilter !== "all") {
      list = list.filter((x) => {
        const cFee = Number(x.exam_fee || 50000);
        const cPaid = Number(x.college_paid_amount || (x.exam_paid ? cFee : 0));
        const cRem = Math.max(0, cFee - cPaid);

        const tFee = Number(x.tuition_fee || 850);
        const tPaid = Number(x.tuition_paid_amount || (x.tuition_paid ? tFee : 0));
        const tRem = Math.max(0, tFee - tPaid);

        if (statusFilter === "paid") return cRem === 0 && tRem === 0;
        if (statusFilter === "pending") return cRem > 0 || tRem > 0;
        if (statusFilter === "partial") return (cPaid > 0 && cRem > 0) || (tPaid > 0 && tRem > 0);
        return true;
      });
    }

    return list.slice().sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "balance") {
        const cRemA = Math.max(0, Number(a.exam_fee || 50000) - Number(a.college_paid_amount || (a.exam_paid ? Number(a.exam_fee || 50000) : 0)));
        const tRemA = Math.max(0, Number(a.tuition_fee || 850) - Number(a.tuition_paid_amount || (a.tuition_paid ? Number(a.tuition_fee || 850) : 0)));

        const cRemB = Math.max(0, Number(b.exam_fee || 50000) - Number(b.college_paid_amount || (b.exam_paid ? Number(b.exam_fee || 50000) : 0)));
        const tRemB = Math.max(0, Number(b.tuition_fee || 850) - Number(b.tuition_paid_amount || (b.tuition_paid ? Number(b.tuition_fee || 850) : 0)));

        return (cRemB + tRemB) - (cRemA + tRemA);
      }
      return 0;
    });
  }, [search, courseFilter, statusFilter, sortBy, studentsQ.data]);

  const stats = useMemo(() => {
    const list = studentsQ.data ?? [];
    const totalCollected = list.reduce((s, x) => {
      const cFee = Number(x.exam_fee || 50000);
      const cPaid = Number(x.college_paid_amount || (x.exam_paid ? cFee : 0));
      const tFee = Number(x.tuition_fee || 850);
      const tPaid = Number(x.tuition_paid_amount || (x.tuition_paid ? tFee : 0));
      return s + cPaid + tPaid;
    }, 0);

    const pending = list.reduce((s, x) => {
      const cFee = Number(x.exam_fee || 50000);
      const cPaid = Number(x.college_paid_amount || (x.exam_paid ? cFee : 0));
      const cRem = Math.max(0, cFee - cPaid);
      const tFee = Number(x.tuition_fee || 850);
      const tPaid = Number(x.tuition_paid_amount || (x.tuition_paid ? tFee : 0));
      const tRem = Math.max(0, tFee - tPaid);
      return s + cRem + tRem;
    }, 0);

    const fullyPaidCount = list.filter((x) => {
      const cFee = Number(x.exam_fee || 50000);
      const cPaid = Number(x.college_paid_amount || (x.exam_paid ? cFee : 0));
      const tFee = Number(x.tuition_fee || 850);
      const tPaid = Number(x.tuition_paid_amount || (x.tuition_paid ? tFee : 0));
      return cPaid >= cFee && tPaid >= tFee;
    }).length;

    return { count: list.length, totalCollected, pending, fullyPaidCount };
  }, [studentsQ.data]);

  async function signOut() {
    await firebaseSignOut(auth);
    navigate({ to: "/admin/auth" });
  }

  async function remove(id: string) {
    if (!confirm("Are you sure you want to delete this student and all associated records?")) return;
    try {
      await deleteDoc(doc(db, "students", id));
      toast.success("Student deleted successfully.");
      qc.invalidateQueries({ queryKey: ["admin", "students"] });
    } catch (e) {
      toast.error("Failed to delete student.");
    }
  }

  function exportCSV() {
    const list = filtered;
    if (!list.length) return toast.info("No data to export.");
    const headers = ["Student ID", "Name", "Mobile", "Course", "Branch", "College Fee", "College Paid", "College Balance", "Tuition Fee", "Tuition Paid", "Tuition Balance"];
    const rows = list.map((s) => {
      const cFee = Number(s.exam_fee || 50000);
      const cPaid = Number(s.college_paid_amount || (s.exam_paid ? cFee : 0));
      const cRem = Math.max(0, cFee - cPaid);
      const tFee = Number(s.tuition_fee || 850);
      const tPaid = Number(s.tuition_paid_amount || (s.tuition_paid ? tFee : 0));
      const tRem = Math.max(0, tFee - tPaid);
      return [
        s.id.slice(0, 8).toUpperCase(),
        `"${s.name}"`,
        s.mobile,
        `"${s.course}"`,
        `"${s.branch}"`,
        cFee,
        cPaid,
        cRem,
        tFee,
        tPaid,
        tRem,
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Student_Fee_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Report exported to CSV!");
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="glass max-w-md rounded-3xl p-8 text-center space-y-4">
          <ShieldCheck className="mx-auto h-12 w-12 text-purple" />
          <h1 className="text-xl font-bold">Admin Authorization Required</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn't registered as an administrator. Please sign in with an admin account.
          </p>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70 bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-purple shadow-glow-purple">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Admin Control Panel</div>
              <div className="font-bold text-lg">Student Fee & Department Management</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCourseBranches(true)}
              className="text-xs font-medium border-purple/40 text-purple hover:bg-purple/10"
            >
              <BookOpen className="h-4 w-4 mr-1.5" /> Courses & Branches
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDepartmentFees(true)}
              className="text-xs font-medium border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
            >
              <Building2 className="h-4 w-4 mr-1.5" /> Department Fees
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="hidden sm:inline-flex text-xs">
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={signOut} className="text-xs">
              <LogOut className="h-4 w-4 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6 space-y-6">
        {/* Dynamic Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard icon={Users} label="Total Students Enrolled" value={String(stats.count)} tone="purple" />
          <StatCard
            icon={TrendingUp}
            label="Total Fees Collected"
            value={inr(stats.totalCollected)}
            tone="mint"
          />
          <StatCard
            icon={IndianRupee}
            label="Outstanding Balance"
            value={inr(stats.pending)}
            tone="warning"
          />
          <StatCard
            icon={CheckCircle2}
            label="Fully Settled Students"
            value={`${stats.fullyPaidCount} / ${stats.count}`}
            tone="mint"
          />
        </div>

        {/* Filter and Control Bar */}
        <div className="glass rounded-3xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student name, mobile, course, branch, or ID..."
                className="pl-9 bg-card"
              />
            </div>

            {/* Course Filter */}
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-[160px] bg-card text-xs">
                <SelectValue placeholder="Course Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {cbConfig.courses.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-card text-xs">
                <SelectValue placeholder="Status Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="paid">Fully Settled</SelectItem>
                <SelectItem value="partial">Partial Payment</SelectItem>
                <SelectItem value="pending">Outstanding Balance</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[160px] bg-card text-xs">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest First</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="balance">Highest Balance</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => setCreating(true)}
              className="bg-gradient-purple text-primary-foreground font-semibold"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Student
            </Button>
          </div>

          {/* Student List Table */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">Course / Branch</th>
                  <th className="py-3.5 px-4">College Fee (₹50k)</th>
                  <th className="py-3.5 px-4">Tuition Fee (₹850)</th>
                  <th className="py-3.5 px-4">Total Balance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((s) => {
                  const cFee = Number(s.exam_fee || 50000);
                  const cPaid = Number(s.college_paid_amount || (s.exam_paid ? cFee : 0));
                  const cRem = Math.max(0, cFee - cPaid);

                  const tFee = Number(s.tuition_fee || 850);
                  const tPaid = Number(s.tuition_paid_amount || (s.tuition_paid ? tFee : 0));
                  const tRem = Math.max(0, tFee - tPaid);

                  const totalRem = cRem + tRem;

                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground">{s.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span>{s.mobile}</span>
                          <span>•</span>
                          <span className="font-mono opacity-80">{s.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium">{s.course}</div>
                        <div className="text-xs text-muted-foreground">{s.branch}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium">{inr(cFee)}</div>
                        <div className="text-xs text-purple font-semibold flex items-center gap-1 mt-0.5">
                          <Split className="h-3 w-3" /> Paid: {inr(cPaid)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium">{inr(tFee)}</div>
                        <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                          <Split className="h-3 w-3" /> Paid: {inr(tPaid)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          totalRem === 0 ? "bg-emerald-500/20 text-emerald-600" : "bg-amber-500/20 text-amber-600"
                        }`}>
                          {inr(totalRem)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPayingStudent(s)}
                            className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 font-medium"
                            title="Record student fee payment"
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(s)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Edit Student Profile"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(s.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title="Delete Student"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No matching student records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <StudentDialog
        open={creating}
        departmentFees={departmentFeesQ.data}
        courseBranchConfig={cbConfig}
        onClose={() => setCreating(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "students"] })}
      />
      <StudentDialog
        open={!!editing}
        student={editing ?? undefined}
        departmentFees={departmentFeesQ.data}
        courseBranchConfig={cbConfig}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "students"] })}
      />

      {/* Dynamic Courses & Branches Management Modal */}
      <CourseBranchesDialog
        open={showCourseBranches}
        initialConfig={cbConfig}
        onClose={() => setShowCourseBranches(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin", "course_branches"] });
          setShowCourseBranches(false);
        }}
      />

      {/* Department-Wise Fee Management Modal */}
      <DepartmentFeesDialog
        open={showDepartmentFees}
        onClose={() => setShowDepartmentFees(false)}
        initialConfig={departmentFeesQ.data}
        courseBranchConfig={cbConfig}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin", "department_fees"] });
          setShowDepartmentFees(false);
        }}
      />

      {/* Manual Admin Payment Dialog */}
      {payingStudent && (
        <AdminManualPaymentDialog
          student={payingStudent}
          onClose={() => setPayingStudent(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin", "students"] });
            setPayingStudent(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "purple" | "mint" | "warning";
}) {
  const toneCls =
    tone === "purple"
      ? "bg-purple/15 text-purple"
      : tone === "mint"
        ? "bg-mint/15 text-mint"
        : "bg-amber-500/15 text-amber-600";
  return (
    <div className="glass rounded-3xl p-5 border border-border/80">
      <div className="flex items-center justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 text-2xl font-extrabold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground font-medium mt-0.5">{label}</div>
    </div>
  );
}

/* Modal to Manage Dynamic Courses and Branches */
function CourseBranchesDialog({
  open,
  initialConfig,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialConfig: CourseBranchConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<CourseBranchConfig>({
    courses: [],
    branches: {},
  });
  const [newCourseName, setNewCourseName] = useState("");
  const [selectedCourseForBranch, setSelectedCourseForBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
      if (initialConfig.courses.length > 0) {
        setSelectedCourseForBranch(initialConfig.courses[0]);
      }
    }
  }, [initialConfig, open]);

  function handleAddCourse() {
    const trimmed = newCourseName.trim();
    if (!trimmed) return toast.error("Enter a valid course name");
    if (config.courses.includes(trimmed)) return toast.error("Course already exists");

    setConfig((prev) => ({
      courses: [...prev.courses, trimmed],
      branches: {
        ...prev.branches,
        [trimmed]: prev.branches[trimmed] || [],
      },
    }));
    setNewCourseName("");
    setSelectedCourseForBranch(trimmed);
    toast.success(`Course "${trimmed}" added!`);
  }

  function handleRemoveCourse(courseName: string) {
    if (!confirm(`Delete course "${courseName}" and all its branches?`)) return;
    setConfig((prev) => {
      const nextCourses = prev.courses.filter((c) => c !== courseName);
      const nextBranches = { ...prev.branches };
      delete nextBranches[courseName];
      return {
        courses: nextCourses,
        branches: nextBranches,
      };
    });
    toast.info(`Course "${courseName}" removed.`);
  }

  function handleAddBranch() {
    const trimmed = newBranchName.trim();
    if (!selectedCourseForBranch) return toast.error("Select a course first");
    if (!trimmed) return toast.error("Enter a valid branch name");

    const currentBranches = config.branches[selectedCourseForBranch] || [];
    if (currentBranches.includes(trimmed)) return toast.error("Branch already exists under this course");

    setConfig((prev) => ({
      ...prev,
      branches: {
        ...prev.branches,
        [selectedCourseForBranch]: [...currentBranches, trimmed],
      },
    }));
    setNewBranchName("");
    toast.success(`Branch "${trimmed}" added to ${selectedCourseForBranch}!`);
  }

  function handleRemoveBranch(courseName: string, branchName: string) {
    setConfig((prev) => ({
      ...prev,
      branches: {
        ...prev.branches,
        [courseName]: (prev.branches[courseName] || []).filter((b) => b !== branchName),
      },
    }));
    toast.info(`Branch "${branchName}" removed.`);
  }

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "course_branches"), {
        courses: config.courses,
        branches: config.branches,
        updated_at: new Date().toISOString(),
      });
      toast.success("Courses and branches saved successfully!");
      onSaved();
    } catch (err: any) {
      toast.error("Failed to save configuration: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="h-5 w-5 text-purple" /> Manage Courses & Branches
          </DialogTitle>
          <DialogDescription>
            Add or remove academic courses and their associated branches dynamically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Add New Course Section */}
          <div className="rounded-2xl border border-border bg-background p-4 space-y-2">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FolderPlus className="h-4 w-4 text-purple" /> Add New Course / Department
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Management, Architecture..."
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                className="bg-card font-medium text-xs h-9"
              />
              <Button onClick={handleAddCourse} className="bg-gradient-purple text-primary-foreground font-semibold text-xs h-9 shrink-0">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Course
              </Button>
            </div>
          </div>

          {/* Add Branch to Course Section */}
          <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
            <Label className="text-xs font-bold text-foreground">Add New Branch under Course</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Select value={selectedCourseForBranch} onValueChange={setSelectedCourseForBranch}>
                <SelectTrigger className="bg-card text-xs h-9">
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {config.courses.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Branch name (e.g. Computer Science)"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="bg-card font-medium text-xs h-9"
              />
            </div>
            <Button onClick={handleAddBranch} variant="secondary" className="w-full font-semibold text-xs h-8 border border-purple/30 text-purple hover:bg-purple/10">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Branch to {selectedCourseForBranch || "Course"}
            </Button>
          </div>

          {/* Active Courses & Branches List */}
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Configured Courses & Branches</Label>
            {config.courses.map((courseName) => {
              const bList = config.branches[courseName] || [];
              return (
                <div key={courseName} className="rounded-2xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-purple" />
                      {courseName}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemoveCourse(courseName)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title="Delete Course"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {bList.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No branches added yet.</span>
                    )}
                    {bList.map((branchName) => (
                      <span
                        key={branchName}
                        className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-foreground border border-border"
                      >
                        {branchName}
                        <button
                          type="button"
                          onClick={() => handleRemoveBranch(courseName, branchName)}
                          className="text-muted-foreground hover:text-destructive ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSaveConfig}
            disabled={saving}
            className="bg-gradient-purple text-primary-foreground font-semibold gap-1.5"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Courses & Branches"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentFeesDialog({
  open,
  onClose,
  initialConfig,
  courseBranchConfig,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialConfig?: DepartmentFeeMap;
  courseBranchConfig: CourseBranchConfig;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<DepartmentFeeMap>({
    Engineering: { tuition_fee: 850, exam_fee: 50000 },
    Polytechnic: { tuition_fee: 850, exam_fee: 50000 },
    Pharmacy: { tuition_fee: 850, exam_fee: 50000 },
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  function updateDepartmentFee(dept: string, field: "tuition_fee" | "exam_fee", val: number) {
    setConfig((prev) => ({
      ...prev,
      [dept]: {
        ...prev[dept] || { tuition_fee: 850, exam_fee: 50000 },
        [field]: val,
      },
    }));
  }

  async function handleSaveDepartmentFees() {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "department_fees"), {
        ...config,
        updated_at: new Date().toISOString(),
      });
      toast.success("Department fee structure updated successfully!");
      onSaved();
    } catch (e: any) {
      toast.error("Failed to save department fees: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Building2 className="h-5 w-5 text-emerald-600" /> Department-Wise Fee Settings
          </DialogTitle>
          <DialogDescription>
            Configure standard College Fee and Tuition Fee for each department. Newly registered students will automatically inherit these fee structures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-80 overflow-y-auto pr-1">
          {courseBranchConfig.courses.map((dept) => {
            const current = config[dept] || { tuition_fee: 850, exam_fee: 50000 };
            const bList = courseBranchConfig.branches[dept] || [];
            return (
              <div key={dept} className="rounded-2xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    {dept} Department
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Branches: {bList.join(", ") || "None"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">College Fee (₹)</Label>
                    <Input
                      inputMode="numeric"
                      value={current.exam_fee}
                      onChange={(e) => updateDepartmentFee(dept, "exam_fee", Number(e.target.value.replace(/\D/g, "")))}
                      className="bg-card font-semibold text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tuition Fee (₹)</Label>
                    <Input
                      inputMode="numeric"
                      value={current.tuition_fee}
                      onChange={(e) => updateDepartmentFee(dept, "tuition_fee", Number(e.target.value.replace(/\D/g, "")))}
                      className="bg-card font-semibold text-sm"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSaveDepartmentFees}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold gap-1.5"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Department Fees"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentDialog({
  open,
  student,
  departmentFees,
  courseBranchConfig,
  onClose,
  onSaved,
}: {
  open: boolean;
  student?: Student;
  departmentFees?: DepartmentFeeMap;
  courseBranchConfig: CourseBranchConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [course, setCourse] = useState<string>("");
  const [branch, setBranch] = useState("");

  const [examFee, setExamFee] = useState(String(DEFAULT_EXAM_FEE));
  const [tuitionFee, setTuitionFee] = useState("850");

  const [collegePaidAmount, setCollegePaidAmount] = useState("0");
  const [tuitionPaidAmount, setTuitionPaidAmount] = useState("0");

  const [collegeFirstHalf, setCollegeFirstHalf] = useState<string>("");
  const [tuitionFirstHalf, setTuitionFirstHalf] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setName(student.name);
      setMobile(student.mobile);
      setCourse(student.course);
      setBranch(student.branch);

      const cFee = student.exam_fee && Number(student.exam_fee) !== 2000 ? student.exam_fee : 50000;
      const tFee = student.tuition_fee && Number(student.tuition_fee) !== 50000 ? student.tuition_fee : 850;

      setExamFee(String(cFee));
      setTuitionFee(String(tFee));

      setCollegePaidAmount(String(student.college_paid_amount || (student.exam_paid ? cFee : 0)));
      setTuitionPaidAmount(String(student.tuition_paid_amount || (student.tuition_paid ? tFee : 0)));

      setCollegeFirstHalf(String(student.college_first_half || Math.ceil(cFee / 2)));
      setTuitionFirstHalf(String(student.tuition_first_half || Math.ceil(tFee / 2)));
    } else if (open) {
      setName("");
      setMobile("");
      setCourse("");
      setBranch("");
      setExamFee(String(DEFAULT_EXAM_FEE));
      setTuitionFee("850");
      setCollegePaidAmount("0");
      setTuitionPaidAmount("0");
      setCollegeFirstHalf(String(Math.ceil(DEFAULT_EXAM_FEE / 2)));
      setTuitionFirstHalf("425");
    }
  }, [student, open]);

  // Auto-fill fee structure from department fees configured by admin
  useEffect(() => {
    if (!student && course) {
      if (departmentFees && departmentFees[course]) {
        const cFee = departmentFees[course].exam_fee;
        const tFee = departmentFees[course].tuition_fee;
        setExamFee(String(cFee));
        setTuitionFee(String(tFee));
        setCollegeFirstHalf(String(Math.ceil(cFee / 2)));
        setTuitionFirstHalf(String(Math.ceil(tFee / 2)));
      } else {
        setExamFee(String(DEFAULT_EXAM_FEE));
        setTuitionFee("850");
        setCollegeFirstHalf(String(Math.ceil(DEFAULT_EXAM_FEE / 2)));
        setTuitionFirstHalf("425");
      }
    }
  }, [course, student, departmentFees]);

  const availableBranches = useMemo(() => {
    if (!course) return [];
    return courseBranchConfig.branches[course] || [];
  }, [course, courseBranchConfig]);

  const totalCollegeNum = Number(examFee) || 50000;
  const cFirstHalfNum = collegeFirstHalf ? Number(collegeFirstHalf) : Math.ceil(totalCollegeNum / 2);
  const cSecondHalfNum = Math.max(0, totalCollegeNum - cFirstHalfNum);

  const totalTuitionNum = Number(tuitionFee) || 850;
  const tFirstHalfNum = tuitionFirstHalf ? Number(tuitionFirstHalf) : Math.ceil(totalTuitionNum / 2);
  const tSecondHalfNum = Math.max(0, totalTuitionNum - tFirstHalfNum);

  async function save() {
    if (!name || !/^\d{10}$/.test(mobile) || !course || !branch)
      return toast.error("Fill all required fields (10-digit mobile)");
    setSaving(true);

    const cPaidNum = Number(collegePaidAmount) || 0;
    const tPaidNum = Number(tuitionPaidAmount) || 0;

    const payload = {
      name: name.trim(),
      mobile,
      course,
      branch,
      exam_fee: totalCollegeNum,
      tuition_fee: totalTuitionNum,
      college_paid_amount: cPaidNum,
      exam_paid: cPaidNum >= totalCollegeNum,
      tuition_paid_amount: tPaidNum,
      tuition_paid: tPaidNum >= totalTuitionNum,
      college_first_half: cFirstHalfNum,
      tuition_first_half: tFirstHalfNum,
      updated_at: new Date().toISOString(),
    };
    try {
      if (student) {
        await updateDoc(doc(db, "students", student.id), payload);
      } else {
        await addDoc(collection(db, "students"), {
          ...payload,
          created_at: new Date().toISOString(),
        });
      }
      toast.success(student ? "Student profile updated!" : "Student profile created!");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle>{student ? "Edit Student Profile & Fee Plan" : "Add New Student & Fee Plan"}</DialogTitle>
          <DialogDescription>
            Configure student details and set custom installment / 2-half payment plans for College & Tuition fees.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="sm:col-span-2 space-y-2">
            <Label>Student Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number</Label>
            <Input
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-2">
            <Label>Department / Course</Label>
            <Select value={course} onValueChange={(v) => { setCourse(v); setBranch(""); }}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>
                {courseBranchConfig.courses.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Branch</Label>
            <Select value={branch} onValueChange={setBranch} disabled={!course}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {availableBranches.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>College Fee (INR)</Label>
            <Input inputMode="numeric" value={examFee}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setExamFee(val);
                setCollegeFirstHalf(String(Math.ceil((Number(val) || 0) / 2)));
              }} />
          </div>
          <div className="space-y-2">
            <Label>Tuition Fee (INR)</Label>
            <Input inputMode="numeric" value={tuitionFee}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setTuitionFee(val);
                setTuitionFirstHalf(String(Math.ceil((Number(val) || 0) / 2)));
              }} />
          </div>

          {/* 2-Half College Fee Payment Plan */}
          <div className="space-y-3 sm:col-span-2 rounded-2xl bg-purple/10 border border-purple/30 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-purple">
              <span className="flex items-center gap-1.5">
                <Split className="h-4 w-4" /> 2-Half College Fee Payment Plan
              </span>
              <span className="bg-white/80 px-2 py-0.5 rounded-md border border-purple/20 font-mono text-purple">
                1st: {inr(cFirstHalfNum)} | 2nd: {inr(cSecondHalfNum)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Suggested 1st Half Amount (₹)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 25000"
                  value={collegeFirstHalf}
                  onChange={(e) => setCollegeFirstHalf(e.target.value.replace(/\D/g, ""))}
                  className="bg-card h-9 text-xs font-semibold"
                />
              </div>
              {student && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">College Fee Paid So Far (₹)</Label>
                  <Input
                    inputMode="numeric"
                    value={collegePaidAmount}
                    onChange={(e) => setCollegePaidAmount(e.target.value.replace(/\D/g, ""))}
                    className="bg-card h-9 text-xs font-semibold"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 2-Half Tuition Fee Payment Plan */}
          <div className="space-y-3 sm:col-span-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
              <span className="flex items-center gap-1.5">
                <Split className="h-4 w-4" /> 2-Half Tuition Fee Payment Plan
              </span>
              <span className="text-emerald-900 bg-white/80 px-2 py-0.5 rounded-md border border-emerald-500/20 font-mono">
                1st: {inr(tFirstHalfNum)} | 2nd: {inr(tSecondHalfNum)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Suggested 1st Half Amount (₹)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 425"
                  value={tuitionFirstHalf}
                  onChange={(e) => setTuitionFirstHalf(e.target.value.replace(/\D/g, ""))}
                  className="bg-card h-9 text-xs font-semibold"
                />
              </div>
              {student && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Tuition Fee Paid So Far (₹)</Label>
                  <Input
                    inputMode="numeric"
                    value={tuitionPaidAmount}
                    onChange={(e) => setTuitionPaidAmount(e.target.value.replace(/\D/g, ""))}
                    className="bg-card h-9 text-xs font-semibold"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-gradient-purple text-primary-foreground font-semibold"
          >
            {saving ? "Saving…" : "Save Student Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminManualPaymentDialog({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [feeType, setFeeType] = useState<"college" | "tuition">("college");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cFeeTotal = Number(student.exam_fee || 50000);
  const cFeePaid = Number(student.college_paid_amount || (student.exam_paid ? cFeeTotal : 0));
  const remainingCollege = Math.max(0, cFeeTotal - cFeePaid);

  const tFeeTotal = Number(student.tuition_fee || 850);
  const tFeePaid = Number(student.tuition_paid_amount || (student.tuition_paid ? tFeeTotal : 0));
  const remainingTuition = Math.max(0, tFeeTotal - tFeePaid);

  useEffect(() => {
    if (feeType === "college") {
      setAmount(String(remainingCollege));
    } else {
      setAmount(String(remainingTuition));
    }
  }, [feeType, student, remainingCollege, remainingTuition]);

  async function handleRecordPayment() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid payment amount");

    setSubmitting(true);
    try {
      const txnId = "ADM" + Date.now().toString(36).toUpperCase();
      const createdAt = new Date().toISOString();

      await addDoc(collection(db, "payments"), {
        student_id: student.id,
        fee_type: feeType === "college" ? "college_installment" : "tuition_installment",
        amount: amt,
        transaction_id: txnId,
        created_at: createdAt,
      });

      const updatePayload =
        feeType === "college"
          ? { college_paid_amount: cFeePaid + amt, exam_paid: (cFeePaid + amt) >= cFeeTotal, updated_at: createdAt }
          : { tuition_paid_amount: tFeePaid + amt, tuition_paid: (tFeePaid + amt) >= tFeeTotal, updated_at: createdAt };

      await updateDoc(doc(db, "students", student.id), updatePayload);

      toast.success(`Fee payment of ${inr(amt)} recorded for ${student.name}`);
      onSaved();
    } catch (err: any) {
      toast.error("Failed to record payment: " + (err.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Record Student Fee Payment</DialogTitle>
          <DialogDescription>
            Record payment for <span className="font-semibold text-foreground">{student.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Select Fee Category</Label>
            <Select value={feeType} onValueChange={(v) => setFeeType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="college">College Fee (Remaining: {inr(remainingCollege)})</SelectItem>
                <SelectItem value="tuition">Tuition Fee (Remaining: {inr(remainingTuition)})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Payment Amount (INR)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleRecordPayment}
            disabled={submitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
          >
            {submitting ? "Processing…" : `Confirm ${inr(Number(amount) || 0)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
