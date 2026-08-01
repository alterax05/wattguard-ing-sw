# WattGuard Authentication System

Sistema di autenticazione invite-only con supporto per password locali e Google OAuth (linked accounts).

## Caratteristiche

- **Invite-only**: Solo gli utenti invitati possono creare un account
- **Dual auth**: Password locale o Google OAuth (o entrambi sullo stesso account)
- **Auto-linking**: Gli account Google con email verificata si collegano automaticamente agli account esistenti
- **JWT**: Autenticazione via JWT con supporto per header `Authorization: Bearer` e cookie `httpOnly`
- **SMTP**: Invio email via Gmail (STARTTLS porta 587)

## Setup

1. Copia `.env.example` in `.env` e configura:

```bash
cp .env.example .env
```

2. Configura le variabili d'ambiente:

### MongoDB
```env
MONGO_URI=mongodb://localhost:27017/wattguard
```

### JWT
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### Google OAuth
Crea un progetto su [Google Cloud Console](https://console.cloud.google.com/):
- Abilita "Google+ API"
- Crea credenziali OAuth 2.0
- Aggiungi redirect URI: `http://localhost:3000/api/auth/google/callback`

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### SMTP (Gmail)
Per Gmail:
1. Abilita autenticazione a 2 fattori
2. Genera una "App Password" da https://myaccount.google.com/apppasswords
3. Usa quella password (non la password normale)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

### Frontend
```env
FRONTEND_URL=http://localhost:5173
```

3. Installa dipendenze:
```bash
bun install
```

4. Avvia MongoDB (se locale):
```bash
mongod
```

5. Avvia l'app:
```bash
bun run dev
```

## Flusso di autenticazione

### 1. Creazione primo admin (manualmente via MongoDB)

Dato che il sistema è invite-only, devi creare il primo admin manualmente:

```bash
# Connettiti a MongoDB
mongosh wattguard

# Crea il primo admin con password
db.users.insertOne({
  email: "admin@example.com",
  role: "admin",
  isDisabled: false,
  passwordHash: "$2b$10$...",  # usa Bun.password.hash() per generare
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Oppure usa questo script Bun:

```typescript
// scripts/create-first-admin.ts
import mongoose from "mongoose";
import { User } from "./src/models/User";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/wattguard";

await mongoose.connect(MONGO_URI);

const passwordHash = await Bun.password.hash("your-password", {
  algorithm: "bcrypt",
  cost: 10,
});

await User.create({
  email: "admin@example.com",
  role: "admin",
  isDisabled: false,
  passwordHash,
});

console.log("✅ Admin created");
process.exit(0);
```

Esegui: `bun run scripts/create-first-admin.ts`

### 2. Admin crea inviti

```bash
POST /api/admin/invites
Authorization: Bearer <jwt>

{
  "email": "user@example.com",
  "role": "operator"
}
```

L'utente riceverà un'email con un link del tipo:
```
http://localhost:5173/accept-invite?token=abc123...
```

### 3. Utente accetta invito

L'utente clicca sul link e può scegliere:

#### Opzione A: Google OAuth
- Clicca "Continua con Google"
- Completa OAuth
- Account creato e collegato a Google

#### Opzione B: Password locale
- Clicca "Imposta Password"
- Inserisce password (min 8 caratteri)
- Account creato con password

### 4. Login successivi

#### Con password:
```bash
POST /api/auth/local/login
{
  "email": "user@example.com",
  "password": "..."
}
```

#### Con Google:
Vai su `/api/auth/google/start?inviteToken=...` (solo per nuovi account) oppure implementa un flusso Google per login esistenti.

### 5. Password Dimenticata (Reset)

Se un utente dimentica la password, può reimpostarla:

1. **Richiesta reset**: L'utente va su `/forgot-password` e inserisce la sua email
2. **Email ricevuta**: Riceve un'email con un link del tipo:
   ```
   http://localhost:5173/reset-password?token=abc123...
   ```
3. **Imposta nuova password**: Clicca sul link, inserisce la nuova password (min 8 caratteri)
4. **Login con nuova password**: Il token viene invalidato e può fare login con la nuova password

**Importante**:
- Il link di reset scade dopo **1 ora**
- Il token può essere usato **una sola volta** (one-time use)
- Dopo il reset, il vecchio token viene eliminato automaticamente
- Il sistema non rivela se un'email esiste (previene email enumeration)

#### Flusso API per Reset Password

```bash
# 1. Richiedi reset (sempre ritorna success per sicurezza)
POST /api/auth/local/forgot-password
{
  "email": "user@example.com"
}

# 2. Valida token (opzionale, per UX)
GET /api/auth/local/validate-reset-token?token=abc123...

# 3. Reimposta password
POST /api/auth/local/reset-password
{
  "token": "abc123...",
  "password": "newpassword123"
}

# 4. Login con nuova password
POST /api/auth/local/login
{
  "email": "user@example.com",
  "password": "newpassword123"
}
```

## API Endpoints

### Public
- `GET /api/invites/validate?token=...` - Valida un token invito

### Auth (Local)
- `POST /api/auth/local/setup` - Setup password per nuovo account (richiede inviteToken)
- `POST /api/auth/local/login` - Login con email/password
- `POST /api/auth/local/forgot-password` - Richiedi reset password
- `GET /api/auth/local/validate-reset-token?token=...` - Valida token di reset
- `POST /api/auth/local/reset-password` - Reimposta password con token

### Auth (Google OAuth)
- `GET /api/auth/google/start?inviteToken=...` - Inizia OAuth flow
- `GET /api/auth/google/callback` - Callback OAuth (gestito automaticamente)

### Auth (General)
- `GET /api/auth/me` - Info utente corrente (richiede auth)
- `POST /api/auth/logout` - Logout (cancella cookie)

### Admin
- `GET /api/admin/invites` - Lista inviti (admin only)
- `POST /api/admin/invites` - Crea invito (admin only)
- `POST /api/admin/invites/:id/revoke` - Revoca invito (admin only)
- `POST /api/admin/test-email` - Test configurazione SMTP (admin only)

## Autenticazione API

### Via Cookie (browser)
Il JWT è salvato in un cookie `httpOnly` chiamato `access_token`. Viene inviato automaticamente dal browser.

```bash
fetch('/api/auth/me', {
  credentials: 'include'  # importante!
})
```

### Via Header (CLI/API)
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/auth/me
```

Il middleware `requireAuth` controlla prima l'header, poi il cookie.

## Testing

### Test SMTP
```bash
POST /api/admin/test-email
Authorization: Bearer <admin-jwt>

{
  "to": "test@example.com"  # opzionale, default: SMTP_USER
}
```

### Test invito completo
1. Login come admin
2. Crea invito per un'email
3. Controlla l'email ricevuta
4. Apri il link in un browser privato
5. Accetta invito (Google o password)
6. Verifica login

## Sicurezza

- Password hashate con `Bun.password.hash()` (bcrypt, cost 10)
- JWT con secret configurabile, scadenza 8h
- Cookie `httpOnly`, `sameSite=Lax`, `secure` in produzione
- Google OAuth: accetta solo email verificate (`email_verified=true`)
- Inviti: token SHA-256, scadenza 7 giorni, TTL automatico in MongoDB
- Reset password: token SHA-256, scadenza 1 ora, one-time use, TTL automatico
- Auto-linking: solo se `googleSub` vuoto (previene account hijacking)
- Email enumeration protection: endpoint `forgot-password` ritorna sempre success

## Note

- MongoDB deve avere gli indici creati automaticamente da Mongoose
- In produzione: usa un `JWT_SECRET` forte e unico
- Gmail: la porta 587 con STARTTLS è consigliata (non 465)
- Gli inviti scaduti vengono eliminati automaticamente da MongoDB (TTL index)

## Troubleshooting

### Email non arrivano
- Verifica `SMTP_USER`, `SMTP_PASS` (usa App Password per Gmail)
- Controlla i log del backend per errori SMTP
- Testa con `POST /api/admin/test-email`

### Google OAuth fallisce
- Verifica `GOOGLE_REDIRECT_URI` corrisponda esattamente alla Google Console
- Controlla che l'email Google sia verificata
- Guarda i log backend per dettagli errore

### JWT invalido
- Verifica che `JWT_SECRET` sia consistente tra riavvii
- Il token scade dopo 8h, rifare login
- Cookie funziona solo con `credentials: 'include'` dal frontend
