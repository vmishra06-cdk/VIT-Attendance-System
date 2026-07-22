import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar, BookOpen, Plus, Trash2, AlertTriangle, CheckCircle2,
  Sun, ClipboardList, ChevronRight, School, Stamp, Info, LogOut, User, ShieldCheck
} from "lucide-react";
import { auth, signInWithGoogle, logout } from "./src/firebase.js";
import { onAuthStateChanged } from "firebase/auth";

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key) => ({ value: localStorage.getItem(key) }),
    set: async (key, value) => { localStorage.setItem(key, value); },
  };
}

const WEEKDAYS = [
  { v: 1, s: "Mon" }, { v: 2, s: "Tue" }, { v: 3, s: "Wed" },
  { v: 4, s: "Thu" }, { v: 5, s: "Fri" },
];
const CREDIT_MAP = { 4: 3, 3: 2, 2: 1, 1: 1 };
const uid = () => Math.random().toString(36).slice(2, 10);
const toISO = (d) => {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayISO = () => toISO(new Date());

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return "—";
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

function parseDayVal(v) {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (!v) return 0;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s.startsWith("mon")) return 1;
  if (s === "2" || s.startsWith("tue")) return 2;
  if (s === "3" || s.startsWith("wed")) return 3;
  if (s === "4" || s.startsWith("thu")) return 4;
  if (s === "5" || s.startsWith("fri")) return 5;
  if (s === "6" || s.startsWith("sat")) return 6;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function countClasses(startISO, endISO, days, holidaySet, satMap, examRanges = []) {
  if (!startISO || !endISO) return 0;
  const [sy, sm, sd] = String(startISO).split("-").map(Number);
  const [ey, em, ed] = String(endISO).split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 0;

  let start = new Date(sy, sm - 1, sd);
  let end = new Date(ey, em - 1, ed);
  if (end < start) return 0;

  const numDays = (days || []).map(parseDayVal).filter((d) => d > 0);
  let count = 0;
  let d = new Date(start);
  while (d <= end) {
    const iso = toISO(d);
    const dow = d.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    const isExamDay = examRanges.some(
      (r) => r.start && r.end && iso >= r.start && iso <= r.end
    );
    if (!holidaySet.has(iso) && !isExamDay) {
      if (dow >= 1 && dow <= 5) {
        // Regular weekday class (Mon-Fri)
        if (numDays.includes(dow)) count++;
      } else if (dow === 6 && satMap.has(iso)) {
        // Saturday ONLY counts if registered in Saturdays tab AND course meets on the followed weekday
        const followsDay = parseDayVal(satMap.get(iso));
        if (followsDay > 0 && numDays.includes(followsDay)) {
          count++;
        }
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function bunkStats(attended, heldToday, heldCheckpoint) {
  const attClip = Math.min(attended, heldToday);
  const remaining = Math.max(0, heldCheckpoint - heldToday);
  if (heldCheckpoint <= 0) return { status: "none", reqClasses: 0 };

  // Always round UP (ceiling) to the next greatest integer for 75% requirement
  const reqClasses = Math.ceil(0.75 * heldCheckpoint);
  const maxAttainable = attClip + remaining;

  if (maxAttainable < reqClasses) {
    return {
      status: "impossible",
      reqClasses,
      maxAttainable,
      remaining,
    };
  }

  const neededFromRemaining = Math.max(0, reqClasses - attClip);
  const maxSkip = Math.max(0, remaining - neededFromRemaining);

  if (maxSkip === 0 && neededFromRemaining > 0) {
    return {
      status: "needed",
      needed: neededFromRemaining,
      reqClasses,
      remaining,
    };
  }

  return {
    status: "safe",
    maxSkip,
    neededFromRemaining,
    reqClasses,
    remaining,
  };
}

function StampBadge({ pct }) {
  if (pct === null) return <span className="text-xs" style={{ color: "#8a7f6a" }}>—</span>;
  const safe = pct >= 75;
  return (
    <span
      className="inline-block px-2.5 py-1 text-xs font-bold tracking-wide"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        color: safe ? "#2f6b3a" : "#a13b2b",
        border: `2px solid ${safe ? "#2f6b3a" : "#a13b2b"}`,
        borderRadius: "3px",
        transform: "rotate(-2deg)",
        background: safe ? "rgba(47,107,58,0.06)" : "rgba(161,59,43,0.06)",
      }}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

function SectionHeader({ icon: Icon, title, sub }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 38, height: 38, background: "#7a2e2e", borderRadius: "4px" }}
      >
        <Icon size={19} color="#f4ecd8" strokeWidth={1.8} />
      </div>
      <div>
        <h2
          className="text-xl leading-tight"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: "#2a231a" }}
        >
          {title}
        </h2>
        {sub && <p className="text-xs mt-0.5" style={{ color: "#8a7f6a" }}>{sub}</p>}
      </div>
    </div>
  );
}

