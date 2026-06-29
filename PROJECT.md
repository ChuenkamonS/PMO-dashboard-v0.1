PROJECT.md

PMO Dashboard Project Context

Product Purpose

PMO Dashboard is an internal project management support platform for PMO teams and project managers.

The goal is to reduce manual tracking work, standardize PMO workflows, and make project governance easier to manage.

This is not only a demo app. Treat it as a real internal enterprise tool.

Core Users

Primary users:

* PMO team
* Project managers
* Approvers
* Management / executives

Main Modules

1. Dashboard

Shows high-level project and PMO information.

Purpose:

* Give quick visibility of work status
* Help users understand what requires attention
* Support management reporting

2. Memo Management

Used to create and manage memo requests.

Current / expected capabilities:

* Create memo
* Select memo type
* Select project
* Auto-generate memo number
* Input relevant dates
* Calculate totals
* Validate required fields
* Export or print PDF

Memo types may include:

* SL
* HW
* INT
* ENT
* DEP

3. Approval Workflow

Used to approve or reject memo requests.

Current state:

* Simple approve / reject flow

Future state:

* Multi-level approval
* Approval routing
* Approval history
* E-signature or approval evidence
* Notification to requester and approver

Approval logic is business-critical. Do not change approval rules unless explicitly requested.

4. History

Used to search and review previous memo records.

Expected capabilities:

* Filter by status
* Filter by memo type
* Filter by project
* Filter by date
* Export CSV

History should preserve records and should not lose past data.

5. Budget Monitor

Used to track planned budget vs actual budget.

Expected capabilities:

* Show budget summary
* Compare plan vs actual
* Support financial visibility

Budget calculation logic must be handled carefully.

6. License Registry

Used to track software or system licenses.

Expected capabilities:

* License owner
* Expiry date
* Cost
* Seat count
* User mapping in the future

7. Authentication

Planned capability.

Expected direction:

* Supabase Auth
* Email/password login
* User session management
* Protected pages

Authentication should be isolated from business logic.

8. Role-Based Permissions

Planned capability.

Possible roles:

* Requester
* Approver
* PMO Admin
* Management Viewer

Permissions should control what users can see and do.

9. Notifications

Planned capability.

Possible notifications:

* Memo submitted
* Memo approved
* Memo rejected
* Approval required
* Expiring license
* Budget warning

Product Principles

Stability is more important than flashy UI.

The app should be:

* Practical
* Reliable
* Easy to maintain
* Easy for PMO users to understand
* Safe for business data

Business Rules

Do not assume business rules.

If approval, budget, memo numbering, or permission logic is unclear, ask before coding.

Technical Direction

Expected stack:

* Next.js / React
* TypeScript
* Supabase for database and authentication
* Vercel for deployment
* GitHub for version control

Reuse the existing project structure and design style.

Current Priorities

Near-term priorities:

1. Keep existing memo and dashboard features stable
2. Add database persistence
3. Add login/authentication
4. Add role-based permission
5. Improve approval workflow
6. Add notifications
7. Improve reporting and history

What Not To Do

Do not rebuild the app from scratch.

Do not redesign the full UI without request.

Do not change business logic casually.

Do not introduce unnecessary libraries.

Do not make large refactors unless specifically requested.

Definition of Product Success

The product is successful when PMO users can:

* Create memo requests easily
* Track memo status
* Approve or reject requests clearly
* Review history
* Monitor budget/license information
* Use the system with proper login and permissions
* Trust that records are accurate and preserved
