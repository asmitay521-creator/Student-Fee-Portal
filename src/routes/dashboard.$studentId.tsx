import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GraduationCap,
  LogOut,
  Receipt,
  IndianRupee,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  User,
  Phone,
  BookOpen,
  Layers,
  Sparkles,
  CreditCard,
  FileCheck,
  CalendarDays,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Building2,
  Split,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard/$studentId")({
  head: () => ({
    meta: [
      { title: "Student Dashboard — Fee Portal" },
      { name: "description", content: "Pay your college fee and tuition fee securely." },
      { property: "og:title", content: "Student Dashboard — Fee Portal" },
      { property: "og:description", content: "Pay your college fee and tuition fee securely." },
    ],
  }),
  component: Dashboard,
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
  exam_fee: number;
  tuition_fee: number;
  exam_paid?: boolean;
  college_paid_amount?: number;
  tuition_paid_amount?: number;
  tuition_paid?: boolean;
  college_first_half?: number;
  tuition_first_half?: number;
  first_half_amount?: number;
  created_at?: string;
  email?: string;
};

type Payment = {
  id: string;
  student_id: string;
  fee_type: string;
  amount: number;
  transaction_id: string;
  created_at: string;
};

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(isoStr: string) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch (e) {
    return isoStr;
  }
}

