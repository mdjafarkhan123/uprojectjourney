# Milestone Progress & Scope System (Refined Product Plan)

## Overview

The project progress system should not be based on manually entering percentages.

Instead, project progress should always be calculated automatically from the actual work completed.

To make this accurate, every milestone must first have a clearly defined scope before progress can be measured.

---

# The Problem

A milestone contains multiple work items.

Example:

Planning

- Requirements Gathering
- Content Collection
- Domain Access
- Hosting Access
- Sitemap

The problem is that I can continue adding more work items at any time.

For example:

Today I create 5 work items.

Tomorrow I remember another task and add it.

The next day I add two more.

If progress is calculated while the checklist is still changing, the percentages constantly change and become unreliable.

The system never truly knows how much work belongs to that milestone.

---

# The Solution

Every milestone has two modes.

## Draft Mode

This is the planning stage.

While a milestone is in Draft Mode, I can freely build its checklist.

I can:

- Add work items
- Edit work items
- Delete work items
- Reorder work items

During this stage I am simply defining the scope of that milestone.

The milestone progress should not be considered final because the work list is still changing.

---

## Finalized Mode

When I am satisfied that I have added every work item needed for that milestone, I click a button called:

**Finalize Scope**

This tells the system:

> "The scope of this milestone is now complete. Start measuring progress using this checklist."

Once finalized:

- No new work items can be added.
- Existing work items cannot be deleted accidentally.
- The milestone checklist becomes the official scope.
- Progress calculation becomes active.

---

# Editing the Scope Later

Sometimes I may forget a task.

If that happens, I should not be permanently locked.

Instead, I click:

**Edit Scope**

The milestone returns to Draft Mode.

Now I can:

- Add more work items
- Remove work items
- Rename work items
- Reorder work items

After finishing my changes, I click:

**Finalize Scope**

The system recalculates the milestone progress using the updated checklist.

This makes the system flexible while still keeping progress meaningful.

---

# Work Items

Inside every milestone are Work Items.

These are the individual pieces of work that need to be completed.

Example:

Planning

- Requirements Gathering
- Content Collection
- Domain Access
- Hosting Access
- Sitemap

Every Work Item has its own status.

Possible statuses include:

- Not Started
- In Progress
- Waiting for Client
- Under Review
- Completed

The admin updates these statuses as work progresses.

---

# Milestone Progress

Milestone progress should always be calculated automatically.

Formula:

Completed Work Items ÷ Total Finalized Work Items

Example:

Planning

Total Work Items:

5

Completed:

2

Milestone Progress:

40%

No manual percentage entry is required.

---

# Milestone Status

A milestone also has its own status.

Examples:

- Draft
- In Progress
- Waiting for Client
- Completed

Draft means the milestone scope is still being defined.

Once the scope is finalized and work begins, the milestone moves into normal progress tracking.

---

# Milestone Weight

Each milestone contributes a different percentage toward the overall project.

Example:

Planning

10%

Design

25%

Development

45%

Testing

15%

Launch

5%

Total

100%

These weights are configurable by the admin.

This produces much more realistic overall project progress than giving every milestone equal value.

---

# Overall Project Progress

Overall project progress should always be calculated automatically.

Each milestone contributes according to its assigned weight.

Example:

Planning

Weight: 10%

Progress: 100%

Contribution: 10%

Design

Weight: 25%

Progress: 40%

Contribution: 10%

Development

Weight: 45%

Progress: 0%

Contribution: 0%

Testing

Weight: 15%

Progress: 0%

Contribution: 0%

Launch

Weight: 5%

Progress: 0%

Contribution: 0%

Overall Project Progress

20%

The admin never manually enters project percentages.

Everything is calculated from actual work completed.

---

# Client Experience

Clients never see the technical concept of "Scope."

They simply see:

- Milestone Progress
- Current Status
- Work Items
- Overall Project Progress

From the client's perspective, progress always feels accurate and professional because it reflects real completed work rather than manually entered numbers.

---

# Design Philosophy

The purpose of this system is to ensure that progress is trustworthy.

A milestone should only begin tracking progress after its scope has been finalized.

This prevents percentages from constantly changing because new work items were added midway through the milestone.

The result is a system that is both flexible for the admin and reliable for the client.

Admins can still modify the scope whenever necessary, but doing so is an intentional action rather than an accidental change.

This creates a clean planning phase followed by a clear execution phase, making project progress meaningful throughout the entire project journey.
