You are a senior full-stack developer. Build "TrackPOS", a TEAM-ONLY web system that replaces a manual borrow book for POS terminals and is used EVERY MONTH, not just for one month. Staff scan a serial number (S/N) with a handheld barcode scanner instead of typing it. The attached Excel workbook (POS_Stock_Management_For_Sep2026.xlsx) is the starting data AND the exact layout every export must reproduce.

Work in phases. After each phase: summarize what you built, tell me exactly how to test it, list assumptions, then STOP and wait for my approval. Before Phase 1, list your questions and assumptions.

## Stack (fixed)
Node.js 20, Express, Prisma with SQLite (keep it PostgreSQL-ready), Zod, bcrypt, JWT in an httpOnly cookie, helmet, express-rate-limit, node-cron, multer (upload), exceljs, Vitest. Frontend: Vite + vanilla JavaScript (no framework, no localStorage for data). JavaScript, not TypeScript. Folders: /client, /server, /shared (npm workspaces). Shared rules in /shared/codes.js.
Time: store UTC; all business logic, displays and month boundaries use Asia/Phnom_Penh (UTC+7).

## The workbook (study it first)
Sheets: "DX8000 Stock Management", "DX8000 Summary Report", "A8 Stock Management", "A8 Summary Report", "TOPWISE T6", "TOPWISE T6 Summary Report".
Stock sheet layout:
- Row 1: title merged across all columns ("POS STOCK MANAGEMENT ")
- Row 2: merged group labels. DX8000: "Stock out" and "All in Stock". A8 and T6: "Stock In" (A2:D2), "Stock out" (E2:J2), "All in Stock" (K2:N2)
- Row 3: headers (auto-filter on). Read exact headers, order, merged ranges, widths, filters and number formats from the file.
  - DX8000 (13 cols): Model, POS Serial No, QTY, Date, Branch Code, Model, POS Serial No, Merchant name, QTY, No, Model, All POS Serial No, Remark/Error
  - A8 (16 cols): Date, Model, POS Serial No, QTY, Date, Branch Code, Model, POS Serial No, Merchant name, QTY, No, Model, All POS Serial No, Remark/Error, Status, Aset Code
  - T6 (16 cols): same first 14, then Aset Code, Noted
- Data from row 4, then a Total row with formulas (DX8000: C = SUM of first QTY, I = SUM of second QTY, L = SUM(C,I)). Each Summary sheet links to its Total cells ("Total Go-live ", "Availaible In Stock" (keep this spelling), "Grand Total").
Meaning: first QTY 1 = in stock, 0 = out; second QTY 1 = out (go-live), 0 = in stock. Date = when it went out. Branch Code is "Branch 001" on almost every row including in-stock rows (treat Branch 001 as the configurable HOME branch). "No" = running row number per sheet. Asset code ("Aset Code") = 8 to 9 digits: own column in A8 and T6; in DX8000 it is stored as a number inside Remark/Error, mixed with text notes like "Can't power on".
Counts to reproduce: DX8000 789 devices (562 out, 227 in stock); A8 171 rows (1 out, 170 in stock); T6 102 devices (67 out, 35 in stock).

## Code rules (shared/codes.js, used by browser and server, with unit tests)
- S/N: uppercase letters and digits, 12 to 13 characters. DX8000 and A8: 12 chars (231AKD8R7304, 203RCA115619). T6: "P" + 12 digits (P653200096047). NEVER strip letters when cleaning.
- normalizeCode(raw): trim, uppercase, remove prefixes like "S/N:" and "SN:", spaces and symbols.
- classifyCode(raw): "serial" (12-13 alphanumeric), "asset" (8-9 digits only) or "invalid".
- Model hint: starts with "P" means T6. Warn on mismatch, never block.

## Database
branches (name unique); staff (employee_id unique, name, branch_id, role STAFF/ADMIN, pin_hash, active, failed_attempts, locked_until); devices (model DX8000/A8/T6, serial unique, asset_code unique nullable, state IN_STOCK/BORROWED/IN_REPAIR/RETIRED, stock_in_date nullable, remark, status_text, merchant_name nullable, sort_no per model); borrows (device_id, staff_id, branch_id, borrowed_at, returned_at nullable, returned_by, condition, notes); device_events (device_id, type STOCK_IN/BORROW/RETURN/STATE_CHANGE/IMPORT, at, staff_id, detail) used to rebuild any past date; month_snapshots (month, model, in_stock, out, total, created_at); audit_log (who, action, entity, before, after, at).
Rules: S/N unique; one open borrow per device; borrow and return run in ONE transaction; nothing returned is ever deleted; every change writes audit_log and device_events; normalize on the server, never trust the client.

