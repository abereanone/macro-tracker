import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, CalendarDays, ChefHat, LogOut, Plus, Scale, Settings, Target, Utensils } from 'lucide-react';
import './styles.css';

type User = { id: string; email: string; proteinGoalG: number | null; calorieGoalValue: number | null; calorieGoalType: 'manual' | 'goal-based'; preferredWeightUnit: 'lb' | 'kg' };
type Food = {
  id: string;
  ownerUserId: string;
  description: string;
  servingQuantity: number;
  servingUnit: string;
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
      <aside className="nav">
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
  const [status, setStatus] = useState('');
  const load = () => {
    api(`/days/${date}`).then(setDay);
    api<{ foods: Food[] }>('/foods?scope=all').then((res) => setFoods(res.foods));
    api<{ meals: SavedMeal[] }>('/saved-meals?scope=all').then((res) => setMeals(res.meals));
  };
  useEffect(load, [date]);

  const totals = day?.totals;
  return (
    <section>
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
          <Metric label="Calories" value={Math.round(totals.calories)} />
          <Metric label="Protein %" value={`${totals.proteinPercent}%`} />
          <Metric label="Fat %" value={`${totals.fatPercent}%`} />
          <Metric label="Carb %" value={`${totals.carbohydratePercent}%`} />
        </div>
      )}
      <div className="goals-row">
        <div className={day?.proteinGoal?.met ? 'notice success' : 'notice'}>
          {day?.proteinGoal
            ? day.proteinGoal.met
              ? `Protein goal met: ${day.proteinGoal.actualG}g of ${day.proteinGoal.goalG}g`
              : `${Math.round(day.proteinGoal.remainingG)}g protein remaining`
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
      <div className="two-col">
        <Panel title="Log Food">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await api('/diary-items', {
                method: 'POST',
                body: JSON.stringify({
                  foodId: form.get('foodId'),
                  eatenDate: date,
                  mealLabel: form.get('mealLabel'),
                  quantity: numberValue(form.get('quantity'), 1),
                  quantityUnit: form.get('quantityUnit'),
                }),
              });
              event.currentTarget.reset();
              load();
            }}
          >
            <select name="foodId" required>{foods.map((food) => <option key={food.id} value={food.id}>{food.description}</option>)}</select>
            <div className="row"><input name="quantity" type="number" step="0.01" placeholder="Qty" required /><input name="quantityUnit" placeholder="Unit" defaultValue="g" required /></div>
            <select name="mealLabel" defaultValue="Lunch"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option><option>Other</option></select>
            <button><Plus size={16} /> Add food</button>
          </form>
        </Panel>
        <Panel title="Weight">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await api('/weight', { method: 'POST', body: JSON.stringify({ entryDate: date, weightValue: numberValue(form.get('weightValue')), weightUnit: form.get('weightUnit') }) });
              load();
            }}
          >
            <div className="row"><input name="weightValue" type="number" step="0.1" placeholder={day?.weight?.weight_value ?? 'Weight'} required /><select name="weightUnit" defaultValue={user.preferredWeightUnit}><option>lb</option><option>kg</option></select></div>
            <button><Scale size={16} /> Save weight</button>
          </form>
          {day?.weight && <p>{day.weight.weight_value} {day.weight.weight_unit} logged for this day.</p>}
        </Panel>
      </div>
      <Panel title="Add Saved Meal">
        <div className="field">
          <span>Meal Label</span>
          <select value={mealLabel} onChange={(event) => setMealLabel(event.target.value)}>
            <option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option><option>Other</option>
          </select>
        </div>
        <div className="list compact">
          {meals.map((meal) => <button key={meal.id} onClick={async () => { await api(`/saved-meals/${meal.id}/add-to-diary`, { method: 'POST', body: JSON.stringify({ eatenDate: date, mealLabel }) }); load(); }}>{meal.name}</button>)}
        </div>
      </Panel>
      <Panel title="Diary">
        <div className="list">
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
      <Panel title="Last 8 Foods Added">
        <div className="list">{foods.map((food) => <FoodRow key={food.id} food={food} mine={food.ownerUserId === user.id} reload={load} onCopy={() => setEditingFood({ ...food, id: '', ownerUserId: user.id })} onModify={() => setEditingFood(food)} />)}</div>
      </Panel>
    </section>
  );
}

