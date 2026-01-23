-- supabase.sql
-- Safe Atendimento (fila + chamada) - Schema + RPCs atômicas + RLS básico
--
-- Fluxo suportado:
-- - Atendente: triagem e liberação (status -> pendente)
-- - Médico: chamar (lock atômico), finalizar, encaminhar, aceitar encaminhamento
-- - Painel: pode consumir "senhas" (fila) e/ou "senha_eventos" (últimas chamadas)
--
-- Observação:
-- - O Supabase Auth é e-mail/senha. Para "usuário/senha", use e-mail sintético no front:
--   `${username}@safe.local`
--
-- Requisitos:
-- - Execute este script no SQL Editor do Supabase.
-- - Depois crie usuários no Auth e registre seus perfis em public.profiles.

-- =========================
-- 0) Extensões
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- 1) Tabelas
-- =========================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  nome text not null,
  role text not null check (role in ('atendente','medico','enfermagem','fono','admin')),
  crm text,
  specialty text,
  created_at timestamptz not null default now()
);

-- Se a tabela já existir com constraint antiga, substitui de forma segura.
do $$
declare
  c_name text;
begin
  select con.conname into c_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%'
    and pg_get_constraintdef(con.oid) ilike '%in%';

  if c_name is not null then
    execute format('alter table public.profiles drop constraint %I', c_name);
  end if;
exception when undefined_table then
  -- primeira execução (sem tabela) não precisa fazer nada
  null;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('atendente','medico','enfermagem','fono','admin'));

create table if not exists public.senhas (
  id uuid primary key default gen_random_uuid(),
  senha text not null unique,
  nome text,
  cpf text,
  status text not null check (status in ('cadastro','pendente','em_atendimento','atendida','cancelada','nao_compareceu')),
  soc_status text not null default 'nao_verificado' check (soc_status in ('encontrado','nao_encontrado','nao_verificado')),
  encaminhamento jsonb,
  medico_atendendo_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  called_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.senha_eventos (
  id uuid primary key default gen_random_uuid(),
  senha_id uuid not null references public.senhas(id) on delete cascade,
  tipo text not null check (tipo in ('CRIADA','TRIAGEM_OK','CHAMADA','FINALIZADO','ENCAMINHADO','ENCAMINHAMENTO_ACEITO')),
  actor_profile_id uuid references public.profiles(id),
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_senhas_status on public.senhas(status);
create index if not exists idx_senhas_medico_atendendo on public.senhas(medico_atendendo_id);
create index if not exists idx_eventos_created_at on public.senha_eventos(created_at desc);
create index if not exists idx_eventos_tipo on public.senha_eventos(tipo);

-- =========================
-- 2) Triggers
-- =========================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_senhas_updated_at on public.senhas;
create trigger trg_senhas_updated_at
before update on public.senhas
for each row execute function public.set_updated_at();

-- =========================
-- 3) Helpers
-- =========================
create or replace function public.current_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- =========================
-- 4) RPCs (escrita via RPC para consistência e concorrência)
-- =========================

