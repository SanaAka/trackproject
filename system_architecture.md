# POS Device Lending & Tracking System (TrackPOS)
## System Overview, Architecture & Workflow Specification

This system streamlines POS hardware dispatch and returns across branches and departments by replacing manual serial number entry with high-precision in-browser camera scanning on mobile devices and workstations.

---

## 1. High-Level Architecture & System Overview

```
+-------------------------------------------------------------------------------------------------------+
|                             Client Layer                                                              |
|                                                                                                       |
|   Admin Web Dashboard (Desktop/Tablet)                          Mobile Web Scanner                    |
|   - Analytics & Charts (Visual Graph view)                      - HTML5 Camera Feed (1080p, Macro)    |
|   - POS (One-to-Many: scan S/N & auto-sort bundled products)   - html5-qrcode / Native BarcodeDetector |
|   - Borrow / Return Logs (Excel-style editable sheet)           - Smart Double-Scan Engine            |
|   - Search & Manual Overrides (Date, EID, SKU, Product)        - Manual EID & Phone / Email Entry    |
+-----------------------------------+-------------------------------------------------------------------+
                                    | HTTPS / JSON (REST API)
                                    v
+-----------------------------------------------------------------------+
|                             Backend API                               |
|                                                                       |
|   - Auth & Middleware (Sanctum / JWT)                                 |
|   - Hardware Dispatch & Return Controller                             |
|   - Inventory & SKU/Serial Master Controller                          |
|   - Scheduled Cron Engine (Daily Summary Aggregator)                  |
+-------------------+-------------------------------+-------------------+
                    |                               |
                    v                               v
+-------------------------------+   +-----------------------------------+
|      Relational Database      |   |     External Services             |
|   - PostgreSQL / MySQL / SQLite|   |     - Telegram Bot API            |
|   - Device, Employee, Logs    |   |       (Automated daily PDF/CSV    |
|   - Indexing on SN & EID      |   |        reports via Telegram Chat) |
+-------------------------------+   +-----------------------------------+
```

---

## 2. Navigation Architecture

```
[ Nav: {Dashboard} | {POS (One-to-Many)} | {List of Borrow/Return} | {Search} | {Export Data & Telegram} ]
```

| Navigation Tab | Key Functionality & Workflow |
| :--- | :--- |
| **📊 Dashboard** | Visual analytics and graphs: Daily loan trends, active fleet statuses, branch distributions, and overdue monitors. |
| **📦 POS (One-to-Many)** | Dedicated inventory view. Scan a Serial Number to instantly view all related bundled products (terminal, cradle, charger, SIM, cable). Supports Smart Double-Scan for Stock-in. |
| **📋 List of Borrow/Return** | Excel-like master grid: `{List #}`, `{Borrower EID}`, `{Staff Name}`, `{SKU --- Related --- Product}`, `{Borrow Date & Time}`, `{Return EID}`, `{Return Date & Time}`, with inline `{Edit}` and `{Add New}`. |
| **🔍 Search** | Dedicated 4-facet filter: `{By Date Range}`, `{By Employee ID (EID)}`, `{By SKU}`, `{By Product Name}`. |
| **📤 Export & Telegram** | Instant CSV / Excel download + automated daily summary reports dispatched directly to your company's **Telegram Bot / Group Chat**. |

---

## 3. Scale Solution for 1,000+ Devices & "Double-Scan" Strategy

### The Problem
When tracking over 1,000 POS units across multiple branches:
- Serial numbers are long (e.g., 12-digit Ingenico `212857310045`).
- Different devices have the same model/SKU but distinct serial numbers.
- Each terminal is bundled with multiple items (Charging base, power adapter, spiral cable, 4G SIM card).

### The Solution: Smart Double-Scan & One-to-Many Indexing

```mermaid
flowchart TD
    subgraph Strategy["Smart Double-Scan Workflow"]
        subgraph StockIn["1. Stock-In (Double-Scan)"]
            S1[Scan 1: Product SKU Barcode] --> S2[Scan 2: Serial Number S/N]
            S2 --> AutoBundle[Auto-bundles standard accessories & registers to Fleet]
        end

        subgraph Dispatch["2. Borrow Loan (Fast 1-or-2 Scan)"]
            B1[Scan 1: POS Serial Number S/N] --> AutoLoad[Auto-displays Terminal + all Bundled Products]
            AutoLoad --> B2[Scan 2: Employee ID Badge or Manual EID]
            B2 --> StampBorrow[Real-time Borrow Timestamp & Auto-Sort]
        end

        subgraph Checkin["3. Return (1-Scan Complete)"]
            R1[Scan 1: POS Serial Number S/N] --> MatchLoan[Auto-matches active loan in <5ms]
            MatchLoan --> ConfirmReturn[Check accessories & stamp Return Timestamp]
        end
    end
```

---

## 4. One-to-Many Data Model

```mermaid
erDiagram
    POS_DEVICE ||--|{ BUNDLED_PRODUCT : "has many"
    POS_DEVICE ||--o{ LOAN_RECORD : "is borrowed in"
    STAFF ||--o{ LOAN_RECORD : "borrows"

    POS_DEVICE {
        string serial_number PK "Unique S/N (e.g. 212857310045)"
        string sku "Item model code (e.g. ING-MOVE5000-4G)"
        string model "Ingenico Move/5000, AXIUM DX8000"
        string status "AVAILABLE | BORROWED | OVERDUE"
    }

    BUNDLED_PRODUCT {
        string id PK "Product identifier"
        string name "Main Terminal, Docking Base, Cable, SIM"
        string sku "Sub-part SKU"
        int quantity "Default count"
    }

    LOAN_RECORD {
        string id PK "Unique Transaction ID"
        int list_number "Sequential row index (Excel-style)"
        string employee_id FK "Borrower Emp ID (e.g. 90028288)"
        string return_employee_id "Staff ID who verified return"
        date borrow_date "Auto borrow date"
        time borrow_time "Auto borrow time"
        date return_date "Auto return date"
        time return_time "Auto return time"
        string return_condition "GOOD | MISSING_PARTS | DAMAGED"
    }
```

---

## 5. Automated Telegram Bot Reporting Engine

The system can automatically dispatch daily audit summaries at a designated time (e.g. 18:00) using the Telegram Bot API:

```
POST https://api.telegram.org/bot<BOT_TOKEN>/sendMessage
{
  "chat_id": "<CHAT_ID>",
  "parse_mode": "Markdown",
  "text": "📊 *TrackPOS Daily Fleet & Dispatch Audit Report*\n..."
}
```
Staff can also trigger an immediate dispatch at any time via the **"Send Report to Telegram Now"** button.
