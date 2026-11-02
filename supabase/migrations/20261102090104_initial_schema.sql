-- Fase 1: Grunddata. Femten tabeller, RLS slået til med fuld adgang for indloggede brugere.
-- Se SPEC.md -> "Datamodel" for baggrund.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users (id) on delete set null,
  kcal numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tjek_dealer_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- settings (én række for husstanden)
-- ---------------------------------------------------------------------------
create table settings (
  id boolean primary key default true,
  lat numeric,
  lng numeric,
  radius_km numeric not null default 10,
  shopping_day int not null default 6 check (shopping_day between 1 and 7), -- 1 = mandag .. 7 = søndag
  max_stores int not null default 2,
  primary_store_id uuid references stores (id) on delete set null,
  default_budget numeric not null default 700,
  budget_type text not null default 'mål' check (budget_type in ('loft', 'mål')),
  default_meal_grid jsonb not null default '{}'::jsonb,
  meal_shares jsonb not null default '{"morgenmad": 0.20, "frokost": 0.30, "aftensmad": 0.35, "snack": 0.15}'::jsonb,
  tolerances jsonb not null default '{}'::jsonb,
  guest_portion_kcal numeric not null default 700,
  max_prep_weekday_min int not null default 30,
  dislikes text[] not null default '{}',
  allergies text[] not null default '{}',
  constraint settings_singleton check (id)
);

-- ---------------------------------------------------------------------------
-- foods (næringsdata pr. 100 g)
-- ---------------------------------------------------------------------------
create table foods (
  id uuid primary key default gen_random_uuid(),
  frida_id text,
  name_da text not null,
  kcal numeric not null,
  protein numeric not null,
  carbs numeric not null,
  fat numeric not null,
  fiber numeric,
  source text not null default 'frida' check (source in ('frida', 'estimate')),
  created_at timestamptz not null default now()
);

create index foods_name_da_trgm on foods using gin (name_da gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ingredient_food_map (cache: ingrediensnavn -> food)
-- ---------------------------------------------------------------------------
create table ingredient_food_map (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null unique,
  food_id uuid references foods (id) on delete set null,
  confidence numeric,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- offers (rå og normaliserede tilbud)
-- ---------------------------------------------------------------------------
create table offers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  source text not null default 'tjek' check (source in ('tjek', 'manual')),
  external_id text not null,
  raw jsonb,
  heading text not null,
  price numeric,
  quantity_text text,
  valid_from date,
  valid_until date,
  image_url text,
  fetched_at timestamptz not null default now(),
  -- normaliseret af CLAUDE_MODEL_FAST
  is_food boolean,
  category text check (
    category in (
      'frugt_grønt', 'kød', 'fisk', 'mejeri_æg', 'brød',
      'kolonial', 'frost', 'drikke', 'snacks', 'andet'
    )
  ),
  ingredient_name text,
  pack_count numeric,
  pack_size numeric,
  pack_unit text check (pack_unit in ('g', 'ml', 'stk')),
  total_price numeric,
  min_purchase int,
  conditions text,
  needs_review boolean not null default false,
  food_id uuid references foods (id) on delete set null,
  unique (store_id, external_id)
);

-- ---------------------------------------------------------------------------
-- pantry_items (beholdning og basisvarer)
-- ---------------------------------------------------------------------------
create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric,
  unit text,
  location text check (location in ('køleskab', 'fryser', 'skab')),
  use_soon boolean not null default false,
  use_by date,
  is_staple boolean not null default false,
  out_of_stock boolean not null default false,
  food_id uuid references foods (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- price_list (normalpriser)
-- ---------------------------------------------------------------------------
create table price_list (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null,
  pack_size numeric,
  pack_unit text,
  store_id uuid references stores (id) on delete set null,
  is_estimate boolean not null default true,
  created_at timestamptz not null default now()
);

create index price_list_name_trgm on price_list using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  base_servings numeric not null default 2,
  prep_minutes int,
  steps text[] not null default '{}',
  tags text[] not null default '{}',
  rating int check (rating in (-1, 0, 1)),
  favorite boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- ---------------------------------------------------------------------------
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  name text not null,
  grams_raw numeric not null,
  food_id uuid references foods (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- week_plans
-- ---------------------------------------------------------------------------
create table week_plans (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status text not null default 'draft' check (status in ('draft', 'approved', 'done')),
  budget numeric,
  budget_type text check (budget_type in ('loft', 'mål')),
  macro_modes jsonb not null default '{}'::jsonb,
  meal_grid jsonb not null default '{}'::jsonb,
  wishes text,
  totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- planned_meals
-- ---------------------------------------------------------------------------
create table planned_meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references week_plans (id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('morgenmad', 'frokost', 'aftensmad', 'snack')),
  recipe_id uuid references recipes (id) on delete set null,
  locked boolean not null default false,
  servings numeric not null default 1,
  portion_factors jsonb not null default '{}'::jsonb,
  cooked_at timestamptz,
  computed_status text check (computed_status in ('grøn', 'gul', 'rød'))
);

-- ---------------------------------------------------------------------------
-- planned_ingredients
-- ---------------------------------------------------------------------------
create table planned_ingredients (
  id uuid primary key default gen_random_uuid(),
  planned_meal_id uuid not null references planned_meals (id) on delete cascade,
  name text not null,
  grams_raw numeric not null,
  source text not null check (source in ('offer', 'pantry', 'staple', 'buy')),
  offer_id uuid references offers (id) on delete set null,
  pantry_item_id uuid references pantry_items (id) on delete set null,
  food_id uuid references foods (id) on delete set null,
  cost_dkk numeric
);

-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------
create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references week_plans (id) on delete cascade,
  store_id uuid references stores (id) on delete set null,
  name text not null,
  packs numeric not null default 1,
  pack_size numeric,
  pack_unit text,
  price_dkk numeric,
  offer_id uuid references offers (id) on delete set null,
  is_extra boolean not null default false,
  checked boolean not null default false,
  checked_by uuid references people (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- ai_calls (forbrugslog)
-- ---------------------------------------------------------------------------
create table ai_calls (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: fuld adgang for indloggede brugere på alle tabeller.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'people', 'stores', 'settings', 'foods', 'ingredient_food_map',
      'offers', 'pantry_items', 'price_list', 'recipes', 'recipe_ingredients',
      'week_plans', 'planned_meals', 'planned_ingredients', 'shopping_list_items',
      'ai_calls'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated_full_access', t
    );
  end loop;
end $$;
