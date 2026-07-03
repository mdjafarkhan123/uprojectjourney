# Client Journey - Product Blueprint (Version 1)

# Vision

This product is **not** a project management tool like Trello, ClickUp, Asana, or Jira.

It is a **client-facing project journey platform** designed for freelancers and small agencies who build websites or provide other digital services.

The goal is simple:

Instead of clients repeatedly asking "Any updates?", they log into their own dashboard and instantly understand exactly where their project is.

The experience should feel similar to tracking an online order or package.

At any moment, the client should immediately know:

- What has already been completed.
- What is currently being worked on.
- What comes next.
- Whether anything is waiting on them.

The interface should always feel calm, visual, simple, and professional.

This is not about exposing every internal task. It is about presenting a polished project journey that builds trust.

---

# User Roles

There are only two user roles.

## Admin

The admin is a freelancer or agency owner.

Admins manage everything.

They create client accounts.

They create projects.

They update project progress.

They manage milestones.

They write progress updates.

They decide exactly what clients see.

## Client

Clients cannot register.

Clients cannot create accounts.

The admin manually creates every client account.

Clients simply log in to view their own assigned projects.

Clients cannot edit project data.

Their only purpose is to follow progress.

---

# Authentication

Keep authentication intentionally simple for Version 1.

Admin Login

/master

Client Login

/

There is no signup.

There is no email verification.

There is no password reset.

Admin accounts are created manually.

Admins create client accounts from inside the application.

---

# Platform Structure

The platform should stay intentionally lightweight.

There are only three core objects.

Admin

↓

Clients

↓

Projects

Avoid unnecessary concepts such as teams, organizations, workspaces, departments, permissions, or company hierarchies.

Keep Version 1 focused.

---

# Admin Dashboard

The admin dashboard should remain minimal.

Main navigation:

Projects

Clients

Settings (basic profile and branding only)

Nothing more.

The product should never feel overwhelming.

---

# Clients

The Clients section is simply a list of client accounts.

The admin can:

Create client

Edit client

Delete client

Activate or deactivate client

Each client only needs a few basic fields:

Avatar

Full Name

Username

Password

Status

Created Date

No unnecessary fields should be included.

This is not a CRM.

---

# Projects

Projects are the heart of the platform.

The admin creates projects and assigns each one to a client.

Each project should contain only a few basic details initially.

Examples include:

Project Name

Assigned Client

Project Type

Expected Delivery Date

Project Status

Everything else happens after project creation.

---

# Project Templates

Projects should be created from templates whenever possible.

Examples:

WordPress Business Website

WooCommerce Store

Landing Page

Website Redesign

Custom Project

Choosing a template automatically creates the default project journey.

The admin can still customize everything afterwards.

Templates save time while keeping projects consistent.

---

# Project Journey

Every project follows the same simple structure.

Project

↓

Milestones

↓

Timeline Updates

Milestones represent the major phases of the project.

Typical milestones might include:

Planning

Design

Development

Testing

Launch

These milestones appear as large visual sections inside the client portal.

Each milestone contains its own timeline of progress updates.

---

# Client Dashboard

After logging in, clients first see their project list.

Projects should be displayed as modern cards rather than tables.

Each project card should contain only the most important information.

For example:

Project Name

Current Milestone

Current Status

Overall Progress

Last Updated

Open Project button

Clients are viewing projects, not managing them.

Cards provide a cleaner and more approachable experience.

---

# Project Overview

Opening a project should display an overview page.

At the top, show a summary including:

Project Name

Current Status

Current Milestone

Overall Progress

Estimated Completion

Current Focus

Latest Update

Next Step

The client should understand the project's current state within a few seconds.

---

# Current Focus

Always display what is currently being worked on.

Example:

Current Focus

WooCommerce Checkout Integration

Today's Goal

Configure payment gateway and checkout flow.

This creates confidence that active work is happening.

---

# Latest Activity

