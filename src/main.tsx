import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CALORIES_PER_KG,
  CALORIES_PER_POUND,
  calculateLoggedNutrition,
  calculateTotals,
  convertConsumedQuantityToServingQuantity,
  fromLb,
  round,
} from "./shared/calculations";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChefHat,
  KeyRound,
  LogOut,
  Mail,
  Menu,
  Plus,
  Scale,
  Settings,
  Target,
  Users,
  Utensils,
  X,
} from "lucide-react";
import "./styles.css";

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  proteinGoalG: number | null;
  calorieGoalValue: number | null;
  calorieGoalType: "manual" | "goal-based";
  preferredWeightUnit: "lb" | "kg";
  timezone: string;
};
type Food = {
  id: string;
  ownerUserId: string;
  description: string;
  servingQuantity: number;
  servingUnit: string;
  servingGrams: number | null;
  proteinG: number;
  fatG: number;
  carbohydrateG: number;
  calories: number;
  visibility: "private" | "public";
  notes?: string | null;
};
type MealItem = {
  foodId: string;
  foodDescription?: string;
  quantity: number;
  quantityUnit: string;
  servingQuantity?: number;
  servingUnit?: string;
  servingGrams?: number | null;
  proteinG?: number;
  fatG?: number;
  carbohydrateG?: number;
  calories?: number;
};
type SavedMeal = {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string;
  visibility: "private" | "public";
  items: MealItem[];
};
type MacroSummary = {
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbohydrateG?: number;
};
type ActiveGoal = {
  plan: unknown | null;
  maintenance?: {
    maintenanceCalories: number;
    estimatedMaintenanceCalories: number;
    source: string;
    start?: string | null;
    end?: string | null;
    calorieStart?: string | null;
    calorieEnd?: string | null;
    days?: number | null;
    windowDays?: number | null;
    loggedDayCount?: number | null;
    averageLoggedCalories?: number | null;
    estimatedPeriodCalories?: number | null;
    weightChangeLb?: number | null;
    dailyWeightAdjustment?: number | null;
    message?: string;
  } | null;
  calculation?: {
    days: number;
    weightChangeLb: number;
    dailyAdjustment: number;
    targetCalories: number;
    weeklyChangeLb: number;
    unrealistic?: boolean;
  } | null;
  message?: string;
};
type DailyGoal = {
  id: string;
  label: string;
  goalType: string;
  minutes: number | null;
  active: boolean;
  completed?: boolean;
};
type LocalUserOption = {
  id: string;
  email: string;
  name: string;
};
type FriendUser = {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
};
type FriendInvite = {
  id: string;
  email?: string;
  inviter?: FriendUser;
  status?: string;
  expiresAt: string;
  createdAt: string;
};
type FriendsResponse = {
  friends: FriendUser[];
  sharedWith: FriendUser[];
  receivedInvites: FriendInvite[];
  sentInvites: FriendInvite[];
};
type HelpBubble = {
  title: string;
  body: string;
};

const routes = [
  "app",
  "foods",
  "saved-meals",
  "reports",
  "goals",
  "friends",
  "settings",
  "login",
] as const;
type Route = (typeof routes)[number];

const today = () => new Date().toLocaleDateString("en-CA");
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString("en-CA");
};

function foodNutrition(food: Food | MealItem) {
  if (!food.servingQuantity || food.calories == null) return null;
  return {
    servingQuantity: food.servingQuantity,
    servingUnit: food.servingUnit,
    servingGrams: food.servingGrams ?? null,
    proteinG: food.proteinG ?? 0,
    fatG: food.fatG ?? 0,
    carbohydrateG: food.carbohydrateG ?? 0,
    calories: food.calories,
  };
}

function formatFoodServing(food: Food | MealItem) {
  if (!food.servingQuantity || !food.servingUnit) return "";
  return `${food.servingQuantity}${food.servingUnit}`;
}

function formatFoodMacros(food: MacroSummary) {
  return `${Math.round(food.calories ?? 0)}cal - ${Math.round(food.proteinG ?? 0)}P ${Math.round(food.fatG ?? 0)}F ${Math.round(food.carbohydrateG ?? 0)}C`;
}

function formatFoodSummary(food: Food | MealItem) {
  const serving = formatFoodServing(food);
  return serving ? `${serving} - ${formatFoodMacros(food)}` : formatFoodMacros(food);
}

function mealItemNutrition(item: MealItem) {
  const food = foodNutrition(item);
  if (!food) return { proteinG: 0, fatG: 0, carbohydrateG: 0, calories: 0 };
  try {
    const servingQuantity = convertConsumedQuantityToServingQuantity(
      food,
      item.quantity,
      item.quantityUnit,
    );
    return calculateLoggedNutrition(food, servingQuantity);
  } catch {
    return food;
  }
}

function mealItemCalories(item: MealItem) {
  return mealItemNutrition(item).calories;
}

function savedMealTotals(meal: SavedMeal) {
  return calculateTotals(meal.items.map(mealItemNutrition));
}

function savedMealCalories(meal: SavedMeal) {
  return Math.round(savedMealTotals(meal).calories);
}

const timezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const routeHelp: Partial<Record<Exclude<Route, "login">, HelpBubble[]>> = {
  app: [
    {
      title: "Log food first",
      body: "Daily Diary starts with food and saved meal entry because logging meals is the main job here.",
    },
    {
      title: "Review the day",
      body: "Calories, protein, movement, workouts, supplements, weight, and each food entry are collected below the entry tools.",
    },
  ],
  foods: [
    {
      title: "Food records",
      body: "Create foods with serving size, calories, and macros so diary and meal logging can show useful numbers everywhere.",
    },
  ],
  "saved-meals": [
    {
      title: "Meal prep",
      body: "Build reusable meals from foods. The list shows meal totals and each ingredient's scaled calories and macros.",
    },
  ],
  reports: [
    {
      title: "Progress view",
      body: "Reports summarize logged days, weights, calories, and maintenance estimates for the selected date range.",
    },
  ],
  goals: [
    {
      title: "Calculated calories",
      body: "Goals combine weight entries and diary data to estimate maintenance and daily calorie targets.",
    },
  ],
  friends: [
    {
      title: "Sharing access",
      body: "Invite someone by email. When they accept, they can view your diary and reports read-only.",
    },
    {
      title: "Viewing friends",
      body: "Use View read-only to switch Daily Diary and Reports into a friend's data without changing it.",
    },
  ],
  settings: [
    {
      title: "Daily goals",
      body: "Choose which daily goals appear in the diary and save all settings together with one Save Settings button.",
    },
  ],
};