function LedgerInput(props) {
  return (
    <input
      {...props}
      className={"px-2.5 py-1.5 text-sm outline-none " + (props.className || "")}
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        background: "#fbf6e9",
        border: "1.5px solid #c9bd9e",
        borderRadius: "3px",
        color: "#2a231a",
        ...(props.style || {}),
      }}
    />
  );
}

function TabButton({ active, onClick, icon: Icon, label, index }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 text-sm transition-all shrink-0"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: active ? "#f4ecd8" : "#5a4f3d",
        background: active ? "#7a2e2e" : "transparent",
        borderRadius: "4px 4px 0 0",
        borderBottom: active ? "3px solid #4a1f1f" : "3px solid transparent",
      }}
    >
      <Icon size={15} />
      <span className="hidden sm:inline">{index}. {label}</span>
      <span className="sm:hidden">{index}</span>
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState("setup");
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [settings, setSettings] = useState({
    semStart: "",
    cat1Start: "",
    cat1End: "",
    cat2Start: "",
    cat2End: "",
    lastInstructionalDay: "",
    today: todayISO(),
  });
  const [holidays, setHolidays] = useState([]);
  const [saturdays, setSaturdays] = useState([]);
  const [courses, setCourses] = useState([]);

  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });
  const [satForm, setSatForm] = useState({ date: "", follows: "1" });
  const [courseForm, setCourseForm] = useState({ name: "", credits: "3", days: [], attended: "" });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        const cached = localStorage.getItem("vit_google_user");
        if (cached) {
          try { setUser(JSON.parse(cached)); } catch (e) {}
        }
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [inputEmail, setInputEmail] = useState("");

  const handleGoogleLogin = async (e, directEmail = "") => {
    if (e && e.preventDefault) e.preventDefault();
    const targetEmail = directEmail || inputEmail;
    try {
      const googleUser = await signInWithGoogle(targetEmail);
      if (googleUser) {
        setUser(googleUser);
        localStorage.setItem("vit_google_user", JSON.stringify({
          uid: googleUser.uid,
          displayName: googleUser.displayName,
          email: googleUser.email,
          photoURL: googleUser.photoURL,
        }));
      }
    } catch (err) {
      console.error("Google Auth error:", err);
    }
  };

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem("vit_google_user");
    setUser(null);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const storageKey = `vit-ledger-data-${user.uid || "default"}`;
        const r = await window.storage.get(storageKey);
        if (r && r.value) {
          const data = JSON.parse(r.value);
          if (data.settings) {
            setSettings({
              semStart: data.settings.semStart || "",
              cat1Start: data.settings.cat1Start || data.settings.cat1 || "",
              cat1End: data.settings.cat1End || "",
              cat2Start: data.settings.cat2Start || data.settings.cat2 || "",
              cat2End: data.settings.cat2End || "",
              lastInstructionalDay: data.settings.lastInstructionalDay || data.settings.termEnd || "",
              today: data.settings.today || todayISO(),
            });
          }
          if (data.holidays) setHolidays(data.holidays);
          if (data.saturdays) setSaturdays(data.saturdays);
          if (data.courses) setCourses(data.courses);
        }
      } catch (e) { /* no saved data yet */ }
      setLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (!loaded || !user) return;
    const data = { settings, holidays, saturdays, courses };
    const storageKey = `vit-ledger-data-${user.uid || "default"}`;
    window.storage.set(storageKey, JSON.stringify(data)).catch(() => {});
  }, [settings, holidays, saturdays, courses, loaded, user]);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const satMap = useMemo(() => {
    const m = new Map();
    saturdays.forEach((s) => {
      if (s.date) {
        m.set(s.date.trim(), parseDayVal(s.follows));
      }
    });
    return m;
  }, [saturdays]);

  const examRanges = useMemo(() => [
    { start: settings.cat1Start, end: settings.cat1End },
    { start: settings.cat2Start, end: settings.cat2End },
  ], [settings.cat1Start, settings.cat1End, settings.cat2Start, settings.cat2End]);

  const checkpoints = [
    {
      key: "cat1",
      label: "CAT 1 Checkpoint",
      subLabel: settings.cat1Start && settings.cat1End ? `${fmtDate(settings.cat1Start)} - ${fmtDate(settings.cat1End)}` : "",
      date: settings.cat1Start,
    },
    {
      key: "cat2",
      label: "CAT 2 Checkpoint",
      subLabel: settings.cat2Start && settings.cat2End ? `${fmtDate(settings.cat2Start)} - ${fmtDate(settings.cat2End)}` : "",
      date: settings.cat2Start,
    },
    {
      key: "lastInstructionalDay",
      label: "Last Instructional Day Checkpoint",
      subLabel: settings.lastInstructionalDay ? fmtDate(settings.lastInstructionalDay) : "",
      date: settings.lastInstructionalDay,
    },
  ];

  const courseStats = useMemo(() => {
    if (!settings.semStart) return [];
    return courses.map((c) => {
      const heldToday = countClasses(settings.semStart, settings.today, c.days, holidaySet, satMap, examRanges);
      const attClip = Math.min(Number(c.attended) || 0, heldToday);
      const pctToday = heldToday > 0 ? (attClip / heldToday) * 100 : null;
      const cps = checkpoints.map((cp) => {
        const held = cp.date ? countClasses(settings.semStart, cp.date, c.days, holidaySet, satMap, examRanges) : 0;
        const isFuture = cp.date && cp.date >= settings.today;
        const stats = isFuture ? bunkStats(Number(c.attended) || 0, heldToday, held) : { status: "past" };
        return { ...cp, held, stats, isFuture };
      });
      return { ...c, heldToday, attClip, pctToday, cps };
    });
  }, [courses, settings, holidaySet, satMap, examRanges]);

  const addHoliday = () => {
    if (!holidayForm.date) return;
    setHolidays([...holidays, { id: uid(), date: holidayForm.date, name: holidayForm.name || "Holiday" }]);
    setHolidayForm({ date: "", name: "" });
  };
  const addSaturday = () => {
    if (!satForm.date) return;
    setSaturdays([...saturdays, { id: uid(), date: satForm.date, follows: satForm.follows }]);
    setSatForm({ date: "", follows: "1" });
  };
  const addCourse = () => {
    if (!courseForm.name || courseForm.days.length === 0) return;
    setCourses([...courses, {
      id: uid(), name: courseForm.name, credits: courseForm.credits,
      days: courseForm.days, attended: courseForm.attended || "0",
    }]);
    setCourseForm({ name: "", credits: "3", days: [], attended: "" });
  };
  const toggleDay = (v) => {
    setCourseForm((f) => ({
      ...f,
      days: f.days.includes(v) ? f.days.filter((d) => d !== v) : [...f.days, v].sort(),
    }));
  };
  const updateAttended = (id, val) => {
    setCourses(courses.map((c) => (c.id === id ? { ...c, attended: val } : c)));
  };
  const toggleCourseDay = (courseId, dayVal) => {
    setCourses(courses.map((c) => {
      if (c.id !== courseId) return c;
      const newDays = c.days.includes(dayVal)
        ? c.days.filter((d) => d !== dayVal)
        : [...c.days, dayVal].sort();
      return { ...c, days: newDays };
    }));
  };

  const expectedDays = CREDIT_MAP[Number(courseForm.credits)] || 1;

  return (
    <div
      className="w-full min-h-screen"
      style={{
        background: "#efe6cf",
        backgroundImage:
          "repeating-linear-gradient(#efe6cf, #efe6cf 34px, #d8ccae 35px)",
        fontFamily: "'Fraunces', serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.3) sepia(1) saturate(3) hue-rotate(-10deg); cursor: pointer; }
        ::selection { background: #7a2e2e; color: #f4ecd8; }
      `}</style>

      <div className="relative max-w-5xl mx-auto px-5 sm:px-10 py-8" style={{ borderLeft: "3px solid #a13b2b", marginLeft: "24px" }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5" style={{ borderBottom: "2px solid #2a231a" }}>
          <div>
            <div className="flex items-center gap-2 mb-1" style={{ color: "#a13b2b" }}>
              <School size={18} />
              <span className="text-xs font-bold tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                VELLORE INSTITUTE OF TECHNOLOGY
              </span>
            </div>
            <h1
              className="text-4xl sm:text-5xl"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, color: "#2a231a", letterSpacing: "-0.01em" }}
            >
              Attendance Ledger
            </h1>
            <p className="text-sm mt-2" style={{ color: "#5a4f3d" }}>
              Register your FFCS timetable, holidays, remote Saturdays, CAT 1/2 dates, and Last Instructional Day — track your 75% requirement at each milestone.
            </p>
          </div>

          {/* User Profile Badge */}
          {user ? (
            <div className="flex items-center gap-3 shrink-0 p-2.5 px-3.5" style={{ background: "#fbf6e9", border: "1.5px solid #c9bd9e", borderRadius: "6px" }}>
              <img
                src={user.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + (user.displayName || "user")}
                alt="Google Avatar"
                className="w-10 h-10 rounded-full border border-[#7a2e2e] object-cover"
              />
              <div className="text-left">
                <p className="text-xs font-bold leading-tight" style={{ color: "#2a231a", fontFamily: "'Fraunces', serif" }}>
                  {user.displayName || "Google Account"}
                </p>
                <p className="text-[11px]" style={{ color: "#8a7f6a", fontFamily: "'JetBrains Mono', monospace" }}>
                  {user.email || "signed-in"}
                </p>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 mt-1 text-[11px] font-bold"
                  style={{ color: "#a13b2b", fontFamily: "'JetBrains Mono', monospace" }}
                >
                  <LogOut size={12} /> Sign out
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="inline-flex items-center gap-2.5 px-4 py-2 text-xs font-bold shrink-0 transition-all"
              style={{
                background: "#fbf6e9",
                border: "2px solid #7a2e2e",
                borderRadius: "4px",
                color: "#7a2e2e",
                fontFamily: "'JetBrains Mono', monospace"
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              SIGN IN WITH GOOGLE
            </button>
          )}
        </div>

        {!user && !authLoading ? (
          <div className="p-8 sm:p-10 text-center my-6 max-w-lg mx-auto" style={{ background: "#fbf6e9", border: "1.5px solid #c9bd9e", borderRadius: "8px" }}>
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full" style={{ background: "#7a2e2e", color: "#f4ecd8" }}>
              <ShieldCheck size={36} />
            </div>
            <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Fraunces', serif", color: "#2a231a" }}>
              Google Sign-In
            </h2>
            <p className="text-sm mx-auto mb-6" style={{ color: "#5a4f3d" }}>
              Sign in with your Google email address to manage your personal FFCS timetable, holidays, and 75% attendance projections.
            </p>

            <form onSubmit={(e) => handleGoogleLogin(e, inputEmail)} className="space-y-4 max-w-sm mx-auto mb-6">
              <div>
                <label className="block text-left text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                  ENTER YOUR GOOGLE EMAIL ADDRESS
                </label>
                <LedgerInput
                  type="email"
                  required
                  placeholder="e.g. student@gmail.com or name@vitstudent.ac.in"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  className="w-full"
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 px-6 py-3 font-bold text-sm shadow-md hover:shadow-lg transition-all"
                style={{
                  background: "#7a2e2e",
                  color: "#f4ecd8",
                  borderRadius: "4px",
                  fontFamily: "'JetBrains Mono', monospace"
                }}
              >
                <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                SIGN IN WITH GOOGLE EMAIL
              </button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#c9bd9e]"></div></div>
              <div className="relative flex justify-center text-xs"><span className="px-2 bg-[#fbf6e9] text-[#8a7f6a]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>OR GOOGLE POPUP</span></div>
            </div>

            <button
              onClick={() => handleGoogleLogin(null, "")}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all"
              style={{
                background: "transparent",
                border: "1.5px solid #7a2e2e",
                borderRadius: "4px",
                color: "#7a2e2e",
                fontFamily: "'JetBrains Mono', monospace"
              }}
            >
              Google OAuth Popup Sign-In
            </button>
          </div>
        ) : (
          <>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          <TabButton active={tab === "setup"} onClick={() => setTab("setup")} icon={Calendar} label="Calendar" index={1} />
          <TabButton active={tab === "holidays"} onClick={() => setTab("holidays")} icon={Sun} label="Holidays" index={2} />
          <TabButton active={tab === "saturdays"} onClick={() => setTab("saturdays")} icon={ClipboardList} label="Saturdays" index={3} />
          <TabButton active={tab === "courses"} onClick={() => setTab("courses")} icon={BookOpen} label="Courses" index={4} />
          <TabButton active={tab === "results"} onClick={() => setTab("results")} icon={Stamp} label="Ledger" index={5} />
        </div>

        {/* Panel */}
        <div className="p-6 sm:p-8" style={{ background: "#fbf6e9", border: "1.5px solid #c9bd9e", borderRadius: "6px" }}>

          {tab === "setup" && (
            <div>
              <SectionHeader icon={Calendar} title="Academic Calendar" sub="Enter semester start, today's date, CAT exam periods, and last instructional day" />
              <div className="space-y-6">
                {/* Semester Start & Today */}
                <div className="grid sm:grid-cols-2 gap-4 p-4" style={{ background: "#efe6cf", borderRadius: "4px" }}>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                      SEMESTER START DATE
                    </label>
                    <LedgerInput
                      type="date"
                      value={settings.semStart}
                      onChange={(e) => setSettings({ ...settings, semStart: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                      TODAY'S DATE
                    </label>
                    <LedgerInput
                      type="date"
                      value={settings.today}
                      onChange={(e) => setSettings({ ...settings, today: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* CAT 1 */}
                <div className="p-4" style={{ background: "#efe6cf", borderRadius: "4px" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#7a2e2e" }}>
                      CAT 1 EXAM PERIOD
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: "#7a2e2e", color: "#f4ecd8", fontFamily: "'JetBrains Mono', monospace" }}>
                      75% Required
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                        CAT 1 START DATE
                      </label>
                      <LedgerInput
                        type="date"
                        value={settings.cat1Start}
                        onChange={(e) => setSettings({ ...settings, cat1Start: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                        CAT 1 END DATE
                      </label>
                      <LedgerInput
                        type="date"
                        value={settings.cat1End}
                        onChange={(e) => setSettings({ ...settings, cat1End: e.target.value })}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* CAT 2 */}
                <div className="p-4" style={{ background: "#efe6cf", borderRadius: "4px" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#7a2e2e" }}>
                      CAT 2 EXAM PERIOD
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: "#7a2e2e", color: "#f4ecd8", fontFamily: "'JetBrains Mono', monospace" }}>
                      75% Required
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                        CAT 2 START DATE
                      </label>
                      <LedgerInput
                        type="date"
                        value={settings.cat2Start}
                        onChange={(e) => setSettings({ ...settings, cat2Start: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                        CAT 2 END DATE
                      </label>
                      <LedgerInput
                        type="date"
                        value={settings.cat2End}
                        onChange={(e) => setSettings({ ...settings, cat2End: e.target.value })}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Last Instructional Day */}
                <div className="p-4" style={{ background: "#efe6cf", borderRadius: "4px" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#7a2e2e" }}>
                      LAST INSTRUCTIONAL DAY
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: "#7a2e2e", color: "#f4ecd8", fontFamily: "'JetBrains Mono', monospace" }}>
                      75% Required
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                      LAST INSTRUCTIONAL DAY DATE
                    </label>
                    <LedgerInput
                      type="date"
                      value={settings.lastInstructionalDay}
                      onChange={(e) => setSettings({ ...settings, lastInstructionalDay: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-6 p-3 text-xs" style={{ background: "#efe6cf", borderRadius: "4px", color: "#5a4f3d" }}>
                <Info size={15} className="shrink-0 mt-0.5" />
                <span>Classes are counted Monday to Saturday on scheduled course days (or per registered Saturday timetable swaps), excluding registered holidays and CAT exam periods.</span>
              </div>
            </div>
          )}

          {tab === "holidays" && (
            <div>
              <SectionHeader icon={Sun} title="Holidays" sub="No classes are held on these dates, for any course" />
              <div className="flex flex-wrap gap-3 mb-5 items-end">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>DATE</label>
                  <LedgerInput type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>OCCASION</label>
                  <LedgerInput type="text" placeholder="e.g. Diwali" value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} />
                </div>
                <button onClick={addHoliday} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold" style={{ background: "#7a2e2e", color: "#f4ecd8", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace" }}>
                  <Plus size={15} /> ADD
                </button>
              </div>
              {holidays.length === 0 ? (
                <p className="text-sm italic" style={{ color: "#8a7f6a" }}>No holidays registered yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2" style={{ background: "#efe6cf", borderRadius: "3px" }}>
                      <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(h.date)}</span>
                      <span className="text-sm flex-1 ml-4" style={{ color: "#5a4f3d" }}>{h.name}</span>
                      <button onClick={() => setHolidays(holidays.filter((x) => x.id !== h.id))}><Trash2 size={15} color="#a13b2b" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "saturdays" && (
            <div>
              <SectionHeader icon={ClipboardList} title="Remote Saturday Classes" sub="Register each Saturday that runs on another weekday's schedule" />
              <div className="flex flex-wrap gap-3 mb-5 items-end">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>SATURDAY DATE</label>
                  <LedgerInput type="date" value={satForm.date} onChange={(e) => setSatForm({ ...satForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>FOLLOWS SCHEDULE OF</label>
                  <select
                    value={satForm.follows}
                    onChange={(e) => setSatForm({ ...satForm, follows: e.target.value })}
                    className="px-2.5 py-1.5 text-sm"
                    style={{ fontFamily: "'JetBrains Mono', monospace", background: "#fbf6e9", border: "1.5px solid #c9bd9e", borderRadius: "3px", color: "#2a231a" }}
                  >
                    {WEEKDAYS.map((w) => <option key={w.v} value={w.v}>{w.s}</option>)}
                  </select>
                </div>
                <button onClick={addSaturday} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold" style={{ background: "#7a2e2e", color: "#f4ecd8", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace" }}>
                  <Plus size={15} /> ADD
                </button>
              </div>
              {saturdays.length === 0 ? (
                <p className="text-sm italic" style={{ color: "#8a7f6a" }}>No remote Saturdays registered yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {[...saturdays].sort((a, b) => a.date.localeCompare(b.date)).map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2" style={{ background: "#efe6cf", borderRadius: "3px" }}>
                      <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(s.date)}</span>
                      <span className="text-sm flex-1 ml-4" style={{ color: "#5a4f3d" }}>follows {WEEKDAYS.find((w) => w.v === Number(s.follows))?.s} schedule</span>
                      <button onClick={() => setSaturdays(saturdays.filter((x) => x.id !== s.id))}><Trash2 size={15} color="#a13b2b" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "courses" && (
            <div>
              <SectionHeader icon={BookOpen} title="Courses" sub="Add each course from your FFCS timetable" />
              <div className="p-4 mb-6" style={{ background: "#efe6cf", borderRadius: "4px" }}>
                <div className="grid sm:grid-cols-3 gap-4 mb-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>COURSE NAME</label>
                    <LedgerInput type="text" placeholder="e.g. Data Structures" value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} className="w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>CREDITS</label>
                    <select
                      value={courseForm.credits}
                      onChange={(e) => setCourseForm({ ...courseForm, credits: e.target.value, days: [] })}
                      className="w-full px-2.5 py-1.5 text-sm"
                      style={{ fontFamily: "'JetBrains Mono', monospace", background: "#fbf6e9", border: "1.5px solid #c9bd9e", borderRadius: "3px" }}
                    >
                      <option value="4">4 credits — 3/week</option>
                      <option value="3">3 credits — 2/week</option>
                      <option value="2">2 credits — 1/week</option>
                      <option value="1">1 credit — 1/week</option>
                    </select>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>
                    MEETS ON &nbsp;
                    <span style={{ color: courseForm.days.length === expectedDays ? "#2f6b3a" : "#a13b2b" }}>
                      ({courseForm.days.length}/{expectedDays} selected)
                    </span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {WEEKDAYS.map((w) => (
                      <button
                        key={w.v}
                        onClick={() => toggleDay(w.v)}
                        className="px-3.5 py-1.5 text-sm font-bold"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          borderRadius: "3px",
                          border: "1.5px solid #7a2e2e",
                          background: courseForm.days.includes(w.v) ? "#7a2e2e" : "transparent",
                          color: courseForm.days.includes(w.v) ? "#f4ecd8" : "#7a2e2e",
                        }}
                      >
                        {w.s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>CLASSES ATTENDED SO FAR</label>
                    <LedgerInput type="number" min="0" placeholder="0" value={courseForm.attended} onChange={(e) => setCourseForm({ ...courseForm, attended: e.target.value })} />
                  </div>
                  <button onClick={addCourse} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold" style={{ background: "#7a2e2e", color: "#f4ecd8", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace" }}>
                    <Plus size={15} /> ADD COURSE
                  </button>
                </div>
              </div>

              {courses.length === 0 ? (
                <p className="text-sm italic" style={{ color: "#8a7f6a" }}>No courses added yet.</p>
              ) : (
                <div className="space-y-2">
                  {courses.map((c) => (
                    <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3" style={{ background: "#efe6cf", borderRadius: "4px" }}>
                      <div className="flex-1">
                        <p className="font-semibold text-sm" style={{ color: "#2a231a" }}>{c.name}</p>
                        <p className="text-xs mt-0.5 mb-2" style={{ color: "#8a7f6a", fontFamily: "'JetBrains Mono', monospace" }}>
                          {c.credits} credits · {c.days.length} days/week scheduled
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {WEEKDAYS.map((w) => (
                            <button
                              key={w.v}
                              onClick={() => toggleCourseDay(c.id, w.v)}
                              className="px-2 py-0.5 text-xs font-bold transition-all"
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                borderRadius: "3px",
                                border: "1.5px solid #7a2e2e",
                                background: c.days.includes(w.v) ? "#7a2e2e" : "transparent",
                                color: c.days.includes(w.v) ? "#f4ecd8" : "#7a2e2e",
                              }}
                            >
                              {w.s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div>
                          <label className="text-xs block font-bold mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#5a4f3d" }}>ATTENDED</label>
                          <LedgerInput type="number" min="0" value={c.attended} onChange={(e) => updateAttended(c.id, e.target.value)} style={{ width: "70px" }} />
                        </div>
                        <button onClick={() => setCourses(courses.filter((x) => x.id !== c.id))} className="mt-4"><Trash2 size={16} color="#a13b2b" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "results" && (
            <div>
              <SectionHeader icon={Stamp} title="The Ledger" sub="Your standing as of today, and 75% attendance projections for each checkpoint" />
              {!settings.semStart || courses.length === 0 ? (
                <p className="text-sm italic" style={{ color: "#8a7f6a" }}>
                  Fill in the Calendar and Courses tabs to see your ledger.
                </p>
              ) : (
                <div className="space-y-6">
                  {courseStats.map((c) => (
                    <div key={c.id} style={{ border: "1.5px solid #c9bd9e", borderRadius: "5px", overflow: "hidden" }}>
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: "#efe6cf" }}>
                        <div>
                          <p className="font-semibold" style={{ color: "#2a231a", fontFamily: "'Fraunces', serif" }}>{c.name}</p>
                          <p className="text-xs" style={{ color: "#8a7f6a", fontFamily: "'JetBrains Mono', monospace" }}>
                            {c.attClip}/{c.heldToday} attended till today
                          </p>
                        </div>
                        <StampBadge pct={c.pctToday} />
                      </div>
                      <div className="divide-y" style={{ borderColor: "#e2d8bb" }}>
                        {c.cps.map((cp) => (
                          <div key={cp.key} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid #e2d8bb" }}>
                            <ChevronRight size={14} color="#8a7f6a" className="shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium" style={{ color: "#2a231a" }}>{cp.label}</p>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#7a2e2e", color: "#f4ecd8", fontFamily: "'JetBrains Mono', monospace" }}>
                                  75% Target
                                </span>
                              </div>
                              <p className="text-xs" style={{ color: "#8a7f6a", fontFamily: "'JetBrains Mono', monospace" }}>
                                {cp.subLabel ? `${cp.subLabel} · ` : cp.date ? `${fmtDate(cp.date)} · ` : "no date set · "}
                                {cp.held} total classes · {cp.stats.reqClasses || Math.ceil(0.75 * cp.held)} needed for 75%
                              </p>
                            </div>
                            <div className="text-right">
                              {!cp.date && <span className="text-xs italic" style={{ color: "#8a7f6a" }}>set date</span>}
                              {cp.date && !cp.isFuture && <span className="text-xs italic" style={{ color: "#8a7f6a" }}>already past</span>}
                              {cp.date && cp.isFuture && cp.stats.status === "safe" && (
                                <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#2f6b3a" }}>
                                  <CheckCircle2 size={15} /> can skip {cp.stats.maxSkip} more
                                </span>
                              )}
                              {cp.date && cp.isFuture && cp.stats.status === "needed" && (
                                <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#a13b2b" }}>
                                  <AlertTriangle size={15} /> must attend next {cp.stats.needed}
                                </span>
                              )}
                              {cp.date && cp.isFuture && cp.stats.status === "impossible" && (
                                <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#a13b2b" }}>
                                  <AlertTriangle size={15} /> 75% unreachable ({cp.stats.maxAttainable}/{cp.held} max)
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#8a7f6a", fontFamily: "'JetBrains Mono', monospace" }}>
          your data is saved automatically to this ledger — 75% is VIT's minimum attendance requirement
        </p>
          </>
        )}
      </div>
    </div>
  );
}
