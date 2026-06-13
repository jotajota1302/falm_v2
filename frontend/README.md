# FALM V2 — Frontend (Angular 18 + Supabase)

Frontend limpio de FALM V2. Conecta **directo a Supabase** (sin backend Java) vía
`@supabase/supabase-js`, con Auth por email y RLS.

## Crear el proyecto (una vez)

Este directorio contiene solo el **código de la app** (servicios, componentes, rutas).
El andamiaje de Angular se genera con la CLI y luego se copian estos archivos encima:

```bash
# desde FALM_V2/
npm install -g @angular/cli@18
ng new frontend --standalone --routing --style=css --skip-tests
cd frontend
npm install @supabase/supabase-js
# copiar los archivos de src/ de este repo encima de los generados
ng serve
```

## Estructura del código (lo que aporta este repo)

```
src/
  environments/environment.ts        ← URL + anon key de Supabase
  app/
    core/
      supabase.service.ts            ← cliente supabase (schema 'falm')
      auth.service.ts                ← login/registro/logout/sesión (email)
      auth.guard.ts                  ← protege rutas
      falm.service.ts                ← queries al schema falm (clasificación, etc.)
    features/
      auth/login.component.ts        ← login/registro
      dashboard/dashboard.component.ts
      competicion/clasificacion.component.ts  ← lee v_clasificacion
    app.component.ts                 ← shell: nav de 5 secciones + router
    app.routes.ts                    ← rutas (Dashboard, Mi equipo, Competición, Análisis, Admin)
```

## Requisito de backend (una vez, por el dueño del proyecto Supabase)

El schema `falm` debe estar **expuesto en la API** y con grants. Como el proyecto es
compartido, hazlo tú (o autoriza la migración):

1. **Dashboard → Settings → API → Exposed schemas**: añadir `falm` (junto a los que ya hay).
2. SQL (grants; RLS sigue filtrando filas):
   ```sql
   grant usage on schema falm to anon, authenticated;
   grant select, insert, update, delete on all tables in schema falm to authenticated;
   alter default privileges in schema falm grant select, insert, update, delete on tables to authenticated;
   ```
3. **Auth → Providers → Email** habilitado.

Sin el paso 1-2 el frontend conecta pero no ve datos (PostgREST no expone `falm`).

## Estado

Primer entregable: **Login + Dashboard + Clasificación** (lee `v_clasificacion`).
Siguientes: Mi equipo (plantilla/alineación), Fichajes, Premios, Análisis, Admin.