-- 4.1) Criar senha (atendente/admin)
create or replace function public.criar_senha(p_senha text, p_nome text default null, p_cpf text default null)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
  v_status text;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role not in ('atendente','admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_status := case
    when coalesce(trim(p_nome), '') <> '' then 'pendente'
    else 'cadastro'
  end;

  insert into public.senhas (senha, nome, cpf, status, soc_status)
  values (trim(p_senha), nullif(trim(p_nome),''), nullif(regexp_replace(coalesce(p_cpf,''), '\D', '', 'g'),''), v_status, 'nao_verificado')
  returning * into v_row;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (v_row.id, 'CRIADA', v_profile_id, jsonb_build_object('senha', v_row.senha, 'status', v_row.status));

  return v_row;
exception
  when unique_violation then
    raise exception 'senha_already_exists' using errcode = '23505';
end;
$$;

-- 4.2) Triagem/liberação (atendente/admin)
create or replace function public.triar_senha(
  p_senha text,
  p_nome text,
  p_cpf text,
  p_soc_status text
)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role not in ('atendente','admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_soc_status not in ('encontrado','nao_encontrado','nao_verificado') then
    raise exception 'invalid_soc_status' using errcode = '22023';
  end if;

  update public.senhas s
     set nome = nullif(trim(p_nome),''),
         cpf = nullif(regexp_replace(coalesce(p_cpf,''), '\D', '', 'g'),''),
         soc_status = p_soc_status,
         status = 'pendente'
   where s.senha = trim(p_senha)
     and s.status in ('cadastro','pendente')
     and s.medico_atendendo_id is null
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_locked' using errcode = 'P0002';
  end if;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (v_row.id, 'TRIAGEM_OK', v_profile_id, jsonb_build_object('senha', v_row.senha, 'soc_status', v_row.soc_status));

  return v_row;
end;
$$;

-- 4.3) Chamar (médico) - ATÔMICO
create or replace function public.chamar_senha(p_senha text)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role not in ('medico','enfermagem','fono') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Regra pedida:
  -- - médico/fono: só pode ter 1 senha em atendimento por vez
  -- - enfermagem: pode chamar mais de 1 por vez
  if v_role in ('medico','fono') then
    if exists (
      select 1
        from public.senhas s2
       where s2.status = 'em_atendimento'
         and s2.medico_atendendo_id = v_profile_id
       limit 1
    ) then
      raise exception 'already_in_attendance' using errcode = '23505';
    end if;
  end if;

  update public.senhas s
     set status = 'em_atendimento',
         medico_atendendo_id = v_profile_id,
         called_at = now()
   where s.senha = trim(p_senha)
     and s.status = 'pendente'
     and s.medico_atendendo_id is null
     and (
       s.encaminhamento is null
       or (s.encaminhamento->>'medicoDestinoId') is null
       or (s.encaminhamento->>'medicoDestinoId')::uuid = v_profile_id
     )
  returning * into v_row;

  if not found then
    raise exception 'already_taken_or_not_available' using errcode = '23505';
  end if;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (v_row.id, 'CHAMADA', v_profile_id, jsonb_build_object('senha', v_row.senha));

  return v_row;
end;
$$;

-- 4.4) Finalizar (médico)
create or replace function public.finalizar_senha(p_senha text)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role not in ('medico','enfermagem','fono') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.senhas s
     set status = 'atendida',
         medico_atendendo_id = null,
         finished_at = now()
   where s.senha = trim(p_senha)
     and s.status = 'em_atendimento'
     and s.medico_atendendo_id = v_profile_id
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_not_owner' using errcode = '42501';
  end if;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (v_row.id, 'FINALIZADO', v_profile_id, jsonb_build_object('senha', v_row.senha));

  return v_row;
end;
$$;

-- 4.5) Encaminhar (médico)
create or replace function public.encaminhar_senha(
  p_senha text,
  p_medico_destino_id uuid,
  p_motivo text default null,
  p_sala_destino text default null
)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
  v_enc jsonb;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role not in ('medico','enfermagem','fono') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_enc := jsonb_build_object(
    'tipo', 'medico',
    'medicoOrigemId', v_profile_id,
    'medicoDestinoId', p_medico_destino_id,
    'motivo', nullif(trim(coalesce(p_motivo,'')),''),
    'salaDestino', nullif(trim(coalesce(p_sala_destino,'')),''),
    'aceito', false,
    'createdAt', now()
  );

  update public.senhas s
     set status = 'pendente',
         medico_atendendo_id = null,
         encaminhamento = v_enc
   where s.senha = trim(p_senha)
     and s.status = 'em_atendimento'
     and s.medico_atendendo_id = v_profile_id
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_not_owner' using errcode = '42501';
  end if;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (
    v_row.id,
    'ENCAMINHADO',
    v_profile_id,
    jsonb_build_object('senha', v_row.senha, 'medicoDestinoId', p_medico_destino_id, 'salaDestino', p_sala_destino)
  );

  return v_row;
end;
$$;

