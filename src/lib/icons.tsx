import type { SVGProps } from "react";

// Iconoir icons under the names the components already use.
export {
  Bell,
  ClockRotateRight as CalendarClock,
  Calendar as CalendarDays,
  CalendarXmark as CalendarX2,
  CheckCircle as CircleCheck,
  CheckCircle as CheckCircle2,
  XmarkCircle as CircleX,
  Folder as FolderOpen,
  Folder,
  Hourglass,
  Check,
  NavArrowLeft as ChevronLeft,
  NavArrowRight as ChevronRight,
  MailIn as Inbox,
  KeyCommand as Keyboard,
  ViewGrid as Layers,
  Lock,
  LockSquare as LockKeyhole,
  LockSlash as LockOpen,
  HalfMoon as Moon,
  Plus,
  Minus,
  Repeat,
  Search,
  Settings,
  ShieldAlert,
  Sparks as Sparkles,
  Square,
  Star,
  SunLight as Sun,
  Label as Tag,
  Timer,
  TimerOff as TimerReset,
  User as UserRound,
  UserPlus,
  Xmark as X,
  LogIn,
  LogOut,
  Key as KeyRound,
  ArrowLeft,
  SortDown as ArrowDownNarrowWide,
  SortUp as ArrowUpNarrowWide,
  Sort as ArrowUpDown,
  Menu,
  Trash as Trash2,
  Copy,
  Database,
  Download,
  Upload,
  SystemRestart as Loader2,
  WarningTriangle as TriangleAlert,
  TriangleFlag as Flag,
  FireFlame as Flame,
  DotsGrid3x3 as GripVertical,
  TaskList as ListChecks,
  TaskList as ListTodo,
  MoreHoriz as MoreHorizontal,
  Play,
  Undo as RotateCcw,
  Bold,
  Italic,
  List,
  Quote,
  Text as Type,
  Activity,
  FastArrowUp as ChevronsUp,
  Attachment as Paperclip,
  Group,
  Mail,
  Code,
  Microphone as Mic,
} from "iconoir-react";

// Iconoir has no heading glyphs; these match its 24px grid and 1.5 stroke.
const heading = (n: 1 | 2 | 3) => (props: SVGProps<SVGSVGElement>) => (
  <svg width="1.5em" height="1.5em" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 6v12M11 6v12M3 12h8" />
    {n === 1 && <path d="M16 9l3-2v11" />}
    {n === 2 && <path d="M15.5 9.5a2.5 2.5 0 0 1 5 0c0 2.5-5 5-5 8.5h5" />}
    {n === 3 && <path d="M15.5 8h5l-3 4a3 3 0 1 1-2 5.2" />}
  </svg>
);
export const Heading1 = heading(1);
export const Heading2 = heading(2);
export const Heading3 = heading(3);
