# User guide

This guide covers the main workflows in the English interface.

## Sign in

1. Open http://localhost:3000.
2. On a new installation, create the first administrator in the welcome form.
3. Select **Sign in with Keycloak**.
4. Use an account created by the instance administrator.

## Projects and tasks

The dashboard shows projects, planned hours, task progress, recent work, and links to the main views.

To create a project, select **New project**, then enter its name, client, available hours, and description. The app creates the base categories and Vault folders.

In **Tasks**, create or edit tasks, assign an optional milestone, category, owner, dates, hours, priority, progress, and feedback. Tasks require a manual start: use **Start**, **Pause**, **Resume**, and **Close** as the task progresses.

## Milestones and Gantt

In **Milestones**, create milestones, assign tasks and Vault documents, and review effective and time-based progress.

In **Gantt**, view dated tasks and milestones. Sort by manual order, priority, or date. Drag a task handle to reorder it, or drag a task bar edge to change its duration. Changes are saved through the API and recorded in the audit log.

## Vault

In **Vault**, create folders, upload files, link files to tasks or milestones, and open files through temporary signed URLs. Drag items into folders or back to the root. The item menu offers details and a **Move to** action.

## Members and administration

In **Members**, assign project roles such as project manager, editor, contributor, viewer, or commenting client.

Global administrators can open **Admin** to create users in Keycloak and synchronize them with the app database. The **Workload** and **Calendar** views show assigned tasks and workload over time.

## Audit

**Audit** records relevant actions such as project creation, task changes, file uploads, and permission changes.
