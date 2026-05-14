import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, CalendarDays, ChefHat, LogOut, Menu, Plus, Scale, Settings, Target, Utensils } from 'lucide-react';
import './styles.css';

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  proteinGoalG: number | null;
  calorieGoalValue: number | null;
  calorieGoalType: 'manual' | 'goal-based';
  preferredWeightUnit: 'lb' | 'kg';
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
  visibility: 'private' | 'public';
  notes?: string | null;
};
type MealItem = { foodId: string; foodDescription?: string; quantity: number; quantityUnit: string };
type SavedMeal = { id: string; ownerUserId: string; name: string; description?: string; visibility: 'private' | 'public'; items: MealItem[] };

const today = () => new Date().toLocaleDateString('en-CA');
const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('The API did not return JSON. Run the app with Wrangler Pages preview so Cloudflare Functions are available.');
  }
  const data = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(data.error?.message ?? 'Request failed.');
  return data;
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState(location.pathname === '/login' ? 'login' : location.pathname.replace('/app/', '') || 'app');
  const [message, setMessage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api<{ ok: boolean; user: User }>('/me')
      .then((res) => {
        setUser(res.user);
        if (route === 'login') setRoute('app');
      })
      .catch(() => setRoute('login'));
  }, []);

  function navigate(next: string) {
    setRoute(next);
    setMobileMenuOpen(false);
    history.replaceState(null, '', next === 'login' ? '/login' : next === 'app' ? '/app' : `/app/${next}`);
  }

  async function login(email: string) {
    const res = await api<{ ok: boolean; user: User }>('/auth/simple-login', { method: 'POST', body: JSON.stringify({ email }) });
    setUser(res.user);
    navigate('app');
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    setUser(null);
    navigate('login');
  }

  if (!user || route === 'login') return <Login onLogin={login} message={message} setMessage={setMessage} />;

  const page = {
    app: <Dashboard user={user} />,
    foods: <Foods user={user} />,
    'saved-meals': <SavedMeals user={user} />,
    history: <History />,
    reports: <Reports />,
    goals: <Goals />,
    settings: <SettingsPage user={user} setUser={setUser} />,
  }[route] ?? <Dashboard user={user} />;

  return (
    <div className="shell">
      <header className="mobile-topbar">
        <div className="brand"><Activity size={20} /> Macro Tracker</div>
        <button className="ghost icon-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle menu">
          <Menu size={20} />
        </button>
      </header>
      <aside className={mobileMenuOpen ? 'nav open' : 'nav'}>
        <div className="brand"><Activity size={22} /> Macro Tracker</div>
        <button className={route === 'app' ? 'active' : ''} onClick={() => navigate('app')}><CalendarDays size={18} /> Today</button>
        <button className={route === 'foods' ? 'active' : ''} onClick={() => navigate('foods')}><Utensils size={18} /> Foods</button>
        <button className={route === 'saved-meals' ? 'active' : ''} onClick={() => navigate('saved-meals')}><ChefHat size={18} /> Meals</button>
        <button className={route === 'history' ? 'active' : ''} onClick={() => navigate('history')}><CalendarDays size={18} /> History</button>
        <button className={route === 'reports' ? 'active' : ''} onClick={() => navigate('reports')}><BarChart3 size={18} /> Reports</button>
        <button className={route === 'goals' ? 'active' : ''} onClick={() => navigate('goals')}><Target size={18} /> Goals</button>
        <button className={route === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={18} /> Settings</button>
        <button onClick={logout}><LogOut size={18} /> Logout</button>
        <span className="signed-in">{user.email}</span>
      </aside>
      <main>{page}</main>
    </div>
  );
}

function Login({ onLogin, message, setMessage }: { onLogin: (email: string) => Promise<void>; message: string; setMessage: (message: string) => void }) {
  return (
    <main className="login-page">
      <form
        className="login-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          const email = new FormData(event.currentTarget).get('email') as string;
          try {
            await onLogin(email);
          } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Login failed.');
          }
        }}
      >
        <h1>Macro Tracker</h1>
        <p>Version 1 treats this email as the current user. No password or magic link is used yet.</p>
        <input name="email" type="email" placeholder="you@example.com" required />
        <button type="submit">Continue</button>
        {message && <p className="error-text">{message}</p>}
      </form>
    </main>
  );
}