-- 4.5.1) Encaminhar para exames (médico) - sem médico destino
create or replace function public.encaminhar_para_exame(
  p_senha text,
  p_sala_destino text,
  p_motivo text default null
)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
  v_enc jsonb;
  v_sala text;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role not in ('medico','enfermagem','fono') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_sala := nullif(trim(coalesce(p_sala_destino,'')),'');
  if v_sala is null then
    raise exception 'invalid_room' using errcode = '22023';
  end if;

  v_enc := jsonb_build_object(
    'tipo', 'exame',
    'medicoOrigemId', v_profile_id,
    'motivo', nullif(trim(coalesce(p_motivo,'')),''),
    'salaDestino', v_sala,
    'aceito', true,
    'createdAt', now()
  );

  update public.senhas s
     set status = 'pendente',
         medico_atendendo_id = null,
         encaminhamento = v_enc
   where s.senha = trim(p_senha)
     and s.status = 'em_atendimento'
     and s.medico_atendendo_id = v_profile_id
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_not_owner' using errcode = '42501';
  end if;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (
    v_row.id,
    'ENCAMINHADO',
    v_profile_id,
    jsonb_build_object('senha', v_row.senha, 'tipo', 'exame', 'salaDestino', v_sala)
  );

  return v_row;
end;
$$;

-- 4.6) Aceitar encaminhamento (médico destino)
create or replace function public.aceitar_encaminhamento(p_senha text)
returns public.senhas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
  v_row public.senhas;
  v_dest uuid;
begin
  v_profile_id := auth.uid();
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_role <> 'medico' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select (s.encaminhamento->>'medicoDestinoId')::uuid
    into v_dest
    from public.senhas s
   where s.senha = trim(p_senha);

  if v_dest is null or v_dest <> v_profile_id then
    raise exception 'not_destination' using errcode = '42501';
  end if;

  update public.senhas s
     set encaminhamento = jsonb_set(
       jsonb_set(coalesce(s.encaminhamento,'{}'::jsonb), '{aceito}', 'true'::jsonb, true),
       '{acceptedAt}', to_jsonb(now()), true
     )
   where s.senha = trim(p_senha)
     and s.status = 'pendente'
  returning * into v_row;

  if not found then
    raise exception 'not_found_or_invalid_state' using errcode = 'P0002';
  end if;

  insert into public.senha_eventos (senha_id, tipo, actor_profile_id, payload)
  values (v_row.id, 'ENCAMINHAMENTO_ACEITO', v_profile_id, jsonb_build_object('senha', v_row.senha));

  return v_row;
end;
$$;

-- =========================
-- 5) RLS (básico)
-- =========================
alter table public.profiles enable row level security;
alter table public.senhas enable row level security;
alter table public.senha_eventos enable row level security;

-- profiles: permitir leitura para autenticados (necessário para listar médicos no encaminhamento)
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles for select
using (auth.uid() is not null);

-- senhas: leitura para autenticados (front filtra por status/encaminhamento)
drop policy if exists senhas_select_authenticated on public.senhas;
create policy senhas_select_authenticated
on public.senhas for select
using (auth.uid() is not null);

-- eventos: leitura para autenticados (painel pode logar com usuário "painel" se quiser)
drop policy if exists eventos_select_authenticated on public.senha_eventos;
create policy eventos_select_authenticated
on public.senha_eventos for select
using (auth.uid() is not null);

-- Escrita: preferencialmente via RPCs acima (security definer).
-- Totem (sem login):
-- - Para testes em localhost (e cenários de totem em rede interna), permitimos INSERT para role anon
--   APENAS no estado "cadastro" e sem dados sensíveis (nome/medico).

drop policy if exists senhas_insert_anon_cadastro on public.senhas;
create policy senhas_insert_anon_cadastro
on public.senhas
for insert
to anon
with check (
  status = 'cadastro'
  and medico_atendendo_id is null
  and (nome is null or length(trim(nome)) = 0)
);

-- =========================
-- 6) Realtime (opcional, recomendado)
-- =========================
-- Para sincronizar a fila entre múltiplos usuários (atendente/médico/painel),
-- habilite Realtime na tabela `public.senhas`.
--
-- Observação: em projetos Supabase, a publication `supabase_realtime` já existe.
do $$
begin
  -- Evita erro se já estiver adicionada
  alter publication supabase_realtime add table public.senhas;
exception
  when duplicate_object then
    null;
  when undefined_object then
    -- Em ambientes fora do Supabase, a publication pode não existir.
    null;
end;
$$;

