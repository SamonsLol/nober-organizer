import {
  AlarmClock, Apple, Archive, Atom, Baby, Banknote, Bell, Bike, Binary, Book, BookMarked, BookOpen, Bookmark, Bot, Brain,
  Briefcase, Brush, Bug, Building2, Bus, Cake, Calculator, Calendar, CalendarDays, Camera, Car, Cat, ChartColumn, ChartLine,
  ChartPie, CircleCheck, CircleHelp, Clapperboard, ClipboardCheck, ClipboardList, Clock, Cloud, Code, Coffee, Cog, Compass,
  Cpu, CreditCard, Database, Dice5, Divide, Dna, Dog, Drama, Droplet, Dumbbell, Ear, Earth, Feather, FileText, Files, Film,
  Flag, FlaskConical, Flame, Flower2, Folder, Footprints, Gamepad2, Gavel, Gift, GitBranch, Glasses, Globe, GraduationCap,
  Guitar, Hammer, HandHeart, Handshake, Headphones, Heart, HeartPulse, Highlighter, History, Hourglass, House, Infinity,
  Info, Key, Landmark, Languages, Laptop, Layers, Leaf, Library, Lightbulb, ListChecks, ListTodo, Lock, Magnet, Mail, Map,
  MapPin, Medal, Megaphone, MessageCircle, Mic, Microscope, Monitor, Moon, Mountain, Music, Newspaper, Notebook, NotebookPen,
  NotebookTabs, Orbit, Package, Palette, PartyPopper, PawPrint, PenLine, PenTool, Pencil, Percent, Phone, Pi, PiggyBank, Pill,
  Pin, Pizza, Plane, Presentation, Puzzle, Quote, Rocket, Ruler, School, Scale, ScrollText, Server, Shapes, Shield,
  ShoppingBag, ShoppingCart, Sigma, Smartphone, Smile, Snowflake, Sparkles, Sprout, SquareFunction, Star, Stethoscope,
  StickyNote, Sun, Tag, Target, Telescope, Tent, Terminal, TestTube, Theater, Thermometer, Ticket, TrainFront, TreePine,
  TriangleAlert, Trophy, Umbrella, User, Users, Utensils, Variable, Video, Wallet, Waves, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

/**
 * Íconos de la app (Lucide). Sin "use client": sirve en componentes de servidor y de cliente.
 * Los campos `emoji` de la base guardan la clave del ícono (p. ej. "flask-conical"). Los emojis antiguos se
 * traducen con EMOJI (o caen al ícono de respaldo), así todo se ve con Lucide sin migrar datos.
 */

export interface IconDef { icon: LucideIcon; label: string; group: IconGroup; words?: string }

export type IconGroup = "Estudio" | "Ciencias" | "Artes y letras" | "Tecnología" | "Personal" | "Salud y deporte" | "Lugares y viajes" | "Trabajo y dinero" | "Símbolos";

export const ICON_GROUPS: IconGroup[] = ["Estudio", "Ciencias", "Artes y letras", "Tecnología", "Personal", "Salud y deporte", "Lugares y viajes", "Trabajo y dinero", "Símbolos"];

export const ICONS: Record<string, IconDef> = {
  // Estudio
  "book-open": { icon: BookOpen, label: "Libro abierto", group: "Estudio", words: "lectura leer lengua literatura" },
  book: { icon: Book, label: "Libro", group: "Estudio", words: "materia curso" },
  "book-marked": { icon: BookMarked, label: "Libro marcado", group: "Estudio", words: "lectura" },
  library: { icon: Library, label: "Biblioteca", group: "Estudio", words: "libros vocabulario" },
  notebook: { icon: Notebook, label: "Cuaderno", group: "Estudio" },
  "notebook-pen": { icon: NotebookPen, label: "Apunte", group: "Estudio", words: "nota cuaderno escribir tarea" },
  "notebook-tabs": { icon: NotebookTabs, label: "Cuaderno con pestañas", group: "Estudio", words: "carpeta" },
  "graduation-cap": { icon: GraduationCap, label: "Graduación", group: "Estudio", words: "universidad examen evaluación birrete" },
  school: { icon: School, label: "Colegio", group: "Estudio", words: "escuela universidad" },
  pencil: { icon: Pencil, label: "Lápiz", group: "Estudio", words: "escribir editar" },
  "pen-line": { icon: PenLine, label: "Esfero", group: "Estudio", words: "escribir ensayo" },
  highlighter: { icon: Highlighter, label: "Resaltador", group: "Estudio", words: "subrayar repasar" },
  ruler: { icon: Ruler, label: "Regla", group: "Estudio", words: "medir geometría" },
  calculator: { icon: Calculator, label: "Calculadora", group: "Estudio", words: "matemáticas cálculo números" },
  sigma: { icon: Sigma, label: "Sumatoria", group: "Estudio", words: "matemáticas estadística suma" },
  divide: { icon: Divide, label: "División", group: "Estudio", words: "matemáticas aritmética" },
  pi: { icon: Pi, label: "Pi", group: "Estudio", words: "matemáticas geometría" },
  "square-function": { icon: SquareFunction, label: "Función", group: "Estudio", words: "matemáticas cálculo álgebra" },
  variable: { icon: Variable, label: "Variable", group: "Estudio", words: "álgebra matemáticas" },
  percent: { icon: Percent, label: "Porcentaje", group: "Estudio", words: "estadística economía" },
  "chart-line": { icon: ChartLine, label: "Gráfica de línea", group: "Estudio", words: "estadística economía progreso" },
  "chart-column": { icon: ChartColumn, label: "Gráfica de barras", group: "Estudio", words: "estadística datos" },
  "chart-pie": { icon: ChartPie, label: "Gráfica circular", group: "Estudio", words: "estadística porcentaje" },
  brain: { icon: Brain, label: "Cerebro", group: "Estudio", words: "filosofía psicología pensar idea" },
  lightbulb: { icon: Lightbulb, label: "Bombillo", group: "Estudio", words: "idea tema concepto" },
  puzzle: { icon: Puzzle, label: "Rompecabezas", group: "Estudio", words: "problema lógica tema" },
  presentation: { icon: Presentation, label: "Presentación", group: "Estudio", words: "exposición diapositivas" },
  "clipboard-list": { icon: ClipboardList, label: "Lista", group: "Estudio", words: "quiz evaluación" },
  "clipboard-check": { icon: ClipboardCheck, label: "Revisado", group: "Estudio", words: "examen parcial evaluación" },
  "file-text": { icon: FileText, label: "Documento", group: "Estudio", words: "trabajo informe guía pdf" },
  files: { icon: Files, label: "Archivos", group: "Estudio", words: "documentos guías" },
  "scroll-text": { icon: ScrollText, label: "Pergamino", group: "Estudio", words: "historia ensayo lectura" },
  "sticky-note": { icon: StickyNote, label: "Nota adhesiva", group: "Estudio", words: "recordatorio pendiente" },
  languages: { icon: Languages, label: "Idiomas", group: "Estudio", words: "inglés francés traducción" },
  "message-circle": { icon: MessageCircle, label: "Conversación", group: "Estudio", words: "inglés idiomas hablar oral" },
  glasses: { icon: Glasses, label: "Gafas", group: "Estudio", words: "leer lectura" },
  // Ciencias
  atom: { icon: Atom, label: "Átomo", group: "Ciencias", words: "física química" },
  "flask-conical": { icon: FlaskConical, label: "Matraz", group: "Ciencias", words: "química laboratorio" },
  "test-tube": { icon: TestTube, label: "Tubo de ensayo", group: "Ciencias", words: "química biología laboratorio" },
  microscope: { icon: Microscope, label: "Microscopio", group: "Ciencias", words: "biología laboratorio" },
  dna: { icon: Dna, label: "ADN", group: "Ciencias", words: "biología genética" },
  leaf: { icon: Leaf, label: "Hoja", group: "Ciencias", words: "biología ecología naturaleza" },
  sprout: { icon: Sprout, label: "Brote", group: "Ciencias", words: "biología crecimiento planta" },
  "tree-pine": { icon: TreePine, label: "Árbol", group: "Ciencias", words: "naturaleza ecología" },
  bug: { icon: Bug, label: "Insecto", group: "Ciencias", words: "biología error" },
  telescope: { icon: Telescope, label: "Telescopio", group: "Ciencias", words: "astronomía" },
  orbit: { icon: Orbit, label: "Órbita", group: "Ciencias", words: "astronomía física" },
  magnet: { icon: Magnet, label: "Imán", group: "Ciencias", words: "física electromagnetismo" },
  zap: { icon: Zap, label: "Rayo", group: "Ciencias", words: "electricidad energía física" },
  flame: { icon: Flame, label: "Llama", group: "Ciencias", words: "química calor fuego racha" },
  droplet: { icon: Droplet, label: "Gota", group: "Ciencias", words: "agua química" },
  thermometer: { icon: Thermometer, label: "Termómetro", group: "Ciencias", words: "temperatura física" },
  globe: { icon: Globe, label: "Globo", group: "Ciencias", words: "geografía mundo web sociales" },
  earth: { icon: Earth, label: "Tierra", group: "Ciencias", words: "geografía planeta sociales" },
  mountain: { icon: Mountain, label: "Montaña", group: "Ciencias", words: "geografía naturaleza" },
  map: { icon: Map, label: "Mapa", group: "Ciencias", words: "geografía sociales historia" },
  compass: { icon: Compass, label: "Brújula", group: "Ciencias", words: "geografía orientación" },
  infinity: { icon: Infinity, label: "Infinito", group: "Ciencias", words: "matemáticas cálculo" },
  shapes: { icon: Shapes, label: "Figuras", group: "Ciencias", words: "geometría diseño" },
  // Artes y letras
  landmark: { icon: Landmark, label: "Edificio clásico", group: "Artes y letras", words: "historia sociales gobierno" },
  scale: { icon: Scale, label: "Balanza", group: "Artes y letras", words: "derecho ética justicia" },
  gavel: { icon: Gavel, label: "Mazo", group: "Artes y letras", words: "derecho ley" },
  hourglass: { icon: Hourglass, label: "Reloj de arena", group: "Artes y letras", words: "historia tiempo" },
  history: { icon: History, label: "Historia", group: "Artes y letras", words: "pasado tiempo" },
  feather: { icon: Feather, label: "Pluma", group: "Artes y letras", words: "literatura poesía escritura" },
  quote: { icon: Quote, label: "Cita", group: "Artes y letras", words: "literatura frase" },
  palette: { icon: Palette, label: "Paleta", group: "Artes y letras", words: "arte pintura diseño" },
  brush: { icon: Brush, label: "Pincel", group: "Artes y letras", words: "arte pintura" },
  "pen-tool": { icon: PenTool, label: "Pluma de diseño", group: "Artes y letras", words: "diseño dibujo" },
  music: { icon: Music, label: "Música", group: "Artes y letras", words: "canción" },
  guitar: { icon: Guitar, label: "Guitarra", group: "Artes y letras", words: "música" },
  mic: { icon: Mic, label: "Micrófono", group: "Artes y letras", words: "exposición oral podcast" },
  drama: { icon: Drama, label: "Teatro", group: "Artes y letras", words: "máscaras artes escénicas" },
  theater: { icon: Theater, label: "Escenario", group: "Artes y letras", words: "teatro evento" },
  camera: { icon: Camera, label: "Cámara", group: "Artes y letras", words: "foto fotografía" },
  film: { icon: Film, label: "Película", group: "Artes y letras", words: "cine video" },
  clapperboard: { icon: Clapperboard, label: "Claqueta", group: "Artes y letras", words: "cine audiovisual" },
  newspaper: { icon: Newspaper, label: "Periódico", group: "Artes y letras", words: "noticias comunicación" },
  megaphone: { icon: Megaphone, label: "Megáfono", group: "Artes y letras", words: "comunicación anuncio" },
  // Tecnología
  code: { icon: Code, label: "Código", group: "Tecnología", words: "programación desarrollo" },
  terminal: { icon: Terminal, label: "Terminal", group: "Tecnología", words: "programación consola" },
  laptop: { icon: Laptop, label: "Portátil", group: "Tecnología", words: "computador" },
  monitor: { icon: Monitor, label: "Monitor", group: "Tecnología", words: "computador pantalla" },
  smartphone: { icon: Smartphone, label: "Celular", group: "Tecnología", words: "teléfono app" },
  server: { icon: Server, label: "Servidor", group: "Tecnología", words: "infraestructura vps" },
  database: { icon: Database, label: "Base de datos", group: "Tecnología", words: "datos sql" },
  cpu: { icon: Cpu, label: "Procesador", group: "Tecnología", words: "hardware electrónica" },
  binary: { icon: Binary, label: "Binario", group: "Tecnología", words: "programación datos" },
  wifi: { icon: Wifi, label: "Wi-Fi", group: "Tecnología", words: "redes internet" },
  cloud: { icon: Cloud, label: "Nube", group: "Tecnología", words: "internet clima" },
  bot: { icon: Bot, label: "Robot", group: "Tecnología", words: "ia inteligencia artificial" },
  "git-branch": { icon: GitBranch, label: "Rama", group: "Tecnología", words: "git código versión" },
  shield: { icon: Shield, label: "Escudo", group: "Tecnología", words: "seguridad" },
  lock: { icon: Lock, label: "Candado", group: "Tecnología", words: "seguridad contraseña" },
  key: { icon: Key, label: "Llave", group: "Tecnología", words: "acceso contraseña" },
  cog: { icon: Cog, label: "Engranaje", group: "Tecnología", words: "ajustes ingeniería mecánica" },
  wrench: { icon: Wrench, label: "Llave inglesa", group: "Tecnología", words: "arreglar herramienta" },
  hammer: { icon: Hammer, label: "Martillo", group: "Tecnología", words: "construir herramienta" },
  rocket: { icon: Rocket, label: "Cohete", group: "Tecnología", words: "proyecto lanzamiento" },
  layers: { icon: Layers, label: "Capas", group: "Tecnología", words: "proyecto diseño" },
  // Personal
  heart: { icon: Heart, label: "Corazón", group: "Personal", words: "amor favorito" },
  "hand-heart": { icon: HandHeart, label: "Voluntariado", group: "Personal", words: "ayuda social" },
  handshake: { icon: Handshake, label: "Acuerdo", group: "Personal", words: "reunión cliente" },
  users: { icon: Users, label: "Grupo", group: "Personal", words: "equipo amigos familia trabajo en grupo" },
  user: { icon: User, label: "Persona", group: "Personal", words: "perfil" },
  baby: { icon: Baby, label: "Bebé", group: "Personal", words: "familia" },
  dog: { icon: Dog, label: "Perro", group: "Personal", words: "mascota" },
  cat: { icon: Cat, label: "Gato", group: "Personal", words: "mascota" },
  "paw-print": { icon: PawPrint, label: "Huella", group: "Personal", words: "mascota veterinario" },
  house: { icon: House, label: "Casa", group: "Personal", words: "hogar oficios" },
  "shopping-cart": { icon: ShoppingCart, label: "Carrito", group: "Personal", words: "compras mercado" },
  "shopping-bag": { icon: ShoppingBag, label: "Bolsa", group: "Personal", words: "compras" },
  gift: { icon: Gift, label: "Regalo", group: "Personal", words: "cumpleaños" },
  cake: { icon: Cake, label: "Pastel", group: "Personal", words: "cumpleaños celebración" },
  "party-popper": { icon: PartyPopper, label: "Fiesta", group: "Personal", words: "celebración evento" },
  coffee: { icon: Coffee, label: "Café", group: "Personal", words: "descanso reunión" },
  utensils: { icon: Utensils, label: "Cubiertos", group: "Personal", words: "comida almuerzo" },
  pizza: { icon: Pizza, label: "Pizza", group: "Personal", words: "comida" },
  apple: { icon: Apple, label: "Manzana", group: "Personal", words: "comida nutrición" },
  "gamepad-2": { icon: Gamepad2, label: "Control", group: "Personal", words: "videojuegos jugar" },
  "dice-5": { icon: Dice5, label: "Dado", group: "Personal", words: "juego probabilidad" },
  headphones: { icon: Headphones, label: "Audífonos", group: "Personal", words: "música podcast" },
  video: { icon: Video, label: "Video", group: "Personal", words: "videollamada grabar" },
  ticket: { icon: Ticket, label: "Boleta", group: "Personal", words: "evento concierto trámite" },
  smile: { icon: Smile, label: "Carita", group: "Personal", words: "feliz ánimo" },
  sun: { icon: Sun, label: "Sol", group: "Personal", words: "día vacaciones" },
  moon: { icon: Moon, label: "Luna", group: "Personal", words: "noche" },
  star: { icon: Star, label: "Estrella", group: "Personal", words: "favorito importante" },
  sparkles: { icon: Sparkles, label: "Destellos", group: "Personal", words: "nuevo especial ia" },
  umbrella: { icon: Umbrella, label: "Sombrilla", group: "Personal", words: "lluvia clima" },
  snowflake: { icon: Snowflake, label: "Copo de nieve", group: "Personal", words: "invierno frío" },
  "flower-2": { icon: Flower2, label: "Flor", group: "Personal", words: "naturaleza jardín" },
  // Salud y deporte
  "heart-pulse": { icon: HeartPulse, label: "Pulso", group: "Salud y deporte", words: "salud medicina" },
  stethoscope: { icon: Stethoscope, label: "Estetoscopio", group: "Salud y deporte", words: "médico cita salud" },
  pill: { icon: Pill, label: "Pastilla", group: "Salud y deporte", words: "medicina salud" },
  ear: { icon: Ear, label: "Oído", group: "Salud y deporte", words: "escuchar" },
  dumbbell: { icon: Dumbbell, label: "Pesa", group: "Salud y deporte", words: "gimnasio ejercicio entrenar" },
  bike: { icon: Bike, label: "Bicicleta", group: "Salud y deporte", words: "ciclismo deporte" },
  footprints: { icon: Footprints, label: "Pasos", group: "Salud y deporte", words: "caminar correr" },
  trophy: { icon: Trophy, label: "Trofeo", group: "Salud y deporte", words: "competencia logro meta" },
  medal: { icon: Medal, label: "Medalla", group: "Salud y deporte", words: "logro premio" },
  target: { icon: Target, label: "Diana", group: "Salud y deporte", words: "meta objetivo" },
  waves: { icon: Waves, label: "Olas", group: "Salud y deporte", words: "natación mar playa" },
  // Lugares y viajes
  plane: { icon: Plane, label: "Avión", group: "Lugares y viajes", words: "viaje vuelo vacaciones" },
  car: { icon: Car, label: "Carro", group: "Lugares y viajes", words: "auto vehículo transporte" },
  bus: { icon: Bus, label: "Bus", group: "Lugares y viajes", words: "transporte salida" },
  "train-front": { icon: TrainFront, label: "Tren", group: "Lugares y viajes", words: "transporte metro" },
  "map-pin": { icon: MapPin, label: "Ubicación", group: "Lugares y viajes", words: "lugar sitio" },
  tent: { icon: Tent, label: "Carpa", group: "Lugares y viajes", words: "campamento salida" },
  "building-2": { icon: Building2, label: "Edificio", group: "Lugares y viajes", words: "oficina empresa ciudad" },
  // Trabajo y dinero
  briefcase: { icon: Briefcase, label: "Maletín", group: "Trabajo y dinero", words: "trabajo empleo negocio" },
  wallet: { icon: Wallet, label: "Billetera", group: "Trabajo y dinero", words: "dinero finanzas" },
  "credit-card": { icon: CreditCard, label: "Tarjeta", group: "Trabajo y dinero", words: "pago banco" },
  "piggy-bank": { icon: PiggyBank, label: "Alcancía", group: "Trabajo y dinero", words: "ahorro dinero" },
  banknote: { icon: Banknote, label: "Billete", group: "Trabajo y dinero", words: "dinero pago" },
  mail: { icon: Mail, label: "Correo", group: "Trabajo y dinero", words: "email mensaje" },
  phone: { icon: Phone, label: "Teléfono", group: "Trabajo y dinero", words: "llamada" },
  package: { icon: Package, label: "Paquete", group: "Trabajo y dinero", words: "envío entrega proyecto" },
  folder: { icon: Folder, label: "Carpeta", group: "Trabajo y dinero", words: "archivos" },
  archive: { icon: Archive, label: "Archivo", group: "Trabajo y dinero", words: "guardar" },
  // Símbolos
  calendar: { icon: Calendar, label: "Calendario", group: "Símbolos", words: "fecha evento" },
  "calendar-days": { icon: CalendarDays, label: "Agenda", group: "Símbolos", words: "fecha evento semana" },
  clock: { icon: Clock, label: "Reloj", group: "Símbolos", words: "hora tiempo" },
  "alarm-clock": { icon: AlarmClock, label: "Despertador", group: "Símbolos", words: "recordatorio alarma" },
  bell: { icon: Bell, label: "Campana", group: "Símbolos", words: "aviso recordatorio" },
  flag: { icon: Flag, label: "Bandera", group: "Símbolos", words: "importante hito meta" },
  pin: { icon: Pin, label: "Chincheta", group: "Símbolos", words: "fijar importante entrega" },
  bookmark: { icon: Bookmark, label: "Marcador", group: "Símbolos", words: "guardar" },
  tag: { icon: Tag, label: "Etiqueta", group: "Símbolos" },
  "circle-check": { icon: CircleCheck, label: "Hecho", group: "Símbolos", words: "listo completado" },
  "list-checks": { icon: ListChecks, label: "Lista de chequeo", group: "Símbolos", words: "tareas pasos" },
  "list-todo": { icon: ListTodo, label: "Pendientes", group: "Símbolos", words: "tareas por hacer" },
  "circle-help": { icon: CircleHelp, label: "Pregunta", group: "Símbolos", words: "duda" },
  info: { icon: Info, label: "Información", group: "Símbolos" },
  "triangle-alert": { icon: TriangleAlert, label: "Alerta", group: "Símbolos", words: "advertencia cuidado" },
};

/** Emojis antiguos (datos ya guardados, ejemplos) → clave de ícono. */
const EMOJI: Record<string, string> = {
  "➗": "divide", "⚛": "atom", "🧪": "flask-conical", "💬": "message-circle", "🏛": "landmark", "📖": "book-open",
  "🌿": "leaf", "💭": "brain", "📝": "notebook-pen", "📘": "book", "📗": "book", "📕": "book", "📙": "book", "📚": "library",
  "🚀": "rocket", "🌐": "globe", "🏋": "dumbbell", "✈": "plane", "🎨": "palette", "🛂": "ticket", "🛒": "shopping-cart",
  "📄": "file-text", "🦋": "feather", "🗳": "landmark", "🖋": "pen-line", "📋": "clipboard-list", "💡": "lightbulb",
  "🎓": "graduation-cap", "📌": "pin", "🎯": "target", "📅": "calendar", "🗓": "calendar-days", "🎉": "party-popper",
  "⚖": "scale", "⏳": "hourglass", "⏱": "clock", "⏰": "alarm-clock", "🙋": "user", "🙂": "smile", "🗂": "folder",
  "🖼": "camera", "🕯": "flame", "🔲": "shapes", "📦": "package", "📈": "chart-line", "🏫": "school", "🎈": "party-popper",
  "🌴": "sun", "✏": "pencil", "🧩": "puzzle", "🚩": "flag", "🚌": "bus", "🕰": "history", "🔔": "bell", "📬": "mail",
  "📜": "scroll-text", "🐞": "bug", "🏁": "flag", "🎲": "dice-5", "🎤": "mic", "🎙": "mic", "🌾": "sprout", "🌱": "sprout",
  "🌡": "thermometer", "🌍": "earth", "🌎": "earth", "🌏": "earth", "🌊": "waves", "⛓": "variable", "⚡": "zap", "⚙": "cog",
  "🧭": "compass", "🧬": "dna", "🧫": "microscope", "🧲": "magnet", "💼": "briefcase", "🚘": "car", "🚗": "car",
  "📐": "ruler", "📏": "ruler", "🔬": "microscope", "🔭": "telescope", "💻": "laptop", "🖥": "monitor", "📱": "smartphone",
  "🎵": "music", "🎶": "music", "🎸": "guitar", "📷": "camera", "🎬": "clapperboard", "🏃": "footprints", "⚽": "trophy",
  "🏆": "trophy", "🥇": "medal", "❤": "heart", "⭐": "star", "✨": "sparkles", "🏠": "house", "💰": "wallet", "💵": "banknote",
  "📊": "chart-column", "🧮": "calculator", "🔢": "calculator", "📓": "notebook", "📒": "notebook", "🗒": "sticky-note",
  "✅": "circle-check", "☑": "list-checks", "❓": "circle-help", "⚠": "triangle-alert", "🧠": "brain", "🍎": "apple",
  "☕": "coffee", "🍕": "pizza", "🎮": "gamepad-2", "🐶": "dog", "🐱": "cat", "🏥": "stethoscope", "💊": "pill",
  "🌳": "tree-pine", "🌲": "tree-pine", "🔥": "flame", "💧": "droplet", "☀": "sun", "🌙": "moon", "🎁": "gift", "🎂": "cake",
};

/** Clave de ícono para un valor guardado (clave, emoji antiguo o vacío). */
export function iconKey(value: string | undefined | null, fallback = "circle-help") {
  const v = (value ?? "").trim();
  if (!v) return fallback;
  if (ICONS[v]) return v;
  const base = v.replace(/️/g, "");
  return EMOJI[base] ?? EMOJI[Array.from(base)[0] ?? ""] ?? fallback;
}

/** ¿El valor ya es una clave del catálogo? (para no mostrarla como texto en notificaciones, títulos, etc.) */
export const isIconKey = (value?: string | null) => Boolean(value && ICONS[value]);

/** Ícono de la app. `value` puede ser una clave, un emoji antiguo o vacío (usa `fallback`). */
export function AppIcon({ value, fallback, className, strokeWidth = 1.9, label }: {
  value?: string | null;
  fallback?: string;
  className?: string;
  strokeWidth?: number;
  /** Texto accesible; sin él, el ícono es decorativo. */
  label?: string;
}) {
  const def = ICONS[iconKey(value, fallback)] ?? ICONS["circle-help"];
  const Icon = def.icon;
  return <Icon className={clsx("size-[1.1em] shrink-0", className)} strokeWidth={strokeWidth} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} />;
}

/**
 * Ícono en línea con texto («[ícono] Matemáticas»). Sin valor ni `fallback`, no pinta nada
 * (p. ej. tareas sin ícono propio).
 */
export function Ico({ value, fallback, className }: { value?: string | null; fallback?: string; className?: string }) {
  if (!value && !fallback) return null;
  return <AppIcon value={value} fallback={fallback} className={clsx("mr-[0.35em] inline-block align-[-0.15em]", className)} />;
}

/** Clave de ícono → emoji equivalente (el primero que la usa en EMOJI). */
const KEY_EMOJI: Record<string, string> = Object.entries(EMOJI).reduce<Record<string, string>>((acc, [emoji, key]) => {
  acc[key] ??= emoji;
  return acc;
}, {});

/**
 * Para texto plano (notificaciones push, títulos en Google Calendar), donde no se pueden pintar íconos de Lucide:
 * una clave del catálogo se vuelve su emoji equivalente (o nada); un emoji antiguo se deja igual.
 */
export function emojiFor(value?: string | null) {
  const v = (value ?? "").trim();
  if (!v) return "";
  return ICONS[v] ? KEY_EMOJI[v] ?? "" : v;
}