## Features
1. Team-only access: login with employee ID + PIN (bcrypt, lock after 5 failed tries, 8-hour session). NO public registration; an ADMIN creates each person (ID, name, branch from a list, PIN). STAFF scan and view. ADMIN also does stock-in, import, export, reports, staff, branches, and device state changes. Seed the first admin from env vars.
2. Excel import (admin, ONE-TIME switch-over): upload the workbook, parse the three stock sheets, clean and load devices plus currently open borrows (from the Date column) and IMPORT events. Dry-run mode is always allowed. A real import is BLOCKED once scan history exists unless an admin explicitly confirms. Produce an import report (screen and download) listing every problem and the decision taken. Detect: duplicate S/N (203RCA115455 appears twice in A8); odd 13-char S/N 21ABCD8C10666 in DX8000; Total rows inside the data; dates stored as text "MM/DD/YYYY hh:mm:ss AM" and as real Excel dates; Branch values like "Branch" or blank; in-stock rows that still hold a merchant name; Remark/Error mixing asset codes and notes. Never silently drop or alter data.
3. Model tabs (DX8000, A8, T6): read-only tables with the SAME columns and order as the sheets, searchable, scanned row highlighted. Device page: full history; ADMIN can change state (IN_REPAIR, RETIRED, back to IN_STOCK) and edit remark, always audited.
4. Scan screen: one always-focused input (refocus after any click) accepting a handheld scanner (types the code + Enter) and manual typing. Staff types ID once per session (name and branch shown in large text). Every scan runs submitScan():
   - classifyCode, then find the device by S/N or asset code
   - IN_STOCK: record a borrow (date, time, staff, branch), state BORROWED, green
   - BORROWED: show who has it and since when, ask ONE confirmation, record the return, state IN_STOCK
   - IN_REPAIR or RETIRED: warn, do nothing
   - not found: red; ADMIN may register it
   - invalid: ask to scan again
   Ignore the same code within 2 seconds. Session list with Undo per action.
5. Stock-in (admin): choose the model once, scan each new S/N; an asset code scanned right after attaches to that device; the next S/N starts the next device. Reject duplicates and invalid codes, warn on model mismatch, running count with an optional expected quantity. New devices are IN_STOCK, appended with the next "No", and get stock_in_date.
6. Excel export (admin): load a layout template (copy of the workbook with data rows cleared, stored in /server/templates) and fill it, so titles, merged cells, filters, widths, number formats and the three Summary sheets stay identical. Totals are SUM formulas (set full calculation on load). Month selector (default current month) with file name POS_Stock_Management_For_<Mon><YYYY>.xlsx, and two modes: "current state" and "as of month end" (reconstruct each device's state at 23:59:59 of the last day from device_events). Mapping: IN_STOCK rows: first QTY 1, blank date, Branch Code = home branch, second QTY 0. BORROWED rows: first QTY 0, borrow date/time, borrower's branch, second QTY 1. One date format MM/DD/YYYY hh:mm:ss AM/PM written as real dates. Asset code goes in Aset Code (A8, T6) and in Remark/Error for DX8000 (joined as "60001973 - note" when both exist). Extra last sheets: "Borrow History" (employee ID, name, branch, S/N, asset code, borrowed at, returned at; filtered to the selected month) and "Monthly Summary".
7. Monthly use: node-cron job at 00:05 on the 1st saves the previous month's snapshot per model (and catches up any missed month at startup); admin can also trigger it manually. "Monthly Summary" per model: opening in stock, received (stock-in), borrowed, returned, other changes (repair, retired), closing in stock, closing out, so opening + received - borrowed + returned +/- other = closing; a mismatch is flagged. The first month's opening comes from the import. Do NOT re-import each month.
8. Admin pages: staff (add, approve, reset PIN, deactivate) and branches. Nightly database backup (use SQLite VACUUM INTO, keep the last 14), README with run and restore instructions.

## Out of scope
Phone camera or photo scanning, OCR, label printing, Telegram, charts, offline mode, merchant-deployment workflow (Merchant name stays blank on borrows; optional setting later).

## Architecture rules
- Server layers: routes, middleware (auth, role, Zod), controllers (thin), services (business rules), Prisma. Only services touch the database.
- JSON errors: 400 invalid input, 401 not logged in, 403 wrong role, 409 conflict (duplicate S/N or already borrowed).
- Every route except login requires auth. CORS locked to the app origin. Secrets only in .env (provide .env.example). Escape all user text in HTML.
- Bind the server to the office network or VPN only; document it. No public deployment.
- Vitest tests for: codes.js, the import cleaner, the scan state machine, and the as-of-date reconstruction.

## Phases (stop after each)
1. Import: parser, cleaner, import report, load into SQLite. CHECKPOINT: counts match (DX8000 562/227/789, A8 1/170/171, T6 67/35/102) except where the report shows a real data error.
2. Auth, roles, staff and branch admin pages.
3. Model tabs and device page matching the sheets.
4. Scan screen: borrow, return, session list, undo.
5. Stock-in with optional asset code.
6. Excel export in the exact layout (current state). CHECKPOINT: import the workbook, export it unchanged, open both side by side; every sheet, count and Total must match.
7. Monthly: events history, month-end snapshots, as-of export, Monthly Summary with reconciliation. CHECKPOINT: simulate two months of scans and confirm opening + received - borrowed + returned +/- other = closing.
8. Backups, hardening, README.

Start with the questions and assumptions list, then Phase 1 only.