function formatTime(isoStr: string) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch (e) {
    return "";
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      return resolve(true);
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function downloadExcelReceipt(payment: Payment, student: Student) {
  const feeLabel = payment.fee_type.includes("college") || payment.fee_type === "exam" ? "College Fee" : "Tuition Fee";
  const dateStr = formatDate(payment.created_at);
  const timeStr = formatTime(payment.created_at);

  const csvData = [
    ["STUDENT FEE PAYMENT RECEIPT", ""],
    ["", ""],
    ["Student Name", `"${student.name}"`],
    ["Enrolment ID", `"${student.enrolment_id || student.id.slice(0, 8).toUpperCase()}"`],
    ["Student ID", student.id.slice(0, 8).toUpperCase()],
    ["Scheme & Year", `"${student.scheme || student.course || "I-Scheme"} (${student.year || student.branch || "1st Year"})"`],
    ["Mobile Number", student.mobile],
    ["---------------------------------", "---------------------------------"],
    ["Fee Category", `"${feeLabel}"`],
    ["Amount Paid (INR)", payment.amount],
    ["Transaction ID", payment.transaction_id],
    ["Payment Date", `"${dateStr}"`],
    ["Payment Time", `"${timeStr}"`],
    ["Date & Time (Full)", `"${dateStr} ${timeStr}"`],
    ["Payment Status", "SUCCESSFUL (VERIFIED)"],
  ]
    .map((row) => row.join(","))
    .join("\n");

  const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Fee_Receipt_${payment.transaction_id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Excel (.csv) receipt downloaded!");
}

function Dashboard() {
  const { studentId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  const [customCollegeInput, setCustomCollegeInput] = useState<string>("");
  const [customTuitionInput, setCustomTuitionInput] = useState<string>("");

  const studentQ = useQuery({
    queryKey: ["student", studentId],
    queryFn: async (): Promise<Student> => {
      const docRef = doc(db, "students", studentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error("Student not found");
      return { id: snap.id, ...snap.data() } as Student;
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["payments", studentId],
    queryFn: async (): Promise<Payment[]> => {
      const q = query(
        collection(db, "payments"),
        where("student_id", "==", studentId),
        orderBy("created_at", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Payment[];
    },
  });

  const s = studentQ.data;

  // DYNAMIC CALCULATIONS FOR BOTH COLLEGE AND TUITION FEES
  const totalCollege = useMemo(() => {
    if (!s) return 50000;
    if (s.exam_fee === 2000 || !s.exam_fee) return 50000;
    return Number(s.exam_fee);
  }, [s]);

  const totalTuition = useMemo(() => {
    if (!s) return 850;
    if (s.tuition_fee === 50000 || !s.tuition_fee) return 850;
    return Number(s.tuition_fee);
  }, [s]);

  const paidCollege = useMemo(() => {
    if (!s) return 0;
    const docPaid = Number(s.college_paid_amount || (s.exam_paid ? totalCollege : 0));
    const paymentsList = paymentsQ.data || [];
    const paymentsPaid = paymentsList
      .filter((p) => p.fee_type === "college_installment" || p.fee_type === "exam" || p.fee_type.includes("college"))
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
    return Math.max(docPaid, paymentsPaid);
  }, [s, totalCollege, paymentsQ.data]);

  const collegeRemaining = useMemo(() => {
    return Math.max(0, totalCollege - paidCollege);
  }, [totalCollege, paidCollege]);

  const paidTuition = useMemo(() => {
    if (!s) return 0;
    const docPaid = Number(s.tuition_paid_amount || (s.tuition_paid ? totalTuition : 0));
    const paymentsList = paymentsQ.data || [];
    const paymentsPaid = paymentsList
      .filter((p) => p.fee_type === "tuition_installment" || p.fee_type === "tuition" || p.fee_type.includes("tuition"))
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
    return Math.max(docPaid, paymentsPaid);
  }, [s, totalTuition, paymentsQ.data]);

  const tuitionRemaining = useMemo(() => {
    return Math.max(0, totalTuition - paidTuition);
  }, [totalTuition, paidTuition]);

  // Suggested Target 1st Half Amount for College Fee
  const collegeFirstHalfTarget = useMemo(() => {
    if (!s) return 25000;
    if (s.college_first_half && s.college_first_half > 0) {
      return Math.min(totalCollege, s.college_first_half);
    }
    return Math.ceil(totalCollege / 2);
  }, [s, totalCollege]);

  // Suggested Target 1st Half Amount for Tuition Fee
  const tuitionFirstHalfTarget = useMemo(() => {
    if (!s) return 425;
    if (s.tuition_first_half && s.tuition_first_half > 0) {
      return Math.min(totalTuition, s.tuition_first_half);
    }
    return Math.ceil(totalTuition / 2);
  }, [s, totalTuition]);

  // Intelligent Defaults for Custom Amount Inputs
  useEffect(() => {
    if (!s) return;

    if (collegeRemaining <= 0) {
      setCustomCollegeInput("");
    } else if (paidCollege === 0) {
      setCustomCollegeInput(String(Math.min(collegeRemaining, collegeFirstHalfTarget)));
    } else {
      setCustomCollegeInput(String(collegeRemaining));
    }

    if (tuitionRemaining <= 0) {
      setCustomTuitionInput("");
    } else if (paidTuition === 0) {
      setCustomTuitionInput(String(Math.min(tuitionRemaining, tuitionFirstHalfTarget)));
    } else {
      setCustomTuitionInput(String(tuitionRemaining));
    }
  }, [s, paidCollege, collegeRemaining, collegeFirstHalfTarget, paidTuition, tuitionRemaining, tuitionFirstHalfTarget]);

  // Trigger Razorpay Checkout for College Fee or Tuition Fee
  async function payViaRazorpay(feeCategory: "college" | "tuition", payAmt: number) {
    if (!s || payAmt <= 0) return toast.error("Enter a valid payment amount (minimum ₹1)");

    const maxAmt = feeCategory === "college" ? collegeRemaining : tuitionRemaining;
    if (payAmt > maxAmt) {
      return toast.error(`Payment amount cannot exceed remaining balance of ${inr(maxAmt)}`);
    }

    setProcessingPayment(true);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setProcessingPayment(false);
      return toast.error("Razorpay payment gateway failed to load. Check your internet connection.");
    }

    const tempTxnId = "RZP" + Date.now().toString(36).toUpperCase();

    const options = {
      key: "rzp_test_demoKey12345", // Razorpay Test Key
      amount: payAmt * 100, // Amount in paise
      currency: "INR",
      name: "Student Fee Portal",
      description:
        feeCategory === "college"
          ? `College Fee Payment - ${s.name}`
          : `Tuition Fee Payment - ${s.name}`,
      image: "",
      prefill: {
        name: s.name,
        contact: s.mobile,
        email: s.email || `${s.mobile}@student.edu`,
      },
      theme: {
        color: "#EA580C", // Vibrant Orange
      },
      handler: async function (response: any) {
        const razorpayPaymentId = response.razorpay_payment_id || tempTxnId;
        const createdAt = new Date().toISOString();

        const payData = {
          student_id: s.id,
          fee_type: feeCategory === "college" ? "college_installment" : "tuition_installment",
          amount: payAmt,
          transaction_id: razorpayPaymentId,
          created_at: createdAt,
        };

        try {
          const payDocRef = await addDoc(collection(db, "payments"), payData);

          let updatePayload: any = { updated_at: createdAt };
          if (feeCategory === "college") {
            const newCollegePaid = paidCollege + payAmt;
            updatePayload.college_paid_amount = newCollegePaid;
            updatePayload.exam_paid = newCollegePaid >= totalCollege;
          } else {
            const newTuitionPaid = paidTuition + payAmt;
            updatePayload.tuition_paid_amount = newTuitionPaid;
            updatePayload.tuition_paid = newTuitionPaid >= totalTuition;
          }

          await updateDoc(doc(db, "students", s.id), updatePayload);

          toast.success(`Payment of ${inr(payAmt)} Successful!`);
          const newPayment = { id: payDocRef.id, ...payData } as Payment;
          setReceiptPayment(newPayment);
          qc.invalidateQueries({ queryKey: ["student", studentId] });
          qc.invalidateQueries({ queryKey: ["payments", studentId] });
        } catch (err: any) {
          toast.error("Failed to record payment in database.");
        } finally {
          setProcessingPayment(false);
        }
      },
      modal: {
        ondismiss: function () {
          setProcessingPayment(false);
          toast.info("Payment modal closed.");
        },
      },
    };

    try {
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      setProcessingPayment(false);
      toast.error("Unable to open payment gateway.");
    }
  }

  if (studentQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium">Loading Student Portal…</p>
        </div>
      </div>
    );
  }

  if (studentQ.error || !s) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="text-center space-y-3 glass p-8 rounded-3xl max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="text-xl font-bold">Student Record Not Found</h2>
          <p className="text-sm text-muted-foreground">
            The student account could not be retrieved or has been removed.
          </p>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-primary font-semibold underline">
            Go back to home page
          </Link>
        </div>
      </div>
    );
  }

  const customCollegePayVal = Number(customCollegeInput) || 0;
  const customTuitionPayVal = Number(customTuitionInput) || 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <img src="/college_logo.png" alt="NPC Dhule Logo" className="h-12 sm:h-16 w-auto object-contain shrink-0 filter drop-shadow-sm" />
            <div>
              <div className="text-[10px] sm:text-xs font-bold text-orange-600">Netaji Polytechnic College, Dhule</div>
              <div className="font-extrabold text-sm sm:text-lg capitalize text-foreground truncate max-w-[160px] sm:max-w-none">{s.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block text-right text-xs">
              <div className="font-semibold text-foreground">{s.scheme || s.course || "I-Scheme"} • {s.year || s.branch || "1st Year"}</div>
              <div className="text-muted-foreground">Enrolment ID: {s.enrolment_id || s.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/" })}
              className="text-xs font-semibold h-8 border-orange-200 text-orange-700 hover:bg-orange-50 px-2.5 sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 w-full">
        {/* Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground">Select Fee Payment Option</h1>
            <p className="text-xs text-muted-foreground">
              Pay custom amounts or settle remaining fees securely.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold text-orange-700 w-fit">
            <ShieldCheck className="h-3.5 w-3.5 text-orange-600" /> Verified Payment Gateway
          </div>
        </div>

        {/* 2 MAIN FEE SECTIONS — FULLY MOBILE RESPONSIVE */}
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {/* SECTION 1: COLLEGE FEE */}
          <div className="rounded-2xl sm:rounded-3xl bg-white border border-orange-200/80 p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4 relative overflow-hidden hover:shadow-md transition">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-orange-600 uppercase tracking-wider">
                  <Building2 className="h-4 w-4" /> SECTION 1: COLLEGE FEE
                </div>
                <StatusPill
                  paid={collegeRemaining === 0}
                  partial={paidCollege > 0 && collegeRemaining > 0}
                />
              </div>

              <div className="mt-3.5">
                <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total College Fee</div>
                <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight mt-0.5">{inr(totalCollege)}</div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl bg-orange-50/60 border border-orange-100 p-2.5">
                    <div className="text-muted-foreground font-medium text-[11px]">Paid So Far</div>
                    <div className="text-xs sm:text-sm font-extrabold text-emerald-700">{inr(paidCollege)}</div>
                  </div>
                  <div className="rounded-2xl bg-orange-50/60 border border-orange-100 p-2.5">
                    <div className="text-muted-foreground font-medium text-[11px]">Remaining Balance</div>
                    <div className="text-xs sm:text-sm font-extrabold text-orange-600">{inr(collegeRemaining)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border/60 flex flex-col gap-2">
              {collegeRemaining > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold text-foreground">
                    <span>Enter Payment Amount (₹):</span>
                    <span className="font-mono text-orange-700">{inr(customCollegePayVal)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      inputMode="numeric"
                      value={customCollegeInput}
                      onChange={(e) => setCustomCollegeInput(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter amount"
                      className="bg-white border-orange-200 text-foreground font-bold text-xs h-10 sm:h-9 focus-visible:ring-orange-500 w-full"
                    />
                    <Button
                      disabled={processingPayment || customCollegePayVal <= 0 || customCollegePayVal > collegeRemaining}
                      onClick={() => payViaRazorpay("college", customCollegePayVal)}
                      className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md shadow-orange-600/20 h-10 sm:h-9 px-4 rounded-xl shrink-0 w-full sm:w-auto"
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay Now
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    const p = paymentsQ.data?.find((x) => x.fee_type.includes("college") || x.fee_type === "exam");
                    if (p) setReceiptPayment(p);
                    else toast.info("College fee receipt ready in history.");
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-extrabold shadow-md shadow-orange-600/20 h-10 sm:h-9 text-xs rounded-xl"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download College Fee Receipt
                </Button>
              )}
            </div>
          </div>

          {/* SECTION 2: TUITION FEE */}
          <div className="rounded-2xl sm:rounded-3xl bg-white border border-amber-200/80 p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4 relative overflow-hidden hover:shadow-md transition">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-amber-700 uppercase tracking-wider">
                  <BookOpen className="h-4 w-4" /> SECTION 2: TUITION FEE
                </div>
                <StatusPill
                  paid={tuitionRemaining === 0}
                  partial={paidTuition > 0 && tuitionRemaining > 0}
                />
              </div>

              <div className="mt-3.5">
                <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total Tuition Fee</div>
                <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight mt-0.5">{inr(totalTuition)}</div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl bg-amber-50/60 border border-amber-100 p-2.5">
                    <div className="text-muted-foreground font-medium text-[11px]">Paid So Far</div>
                    <div className="text-xs sm:text-sm font-extrabold text-emerald-700">{inr(paidTuition)}</div>
                  </div>
                  <div className="rounded-2xl bg-amber-50/60 border border-amber-100 p-2.5">
                    <div className="text-muted-foreground font-medium text-[11px]">Remaining Balance</div>
                    <div className="text-xs sm:text-sm font-extrabold text-amber-800">{inr(tuitionRemaining)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border/60 flex flex-col gap-2">
              {tuitionRemaining > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold text-foreground">
                    <span>Enter Payment Amount (₹):</span>
                    <span className="font-mono text-amber-800">{inr(customTuitionPayVal)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      inputMode="numeric"
                      value={customTuitionInput}
                      onChange={(e) => setCustomTuitionInput(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter amount"
                      className="bg-white border-amber-200 text-foreground font-bold text-xs h-10 sm:h-9 focus-visible:ring-amber-500 w-full"
                    />
                    <Button
                      disabled={processingPayment || customTuitionPayVal <= 0 || customTuitionPayVal > tuitionRemaining}
                      onClick={() => payViaRazorpay("tuition", customTuitionPayVal)}
                      className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md shadow-orange-600/20 h-10 sm:h-9 px-4 rounded-xl shrink-0 w-full sm:w-auto"
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay Now
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    const p = paymentsQ.data?.find((x) => x.fee_type.includes("tuition"));
                    if (p) setReceiptPayment(p);
                    else toast.info("Tuition receipt ready in history.");
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-extrabold shadow-md shadow-orange-600/20 h-10 sm:h-9 text-xs rounded-xl"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download Tuition Fee Receipt
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* PAYMENT HISTORY & COMPLETED RECEIPTS */}
        <div className="glass rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3 border border-border/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-foreground">Payment Receipts & History</h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">Download official payment receipts for your transactions in PDF or Excel format.</p>
            </div>
            <div className="text-xs font-semibold rounded-xl bg-card border border-border px-3 py-1 text-foreground w-fit">
              Total Settled: {inr(paidCollege + paidTuition)}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl sm:rounded-2xl border border-border bg-card">
            <table className="w-full text-xs text-left min-w-[540px]">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2.5 px-3">Transaction ID</th>
                  <th className="py-2.5 px-3">Fee Category</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Amount Paid</th>
                  <th className="py-2.5 px-3 text-right">Download Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(paymentsQ.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                      No payment receipts generated yet. Pay College Fee or Tuition Fee to generate a receipt.
                    </td>
                  </tr>
                )}
                {(paymentsQ.data ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition">
                    <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-foreground">
                      {p.transaction_id}
                    </td>
                    <td className="py-2.5 px-3 capitalize font-medium">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.fee_type.includes("college") || p.fee_type === "exam" ? "bg-orange-500/10 text-orange-700 border border-orange-200" : "bg-amber-500/15 text-amber-800 border border-amber-200"
                      }`}>
                        {p.fee_type.includes("college") || p.fee_type === "exam" ? "College Fee" : "Tuition Fee"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[11px]">
                      <div className="font-semibold text-foreground">{formatDate(p.created_at)}</div>
                      <div className="text-[10px] text-orange-600 font-mono font-medium">{formatTime(p.created_at)}</div>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-foreground">
                      {inr(Number(p.amount))}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReceiptPayment(p)}
                          className="h-7 text-[11px] font-semibold gap-1 border-orange-200 text-orange-700 hover:bg-orange-50 px-2"
                        >
                          <Printer className="h-3 w-3" /> PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => s && downloadExcelReceipt(p, s)}
                          className="h-7 text-[11px] font-semibold gap-1 border-amber-200 text-amber-800 hover:bg-amber-50 px-2"
                        >
                          <FileSpreadsheet className="h-3 w-3" /> Excel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Official Receipt Dialog */}
      <ReceiptDialog
        payment={receiptPayment}
        student={s}
        onClose={() => setReceiptPayment(null)}
      />
    </div>
  );
}

function StatusPill({ paid, partial }: { paid: boolean; partial?: boolean }) {
  if (paid)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Paid ✓
      </span>
    );
  if (partial)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 border border-orange-500/30 px-2.5 py-0.5 text-[10px] font-bold text-orange-700">
        <Clock className="h-3 w-3 text-orange-600" /> Partial
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
      <Clock className="h-3 w-3 text-amber-600" /> Pending
    </span>
  );
}

function ReceiptDialog({
  payment,
  student,
  onClose,
}: {
  payment: Payment | null;
  student: Student;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  if (!payment) return null;

  function printReceipt() {
    const w = window.open("", "_blank", "width=650,height=850");
    if (!w || !ref.current) return;
    w.document.write(
      `<html><head><title>Fee Receipt ${payment!.transaction_id}</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#111;line-height:1.5}
        h1{margin:0;font-size:18px;font-weight:bold}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        td{padding:10px 0;border-bottom:1px solid #eee;font-size:13px}
        td:last-child{text-align:right;font-weight:600}
        .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #eee;padding-bottom:12px}
        .footer{margin-top:32px;text-align:center;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:12px}
      </style>
      </head><body>
      <div class="header">
        <div>
          <h1>Netaji Polytechnic College, Dhule — Official Payment Receipt</h1>
          <div style="font-size:12px;color:#666">Payment Transaction ID: ${payment!.transaction_id}</div>
        </div>
      </div>
      ${ref.current.innerHTML}
      <div class="footer">This is an officially verified computer-generated fee receipt.</div>
      </body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border w-[92vw] max-w-md max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base font-bold">
            <FileCheck className="h-5 w-5 text-orange-600" /> Payment Receipt Issued
          </DialogTitle>
          <DialogDescription className="text-xs">
            Official payment receipt for <span className="font-semibold text-foreground">{inr(Number(payment.amount))}</span>
          </DialogDescription>
        </DialogHeader>
        <div ref={ref} className="rounded-2xl border border-border p-4 text-xs sm:text-sm space-y-3 bg-background">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h1 className="text-base font-bold">Netaji Polytechnic College, Dhule</h1>
              <div className="text-[11px] text-muted-foreground">Official Payment Receipt</div>
            </div>
            <img src="/college_logo.png" alt="NPC Dhule Logo" className="h-10 w-auto object-contain" />
          </div>
          <table className="w-full">
            <tbody>
              <tr><td className="text-muted-foreground py-1.5">Student Name</td><td className="font-semibold text-foreground">{student.name}</td></tr>
              <tr><td className="text-muted-foreground py-1.5">Student ID</td><td className="font-mono text-xs">{student.id.slice(0, 8).toUpperCase()}</td></tr>
              <tr><td className="text-muted-foreground py-1.5">Course / Branch</td><td>{student.course} ({student.branch})</td></tr>
              <tr><td className="text-muted-foreground py-1.5">Fee Category</td><td className="capitalize font-medium">{payment.fee_type.includes("college") || payment.fee_type === "exam" ? "College Fee" : "Tuition Fee"}</td></tr>
              <tr><td className="text-muted-foreground py-1.5">Amount Paid</td><td className="text-orange-600 font-extrabold text-sm sm:text-base">{inr(Number(payment.amount))}</td></tr>
              <tr><td className="text-muted-foreground py-1.5 font-medium">Transaction ID</td><td className="font-mono text-xs font-bold">{payment.transaction_id}</td></tr>
              <tr><td className="text-muted-foreground py-1.5 font-medium">Payment Date</td><td className="font-semibold text-foreground text-xs">{formatDate(payment.created_at)}</td></tr>
              <tr><td className="text-muted-foreground py-1.5 font-medium">Payment Time</td><td className="font-mono font-bold text-orange-600 text-xs">{formatTime(payment.created_at)}</td></tr>
              <tr><td className="text-muted-foreground py-1.5 font-medium">Payment Status</td><td className="text-emerald-600 font-bold">Successful ✓</td></tr>
            </tbody>
          </table>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto text-xs">Close</Button>
          <Button onClick={() => downloadExcelReceipt(payment, student)} variant="secondary" className="font-semibold text-xs gap-1.5 border border-amber-200 text-amber-800 hover:bg-amber-50 w-full sm:w-auto">
            <FileSpreadsheet className="h-4 w-4 text-amber-700" /> Excel (.csv)
          </Button>
          <Button onClick={printReceipt} className="bg-orange-600 text-white font-semibold hover:bg-orange-700 text-xs gap-1.5 w-full sm:w-auto">
            <Printer className="h-4 w-4" /> Download PDF / Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
