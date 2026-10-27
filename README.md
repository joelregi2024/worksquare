# WorkSquare — Fair Work. Safe Workers. Transparent Management.
Full-stack workforce platform (worker portal + employer dashboard) for **Construction** and **College** workplaces (UN SDG 8).

**Stack:** Node.js (zero npm dependencies) · `node:http` API · `node:sqlite` shared database · scrypt password hashing ·
HMAC-signed HttpOnly session cookies · vanilla JS frontend (English/Tamil) · Docker for Google Cloud Run.

**Features:** login with roles; check-in/out; overtime (>8h/day at 1.5x, configurable in `public/logic.js`); transparent payslip;
safety/grievance reports with unique IDs and tracking; admin dashboard with workload chart, filters and status updates;
fatigue alerts; industry switch; landing site (`public/index.html`).

**Demo accounts** (password `worksquare-demo`, override with `DEMO_PASSWORD`):
`murugan@worksquare.demo` (construction worker) · `lakshmi@worksquare.demo` (college worker) · `admin@worksquare.demo` (employer)

**Run:** `npm start` then open http://localhost:8080 (Node >= 22.13). **Test:** `npm test`.
**Deploy:** `gcloud run deploy worksquare --source . --region asia-south1 --allow-unauthenticated --max-instances=1 --set-env-vars SESSION_SECRET=<long-random-string>`

**Security:** passwords hashed (scrypt), roles enforced server-side (workers only see their own data), parameterised SQL,
login throttling, input validation, SameSite=Strict cookies, security headers, no secrets in the repo.

**Limitations (prototype):** SQLite lives on the container's ephemeral disk, so data resets when Cloud Run restarts or scales,
hence `--max-instances=1`. Use Cloud SQL/Firestore for real persistence. CSP allows inline scripts. No anonymous reporting
(reports are linked to the worker), no voice input, no password reset.