function Dashboard({ user }: { user: User }) {
  const [date, setDate] = useState(today());
  const [day, setDay] = useState<any>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [mealLabel, setMealLabel] = useState('Other');
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [foodQuantity, setFoodQuantity] = useState('');
  const [foodQuantityUnit, setFoodQuantityUnit] = useState('g');
  const [addingFood, setAddingFood] = useState(false);
  const [activeGoal, setActiveGoal] = useState<any>(null);
  const [popupMessage, setPopupMessage] = useState('');
  const [status, setStatus] = useState('');
  const load = () => {
    api(`/days/${date}`).then(setDay);
    api<{ meals: SavedMeal[] }>('/saved-meals?scope=all').then((res) => setMeals(res.meals));
    api('/goal-plans/active').then(setActiveGoal).catch(() => setActiveGoal(null));
  };
  useEffect(load, [date]);
  useEffect(() => {
    const query = foodSearch.trim();
    if (!query || selectedFood?.description === foodSearch) {
      setFoods([]);
      return;
    }
    let ignore = false;
    api<{ foods: Food[] }>(`/foods?scope=all&search=${encodeURIComponent(query)}`).then((res) => {
      if (!ignore) setFoods(res.foods);
    });
    return () => {
      ignore = true;
    };
  }, [foodSearch, selectedFood]);

  const totals = day?.totals;
  const canAddFood = Boolean(selectedFood && Number(foodQuantity) > 0 && !addingFood);
  const quantityUnitOptions = ['g', 'oz', 'lb', 'kg'];
  if (selectedFood && !quantityUnitOptions.includes(selectedFood.servingUnit)) quantityUnitOptions.push(selectedFood.servingUnit);
  return (
    <section>
      {popupMessage && (
        <div className="toast" role="status">
          <span>{popupMessage}</span>
          <button className="ghost icon-button" onClick={() => setPopupMessage('')} aria-label="Dismiss notification">x</button>
        </div>
      )}
      <Header title="Today" icon={<CalendarDays />} />
      <div className="toolbar">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button onClick={() => setDate(today())}>Today</button>
      </div>
      {totals && (
        <div className="metric-grid today-metrics">
          <Metric label="Protein" value={`${totals.proteinG}g`} />
          <Metric label="Fat" value={`${totals.fatG}g`} />
          <Metric label="Carbs" value={`${totals.carbohydrateG}g`} />
          <Metric label="Protein %" value={`${totals.proteinPercent}%`} />
          <Metric label="Fat %" value={`${totals.fatPercent}%`} />
          <Metric label="Carb %" value={`${totals.carbohydratePercent}%`} />
          <Metric label="Calories" value={Math.round(totals.calories)} />
        </div>
      )}
      <div className="goals-row">
        <div className={day?.proteinGoal?.met ? 'notice success' : 'notice'}>
          {day?.proteinGoal
            ? day.proteinGoal.met
              ? `Protein goal met: ${day.proteinGoal.actualG}g of ${day.proteinGoal.goalG}g`
              : `${Math.round(day.proteinGoal.remainingG)}g protein remaining (${Math.round(day.proteinGoal.remainingG * 4)} calories from protein)`
            : 'Add a protein goal in settings.'}
        </div>
        <div className={user.calorieGoalValue && totals?.calories >= user.calorieGoalValue ? 'notice success calories' : 'notice calories'}>
          {user.calorieGoalValue
            ? (totals?.calories ?? 0) >= user.calorieGoalValue
              ? `Calorie goal met: ${Math.round(totals?.calories ?? 0)} of ${user.calorieGoalValue} cal`
              : `${Math.round(user.calorieGoalValue - (totals?.calories ?? 0))} calories remaining`
            : 'Add a calorie goal in settings.'}
        </div>
      </div>
      {activeGoal?.plan && (
        <div className="notice goal-summary">
          <div>Current goal: <strong>{activeGoal.plan.goal_weight_value} {activeGoal.plan.goal_weight_unit}</strong> by <strong>{activeGoal.plan.target_date}</strong></div>
          <div>
            {activeGoal.goalPace
              ? `Needed average: ${activeGoal.goalPace.direction === 'maintain' ? 'maintain weight' : `${activeGoal.goalPace.direction} ${Math.abs(activeGoal.goalPace.weeklyChangeLb)} lb/week`} from ${activeGoal.goalPace.latestWeight.value} ${activeGoal.goalPace.latestWeight.unit} on ${activeGoal.goalPace.latestWeight.date}.`
              : 'Add a current weight to calculate the weekly pace needed.'}
          </div>
        </div>
      )}
      <div className="two-col">
        <Panel title="Log Food">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedFood || !canAddFood) return;
              setAddingFood(true);
              try {
                await api('/diary-items', {
                  method: 'POST',
                  body: JSON.stringify({
                    foodId: selectedFood.id,
                  eatenDate: date,
                  mealLabel,
                  quantity: Number(foodQuantity),
                  quantityUnit: foodQuantityUnit,
                }),
              });
              setPopupMessage(`${selectedFood.description} added for ${date} and ${mealLabel}`);
              setSelectedFood(null);
              setFoodSearch('');
              setFoods([]);
              setFoodQuantity('');
              setFoodQuantityUnit('g');
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
                      <small>{food.servingQuantity}{food.servingUnit} - {food.proteinG}P {food.fatG}F {food.carbohydrateG}C</small>
                    </button>
                  ))}
                </div>
              )}
              {selectedFood && <div className="selected-food">Selected: <strong>{selectedFood.description}</strong></div>}
            </div>
            <div className="row">
              <input name="quantity" type="number" step="0.01" placeholder="Qty" value={foodQuantity} onChange={(event) => setFoodQuantity(event.target.value)} required />
              <select name="quantityUnit" value={foodQuantityUnit} onChange={(event) => setFoodQuantityUnit(event.target.value)} aria-label="Quantity unit">
                {quantityUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
            {selectedFood && <small>Food serving: {selectedFood.servingQuantity}{selectedFood.servingUnit}</small>}
            <MealLabelPicker value={mealLabel} onChange={setMealLabel} />
            <button disabled={!canAddFood}><Plus size={16} /> {addingFood ? 'Adding...' : 'Add food'}</button>
          </form>
        </Panel>
        <Panel title="Add Saved Meal">
          <MealLabelPicker value={mealLabel} onChange={setMealLabel} />
          <div className="list compact">
            {meals.map((meal) => <button key={meal.id} onClick={async () => { await api(`/saved-meals/${meal.id}/add-to-diary`, { method: 'POST', body: JSON.stringify({ eatenDate: date, mealLabel }) }); setPopupMessage(`${meal.name} added for ${date} and ${mealLabel}`); load(); }}>{meal.name}</button>)}
          </div>
        </Panel>
      </div>
      <Panel title={`Diary for ${date}`}>
        <div className="list">
          <div className="list-row diary-weight">
            <span>
              <strong>Weight</strong>
              <small>{day?.weight ? `${day.weight.weight_value} ${day.weight.weight_unit}` : 'No weight logged'}</small>
            </span>
            <form
              className="compact-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await api('/weight', { method: 'POST', body: JSON.stringify({ entryDate: date, weightValue: numberValue(form.get('weightValue')), weightUnit: form.get('weightUnit') }) });
                event.currentTarget.reset();
                load();
              }}
            >
              <input name="weightValue" type="number" step="0.1" placeholder={day?.weight?.weight_value ?? 'Weight'} required />
              <select name="weightUnit" defaultValue={day?.weight?.weight_unit ?? user.preferredWeightUnit}><option>lb</option><option>kg</option></select>
              <button><Scale size={16} /> Save</button>
            </form>
          </div>
          {day?.items?.map((item: any) => (
            <div className="list-row" key={item.id}>
              <span><strong>{item.foodDescription}</strong><small>{item.meal_label ?? 'Other'} · {item.quantity}{item.quantity_unit}</small></span>
              <span>{Math.round(item.calories)} cal · {Math.round(item.protein_g)}g P</span>
              <button className="ghost" onClick={async () => { await api(`/diary-items/${item.id}`, { method: 'DELETE' }); load(); }}>Delete</button>
            </div>
          ))}
        </div>
      </Panel>
      {status && <p>{status}</p>}
    </section>
  );
}

function MealLabelPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="segmented" aria-label="Meal label">
      {['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Other'].map((label) => (
        <button key={label} type="button" className={value === label ? 'active' : 'ghost'} onClick={() => onChange(label)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Foods({ user }: { user: User }) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const load = (nextSearch = search, nextScope = scope) =>
    api<{ foods: Food[] }>(`/foods?scope=${nextScope}&search=${encodeURIComponent(nextSearch)}`).then((res) => setFoods(res.foods));
  useEffect(() => {
    void load();
  }, [scope, search]);
  async function handleFoodSaved(food: Food, action: 'added' | 'updated') {
    setScope('all');
    setSearch('');
    await load('', 'all');
    setEditingFood(null);
    setMessage(`${food.description} was ${action}.`);
  }
  return (
    <section>
      <Header title="Foods" icon={<Utensils />} />
      <SearchTools scope={scope} setScope={setScope} search={search} setSearch={setSearch} />
      <Panel title={editingFood ? 'Modify Food' : 'Add Food'}>
        <FoodForm food={editingFood} onSave={handleFoodSaved} onCancel={() => setEditingFood(null)} />
      </Panel>
      {message && <div className="notice success">{message}</div>}
      <Panel title={search ? 'Matching Foods' : 'Foods'}>
        <div className="list">{foods.map((food) => <FoodRow key={food.id} food={food} mine={food.ownerUserId === user.id} reload={load} onCopy={() => setEditingFood({ ...food, id: '', ownerUserId: user.id })} onModify={() => setEditingFood(food)} />)}</div>
      </Panel>
    </section>
  );
}

function FoodForm({ food, onSave, onCancel }: { food: Food | null; onSave: (food: Food, action: 'added' | 'updated') => Promise<void>; onCancel: () => void }) {
  const [description, setDescription] = useState('');
  const [servingQuantity, setServingQuantity] = useState('');
  const [servingUnit, setServingUnit] = useState('g');
  const [servingGrams, setServingGrams] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [macros, setMacros] = useState({ proteinG: 0, fatG: 0, carbohydrateG: 0 });
  const [calories, setCalories] = useState('');
  const [caloriesTouched, setCaloriesTouched] = useState(false);
  const [calorieWarning, setCalorieWarning] = useState<{ entered: number; calculated: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const calculatedCalories = Math.round(macros.proteinG * 4 + macros.fatG * 9 + macros.carbohydrateG * 4);
  const servingGramsRequired = !['g', 'oz', 'lb', 'kg'].includes(servingUnit);

  useEffect(() => {
    setDescription(food?.description ?? '');
    setServingQuantity(food ? String(food.servingQuantity) : '');
    setServingUnit(food?.servingUnit ?? 'g');
    setServingGrams(food?.servingGrams ? String(food.servingGrams) : '');
    setVisibility(food?.visibility ?? 'public');
    setMacros({
      proteinG: food?.proteinG ?? 0,
      fatG: food?.fatG ?? 0,
      carbohydrateG: food?.carbohydrateG ?? 0,
    });
    setCalories(food ? String(food.calories) : '');
    setCaloriesTouched(Boolean(food));
    setCalorieWarning(null);
    setError('');
  }, [food]);

  function updateMacro(field: keyof typeof macros, value: string) {
    const parsed = Number(value);
    setMacros((current) => {
      const next = { ...current, [field]: Number.isFinite(parsed) ? parsed : 0 };
      if (!caloriesTouched) {
        setCalories(String(Math.round(next.proteinG * 4 + next.fatG * 9 + next.carbohydrateG * 4)));
      }
      return next;
    });
    setCalorieWarning(null);
  }

  async function saveFood(caloriesToSave: number) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const isUpdate = Boolean(food?.id);
      const result = await api<{ food: Food }>(isUpdate ? `/foods/${food!.id}` : '/foods', { method: isUpdate ? 'PUT' : 'POST', body: JSON.stringify({
        description, servingQuantity: Number(servingQuantity), servingUnit, servingGrams: servingGrams ? Number(servingGrams) : null,
        proteinG: macros.proteinG, fatG: macros.fatG, carbohydrateG: macros.carbohydrateG,
        calories: caloriesToSave, visibility,
      }) });
      setDescription('');
      setServingQuantity('');
      setServingUnit('g');
      setVisibility('public');
      setMacros({ proteinG: 0, fatG: 0, carbohydrateG: 0 });
      setCalories('');
      setCaloriesTouched(false);
      setCalorieWarning(null);
      await onSave(result.food, isUpdate ? 'updated' : 'added');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Food could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      setError('');
      const enteredCalories = Number(calories || calculatedCalories);
      if (!Number.isFinite(enteredCalories) || enteredCalories < 0) {
        setError('Calories must be greater than or equal to zero.');
        return;
      }
      if (servingGramsRequired && !servingGrams) {
        setError('Serving grams is required for this unit.');
        return;
      }
      const difference = Math.abs(enteredCalories - calculatedCalories);
      const outsideTolerance = calculatedCalories > 0 ? difference / calculatedCalories > 0.1 : difference > 0;
      if (outsideTolerance) {
        setCalorieWarning({ entered: enteredCalories, calculated: calculatedCalories });
        return;
      }
      await saveFood(enteredCalories);
    }}>
      <label className="field">
        <span>Food name</span>
        <input name="description" placeholder="Chicken breast, cooked" value={description} onChange={(event) => setDescription(event.target.value)} required />
      </label>
      <div className="serving-row">
        <label className="field">
          <span>Serving quantity</span>
          <input name="servingQuantity" type="number" step="0.01" placeholder="100" value={servingQuantity} onChange={(event) => setServingQuantity(event.target.value)} required />
        </label>
        <label className="field">
          <span>Unit of Measure</span>
          <select name="servingUnit" value={servingUnit} onChange={(event) => setServingUnit(event.target.value)} required>
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
        <input name="servingGrams" type="number" step="0.01" placeholder={servingGramsRequired ? 'Required' : 'Auto for mass units'} value={servingGrams} onChange={(event) => setServingGrams(event.target.value)} required={servingGramsRequired} />
      </label>
      <div className="quad">
        <label className="field">
          <span>Protein grams</span>
          <input name="proteinG" type="number" step="0.1" placeholder="31" value={macros.proteinG || ''} onChange={(event) => updateMacro('proteinG', event.target.value)} />
        </label>
        <label className="field">
          <span>Fat grams</span>
          <input name="fatG" type="number" step="0.1" placeholder="3.6" value={macros.fatG || ''} onChange={(event) => updateMacro('fatG', event.target.value)} />
        </label>
        <label className="field">
          <span>Carb grams</span>
          <input name="carbohydrateG" type="number" step="0.1" placeholder="0" value={macros.carbohydrateG || ''} onChange={(event) => updateMacro('carbohydrateG', event.target.value)} />
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
        <select name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}><option value="public">Public</option><option value="private">Private</option></select>
      </label>
      {error && <p className="error-text">{error}</p>}
      {calorieWarning && (
        <div className="warning-box">
          <strong>Calories differ from macros.</strong>
          <span>Entered calories are {calorieWarning.entered}; calculated calories are {calorieWarning.calculated}.</span>
          <div className="form-actions">
            <button type="button" onClick={() => saveFood(calorieWarning.entered)} disabled={saving}>Use entered calories</button>
            <button type="button" className="ghost" onClick={() => saveFood(calorieWarning.calculated)} disabled={saving}>Use calculated calories</button>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button disabled={saving}><Plus size={16} /> {saving ? 'Saving...' : food?.id ? 'Save changes' : 'Add food'}</button>
        {food && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function FoodRow({ food, mine, reload, onCopy, onModify }: { food: Food; mine: boolean; reload: () => void; onCopy: () => void; onModify: () => void }) {
  return (
    <div className={`list-row${mine ? '' : ' other-food'}`}>
      <span><strong>{food.description}</strong><small>{food.servingQuantity}{food.servingUnit} - {food.proteinG}P {food.fatG}F {food.carbohydrateG}C - {food.visibility}</small></span>
      <span>{food.calories} cal</span>
      <div className="row-actions">
        {mine ? <button className="ghost" onClick={onModify}>Modify</button> : <button className="ghost" onClick={onCopy}>Copy</button>}
        {mine && <button className="ghost" onClick={async () => { await api(`/foods/${food.id}`, { method: 'DELETE' }); reload(); }}>Archive</button>}
      </div>
    </div>
  );
}

function SavedMeals({ user }: { user: User }) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const load = () => {
    api<{ meals: SavedMeal[] }>(`/saved-meals?scope=${scope}&search=${encodeURIComponent(search)}`).then((res) => setMeals(res.meals));
  };
  useEffect(load, [scope, search]);
  async function handleMealSaved() {
    setScope('all');
    setSearch('');
    await load();
    setEditingMeal(null);
  }
  return (
    <section>
      <Header title="Saved Meals" icon={<ChefHat />} />
      <SearchTools scope={scope} setScope={setScope} search={search} setSearch={setSearch} />
      <Panel title={editingMeal ? 'Modify Meal' : 'Create Meal'}><MealForm meal={editingMeal} onSave={handleMealSaved} onCancel={() => setEditingMeal(null)} /></Panel>
      <Panel title="Meal List">
        <div className="list">{meals.map((meal) => (
          <div className="list-row" key={meal.id}>
            <span><strong>{meal.name}</strong><small>{meal.visibility} - {meal.items.length} items</small></span>
            <div className="row-actions">
              {meal.ownerUserId === user.id ? <button className="ghost" onClick={() => setEditingMeal(meal)}>Modify</button> : <button className="ghost" onClick={() => setEditingMeal({ ...meal, id: '', ownerUserId: user.id })}>Copy</button>}
              {meal.ownerUserId === user.id && <button className="ghost" onClick={async () => { await api(`/saved-meals/${meal.id}`, { method: 'DELETE' }); load(); }}>Archive</button>}
            </div>
          </div>
        ))}</div>
      </Panel>
    </section>
  );
}

function MealForm({ meal, onSave, onCancel }: { meal: SavedMeal | null; onSave: () => Promise<void>; onCancel?: () => void }) {
  const [items, setItems] = useState<MealItem[]>([{ foodId: '', quantity: 1, quantityUnit: 'g' }]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meal) {
      setName(meal.name);
      setDescription(meal.description ?? '');
      setVisibility(meal.visibility);
      setItems(meal.items.length ? meal.items : [{ foodId: '', quantity: 1, quantityUnit: 'g' }]);
    } else {
      setName('');
      setDescription('');
      setVisibility('private');
      setItems([{ foodId: '', quantity: 1, quantityUnit: 'g' }]);
    }
  }, [meal]);

  function updateItem(index: number, patch: Partial<MealItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const isUpdate = Boolean(meal?.id);
        await api(isUpdate ? `/saved-meals/${meal!.id}` : '/saved-meals', {
          method: isUpdate ? 'PUT' : 'POST',
          body: JSON.stringify({
            name,
            description,
            visibility,
            items: items.filter((item) => item.foodId).map((item) => ({ foodId: item.foodId, quantity: item.quantity, quantityUnit: item.quantityUnit })),
          }),
        });
        if (!isUpdate) {
          setName('');
          setDescription('');
          setVisibility('private');
          setItems([{ foodId: '', quantity: 1, quantityUnit: 'g' }]);
        }
        await onSave();
      } finally {
        setSaving(false);
      }
    }}>
      <input name="name" placeholder="Breakfast eggs and sausage" value={name} onChange={(event) => setName(event.target.value)} required />
      <input name="description" placeholder="Notes" value={description} onChange={(event) => setDescription(event.target.value)} />
      <div className="meal-items">
        {items.map((item, index) => (
          <div className="meal-item" key={index}>
            <MealFoodPicker item={item} onChange={(patch) => updateItem(index, patch)} />
            <input value={item.quantity} type="number" step="0.01" placeholder="Qty" required onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
            <select value={item.quantityUnit} required onChange={(event) => updateItem(index, { quantityUnit: event.target.value })} aria-label="Quantity unit">
              {quantityUnitOptions(item.quantityUnit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
            <button type="button" className="ghost" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}>Remove</button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost" onClick={() => setItems((current) => [...current, { foodId: '', quantity: 1, quantityUnit: 'g' }])}>Add item</button>
      <select name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'public')}><option value="private">Private</option><option value="public">Public</option></select>
      <div className="form-actions">
        <button><Plus size={16} /> {meal ? 'Update meal' : 'Create meal'}</button>
        {meal && onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function MealFoodPicker({ item, onChange }: { item: MealItem; onChange: (patch: Partial<MealItem>) => void }) {
  const [search, setSearch] = useState(item.foodDescription ?? '');
  const [results, setResults] = useState<Food[]>([]);

  useEffect(() => {
    setSearch(item.foodDescription ?? '');
  }, [item.foodId, item.foodDescription]);

  useEffect(() => {
    const query = search.trim();
    if (!query || query === item.foodDescription) {
      setResults([]);
      return;
    }
    let ignore = false;
    api<{ foods: Food[] }>(`/foods?scope=all&search=${encodeURIComponent(query)}`).then((res) => {
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
          onChange({ foodId: '', foodDescription: '' });
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
                onChange({ foodId: food.id, foodDescription: food.description, quantityUnit: food.servingUnit });
              }}
            >
              <span>{food.description}</span>
              <small>{food.servingQuantity}{food.servingUnit} - {food.proteinG}P {food.fatG}F {food.carbohydrateG}C</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function quantityUnitOptions(currentUnit: string) {
  const units = ['g', 'oz', 'lb', 'kg'];
  if (currentUnit && !units.includes(currentUnit)) units.push(currentUnit);
  return units;
}

function History() {
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [data, setData] = useState<any>(null);
  useEffect(() => { api(`/reports/summary?start=${start}&end=${end}`).then(setData); }, [start, end]);
  return <section><Header title="History" icon={<CalendarDays />} /><DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} /><Panel title="Daily Totals"><Table rows={data?.days ?? []} /></Panel></section>;
}

function Reports() {
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [summary, setSummary] = useState<any>(null);
  const [maintenance, setMaintenance] = useState<any>(null);
  useEffect(() => {
    api(`/reports/summary?start=${start}&end=${end}`).then(setSummary);
    api(`/reports/maintenance?start=${start}&end=${end}`).then(setMaintenance).catch((err) => setMaintenance({ error: err.message }));
  }, [start, end]);
  return (
    <section>
      <Header title="Reports" icon={<BarChart3 />} />
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <div className="metric-grid">
        <Metric label="Logged Days" value={summary?.days?.length ?? 0} />
        <Metric label="Weights" value={summary?.weights?.length ?? 0} />
        <Metric label="Maintenance" value={maintenance?.estimatedMaintenanceCalories ? `${maintenance.estimatedMaintenanceCalories} cal` : 'Need data'} />
      </div>
      <Panel title="Maintenance Estimate">
        {maintenance?.error ? (
          <p>{maintenance.error}</p>
        ) : maintenance?.canCalculate === false ? (
          <p>{maintenance.message}</p>
        ) : maintenance ? (
          <p>From {maintenance.startWeight.date} at {maintenance.startWeight.value} {maintenance.startWeight.unit} to {maintenance.endWeight.date} at {maintenance.endWeight.value} {maintenance.endWeight.unit}, estimated maintenance is about <strong>{maintenance.estimatedMaintenanceCalories} calories/day</strong>.</p>
        ) : null}
      </Panel>
      <Panel title="Calories by Day"><Bars rows={summary?.days ?? []} /></Panel>
    </section>
  );
}

function Goals() {
  const [activePlan, setActivePlan] = useState<any>(null);
  const [allGoals, setAllGoals] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const loadActive = () => api('/goal-plans/active').then(setActivePlan);
  const loadAll = (archived = false) => api<{ ok: boolean; plans: any[] }>(`/goal-plans?archived=${archived}`).then((res) => setAllGoals(res.plans || []));
  useEffect(() => {
    void loadActive();
    void loadAll(showArchived);
  }, [showArchived]);
  const getStatus = (targetDate: string): 'ongoing' | 'achieved' | 'missed' => {
    const now = new Date().toISOString().slice(0, 10);
    if (targetDate > now) return 'ongoing';
    return 'missed';
  };
  return (
    <section>
      <Header title="Goals" icon={<Target />} />
      {activePlan?.plan && (
        <Panel title="Current Goal">
          <p>Goal: <strong>{activePlan.plan.goal_weight_value} {activePlan.plan.goal_weight_unit}</strong> by <strong>{activePlan.plan.target_date}</strong></p>
          <p>
            {activePlan.goalPace
              ? `Needed average: ${activePlan.goalPace.direction === 'maintain' ? 'maintain weight' : `${activePlan.goalPace.direction} ${Math.abs(activePlan.goalPace.weeklyChangeLb)} lb/week`} from ${activePlan.goalPace.latestWeight.value} ${activePlan.goalPace.latestWeight.unit} on ${activePlan.goalPace.latestWeight.date}.`
              : 'Add a current weight to calculate the weekly pace needed.'}
          </p>
        </Panel>
      )}
      <Panel title="Goal Plan">
        <form onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api('/goal-plans', { method: 'POST', body: JSON.stringify({ goalWeightValue: numberValue(form.get('goalWeightValue')), goalWeightUnit: form.get('goalWeightUnit'), targetDate: form.get('targetDate') }) });
          loadActive();
          loadAll(showArchived);
          (event.target as HTMLFormElement).reset();
        }}>
          <div className="row"><input name="goalWeightValue" type="number" step="0.1" placeholder="Goal weight" required /><select name="goalWeightUnit"><option>lb</option><option>kg</option></select></div>
          <input name="targetDate" type="date" required />
          <button><Target size={16} /> Save goal</button>
        </form>
      </Panel>
      <Panel title="Suggested Calories">
        {activePlan?.calculation ? <p>Target about <strong>{activePlan.calculation.targetCalories} calories/day</strong>. Required pace is {activePlan.calculation.weeklyChangeLb} lb/week. {activePlan.calculation.unrealistic && 'This target appears aggressive.'}</p> : <p>{activePlan?.message ?? 'Create a goal and add weight entries to calculate a target.'}</p>}
      </Panel>
      <Panel title="All Goals">
        <div className="toolbar">
          <button className="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide' : 'Show'} Archived</button>
        </div>
        <div className="list">
          {allGoals.length ? allGoals.map((goal) => (
            <div key={goal.id} className="list-row">
              <span>
                <strong>{goal.goal_weight_value} {goal.goal_weight_unit}</strong>
                <small>Target: {goal.target_date} · Status: <strong>{getStatus(goal.target_date)}</strong></small>
              </span>
              <button className="ghost" onClick={async () => { await api(`/goal-plans/${goal.id}`, { method: 'PUT' }); loadAll(showArchived); }}>Archive</button>
            </div>
          )) : <p>{showArchived ? 'No archived goals.' : 'No active goals.'}</p>}
        </div>
      </Panel>
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
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    preferredWeightUnit: user.preferredWeightUnit,
    proteinGoalG: user.proteinGoalG == null ? '' : String(user.proteinGoalG),
    calorieGoalType: user.calorieGoalType,
    calorieGoalValue: user.calorieGoalValue == null ? '' : String(user.calorieGoalValue),
    timezone: user.timezone ?? 'America/New_York',
  };
}

function SettingsPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [settingsForm, setSettingsForm] = useState(() => getSettingsForm(user));
  const [savingSettings, setSavingSettings] = useState(false);
  const savedSettingsForm = useMemo(() => getSettingsForm(user), [user]);
  const settingsChanged = useMemo(
    () => JSON.stringify(settingsForm) !== JSON.stringify(savedSettingsForm),
    [settingsForm, savedSettingsForm],
  );

  useEffect(() => {
    setSettingsForm(getSettingsForm(user));
  }, [user]);

  const updateSettingsField = (field: keyof SettingsForm, value: string) => {
    setSettingsForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <section>
      <Header title="Settings" icon={<Settings />} />
      <Panel title="User Settings">
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (!settingsChanged || savingSettings) return;
          setSavingSettings(true);
          try {
            const res = await api<{ user: User }>('/me/settings', { method: 'PUT', body: JSON.stringify({
              firstName: settingsForm.firstName,
              lastName: settingsForm.lastName,
              proteinGoalG: numberValue(settingsForm.proteinGoalG),
              calorieGoalValue: numberValue(settingsForm.calorieGoalValue),
              calorieGoalType: settingsForm.calorieGoalType,
              preferredWeightUnit: settingsForm.preferredWeightUnit,
              timezone: settingsForm.timezone,
            }) });
            setUser(res.user);
          } finally {
            setSavingSettings(false);
          }
        }}>
          <div className="settings-row">
            <label className="field">
              <span>First name</span>
              <input name="firstName" value={settingsForm.firstName} onChange={(event) => updateSettingsField('firstName', event.target.value)} placeholder="First" />
            </label>
            <label className="field">
              <span>Last name</span>
              <input name="lastName" value={settingsForm.lastName} onChange={(event) => updateSettingsField('lastName', event.target.value)} placeholder="Last" />
            </label>
          </div>
          <div className="settings-row">
            <label className="field">
              <span>Preferred unit of measure for weight</span>
              <select name="preferredWeightUnit" value={settingsForm.preferredWeightUnit} onChange={(event) => updateSettingsField('preferredWeightUnit', event.target.value)}><option>lb</option><option>kg</option></select>
            </label>
            <label className="field">
              <span>Protein Goal in grams</span>
              <input name="proteinGoalG" type="number" step="1" value={settingsForm.proteinGoalG} onChange={(event) => updateSettingsField('proteinGoalG', event.target.value)} placeholder="160" />
            </label>
          </div>
          <div className="settings-row">
            <label className="field">
              <span>Calorie Goal Type</span>
              <select name="calorieGoalType" value={settingsForm.calorieGoalType} onChange={(event) => updateSettingsField('calorieGoalType', event.target.value)}>
                <option value="manual">Manual</option>
                <option value="goal-based">Goal-Based</option>
              </select>
            </label>
            <label className="field">
              <span>Calorie Goal Value</span>
              <input name="calorieGoalValue" type="number" step="1" value={settingsForm.calorieGoalValue} onChange={(event) => updateSettingsField('calorieGoalValue', event.target.value)} placeholder="2000" />
            </label>
          </div>
          <label className="field">
            <span>User timezone</span>
            <select name="timezone" value={settingsForm.timezone} onChange={(event) => updateSettingsField('timezone', event.target.value)}>
              {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
            </select>
          </label>
          <button disabled={!settingsChanged || savingSettings}><Settings size={16} /> {settingsChanged ? savingSettings ? 'Saving...' : 'Save settings' : 'Saved'}</button>
        </form>
      </Panel>
      <Panel title="Danger Zone">
        <button className="danger-button" onClick={() => setConfirmDelete(true)}>DELETE ALL MY DATA</button>
        {confirmDelete && (
          <div className="warning-box">
            <strong>All diary data will be deleted.</strong>
            <span>This deletes diary entries, weights, goals, private foods, and private meals. Public foods and public meals you created will remain.</span>
            <div className="form-actions">
              <button
                className="danger-button"
                onClick={async () => {
                  await api('/me/delete-data', { method: 'POST', body: JSON.stringify({ confirm: 'YES! I understand!' }) });
                  setConfirmDelete(false);
                  setDeleteMessage('Your diary data and private foods/meals were deleted.');
                }}
              >
                YES! I understand!
              </button>
              <button className="ghost" onClick={() => setConfirmDelete(false)}>NO! Do not delete me!</button>
            </div>
          </div>
        )}
        {deleteMessage && <div className="notice success">{deleteMessage}</div>}
      </Panel>
    </section>
  );
}

function Header({ title, icon }: { title: string; icon: React.ReactNode }) {
  return <div className="page-header"><span>{icon}</span><h1>{title}</h1></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="panel"><h2>{title}</h2>{children}</div>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function SearchTools({ scope, setScope, search, setSearch }: { scope: string; setScope: (scope: string) => void; search: string; setSearch: (search: string) => void }) {
  return <div className="toolbar"><input placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All</option><option value="mine">Mine</option><option value="public">Public</option></select></div>;
}

function DateRange({ start, end, setStart, setEnd }: { start: string; end: string; setStart: (date: string) => void; setEnd: (date: string) => void }) {
  return <div className="toolbar"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></div>;
}

function Table({ rows }: { rows: any[] }) {
  return <div className="table">{rows.map((row) => <div className="table-row" key={row.date}><span>{row.date}</span><span>{Math.round(row.calories ?? 0)} cal</span><span>{Math.round(row.proteinG ?? 0)}g P</span><span>{Math.round(row.fatG ?? 0)}g F</span><span>{Math.round(row.carbohydrateG ?? 0)}g C</span></div>)}</div>;
}

function Bars({ rows }: { rows: any[] }) {
  const max = useMemo(() => Math.max(1, ...rows.map((row) => Number(row.calories ?? 0))), [rows]);
  return <div className="bars">{rows.map((row) => <div className="bar-row" key={row.date}><span>{row.date}</span><div><i style={{ width: `${(Number(row.calories ?? 0) / max) * 100}%` }} /></div><strong>{Math.round(row.calories ?? 0)}</strong></div>)}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
