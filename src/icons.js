// Lucide 圖示（只匯入用到的，並轉成 inline SVG 字串）
import {
  House, CalendarDays, Compass, Settings, Sparkles, Clock, MapPin, Footprints, Users, Utensils, BookOpen, PenLine,
  MessagesSquare, Briefcase, Check, Square, SquareCheck, RefreshCw, ArrowUp, ArrowDown, Navigation, Info, Trash2,
  Pencil, Plus, Download, Upload, TriangleAlert, CircleCheck, OctagonAlert, Leaf, Zap, Search, ClipboardList,
  Route, Target, FlaskConical, Eye, X, Database, Timer, Map, Coffee,
} from 'lucide';

const ICONS = {
  home: House, calendar: CalendarDays, compass: Compass, settings: Settings, sparkles: Sparkles, clock: Clock, pin: MapPin,
  walk: Footprints, users: Users, meal: Utensils, study: BookOpen, homework: PenLine, group: MessagesSquare, errand: Briefcase,
  check: Check, square: Square, done: SquareCheck, refresh: RefreshCw, up: ArrowUp, down: ArrowDown, nav: Navigation, info: Info,
  trash: Trash2, edit: Pencil, plus: Plus, download: Download, upload: Upload, warn: TriangleAlert, ok: CircleCheck, bad: OctagonAlert,
  leaf: Leaf, zap: Zap, search: Search, list: ClipboardList, route: Route, target: Target, flask: FlaskConical, eye: Eye, x: X,
  db: Database, timer: Timer, map: Map, coffee: Coffee,
};

export function ic(name, size = 18, cls = '') {
  const node = ICONS[name];
  if (!node) return '';
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}