function FoodForm({ food, onSave, onCancel }: { food: Food | null; onSave: (food: Food, action: 'added' | 'updated') => Promise<void>; onCancel: () => void }) {
  const [description, setDescription] = useState('');
  const [servingQuantity, setServingQuantity] = useState('');
  const [servingUnit, setServingUnit] = useState('g');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [macros, setMacros] = useState({ proteinG: 0, fatG: 0, carbohydrateG: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const calculatedCalories = Math.round(macros.proteinG * 4 + macros.fatG * 9 + macros.carbohydrateG * 4);

  useEffect(() => {
    setDescription(food?.description ?? '');
    setServingQuantity(food ? String(food.servingQuantity) : '');
    setServingUnit(food?.servingUnit ?? 'g');
    setVisibility(food?.visibility ?? 'public');
    setMacros({
      proteinG: food?.proteinG ?? 0,
      fatG: food?.fatG ?? 0,
      carbohydrateG: food?.carbohydrateG ?? 0,
    });
    setError('');
  }, [food]);

  function updateMacro(field: keyof typeof macros, value: string) {
    const parsed = Number(value);
    setMacros((current) => ({ ...current, [field]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      setError('');
      try {
        const isUpdate = Boolean(food?.id);
        const result = await api<{ food: Food }>(isUpdate ? `/foods/${food!.id}` : '/foods', { method: isUpdate ? 'PUT' : 'POST', body: JSON.stringify({
          description, servingQuantity: Number(servingQuantity), servingUnit,
          proteinG: macros.proteinG, fatG: macros.fatG, carbohydrateG: macros.carbohydrateG,
          calories: calculatedCalories, visibility,
        }) });
        setDescription('');
        setServingQuantity('');
        setServingUnit('g');
        setVisibility('public');
        setMacros({ proteinG: 0, fatG: 0, carbohydrateG: 0 });
        await onSave(result.food, isUpdate ? 'updated' : 'added');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Food could not be saved.');
      } finally {
        setSaving(false);
      }
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
            <option value="tbsp">tbsp</option>
            <option value="unit">unit</option>
            <option value="package">package</option>
          </select>
        </label>
      </div>
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
          <input name="calories" type="number" value={calculatedCalories} readOnly />
        </label>
      </div>
      <label className="field">
        <span>Visibility</span>
        <select name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}><option value="public">Public</option><option value="private">Private</option></select>
      </label>
      {error && <p className="error-text">{error}</p>}
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
  const [foods, setFoods] = useState<Food[]>([]);
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const load = () => {
    api<{ meals: SavedMeal[] }>(`/saved-meals?scope=${scope}&search=${encodeURIComponent(search)}`).then((res) => setMeals(res.meals));
    api<{ foods: Food[] }>('/foods?scope=all').then((res) => setFoods(res.foods));
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
      <Panel title={editingMeal ? 'Modify Meal' : 'Create Meal'}><MealForm meal={editingMeal} foods={foods} onSave={handleMealSaved} onCancel={() => setEditingMeal(null)} /></Panel>
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

function MealForm({ meal, foods, onSave, onCancel }: { meal: SavedMeal | null; foods: Food[]; onSave: () => Promise<void>; onCancel?: () => void }) {
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
      setItems([{ foodId: foods[0]?.id ?? '', quantity: 1, quantityUnit: foods[0]?.servingUnit ?? 'g' }]);
    }
  }, [meal, foods]);

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
          setItems([{ foodId: foods[0]?.id ?? '', quantity: 1, quantityUnit: foods[0]?.servingUnit ?? 'g' }]);
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
            <select value={item.foodId} required onChange={(event) => {
              const food = foods.find((candidate) => candidate.id === event.target.value);
              updateItem(index, { foodId: event.target.value, quantityUnit: food?.servingUnit ?? item.quantityUnit });
            }}>
              <option value="">Select a food</option>
              {foods.map((food) => <option key={food.id} value={food.id}>{food.description}</option>)}
            </select>
            <input value={item.quantity} type="number" step="0.01" placeholder="Qty" required onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
            <input value={item.quantityUnit} placeholder="Unit" required onChange={(event) => updateItem(index, { quantityUnit: event.target.value })} />
            <button type="button" className="ghost" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}>Remove</button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost" onClick={() => setItems((current) => [...current, { foodId: foods[0]?.id ?? '', quantity: 1, quantityUnit: foods[0]?.servingUnit ?? 'g' }])}>Add item</button>
      <select name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'public')}><option value="private">Private</option><option value="public">Public</option></select>
      <div className="form-actions">
        <button><Plus size={16} /> {meal ? 'Update meal' : 'Create meal'}</button>
        {meal && onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
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
          <p>Goal weight: <strong>{activePlan.plan.goal_weight_value} {activePlan.plan.goal_weight_unit}</strong></p>
          <p>Target date: <strong>{activePlan.plan.target_date}</strong></p>
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

function SettingsPage({ user, setUser }: { user: User; setUser: (user: User) => void }) {
  return (
    <section>
      <Header title="Settings" icon={<Settings />} />
      <Panel title="User Settings">
        <form onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const res = await api<{ user: User }>('/me/settings', { method: 'PUT', body: JSON.stringify({ proteinGoalG: numberValue(form.get('proteinGoalG')), calorieGoalValue: numberValue(form.get('calorieGoalValue')), calorieGoalType: form.get('calorieGoalType'), preferredWeightUnit: form.get('preferredWeightUnit') }) });
          setUser(res.user);
        }}>
          <label className="field">
            <span>Protein Goal in grams</span>
            <input name="proteinGoalG" type="number" step="1" defaultValue={user.proteinGoalG ?? ''} placeholder="160" />
          </label>
          <label className="field">
            <span>Calorie Goal Type</span>
            <select name="calorieGoalType" defaultValue={user.calorieGoalType}>
              <option value="manual">Manual</option>
              <option value="goal-based">Goal-Based</option>
            </select>
          </label>
          <label className="field">
            <span>Calorie Goal Value</span>
            <input name="calorieGoalValue" type="number" step="1" defaultValue={user.calorieGoalValue ?? ''} placeholder="2000" />
          </label>
          <label className="field">
            <span>Preferred unit of measure for weight</span>
            <select name="preferredWeightUnit" defaultValue={user.preferredWeightUnit}><option>lb</option><option>kg</option></select>
          </label>
          <button><Settings size={16} /> Save settings</button>
        </form>
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