function routeFromPath(pathname: string): Route {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/login") return "login";
  if (normalized === "/" || normalized === "/app") return "app";
  if (normalized.startsWith("/app/")) {
    const route = normalized.slice("/app/".length).split("/")[0];
    if (routes.includes(route as Route) && route !== "login")
      return route as Route;
  }
  return "app";
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "The API did not return JSON. Run the app with Wrangler Pages preview so Cloudflare Functions are available.",
    );
  }
  const data = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(data.error?.message ?? "Request failed.");
  return data;
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>(() =>
    routeFromPath(location.pathname),
  );
  const [message, setMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewingFriend, setViewingFriend] = useState<FriendUser | null>(null);
  const [dismissedHelp, setDismissedHelp] = useState<string[]>([]);

  useEffect(() => {
    api<{ ok: boolean; user: User }>("/me")
      .then((res) => {
        setUser(res.user);
        const currentRoute = routeFromPath(location.pathname);
        setRoute(currentRoute === "login" ? "app" : currentRoute);
        api<{ dismissed: string[] }>("/help-dismissals")
          .then((help) => setDismissedHelp(help.dismissed))
          .catch(() => setDismissedHelp([]));
      })
      .catch(() => setRoute("login"));
  }, []);

  function navigate(next: Route) {
    setRoute(next);
    setMobileMenuOpen(false);
    history.replaceState(
      null,
      "",
      next === "login" ? "/login" : next === "app" ? "/app" : `/app/${next}`,
    );
  }

  async function requestLoginCode(email: string) {
    await api<{ ok: boolean }>("/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async function verifyLoginCode(email: string, code: string) {
    const res = await api<{ ok: boolean; user: User }>("/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    setUser(res.user);
    api<{ dismissed: string[] }>("/help-dismissals")
      .then((help) => setDismissedHelp(help.dismissed))
      .catch(() => setDismissedHelp([]));
    if (new URLSearchParams(location.search).has("invite")) {
      setRoute("friends");
      setMobileMenuOpen(false);
    } else {
      navigate("app");
    }
  }

  async function devLogin(email: string) {
    const res = await api<{ ok: boolean; user: User }>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setUser(res.user);
    api<{ dismissed: string[] }>("/help-dismissals")
      .then((help) => setDismissedHelp(help.dismissed))
      .catch(() => setDismissedHelp([]));
    if (new URLSearchParams(location.search).has("invite")) {
      setRoute("friends");
      setMobileMenuOpen(false);
    } else {
      navigate("app");
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
    } finally {
      setUser(null);
      setViewingFriend(null);
      setDismissedHelp([]);
      navigate("login");
    }
  }

  async function dismissHelp(helpKey: string) {
    setDismissedHelp((current) =>
      current.includes(helpKey) ? current : [...current, helpKey],
    );
    api<{ dismissed: string[] }>("/help-dismissals", {
      method: "POST",
      body: JSON.stringify({ helpKey }),
    })
      .then((res) => setDismissedHelp(res.dismissed))
      .catch(() => {});
  }

  if (!user || route === "login")
    return (
      <Login
        onRequestCode={requestLoginCode}
        onVerifyCode={verifyLoginCode}
        onDevLogin={devLogin}
        message={message}
        setMessage={setMessage}
      />
    );

  const page = {
    app: <Dashboard user={user} viewingUser={viewingFriend} onNavigate={navigate} />,
    foods: <Foods user={user} viewingUser={viewingFriend} />,
    "saved-meals": <SavedMeals user={user} viewingUser={viewingFriend} />,
    reports: <Reports user={user} viewingUser={viewingFriend} />,
    goals: <Goals user={user} viewingUser={viewingFriend} />,
    friends: (
      <FriendsPage
        viewingUser={viewingFriend}
        setViewingUser={setViewingFriend}
      />
    ),
    settings: (
      <SettingsPage
        user={user}
        viewingUser={viewingFriend}
        setUser={setUser}
        onLogout={logout}
      />
    ),
  }[route] ?? <Dashboard user={user} onNavigate={navigate} />;

  return (
    <div className="shell">
      <header className="mobile-topbar">
        <div className="brand">
          <Activity size={20} /> Macro Tracker
        </div>
        <button
          className="ghost icon-button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
      </header>
      <aside className={mobileMenuOpen ? "nav open" : "nav"}>
        <div className="brand">
          <Activity size={22} /> Macro Tracker
        </div>
        <button
          className={route === "app" ? "active" : ""}
          onClick={() => navigate("app")}
        >
          <CalendarDays size={18} /> Daily Diary
        </button>
        <button
          className={route === "foods" ? "active" : ""}
          onClick={() => navigate("foods")}
        >
          <Utensils size={18} /> Foods
        </button>
        <button
          className={route === "saved-meals" ? "active" : ""}
          onClick={() => navigate("saved-meals")}
        >
          <ChefHat size={18} /> Meals
        </button>
        <button
          className={route === "reports" ? "active" : ""}
          onClick={() => navigate("reports")}
        >
          <BarChart3 size={18} /> Reports
        </button>
        <button
          className={route === "goals" ? "active" : ""}
          onClick={() => navigate("goals")}
        >
          <Target size={18} /> Goals
        </button>
        <button
          className={route === "friends" ? "active" : ""}
          onClick={() => navigate("friends")}
        >
          <Users size={18} /> Friends
        </button>
        <button
          className={route === "settings" ? "active" : ""}
          onClick={() => navigate("settings")}
        >
          <Settings size={18} /> Settings
        </button>
        <span className="signed-in">{user.email}</span>
      </aside>
      <main>
        {viewingFriend && (
          <div className="viewing-banner">
            <span>
              Viewing read-only data for <strong>{viewingFriend.name}</strong>
            </span>
            <button className="ghost" onClick={() => setViewingFriend(null)}>
              View my data
            </button>
          </div>
        )}
        <HelpBubbles
          route={route}
          dismissed={dismissedHelp}
          onDismiss={dismissHelp}
        />
        {page}
      </main>
    </div>
  );
}

function HelpBubbles({
  route,
  dismissed,
  onDismiss,
}: {
  route: Route;
  dismissed: string[];
  onDismiss: (helpKey: string) => void;
}) {
  if (route === "login") return null;
  const bubbles = routeHelp[route] ?? [];
  const visible = bubbles
    .map((bubble, index) => ({
      ...bubble,
      key: `${route}:${index}`,
    }))
    .filter((bubble) => !dismissed.includes(bubble.key));
  if (!visible.length) return null;
  return (
    <div className="help-bubbles" aria-label="Page help">
      {visible.map((bubble) => (
        <div className="help-bubble" key={bubble.key}>
          <button
            className="ghost icon-button"
            onClick={() => onDismiss(bubble.key)}
            aria-label="Dismiss help"
          >
            <X size={16} />
          </button>
          <strong>{bubble.title}</strong>
          <p>{bubble.body}</p>
        </div>
      ))}
    </div>
  );
}

function Login({
  onRequestCode,
  onVerifyCode,
  onDevLogin,
  message,
  setMessage,
}: {
  onRequestCode: (email: string) => Promise<void>;
  onVerifyCode: (email: string, code: string) => Promise<void>;
  onDevLogin: (email: string) => Promise<void>;
  message: string;
  setMessage: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [devAuthAvailable, setDevAuthAvailable] = useState(false);
  const [devUsers, setDevUsers] = useState<LocalUserOption[]>([]);
  const localDevHost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname,
  );

  useEffect(() => {
    if (!localDevHost) return;
    api<{ ok: boolean; users: LocalUserOption[] }>("/auth/dev-users")
      .then((res) => {
        setDevUsers(res.users);
        setDevAuthAvailable(true);
      })
      .catch(() => {
        setDevUsers([]);
        setDevAuthAvailable(false);
      });
  }, [localDevHost]);

  return (
    <main className="login-page">
      <form
        className="login-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setMessage("");
          try {
            if (codeSent) {
              await onVerifyCode(email, code);
            } else {
              await onRequestCode(email);
              setCodeSent(true);
            }
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Login failed.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h1>Macro Tracker</h1>
        <p>{codeSent ? `Enter the code sent to ${email}.` : "Enter your email to get a 6 digit login code."}</p>
        {devAuthAvailable && devUsers.length > 0 && !codeSent && (
          <label className="field">
            <span>Local user</span>
            <select
              value={devUsers.some((user) => user.email === email) ? email : ""}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
            >
              <option value="">Choose a local user</option>
              {devUsers.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.name === user.email
                    ? user.email
                    : `${user.name} (${user.email})`}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={codeSent || submitting}
          required
        />
        {codeSent && (
          <input
            name="code"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            pattern="\d{6}"
            autoComplete="one-time-code"
            placeholder="123456"
            required
          />
        )}
        <button type="submit" disabled={submitting}>
          {codeSent ? <KeyRound size={16} /> : <Mail size={16} />}
          {submitting
            ? codeSent
              ? "Verifying..."
              : "Sending..."
            : codeSent
              ? "Verify code"
              : "Send code"}
        </button>
        {devAuthAvailable && !codeSent && (
          <button
            type="button"
            className="ghost"
            disabled={submitting}
            onClick={async (event) => {
              if (!event.currentTarget.form?.reportValidity()) return;
              setSubmitting(true);
              setMessage("");
              try {
                await onDevLogin(email);
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "Local login failed.",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <KeyRound size={16} />
            Local login
          </button>
        )}
        {codeSent && (
          <button
            type="button"
            className="ghost"
            disabled={submitting}
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setMessage("");
            }}
          >
            Use a different email
          </button>
        )}
        {message && <p className="error-text">{message}</p>}
      </form>
    </main>
  );
}

function ownerQuery(viewingUser?: FriendUser | null) {
  return viewingUser ? `ownerUserId=${encodeURIComponent(viewingUser.id)}` : "";
}

function withOwner(path: string, viewingUser?: FriendUser | null) {
  const query = ownerQuery(viewingUser);
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

function Dashboard({
  user,
  viewingUser,
  onNavigate,
}: {
  user: User;
  viewingUser?: FriendUser | null;
  onNavigate?: (route: Route) => void;
}) {
  const [date, setDate] = useState(today());
  const [day, setDay] = useState<any>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [mealLabel, setMealLabel] = useState("Other");
  const [foodSearch, setFoodSearch] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [foodQuantity, setFoodQuantity] = useState("");
  const [foodQuantityUnit, setFoodQuantityUnit] = useState("g");
  const [addingFood, setAddingFood] = useState(false);
  const [activeGoal, setActiveGoal] = useState<any>(null);
  const [popupMessage, setPopupMessage] = useState("");
  const [status, setStatus] = useState("");
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState(user.preferredWeightUnit);
  const [savingWeight, setSavingWeight] = useState(false);
  const readOnly = Boolean(viewingUser);
  const load = () => {
    api(withOwner(`/days/${date}`, viewingUser)).then(setDay);
    if (readOnly) {
      setMeals([]);
    } else {
      api<{ meals: SavedMeal[] }>("/saved-meals?scope=all").then((res) =>
        setMeals(res.meals),
      );
    }
    api(withOwner("/goal-plans/active", viewingUser))
      .then(setActiveGoal)
      .catch(() => setActiveGoal(null));
  };
  useEffect(load, [date, viewingUser?.id]);
  useEffect(() => {
    setWeightValue(day?.weight ? String(day.weight.weight_value) : "");
    setWeightUnit(day?.weight?.weight_unit ?? user.preferredWeightUnit);
  }, [day?.weight, user.preferredWeightUnit]);
  useEffect(() => {
    if (!popupMessage) return;
    const timeout = window.setTimeout(() => setPopupMessage(""), 2000);
    return () => window.clearTimeout(timeout);
  }, [popupMessage]);
  useEffect(() => {
    const query = foodSearch.trim();
    if (!query || selectedFood?.description === foodSearch) {
      setFoods([]);
      return;
    }
    let ignore = false;
    api<{ foods: Food[] }>(
      `/foods?scope=all&search=${encodeURIComponent(query)}`,
    ).then((res) => {
      if (!ignore) setFoods(res.foods);
    });
    return () => {
      ignore = true;
    };
  }, [foodSearch, selectedFood]);

  const totals = day?.totals;
  const calorieGoal =
    user.calorieGoalType === "goal-based"
      ? activeGoal?.calculation?.targetCalories
      : user.calorieGoalValue;
  const calorieGoalDelta = calorieGoal
    ? Math.round(calorieGoal - (totals?.calories ?? 0))
    : null;
  const calorieGoalStatus =
    calorieGoalDelta == null
      ? null
      : {
          text:
            calorieGoalDelta >= 0
              ? `${calorieGoalDelta} calories remaining`
              : `${Math.abs(calorieGoalDelta)} calories over goal`,
          tone: calorieGoalDelta >= 0 ? "remaining" : "over",
        };
  const proteinGoalStatus = day?.proteinGoal
    ? {
        text: day.proteinGoal.met
          ? `Protein goal met: ${Math.round(day.proteinGoal.actualG)}g of ${Math.round(day.proteinGoal.goalG)}g`
          : `${Math.round(day.proteinGoal.remainingG)}g protein remaining`,
        tone: day.proteinGoal.met ? "met" : "remaining",
      }
    : { text: "Add a protein goal in settings.", tone: "neutral" };
  const calorieGoalTooltip = activeGoal?.plan
    ? [
        `Current goal: ${activeGoal.plan.goal_weight_value} ${activeGoal.plan.goal_weight_unit} by ${activeGoal.plan.target_date}`,
        activeGoal.goalPace
          ? `Needed average: ${activeGoal.goalPace.direction === "maintain" ? "maintain weight" : `${activeGoal.goalPace.direction} ${round(fromLb(Math.abs(activeGoal.goalPace.weeklyChangeLb), user.preferredWeightUnit), 2)} ${user.preferredWeightUnit}/week`} from ${activeGoal.goalPace.latestWeight.value} ${activeGoal.goalPace.latestWeight.unit} on ${activeGoal.goalPace.latestWeight.date}.`
          : "Add a current weight to calculate the weekly pace needed.",
      ].join("\n")
    : undefined;
  const savedWeightValue = day?.weight ? String(day.weight.weight_value) : "";
  const savedWeightUnit = day?.weight?.weight_unit ?? user.preferredWeightUnit;
  const weightChanged =
    weightValue !== savedWeightValue || weightUnit !== savedWeightUnit;
  const canAddFood = Boolean(
    selectedFood && Number(foodQuantity) > 0 && !addingFood,
  );
  const canSaveWeight = Number(weightValue) > 0 && weightChanged && !savingWeight;
  const quantityUnitOptions = ["g", "oz", "lb", "kg"];
  if (selectedFood && !quantityUnitOptions.includes(selectedFood.servingUnit))
    quantityUnitOptions.push(selectedFood.servingUnit);
  return (
    <section>
      {popupMessage && (
        <div className="toast" role="status">
          <span>{popupMessage}</span>
          <button
            className="ghost icon-button"
            onClick={() => setPopupMessage("")}
            aria-label="Dismiss notification"
          >
            x
          </button>
        </div>
      )}
      <Header
        title={viewingUser ? `${viewingUser.name}'s Daily Diary` : "Daily Diary"}
        icon={<CalendarDays />}
      />
      <div className="toolbar">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <button onClick={() => setDate(today())}>Today</button>
      </div>
      {!readOnly && (
      <div className="two-col">
        <Panel title="Log Food">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedFood || !canAddFood) return;
              setAddingFood(true);
              try {
                await api("/diary-items", {
                  method: "POST",
                  body: JSON.stringify({
                    foodId: selectedFood.id,
                    eatenDate: date,
                    mealLabel,
                    quantity: Number(foodQuantity),
                    quantityUnit: foodQuantityUnit,
                  }),
                });
                setPopupMessage(
                  `${selectedFood.description} added for ${date} and ${mealLabel}`,
                );
                setSelectedFood(null);
                setFoodSearch("");
                setFoods([]);
                setFoodQuantity("");
                setFoodQuantityUnit("g");
                load();
              } finally {
                setAddingFood(false);
              }
            }}
          >
            <div className="food-search">
              <input
                name="foodSearch"
                placeholder="Search food"
                value={foodSearch}
                onChange={(event) => {
                  setFoodSearch(event.target.value);
                  setSelectedFood(null);
                }}
                autoComplete="off"
              />
              {foods.length > 0 && (
                <div className="food-results">
                  {foods.map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setSelectedFood(food);
                        setFoodSearch(food.description);
                        setFoodQuantityUnit(food.servingUnit);
                        setFoods([]);
                      }}
                    >
                      <span>{food.description}</span>
                      <small>{formatFoodSummary(food)}</small>
                    </button>
                  ))}
                </div>
              )}
              {selectedFood && (
                <div className="selected-food">
                  Selected: <strong>{selectedFood.description}</strong>
                </div>
              )}
            </div>
            <div className="row">
              <input
                name="quantity"
                type="number"
                step="0.01"
                placeholder="Qty"
                value={foodQuantity}
                onChange={(event) => setFoodQuantity(event.target.value)}
                required
              />
              <select
                name="quantityUnit"
                value={foodQuantityUnit}
                onChange={(event) => setFoodQuantityUnit(event.target.value)}
                aria-label="Quantity unit"
              >
                {quantityUnitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            {selectedFood && (
              <small>
                Food serving: {formatFoodSummary(selectedFood)}
              </small>
            )}
            <MealLabelPicker value={mealLabel} onChange={setMealLabel} />
            <button disabled={!canAddFood}>
              <Plus size={16} /> {addingFood ? "Adding..." : "Add food"}
            </button>
          </form>
        </Panel>
        <Panel title="Add Saved Meal">
          <MealLabelPicker value={mealLabel} onChange={setMealLabel} />
          <div className="list compact">
            {meals.map((meal) => (
              <button
                key={meal.id}
                onClick={async () => {
                  await api(`/saved-meals/${meal.id}/add-to-diary`, {
                    method: "POST",
                    body: JSON.stringify({ eatenDate: date, mealLabel }),
                  });
                  setPopupMessage(
                    `${meal.name} added for ${date} and ${mealLabel}`,
                  );
                  load();
                }}
              >
                <span>{meal.name}</span>
                <small>{savedMealCalories(meal)}cal</small>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      )}
      {totals && (
        <div className="metric-grid today-metrics">
          <MacroMetric
            label="Protein"
            grams={totals.proteinG}
            percent={totals.proteinPercent}
            goalStatus={proteinGoalStatus}
          />
          <MacroMetric
            label="Fat"
            grams={totals.fatG}
            percent={totals.fatPercent}
          />
          <MacroMetric
            label="Carbs"
            grams={totals.carbohydrateG}
            percent={totals.carbohydratePercent}
          />
          <div className="metric calorie-metric">
            <span>Calories</span>
            <strong>{Math.round(totals.calories)}</strong>
            {calorieGoalStatus ? (
              <small
                className={`calorie-goal ${calorieGoalStatus.tone}`}
                title={calorieGoalTooltip}
              >
                {calorieGoalStatus.text}
              </small>
            ) : (
              <small className="calorie-goal neutral">
                Add a calorie goal in settings.
              </small>
            )}
          </div>
        </div>
      )}
      <Panel title={`Diary for ${date}`}>
        <div className="list">
          <div className="list-row diary-weight">
            <span>
              <strong>Weight</strong>
              <small>
                {day?.weight
                  ? `${day.weight.weight_value} ${day.weight.weight_unit}`
                  : "No weight logged"}
              </small>
            </span>
            {!readOnly && (
            <form
              className="compact-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!canSaveWeight) return;
                setSavingWeight(true);
                try {
                  await api("/weight", {
                    method: "POST",
                    body: JSON.stringify({
                      entryDate: date,
                      weightValue: Number(weightValue),
                      weightUnit,
                    }),
                  });
                  load();
                  onNavigate?.("reports");
                } finally {
                  setSavingWeight(false);
                }
              }}
            >
              <input
                name="weightValue"
                type="number"
                step="0.1"
                placeholder="Weight"
                value={weightValue}
                onChange={(event) => setWeightValue(event.target.value)}
                required
              />
              <select
                name="weightUnit"
                value={weightUnit}
                onChange={(event) =>
                  setWeightUnit(event.target.value as "lb" | "kg")
                }
              >
                <option>lb</option>
                <option>kg</option>
              </select>
              <button disabled={!canSaveWeight}>
                <Scale size={16} /> {savingWeight ? "Saving..." : "Save"}
              </button>
            </form>
            )}
          </div>
          {day?.dailyGoals?.length > 0 && (
            <div className="diary-goals-block">
              <strong>Daily diary goals</strong>
              <div className="daily-goals">
                {day.dailyGoals.map((goal: DailyGoal) => (
                  <label key={goal.id} className="daily-goal">
                    <input
                      type="checkbox"
                      checked={Boolean(goal.completed)}
                      disabled={readOnly}
                      onChange={async (event) => {
                        if (readOnly) return;
                        await api("/daily-goal-completions", {
                          method: "POST",
                          body: JSON.stringify({
                            goalId: goal.id,
                            entryDate: date,
                            completed: event.target.checked,
                          }),
                        });
                        setPopupMessage("Changes saved");
                        load();
                      }}
                    />
                    <span>{dailyGoalLabel(goal)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {day?.items?.map((item: any) => (
            <div className="list-row" key={item.id}>
              <span>
                <strong>{item.foodDescription}</strong>
                <small>
                  {item.meal_label ?? "Other"} · {item.quantity}
                  {item.quantity_unit}
                </small>
              </span>
              <span>
                {Math.round(item.calories)}cal · {Math.round(item.protein_g)}P {Math.round(item.fat_g)}F {Math.round(item.carbohydrate_g)}C
              </span>
              {!readOnly && (
                <button
                  className="ghost"
                  onClick={async () => {
                    await api(`/diary-items/${item.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>
      {status && <p>{status}</p>}
    </section>
  );
}

function MealLabelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" aria-label="Meal label">
      {["Breakfast", "Lunch", "Dinner", "Snack", "Other"].map((label) => (
        <button
          key={label}
          type="button"
          className={value === label ? "active" : "ghost"}
          onClick={() => onChange(label)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function dailyGoalLabel(goal: DailyGoal) {
  if (goal.goalType === "move") return `Movement ${goal.minutes ?? 10} min`;
  if (goal.goalType === "exercise") return `Workout ${goal.minutes ?? 30} min`;
  if (goal.goalType === "supplements") return "Supplements";
  return goal.label;
}

function Foods({
  user,
  viewingUser,
}: {
  user: User;
  viewingUser?: FriendUser | null;
}) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const readOnly = Boolean(viewingUser);
  const load = (nextSearch = search, nextScope = scope) =>
    api<{ foods: Food[] }>(
      withOwner(
        `/foods?scope=${readOnly ? "mine" : nextScope}&search=${encodeURIComponent(nextSearch)}`,
        viewingUser,
      ),
    ).then((res) => setFoods(res.foods));
  useEffect(() => {
    void load();
  }, [scope, search, viewingUser?.id]);
  useEffect(() => {
    setEditingFood(null);
    setMessage("");
  }, [viewingUser?.id]);
  async function handleFoodSaved(food: Food, action: "added" | "updated") {
    setScope("all");
    setSearch("");
    await load("", "all");
    setEditingFood(null);
    setMessage(`${food.description} was ${action}.`);
  }
  return (
    <section>
      <Header title={viewingUser ? `${viewingUser.name}'s Foods` : "Foods"} icon={<Utensils />} />
      <SearchTools
        scope={scope}
        setScope={setScope}
        search={search}
        setSearch={setSearch}
        showScope={!readOnly}
      />
      {!readOnly && (
      <Panel title={editingFood ? "Modify Food" : "Add Food"}>
        <FoodForm
          food={editingFood}
          onSave={handleFoodSaved}
          onCancel={() => setEditingFood(null)}
        />
      </Panel>
      )}
      {message && <div className="notice success">{message}</div>}
      <Panel title={search ? "Matching Foods" : "Foods"}>
        <div className="list">
          {foods.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              mine={food.ownerUserId === user.id}
              reload={load}
              readOnly={readOnly}
              onCopy={() =>
                setEditingFood({ ...food, id: "", ownerUserId: user.id })
              }
              onModify={() => setEditingFood(food)}
            />
          ))}
        </div>
      </Panel>
    </section>
  );
}

function FoodForm({
  food,
  onSave,
  onCancel,
}: {
  food: Food | null;
  onSave: (food: Food, action: "added" | "updated") => Promise<void>;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");
  const [servingQuantity, setServingQuantity] = useState("");
  const [servingUnit, setServingUnit] = useState("g");
  const [servingGrams, setServingGrams] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [macros, setMacros] = useState({
    proteinG: 0,
    fatG: 0,
    carbohydrateG: 0,
  });
  const [calories, setCalories] = useState("");
  const [caloriesTouched, setCaloriesTouched] = useState(false);
  const [calorieWarning, setCalorieWarning] = useState<{
    entered: number;
    calculated: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const calculatedCalories = Math.round(
    macros.proteinG * 4 + macros.fatG * 9 + macros.carbohydrateG * 4,
  );
  const servingGramsRequired = !["g", "oz", "lb", "kg"].includes(servingUnit);

  useEffect(() => {
    setDescription(food?.description ?? "");
    setServingQuantity(food ? String(food.servingQuantity) : "");
    setServingUnit(food?.servingUnit ?? "g");
    setServingGrams(food?.servingGrams ? String(food.servingGrams) : "");
    setVisibility(food?.visibility ?? "public");
    setMacros({
      proteinG: food?.proteinG ?? 0,
      fatG: food?.fatG ?? 0,
      carbohydrateG: food?.carbohydrateG ?? 0,
    });
    setCalories(food ? String(food.calories) : "");
    setCaloriesTouched(Boolean(food));
    setCalorieWarning(null);
    setError("");
  }, [food]);

  function updateMacro(field: keyof typeof macros, value: string) {
    const parsed = Number(value);
    setMacros((current) => {
      const next = {
        ...current,
        [field]: Number.isFinite(parsed) ? parsed : 0,
      };
      if (!caloriesTouched) {
        setCalories(
          String(
            Math.round(
              next.proteinG * 4 + next.fatG * 9 + next.carbohydrateG * 4,
            ),
          ),
        );
      }
      return next;
    });
    setCalorieWarning(null);
  }

  async function saveFood(caloriesToSave: number) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const isUpdate = Boolean(food?.id);
      const result = await api<{ food: Food }>(
        isUpdate ? `/foods/${food!.id}` : "/foods",
        {
          method: isUpdate ? "PUT" : "POST",
          body: JSON.stringify({
            description,
            servingQuantity: Number(servingQuantity),
            servingUnit,
            servingGrams: servingGrams ? Number(servingGrams) : null,
            proteinG: macros.proteinG,
            fatG: macros.fatG,
            carbohydrateG: macros.carbohydrateG,
            calories: caloriesToSave,
            visibility,
          }),
        },
      );
      setDescription("");
      setServingQuantity("");
      setServingUnit("g");
      setVisibility("public");
      setMacros({ proteinG: 0, fatG: 0, carbohydrateG: 0 });
      setCalories("");
      setCaloriesTouched(false);
      setCalorieWarning(null);
      await onSave(result.food, isUpdate ? "updated" : "added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Food could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setError("");
        const enteredCalories = Number(calories || calculatedCalories);
        if (!Number.isFinite(enteredCalories) || enteredCalories < 0) {
          setError("Calories must be greater than or equal to zero.");
          return;
        }
        if (servingGramsRequired && !servingGrams) {
          setError("Serving grams is required for this unit.");
          return;
        }
        const difference = Math.abs(enteredCalories - calculatedCalories);
        const outsideTolerance =
          calculatedCalories > 0
            ? difference / calculatedCalories > 0.1
            : difference > 0;
        if (outsideTolerance) {
          setCalorieWarning({
            entered: enteredCalories,
            calculated: calculatedCalories,
          });
          return;
        }
        await saveFood(enteredCalories);
      }}
    >
      <label className="field">
        <span>Food name</span>
        <input
          name="description"
          placeholder="enter a food"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
        />
      </label>
      <div className="serving-row">
        <label className="field">
          <span>Serving quantity</span>
          <input
            name="servingQuantity"
            type="number"
            step="0.01"
            placeholder=""
            value={servingQuantity}
            onChange={(event) => setServingQuantity(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Unit of Measure</span>
          <select
            name="servingUnit"
            value={servingUnit}
            onChange={(event) => setServingUnit(event.target.value)}
            required
          >
            <option value="g">g</option>
            <option value="oz">oz</option>
            <option value="lb">lb</option>
            <option value="kg">kg</option>
            <option value="tbsp">tbsp</option>
            <option value="unit">unit</option>
            <option value="package">package</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Serving grams</span>
        <input
          name="servingGrams"
          type="number"
          step="0.01"
          placeholder={
            servingGramsRequired ? "Required" : "Auto for mass units"
          }
          value={servingGrams}
          onChange={(event) => setServingGrams(event.target.value)}
          required={servingGramsRequired}
        />
      </label>
      <div className="quad">
        <label className="field">
          <span>Protein grams</span>
          <input
            name="proteinG"
            type="number"
            step="0.1"
            value={macros.proteinG || ""}
            onChange={(event) => updateMacro("proteinG", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Fat grams</span>
          <input
            name="fatG"
            type="number"
            step="0.1"
            value={macros.fatG || ""}
            onChange={(event) => updateMacro("fatG", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Carb grams</span>
          <input
            name="carbohydrateG"
            type="number"
            step="0.1"
            value={macros.carbohydrateG || ""}
            onChange={(event) =>
              updateMacro("carbohydrateG", event.target.value)
            }
          />
        </label>
        <label className="field">
          <span>Calories</span>
          <input
            name="calories"
            type="number"
            step="1"
            value={calories}
            placeholder={String(calculatedCalories)}
            onChange={(event) => {
              setCalories(event.target.value);
              setCaloriesTouched(true);
              setCalorieWarning(null);
            }}
          />
          <small>Calculated: {calculatedCalories}</small>
        </label>
      </div>
      <label className="field">
        <span>Visibility</span>
        <select
          name="visibility"
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value as "public" | "private")
          }
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      {error && <p className="error-text">{error}</p>}
      {calorieWarning && (
        <div className="warning-box">
          <strong>Calories differ from macros.</strong>
          <span>
            Entered calories are {calorieWarning.entered}; calculated calories
            are {calorieWarning.calculated}.
          </span>
          <div className="form-actions">
            <button
              type="button"
              onClick={() => saveFood(calorieWarning.entered)}
              disabled={saving}
            >
              Use entered calories
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => saveFood(calorieWarning.calculated)}
              disabled={saving}
            >
              Use calculated calories
            </button>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button disabled={saving}>
          <Plus size={16} />{" "}
          {saving ? "Saving..." : food?.id ? "Save changes" : "Add food"}
        </button>
        {food && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function FoodRow({
  food,
  mine,
  reload,
  readOnly,
  onCopy,
  onModify,
}: {
  food: Food;
  mine: boolean;
  reload: () => void;
  readOnly: boolean;
  onCopy: () => void;
  onModify: () => void;
}) {
  return (
    <div className={`list-row${mine ? "" : " other-food"}`}>
      <span>
        <strong>{food.description}</strong>
        <small>
          {formatFoodSummary(food)} - {food.visibility}
        </small>
      </span>
      <span>{food.calories} cal</span>
      {!readOnly && (
      <div className="row-actions">
        {mine ? (
          <button className="ghost" onClick={onModify}>
            Modify
          </button>
        ) : (
          <button className="ghost" onClick={onCopy}>
            Copy
          </button>
        )}
        {mine && (
          <button
            className="ghost"
            onClick={async () => {
              await api(`/foods/${food.id}`, { method: "DELETE" });
              reload();
            }}
          >
            Archive
          </button>
        )}
      </div>
      )}
    </div>
  );
}

function SavedMeals({
  user,
  viewingUser,
}: {
  user: User;
  viewingUser?: FriendUser | null;
}) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const readOnly = Boolean(viewingUser);
  const load = () => {
    api<{ meals: SavedMeal[] }>(
      withOwner(
        `/saved-meals?scope=${readOnly ? "mine" : scope}&search=${encodeURIComponent(search)}`,
        viewingUser,
      ),
    ).then((res) => setMeals(res.meals));
  };
  useEffect(load, [scope, search, viewingUser?.id]);
  useEffect(() => {
    setEditingMeal(null);
  }, [viewingUser?.id]);
  async function handleMealSaved() {
    setScope("all");
    setSearch("");
    await load();
    setEditingMeal(null);
  }
  return (
    <section>
      <Header title={viewingUser ? `${viewingUser.name}'s Saved Meals` : "Saved Meals"} icon={<ChefHat />} />
      <SearchTools
        scope={scope}
        setScope={setScope}
        search={search}
        setSearch={setSearch}
        showScope={!readOnly}
      />
      {!readOnly && (
      <Panel title={editingMeal ? "Modify Meal" : "Create Meal"}>
        <MealForm
          meal={editingMeal}
          onSave={handleMealSaved}
          onCancel={() => setEditingMeal(null)}
        />
      </Panel>
      )}
      <Panel title="Meal List">
        <div className="list">
          {meals.map((meal) => (
            <div className="list-row" key={meal.id}>
              <span>
                <strong>{meal.name}</strong>
                <small>
                  {meal.visibility} - {meal.items.length} items - {formatFoodMacros(savedMealTotals(meal))}
                </small>
                {meal.items.length > 0 && (
                  <div className="meal-food-list">
                    {meal.items.map((item, index) => {
                      const nutrients = mealItemNutrition(item);
                      return (
                        <small key={`${item.foodId}-${index}`} className="meal-food-detail">
                          {item.foodDescription} - {item.quantity}
                          {item.quantityUnit} - {formatFoodMacros(nutrients)}
                        </small>
                      );
                    })}
                  </div>
                )}
              </span>
              {!readOnly && (
              <div className="row-actions">
                {meal.ownerUserId === user.id ? (
                  <button
                    className="ghost"
                    onClick={() => setEditingMeal(meal)}
                  >
                    Modify
                  </button>
                ) : (
                  <button
                    className="ghost"
                    onClick={() =>
                      setEditingMeal({ ...meal, id: "", ownerUserId: user.id })
                    }
                  >
                    Copy
                  </button>
                )}
                {meal.ownerUserId === user.id && (
                  <button
                    className="ghost"
                    onClick={async () => {
                      await api(`/saved-meals/${meal.id}`, {
                        method: "DELETE",
                      });
                      load();
                    }}
                  >
                    Archive
                  </button>
                )}
              </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function MealForm({
  meal,
  onSave,
  onCancel,
}: {
  meal: SavedMeal | null;
  onSave: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [items, setItems] = useState<MealItem[]>([
    { foodId: "", quantity: 1, quantityUnit: "g" },
  ]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meal) {
      setName(meal.name);
      setDescription(meal.description ?? "");
      setVisibility(meal.visibility);
      setItems(
        meal.items.length
          ? meal.items
          : [{ foodId: "", quantity: 1, quantityUnit: "g" }],
      );
    } else {
      setName("");
      setDescription("");
      setVisibility("private");
      setItems([{ foodId: "", quantity: 1, quantityUnit: "g" }]);
    }
  }, [meal]);

  function updateItem(index: number, patch: Partial<MealItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        try {
          const isUpdate = Boolean(meal?.id);
          await api(isUpdate ? `/saved-meals/${meal!.id}` : "/saved-meals", {
            method: isUpdate ? "PUT" : "POST",
            body: JSON.stringify({
              name,
              description,
              visibility,
              items: items
                .filter((item) => item.foodId)
                .map((item) => ({
                  foodId: item.foodId,
                  quantity: item.quantity,
                  quantityUnit: item.quantityUnit,
                })),
            }),
          });
          if (!isUpdate) {
            setName("");
            setDescription("");
            setVisibility("private");
            setItems([{ foodId: "", quantity: 1, quantityUnit: "g" }]);
          }
          await onSave();
        } finally {
          setSaving(false);
        }
      }}
    >
      <input
        name="name"
        placeholder="For example: 2 eggs, 4oz sausage"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        name="description"
        placeholder="Notes"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="meal-items">
        {items.map((item, index) => (
          <div className="meal-item" key={index}>
            <MealFoodPicker
              item={item}
              onChange={(patch) => updateItem(index, patch)}
            />
            <input
              value={item.quantity}
              type="number"
              step="0.01"
              placeholder="Qty"
              required
              onChange={(event) =>
                updateItem(index, { quantity: Number(event.target.value) })
              }
            />
            <select
              value={item.quantityUnit}
              required
              onChange={(event) =>
                updateItem(index, { quantityUnit: event.target.value })
              }
              aria-label="Quantity unit"
            >
              {quantityUnitOptions(item.quantityUnit).map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setItems((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              disabled={items.length === 1}
            >
              Remove
            </button>
            {item.foodId && item.proteinG != null && (
              <small className="meal-item-info">
                {item.quantity}
                {item.quantityUnit} - {formatFoodMacros(mealItemNutrition(item))}
              </small>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ghost"
        onClick={() =>
          setItems((current) => [
            ...current,
            { foodId: "", quantity: 1, quantityUnit: "g" },
          ])
        }
      >
        Add item
      </button>
      <select
        name="visibility"
        value={visibility}
        onChange={(event) =>
          setVisibility(event.target.value as "private" | "public")
        }
      >
        <option value="private">Private</option>
        <option value="public">Public</option>
      </select>
      <div className="form-actions">
        <button>
          <Plus size={16} /> {meal ? "Update meal" : "Create meal"}
        </button>
        {meal && onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function MealFoodPicker({
  item,
  onChange,
}: {
  item: MealItem;
  onChange: (patch: Partial<MealItem>) => void;
}) {
  const [search, setSearch] = useState(item.foodDescription ?? "");
  const [results, setResults] = useState<Food[]>([]);

  useEffect(() => {
    setSearch(item.foodDescription ?? "");
  }, [item.foodId, item.foodDescription]);

  useEffect(() => {
    const query = search.trim();
    if (!query || query === item.foodDescription) {
      setResults([]);
      return;
    }
    let ignore = false;
    api<{ foods: Food[] }>(
      `/foods?scope=all&search=${encodeURIComponent(query)}`,
    ).then((res) => {
      if (!ignore) setResults(res.foods);
    });
    return () => {
      ignore = true;
    };
  }, [search, item.foodDescription]);

  return (
    <div className="food-search meal-food-search">
      <input
        placeholder="Search food"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange({ foodId: "", foodDescription: "" });
        }}
        autoComplete="off"
        required
      />
      {results.length > 0 && (
        <div className="food-results">
          {results.map((food) => (
            <button
              key={food.id}
              type="button"
              className="ghost"
              onClick={() => {
                setSearch(food.description);
                setResults([]);
                onChange({
                  foodId: food.id,
                  foodDescription: food.description,
                  quantityUnit: food.servingUnit,
                  servingQuantity: food.servingQuantity,
                  servingGrams: food.servingGrams,
                  proteinG: food.proteinG,
                  fatG: food.fatG,
                  carbohydrateG: food.carbohydrateG,
                  calories: food.calories,
                });
              }}
            >
              <span>{food.description}</span>
              <small>{formatFoodSummary(food)}</small>
            </button>
          ))}
        </div>
      )}
      {item.foodId && (
        <div className="selected-food">
          Selected: <strong>{item.foodDescription}</strong>
        </div>
      )}
      {item.foodId && item.servingQuantity != null && (
        <small>Food serving: {formatFoodSummary(item)}</small>
      )}
    </div>
  );
}

function quantityUnitOptions(currentUnit: string) {
  const units = ["g", "oz", "lb", "kg"];
  if (currentUnit && !units.includes(currentUnit)) units.push(currentUnit);
  return units;
}

function FriendsPage({
  viewingUser,
  setViewingUser,
}: {
  viewingUser: FriendUser | null;
  setViewingUser: (friend: FriendUser | null) => void;
}) {
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const inviteToken = new URLSearchParams(location.search).get("invite");

  const load = () =>
    api<FriendsResponse & { ok: boolean }>("/friends").then((res) => {
      setFriends(res);
      return res;
    });

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    setSaving(true);
    api<FriendsResponse & { ok: boolean }>("/friend-invites/accept", {
      method: "POST",
      body: JSON.stringify({ token: inviteToken }),
    })
      .then((res) => {
        if (cancelled) return;
        setFriends(res);
        setMessage("Friend invite accepted.");
        history.replaceState(null, "", "/app/friends");
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message);
      })
      .finally(() => {
        if (!cancelled) setSaving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await api("/friend-invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail("");
      setMessage("Invite sent.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function acceptInvite(inviteId: string) {
    setSaving(true);
    setMessage("");
    try {
      const res = await api<FriendsResponse & { ok: boolean }>(
        "/friend-invites/accept",
        {
          method: "POST",
          body: JSON.stringify({ inviteId }),
        },
      );
      setFriends(res);
      setMessage("Friend invite accepted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <Header title="Friends" icon={<Users />} />
      <Panel title="Invite a Friend">
        <form onSubmit={sendInvite}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="friend@example.com"
              required
            />
          </label>
          <button disabled={saving || !inviteEmail.trim()}>
            <Mail size={16} /> {saving ? "Sending..." : "Send invite"}
          </button>
        </form>
        {message && <p className={message.includes("sent") || message.includes("accepted") ? "success-text" : "error-text"}>{message}</p>}
      </Panel>

      {(friends?.receivedInvites.length ?? 0) > 0 && (
        <Panel title="Invites to Accept">
          <div className="list">
            {friends!.receivedInvites.map((invite) => (
              <div className="list-row" key={invite.id}>
                <span>
                  <strong>{invite.inviter?.name}</strong>
                  <small>{invite.inviter?.email} wants to share their data with you.</small>
                </span>
                <button disabled={saving} onClick={() => acceptInvite(invite.id)}>
                  Accept
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Data I Can View">
        <div className="list">
          {friends?.friends.length ? (
            friends.friends.map((friend) => (
              <div className="list-row" key={friend.id}>
                <span>
                  <strong>{friend.name}</strong>
                  <small>{friend.email}</small>
                </span>
                <div className="row-actions">
                  <button onClick={() => setViewingUser(friend)}>
                    View read-only
                  </button>
                  <button
                    className="ghost"
                    onClick={async () => {
                      const res = await api<FriendsResponse & { ok: boolean }>(
                        `/friends/${friend.id}`,
                        { method: "DELETE" },
                      );
                      if (viewingUser?.id === friend.id) setViewingUser(null);
                      setFriends(res);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p>No accepted friend access yet.</p>
          )}
        </div>
      </Panel>

      <Panel title="People Who Can View Me">
        <div className="list">
          {friends?.sharedWith.length ? (
            friends.sharedWith.map((friend) => (
              <div className="list-row" key={friend.id}>
                <span>
                  <strong>{friend.name}</strong>
                  <small>{friend.email}</small>
                </span>
              </div>
            ))
          ) : (
            <p>No one has accepted access yet.</p>
          )}
        </div>
      </Panel>

      {(friends?.sentInvites.length ?? 0) > 0 && (
        <Panel title="Pending Invites">
          <div className="list">
            {friends!.sentInvites.map((invite) => (
              <div className="list-row" key={invite.id}>
                <span>
                  <strong>{invite.email}</strong>
                  <small>Expires {invite.expiresAt.slice(0, 10)}</small>
                </span>
                <button
                  className="ghost"
                  onClick={async () => {
                    const res = await api<FriendsResponse & { ok: boolean }>(
                      `/friend-invites/${invite.id}`,
                      { method: "DELETE" },
                    );
                    setFriends(res);
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  );
}

function Reports({ user, viewingUser }: { user: User; viewingUser?: FriendUser | null }) {
  const weightUnit = user.preferredWeightUnit;
  const fmtLb = (lb: number) => `${round(fromLb(lb, weightUnit), 1)} ${weightUnit}`;
  const [calStart, setCalStart] = useState(() => daysAgo(14));
  const [calEnd, setCalEnd] = useState(today());
  const [weightStart, setWeightStart] = useState(() => daysAgo(34));
  const [weightEnd, setWeightEnd] = useState(today());
  const [calSummary, setCalSummary] = useState<any>(null);
  const [weightSummary, setWeightSummary] = useState<any>(null);
  const [twoWeekWeightLoss, setTwoWeekWeightLoss] = useState<any>(null);
  useEffect(() => {
    api(withOwner(`/reports/summary?start=${calStart}&end=${calEnd}`, viewingUser)).then(setCalSummary);
  }, [calStart, calEnd, viewingUser?.id]);
  useEffect(() => {
    api(withOwner(`/reports/summary?start=${weightStart}&end=${weightEnd}`, viewingUser)).then(setWeightSummary);
  }, [weightStart, weightEnd, viewingUser?.id]);
  useEffect(() => {
    api(withOwner("/reports/two-week-weight-loss", viewingUser))
      .then(setTwoWeekWeightLoss)
      .catch((err) => setTwoWeekWeightLoss({ error: err.message }));
  }, [viewingUser?.id]);
  return (
    <section>
      <Header title={viewingUser ? `${viewingUser.name}'s Reports` : "Reports"} icon={<BarChart3 />} />
      <Panel title="Weight Change Over Last Two Weeks">
        {twoWeekWeightLoss?.error ? (
          <p>{twoWeekWeightLoss.error}</p>
        ) : twoWeekWeightLoss?.canCalculate === false ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4em" }}>
            <span>{twoWeekWeightLoss.message}</span>
            {twoWeekWeightLoss.sevenDayAvgLb != null && (
              <span><strong>Avg this week:</strong> {fmtLb(twoWeekWeightLoss.sevenDayAvgLb)}</span>
            )}
          </div>
        ) : twoWeekWeightLoss ? (
          (() => {
            const lossLb = twoWeekWeightLoss.weightLossLb;
            const isGain = lossLb < 0;
            const absDiff = `${round(fromLb(Math.abs(lossLb), weightUnit), 1)} ${weightUnit}`;
            const color = isGain ? "red" : "green";
            const verb = isGain ? "Gained" : "Lost";
            if (twoWeekWeightLoss.useWeeklyAverages) {
              const { priorAvgLb, recentAvgLb, priorWeekStart, priorWeekEnd, recentWeekStart, recentWeekEnd } = twoWeekWeightLoss;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4em" }}>
                  <span><strong>This week avg:</strong> {fmtLb(recentAvgLb)} ({recentWeekStart}–{recentWeekEnd})</span>
                  <span><strong>Prior week avg:</strong> {fmtLb(priorAvgLb)} ({priorWeekStart}–{priorWeekEnd})</span>
                  <span>
                    <strong>Change:</strong>{" "}
                    <strong style={{ color }}>{verb} {absDiff}</strong>
                  </span>
                </div>
              );
            }
            const { endWeight, startWeight } = twoWeekWeightLoss;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4em" }}>
                <span><strong>Weight:</strong> {endWeight.value} {endWeight.unit}</span>
                <span>
                  <strong>Change:</strong>{" "}
                  <strong style={{ color }}>{verb} {absDiff}</strong>{" "}
                  since {startWeight.date}
                </span>
              </div>
            );
          })()
        ) : null}
      </Panel>
      <Panel title="Weight by Day">
        <DateRange start={weightStart} end={weightEnd} setStart={setWeightStart} setEnd={setWeightEnd} />
        <WeightBars rows={weightSummary?.weights ?? []} />
      </Panel>
      <Panel title="Calories by Day">
        <DateRange start={calStart} end={calEnd} setStart={setCalStart} setEnd={setCalEnd} />
        <Bars rows={calSummary?.days ?? []} />
      </Panel>
    </section>
  );
}

function Goals({ user, viewingUser }: { user: User; viewingUser?: FriendUser | null }) {
  const weightUnit = user.preferredWeightUnit;
  const fmtLb = (lb: number) => `${round(fromLb(lb, weightUnit), 1)} ${weightUnit}`;
  const fmtPaceLb = (lb: number) => `${round(fromLb(lb, weightUnit), 2)} ${weightUnit}/week`;
  const caloriesPerUnit = weightUnit === "kg" ? CALORIES_PER_KG : CALORIES_PER_POUND;
  const fmtUnit = (lb: number) => round(fromLb(lb, weightUnit), 1);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [goalMode, setGoalMode] = useState<"date" | "pace">("date");
  const readOnly = Boolean(viewingUser);
  const loadActive = () => api(withOwner("/goal-plans/active", viewingUser)).then(setActivePlan);
  useEffect(() => {
    setActivePlan(null);
    void loadActive();
  }, [viewingUser?.id]);
  const maintenance = activePlan?.maintenance;
  const calculation = activePlan?.calculation;
  const allGoals: any[] = [];
  const showArchived = false;
  const setShowArchived = (_value: boolean) => {};
  const loadAll = (_archived = false) => {};
  const getStatus = (_targetDate: string) => "ongoing";
  return (
    <section>
      <Header title={viewingUser ? `${viewingUser.name}'s Goals` : "Goals"} icon={<Target />} />
      {activePlan?.plan && (
        <Panel title="Current Goal">
          <p>
            <strong>Goal:</strong>{" "}
            {activePlan.plan.goal_weight_value}{" "}
            {activePlan.plan.goal_weight_unit} by{" "}
            {activePlan.plan.target_date}
          </p>
          {activePlan.goalPace ? (
            activePlan.goalPace.direction === "maintain" ? (
              <p>You need to maintain weight to achieve this goal.</p>
            ) : (
              <p>
                You need to {activePlan.goalPace.direction}{" "}
                {fmtPaceLb(Math.abs(activePlan.goalPace.weeklyChangeLb))} to
                achieve this goal
                {calculation
                  ? ` which means a daily calorie deficit of ${calculation.dailyAdjustment}.`
                  : "."}
              </p>
            )
          ) : (
            <p>Add a current weight to calculate the weekly pace needed.</p>
          )}
          {maintenance && (
            <div className="calculation-work">
              <strong className="highlight-stat">
                Your maintenance calories: {maintenance.maintenanceCalories}{" "}
                calories/day
              </strong>
              {maintenance.source === "weigh-in" ? (
                <>
                  {maintenance.priorAvgLb != null ? (
                    <span>
                      Using weekly weight averages: prior week average was{" "}
                      <strong>{fmtLb(maintenance.priorAvgLb)}</strong>, recent week
                      average is <strong>{fmtLb(maintenance.recentAvgLb)}</strong>.
                    </span>
                  ) : (
                    <span>
                      Using single weights from {maintenance.start} to {maintenance.end}.
                    </span>
                  )}
                  <span>
                    Average logged intake of{" "}
                    {Math.round(maintenance.averageLoggedCalories ?? 0)}{" "}
                    calories/day for {maintenance.loggedDayCount} logged days in
                    that {maintenance.windowDays ?? 14}-day window.
                  </span>
                  <span>
                    Weight changed {fmtLb(maintenance.weightChangeLb)}, implying
                    a daily {maintenance.weightChangeLb < 0 ? "deficit" : "surplus"} of |
                    {fmtUnit(maintenance.weightChangeLb)} × {Math.round(caloriesPerUnit)} / {maintenance.days}| ={" "}
                    {Math.round(
                      Math.abs(maintenance.dailyWeightAdjustment ?? 0),
                    )}{" "}
                    calories/day.
                  </span>
                  <span>
                    Maintenance ={" "}
                    {Math.round(maintenance.averageLoggedCalories ?? 0)} − (
                    {fmtUnit(maintenance.weightChangeLb)} × {Math.round(caloriesPerUnit)} / {maintenance.days}) ={" "}
                    {maintenance.maintenanceCalories} calories/day.
                  </span>
                </>
              ) : maintenance.source === "body-weight-fallback" ? (
                <span>{maintenance.message}</span>
              ) : null}
              {calculation && (
                <>
                  <strong className="highlight-stat">
                    Your daily calorie goal then is{" "}
                    {calculation.targetCalories} calories/day.
                  </strong>
                  <span>
                    This is just your maintenance calories minus your needed
                    deficit, or {maintenance.maintenanceCalories}{" "}
                    {calculation.weightChangeLb < 0 ? "-" : "+"}{" "}
                    {calculation.dailyAdjustment} ={" "}
                    {calculation.targetCalories} calories/day.
                  </span>
                  {calculation.unrealistic && (
                    <span className="error-text">
                      This target appears aggressive.
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {!calculation && (
            <p>
              {activePlan?.message ??
                "Add a current weight to calculate target calories."}
            </p>
          )}
        </Panel>
      )}
      {readOnly && !activePlan?.plan && (
        <Panel title="Current Goal">
          <p>No active goal plan.</p>
        </Panel>
      )}
      {!readOnly && (
      <Panel title="Goal Plan">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await api("/goal-plans", {
              method: "POST",
              body: JSON.stringify({
                goalMode,
                goalWeightValue: numberValue(form.get("goalWeightValue")),
                goalWeightUnit: form.get("goalWeightUnit"),
                targetDate: form.get("targetDate"),
                weeklyPaceLb: numberValue(form.get("weeklyPaceLb")),
              }),
            });
            loadActive();
            (event.target as HTMLFormElement).reset();
          }}
        >
          <div className="row">
            <input
              name="goalWeightValue"
              type="number"
              step="0.1"
              placeholder="Goal weight"
              required
            />
            <select name="goalWeightUnit">
              <option>lb</option>
              <option>kg</option>
            </select>
          </div>
          <div className="segmented">
            <button
              type="button"
              className={goalMode === "date" ? "active" : "ghost"}
              onClick={() => setGoalMode("date")}
            >
              Date
            </button>
            <button
              type="button"
              className={goalMode === "pace" ? "active" : "ghost"}
              onClick={() => setGoalMode("pace")}
            >
              Pace
            </button>
          </div>
          {goalMode === "date" ? (
            <input name="targetDate" type="date" required />
          ) : (
            <input
              name="weeklyPaceLb"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="Pounds per week"
              required
            />
          )}
          <button>
            <Target size={16} /> Save goal
          </button>
        </form>
      </Panel>
      )}
      {false && (
        <>
        <Panel title="Suggested Calories">
        {activePlan?.calculation ? (
          <p>
            Target about{" "}
            <strong>
              {activePlan.calculation.targetCalories} calories/day
            </strong>
            . Required pace is {fmtPaceLb(activePlan.calculation.weeklyChangeLb)}.{" "}
            {activePlan.calculation.unrealistic &&
              "This target appears aggressive."}
          </p>
        ) : (
          <p>
            {activePlan?.message ??
              "Create a goal and add weight entries to calculate a target."}
          </p>
        )}
      </Panel>
        <Panel title="All Goals">
        <div className="toolbar">
          <button
            className="ghost"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Hide" : "Show"} Archived
          </button>
        </div>
        <div className="list">
          {allGoals.length ? (
            allGoals.map((goal) => (
              <div key={goal.id} className="list-row">
                <span>
                  <strong>
                    {goal.goal_weight_value} {goal.goal_weight_unit}
                  </strong>
                  <small>
                    Target: {goal.target_date} · Status:{" "}
                    <strong>{getStatus(goal.target_date)}</strong>
                  </small>
                </span>
                <button
                  className="ghost"
                  onClick={async () => {
                    await api(`/goal-plans/${goal.id}`, { method: "PUT" });
                    loadAll(showArchived);
                  }}
                >
                  Archive
                </button>
              </div>
            ))
          ) : (
            <p>{showArchived ? "No archived goals." : "No active goals."}</p>
          )}
        </div>
        </Panel>
        </>
      )}
    </section>
  );
}

type SettingsForm = {
  firstName: string;
  lastName: string;
  preferredWeightUnit: string;
  proteinGoalG: string;
  calorieGoalType: string;
  calorieGoalValue: string;
  timezone: string;
};

function getSettingsForm(user: User): SettingsForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    preferredWeightUnit: user.preferredWeightUnit,
    proteinGoalG: user.proteinGoalG == null ? "" : String(user.proteinGoalG),
    calorieGoalType: user.calorieGoalType,
    calorieGoalValue:
      user.calorieGoalValue == null ? "" : String(user.calorieGoalValue),
    timezone: user.timezone ?? "America/New_York",
  };
}

function dailyGoalsSnapshot(goals: DailyGoal[]) {
  return JSON.stringify(
    goals.map((goal) => ({
      id: goal.id,
      label: goal.label,
      goalType: goal.goalType,
      minutes: goal.minutes,
      active: goal.active,
    })),
  );
}

function SettingsPage({
  user,
  viewingUser,
  setUser,
  onLogout,
}: {
  user: User;
  viewingUser?: FriendUser | null;
  setUser: (user: User) => void;
  onLogout: () => void;
}) {
  const readOnly = Boolean(viewingUser);
  const [settingsUser, setSettingsUser] = useState(user);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [settingsForm, setSettingsForm] = useState(() => getSettingsForm(settingsUser));
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const savedSettingsForm = useMemo(() => getSettingsForm(settingsUser), [settingsUser]);
  const settingsChanged = useMemo(
    () => JSON.stringify(settingsForm) !== JSON.stringify(savedSettingsForm),
    [settingsForm, savedSettingsForm],
  );

  useEffect(() => {
    if (!readOnly) {
      setSettingsUser(user);
      setSettingsForm(getSettingsForm(user));
      return;
    }

    let cancelled = false;
    api<{ user: User }>(withOwner("/me/settings", viewingUser))
      .then((res) => {
        if (cancelled) return;
        setSettingsUser(res.user);
        setSettingsForm(getSettingsForm(res.user));
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsUser(user);
          setSettingsForm(getSettingsForm(user));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [readOnly, user, viewingUser?.id]);

  const updateSettingsField = (field: keyof SettingsForm, value: string) => {
    setSaveMessage("");
    setSettingsForm((current) => ({ ...current, [field]: value }));
  };
  const isCalculatedCalorieGoal =
    settingsForm.calorieGoalType === "goal-based";
  const [activeGoal, setActiveGoal] = useState<ActiveGoal | null>(null);
  const [activeGoalError, setActiveGoalError] = useState("");
  const [loadingActiveGoal, setLoadingActiveGoal] = useState(false);
  const [dailyGoals, setDailyGoals] = useState<DailyGoal[]>([]);
  const [savedDailyGoals, setSavedDailyGoals] = useState<DailyGoal[]>([]);
  const [newGoalLabel, setNewGoalLabel] = useState("");
  const dailyGoalsChanged = useMemo(
    () => dailyGoalsSnapshot(dailyGoals) !== dailyGoalsSnapshot(savedDailyGoals),
    [dailyGoals, savedDailyGoals],
  );
  const canSaveSettings =
    !readOnly &&
    (settingsChanged || dailyGoalsChanged) && !savingSettings;

  useEffect(() => {
    if (!isCalculatedCalorieGoal) return;

    let cancelled = false;
    setLoadingActiveGoal(true);
    setActiveGoalError("");
    api<ActiveGoal>(withOwner("/goal-plans/active", viewingUser))
      .then((goal) => {
        if (!cancelled) setActiveGoal(goal);
      })
      .catch((error) => {
        if (!cancelled) {
          setActiveGoal(null);
          setActiveGoalError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingActiveGoal(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isCalculatedCalorieGoal, viewingUser?.id]);

  useEffect(() => {
    api<{ goals: DailyGoal[] }>(withOwner("/daily-goals", viewingUser))
      .then((res) => {
        setDailyGoals(res.goals);
        setSavedDailyGoals(res.goals);
      })
      .catch(() => {
        setDailyGoals([]);
        setSavedDailyGoals([]);
      });
  }, [viewingUser?.id]);

  const updateDailyGoal = (id: string, patch: Partial<DailyGoal>) => {
    setSaveMessage("");
    setDailyGoals((current) =>
      current.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
    );
  };

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveSettings) return;
    setSavingSettings(true);
    setSaveMessage("");
    try {
      if (settingsChanged) {
        const res = await api<{ user: User }>("/me/settings", {
          method: "PUT",
          body: JSON.stringify({
            firstName: settingsForm.firstName,
            lastName: settingsForm.lastName,
            proteinGoalG: numberValue(settingsForm.proteinGoalG),
            calorieGoalValue:
              settingsForm.calorieGoalValue === ""
                ? null
                : numberValue(settingsForm.calorieGoalValue),
            calorieGoalType: settingsForm.calorieGoalType,
            preferredWeightUnit: settingsForm.preferredWeightUnit,
            timezone: settingsForm.timezone,
          }),
        });
        setUser(res.user);
      }
      if (dailyGoalsChanged) {
        const res = await api<{ goals: DailyGoal[] }>("/daily-goals", {
          method: "PUT",
          body: JSON.stringify({ goals: dailyGoals }),
        });
        setDailyGoals(res.goals);
        setSavedDailyGoals(res.goals);
      }
      setSaveMessage("Settings saved.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <section>
      <Header title={viewingUser ? `${viewingUser.name}'s Settings` : "Settings"} icon={<Settings />} />
      <form onSubmit={saveSettings}>
        <Panel title="User Settings">
          <div className="settings-row">
            <label className="field">
              <span>First name</span>
              <input
                name="firstName"
                value={settingsForm.firstName}
                onChange={(event) =>
                  updateSettingsField("firstName", event.target.value)
                }
                placeholder="First"
                disabled={readOnly}
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                name="lastName"
                value={settingsForm.lastName}
                onChange={(event) =>
                  updateSettingsField("lastName", event.target.value)
                }
                placeholder="Last"
                disabled={readOnly}
              />
            </label>
          </div>
          <div className="settings-row">
            <label className="field">
              <span>Preferred unit of measure for weight</span>
              <select
                name="preferredWeightUnit"
                value={settingsForm.preferredWeightUnit}
                onChange={(event) =>
                  updateSettingsField("preferredWeightUnit", event.target.value)
                }
                disabled={readOnly}
              >
                <option>lb</option>
                <option>kg</option>
              </select>
            </label>
            <label className="field">
              <span>Protein Goal in grams</span>
              <input
                name="proteinGoalG"
                type="number"
                step="1"
                value={settingsForm.proteinGoalG}
                onChange={(event) =>
                  updateSettingsField("proteinGoalG", event.target.value)
                }
                placeholder=""
                disabled={readOnly}
              />
            </label>
          </div>
          <div className="settings-row">
            <label className="field">
              <span>Calorie Goal Type</span>
              <select
                name="calorieGoalType"
                value={settingsForm.calorieGoalType}
                onChange={(event) =>
                  updateSettingsField("calorieGoalType", event.target.value)
                }
                disabled={readOnly}
              >
                <option value="manual">Manual</option>
                <option value="goal-based">Calculated</option>
              </select>
            </label>
            {!isCalculatedCalorieGoal && (
              <label className="field">
                <span>Calorie Goal Value</span>
                <input
                  name="calorieGoalValue"
                  type="number"
                  step="1"
                  value={settingsForm.calorieGoalValue}
                  onChange={(event) =>
                    updateSettingsField("calorieGoalValue", event.target.value)
                  }
                  placeholder=""
                  disabled={readOnly}
                />
              </label>
            )}
            {isCalculatedCalorieGoal && (
              <div className="field">
                <span>Calculated Calorie Goal</span>
                <strong>
                  {loadingActiveGoal
                    ? "Calculating..."
                    : activeGoal?.calculation
                      ? `${activeGoal.calculation.targetCalories} calories/day`
                      : "Not available"}
                </strong>
                {!loadingActiveGoal && (
                  <small>
                    {activeGoalError ||
                      (activeGoal?.maintenance?.source ===
                      "body-weight-fallback"
                        ? activeGoal.maintenance.message
                        : null) ||
                      activeGoal?.message ||
                      "Based on your active goal, recent weights, and food logs."}
                  </small>
                )}
              </div>
            )}
          </div>
          <label className="field">
            <span>User timezone</span>
            <select
              name="timezone"
              value={settingsForm.timezone}
              onChange={(event) =>
                updateSettingsField("timezone", event.target.value)
              }
              disabled={readOnly}
            >
              {timezones.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>
        </Panel>
        <Panel title="Daily Goals | Customize the goals you want to track in your diary.">
          <div className="daily-goal-settings">
            {dailyGoals.map((goal) => (
              <div key={goal.id} className="daily-goal-setting">
                <label>
                  <input
                    type="checkbox"
                    checked={goal.active}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateDailyGoal(goal.id, { active: event.target.checked })
                    }
                  />
                  <span>
                    {goal.goalType === "custom" ? "Custom" : dailyGoalLabel(goal)}
                  </span>
                </label>
                {goal.goalType === "move" && (
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={goal.minutes ?? ""}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateDailyGoal(goal.id, {
                        minutes: Number(event.target.value),
                        label: "Movement",
                      })
                    }
                    aria-label="Move minutes"
                  />
                )}
                {goal.goalType === "exercise" && (
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={goal.minutes ?? ""}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateDailyGoal(goal.id, {
                        minutes: Number(event.target.value),
                        label: "Workout",
                      })
                    }
                    aria-label="Exercise minutes"
                  />
                )}
                {goal.goalType === "custom" && (
                  <input
                    value={goal.label}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateDailyGoal(goal.id, { label: event.target.value })
                    }
                    placeholder="Daily goal"
                  />
                )}
              </div>
            ))}
            {!readOnly && (
            <div className="daily-goal-setting">
              <input
                value={newGoalLabel}
                onChange={(event) => {
                  setSaveMessage("");
                  setNewGoalLabel(event.target.value);
                }}
                placeholder="Add custom goal..."
              />
              <button
                type="button"
                className="ghost"
                disabled={!newGoalLabel.trim()}
                onClick={() => {
                  setSaveMessage("");
                  setDailyGoals((current) => [
                    ...current,
                    {
                      id: "",
                      label: newGoalLabel.trim(),
                      goalType: "custom",
                      minutes: null,
                      active: true,
                    },
                  ]);
                  setNewGoalLabel("");
                }}
              >
                <Plus size={16} /> Add
              </button>
            </div>
            )}
          </div>
        </Panel>
        {!readOnly && (
        <div className="settings-save-row">
          <button disabled={!canSaveSettings}>
            <Settings size={16} />{" "}
            {savingSettings
              ? "Saving..."
              : canSaveSettings
                ? "Save Settings"
                : "Saved"}
          </button>
          {saveMessage && <span className="success-text">{saveMessage}</span>}
        </div>
        )}
      </form>
      {!readOnly && (
      <>
      <Panel title="Danger Zone">
        <button
          className="danger-button"
          onClick={() => setConfirmDelete(true)}
        >
          DELETE ALL MY DATA
        </button>
        {confirmDelete && (
          <div className="warning-box">
            <strong>All diary data will be deleted.</strong>
            <span>
              This deletes diary entries, weights, goals, private foods, and
              private meals. Public foods and public meals you created will
              remain.
            </span>
            <div className="form-actions">
              <button
                className="danger-button"
                onClick={async () => {
                  await api("/me/delete-data", {
                    method: "POST",
                    body: JSON.stringify({ confirm: "YES! I understand!" }),
                  });
                  setConfirmDelete(false);
                  setDeleteMessage(
                    "Your diary data and private foods/meals were deleted.",
                  );
                }}
              >
                YES! I understand!
              </button>
              <button className="ghost" onClick={() => setConfirmDelete(false)}>
                NO! Do not delete me!
              </button>
            </div>
          </div>
        )}
        {deleteMessage && <div className="notice success">{deleteMessage}</div>}
      </Panel>
      <Panel title="Account">
        <button type="button" onClick={onLogout}>
          <LogOut size={16} /> Logout
        </button>
      </Panel>
      </>
      )}
    </section>
  );
}

function Header({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="page-header">
      <span>{icon}</span>
      <h1>{title}</h1>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MacroMetric({
  label,
  grams,
  percent,
  goalStatus,
}: {
  label: string;
  grams: number;
  percent: number;
  goalStatus?: { text: string; tone: string };
}) {
  const macroClass = label.toLowerCase();

  return (
    <div className="metric macro-metric">
      <span>{label}</span>
      <strong>{grams}g</strong>
      <small
        className={`macro-percent ${macroClass}`}
        title={`Percent of macro calories from ${label.toLowerCase()}. Protein and carbs use 4 calories per gram; fat uses 9 calories per gram.`}
      >
        {percent}%
      </small>
      {goalStatus && (
        <small className={`macro-goal ${goalStatus.tone}`}>
          {goalStatus.text}
        </small>
      )}
    </div>
  );
}

function SearchTools({
  scope,
  setScope,
  search,
  setSearch,
  showScope = true,
}: {
  scope: string;
  setScope: (scope: string) => void;
  search: string;
  setSearch: (search: string) => void;
  showScope?: boolean;
}) {
  return (
    <div className="toolbar">
      <input
        placeholder="Search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {showScope && (
      <select value={scope} onChange={(event) => setScope(event.target.value)}>
        <option value="all">All</option>
        <option value="mine">Mine</option>
        <option value="public">Public</option>
      </select>
      )}
    </div>
  );
}

function DateRange({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (date: string) => void;
  setEnd: (date: string) => void;
}) {
  return (
    <div className="toolbar">
      <input
        type="date"
        value={start}
        onChange={(event) => setStart(event.target.value)}
      />
      <input
        type="date"
        value={end}
        onChange={(event) => setEnd(event.target.value)}
      />
    </div>
  );
}

function Table({ rows }: { rows: any[] }) {
  return (
    <div className="table">
      {rows.map((row) => (
        <div className="table-row" key={row.date}>
          <span>{row.date}</span>
          <span>{Math.round(row.calories ?? 0)} cal</span>
          <span>{Math.round(row.proteinG ?? 0)}g P</span>
          <span>{Math.round(row.fatG ?? 0)}g F</span>
          <span>{Math.round(row.carbohydrateG ?? 0)}g C</span>
        </div>
      ))}
    </div>
  );
}

function Bars({ rows }: { rows: any[] }) {
  const max = useMemo(
    () => Math.max(1, ...rows.map((row) => Number(row.calories ?? 0))),
    [rows],
  );
  return (
    <div className="bars">
      {rows.map((row) => (
        <div className="bar-row" key={row.date}>
          <span>{row.date}</span>
          <div>
            <i
              style={{ width: `${(Number(row.calories ?? 0) / max) * 100}%` }}
            />
          </div>
          <strong>{Math.round(row.calories ?? 0)}</strong>
        </div>
      ))}
    </div>
  );
}

function WeightBars({ rows }: { rows: any[] }) {
  if (!rows.length) return <p>No weight entries in range.</p>;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((row) => Number(row.value));
  const minVal = Math.min(...values) - 2;
  const maxVal = Math.max(...values) + 2;
  const unit = sorted[0]?.unit ?? "lb";
  const PAD = { top: 20, right: 20, bottom: 60, left: 55 };
  const W = 580;
  const H = 280;
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const xAt = (i: number) =>
    sorted.length <= 1 ? cW / 2 : (i / (sorted.length - 1)) * cW;
  const yAt = (v: number) => cH - ((v - minVal) / (maxVal - minVal)) * cH;
  const range = maxVal - minVal;
  const step = range <= 15 ? 2 : range <= 30 ? 5 : 10;
  const yTicks: number[] = [];
  for (
    let t = Math.ceil(minVal / step) * step;
    t <= maxVal;
    t = Math.round((t + step) * 10) / 10
  )
    yTicks.push(t);
  const pts = sorted.map((row, i) => ({
    x: xAt(i),
    y: yAt(Number(row.value)),
    row,
  }));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", display: "block", overflow: "visible" }}
    >
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={0}
              y1={yAt(tick)}
              x2={cW}
              y2={yAt(tick)}
              stroke="#e4ebe7"
              strokeWidth={1}
            />
            <text
              x={-8}
              y={yAt(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="#63716b"
            >
              {tick}
            </text>
          </g>
        ))}
        <text
          textAnchor="middle"
          fontSize={11}
          fill="#63716b"
          transform={`translate(-42,${cH / 2}) rotate(-90)`}
        >
          {unit}
        </text>
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#2563a0"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {pts.map(({ x, y, row }) => (
          <g key={row.date}>
            <circle cx={x} cy={y} r={4} fill="#2563a0" />
            <title>
              {row.date}: {row.value} {unit}
            </title>
            <text
              fontSize={10}
              fill="#63716b"
              textAnchor="end"
              transform={`translate(${x},${cH + 12}) rotate(-45)`}
            >
              {row.date.slice(5).replace("-", "/")}
            </text>
          </g>
        ))}
        <line x1={0} y1={0} x2={0} y2={cH} stroke="#ccc" strokeWidth={1} />
        <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#ccc" strokeWidth={1} />
      </g>
    </svg>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
