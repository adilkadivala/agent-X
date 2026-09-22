import {
  Activity,
  LayoutDashboard,
  ScanSearch,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface ChildItem {
  id?: string;
  name: string;
  icon?: LucideIcon;
  items?: ChildItem[];
  url?: string;
  disabled?: boolean;
  color?: string;
  badge?: boolean;
  badgeType?: string;
  badgeContent?: string;
  isActive?: boolean;
  external?: boolean;
  isPro?: boolean;
}

export interface MenuItem {
  heading?: string;
  items?: ChildItem[];
}

const sidebaritems: MenuItem[] = [
  {
    heading: "Workspace",
    items: [
      { id: "overview", name: "Overview", icon: LayoutDashboard, url: "/overview" },
      { id: "engage", name: "Engage", icon: Sparkles, url: "/engage" },
      { id: "analyze", name: "Analyze", icon: ScanSearch, url: "/analyze" },
      { id: "compliance", name: "Compliance", icon: Users, url: "/compliance" },
      { id: "compose", name: "Compose", icon: Activity, url: "/compose" },
    ],
  },
  {
    heading: "Account",
    items: [
      { id: "settings", name: "Settings", icon: Settings, url: "/settings" },
    ],
  },
];

export default sidebaritems;