Always show the newest activity first.

Example:

Today

Started shipping configuration.

Yesterday

Completed payment gateway.

June 20

Homepage approved.

Clients should immediately see what's new without searching.

---

# Next Step

Always tell the client what happens after the current milestone.

Example:

Next Step

Testing Phase

Estimated Start

15 July

No action required.

Or:

Next Step

Homepage Approval

Action Required

Please review the homepage before development continues.

Clients should never wonder what comes next.

---

# Project Journey View

Below the overview is the visual journey.

Display milestones as large cards arranged vertically.

Examples:

✓ Planning

✓ Design

🟢 Development

Upcoming Testing

Upcoming Launch

Completed milestones should clearly show they are finished.

The current milestone should be visually highlighted.

Future milestones should appear as "Upcoming" rather than disabled.

This feels intentional and avoids giving the impression that something is unavailable or broken.

---

# Milestone Detail Page

Clicking a milestone opens a dedicated page.

Do not use popups.

Each milestone deserves its own page because the content will naturally grow over time.

The milestone page contains:

Milestone Name

Status

Start Date

Expected Completion

Overview

Timeline

Clients should feel like they are opening one stage of their project's journey.

---

# Timeline

Each milestone contains a vertical timeline.

Every update is shown in chronological order.

Each timeline entry contains:

Title

Description

Date

Status

Example:

June 20

Started Homepage Development

June 21

Homepage Layout Completed

June 22

Product Grid Finished

June 23

Waiting for Homepage Approval

The timeline becomes the project's history.

Clients can clearly see progress over time.

---

# Task Status

Timeline entries should support meaningful statuses.

Examples:

Not Started

In Progress

Waiting for Client

Under Review

Completed

Statuses communicate far more than simple checkmarks.

---

# Waiting for Client

Sometimes work pauses because something is needed from the client.

The platform should make this obvious.

Example:

Status

Waiting for Client

Required Action

Please provide your company logo.

Or

Please approve the homepage design.

Clients immediately understand why progress has paused.

---

# Progress

Overall project progress should be calculated automatically.

Progress should primarily reflect milestone completion rather than counting individual timeline entries.

Example:

Planning

100%

Design

100%

Development

65%

Testing

0%

Launch

0%

This provides a realistic picture of project progress.

---

# Project Status

Every project should always have a clear overall status.

Examples include:

Planning

In Progress

Waiting for Client

Under Review

Completed

The status should communicate the project's current health at a glance.

---

# Admin Project Management

The admin should be able to easily manage every project.

For each project, the admin should be able to:

Edit project information

Assign or change the client

Choose or modify the template

Create milestones

Rename milestones

Delete milestones

Reorder milestones

Add timeline updates

Edit timeline updates

Delete timeline updates

Update milestone status

Set start dates

Set expected completion dates

Write descriptions

Control what clients can see

Everything should be fast and intuitive.

---

# Branding

Every admin should have basic branding options.

Company Name

Company Logo

Primary Brand Color

The client portal should automatically reflect the admin's branding.

This allows every freelancer or agency to make the portal feel like their own product.

---

# File Uploads

Version 1 should intentionally avoid file management.

Only avatar uploads are supported.

No document uploads.

No image uploads.

No attachments.

Keeping storage out of Version 1 makes the platform simpler, faster, and less expensive to operate.

---

# Notifications

Version 1 does not require notifications.

Clients simply log in whenever they want to check progress.

Email notifications and other communication features can be added in future versions.

---

# Design Philosophy

Every design decision should reinforce one simple idea:

The client is following a journey.

Not managing work.

Not viewing internal project management.

Not reading technical logs.

The platform should always answer four questions:

What has already been completed?

What is happening right now?

What happens next?

Is anything waiting on me?

The interface should feel more like tracking a package than using project management software.

Simple.

Professional.

Reassuring.

Transparent.

That feeling is the entire purpose of the product.
