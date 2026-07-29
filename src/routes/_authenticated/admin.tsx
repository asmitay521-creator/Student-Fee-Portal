import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
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
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
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
  SCHEMES,
  YEARS,
} from "@/lib/courses";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

type Student = {
  id: string;
  enrolment_id?: string;
  name: string;
  mobile: string;
  scheme?: string;
  year?: string;
  course?: string;
  branch?: string;
  excel_index?: number;
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
  const [schemeFilter, setSchemeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"sequence" | "latest" | "name" | "balance">("sequence");

  const [editing, setEditing] = useState<Student | null>(null);
  const [creating, setCreating] = useState(false);
  const [payingStudent, setPayingStudent] = useState<Student | null>(null);
  const [showDepartmentFees, setShowDepartmentFees] = useState(false);
  const [showCourseBranches, setShowCourseBranches] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);

  function downloadSampleExcel() {
    const polyRows = [
      {
        "Enrolment ID": "ENR2024001",
        "Student Name": "Rahul Sharma",
        "Mobile Number": "9876543210",
        "Scheme": "I-Scheme",
        "Year": "2nd Year",
        "College Fee": 50000,
        "Tuition Fee": 850,
        "College Paid": 25000,
        "Tuition Paid": 850,
      },
      {
        "Enrolment ID": "ENR2024002",
        "Student Name": "Priya Patel",
        "Mobile Number": "9876543211",
        "Scheme": "K-Scheme",
        "Year": "1st Year",
        "College Fee": 50000,
        "Tuition Fee": 850,
        "College Paid": 0,
        "Tuition Paid": 0,
      },
    ];

    const pharmRows = [
      {
        "Enrolment ID": "ENR2024003",
        "Student Name": "Amit Kumar",
        "Mobile Number": "9876543212",
        "Scheme": "G-Scheme",
        "Year": "3rd Year",
        "College Fee": 50000,
        "Tuition Fee": 850,
        "College Paid": 50000,
        "Tuition Paid": 850,
      },
      {
        "Enrolment ID": "ENR2024004",
        "Student Name": "Sneha Verma",
        "Mobile Number": "9876543213",
        "Scheme": "Autonomous Scheme",
        "Year": "1st Year",
        "College Fee": 50000,
        "Tuition Fee": 850,
        "College Paid": 10000,
        "Tuition Paid": 0,
      },
    ];

    const workbook = XLSX.utils.book_new();

    const polySheet = XLSX.utils.json_to_sheet(polyRows);
    XLSX.utils.book_append_sheet(workbook, polySheet, "Polytechnic");

    const pharmSheet = XLSX.utils.json_to_sheet(pharmRows);
    XLSX.utils.book_append_sheet(workbook, pharmSheet, "Pharmacy");

    XLSX.writeFile(workbook, "Student_MultiSheet_Import_Template.xlsx");
    toast.success("Sample Multi-Sheet Excel template downloaded!");
  }

  async function handleClearAllStudents() {
    if (!confirm("Are you sure you want to remove all imported student records? This will clear all current student data so you can upload a fresh Excel sheet.")) return;

    setUploadingExcel(true);
    try {
      const snap = await getDocs(collection(db, "students"));
      if (snap.empty) {
        toast.info("No student records found to clear.");
        setUploadingExcel(false);
        return;
      }

      let batch = writeBatch(db);
      let count = 0;

      for (const d of snap.docs) {
        batch.delete(doc(db, "students", d.id));
        count++;
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }

      if (count % 450 !== 0) {
        await batch.commit();
      }

      toast.success(`Successfully removed all ${snap.docs.length} student records!`);
      await qc.invalidateQueries({ queryKey: ["admin", "students"] });
      await qc.refetchQueries({ queryKey: ["admin", "students"] });
    } catch (err: any) {
      toast.error("Failed to remove student records: " + (err.message || "Unknown error"));
    } finally {
      setUploadingExcel(false);
    }
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    toast.info(`Parsing ${file.name}...`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        toast.error("The uploaded Excel file contains no worksheets.");
        setUploadingExcel(false);
        if (e.target) e.target.value = "";
        return;
      }

      const deptFees = departmentFeesQ.data;

      // Get all existing student records for matching
      const allDocsSnap = await getDocs(collection(db, "students"));
      const existingMap = new Map<string, { id: string; created_at?: string }>();
      allDocsSnap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data.enrolment_id) {
          existingMap.set(String(data.enrolment_id).trim().toLowerCase(), { id: d.id, created_at: data.created_at });
        }
        if (data.mobile) {
          existingMap.set(String(data.mobile).trim(), { id: d.id, created_at: data.created_at });
        }
        if (data.name) {
          existingMap.set(String(data.name).trim().toLowerCase(), { id: d.id, created_at: data.created_at });
        }
        existingMap.set(d.id.toLowerCase(), { id: d.id, created_at: data.created_at });
      });

      let totalCount = 0;
      const sheetSummary: string[] = [];

      let batch = writeBatch(db);
      let batchOpsCount = 0;

      // Process ALL worksheets in the Excel file
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        // Infer default department/category from sheet name
        const lowerSheetName = sheetName.toLowerCase();
        let defaultDept = "Polytechnic";
        if (lowerSheetName.includes("pharm")) {
          defaultDept = "Pharmacy";
        } else if (lowerSheetName.includes("eng")) {
          defaultDept = "Engineering";
        } else if (lowerSheetName.includes("poly")) {
          defaultDept = "Polytechnic";
        }

        const rawGrid: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (!rawGrid || rawGrid.length === 0) continue;

        let headerIndex = -1;
        for (let i = 0; i < Math.min(rawGrid.length, 20); i++) {
          const rowStr = rawGrid[i].map((cell) => String(cell).toLowerCase()).join(" ");
          if (
            rowStr.includes("name") ||
            rowStr.includes("student") ||
            rowStr.includes("enrol") ||
            rowStr.includes("roll") ||
            rowStr.includes("mobile") ||
            rowStr.includes("phone") ||
            rowStr.includes("scheme") ||
            rowStr.includes("year") ||
            rowStr.includes("course") ||
            rowStr.includes("branch") ||
            rowStr.includes("dept")
          ) {
            headerIndex = i;
            break;
          }
        }

        let parsedRows: Record<string, any>[] = [];
        if (headerIndex !== -1) {
          const headers = rawGrid[headerIndex].map((h: any) => String(h).trim());
          for (let r = headerIndex + 1; r < rawGrid.length; r++) {
            const rowArr = rawGrid[r];
            if (!rowArr || rowArr.every((cell) => cell === "" || cell === null || cell === undefined)) continue;
            const rowObj: Record<string, any> = {};
            headers.forEach((hdr: string, cIdx: number) => {
              if (hdr) rowObj[hdr] = rowArr[cIdx] !== undefined ? rowArr[cIdx] : "";
            });
            parsedRows.push(rowObj);
          }
        } else {
          parsedRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        }

        let sheetCount = 0;
        let rowIndexCounter = 0;

        for (const row of parsedRows) {
          rowIndexCounter++;
          const findVal = (...keys: string[]) => {
            for (const k of keys) {
              const targetNorm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
              const foundKey = Object.keys(row).find((rk) => rk.trim().toLowerCase().replace(/[^a-z0-9]/g, "") === targetNorm);
              if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== "") {
                return String(row[foundKey]).trim();
              }
            }
            return "";
          };

          const enrolmentId = findVal(
            "enrolment_id",
            "enrolment id",
            "enrollment_id",
            "enrollment id",
            "enrolment no",
            "enrollment no",
            "roll no",
            "roll_no",
            "rollno",
            "student id",
            "student_id",
            "id",
            "sr no",
            "sno",
            "reg no",
            "registration no"
          );
          const name = findVal("name", "student name", "full name", "candidate name", "student_name");
          const mobile = findVal("mobile", "mobile number", "phone", "contact", "mobile_no", "contact_no").replace(/\D/g, "");

          const rawCourse = findVal("course", "department", "stream", "dept", "category", "program", "programme");
          const rawBranch = findVal("branch", "specialization", "discipline", "substream");
          const rawScheme = findVal("scheme", "ischeme", "kscheme", "gscheme", "academicscheme", "pattern");
          const rawYear = findVal("year", "academicyear", "studyingyear", "classyear", "currentyear", "yr", "class");

          if (!name && !enrolmentId && !mobile) continue;

          const rowStr = Object.values(row).join(" ").toLowerCase();
          const cleanName = name || "Student";
          const cleanEnrolmentId = enrolmentId || (mobile ? `ENR${mobile}` : `ENR${Math.floor(100000 + Math.random() * 900000)}`);

          // Differentiate Course / Department & Branch per ROW
          const rowOnlyText = `${rowStr} ${rawCourse} ${rawBranch} ${cleanName}`.toLowerCase();

          let course = "";
          let branch = "";

          // 1. Is this specific row Pharmacy?
          if (
            rowOnlyText.includes("pharm") ||
            rowOnlyText.includes("d.pharm") ||
            rowOnlyText.includes("b.pharm") ||
            rowOnlyText.includes("m.pharm") ||
            rowOnlyText.includes("dpharm") ||
            rowOnlyText.includes("bpharm") ||
            rowOnlyText.includes("mpharm") ||
            rowOnlyText.includes("d-pharm") ||
            rowOnlyText.includes("b-pharm") ||
            rowOnlyText.includes("pharmacy")
          ) {
            course = "Pharmacy";
            if (rowOnlyText.includes("b.pharm") || rowOnlyText.includes("bpharm") || rowOnlyText.includes("b-pharm") || rowOnlyText.includes("b pharmacy")) {
              branch = rawBranch || "B. Pharm";
            } else {
              branch = rawBranch || "D. Pharm";
            }
          } 
          // 2. Is this specific row Polytechnic?
          else if (
            rowOnlyText.includes("poly") ||
            rowOnlyText.includes("diploma in eng") ||
            rowOnlyText.includes("mechanical") ||
            rowOnlyText.includes("civil") ||
            rowOnlyText.includes("electrical") ||
            rowOnlyText.includes("computer") ||
            rowOnlyText.includes("electronics") ||
            rowOnlyText.includes("automobile") ||
            rowOnlyText.includes("i-scheme") ||
            rowOnlyText.includes("k-scheme") ||
            rowOnlyText.includes("g-scheme")
          ) {
            course = "Polytechnic";
            branch = rawBranch || "Mechanical";
          } 
          // 3. Is this specific row Engineering?
          else if (
            rowOnlyText.includes("eng") ||
            rowOnlyText.includes("b.tech") ||
            rowOnlyText.includes("be") ||
            rowOnlyText.includes("b.e")
          ) {
            course = "Engineering";
            branch = rawBranch || "Computer Science & Engineering";
          } 
          // 4. Fallback to rawCourse or sheetName hint
          else {
            const sheetLower = sheetName.toLowerCase();
            if (sheetLower.includes("pharm")) {
              course = "Pharmacy";
              branch = rawBranch || "D. Pharm";
            } else if (sheetLower.includes("eng")) {
              course = "Engineering";
              branch = rawBranch || "Computer Science & Engineering";
            } else {
              course = rawCourse || "Polytechnic";
              branch = rawBranch || "General";
            }
          }

          const scheme = rawScheme || "I-Scheme";
          const year = rawYear || "1st Year";

          const examFeeStr = findVal("college fee", "exam fee", "college_fee", "exam_fee", "total college fee");
          const tuitionFeeStr = findVal("tuition fee", "tuition_fee", "total tuition fee");
          const collegePaidStr = findVal("college paid", "exam paid", "college_paid_amount", "college paid amount");
          const tuitionPaidStr = findVal("tuition paid", "tuition_paid_amount", "tuition paid amount");

          const examFee = examFeeStr ? Number(examFeeStr) : (deptFees?.[course]?.exam_fee || deptFees?.[scheme]?.exam_fee || 50000);
          const tuitionFee = tuitionFeeStr ? Number(tuitionFeeStr) : (deptFees?.[course]?.tuition_fee || deptFees?.[scheme]?.tuition_fee || 850);
          const collegePaid = collegePaidStr ? Number(collegePaidStr) : 0;
          const tuitionPaid = tuitionPaidStr ? Number(tuitionPaidStr) : 0;

          const existingRecord =
            existingMap.get(cleanEnrolmentId.toLowerCase()) ||
            (mobile ? existingMap.get(mobile) : undefined) ||
            existingMap.get(cleanName.toLowerCase());

          const studentPayload: Record<string, any> = {
            enrolment_id: cleanEnrolmentId,
            name: cleanName,
            mobile: mobile || "0000000000",
            course,
            branch,
            scheme,
            year,
            excel_index: totalCount + 1,
            exam_fee: examFee,
            tuition_fee: tuitionFee,
            college_paid_amount: collegePaid,
            tuition_paid_amount: tuitionPaid,
            exam_paid: collegePaid >= examFee,
            tuition_paid: tuitionPaid >= tuitionFee,
            created_at: existingRecord?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (existingRecord?.id) {
            const studentRef = doc(db, "students", existingRecord.id);
            batch.update(studentRef, studentPayload);
          } else {
            const studentRef = doc(collection(db, "students"));
            batch.set(studentRef, studentPayload);
          }

          sheetCount++;
          totalCount++;
          batchOpsCount++;

          if (batchOpsCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            batchOpsCount = 0;
          }
        }

        if (sheetCount > 0) {
          sheetSummary.push(`${sheetName}: ${sheetCount}`);
        }
      }

      if (batchOpsCount > 0) {
        await batch.commit();
      }

      if (totalCount === 0) {
        toast.error("No valid student rows found across sheets. Please download and use the Sample Excel Template.");
      } else {
        toast.success(`Successfully imported ${totalCount} records (${sheetSummary.join(", ")})!`);
      }

      await qc.invalidateQueries({ queryKey: ["admin", "students"] });
      await qc.refetchQueries({ queryKey: ["admin", "students"] });
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to process Excel file: ${err.message || "Unknown error"}`);
    } finally {
      setUploadingExcel(false);
      if (e.target) e.target.value = "";
    }
  }

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
      const snap = await getDocs(collection(db, "students"));
      const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Student[];
      return list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
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
        (x: Student) =>
          x.name.toLowerCase().includes(s) ||
          x.mobile.includes(s) ||
          (x.course && x.course.toLowerCase().includes(s)) ||
          (x.branch && x.branch.toLowerCase().includes(s)) ||
          (x.scheme && x.scheme.toLowerCase().includes(s)) ||
          (x.year && x.year.toLowerCase().includes(s)) ||
          x.id.toLowerCase().includes(s) ||
          (x.enrolment_id && x.enrolment_id.toLowerCase().includes(s))
      );
    }

    if (schemeFilter !== "all") {
      const sf = schemeFilter.toLowerCase();
      list = list.filter((x: Student) => {
        const c = (x.course || "").toLowerCase();
        const b = (x.branch || "").toLowerCase();
        const s = (x.scheme || "").toLowerCase();
        const n = (x.name || "").toLowerCase();
        const eid = (x.enrolment_id || "").toLowerCase();
        const fullStudentText = `${c} ${b} ${s} ${n} ${eid}`;

        const isPharm =
          fullStudentText.includes("pharm") ||
          fullStudentText.includes("d.pharm") ||
          fullStudentText.includes("b.pharm") ||
          fullStudentText.includes("mpharm") ||
          fullStudentText.includes("dpharm") ||
          fullStudentText.includes("bpharm") ||
          fullStudentText.includes("d-pharm") ||
          fullStudentText.includes("b-pharm");

        if (sf === "pharmacy") {
          return isPharm;
        }
        if (sf === "polytechnic") {
          if (isPharm) return false;
          return true;
        }
        if (sf === "engineering") {
          if (isPharm) return false;
          return c.includes("eng") || b.includes("eng") || c.includes("b.tech") || b.includes("b.tech") || s.includes("eng");
        }
        return (x.course || x.scheme || "") === schemeFilter;
      });
    }

    if (statusFilter !== "all") {
      list = list.filter((x: Student) => {
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

    return list.slice().sort((a: Student, b: Student) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "balance") {
        const cRemA = Math.max(0, Number(a.exam_fee || 50000) - Number(a.college_paid_amount || (a.exam_paid ? Number(a.exam_fee || 50000) : 0)));
        const tRemA = Math.max(0, Number(a.tuition_fee || 850) - Number(a.tuition_paid_amount || (a.tuition_paid ? Number(a.tuition_fee || 850) : 0)));

        const cRemB = Math.max(0, Number(b.exam_fee || 50000) - Number(b.college_paid_amount || (b.exam_paid ? Number(b.exam_fee || 50000) : 0)));
        const tRemB = Math.max(0, Number(b.tuition_fee || 850) - Number(b.tuition_paid_amount || (b.tuition_paid ? Number(b.tuition_fee || 850) : 0)));

        return (cRemB + tRemB) - (cRemA + tRemA);
      }
      if (sortBy === "latest") {
        return (b.created_at || "").localeCompare(a.created_at || "");
      }

      // Default: Starting to Ending Original Excel Sequence Order
      if (a.excel_index !== undefined && b.excel_index !== undefined && a.excel_index !== b.excel_index) {
        return a.excel_index - b.excel_index;
      }

      // Sort by creation timestamp ASCENDING (matches exact Excel row insertion sequence)
      const timeA = a.created_at || "";
      const timeB = b.created_at || "";
      if (timeA && timeB && timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }

      const enrA = String(a.enrolment_id || "").trim();
      const enrB = String(b.enrolment_id || "").trim();
      return enrA.localeCompare(enrB, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [search, schemeFilter, statusFilter, sortBy, studentsQ.data]);

  const stats = useMemo(() => {
    const list = studentsQ.data ?? [];
    const totalCollected = list.reduce((s: number, x: Student) => {
      const cFee = Number(x.exam_fee || 50000);
      const cPaid = Number(x.college_paid_amount || (x.exam_paid ? cFee : 0));
      const tFee = Number(x.tuition_fee || 850);
      const tPaid = Number(x.tuition_paid_amount || (x.tuition_paid ? tFee : 0));
      return s + cPaid + tPaid;
    }, 0);

    const pending = list.reduce((s: number, x: Student) => {
      const cFee = Number(x.exam_fee || 50000);
      const cPaid = Number(x.college_paid_amount || (x.exam_paid ? cFee : 0));
      const cRem = Math.max(0, cFee - cPaid);
      const tFee = Number(x.tuition_fee || 850);
      const tPaid = Number(x.tuition_paid_amount || (x.tuition_paid ? tFee : 0));
      const tRem = Math.max(0, tFee - tPaid);
      return s + cRem + tRem;
    }, 0);

    const fullyPaidCount = list.filter((x: Student) => {
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
    const headers = ["Enrolment ID", "Student ID", "Name", "Mobile", "Department/Course", "Branch", "Scheme", "Year", "College Fee", "College Paid", "College Balance", "Tuition Fee", "Tuition Paid", "Tuition Balance"];
    const rows = list.map((s: Student) => {
      const cFee = Number(s.exam_fee || 50000);
      const cPaid = Number(s.college_paid_amount || (s.exam_paid ? cFee : 0));
      const cRem = Math.max(0, cFee - cPaid);
      const tFee = Number(s.tuition_fee || 850);
      const tPaid = Number(s.tuition_paid_amount || (s.tuition_paid ? tFee : 0));
      const tRem = Math.max(0, tFee - tPaid);
      return [
        `"${s.enrolment_id || s.id.slice(0, 8).toUpperCase()}"`,
        s.id.slice(0, 8).toUpperCase(),
        `"${s.name}"`,
        s.mobile,
        `"${s.course || "Polytechnic"}"`,
        `"${s.branch || "Mechanical"}"`,
        `"${s.scheme || "I-Scheme"}"`,
        `"${s.year || "1st Year"}"`,
        cFee,
        cPaid,
        cRem,
        tFee,
        tPaid,
        tRem,
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e: (string | number)[]) => e.join(","))].join("\n");
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
            <img src="/college_logo.png" alt="NPC Dhule Logo" className="h-11 w-auto object-contain shrink-0" />
            <div>
              <div className="text-xs font-medium text-muted-foreground">Admin Control Panel</div>
              <div className="font-bold text-lg leading-tight">Netaji Polytechnic College, Dhule</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingExcel}
              className="text-xs font-medium border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> {uploadingExcel ? "Importing..." : "Upload Excel Sheet"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllStudents}
              disabled={uploadingExcel}
              className="text-xs font-medium border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
              title="Remove/delete all student records from database"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Clear Excel Data
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleExcelUpload}
              className="hidden"
            />
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="Search student name, enrolment ID, mobile, department, scheme, or year..."
                className="pl-9 bg-card"
              />
            </div>

            {/* Department Filter */}
            <Select value={schemeFilter} onValueChange={setSchemeFilter}>
              <SelectTrigger className="w-[160px] bg-card text-xs">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Polytechnic">Polytechnic</SelectItem>
                <SelectItem value="Pharmacy">Pharmacy</SelectItem>
                <SelectItem value="Engineering">Engineering</SelectItem>
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
            <Select value={sortBy} onValueChange={(v: string) => setSortBy(v as any)}>
              <SelectTrigger className="w-[180px] bg-card text-xs">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequence">Sequence / Roll No (1,2,3...)</SelectItem>
                <SelectItem value="latest">Latest First</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="balance">Highest Balance</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleClearAllStudents}
              disabled={uploadingExcel}
              variant="outline"
              className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 font-semibold"
              title="Remove/delete all student records from database"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Clear Excel Data
            </Button>

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
                  <th className="py-3.5 px-4">Department / Branch / Year</th>
                  <th className="py-3.5 px-4">College Fee (₹50k)</th>
                  <th className="py-3.5 px-4">Tuition Fee (₹850)</th>
                  <th className="py-3.5 px-4">Total Balance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((s: Student) => {
                  const cFee = Number(s.exam_fee || 50000);
                  const cPaid = Number(s.college_paid_amount || (s.exam_paid ? cFee : 0));
                  const cRem = Math.max(0, cFee - cPaid);

                  const tFee = Number(s.tuition_fee || 850);
                  const tPaid = Number(s.tuition_paid_amount || (s.tuition_paid ? tFee : 0));
                  const tRem = Math.max(0, tFee - tPaid);

                  const totalRem = cRem + tRem;
                  const rawDept = `${s.course || ""} ${s.branch || ""} ${s.scheme || ""}`.toLowerCase();
                  const deptName = rawDept.includes("pharm") ? "Pharmacy" : rawDept.includes("poly") ? "Polytechnic" : s.course || s.scheme || "Engineering";

                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground">{s.name}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>{s.mobile}</span>
                          <span>•</span>
                          <span className="font-mono bg-purple/10 text-purple px-1.5 py-0.5 rounded font-semibold text-[11px]">
                            {s.enrolment_id || `ID: ${s.id.slice(0, 8).toUpperCase()}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            deptName === "Pharmacy"
                              ? "bg-purple-100 text-purple-700 border border-purple-200"
                              : deptName === "Polytechnic"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}>
                            {deptName}
                          </span>
                          <span className="text-xs text-muted-foreground">({s.scheme || "I-Scheme"})</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span>{s.branch || "General"}</span>
                          <span>•</span>
                          <span className="font-medium text-slate-700">{s.year || "1st Year"}</span>
                        </div>
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
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(s)}
                            className="h-8 w-8 p-0"
                            title="Edit student details"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove(s.id)}
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            title="Delete student record"
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
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No matching student fee records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <StudentDialog
        open={creating || Boolean(editing)}
        student={editing ?? undefined}
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
  const [enrolmentId, setEnrolmentId] = useState("");
  const [mobile, setMobile] = useState("");
  const [scheme, setScheme] = useState<string>("I-Scheme");
  const [year, setYear] = useState<string>("1st Year");

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
      setEnrolmentId(student.enrolment_id || "");
      setMobile(student.mobile);
      setScheme(student.scheme || student.course || "I-Scheme");
      setYear(student.year || student.branch || "1st Year");

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
      setEnrolmentId("");
      setMobile("");
      setScheme("I-Scheme");
      setYear("1st Year");
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
    if (!student && scheme) {
      if (departmentFees && departmentFees[scheme]) {
        const cFee = departmentFees[scheme].exam_fee;
        const tFee = departmentFees[scheme].tuition_fee;
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
  }, [scheme, student, departmentFees]);

  const totalCollegeNum = Number(examFee) || 50000;
  const cFirstHalfNum = collegeFirstHalf ? Number(collegeFirstHalf) : Math.ceil(totalCollegeNum / 2);
  const cSecondHalfNum = Math.max(0, totalCollegeNum - cFirstHalfNum);

  const totalTuitionNum = Number(tuitionFee) || 850;
  const tFirstHalfNum = tuitionFirstHalf ? Number(tuitionFirstHalf) : Math.ceil(totalTuitionNum / 2);
  const tSecondHalfNum = Math.max(0, totalTuitionNum - tFirstHalfNum);

  async function save() {
    if (!name || !/^\d{10}$/.test(mobile) || !scheme || !year)
      return toast.error("Fill all required fields (10-digit mobile)");
    setSaving(true);

    const cPaidNum = Number(collegePaidAmount) || 0;
    const tPaidNum = Number(tuitionPaidAmount) || 0;

    const payload = {
      name: name.trim(),
      enrolment_id: enrolmentId.trim() || `ENR${mobile}`,
      mobile,
      scheme,
      year,
      course: scheme,
      branch: year,
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
          <div className="space-y-2">
            <Label>Enrolment ID / Roll No</Label>
            <Input value={enrolmentId} onChange={(e) => setEnrolmentId(e.target.value)} placeholder="e.g. ENR2024001" />
          </div>
          <div className="space-y-2">
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
            <Label>Academic Scheme</Label>
            <Select value={scheme} onValueChange={setScheme}>
              <SelectTrigger><SelectValue placeholder="Select scheme" /></SelectTrigger>
              <SelectContent>
                {SCHEMES.map((sc) => (
                  <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Studying Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
              <SelectContent>
                {YEARS.map((yr) => (
                  <SelectItem key={yr} value={yr}>{yr}</SelectItem>
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
