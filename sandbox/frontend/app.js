/**
 * InView VROOM Simulation Sandbox -- Application Logic v1.1
 * 
 * Features:
 *  - Sliders, strategy selection, cost guide
 *  - Leaflet map with routes, jobs, depot markers
 *  - Test history with test numbers
 *  - Engineer stats panel
 *  - Activity log with time-of-day, durations, traffic multipliers
 *  - Remix mode (same job assignments, different strategy)
 *  - Foursquare GeoJSON downloads
 */

const API_BASE = window.location.origin + '/api';

// Helper for authenticated backend API requests
async function apiFetch(endpoint, options = {}) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    // Add project_id to query if GET, or to body if POST
    if (!options.method || options.method === 'GET') {
        const url = new URL(API_BASE + endpoint);
        url.searchParams.append('project_id', currentProjectId);
        endpoint = url.pathname.replace('/api', '') + url.search;
    } else if (options.body) {
        try {
            const bodyObj = JSON.parse(options.body);
            bodyObj.project_id = currentProjectId;
            options.body = JSON.stringify(bodyObj);
        } catch(e) {}
    }
    
    return fetch(API_BASE + endpoint, { ...options, headers });
}

// ═══ Supabase Authentication ═════════════════════════════════
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function initAuth() {
    // Check current session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        handleAuthChange(session);
    });

    // Listen for changes
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session);
    });
}

// ═══ Project Management ══════════════════════════════════════
let currentProjectId = null;
let currentProjectRole = null;

// ── Role-based access control ────────────────────────────────
const ROLE_HIERARCHY = { viewer: 0, user: 1, admin: 2, owner: 3 };

function canPerform(action) {
    const level = ROLE_HIERARCHY[currentProjectRole] ?? -1;
    switch (action) {
        case 'view':            return level >= 0; // viewer+
        case 'run_dispatch':    return level >= 1; // user+
        case 'edit_engineers':  return level >= 2; // admin+ (matches RLS: owner/admin)
        case 'edit_jobs':       return level >= 1; // user+ (matches RLS: owner/admin/user)
        case 'edit_settings':   return level >= 2; // admin+ (matches RLS: owner/admin)
        case 'delete_history':  return level >= 2; // admin+
        case 'invite':          return level >= 3; // owner only (matches RLS: owner)
        case 'manage_members':  return level >= 3; // owner only (matches RLS: owner)
        case 'edit_project':    return level >= 3; // owner only
        case 'delete_project':  return level >= 3;
        default:                return false;
    }
}

function applyRoleRestrictions() {
    // Dispatch / optimise button
    const runBtn = document.getElementById('run-opt-btn');
    if (runBtn) {
        runBtn.disabled = !canPerform('run_dispatch');
        runBtn.title = canPerform('run_dispatch') ? 'Run Optimisation' : 'Viewers cannot run dispatches';
    }

    // Floating "New dispatch run" FAB
    const fabBtn = document.querySelector('.fab-primary');
    if (fabBtn) {
        fabBtn.style.display = canPerform('run_dispatch') ? '' : 'none';
    }

    // Engineer add button (admin+ can manage engineers)
    const addEngBtn = document.querySelector('#view-engineers .btn-primary');
    if (addEngBtn) {
        addEngBtn.style.display = canPerform('edit_engineers') ? '' : 'none';
    }

    // Job import button (user+ can manage jobs)
    const addJobBtn = document.querySelector('#view-jobs .btn-primary');
    if (addJobBtn) {
        addJobBtn.style.display = canPerform('edit_jobs') ? '' : 'none';
    }

    // Project settings gear button (only show if user has at least viewer role)
    // The settings modal itself gates individual tabs/actions
}

// ── UI identity helpers ──────────────────────────────────────
function updateNavIdentity() {
    const session = AppState.get('session');
    const email = session?.user?.email ?? '';
    const profile = AppState.get('userProfile');
    
    // Derive initials and display name from profile if available
    let initials = email ? email.substring(0, 2).toUpperCase() : '?';
    let displayName = email ? email.split('@')[0] : '';
    
    if (profile && profile.first_name) {
        const fn = profile.first_name || '';
        const ln = profile.last_name || '';
        initials = (fn.charAt(0) + ln.charAt(0)).toUpperCase();
        displayName = (fn + ' ' + ln).trim();
    }

    // Nav rail user info
    const avatarEl = document.getElementById('nav-user-avatar');
    const nameEl2 = document.getElementById('nav-user-name');
    const emailEl = document.getElementById('nav-user-email');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl2) { nameEl2.textContent = displayName; nameEl2.title = displayName; }
    if (emailEl) { emailEl.textContent = email; emailEl.title = email; }

    // Dashboard user bar
    const dashEmail = document.getElementById('dashboard-user-email');
    if (dashEmail) dashEmail.textContent = displayName || email;

    // Project name + role in nav
    const projects = AppState.get('projects') || [];
    const current = projects.find(p => p.id === currentProjectId);
    const nameEl = document.getElementById('nav-project-name');
    const roleEl = document.getElementById('nav-role-badge');
    if (nameEl && current) { nameEl.textContent = current.name; nameEl.title = current.name; }
    if (roleEl && currentProjectRole) { roleEl.textContent = currentProjectRole; }
}

async function loadProjectDashboard() {
    // Overlay visibility is now owned by the router. This function is the
    // data-load entrypoint for the picker route.
    updateNavIdentity();
    await fetchInvitations();
    await fetchProjects();
}

async function fetchProjects() {
    // IMPORTANT: Filter by current user's ID so we only get THIS user's
    // membership rows. Without this filter, RLS returns all members of all
    // projects the user belongs to, causing wrong role display and duplicate
    // project cards.
    const userId = AppState.get('userId');
    let query = supabaseClient
        .from('project_members')
        .select('project_id, role, projects(id, name, description)')
        .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);

    const { data: members, error: memberErr } = await query;

    const container = document.getElementById('projects-list');
    if (memberErr || !members || members.length === 0) {
        container.innerHTML = `<div class="status-text">You don't belong to any projects yet.</div>`;
        AppState.set('projects', []);
        return;
    }

    // Cache the membership list so the router can validate project IDs from
    // deep links without re-querying Supabase.
    AppState.set('projects', members
        .filter(m => m.projects)
        .map(m => ({ id: m.projects.id, name: m.projects.name, description: m.projects.description, role: m.role })));

    container.innerHTML = '';
    members.forEach(member => {
        const p = member.projects;
        if (!p) return;
        const card = document.createElement('div');
        card.className = 'project-card';
        // Navigate via the router so the URL updates; the router will call
        // selectProject() once the route is resolved.
        card.onclick = () => router.navigate('/projects/' + encodeURIComponent(p.id) + '/map');
        card.innerHTML = `
            <div class="project-card-title">${p.name}</div>
            ${p.description ? `<div class="project-card-desc">${p.description}</div>` : ''}
            <div class="project-card-role">Role: ${member.role.toUpperCase()}</div>
        `;
        container.appendChild(card);
    });
}

async function fetchInvitations() {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) return;

    const { data: invites, error } = await supabaseClient
        .from('invitations')
        .select('id, projects(name), role')
        .eq('status', 'pending')
        .eq('email', userData.user.email);
        
    const container = document.getElementById('invitations-container');
    const list = document.getElementById('invitations-list');
    
    if (error || !invites || invites.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    list.innerHTML = '';
    invites.forEach(inv => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.background = 'rgba(255,255,255,0.05)';
        div.style.padding = '12px';
        div.style.borderRadius = '6px';
        div.innerHTML = `
            <div>
                <div style="color: white; font-weight: 500;">${inv.projects?.name || 'A Project'}</div>
                <div style="font-size: 12px; color: var(--app-fg-soft)">Invited as: ${inv.role}</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-primary" style="padding: 4px 12px; font-size: 12px;" onclick="acceptInvite('${inv.id}')">Accept</button>
                <button class="btn-secondary" style="padding: 4px 12px; font-size: 12px;" onclick="declineInvite('${inv.id}')">Decline</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function acceptInvite(id) {
    const { error } = await supabaseClient.rpc('accept_invitation', { invite_id: id });
    if (error) alert(error.message);
    await loadProjectDashboard();
}

async function declineInvite(id) {
    const { error } = await supabaseClient.from('invitations').update({ status: 'declined' }).eq('id', id);
    if (error) alert(error.message);
    await loadProjectDashboard();
}

function openCreateProjectModal() {
    openModal('create-project-modal', { initialFocus: '#new-project-name' });
}

function closeCreateProjectModal() {
    closeModal('create-project-modal');
}

async function createProject() {
    const name = document.getElementById('new-project-name').value.trim();
    const desc = document.getElementById('new-project-desc').value.trim();
    if (!name) return alert("Project name required");
    
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) return;

    const { data, error } = await supabaseClient
        .from('projects')
        .insert({ name, description: desc, created_by: userData.user.id })
        .select()
        .single();
        
    if (error) {
        alert(error.message);
        return;
    }
    
    closeCreateProjectModal();
    toast('Project created.', { variant: 'success' });
    // Re-load the dashboard so they see it and can click it
    await loadProjectDashboard();
}

async function selectProject(id, role) {
    // Idempotency: short-circuit if we're already on this project. Avoids
    // re-running migration and re-fetching data on accidental double-click
    // or re-routing to the same project.
    if (currentProjectId === id) return;

    currentProjectId = id;
    currentProjectRole = role;
    AppState.set('projectId', id);
    AppState.set('projectRole', role);

    updateNavIdentity();
    applyRoleRestrictions();

    // Overlay visibility is now owned by the router — see router.js. We only
    // do the data load + map resize here.
    if (typeof map !== 'undefined' && map) setTimeout(() => map.invalidateSize(), 100);

    if (typeof loadInitialData === 'function') await loadInitialData();
}

async function loadInitialData() {
    // 1. Migrate Local Storage Data to this specific project if any exists
    await StorageManager.migrateFromLocalStorage();
    
    // 2. Load Depot Configuration
    const depot = await StorageManager.getDepot();
    const latInp = document.getElementById('opt-depot-lat');
    const lonInp = document.getElementById('opt-depot-lon');
    if (latInp && lonInp) {
        latInp.value = depot[1];
        lonInp.value = depot[0];
    }
    
    // 3. Render UI components that pull from StorageManager
    await renderEngineerList();
    await renderJobLists();
    await renderOptimisePanel();

    // 4. Load dispatch history & remix history for this project
    await loadHistory();
    await loadRemixHistory();
}

// --- Project Settings Modal ---
function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-settings-tab') === tabName));
    document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('settings-panel-' + tabName);
    if (panel) panel.style.display = 'block';
}

async function openProjectSettingsModal() {
    if (!currentProjectId) return;

    const canInvite = canPerform('invite');
    const canManage = canPerform('manage_members');
    const canEdit = canPerform('edit_project');

    // Toggle direct invite vs request invite form
    const inviteSection = document.getElementById('invite-section');
    const requestSection = document.getElementById('invite-request-section');
    if (inviteSection) inviteSection.style.display = canInvite ? '' : 'none';
    if (requestSection) requestSection.style.display = canInvite ? 'none' : '';

    // Invite requests section in Invitations tab (admin/owner only)
    const requestsSection = document.getElementById('invite-requests-section');
    if (requestsSection) requestsSection.style.display = canManage ? '' : 'none';

    // General tab — project editing
    const saveBtn = document.getElementById('save-project-details-btn');
    const editName = document.getElementById('edit-project-name');
    const editDesc = document.getElementById('edit-project-desc');
    if (editName) editName.disabled = !canEdit;
    if (editDesc) editDesc.disabled = !canEdit;
    if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';

    // Danger zone
    const leaveBtn = document.getElementById('leave-project-btn');
    const deleteBtn = document.getElementById('delete-project-btn');
    if (leaveBtn) leaveBtn.style.display = currentProjectRole !== 'owner' ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = canEdit ? '' : 'none';

    // Load current project details into General tab
    const projects = AppState.get('projects') || [];
    const current = projects.find(p => p.id === currentProjectId);
    if (editName && current) editName.value = current.name || '';
    if (editDesc && current) editDesc.value = current.description || '';

    // Reset to Team tab
    switchSettingsTab('team');

    openModal('project-settings-modal', {
        initialFocus: canInvite ? '#invite-email' : '#request-invite-email',
    });

    await loadTeamMembers(canManage);
    await loadPendingInvites(canManage);
    if (canManage) await loadInviteRequests();
}

function closeProjectSettingsModal() {
    closeModal('project-settings-modal');
}

async function loadTeamMembers(canManage) {
    const list = document.getElementById('team-members-list');
    list.innerHTML = '<div class="status-text">Loading members...</div>';
    
    // Join with profiles to get emails and names
    const { data: members, error } = await supabaseClient
        .from('project_members')
        .select('user_id, role, profiles(email, display_name, first_name, last_name)')
        .eq('project_id', currentProjectId);
        
    if (error) {
        list.innerHTML = `<div style="color:red;">Failed to load members: ${error.message}</div>`;
        return;
    }

    const currentUserId = AppState.get('userId');
    
    list.innerHTML = '';
    members.forEach(m => {
        const email = m.profiles?.email || `${m.user_id.substring(0,8)}...`;
        const firstName = m.profiles?.first_name || '';
        const lastName = m.profiles?.last_name || '';
        const displayName = (firstName + ' ' + lastName).trim() || m.profiles?.display_name || '';
        const isMe = m.user_id === currentUserId;
        const initials = firstName ? (firstName.charAt(0) + (lastName ? lastName.charAt(0) : '')).toUpperCase() : email.substring(0, 2).toUpperCase();

        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(255,255,255,0.04); border-radius:6px;';
        
        let roleHtml = `<span style="padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: rgba(255,255,255,0.06); color: var(--app-fg-soft);">${m.role}</span>`;
        if (canManage && !isMe && m.role !== 'owner') {
            roleHtml = `
                <select class="form-input" style="padding:3px 6px; height:auto; width:100px; font-size:12px;" onchange="changeRole('${m.user_id}', this.value)">
                    <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    <option value="user" ${m.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="owner" ${m.role === 'owner' ? 'selected' : ''}>Owner</option>
                </select>
                <button class="btn-icon" style="color:#ef4444; margin-left:6px; font-size:16px;" onclick="removeMember('${m.user_id}')" title="Remove member">&times;</button>
            `;
        }
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:30px; height:30px; border-radius:50%; background:${isMe ? 'var(--yx-grad-deep-blue)' : 'rgba(255,255,255,0.08)'}; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:white; flex-shrink:0;">${initials}</div>
                <div>
                    <div style="font-size:13px; font-weight:500; color:var(--app-fg);">${displayName || email.split('@')[0]}${isMe ? ' <span style="font-size:10px; color:var(--yx-amber); font-weight:600;">(you)</span>' : ''}</div>
                    <div style="font-size:11px; color:var(--app-fg-soft);">${email}</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">${roleHtml}</div>
        `;
        list.appendChild(div);
    });
}

async function loadPendingInvites(canManage) {
    const list = document.getElementById('pending-invites-list');
    if (!list) return;
    list.innerHTML = '<div class="status-text">Loading...</div>';

    const { data: invites, error } = await supabaseClient
        .from('invitations')
        .select('id, email, role, created_at')
        .eq('project_id', currentProjectId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error || !invites || invites.length === 0) {
        list.innerHTML = '<div class="status-text" style="color: var(--app-fg-soft);">No pending invitations.</div>';
        return;
    }

    list.innerHTML = '';
    invites.forEach(inv => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(255,255,255,0.04); border-radius:6px;';
        const ago = _timeAgo(inv.created_at);
        div.innerHTML = `
            <div>
                <div style="font-size:13px; color:var(--app-fg);">${inv.email}</div>
                <div style="font-size:11px; color:var(--app-fg-soft);">Invited as ${inv.role} · ${ago}</div>
            </div>
            ${canManage ? `<button class="btn-outline" style="padding:3px 10px; font-size:11px; border-color:rgba(239,68,68,0.3); color:#ef4444;" onclick="revokeInvite('${inv.id}')">Revoke</button>` : ''}
        `;
        list.appendChild(div);
    });
}

function _timeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

async function revokeInvite(id) {
    if (!confirm('Revoke this invitation?')) return;
    await supabaseClient.from('invitations').delete().eq('id', id);
    toast('Invitation revoked.', { variant: 'info' });
    await loadPendingInvites(canPerform('manage_members'));
}

async function sendProjectInvite() {
    const email = document.getElementById('invite-email').value.trim();
    const role = document.getElementById('invite-role').value;
    if (!email) return alert("Email required");

    try {
        const resp = await apiFetch('/invitations/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role }),
        });
        const result = await resp.json();

        if (!resp.ok) {
            toast(result.detail || 'Failed to send invitation.', { variant: 'error' });
        } else {
            toast('Invitation sent — email notification delivered.', { variant: 'success' });
            document.getElementById('invite-email').value = '';
            await logActivity('member.invited', 'team', { email, role });
            await loadPendingInvites(canPerform('manage_members'));
        }
    } catch (err) {
        console.error('Invitation error:', err);
        toast('Failed to send invitation. Please try again.', { variant: 'error' });
    }
}

async function removeMember(userId) {
    if (!confirm("Remove this member from the project?")) return;
    await supabaseClient.from('project_members').delete().match({ project_id: currentProjectId, user_id: userId });
    await logActivity('member.removed', 'team', { user_id: userId });
    toast('Member removed.', { variant: 'info' });
    loadTeamMembers(canPerform('manage_members'));
}

async function changeRole(userId, newRole) {
    if (newRole === 'owner' && !confirm('Transfer ownership? This will make them an Owner. Continue?')) {
        loadTeamMembers(canPerform('manage_members'));
        return;
    }
    const { error } = await supabaseClient.from('project_members').update({ role: newRole }).match({ project_id: currentProjectId, user_id: userId });
    if (error) {
        alert(error.message);
        return;
    }
    await logActivity('member.role_changed', 'team', { user_id: userId, to: newRole });
    toast('Role updated.', { variant: 'success' });
    loadTeamMembers(canPerform('manage_members'));
}

async function saveProjectDetails() {
    const name = document.getElementById('edit-project-name').value.trim();
    const desc = document.getElementById('edit-project-desc').value.trim();
    if (!name) return toast('Project name cannot be empty.', { variant: 'error' });

    const { error } = await supabaseClient
        .from('projects')
        .update({ name, description: desc })
        .eq('id', currentProjectId);

    if (error) {
        toast('Failed to update: ' + error.message, { variant: 'error' });
        return;
    }

    await logActivity('project.updated', 'project', { field: 'name/description' });
    toast('Project updated.', { variant: 'success' });
    // Update cached project list
    const projects = AppState.get('projects') || [];
    const idx = projects.findIndex(p => p.id === currentProjectId);
    if (idx >= 0) { projects[idx].name = name; projects[idx].description = desc; AppState.set('projects', projects); }
    updateNavIdentity();
}

async function leaveProject() {
    if (!confirm('Leave this project? You will lose access to all project data.')) return;
    const userId = AppState.get('userId');
    await logActivity('member.left', 'team', {});
    await supabaseClient.from('project_members').delete().match({ project_id: currentProjectId, user_id: userId });
    toast('You have left the project.', { variant: 'info' });
    closeProjectSettingsModal();
    router.navigate('/projects');
}

async function deleteProject() {
    const projects = AppState.get('projects') || [];
    const current = projects.find(p => p.id === currentProjectId);
    const name = current?.name || 'this project';
    if (!confirm(`Permanently delete "${name}"? All data (engineers, jobs, history) will be lost. This cannot be undone.`)) return;

    await logActivity('project.deleted', 'project', { name });

    const { error } = await supabaseClient.from('projects').delete().eq('id', currentProjectId);
    if (error) {
        toast('Failed to delete: ' + error.message, { variant: 'error' });
        return;
    }
    toast('Project deleted.', { variant: 'info' });
    closeProjectSettingsModal();
    router.navigate('/projects');
}

// ═══ Invite Request System ═══════════════════════════════════

function toggleRoleJustification() {
    const role = document.getElementById('request-invite-role').value;
    const group = document.getElementById('role-justification-group');
    if (group) group.style.display = role !== 'viewer' ? '' : 'none';
}

async function submitInviteRequest() {
    const email = document.getElementById('request-invite-email').value.trim();
    const role = document.getElementById('request-invite-role').value;
    const comment = document.getElementById('request-invite-comment').value.trim();
    const roleReason = document.getElementById('request-invite-role-reason')?.value.trim() || '';

    if (!email) return toast('Email address is required.', { variant: 'warning' });
    if (!comment) return toast('Please explain why this person should join.', { variant: 'warning' });
    if (role !== 'viewer' && !roleReason) return toast('Please justify the requested access level.', { variant: 'warning' });

    const userId = AppState.get('userId');
    const { error } = await supabaseClient.from('invite_requests').insert({
        project_id: currentProjectId,
        requested_by: userId,
        email,
        role,
        comment,
        role_justification: role !== 'viewer' ? roleReason : null,
    });

    if (error) {
        toast('Failed to submit request: ' + error.message, { variant: 'error' });
        return;
    }

    await logActivity('member.invite_requested', 'team', { email, role, comment });

    // Notify admins via email (fire-and-forget)
    const session = AppState.get('session');
    const requesterEmail = session?.user?.email || '';
    const requesterName = requesterEmail.split('@')[0];
    apiFetch('/invitations/request-notify-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            project_id: currentProjectId,
            requester_email: requesterEmail,
            requester_name: requesterName,
            invitee_email: email,
            role,
            comment,
            role_justification: role !== 'viewer' ? roleReason : null,
        }),
    }).catch(err => console.warn('Admin notification failed:', err));

    toast('Invite request submitted for admin review.', { variant: 'success' });
    document.getElementById('request-invite-email').value = '';
    document.getElementById('request-invite-comment').value = '';
    if (document.getElementById('request-invite-role-reason')) document.getElementById('request-invite-role-reason').value = '';
    document.getElementById('request-invite-role').value = 'viewer';
    toggleRoleJustification();
}

async function loadInviteRequests() {
    const list = document.getElementById('invite-requests-list');
    const badge = document.getElementById('request-count-badge');
    if (!list) return;
    list.innerHTML = '<div class="status-text">Loading...</div>';

    const { data: requests, error } = await supabaseClient
        .from('invite_requests')
        .select('id, email, role, comment, role_justification, created_at, requested_by, profiles!invite_requests_requested_by_fkey(email, display_name)')
        .eq('project_id', currentProjectId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error || !requests || requests.length === 0) {
        list.innerHTML = '<div class="status-text" style="color: var(--app-fg-soft);">No pending requests.</div>';
        if (badge) badge.textContent = '';
        return;
    }

    if (badge) badge.textContent = requests.length;

    list.innerHTML = '';
    requests.forEach(req => {
        const requesterName = req.profiles?.display_name || req.profiles?.email || 'Unknown';
        const ago = _timeAgo(req.created_at);
        const div = document.createElement('div');
        div.style.cssText = 'padding:14px 16px; background:rgba(255,255,255,0.04); border-radius:8px; border-left:3px solid var(--yx-orange);';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div>
                    <div style="font-size:14px; font-weight:500; color:var(--app-fg);">${req.email} <span style="font-size:11px; padding:1px 8px; border-radius:10px; background:rgba(255,255,255,0.06); color:var(--app-fg-soft); margin-left:4px;">${req.role}</span></div>
                    <div style="font-size:11px; color:var(--app-fg-soft); margin-top:2px;">Requested by ${requesterName} · ${ago}</div>
                </div>
            </div>
            <div style="font-size:12px; color:var(--app-fg-soft); background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:4px; margin-bottom:6px;">
                <strong style="color:var(--app-fg);">Reason:</strong> ${req.comment}
            </div>
            ${req.role_justification ? `<div style="font-size:12px; color:var(--app-fg-soft); background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:4px; margin-bottom:10px;">
                <strong style="color:var(--yx-amber);">Role justification:</strong> ${req.role_justification}
            </div>` : ''}
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button class="btn-outline" style="padding:4px 14px; font-size:12px; border-color:rgba(239,68,68,0.3); color:#ef4444;" onclick="rejectInviteRequest('${req.id}', '${req.email}')">Reject</button>
                <button class="btn-primary" style="padding:4px 14px; font-size:12px;" onclick="approveInviteRequest('${req.id}', '${req.email}', '${req.role}')">Approve & Send Invite</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function approveInviteRequest(requestId, email, role) {
    const userId = AppState.get('userId');

    // Look up the request to get requester info
    const { data: reqData } = await supabaseClient
        .from('invite_requests')
        .select('requested_by, profiles!invite_requests_requested_by_fkey(email)')
        .eq('id', requestId)
        .limit(1)
        .single();
    const requesterEmail = reqData?.profiles?.email || '';

    // Update request status
    const { error: updateErr } = await supabaseClient
        .from('invite_requests')
        .update({ status: 'approved', reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq('id', requestId);

    if (updateErr) {
        toast('Failed to approve: ' + updateErr.message, { variant: 'error' });
        return;
    }

    // Create the actual invitation
    const { error: inviteErr } = await supabaseClient
        .from('invitations')
        .insert({
            project_id: currentProjectId,
            email: email,
            role: role,
            invited_by: userId,
        });

    if (inviteErr) {
        toast('Approved but failed to create invitation: ' + inviteErr.message, { variant: 'error' });
        return;
    }

    await logActivity('member.request_approved', 'team', { email, role });

    // Notify requester via email (fire-and-forget)
    const session = AppState.get('session');
    const reviewerName = session?.user?.email?.split('@')[0] || 'An admin';
    if (requesterEmail) {
        apiFetch('/invitations/request-decision-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: currentProjectId,
                requester_email: requesterEmail,
                invitee_email: email,
                role,
                status: 'approved',
                reviewer_name: reviewerName,
            }),
        }).catch(err => console.warn('Requester notification failed:', err));
    }

    toast(`Request approved — invitation sent to ${email}.`, { variant: 'success' });
    await loadInviteRequests();
    await loadPendingInvites(canPerform('manage_members'));
}

async function rejectInviteRequest(requestId, email) {
    const reason = prompt('Optional: provide a reason for rejection');
    const userId = AppState.get('userId');

    // Look up requester info
    const { data: reqData } = await supabaseClient
        .from('invite_requests')
        .select('requested_by, role, profiles!invite_requests_requested_by_fkey(email)')
        .eq('id', requestId)
        .limit(1)
        .single();
    const requesterEmail = reqData?.profiles?.email || '';
    const reqRole = reqData?.role || '';

    const { error } = await supabaseClient
        .from('invite_requests')
        .update({ status: 'rejected', reviewed_by: userId, review_note: reason || null, reviewed_at: new Date().toISOString() })
        .eq('id', requestId);

    if (error) {
        toast('Failed to reject: ' + error.message, { variant: 'error' });
        return;
    }

    await logActivity('member.request_rejected', 'team', { email, reason: reason || '' });

    // Notify requester via email (fire-and-forget)
    const session = AppState.get('session');
    const reviewerName = session?.user?.email?.split('@')[0] || 'An admin';
    if (requesterEmail) {
        apiFetch('/invitations/request-decision-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: currentProjectId,
                requester_email: requesterEmail,
                invitee_email: email,
                role: reqRole,
                status: 'rejected',
                reviewer_name: reviewerName,
                reason: reason || null,
            }),
        }).catch(err => console.warn('Requester notification failed:', err));
    }

    toast('Request rejected.', { variant: 'info' });
    await loadInviteRequests();
}

// ═══ Activity Log ════════════════════════════════════════════

const ACTION_DESCRIPTIONS = {
    'member.invited':           d => `invited <strong>${d.email}</strong> as ${d.role}`,
    'member.invite_requested':  d => `requested to invite <strong>${d.email}</strong> as ${d.role}`,
    'member.request_approved':  d => `approved invite request for <strong>${d.email}</strong> as ${d.role}`,
    'member.request_rejected':  d => `rejected invite request for <strong>${d.email}</strong>${d.reason ? ': "' + d.reason + '"' : ''}`,
    'member.joined':            d => `joined the project as ${d.role}`,
    'member.removed':           d => `removed a member from the project`,
    'member.role_changed':      d => `changed a member's role from ${d.from} to <strong>${d.to}</strong>`,
    'member.left':              d => `left the project`,
    'project.updated':          d => `updated project ${d.field || 'settings'}`,
    'project.deleted':          d => `deleted the project`,
    'dispatch.run':             d => `ran dispatch #${d.test_number || '?'} — ${d.num_engineers} engineers, ${d.num_jobs} jobs (${d.strategy})`,
    'dispatch.remixed':         d => `remixed dispatch #${d.parent_number || '?'}`,
    'data.engineer_added':      d => `added engineer <strong>${d.name || ''}</strong>`,
    'data.engineer_removed':    d => `removed engineer <strong>${d.name || ''}</strong>`,
    'data.jobs_uploaded':       d => `uploaded ${d.count || '?'} jobs`,
    'data.depot_changed':       d => `changed depot location`,
};

async function logActivity(action, category, details = {}) {
    if (!currentProjectId) return;
    const userId = AppState.get('userId');
    if (!userId) return;
    try {
        await supabaseClient.from('activity_log').insert({
            project_id: currentProjectId,
            user_id: userId,
            action,
            category,
            details,
        });
    } catch (e) {
        console.warn('Activity log write failed:', e);
    }
}

let _activityOffset = 0;
const _activityPageSize = 30;
let _activityCategory = 'all';

function filterActivity(category) {
    _activityCategory = category;
    _activityOffset = 0;
    document.querySelectorAll('.activity-chip').forEach(c => c.classList.toggle('active', c.getAttribute('data-category') === category));
    loadActivityLog();
}

async function loadActivityLog(append = false) {
    if (!currentProjectId) return;
    const timeline = document.getElementById('activity-timeline');
    const loadMoreBtn = document.getElementById('activity-load-more');
    if (!timeline) return;

    if (!append) {
        _activityOffset = 0;
        timeline.innerHTML = '<div class="status-text">Loading activity...</div>';
    }

    let query = supabaseClient
        .from('activity_log')
        .select('id, user_id, action, category, details, created_at, profiles!activity_log_user_id_fkey(email, display_name)')
        .eq('project_id', currentProjectId)
        .order('created_at', { ascending: false })
        .range(_activityOffset, _activityOffset + _activityPageSize - 1);

    // Category filter
    if (_activityCategory !== 'all') {
        query = query.eq('category', _activityCategory);
    }

    // User filter
    const userFilter = document.getElementById('activity-user-filter')?.value;
    if (userFilter) {
        query = query.eq('user_id', userFilter);
    }

    // Date filter
    const dayFilter = document.getElementById('activity-date-filter')?.value;
    if (dayFilter) {
        const since = new Date(Date.now() - parseInt(dayFilter) * 86400000).toISOString();
        query = query.gte('created_at', since);
    }

    const { data: entries, error } = await query;

    if (error) {
        timeline.innerHTML = `<div class="status-text" style="color:red;">Failed to load: ${error.message}</div>`;
        return;
    }

    if (!append) timeline.innerHTML = '';

    if ((!entries || entries.length === 0) && !append) {
        timeline.innerHTML = '<div class="status-text" style="color:var(--app-fg-soft);">No activity yet.</div>';
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        return;
    }

    (entries || []).forEach(entry => {
        const name = entry.profiles?.display_name || entry.profiles?.email?.split('@')[0] || 'Unknown';
        const descFn = ACTION_DESCRIPTIONS[entry.action];
        const desc = descFn ? descFn(entry.details || {}) : entry.action;
        const ago = _timeAgo(entry.created_at);
        const dateStr = new Date(entry.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        const div = document.createElement('div');
        div.className = 'activity-item';
        div.innerHTML = `
            <div class="activity-dot" data-category="${entry.category}"></div>
            <div class="activity-body">
                <div class="activity-text"><strong>${name}</strong> ${desc}</div>
                <div class="activity-meta">${dateStr} · ${ago}</div>
                ${entry.details?.comment ? `<div class="activity-detail">"${entry.details.comment}"</div>` : ''}
            </div>
        `;
        timeline.appendChild(div);
    });

    _activityOffset += entries.length;
    if (loadMoreBtn) loadMoreBtn.style.display = entries.length >= _activityPageSize ? '' : 'none';
}

function loadMoreActivity() {
    loadActivityLog(true);
}

async function populateActivityUserFilter() {
    const select = document.getElementById('activity-user-filter');
    if (!select || !currentProjectId) return;

    const { data: members } = await supabaseClient
        .from('project_members')
        .select('user_id, profiles!project_members_profile_fkey(email, display_name)')
        .eq('project_id', currentProjectId);

    // Keep current value
    const current = select.value;
    select.innerHTML = '<option value="">All members</option>';
    (members || []).forEach(m => {
        const name = m.profiles?.display_name || m.profiles?.email || m.user_id.substring(0, 8);
        const opt = document.createElement('option');
        opt.value = m.user_id;
        opt.textContent = name;
        select.appendChild(opt);
    });
    select.value = current;
}

// Flag: true when sign-up just succeeded and we're showing the onboarding card.
// Prevents the router from navigating away from the auth overlay.
let _signupOnboardingPending = false;

function handleAuthChange(session) {
    // Mirror session state into AppState. userId is the de-duping key —
    // Supabase session objects are not ref-stable across getSession() and
    // onAuthStateChange callbacks. Boot flips to 'ready' on the first call,
    // which is what releases the router's boot gate.
    AppState.set('session', session);
    AppState.set('userId', session?.user?.id ?? null);

    if (!session) {
        // Clear project-scoped state on sign-out. The router will route to
        // #/login when it observes the cleared userId.
        currentProjectId = null;
        currentProjectRole = null;
        AppState.set('projectId', null);
        AppState.set('projectRole', null);
        AppState.set('projects', null);
        AppState.set('userProfile', null);
        _signupOnboardingPending = false;
        AppState.set('boot', 'ready');
    } else if (_signupOnboardingPending) {
        // Sign-up onboarding is in progress — don't set boot='ready' yet.
        // The onboarding submit handler will do it after the profile is saved.
        // Fetch profile silently in background (it won't have name yet).
        fetchUserProfile();
    } else {
        // Normal login — fetch profile for nav display, then boot.
        fetchUserProfile().then(() => {
            updateNavIdentity();
        });
        AppState.set('boot', 'ready');
    }
}

let isSignUpMode = false;

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('auth-title').textContent = isSignUpMode ? 'Create an Account' : 'VROOM Intelligence';
    document.getElementById('auth-subtitle').textContent = isSignUpMode ? 'Sign up to get started.' : 'Sign in to access the dispatch platform.';
    document.getElementById('login-btn').innerHTML = isSignUpMode ? 'Sign up &rarr;' : 'Sign in &rarr;';
    document.getElementById('auth-toggle-btn').textContent = isSignUpMode ? 'Already have an account? Sign in' : 'Create an account';
    document.getElementById('forgot-password-btn').style.display = isSignUpMode ? 'none' : '';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('login-success').style.display = 'none';
}

async function handleForgotPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
        toast('Enter your email address first.', { variant: 'warning' });
        return;
    }
    const btn = document.getElementById('forgot-password-btn');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    try {
        const resp = await fetch(API_BASE + '/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const result = await resp.json();
        if (resp.ok) {
            toast('If an account exists for that email, a reset link has been sent.', { variant: 'success' });
        } else {
            toast('Error: ' + (result.detail || 'Something went wrong.'), { variant: 'error' });
        }
    } catch (err) {
        console.error('Forgot password error:', err);
        toast('Connection error. Please try again.', { variant: 'error' });
    }
    btn.textContent = 'Forgot password?';
    btn.disabled = false;
}


// Fire-and-forget welcome email after sign-up
function _sendWelcomeEmail(email) {
    fetch(API_BASE + '/auth/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    }).catch(err => console.warn('Welcome email failed (non-blocking):', err));
}

// Fire-and-forget verification email after sign-up (not blocking — user can use app immediately)
function _sendVerificationEmail(email) {
    fetch(API_BASE + '/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    }).catch(err => console.warn('Verification email failed (non-blocking):', err));
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const successEl = document.getElementById('login-success');
    const btn = document.getElementById('login-btn');
    
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = isSignUpMode ? 'Creating account...' : 'Signing in...';

    try {
        if (isSignUpMode) {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) {
                errorEl.textContent = error.message;
                errorEl.style.display = 'block';
                btn.innerHTML = 'Sign up &rarr;';
                btn.disabled = false;
            } else if (data.user && !data.session) {
                // Supabase has email confirmation enabled but we don't want to block the user.
                // Sign them in immediately and send verification email as a non-blocking courtesy.
                _sendWelcomeEmail(email);
                _sendVerificationEmail(email);
                // Auto sign-in now that the account exists
                const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (signInError) {
                    // If auto sign-in fails (e.g. email confirmation is enforced at Supabase level),
                    // fall back to the confirmation message
                    successEl.textContent = 'Account created! Check your email to confirm, then sign in.';
                    successEl.style.display = 'block';
                    btn.innerHTML = 'Sign up &rarr;';
                    btn.disabled = false;
                } else {
                    // Sign-in succeeded — proceed to onboarding
                    _signupOnboardingPending = true;
                    document.getElementById('login-card').style.display = 'none';
                    document.getElementById('onboarding-card').style.display = '';
                    btn.innerHTML = 'Sign up &rarr;';
                    btn.disabled = false;
                }
            } else {
                // Successful sign-up with auto-confirm — show onboarding card
                if (data.user) {
                    _sendWelcomeEmail(email);
                    _sendVerificationEmail(email);
                }
                _signupOnboardingPending = true;
                // Swap login card for onboarding card inside auth overlay
                document.getElementById('login-card').style.display = 'none';
                document.getElementById('onboarding-card').style.display = '';
                btn.innerHTML = 'Sign up &rarr;';
                btn.disabled = false;
            }
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                errorEl.textContent = error.message;
                errorEl.style.display = 'block';
                btn.innerHTML = 'Sign in &rarr;';
                btn.disabled = false;
            } else {
                // Successful login
                btn.innerHTML = 'Sign in &rarr;';
                btn.disabled = false;
            }
        }
    } catch (err) {
        console.error('Auth error:', err);
        errorEl.textContent = `Connection error: ${err.message || 'Could not reach authentication server. Please try again.'}`;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = isSignUpMode ? 'Sign up &rarr;' : 'Sign in &rarr;';
    }
}

async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Error logging out:', error.message);
        toast('Sign-out failed. Try again.', { variant: 'error' });
        return;
    }
    // The router will redirect to #/login when it observes the cleared session.
    toast('You have been signed out.', { variant: 'info' });
}


// ═══ User Profile Management ═════════════════════════════════════

async function fetchUserProfile() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        
        const resp = await fetch(API_BASE + '/profile', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (resp.ok) {
            const profile = await resp.json();
            AppState.set('userProfile', profile);
        } else {
            AppState.set('userProfile', null);
        }
    } catch (err) {
        console.error('Error fetching user profile:', err);
    }
}

async function handleOnboardingSubmit(event) {
    event.preventDefault();
    const firstName = document.getElementById('onboard-first-name').value.trim();
    const lastName = document.getElementById('onboard-last-name').value.trim();
    const department = document.getElementById('onboard-department').value.trim();
    const errorEl = document.getElementById('onboard-error');
    const btn = document.getElementById('onboard-btn');
    
    errorEl.style.display = 'none';
    
    if (!firstName || !lastName) {
        errorEl.textContent = 'First name and last name are required.';
        errorEl.style.display = 'block';
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Setting up...';
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('No active session');
        
        const body = { first_name: firstName, last_name: lastName };
        if (department) body.department = department;
        
        const resp = await fetch(API_BASE + '/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(body)
        });
        
        if (!resp.ok) {
            const result = await resp.json();
            throw new Error(result.detail || 'Failed to save profile');
        }
        
        const profile = await resp.json();
        AppState.set('userProfile', profile);
        updateNavIdentity();
        toast('Profile created! Welcome to YuRoute.', { variant: 'success' });
        
        // Release the onboarding hold — let the router boot and navigate
        _signupOnboardingPending = false;
        document.getElementById('onboarding-card').style.display = 'none';
        document.getElementById('login-card').style.display = '';
        AppState.set('boot', 'ready');
    } catch (err) {
        console.error('Onboarding error:', err);
        errorEl.textContent = err.message || 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
    }
    
    btn.disabled = false;
    btn.innerHTML = 'Complete Setup &rarr;';
}

function loadProfilePage() {
    const profile = AppState.get('userProfile');
    const session = AppState.get('session');
    const email = session?.user?.email ?? '';
    
    // Populate avatar
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl && profile) {
        const fn = profile.first_name || '';
        const ln = profile.last_name || '';
        avatarEl.textContent = (fn.charAt(0) + ln.charAt(0)).toUpperCase() || email.substring(0, 2).toUpperCase();
    }
    
    // Populate display name
    const nameEl = document.getElementById('profile-display-name');
    if (nameEl && profile) {
        nameEl.textContent = ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim() || 'Your Profile';
    }
    
    // Populate email
    const emailEl = document.getElementById('profile-email');
    if (emailEl) emailEl.textContent = email;
    
    // Populate form fields
    const fnInput = document.getElementById('profile-first-name');
    const lnInput = document.getElementById('profile-last-name');
    const deptInput = document.getElementById('profile-department');
    const emailInput = document.getElementById('profile-email-field');
    
    if (fnInput) fnInput.value = profile?.first_name || '';
    if (lnInput) lnInput.value = profile?.last_name || '';
    if (deptInput) deptInput.value = profile?.department || '';
    if (emailInput) emailInput.value = email;
}

async function saveProfileChanges() {
    const firstName = document.getElementById('profile-first-name').value.trim();
    const lastName = document.getElementById('profile-last-name').value.trim();
    const department = document.getElementById('profile-department').value.trim();
    const btn = document.getElementById('profile-save-btn');
    
    if (!firstName || !lastName) {
        toast('First name and last name are required.', { variant: 'error' });
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('No active session');
        
        const body = { first_name: firstName, last_name: lastName };
        if (department) body.department = department;
        
        const resp = await fetch(API_BASE + '/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(body)
        });
        
        if (!resp.ok) {
            const result = await resp.json();
            throw new Error(result.detail || 'Failed to save profile');
        }
        
        const profile = await resp.json();
        AppState.set('userProfile', profile);
        updateNavIdentity();
        
        // Update display on the profile page
        loadProfilePage();
        
        toast('Profile updated.', { variant: 'success' });
    } catch (err) {
        console.error('Profile save error:', err);
        toast('Failed to save: ' + (err.message || 'Unknown error'), { variant: 'error' });
    }
    
    btn.disabled = false;
    btn.innerHTML = 'Save Changes &rarr;';
}


// ═══ Storage Manager ═════════════════════════════════════════
const StorageManager = {
    async getEngineers() {
        if (!currentProjectId) return [];
        const { data, error } = await supabaseClient.from('engineers').select('data').eq('project_id', currentProjectId);
        if (error) { console.error("Error fetching engineers:", error); return []; }
        return data ? data.map(r => r.data) : [];
    },
    async saveEngineers(arr) {
        if (!currentProjectId) return;
        const rows = arr.map(e => ({ id: e.id, project_id: currentProjectId, data: e }));
        const currentIds = arr.map(e => e.id);
        
        if (currentIds.length > 0) {
            await supabaseClient.from('engineers').delete().eq('project_id', currentProjectId).not('id', 'in', `(${currentIds.join(',')})`);
        } else {
            await supabaseClient.from('engineers').delete().eq('project_id', currentProjectId);
        }
        
        if (rows.length > 0) {
            await supabaseClient.from('engineers').upsert(rows);
        }
    },
    async getJobLists() {
        if (!currentProjectId) return [];
        const { data, error } = await supabaseClient.from('job_lists').select('data').eq('project_id', currentProjectId);
        if (error) { console.error("Error fetching job lists:", error); return []; }
        return data ? data.map(r => r.data) : [];
    },
    async saveJobLists(arr) {
        if (!currentProjectId) return;
        const rows = arr.map(jl => ({ id: jl.id, project_id: currentProjectId, data: jl }));
        const currentIds = arr.map(jl => jl.id);
        
        if (currentIds.length > 0) {
            await supabaseClient.from('job_lists').delete().eq('project_id', currentProjectId).not('id', 'in', `(${currentIds.join(',')})`);
        } else {
            await supabaseClient.from('job_lists').delete().eq('project_id', currentProjectId);
        }
        
        if (rows.length > 0) {
            await supabaseClient.from('job_lists').upsert(rows);
        }
    },
    async getDepot() {
        if (!currentProjectId) return [-0.1278, 51.5074];
        const { data, error } = await supabaseClient.from('global_settings')
            .select('value').eq('project_id', currentProjectId).eq('key', 'main_depot').maybeSingle();
        if (data && data.value) {
            try { return JSON.parse(data.value); } catch(e) {}
        }
        return [-0.1278, 51.5074];
    },
    async saveDepot(lon, lat) {
        if (!currentProjectId) return;
        await supabaseClient.from('global_settings').upsert({
            key: 'main_depot', project_id: currentProjectId, value: JSON.stringify([lon, lat])
        });
    },
    async migrateFromLocalStorage() {
        if (!currentProjectId) return;
        
        const rawEngineers = localStorage.getItem('vroom_engineers');
        const rawJobLists = localStorage.getItem('vroom_job_lists');
        const rawDepot = localStorage.getItem('vroom_main_depot');
        let migratedAny = false;

        if (rawEngineers) {
            try {
                const arr = JSON.parse(rawEngineers);
                if (arr && arr.length > 0) { await this.saveEngineers(arr); migratedAny = true; }
            } catch(e) {}
            localStorage.removeItem('vroom_engineers');
        }
        if (rawJobLists) {
            try {
                const arr = JSON.parse(rawJobLists);
                if (arr && arr.length > 0) { await this.saveJobLists(arr); migratedAny = true; }
            } catch(e) {}
            localStorage.removeItem('vroom_job_lists');
        }
        if (rawDepot) {
            try {
                const arr = JSON.parse(rawDepot);
                if (Array.isArray(arr) && arr.length === 2) { await this.saveDepot(arr[0], arr[1]); migratedAny = true; }
            } catch(e) {}
            localStorage.removeItem('vroom_main_depot');
        }

        if (migratedAny) {
            alert("Local storage data has been successfully migrated to this project!");
        }
    }
};

// ═══ Navigation ═════════════════════════════════════
// switchAppView is the public entry point for nav-rail buttons (called from
// inline onclick attributes in index.html). It defers to the router so the
// URL stays the source of truth. The router calls _renderSection directly to
// avoid recursion.
function switchAppView(viewName) {
    const projectId = AppState.get('projectId');
    if (!projectId) {
        // No project selected — fall back to direct render so we don't crash
        // before the router has a project context.
        _renderSection(viewName);
        return;
    }
    router.navigate('/projects/' + encodeURIComponent(projectId) + '/' + viewName);
}

function _renderSection(viewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    const view = document.getElementById(`view-${viewName}`);
    if (btn) btn.classList.add('active');
    if (view) view.classList.add('active');
    if (viewName === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
    if (viewName === 'activity') {
        populateActivityUserFilter();
        loadActivityLog();
    }
}

// ═══ Modals ════════════════════════════════════════
function showPreflightModal() {
    renderOptimisePanel();
    openModal('preflight-modal');
}
function hidePreflightModal() {
    closeModal('preflight-modal');
}
function toggleChatPanel() {
    const p = document.getElementById('chat-slide-panel');
    p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    if (p.style.display === 'flex') {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
    }
}

function openEngineerCardsModal() { /* Removed — functionality in breakdown panel */ }
function closeEngineerCardsModal() { /* Removed */ }
function openActivityOverlay() { /* Removed — panel is always visible */ }
function closeActivityOverlay() { /* Removed */ }


function sendQuickPrompt(text) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = text;
        sendChatMessage();
    }
}

function appendChatMessage(role, text, isHtml = false) {
    const msgContainer = document.getElementById('chat-messages');
    const emptyState = document.getElementById('chat-empty');
    if (emptyState) emptyState.style.display = 'none';

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    if (isHtml) {
        bubble.innerHTML = text;
    } else {
        bubble.textContent = text;
    }

    msgContainer.appendChild(bubble);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return bubble;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    if (!state.currentResult || !state.currentResult.id) {
        appendChatMessage('bot', 'Please run a simulation first so I have data to analyze.');
        input.value = '';
        return;
    }

    // Append user message
    appendChatMessage('user', text);
    input.value = '';

    // Show typing indicator
    const typingBubble = appendChatMessage('bot', '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>', true);

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                run_id: state.currentResult.id,
                message: text,
                history: state.chatHistory
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to connect to AI');
        }

        const data = await res.json();
        
        // Remove typing indicator
        typingBubble.remove();
        
        // Update history and append bot response
        state.chatHistory = data.history;
        appendChatMessage('bot', data.reply);
        
    } catch (e) {
        console.error(e);
        typingBubble.remove();
        appendChatMessage('bot', `Error: ${e.message}`);
    }
}

const ROUTE_COLORS = [
    '#1E2ED9', '#00E38C', '#F47738', '#688ABA', '#A483FF',
    '#9DBBFF', '#FFE564', '#4A4A4A', '#AFFAD7', '#DEECFF',
    '#000000', '#E4EDED', '#6B7280', '#00bcd4', '#795548',
];

const URGENCY_COLORS = {
    critical: '#F47738', high: '#FFE564', medium: '#9DBBFF', low: '#00E38C',
};

// ═══ Highlight System (for hover-to-highlight) ═══════════════
function highlightEngineerRoutes(engineerKey) {
    // engineerKey is the base name (before _Day)
    if (routeLayerGroup) {
        routeLayerGroup.eachLayer(layer => {
            const rd = state.currentResult?.routes_data?.find(r => r.vehicle_id === layer.engineerId);
            const baseName = rd ? (rd.vehicle_name || '').split('_Day')[0] : '';
            if (baseName === engineerKey) {
                layer.setStyle({ opacity: 1, weight: (layer._baseWeight || 3) + 2 });
            } else {
                layer.setStyle({ opacity: 0.12, weight: 2 });
            }
        });
    }
}

function unhighlightEngineerRoutes() {
    if (routeLayerGroup) {
        routeLayerGroup.eachLayer(layer => {
            layer.setStyle({ opacity: 0.8, weight: layer._baseWeight || 3 });
        });
    }
}

let state = {
    numEngineers: 5,
    numJobs: 20,
    strategy: 'naive',
    isRunning: false,
    currentResult: null,
    history: [],
    remixHistory: [],
    chatHistory: [],
    selectedLegIds: new Set(),
    selectedJobIds: new Set(),
    lastSelectedLegId: null,
    lastSelectedJobId: null
};

function isMultiSelectEvent(e) {
    const ev = e?.originalEvent || e;
    return !!(ev && (ev.ctrlKey || ev.metaKey));
}

let map = null;
let routeLayerGroup = null;
let jobLayerGroup = null;
let depotLayerGroup = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ═══ Init ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    initAuth();
    initMap();
    initSliders();
    initStrategy();
    initRunButton();
    initAnimation();
    // Router last — boot gate (AppState.boot === 'pending') holds it until
    // initAuth's handleAuthChange callback resolves with a session (or null).
    // Note: loadHistory/loadRemixHistory are called inside loadInitialData()
    // once a project is selected, since they require a valid project_id.
    router.init();
});

function initMap() {
    map = L.map('map', { center: [51.505, -0.09], zoom: 11, zoomControl: true });
    
    const apiKey = 'Hd7rWKWhXYo1rIGRXkmNDWE0kXeRUrLA';
    
    // Explicitly fetch 512px (High-Res) tiles from TomTom but tell Leaflet they are 256px.
    // This forces Leaflet to squish the 512px image into a 256px CSS box, creating perfect Retina 2x density.
    const tileOptions = {
        attribution: '&copy; <a href="https://developer.tomtom.com/">TomTom</a>',
        maxZoom: 19,
        tileSize: 256,
        zoomOffset: 0
    };

    const tomtomLight = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${apiKey}&tileSize=512`, tileOptions);
    const tomtomDark = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${apiKey}&tileSize=512`, tileOptions);
    const tomtomMono = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${apiKey}&tileSize=512`, {
        ...tileOptions,
        className: 'map-monochrome'
    });

    // HERE map tiles
    const hereApiKey = 'xH844_16hN5RKa-_iFDdrfITg8eWFP1RUY9fw1lJiX4';
    const hereTileOptions = {
        attribution: '&copy; <a href="https://www.here.com">HERE</a>',
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1
    };
    const hereLight = L.tileLayer(
        `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png?style=explore.day&size=512&apiKey=${hereApiKey}`,
        hereTileOptions
    );
    const hereDark = L.tileLayer(
        `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png?style=explore.night&size=512&apiKey=${hereApiKey}`,
        hereTileOptions
    );

    tomtomLight.addTo(map); // Set Light as default
    L.control.layers({ 
        "TomTom Light": tomtomLight, 
        "TomTom Dark": tomtomDark,
        "TomTom Mono": tomtomMono,
        "HERE Light": hereLight,
        "HERE Dark": hereDark,
    }, null, { position: 'topright' }).addTo(map);

    routeLayerGroup = L.layerGroup().addTo(map);
    jobLayerGroup = L.layerGroup().addTo(map);
    depotLayerGroup = L.layerGroup().addTo(map);
    map.on('click', () => {
        if (state.selectedLegIds.size || state.selectedJobIds.size) {
            state.selectedLegIds.clear();
            state.selectedJobIds.clear();
            state.lastSelectedLegId = null;
            state.lastSelectedJobId = null;
            applyFilters();
        }
    });
}

// ═══ Sliders ═════════════════════════════════════════════
function initSliders() {
    const es = $('#engineers-slider'), js = $('#jobs-slider');
    const ei = $('#engineers-input'), ji = $('#jobs-input');

    const updateEngineers = (val) => {
        let v = Math.min(Math.max(1, +val), 50);
        state.numEngineers = v;
        es.value = v;
        ei.value = v;
        updateCostGuide();
    };

    const updateJobs = (val) => {
        let v = Math.min(Math.max(1, +val), 500);
        state.numJobs = v;
        js.value = v;
        ji.value = v;
        updateCostGuide();
    };

    if (!es || !ei || !js || !ji) return;

    es.addEventListener('input', (e) => updateEngineers(e.target.value));
    ei.addEventListener('input', (e) => updateEngineers(e.target.value));
    ei.addEventListener('change', (e) => updateEngineers(e.target.value));
    
    js.addEventListener('input', (e) => updateJobs(e.target.value));
    ji.addEventListener('input', (e) => updateJobs(e.target.value));
    ji.addEventListener('change', (e) => updateJobs(e.target.value));
}

// ═══ Strategy ════════════════════════════════════════════
function initStrategy() {
    $$('.strategy-option').forEach(opt => {
        opt.addEventListener('click', () => {
            // Only handle routing strategies, ignore classification strategies
            if (!opt.dataset.strategy) return;
            
            $$('.strategy-option[data-strategy]').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            
            const radio = opt.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            
            state.strategy = opt.dataset.strategy;
            updateCostGuide();
        });
    });
}

async function updateCostGuide() {
    const g = $('#cost-guide');
    // Read strategy from the modal radio buttons
    const strategyRadio = document.querySelector('#strategy-group input[name="strategy"]:checked');
    const currentStrategy = strategyRadio ? strategyRadio.value : state.strategy;

    if (currentStrategy === 'tomtom_premium' || currentStrategy === 'here_premium') {
        // Count vehicle-days from the rota matrix checkboxes (each checked day = 1 vehicle)
        const checkedDays = document.querySelectorAll('#opt-rota-matrix .rota-day-cb:checked');
        let numVehicleDays = checkedDays.length;
        // Fallback: if matrix not yet rendered, estimate from raw engineer count
        if (numVehicleDays === 0) {
            const engineers = await StorageManager.getEngineers();
            numVehicleDays = engineers.length;
        }

        // Count jobs from the selected job list
        let numJobs = 0;
        const jobSelect = document.getElementById('opt-job-select');
        if (jobSelect && jobSelect.value) {
            const jobLists = await StorageManager.getJobLists();
            const selected = jobLists.find(jl => jl.id === jobSelect.value);
            if (selected) numJobs = selected.jobCount || 0;
        }

        const w = numVehicleDays + numJobs;
        const titleEl = document.getElementById('cost-guide-title');

        if (currentStrategy === 'here_premium') {
            // HERE: 5 × MAX(S,D) formula (S=D=w for square matrix)
            const S = w, D = w;
            const matrixTxns = (S >= 5 && D >= 5) ? 5 * Math.max(S, D) : S * D;
            const routeTxns = 3 * w;  // convergence solver overhead
            const totalTxns = matrixTxns + routeTxns;
            const costUsd = (matrixTxns * 0.0035) + (routeTxns * 0.0015);
            const costGbp = costUsd * 0.79;  // approx USD→GBP

            if (titleEl) titleEl.textContent = 'HERE API estimate';
            $('#cost-waypoints').textContent = w;
            const elEl = document.getElementById('cost-elements');
            if (elEl) elEl.textContent = totalTxns.toLocaleString() + ' txns';
            $('#cost-gbp').textContent = `£${costGbp.toFixed(2)}`;
        } else {
            // TomTom: per-cell pricing
            const txns = (w * w) + (3 * w);
            if (titleEl) titleEl.textContent = 'TomTom API estimate';
            $('#cost-waypoints').textContent = w;
            const elEl = document.getElementById('cost-elements');
            if (elEl) elEl.textContent = txns.toLocaleString();
            $('#cost-gbp').textContent = `£${(txns * 0.0004).toFixed(2)}`;
        }
        g.classList.add('visible');
    } else {
        g.classList.remove('visible');
    }
}

// ═══ Run Simulation ══════════════════════════════════════
function initRunButton() {
    const btn = $('#run-btn');
    if (!btn) return;
    btn.addEventListener('click', () => { if (!state.isRunning) runSimulation(); });
}

async function runSimulation(replayScenario = null) {
    if (state.isRunning) return;
    const btn = $('#run-btn');
    state.isRunning = true;
    btn.disabled = true; btn.classList.add('running');
    btn.innerHTML = '<span class="spinner"></span> Simulating...';

    try {
        const payload = { num_engineers: state.numEngineers, num_jobs: state.numJobs, strategy: state.strategy };
        if (replayScenario) payload.replay_scenario = replayScenario;

        const res = await apiFetch('/simulate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }

        const result = await res.json();
        state.currentResult = result;
        renderMap(result);
        populateDaySelector(result);
        populateEngineerSelector(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        applyFilters();
        $('#download-section').style.display = 'block';
        setupAnimation(result);
        await loadHistory();
        updateRemixDropdown();
    } catch (err) {
        console.error(err);
        alert(`Simulation failed: ${err.message}`);
    } finally {
        state.isRunning = false; btn.disabled = false; btn.classList.remove('running');
        btn.innerHTML = '▶ Run Simulation';
    }
}

// ═══ Map Rendering ═══════════════════════════════════════
function renderMap(result, filterVehicleIds = null) {
    routeLayerGroup.clearLayers();
    jobLayerGroup.clearLayers();
    depotLayerGroup.clearLayers();
    const bounds = L.latLngBounds();

    // Draw routes
    if (result.routes_geojson?.features) {
        result.routes_geojson.features.forEach((f, idx) => {
            if (f.geometry.type !== 'LineString') return;
            const eid = f.properties.engineer_id;
            // Skip if day filter is active and this vehicle isn't in the filter set
            if (filterVehicleIds && !filterVehicleIds.has(eid)) return;
            
            const routeData = result.routes_data?.find(r => r.vehicle_id === eid);
            const baseId = getBaseEngineerId(eid, routeData?.vehicle_name);
            const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];
            const mult = f.properties.traffic_multiplier || 1.0;
            const isSelected = state.selectedLegIds.has(f.properties.leg_id);

            let lineColor = color, weight = 3;
            if (mult > 2.0) { lineColor = '#ef4444'; weight = 4; }
            else if (mult > 1.3) { lineColor = '#f97316'; weight = 3.5; }

            let opacity = 0.8;
            if (state.selectedLegIds.size > 0) {
                if (isSelected) {
                    opacity = 1.0;
                    weight += 4;
                    lineColor = '#FFEB3B';
                } else {
                    opacity = 0.3;
                }
            }

            // Add a small deterministic jitter based on engineer ID so overlapping routes render side-by-side
            const jitter = ((baseId * 137) % 9 - 4) * 0.00006; 
            const coords = f.geometry.coordinates.map(c => [c[1] + jitter, c[0] + jitter]);
            const pl = L.polyline(coords, { color: lineColor, weight, opacity, smoothFactor: 1 });
            pl.engineerId = eid;
            pl._baseWeight = weight;
            
            pl.on('mouseover', (e) => {
                if (!state.selectedLegIds.has(f.properties.leg_id)) {
                    e.target.setStyle({ weight: weight + 2, opacity: 1.0 });
                }
                e.target.bringToFront();
            });

            pl.on('mouseout', (e) => {
                if (!state.selectedLegIds.has(f.properties.leg_id)) {
                    e.target.setStyle({ weight: weight, opacity: state.selectedLegIds.size > 0 ? 0.3 : 0.8 });
                }
            });

            pl.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                const legId = f.properties.leg_id;
                if (isMultiSelectEvent(e)) {
                    if (state.selectedLegIds.has(legId)) state.selectedLegIds.delete(legId);
                    else state.selectedLegIds.add(legId);
                } else {
                    state.selectedLegIds.clear();
                    state.selectedJobIds.clear();
                    state.selectedLegIds.add(legId);
                }
                state.lastSelectedLegId = state.selectedLegIds.has(legId) ? legId : null;
                state.lastSelectedJobId = null;
                applyFilters();
            });

            const legData = routeData?.legs?.find(l => l.leg_id === f.properties.leg_id);
            let departTime = '--:--', arriveTime = '--:--', fromDesc = 'Unknown', toDesc = 'Unknown';
            if (legData) {
                const travelLog = routeData?.activity_log?.find(a => a.action === 'travel' && a.timestamp_unix === legData.depart_unix);
                if (travelLog) {
                    departTime = travelLog.time_of_day;
                    const arriveUnix = legData.arrive_unix;
                    const d = new Date(arriveUnix * 1000);
                    arriveTime = d.getUTCHours().toString().padStart(2, '0') + ':' + d.getUTCMinutes().toString().padStart(2, '0');
                    
                    const descMatch = travelLog.description.match(/Drive (.*?) → (.*)/);
                    if (descMatch) {
                        fromDesc = descMatch[1];
                        toDesc = descMatch[2];
                    }
                }
            }

            const parsed = parseEngineerName(routeData?.vehicle_name, eid);
            pl.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                <strong>${parsed.displayName}</strong><br>
                <span style="color:#888">Journey:</span> ${fromDesc} &rarr; ${toDesc}<br>
                <span style="color:#888">Departure:</span> ${departTime}<br>
                <span style="color:#888">Arrival:</span> ${arriveTime}<br>
                <span style="color:#888">Traffic Penalty:</span> ${mult}x<br>
                <span style="color:#888">Duration:</span> ${formatDuration(f.properties.duration_s)}
            </div>`);
            routeLayerGroup.addLayer(pl);

            if (isSelected && state.lastSelectedLegId === f.properties.leg_id) {
                setTimeout(() => pl.openPopup(), 100);
            }
            coords.forEach(c => {
                if (c[0] !== 0 || c[1] !== 0) bounds.extend(c);
            });
        });
    }

    // Draw depot markers (engineer start/end)
    if (result.routes_data) {
        result.routes_data.forEach(rd => {
            const eid = rd.vehicle_id;
            if (filterVehicleIds && !filterVehicleIds.has(eid)) return;
            const baseId = getBaseEngineerId(eid, rd.vehicle_name);
            const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];

            if (rd.vehicle_start) {
                const dm = L.marker([rd.vehicle_start[1], rd.vehicle_start[0]], {
                    icon: L.divIcon({
                        className: '',
                        html: `<div style="width:18px;height:18px;background:${color};border:3px solid white;border-radius:3px;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`,
                        iconSize: [18, 18], iconAnchor: [9, 9],
                    }),
                });
                dm.engineerId = eid;
                dm.on('click', () => {
                    const baseName = (rd.vehicle_name || '').split('_Day')[0];
                    const engSel = document.getElementById('engineer-filter-select');
                    if (engSel) { engSel.value = baseName; applyFilters(); }
                });
                const parsed = parseEngineerName(rd.vehicle_name, eid);
                dm.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                    <strong>Depot -- ${parsed.displayName}</strong><br>
                    <span style="color:#888">Name:</span> ${rd.vehicle_name}<br>
                    <span style="color:#888">Skills:</span> ${(rd.vehicle_skills || []).join(', ') || 'None'}
                </div>`);
                depotLayerGroup.addLayer(dm);
                if (rd.vehicle_start[1] !== 0 || rd.vehicle_start[0] !== 0) {
                    bounds.extend([rd.vehicle_start[1], rd.vehicle_start[0]]);
                }
            }
        });
    }

    // Draw jobs
    if (result.faults_geojson?.features) {
        result.faults_geojson.features.forEach(f => {
            if (f.geometry.type !== 'Point') return;
            const [lon, lat] = f.geometry.coordinates;
            const p = f.properties;
            const assigned = p.status === 'Assigned';
            // Day filter: show assigned jobs only if their vehicle is in the filter set
            // Unassigned jobs are always shown
            if (filterVehicleIds && assigned && !filterVehicleIds.has(p.assigned_engineer_id)) return;
            const urgency = p.urgency_level || 'medium';
            const color = URGENCY_COLORS[urgency] || URGENCY_COLORS.medium;
            const skills = p.required_skills || [];

            const isSelected = state.selectedJobIds.has(p.job_id);
            const m = L.circleMarker([lat, lon], {
                radius: isSelected ? 12 : (assigned ? 6 : 8),
                fillColor: isSelected ? '#FFEB3B' : color,
                color: isSelected ? '#FF9800' : (assigned ? '#fff' : '#ff4444'),
                weight: isSelected ? 3 : (assigned ? 1 : 2),
                opacity: 1,
                fillOpacity: isSelected ? 1 : 0.85,
            });

            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                const jobId = p.job_id;
                if (isMultiSelectEvent(e)) {
                    if (state.selectedJobIds.has(jobId)) state.selectedJobIds.delete(jobId);
                    else state.selectedJobIds.add(jobId);
                } else {
                    state.selectedLegIds.clear();
                    state.selectedJobIds.clear();
                    state.selectedJobIds.add(jobId);
                }
                state.lastSelectedJobId = state.selectedJobIds.has(jobId) ? jobId : null;
                state.lastSelectedLegId = null;
                applyFilters();
            });
            let assignedStr = '';
            if (assigned) {
                const assignedRd = result.routes_data?.find(r => r.vehicle_id === p.assigned_engineer_id);
                const assignedParsed = parseEngineerName(assignedRd?.vehicle_name, p.assigned_engineer_id);
                assignedStr = `<span style="color:#888">Assigned to:</span> ${assignedParsed.displayName}<br>`;
            }
            m.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                <strong>Job #${p.job_id}</strong><br>
                <span style="color:#888">Status:</span> <span style="color:${assigned ? '#22c55e' : '#ef4444'}">${p.status}</span><br>
                <span style="color:#888">Urgency:</span> ${urgency}<br>
                ${skills.length ? `<span style="color:#888">Required Skills:</span> ${skills.map(s => `<span style="background:rgba(66,133,244,0.15);color:#4285f4;padding:0 4px;border-radius:3px;font-size:11px">${s}</span>`).join(' ')}<br>` : ''}
                ${assignedStr}
                <span style="color:#888">Service:</span> ${formatDuration(p.service_time_s)}<br>
                ${p.description ? `<span style="color:#888">Desc:</span> ${p.description}` : ''}
            </div>`);
            jobLayerGroup.addLayer(m);
            if (isSelected && state.lastSelectedJobId === p.job_id) {
                setTimeout(() => m.openPopup(), 100);
                m.bringToFront();
            }
            if (lat !== 0 || lon !== 0) {
                bounds.extend([lat, lon]);
            }
        });
    }

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
}

// ═══ Results ═════════════════════════════════════════════
function showResults(result) {
    const s = result.summary || result.vroom_summary || {};
    
    // Compute fallbacks from routes_data if missing in summary
    let totalJobs = s.assigned || s.jobs_assigned;
    let totalDuration = s.duration;
    
    if (!totalJobs || !totalDuration) {
        const rds = result.routes_data || [];
        if (!totalJobs) {
            totalJobs = rds.reduce((sum, rd) => sum + (rd.num_jobs_assigned || 0), 0);
        }
        if (!totalDuration) {
            totalDuration = rds.reduce((sum, rd) => {
                return sum + (rd.legs || []).reduce((val, l) => val + (l.duration_s || 0), 0)
                    + (rd.activity_log || []).filter(a => a.action === 'service').reduce((val, a) => val + (a.duration_s || 0), 0);
            }, 0);
        }
    }

    $('#stat-test-num').textContent = result.test_number ? `#${result.test_number}` : '--';
    $('#stat-jobs').textContent = totalJobs || '0';
    $('#stat-duration').textContent = formatDuration(totalDuration);
    $('#stat-unassigned').textContent = s.unassigned || '0';
    $('#stat-strategy').textContent = formatStrategy(result.strategy);
    $('#results-summary').classList.add('visible');
}

// ═══ Day Selector (Multi-Day Dispatch) ═══════════════════
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function populateDaySelector(result) {
    const sel = document.getElementById('day-filter-select');
    if (!sel) return;

    // Parse day numbers from vehicle names (pattern: Name_DayN)
    const dayMap = new Map(); // dayNum -> Set of vehicle_ids
    (result.scenario_state?.vehicles || []).forEach(v => {
        const match = (v.name || '').match(/_Day(\d+)$/);
        if (match) {
            const dayNum = parseInt(match[1]);
            if (!dayMap.has(dayNum)) dayMap.set(dayNum, new Set());
            dayMap.get(dayNum).add(v.id);
        }
    });

    sel.innerHTML = '<option value="all">All Days</option>';

    if (dayMap.size <= 1) {
        // Single-day dispatch -- hide the selector
        sel.parentElement.style.display = 'none';
    } else {
        sel.parentElement.style.display = '';
    }

    const engBtn = document.getElementById('engineer-selector-wrapper');
    if (engBtn) engBtn.style.display = '';

    // Sort by day number and build options
    const sortedDays = Array.from(dayMap.keys()).sort((a, b) => a - b);
    sortedDays.forEach(dayNum => {
        const dayName = DAY_NAMES[(dayNum - 1) % 7] || `Day ${dayNum}`;
        const opt = document.createElement('option');
        opt.value = String(dayNum);
        opt.textContent = `${dayName} -- Day ${dayNum}`;
        sel.appendChild(opt);
    });
}

// ═══ Unified Filter System ═══════════════════════════════
function populateEngineerSelector(result) {
    const sel = document.getElementById('engineer-filter-select');
    if (!sel) return;
    sel.innerHTML = '<option value="all">All Engineers</option>';

    // Parse unique base engineer names
    const engineerMap = new Map();
    (result.scenario_state?.vehicles || []).forEach(v => {
        const baseName = (v.name || '').split('_Day')[0];
        if (!engineerMap.has(baseName)) {
            const parsed = parseEngineerName(v.name, v.id);
            engineerMap.set(baseName, parsed.id ? `${parsed.name} (ID: ${parsed.id})` : parsed.name);
        }
    });

    engineerMap.forEach((displayName, key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = displayName;
        sel.appendChild(opt);
    });

    document.getElementById('engineer-selector-wrapper').style.display = '';
}

function applyFilters() {
    const result = state.currentResult;
    if (!result) return;

    const daySel = document.getElementById('day-filter-select');
    const engSel = document.getElementById('engineer-filter-select');
    const dayValue = daySel ? daySel.value : 'all';
    const engValue = engSel ? engSel.value : 'all';

    // Build the set of vehicle_ids that match both filters
    const matchingVehicleIds = new Set();
    const matchingRoutes = [];

    (result.scenario_state?.vehicles || []).forEach(v => {
        const name = v.name || '';
        const baseName = name.split('_Day')[0];
        const dayMatch = name.match(/_Day(\d+)$/);
        const dayNum = dayMatch ? parseInt(dayMatch[1]) : null;

        // Day filter
        if (dayValue !== 'all' && dayNum !== null && dayNum !== parseInt(dayValue)) return;
        if (dayValue !== 'all' && dayNum === null) return; // skip if no day tag and day filter is active

        // Engineer filter
        if (engValue !== 'all' && baseName !== engValue) return;

        matchingVehicleIds.add(v.id);

        const existingRoute = (result.routes_data || []).find(rd => rd.vehicle_id === v.id);
        if (existingRoute) {
            matchingRoutes.push(existingRoute);
        } else {
            matchingRoutes.push({
                vehicle_id: v.id,
                vehicle_name: v.name,
                vehicle_skills: v.skills || [],
                num_jobs_assigned: 0,
                legs: [],
                activity_log: [],
                idle: true
            });
        }
    });

    // Update map
    const filterSet = (dayValue === 'all' && engValue === 'all') ? null : matchingVehicleIds;
    renderMap(result, filterSet);

    // Update top bar stats
    if (dayValue === 'all' && engValue === 'all') {
        showResults(result);
    } else {
        const totalDuration = matchingRoutes.reduce((sum, rd) => {
            return sum + (rd.legs || []).reduce((s, l) => s + (l.duration_s || 0), 0)
                + (rd.activity_log || []).filter(a => a.action === 'service').reduce((s, a) => s + (a.duration_s || 0), 0);
        }, 0);
        const totalJobs = matchingRoutes.reduce((sum, rd) => sum + (rd.num_jobs_assigned || 0), 0);
        const activeRoutes = matchingRoutes.filter(r => !r.idle).length;

        let label = '';
        if (dayValue !== 'all') {
            const dayNum = parseInt(dayValue);
            label = DAY_NAMES[(dayNum - 1) % 7] || `Day ${dayNum}`;
        }
        if (engValue !== 'all') {
            label = label ? `${label}` : engValue.split('|')[0];
        }

        $('#stat-test-num').textContent = label || '--';
        $('#stat-jobs').textContent = totalJobs;
        $('#stat-duration').textContent = formatDuration(totalDuration);
        $('#results-summary').classList.add('visible');
    }

    // Update engineer stats sidebar
    renderEngineerStats(matchingRoutes);

    // Update breakdown panel
    const isAllEngineers = (engValue === 'all');
    renderBreakdownPanel(matchingRoutes, isAllEngineers);

    // Show the breakdown panel
    const overlay = document.getElementById('activity-overlay');
    if (overlay) overlay.style.display = matchingRoutes.length > 0 ? 'flex' : 'none';
}

// ═══ Breakdown Panel (replaces old Activity Log) ═════════
function renderBreakdownPanel(routes, isRosterMode) {
    const c = document.getElementById('activity-log');
    const e = document.getElementById('log-empty');
    if (!c || !e) return;
    c.innerHTML = '';
    c.appendChild(e);

    if (!routes.length) {
        e.style.display = 'block';
        return;
    }
    e.style.display = 'none';

    if (isRosterMode) {
        // ── Global Dashboard Mode ──
        let totalTravelTime = 0;
        let totalServiceTime = 0;
        let totalJobs = 0;
        let activeShifts = 0;
        let idleShifts = 0;
        let maxMultiplier = 1;
        const engineerPenalties = new Map();
        const engineerTotalJobs = new Map();
        const engineerParsed = new Map();

        routes.forEach(rd => {
            const parsed = parseEngineerName(rd.vehicle_name, rd.vehicle_id);
            const baseName = parsed.id ? `${parsed.name} (${parsed.id})` : parsed.name;

            if (!engineerTotalJobs.has(baseName)) {
                engineerTotalJobs.set(baseName, 0);
                engineerParsed.set(baseName, parsed);
            }
            engineerTotalJobs.set(baseName, engineerTotalJobs.get(baseName) + (rd.num_jobs_assigned || 0));

            if (rd.idle || !rd.num_jobs_assigned) {
                idleShifts++;
                return;
            }
            activeShifts++;
            totalJobs += rd.num_jobs_assigned;
            
            let engMaxMult = 1;

            (rd.legs || []).forEach(l => totalTravelTime += (l.duration_s || 0));
            (rd.activity_log || []).forEach(a => {
                if (a.action === 'service') totalServiceTime += (a.duration_s || 0);
                if (a.action === 'travel' && a.traffic_multiplier > 1) {
                    if (a.traffic_multiplier > engMaxMult) engMaxMult = a.traffic_multiplier;
                    if (a.traffic_multiplier > maxMultiplier) maxMultiplier = a.traffic_multiplier;
                }
            });

            if (engMaxMult > 1) {
                if (!engineerPenalties.has(baseName) || engMaxMult > engineerPenalties.get(baseName)) {
                    engineerPenalties.set(baseName, engMaxMult);
                }
            }
        });

        const idleEngineers = [];
        engineerTotalJobs.forEach((jobs, baseName) => {
            if (jobs === 0) {
                idleEngineers.push(engineerParsed.get(baseName));
            }
        });

        // Top 3 penalized engineers
        const topPenalties = Array.from(engineerPenalties.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const totalActiveTime = totalTravelTime + totalServiceTime;
        const drivePct = totalActiveTime > 0 ? (totalTravelTime / totalActiveTime * 100).toFixed(1) : 0;
        const servicePct = totalActiveTime > 0 ? (totalServiceTime / totalActiveTime * 100).toFixed(1) : 0;
        const avgTravelPerJob = totalJobs > 0 ? totalTravelTime / totalJobs : 0;

        const dash = document.createElement('div');
        dash.style.padding = '12px';
        
        let penaltyHtml = '';
        if (topPenalties.length > 0) {
            penaltyHtml = `
                <h4 style="font-size:12px; color:var(--app-fg-muted); margin-bottom:8px; text-transform:uppercase;">Highest Traffic Delays</h4>
                <div class="dashboard-list">
                    ${topPenalties.map(p => `
                        <div class="dashboard-list-item">
                            <span class="name">${p[0]}</span>
                            <span class="meta">${p[1].toFixed(1)}x multiplier</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            penaltyHtml = `<p style="font-size:12px; color:var(--app-fg-muted); font-style:italic;">No traffic penalties detected.</p>`;
        }
        
        let idleHtml = '';
        if (idleEngineers.length > 0) {
            idleHtml = `
                <h4 style="font-size:12px; color:var(--app-fg-muted); margin-bottom:8px; margin-top:24px; text-transform:uppercase;">Unused Engineers</h4>
                <div class="dashboard-list">
                    ${idleEngineers.map(e => `
                        <div class="dashboard-list-item" style="background: var(--app-bg-muted); border-style: dashed;">
                            <span class="name" style="color: var(--app-fg-muted);">
                                ${e.id ? `<span style="opacity: 0.5; color: #888;">#${e.id}</span> ` : ''}${e.name}
                            </span>
                            <span class="meta" style="color: var(--app-fg-muted); font-weight: normal; font-size: 11px;">Idle</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        dash.innerHTML = `
            <div class="dashboard-stat-grid">
                <div class="dashboard-stat-card">
                    <h4>Avg Travel / Job</h4>
                    <div class="val">${formatDuration(avgTravelPerJob)}</div>
                </div>
                <div class="dashboard-stat-card">
                    <h4>Idle Shifts</h4>
                    <div class="val" style="color:var(--color-danger)">${idleShifts}</div>
                </div>
            </div>

            <div style="margin-bottom:24px;">
                <h4 style="font-size:12px; color:var(--app-fg-muted); margin-bottom:4px; text-transform:uppercase;">Time Utilization</h4>
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:4px;">
                    <span style="color:var(--yx-royal-blue)">Driving (${drivePct}%)</span>
                    <span style="color:var(--color-success)">On Jobs (${servicePct}%)</span>
                </div>
                <div class="dashboard-bar-chart">
                    <div style="width:${drivePct}%; background:var(--yx-royal-blue);"></div>
                    <div style="width:${servicePct}%; background:var(--color-success);"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--app-fg-muted); margin-top:4px;">
                    <span>${formatDuration(totalTravelTime)} total</span>
                    <span>${formatDuration(totalServiceTime)} total</span>
                </div>
            </div>

            ${penaltyHtml}
            ${idleHtml}
        `;

        c.appendChild(dash);
    } else {
        // ── Detail Mode: full activity timeline for selected engineer ──
        routes.forEach(route => {
            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:8px 12px; font-weight:600; font-size:13px; position:sticky; top:0; z-index:5; border-bottom:1px solid var(--app-border); background:rgba(222,236,255,0.9);';
            const parsed = parseEngineerName(route.vehicle_name, route.vehicle_id);
            hdr.innerHTML = `<span style="color:var(--yx-royal-blue)">■</span> ${parsed.displayName}`;
            c.appendChild(hdr);

            if (!route.activity_log || route.activity_log.length === 0) {
                const noAct = document.createElement('div');
                noAct.style.cssText = 'padding:12px; font-size:12px; color:var(--app-fg-muted);';
                noAct.innerHTML = '<em>No activity — idle for this period.</em>';
                c.appendChild(noAct);
                return;
            }

            route.activity_log.forEach(entry => {
                const icons = { shift_start: '⌚', service: '⌛', travel: '→', shift_end: '⌚' };
                const icon = icons[entry.action] || '•';
                const timeOfDay = entry.time_of_day || '';
                let metaHtml = '';
                if (entry.duration_s > 0) metaHtml += `${formatDuration(entry.duration_s)}`;
                if (entry.traffic_multiplier !== null && entry.traffic_multiplier !== undefined) {
                    const m = entry.traffic_multiplier;
                    const cls = m > 2 ? 'traffic-red' : m > 1.3 ? 'traffic-amber' : 'traffic-green';
                    metaHtml += ` <span class="traffic-badge ${cls}">${m}x</span>`;
                }
                const el = document.createElement('div');
                el.className = 'log-entry';
                el.dataset.action = entry.action;
                el.dataset.timestamp = entry.timestamp_unix;
                el.innerHTML = `
                    <span class="log-time">${timeOfDay}</span>
                    <span class="log-icon">${icon}</span>
                    <div class="log-detail">
                        <div class="log-desc">${entry.description}</div>
                        ${metaHtml ? `<div class="log-meta">${metaHtml}</div>` : ''}
                    </div>`;
                if (entry.action === 'travel') {
                    el.style.cursor = 'pointer';
                    el.title = 'Click to view journey on map (Ctrl+Click to multi-select)';
                    const matchingLeg = route.legs?.find(l => l.depart_unix === entry.timestamp_unix);
                    const legId = matchingLeg?.leg_id;
                    if (legId !== undefined && state.selectedLegIds.has(legId)) {
                        el.classList.add('highlighted');
                    }
                    el.addEventListener('click', (e) => {
                        if (legId === undefined) return;
                        if (isMultiSelectEvent(e)) {
                            if (state.selectedLegIds.has(legId)) state.selectedLegIds.delete(legId);
                            else state.selectedLegIds.add(legId);
                        } else {
                            state.selectedLegIds.clear();
                            state.selectedJobIds.clear();
                            state.selectedLegIds.add(legId);
                        }
                        state.lastSelectedLegId = state.selectedLegIds.has(legId) ? legId : null;
                        state.lastSelectedJobId = null;
                        applyFilters();
                    });
                } else if (entry.action === 'service' && entry.job_id !== undefined) {
                    const jobId = entry.job_id;
                    el.dataset.jobId = jobId;
                    el.style.cursor = 'pointer';
                    el.title = 'Click to view job on map (Ctrl+Click to multi-select)';
                    if (state.selectedJobIds.has(jobId)) {
                        el.classList.add('highlighted');
                    }
                    el.addEventListener('click', (e) => {
                        if (isMultiSelectEvent(e)) {
                            if (state.selectedJobIds.has(jobId)) state.selectedJobIds.delete(jobId);
                            else state.selectedJobIds.add(jobId);
                        } else {
                            state.selectedLegIds.clear();
                            state.selectedJobIds.clear();
                            state.selectedJobIds.add(jobId);
                        }
                        state.lastSelectedJobId = state.selectedJobIds.has(jobId) ? jobId : null;
                        state.lastSelectedLegId = null;
                        applyFilters();
                    });
                }
                c.appendChild(el);
            });
        });

        // Scroll the most-recently-clicked selection into view (one scroll per render)
        let scrollTarget = null;
        if (state.lastSelectedJobId !== null && state.selectedJobIds.has(state.lastSelectedJobId)) {
            scrollTarget = c.querySelector(`.log-entry[data-action="service"][data-job-id="${state.lastSelectedJobId}"]`);
        } else if (state.lastSelectedLegId !== null && state.selectedLegIds.has(state.lastSelectedLegId)) {
            const leg = state.currentResult?.routes_data?.flatMap(r => r.legs || []).find(l => l.leg_id === state.lastSelectedLegId);
            if (leg) {
                scrollTarget = c.querySelector(`.log-entry[data-action="travel"][data-timestamp="${leg.depart_unix}"]`);
            }
        }
        if (scrollTarget) {
            setTimeout(() => scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    }
}

// Legacy stubs for backward compat
function filterByDay() { applyFilters(); }
function populateLogDropdown() { /* no-op, replaced by applyFilters */ }
function renderActivityLog() { /* no-op, replaced by renderBreakdownPanel */ }

// ═══ Tabs ════════════════════════════════════════════════
function switchTab(tab) {
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
}

// ═══ History ═════════════════════════════════════════════
async function loadHistory() {
    try {
        const res = await apiFetch('/history');
        if (!res.ok) return;
        state.history = await res.json();
        renderHistory();
        populateHistoryDropdown();
    } catch { }
}

function renderHistory() {
    const c = $('#history-list'), e = $('#history-empty');
    c.querySelectorAll('.history-item').forEach(el => el.remove());
    if (!state.history.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';
    state.history.forEach(r => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="item-header">
                <span><span class="test-number">#${r.test_number || '?'}</span> <span class="item-strategy strategy-${r.strategy}">${formatStrategy(r.strategy)}</span></span>
                <span class="item-time">${formatTime(r.created_at)}</span>
            </div>
            <div class="item-meta">
                <span>${r.num_engineers} engineers</span>
                <span>${r.num_jobs} jobs</span>
                ${r.total_duration_s ? `<span>${formatDuration(r.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="viewHistoryRun('${r.id}')">View</button>
                <button class="yx-btn yx-btn-ghost yx-btn-sm btn-replay" onclick="replayRun('${r.id}')">↻ Replay</button>
            </div>`;
        c.appendChild(el);
    });
}

function populateHistoryDropdown() {
    const sel = $('#history-filter-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">History...</option>';
    if (!state.history.length) {
        sel.parentElement.style.display = 'none';
        return;
    }
    sel.parentElement.style.display = '';
    state.history.forEach(r => {
        const o = document.createElement('option');
        o.value = r.id;
        o.textContent = `${r.name || 'Dispatch #' + (r.test_number || '?')} - ${formatTime(r.created_at)}`;
        sel.appendChild(o);
    });
}

function runHistorySelect() {
    const sel = $('#history-filter-select');
    if (!sel || !sel.value) return;
    viewHistoryRun(sel.value);
}

async function viewHistoryRun(id) {
    try {
        const res = await apiFetch(`/history/${id}`);
        if (!res.ok) throw new Error('Not found');
        const d = await res.json();
        state.currentResult = d;
        
        const sel = $('#history-filter-select');
        if (sel) sel.value = id;

        renderMap(d);
        populateDaySelector(d);
        populateEngineerSelector(d);
        showResults(d);
        renderEngineerStats(d.routes_data || []);
        applyFilters();
        $('#download-section').style.display = 'block';
        setupAnimation(d);
    } catch (err) { console.error(err); }
}

async function replayRun(id) {
    try {
        const res = await apiFetch(`/history/${id}`);
        if (!res.ok) throw new Error('Not found');
        const d = await res.json();
        state.numEngineers = d.num_engineers;
        state.numJobs = d.num_jobs;
        $('#engineers-slider').value = d.num_engineers;
        $('#jobs-slider').value = d.num_jobs;
        $('#engineers-input').value = d.num_engineers;
        $('#jobs-input').value = d.num_jobs;
        await runSimulation(d.scenario_state);
    } catch (err) { console.error(err); }
}

// ═══ Engineer Stats ══════════════════════════════════════
function renderEngineerStats(routesData) {
    const c = $('#engineer-list'), e = $('#engineer-empty');
    if (!c) return;
    c.querySelectorAll('.engineer-card').forEach(el => el.remove());
    if (!routesData.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';

    // Group by base engineer name
    const groupedMap = new Map();
    routesData.forEach(rd => {
        const baseName = (rd.vehicle_name || '').split('_Day')[0];
        if (!groupedMap.has(baseName)) {
            groupedMap.set(baseName, {
                eids: [],
                vehicle_id: rd.vehicle_id, 
                vehicle_name: baseName,
                vehicle_skills: rd.vehicle_skills,
                num_jobs_assigned: 0,
                legs: [],
                activity_log: [],
                availability_start: rd.availability_start,
                availability_end: rd.availability_end
            });
        }
        const agg = groupedMap.get(baseName);
        agg.eids.push(rd.vehicle_id);
        agg.num_jobs_assigned += (rd.num_jobs_assigned || 0);
        agg.legs.push(...(rd.legs || []));
        agg.activity_log.push(...(rd.activity_log || []));
        // Keep earliest start / latest end? Or just keep first one for now.
    });
    
    // Convert back to array
    const aggregatedRoutes = Array.from(groupedMap.values());

    aggregatedRoutes.forEach(rd => {
        const eid = rd.vehicle_id;
        const baseId = getBaseEngineerId(eid, rd.vehicle_name);
        const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
        const color = ROUTE_COLORS[ci];
        const skills = (rd.vehicle_skills || []).map(s => String(s)).filter(s => !s.startsWith('_remix'));
        const totalTravel = (rd.legs || []).reduce((s, l) => s + (l.duration_s || 0), 0);
        const totalService = (rd.activity_log || []).filter(a => a.action === 'service').reduce((s, a) => s + (a.duration_s || 0), 0);
        const availStart = rd.availability_start || '--';
        const availEnd = rd.availability_end || '--';

        const el = document.createElement('div');
        el.className = 'engineer-card';
        el.dataset.engineerId = eid;
        el.onclick = () => {
            const engSel = document.getElementById('engineer-filter-select');
            if (engSel) { engSel.value = rd.vehicle_name; applyFilters(); }
        };
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s ease-in-out';
        el.innerHTML = `
            <div class="eng-header">
                <span class="eng-name"><span class="eng-color-dot" style="background:${color}"></span>${rd.vehicle_name || `Engineer #${baseId}`}</span>
                <span class="eng-id">#${baseId}</span>
            </div>
            <div class="eng-meta">
                <span>Available: ${availStart} — ${availEnd}</span>
                <span>${rd.num_jobs_assigned || 0} jobs assigned</span>
                <span>Travel: ${formatDuration(totalTravel)}</span>
                <span>Service: ${formatDuration(totalService)}</span>
                <span>${skills.length ? skills.map(s => `<span class="skill-tag">${s}</span>`).join('') : 'No skills'}</span>
            </div>`;
        c.appendChild(el);
    });
}



// ═══ Remix ═══════════════════════════════════════════════
function updateRemixDropdown() {
    const sel = $('#remix-source-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (!state.history.length) { $('#remix-controls').style.display = 'none'; return; }
    $('#remix-controls').style.display = 'block';
    state.history.forEach(r => {
        const o = document.createElement('option');
        o.value = r.id;
        o.textContent = `#${r.test_number || '?'} -- ${formatStrategy(r.strategy)} (${r.num_engineers}eng/${r.num_jobs}jobs)`;
        sel.appendChild(o);
    });
}

async function runRemix() {
    const sourceId = $('#remix-source-select').value;
    const strategy = $('#remix-strategy-select').value;
    if (!sourceId) return;

    const btn = $('#remix-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Remixing...';

    try {
        const res = await fetch(`${API_BASE}/remix`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_run_id: sourceId, strategy }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }

        const result = await res.json();
        state.currentResult = result;
        renderMap(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        populateLogDropdown(result.routes_data || []);
        renderActivityLog();
        $('#download-section').style.display = 'block';
        setupAnimation(result);
        await loadRemixHistory();
        switchTab('remixes');
        await logActivity('dispatch.remixed', 'dispatch', { test_number: result.test_number, strategy: result.strategy });
    } catch (err) {
        console.error(err);
        alert(`Remix failed: ${err.message}`);
    } finally {
        btn.disabled = false; btn.innerHTML = 'Run remix ⌛';
    }
}

async function loadRemixHistory() {
    try {
        const res = await apiFetch('/history?remix=true');
        if (!res.ok) return;
        state.remixHistory = await res.json();
        renderRemixHistory();
    } catch { }
}

function renderRemixHistory() {
    const c = $('#remix-list'), e = $('#remix-empty');
    c.querySelectorAll('.history-item').forEach(el => el.remove());
    if (!state.remixHistory.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';
    state.remixHistory.forEach(r => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="item-header">
                <span><span class="test-number">#${r.test_number || '?'}</span> <span class="item-strategy strategy-${r.strategy}">${formatStrategy(r.strategy)}</span> (remix)</span>
                <span class="item-time">${formatTime(r.created_at)}</span>
            </div>
            <div class="item-meta">
                <span>${r.num_engineers} engineers</span> <span>${r.num_jobs} jobs</span>
                ${r.total_duration_s ? `<span>${formatDuration(r.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="viewHistoryRun('${r.id}')">View</button>
            </div>`;
        c.appendChild(el);
    });
}

// ═══ AI Chat ═════════════════════════════════════════════
let chatHistory = [];

function miniMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n/g, '<br>');
}

function renderChatMessages() {
    const container = $('#chat-messages');
    const empty = $('#chat-empty');

    // Clear previous message bubbles (keep the empty state)
    container.querySelectorAll('.chat-bubble, .chat-loading').forEach(el => el.remove());

    if (chatHistory.length === 0) {
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    chatHistory.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble chat-bubble-${msg.role === 'user' ? 'user' : 'ai'}`;
        const icon = msg.role === 'user' ? 'You' : 'AI';
        bubble.innerHTML = `
            <div class="chat-bubble-icon">${icon}</div>
            <div class="chat-bubble-content">${msg.role === 'user' ? msg.content.replace(/</g, '&lt;') : miniMarkdown(msg.content)}</div>
        `;
        container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
}

function showChatLoading() {
    const container = $('#chat-messages');
    const loader = document.createElement('div');
    loader.className = 'chat-loading';
    loader.innerHTML = `
        <div class="chat-bubble-icon">AI</div>
        <div class="chat-bubble-content">
            <span class="chat-loading-text">Analyzing VROOM telemetry</span>
            <span class="chat-loading-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
    `;
    container.appendChild(loader);
    container.scrollTop = container.scrollHeight;
}

function hideChatLoading() {
    const loader = document.querySelector('.chat-loading');
    if (loader) loader.remove();
}

async function sendChatMessage() {
    const input = $('#chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (!state.currentResult?.id) {
        alert('Run a simulation first, then ask the AI about it.');
        return;
    }

    input.value = '';
    chatHistory.push({ role: 'user', content: msg });
    renderChatMessages();
    showChatLoading();

    const btn = $('#chat-send-btn');
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                run_id: state.currentResult.id,
                message: msg,
                history: chatHistory.slice(0, -1), // Don't double-send the latest user msg
            }),
        });

        hideChatLoading();

        if (!res.ok) {
            const err = await res.json();
            chatHistory.push({ role: 'assistant', content: `Error: ${err.detail || 'API request failed'}` });
        } else {
            const data = await res.json();
            chatHistory.push({ role: 'assistant', content: data.reply });
        }

        renderChatMessages();
    } catch (err) {
        hideChatLoading();
        chatHistory.push({ role: 'assistant', content: `Network error: ${err.message}` });
        renderChatMessages();
    } finally {
        btn.disabled = false;
    }
}

function sendQuickPrompt(msg) {
    $('#chat-input').value = msg;
    sendChatMessage();
}

function resetChat() {
    chatHistory = [];
    renderChatMessages();
}

// ═══ Downloads ═══════════════════════════════════════════
function downloadFile(type) {
    if (!state.currentResult) return;
    const map = { trips: ['trips_geojson', 'trips.json'], faults: ['faults_geojson', 'faults.geojson'], routes: ['routes_geojson', 'routes.geojson'], combined: ['combined_geojson', 'combined.geojson'] };
    const [key, name] = map[type] || [];
    if (!key) return;
    const blob = new Blob([JSON.stringify(state.currentResult[key], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ═══ Utilities ═══════════════════════════════════════════
function parseEngineerName(vehicleName, vehicleId) {
    if (!vehicleName) return { name: `Engineer #${vehicleId}`, id: '', day: 1, displayName: `Engineer #${vehicleId}` };
    
    let baseName = vehicleName;
    let day = 1;
    let origId = '';

    const daySplit = vehicleName.split('_Day');
    if (daySplit.length === 2) {
        baseName = daySplit[0];
        day = daySplit[1];
    }
    
    if (baseName.includes('|')) {
        const idSplit = baseName.split('|');
        baseName = idSplit[0];
        origId = idSplit[1];
    }
    
    let displayName = baseName;
    if (origId) {
        displayName += ` (ID: ${origId})`;
    }
    if (daySplit.length === 2) {
        displayName += ` - Day ${day}`;
    }
    
    return { name: baseName, id: origId, day: day, displayName: displayName };
}

function getBaseEngineerId(vehicleId, vehicleName) {
    const parsed = parseEngineerName(vehicleName, vehicleId);
    if (parsed.id && !isNaN(parsed.id)) {
        return parseInt(parsed.id, 10);
    }
    const day = parseInt(parsed.day) || 1;
    if (day > 0 && vehicleId % day === 0) {
        return vehicleId / day;
    }
    return vehicleId;
}

function formatDuration(s) {
    if (!s && s !== 0) return '--';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatStrategy(s) { return { naive: 'Naive', inhouse: 'In-House', tomtom_premium: 'TomTom', here_premium: 'HERE' }[s] || s; }
function formatTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

// ═══ Animation Engine ════════════════════════════════════
let animState = {
    isPlaying: false,
    speedMultiplier: 120,
    currentUnix: 0,
    startUnix: 0,
    endUnix: 0,
    lastFrameTime: 0,
    animationId: null,
    trajectories: [],
    markers: {},
    markerLayer: null
};

function initAnimation() {
    const playBtn = $('#anim-play-btn');
    if (!playBtn) return; // Fail gracefully if animation controls are missing from HTML
    
    playBtn.addEventListener('click', toggleAnimation);
    
    $$('.speed-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            $$('.speed-btn').forEach(b => b.classList.remove('active'));
            const target = e.target;
            target.classList.add('active');
            animState.speedMultiplier = parseFloat(target.dataset.speed);
        });
    });

    const slider = $('#anim-progress');
    slider.addEventListener('input', (e) => {
        if (!animState.startUnix) return;
        const pct = e.target.value / 1000;
        animState.currentUnix = animState.startUnix + pct * (animState.endUnix - animState.startUnix);
        updateAnimationUI();
        drawFrame();
    });
}

function setupAnimation(result) {
    stopAnimation();
    if (animState.markerLayer) {
        map.removeLayer(animState.markerLayer);
    }
    animState.markerLayer = L.layerGroup().addTo(map);
    animState.markers = {};
    animState.trajectories = [];
    
    let globalMin = Infinity;
    let globalMax = -Infinity;

    if (!result.routes_data) {
        $('#animation-controls').style.display = 'none';
        return;
    }

    result.routes_data.forEach(rd => {
        const path = [];
        rd.legs.forEach(leg => {
            if (leg.timestamped_coords) {
                leg.timestamped_coords.forEach(tc => {
                    path.push({ lon: tc[0], lat: tc[1], unix: tc[3] });
                    if (tc[3] < globalMin) globalMin = tc[3];
                    if (tc[3] > globalMax) globalMax = tc[3];
                });
            }
        });
        
        // Get the engineer's availability window (absolute unix timestamps)
        const tw = rd.vehicle_time_window;
        const availStart = tw ? tw[0] : null;
        const availEnd = tw ? tw[1] : null;

        // Use availability start to set the global timeline start
        if (availStart !== null && availStart < globalMin) globalMin = availStart;
        if (availEnd !== null && availEnd > globalMax) globalMax = availEnd;

        if (path.length > 0) {
            path.sort((a,b) => a.unix - b.unix);
            const eid = rd.vehicle_id;
            const baseId = getBaseEngineerId(eid, rd.vehicle_name);
            const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];
            
            animState.trajectories.push({
                engineerId: eid,
                name: rd.vehicle_name,
                color: color,
                path: path,
                availStart: availStart,
                availEnd: availEnd
            });
            
            const marker = L.marker([path[0].lat, path[0].lon], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="width:24px;height:24px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.3);font-size:11px;color:white;font-weight:bold;z-index:1000">${baseId}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }),
                zIndexOffset: 1000
            }).bindTooltip(`<strong>Engineer #${baseId}</strong><br>${rd.vehicle_name || ''}`, {className: 'anim-tooltip', direction: 'top', offset: [0, -10]});
            
            animState.markers[eid] = marker;
            animState.markerLayer.addLayer(marker);
        }
    });

    if (globalMin < Infinity) {
        animState.startUnix = globalMin;
        animState.endUnix = globalMax;
        animState.currentUnix = globalMin;
        $('#animation-controls').style.display = 'flex';
        updateAnimationUI();
        drawFrame();
    } else {
        $('#animation-controls').style.display = 'none';
    }
}

function toggleAnimation() {
    if (!animState.startUnix) return;
    if (animState.isPlaying) {
        stopAnimation();
    } else {
        if (animState.currentUnix >= animState.endUnix) {
            animState.currentUnix = animState.startUnix;
        }
        animState.isPlaying = true;
        const playBtn = $('#anim-play-btn');
        if (playBtn) playBtn.innerHTML = '⏸';
        animState.lastFrameTime = performance.now();
        animState.animationId = requestAnimationFrame(animationTick);
    }
}

function stopAnimation() {
    animState.isPlaying = false;
    const playBtn = $('#anim-play-btn');
    if (playBtn) playBtn.innerHTML = '▶';
    if (animState.animationId) cancelAnimationFrame(animState.animationId);
}

function animationTick(timestamp) {
    if (!animState.isPlaying) return;
    
    const deltaMs = timestamp - animState.lastFrameTime;
    animState.lastFrameTime = timestamp;
    
    const simSeconds = (deltaMs / 1000) * animState.speedMultiplier;
    animState.currentUnix += simSeconds;
    
    if (animState.currentUnix >= animState.endUnix) {
        animState.currentUnix = animState.endUnix;
        stopAnimation();
    }
    
    updateAnimationUI();
    drawFrame();
    
    if (animState.isPlaying) {
        animState.animationId = requestAnimationFrame(animationTick);
    }
}

function updateAnimationUI() {
    const d = new Date(animState.currentUnix * 1000);
    $('#anim-clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    const total = animState.endUnix - animState.startUnix;
    const progress = total > 0 ? (animState.currentUnix - animState.startUnix) / total : 0;
    $('#anim-progress').value = Math.min(1000, Math.max(0, progress * 1000));
}

function drawFrame() {
    const time = animState.currentUnix;
    
    animState.trajectories.forEach(traj => {
        const path = traj.path;
        if (!path.length) return;
        
        const marker = animState.markers[traj.engineerId];
        if (!marker) return;
        const el = marker.getElement();

        // Hide engineer before their availability window starts
        if (traj.availStart !== null && time < traj.availStart) {
            if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
            return;
        }
        // Show the marker once their shift has started
        if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; }

        let pos = path[0];
        if (time <= path[0].unix) {
            pos = path[0];
        } else if (time >= path[path.length - 1].unix) {
            pos = path[path.length - 1];
        } else {
            for (let i = 0; i < path.length - 1; i++) {
                if (time >= path[i].unix && time <= path[i+1].unix) {
                    const p1 = path[i];
                    const p2 = path[i+1];
                    const segmentDuration = p2.unix - p1.unix;
                    if (segmentDuration === 0) {
                        pos = p1;
                    } else {
                        const ratio = (time - p1.unix) / segmentDuration;
                        pos = {
                            lat: p1.lat + (p2.lat - p1.lat) * ratio,
                            lon: p1.lon + (p2.lon - p1.lon) * ratio
                        };
                    }
                    break;
                }
            }
        }
        
        marker.setLatLng([pos.lat, pos.lon]);
    });
}

// ═══ Engineer CRUD ═══════════════════════════════════════════
async function renderEngineerList() {
    const list = document.getElementById('saved-engineer-list');
    const engineers = await StorageManager.getEngineers();
    if (engineers.length === 0) {
        list.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>No engineers saved yet.<br>Click "+ Add engineer" to create one.</p></div>';
        return;
    }
    const editable = canPerform('edit_engineers');
    list.innerHTML = engineers.map(e => `
        <div class="data-card"${editable ? ` onclick="editEngineer('${e.id}')"` : ''} style="${editable ? 'cursor:pointer;' : ''}">
            <div class="data-card-header">
                <span class="data-card-title">${e.number ? '#' + e.number + ' - ' : ''}${e.name}</span>
                ${editable ? `<button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="event.stopPropagation(); deleteEngineer('${e.id}')" title="Delete">&#x2715;</button>` : ''}
            </div>
            <div class="data-card-meta">
                <div>${(e.skills || []).map(s => `<span class="data-tag">${s}</span>`).join(' ')}</div>
                <div>${e.location.lat}, ${e.location.lon}</div>
                <div>${e.defaultShiftStart || '08:00'} — ${e.defaultShiftEnd || '18:00'}</div>
                ${e.capacity ? `<div>Capacity: ${e.capacity} tasks</div>` : ''}
                ${e.breakDuration ? `<div>Break: ${e.breakDuration}m (${e.breakStart} - ${e.breakEnd})</div>` : ''}
            </div>
        </div>
    `).join('');
}

function showEngineerForm(eng) {
    // Populate fields first so initial focus lands on a meaningful input.
    document.getElementById('eng-form-id').value = eng ? eng.id : '';
    document.getElementById('eng-form-name').value = eng ? eng.name : '';
    document.getElementById('eng-form-number').value = eng ? (eng.number || '') : '';
    document.getElementById('eng-form-skills').value = eng ? JSON.stringify(eng.skills) : '[1003]';
    document.getElementById('eng-form-lat').value = eng ? eng.location.lat : '51.5074';
    document.getElementById('eng-form-lon').value = eng ? eng.location.lon : '-0.1278';
    document.getElementById('eng-form-start').value = eng ? eng.defaultShiftStart : '08:00';
    document.getElementById('eng-form-end').value = eng ? eng.defaultShiftEnd : '18:00';

    // Optional Fields
    document.getElementById('eng-form-capacity').value = (eng && eng.capacity) ? eng.capacity : '';
    document.getElementById('eng-form-break-duration').value = (eng && eng.breakDuration) ? eng.breakDuration : '';
    document.getElementById('eng-form-break-start').value = (eng && eng.breakStart) ? eng.breakStart : '12:00';
    document.getElementById('eng-form-break-end').value = (eng && eng.breakEnd) ? eng.breakEnd : '14:00';

    openModal('engineer-form-modal', { initialFocus: '#eng-form-name' });
}

function hideEngineerForm() {
    closeModal('engineer-form-modal');
}

async function saveEngineer() {
    if (!canPerform('edit_engineers')) {
        toast('You do not have permission to edit engineers.', { variant: 'error' });
        return;
    }
    const name = document.getElementById('eng-form-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    
    const numberVal = document.getElementById('eng-form-number').value.trim();
    if (!numberVal) { alert('Engineer Number is required.'); return; }
    const number = parseInt(numberVal, 10);
    
    let skills;
    try { skills = JSON.parse(document.getElementById('eng-form-skills').value); } 
    catch(e) { alert('Skills must be a valid JSON array e.g. [1103, 1203]'); return; }
    
    const capacityVal = document.getElementById('eng-form-capacity').value;
    const breakDurationVal = document.getElementById('eng-form-break-duration').value;

    const eng = {
        id: document.getElementById('eng-form-id').value || 'eng_' + Date.now(),
        name,
        number,
        skills,
        location: {
            lat: parseFloat(document.getElementById('eng-form-lat').value) || 51.5074,
            lon: parseFloat(document.getElementById('eng-form-lon').value) || -0.1278
        },
        defaultShiftStart: document.getElementById('eng-form-start').value || '08:00',
        defaultShiftEnd: document.getElementById('eng-form-end').value || '18:00',
        
        capacity: capacityVal ? parseInt(capacityVal, 10) : null,
        breakDuration: breakDurationVal ? parseInt(breakDurationVal, 10) : null,
        breakStart: document.getElementById('eng-form-break-start').value || '12:00',
        breakEnd: document.getElementById('eng-form-break-end').value || '14:00',
        
        createdAt: new Date().toISOString()
    };

    const all = await StorageManager.getEngineers();
    const idx = all.findIndex(e => e.id === eng.id);
    if (idx >= 0) all[idx] = eng; else all.push(eng);
    await StorageManager.saveEngineers(all);
    hideEngineerForm();
    renderEngineerList();
}

async function editEngineer(id) {
    const eng = (await StorageManager.getEngineers()).find(e => e.id === id);
    if (eng) showEngineerForm(eng);
}

async function deleteEngineer(id) {
    if (!canPerform('edit_engineers')) {
        toast('You do not have permission to delete engineers.', { variant: 'error' });
        return;
    }
    if (!confirm('Delete this engineer?')) return;
    await StorageManager.saveEngineers((await StorageManager.getEngineers()).filter(e => String(e.id) !== String(id)));
    renderEngineerList();
    renderOptimisePanel();
}

// ═══ Job List CRUD ═══════════════════════════════════════════
async function renderJobLists() {
    const list = document.getElementById('saved-job-list');
    const jobLists = await StorageManager.getJobLists();
    if (jobLists.length === 0) {
        list.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p>No job lists saved yet.<br>Click "+ Import batch" to add one.</p></div>';
        return;
    }
    const jobEditable = canPerform('edit_jobs');
    list.innerHTML = jobLists.map(jl => `
        <div class="data-card">
            <div class="data-card-header">
                <span class="data-card-title">${jl.name}</span>
                ${jobEditable ? `<button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="deleteJobList('${jl.id}')" title="Delete">&#x2715;</button>` : ''}
            </div>
            <div class="data-card-meta">
                <div>${jl.jobCount} jobs parsed</div>
                <div>${jl.classifiedBy && jl.classifiedBy.includes('claude') 
                        ? '<span class="data-tag" style="background: rgba(30,46,217,0.1); color: #1E2ED9;">AI Classified</span>' 
                        : '<span class="data-tag">Rule-Based</span>'}
                </div>
                ${jl.breakdownLog ? `<button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="showBreakdown('${jl.id}')">View Breakdown</button>` : ''}
            </div>
        </div>
    `).join('');
}

function showJobImport() { openModal('job-import-modal'); }
function hideJobImport() {
    closeModal('job-import-modal');
    const status = document.getElementById('job-import-status');
    if (status) status.textContent = '';
}

async function deleteJobList(id) {
    if (!canPerform('edit_jobs')) {
        toast('You do not have permission to delete job lists.', { variant: 'error' });
        return;
    }
    if (!confirm('Delete this job list?')) return;
    await StorageManager.saveJobLists((await StorageManager.getJobLists()).filter(jl => String(jl.id) !== String(id)));
    renderJobLists();
    renderOptimisePanel();
}

// ═══ Optimise Panel ══════════════════════════════════════════
async function renderOptimisePanel() {
    // Populate job list dropdown
    const jobSelect = document.getElementById('opt-job-select');
    const jobLists = await StorageManager.getJobLists();
    jobSelect.innerHTML = '<option value="">-- Select a Job List --</option>' + 
        jobLists.map(jl => `<option value="${jl.id}">${jl.name} (${jl.jobCount} jobs)</option>`).join('');

    // Populate engineer checklist was removed, Rota Matrix now acts as the list
    const engineers = await StorageManager.getEngineers();
    renderOptimiseMatrix();
}

function optSelectAllEngineers(selectAll) {
    document.querySelectorAll('.rota-day-cb').forEach(cb => cb.checked = selectAll);
    updateCostGuide();
}

function onOptJobSelected() { updateCostGuide(); }

async function renderOptimiseMatrix() {
    const container = document.getElementById('opt-rota-matrix');
    const engineers = await StorageManager.getEngineers();
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const fullDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    if (engineers.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">No engineers found. Please add engineers in the Engineers tab.</div>';
        return;
    }

    let html = '<table class="rota-table"><thead><tr><th>Engineer</th><th>Route</th>';
    days.forEach((d, di) => { html += `<th title="${fullDays[di]}">${d}</th>`; });
    html += '</tr></thead><tbody>';

    engineers.forEach(eng => {
        const ss = eng.defaultShiftStart || '08:00';
        const se = eng.defaultShiftEnd || '18:00';
        html += `<tr data-eng-id="${eng.id}" data-eng-number="${eng.number || ''}" data-skills='${JSON.stringify(eng.skills)}' data-lat="${eng.location.lat}" data-lon="${eng.location.lon}">`;
        html += `<td><span class="rota-eng-name">${eng.number ? '#' + eng.number + ' ' : ''}${eng.name}</span></td>`;
        html += '<td><select class="row-location-mode rota-route-select">';
        html += '<option value="home">H \u2192 H</option><option value="depot">D \u2192 D</option>';
        html += '<option value="home-depot">H \u2192 D</option><option value="depot-home">D \u2192 H</option>';
        html += '</select></td>';
        days.forEach((d, di) => {
            const isWeekday = di < 5;
            html += '<td><div class="rota-day-cell">';
            html += `<input type="checkbox" class="rota-day-cb" data-day="${di}" ${isWeekday ? 'checked' : ''}>`;
            html += '<div class="rota-time-pair">';
            html += `<input type="time" class="rota-time-input" data-type="start" data-day="${di}" value="${ss}">`;
            html += `<input type="time" class="rota-time-input" data-type="end" data-day="${di}" value="${se}">`;
            html += '</div></div></td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // Wire checkbox changes to cost guide recalculation
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('rota-day-cb')) updateCostGuide();
    });
}

function applyGlobalShiftTimes() {
    const gs = document.getElementById('rota-global-start');
    const ge = document.getElementById('rota-global-end');
    const startVal = gs ? gs.value : '08:00';
    const endVal = ge ? ge.value : '18:00';
    document.querySelectorAll('#opt-rota-matrix .rota-time-input[data-type="start"]').forEach(inp => { inp.value = startVal; });
    document.querySelectorAll('#opt-rota-matrix .rota-time-input[data-type="end"]').forEach(inp => { inp.value = endVal; });
}

// ═══ Data Bridge (Legacy + Job Import) ═══════════════════════
let bridgeState = { jobs: null, vehicles: null, locations: null };

const DEFAULT_SERVICE_TIME_S = 1800; // 30 minutes
const START_DEPOT = [ -0.1278, 51.5074 ]; // Example London start point
const PI_SKILLS = {
    'Alfen': 1103,
    'Etrel': 1203,
    'Tritium': 1303,
    'Efacec': 1403,
    'Wallbox': 1503
};

// ═══ AI Classification Engine ════════════════════════════════
let classifyMode = 'ai'; // 'ai' | 'legacy'
let pendingAiReview = null; // holds { validJobs, classifications, name, notes } during review

function setClassifyMode(mode) {
    classifyMode = mode;
    document.getElementById('mode-ai-label').classList.toggle('active', mode === 'ai');
    document.getElementById('mode-legacy-label').classList.toggle('active', mode === 'legacy');
}

// Deprecated listener: configuration loading is now handled per-project in loadInitialData()

const AI_SYSTEM_PROMPT = `You are an expert field service dispatcher for EV charger maintenance at Yunex Traffic / Believ.

SKILL CODE LOGIC:
Skills are 4-digit integers: [Manufacturer Prefix] + [Action Suffix]

Prefixes:
10=General, 11=Alfen, 12=Etrel, 13=Tritium, 14=Efacec, 15=Wallbox, 16=Kempower, 17=CTEK, 18=Delta, 19=Star Charger, 20=Compleo, 21=Urban Fox, 22=Ingeteam, 23=Autel, 24=Siemens, 25=Zerova

Suffixes:
01 = Installation & Commissioning
02 = SW / Config
03 = Maintenance Fault Finding & PI

JOB TYPES: SPO/SPD=Periodic Inspection, SRO/SRD=Reactive, SLO/SLD=Legislative

RULES:
1. Identify the manufacturer from the site description. If found, use their prefix. If unknown or not listed, use 10 (General).
2. For periodic or legislative inspections (SPO, SPD, SLO, SLD): assign the maintenance fault finding skill for that manufacturer (e.g., Alfen -> [1103], Etrel -> [1203], General -> [1003]).
3. For reactive jobs (SRO, SRD): assign the full fault-finding skill set for the manufacturer, which usually includes SW/Config and Maintenance (e.g., Alfen -> [1102, 1103], Etrel -> [1202, 1203]).
4. If a specific fault is mentioned:
   - "RCD Trip" or "External Damage": No specific skill needed -> []
   - "Comms Fault": SW/Config + Maintenance -> [Prefix+02, Prefix+03]
   - "Power Issue": Install + SW/Config + Maintenance -> [Prefix+01, Prefix+02, Prefix+03]
5. Return ONLY a valid JSON array, without any markdown formatting.

RESPONSE FORMAT:
[{"job_index":0,"skills":[1103],"manufacturer":"Alfen","site_type":"22kWAC","reasoning":"..."},...]`;

async function classifyWithClaude(jobBatch) {
    const jobLines = jobBatch.map((j, i) =>
        `[${i}] Site Ref: ${j.site_ref} | Site Desc: "${j.site_description}" | Type: ${j.job_type} | Name: "${j.job_site_name}"`
    ).join('\n');

    const resp = await fetch(`${API_BASE}/classify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            system: AI_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `Classify these ${jobBatch.length} jobs:\n\n${jobLines}` }]
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Claude API error ${resp.status}: ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No text in Claude response');

    let raw = textBlock.text.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    return { classifications: JSON.parse(raw), usage: data.usage };
}

function legacyClassify(siteDesc) {
    const upper = (siteDesc || '').toUpperCase();
    for (const [mfg, code] of Object.entries(PI_SKILLS)) {
        if (upper.includes(mfg.toUpperCase())) return [code];
    }
    return [1003];
}

// ═══ AI Review Modal ═════════════════════════════════════════
function showAiReview(validJobs, classifications, unmatchedRefs, meta) {
    pendingAiReview = { 
        name: pendingAiReview ? pendingAiReview.name : '', 
        notes: pendingAiReview ? pendingAiReview.notes : '',
        validJobs, 
        classifications 
    };
    const modal = document.getElementById('ai-review-modal');
    const body = document.getElementById('ai-review-body');
    const metaEl = document.getElementById('ai-review-meta');
    const statsEl = document.getElementById('ai-review-stats');

    metaEl.textContent = meta || '';
    statsEl.textContent = `${validJobs.length} jobs classified`;

    let html = '';

    // Unmatched warning
    if (unmatchedRefs && unmatchedRefs.length > 0) {
        html += `<div class="ai-unmatched-warning"><h4>${unmatchedRefs.length} jobs could not be linked to sites</h4><ul>`;
        unmatchedRefs.slice(0, 20).forEach(r => { html += `<li>${r}</li>`; });
        if (unmatchedRefs.length > 20) html += `<li>...and ${unmatchedRefs.length - 20} more</li>`;
        html += `</ul></div>`;
    }

    // Job cards
    validJobs.forEach((job, i) => {
        const cl = classifications[i] || { skills: [1003], manufacturer: 'Unknown', reasoning: 'No classification' };
        const skills = cl.skills || [1003];
        const mfg = (cl.manufacturer || 'Unknown').toLowerCase();
        const mfgClass = ['alfen','etrel','tritium','efacec','wallbox'].includes(mfg) ? `mfg-${mfg}` : 'mfg-unknown';

        const skillBadges = skills.length === 0
            ? '<span class="ai-skill-badge no-skill">[] open</span>'
            : skills.map(s => `<span class="ai-skill-badge">${s}</span>`).join('');

        html += `<div class="ai-job-card" data-idx="${i}">
            <div class="ai-job-header">
                <span class="ai-job-ref">${job.siteRef || job.description}</span>
                <div style="display:flex; gap:4px; align-items:center;">
                    <span class="ai-mfg-badge ${mfgClass}">${cl.manufacturer || '?'}</span>
                    <span class="ai-job-type">${job.jobType || '?'}</span>
                </div>
            </div>
            <div class="ai-job-site">${job.siteDesc || ''}</div>
            <div class="ai-job-skills">${skillBadges}</div>
            <div class="ai-job-reasoning">${cl.reasoning || ''}</div>
            <div class="ai-override-row">
                <span style="font-size:10px; color:var(--text-muted);">Override:</span>
                <input class="ai-override-input" data-idx="${i}" value="${JSON.stringify(skills)}" placeholder="e.g. [1103, 1102]">
            </div>
        </div>`;
    });

    body.innerHTML = html;
    openModal('ai-review-modal');
}

function closeAiReview() {
    closeModal('ai-review-modal');
    pendingAiReview = null;
}

async function aiReviewAcceptAll() {
    if (!pendingAiReview) return;
    const { validJobs, classifications } = pendingAiReview;

    // ── Sync work: read overrides and apply classifications ──
    const inputs = document.querySelectorAll('.ai-override-input');
    inputs.forEach(inp => {
        const idx = parseInt(inp.dataset.idx);
        try {
            const overridden = JSON.parse(inp.value);
            if (Array.isArray(overridden)) {
                validJobs[idx].skills = overridden;
            }
        } catch(e) { /* keep original */ }
    });

    validJobs.forEach((job, i) => {
        if (!job.skills) {
            const cl = classifications[i];
            job.skills = (cl && Array.isArray(cl.skills)) ? cl.skills : [1003];
        }
    });

    // Build the job list object (sync)
    const name = pendingAiReview.name || 'AI Import';
    const notes = pendingAiReview.notes || '';
    const jl = {
        id: 'jl_' + Date.now(),
        name,
        notes,
        jobCount: validJobs.length,
        jobs: validJobs,
        createdAt: new Date().toISOString(),
        classifiedBy: classifyMode === 'ai' ? 'claude-sonnet-4.6' : 'legacy'
    };

    // ── Close BOTH modals FIRST so UI is never left frozen ──
    closeAiReview();
    hideJobImport();
    document.getElementById('job-import-status').textContent = '';

    // ── Async work: save to DB (modals already closed) ──
    try {
        const all = await StorageManager.getJobLists();
        all.push(jl);
        await StorageManager.saveJobLists(all);
        renderJobLists();
        renderOptimisePanel();
    } catch (err) {
        console.error('[aiReviewAcceptAll] Error saving job list:', err);
        toast('Failed to save job list: ' + err.message, { variant: 'error' });
    }
}

// ═══ Import & Save Job List ══════════════════════════════════
async function importAndSaveJobList() {
    const name = document.getElementById('job-import-name').value.trim();
    if (!name) { alert('Please enter a name for this job list.'); return; }
    const jobsFile = document.getElementById('job-import-csv').files[0];
    const sitesFile = document.getElementById('job-import-sites').files[0];
    if (!jobsFile || !sitesFile) { alert('Please upload both Jobs and Sites CSV files.'); return; }

    const statusEl = document.getElementById('job-import-status');
    statusEl.textContent = 'Parsing CSVs...';

    try {
        const [jobsCsv, sitesCsv] = await Promise.all([parseCSV(jobsFile), parseCSV(sitesFile)]);

        // Build sites lookup (case-insensitive keys)
        const sitesDict = {};
        sitesCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const latKey = keys.find(k => k.trim().toLowerCase() === 'latitude');
            const lonKey = keys.find(k => k.trim().toLowerCase() === 'longitude');
            const descKey = keys.find(k => k.trim().toLowerCase() === 'description');
            const townKey = keys.find(k => k.trim().toLowerCase() === 'town');
            const refVal = refKey ? row[refKey] : null;
            if (refVal) {
                const normRef = refVal.trim().toUpperCase();
                if (!sitesDict[normRef]) {
                    sitesDict[normRef] = {
                        lat: latKey ? parseFloat(row[latKey]) : NaN,
                        lon: lonKey ? parseFloat(row[lonKey]) : NaN,
                        desc: descKey && row[descKey] ? row[descKey] : '',
                        town: townKey && row[townKey] ? row[townKey] : ''
                    };
                }
            }
        });

        const validJobs = [];
        const aiBatch = []; // parallel array for AI classification input
        const unmatchedRefs = [];
        let jobIdCounter = 1000;
        const nowMs = Date.now();
        
        let noSiteRef = 0;
        let dateFails = 0;
        let sampleKeys = [];

        const parseDate = (dStr) => {
            if (!dStr) return null;
            const parts = dStr.trim().split(/\s+/);
            if (parts.length < 2) return null;
            const dParts = parts[0].split(/[\/\-]/);
            if (dParts.length < 3) return null;
            let dd, mm, yyyy;
            if (dParts[0].length === 4) { yyyy = dParts[0]; mm = dParts[1]; dd = dParts[2]; }
            else { dd = dParts[0]; mm = dParts[1]; yyyy = dParts[2]; }
            
            // Fix: ensure time string has exactly HH:MM:SS format
            let tStr = parts[1].trim();
            if (tStr.split(':').length === 2) tStr += ':00'; // Append seconds if missing
            
            const isoStr = `${yyyy.length === 2 ? '20'+yyyy : yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${tStr}Z`;
            const ms = Date.parse(isoStr);
            return isNaN(ms) ? null : Math.floor(ms / 1000);
        };

        jobsCsv.data.forEach((row, idx) => {
            const keys = Object.keys(row);
            if (idx === 0) sampleKeys = keys;
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const typeKey = keys.find(k => k.trim().toLowerCase() === 'type' || k.includes('Type'));
            const startKey = keys.find(k => k.trim().toLowerCase() === 'start window' || k.includes('Start'));
            const endKey = keys.find(k => k.trim().toLowerCase() === 'end window' || k.includes('End'));
            const siteKey = keys.find(k => k.trim().toLowerCase() === 'site' || k.includes('Site'));
            const siteRefRaw = refKey ? row[refKey] : null;
            if (!siteRefRaw) { noSiteRef++; return; }
            const siteRef = siteRefRaw.trim();
            const normRef = siteRef.toUpperCase();
            const site = sitesDict[normRef];
            if (!site || isNaN(site.lat) || isNaN(site.lon)) {
                unmatchedRefs.push(siteRef);
                return;
            }

            const jobType = typeKey && row[typeKey] ? row[typeKey].trim() : 'PI';
            const siteName = siteKey && row[siteKey] ? row[siteKey].trim() : '';

            const twStart = parseDate(startKey ? row[startKey] : null);
            const twEnd = parseDate(endKey ? row[endKey] : null);
            if (!twStart || !twEnd) { dateFails++; return; }

            const daysUntilEnd = ((twEnd * 1000) - nowMs) / (1000*60*60*24);
            let priority = daysUntilEnd <= 2 ? 100 : daysUntilEnd <= 7 ? 80 : daysUntilEnd <= 14 ? 60 : 40;

            validJobs.push({
                id: jobIdCounter++,
                description: `${siteRef} - ${jobType} [${site.town}]`,
                location: [site.lon, site.lat],
                skills: null, // will be set by classification
                service: DEFAULT_SERVICE_TIME_S,
                time_windows: [[twStart, twEnd]],
                priority,
                urgency_level: priority >= 80 ? 'critical' : priority >= 60 ? 'high' : 'medium',
                siteRef, jobType, siteDesc: site.desc, siteName
            });

            aiBatch.push({
                site_ref: siteRef,
                site_description: site.desc,
                job_type: jobType,
                job_site_name: siteName
            });
        });

        if (validJobs.length === 0) {
            statusEl.innerHTML = `Parsed 0 valid jobs.<br>Found headers: ${sampleKeys.join(', ')}<br>- No Site Ref: ${noSiteRef}<br>- Unmatched Sites: ${unmatchedRefs.length}<br>- Date format fails: ${dateFails}`;
            return;
        }

        statusEl.textContent = `${validJobs.length} jobs linked. Classifying skills...`;

        if (classifyMode === 'ai') {
            // ══ AI Classification Path ══
            try {
                statusEl.innerHTML = `Sending ${validJobs.length} jobs to Claude Sonnet 4.6...<div class="ai-progress-bar"><div class="ai-progress-fill" style="width:60%"></div></div>`;

                const result = await classifyWithClaude(aiBatch);
                const cls = result.classifications;

                statusEl.innerHTML = `AI classified ${cls.length} jobs. Review and confirm.`;

                // Store name/notes in pending review for later save
                pendingAiReview = { name, notes: document.getElementById('job-import-notes') ? document.getElementById('job-import-notes').value.trim() : '' };

                const usageInfo = result.usage
                    ? `${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens`
                    : '';
                showAiReview(validJobs, cls, unmatchedRefs, usageInfo);

            } catch (aiErr) {
                console.error('AI Classification failed:', aiErr);
                statusEl.textContent = `AI failed: ${aiErr.message}. Falling back to rule-based.`;

                // Fallback to legacy
                validJobs.forEach(job => {
                    job.skills = legacyClassify(job.siteDesc);
                });

                const classifications = validJobs.map(j => ({
                    skills: j.skills,
                    manufacturer: 'Fallback',
                    reasoning: 'AI unavailable -- used rule-based matching'
                }));

                pendingAiReview = { name, notes: document.getElementById('job-import-notes') ? document.getElementById('job-import-notes').value.trim() : '' };
                showAiReview(validJobs, classifications, unmatchedRefs, 'Rule-based fallback');
            }
        } else {
            // ══ Legacy Classification Path ══
            validJobs.forEach(job => {
                job.skills = legacyClassify(job.siteDesc);
            });

            const classifications = validJobs.map(j => ({
                skills: j.skills,
                manufacturer: (() => {
                    const d = (j.siteDesc || '').toUpperCase();
                    for (const m of Object.keys(PI_SKILLS)) { if (d.includes(m.toUpperCase())) return m; }
                    return 'Unknown';
                })(),
                reasoning: 'Rule-based manufacturer string match'
            }));

            pendingAiReview = { name, notes: document.getElementById('job-import-notes') ? document.getElementById('job-import-notes').value.trim() : '' };
            showAiReview(validJobs, classifications, unmatchedRefs, 'Rule-based classification');
        }

    } catch(e) {
        statusEl.textContent = 'Parse error: ' + e.message;
        console.error(e);
    }
}

// ═══ Run Optimisation ════════════════════════════════════════
async function runOptimisation() {
    const jobListId = document.getElementById('opt-job-select').value;
    if (!jobListId) { alert('Please select a job list.'); return; }
    const jobList = (await StorageManager.getJobLists()).find(jl => jl.id === jobListId);
    if (!jobList) { alert('Job list not found.'); return; }

    const trs = document.querySelectorAll('#opt-rota-matrix tbody tr');
    if (trs.length === 0) { alert('No engineers in the rota matrix. Please add engineers in the Engineers tab.'); return; }

    const btn = document.getElementById('opt-run-btn');
    const statusEl = document.getElementById('opt-status');
    btn.innerHTML = '<span class="spinner"></span> Building...';
    btn.disabled = true;
    statusEl.innerHTML = '<span style="color:var(--text-muted);">Preparing vehicles and jobs...</span>';

    try {
        const vehicles = [];
        const locations = [];
        let engIdCounter = 1;
        const nowMs = Date.now();
        const baseDate = new Date(nowMs);
        // Align to the next Monday
        const dayOfWeek = baseDate.getUTCDay();
        const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
        baseDate.setUTCDate(baseDate.getUTCDate() + daysUntilMonday);
        baseDate.setUTCHours(0,0,0,0);

        const depotLon = parseFloat(document.getElementById('opt-depot-lon')?.value) || -0.1278;
        const depotLat = parseFloat(document.getElementById('opt-depot-lat')?.value) || 51.5074;
        const globalDepot = [depotLon, depotLat];
        await StorageManager.saveDepot(depotLon, depotLat);

        const allEngineersData = await StorageManager.getEngineers();

        trs.forEach(tr => {
            const engName = tr.querySelector('td').textContent.trim();
            let skills = [1003];
            try { skills = JSON.parse(tr.getAttribute('data-skills')); } catch(e){}
            const lat = parseFloat(tr.getAttribute('data-lat')) || 51.5074;
            const lon = parseFloat(tr.getAttribute('data-lon')) || -0.1278;
            const homeCoord = [lon, lat];

            const locationMode = tr.querySelector('.row-location-mode')?.value || 'home';

            let startCoord, endCoord;
            switch (locationMode) {
                case 'depot':      startCoord = globalDepot; endCoord = globalDepot; break;
                case 'home-depot': startCoord = homeCoord;   endCoord = globalDepot; break;
                case 'depot-home': startCoord = globalDepot; endCoord = homeCoord;   break;
                default:           startCoord = homeCoord;   endCoord = homeCoord;
            }

            for (let di = 0; di < 7; di++) {
                const cb = tr.querySelector(`input[type="checkbox"][data-day="${di}"]`);
                if (!cb || !cb.checked) continue;

                const sInput = tr.querySelector(`input[data-type="start"][data-day="${di}"]`);
                const eInput = tr.querySelector(`input[data-type="end"][data-day="${di}"]`);
                const [cSh, cSm] = (sInput ? sInput.value : '08:00').split(':').map(Number);
                const [cEh, cEm] = (eInput ? eInput.value : '18:00').split(':').map(Number);

                const dayBaseMs = baseDate.getTime() + (di * 24*60*60*1000);
                const shiftStartS = Math.floor((dayBaseMs + cSh*3600000 + cSm*60000) / 1000);
                const shiftEndS = Math.floor((dayBaseMs + cEh*3600000 + cEm*60000) / 1000);

                const origId = tr.getAttribute('data-eng-id') || '';
                const engNumber = tr.getAttribute('data-eng-number') || origId;
                const vConfig = {
                    id: engIdCounter++,
                    name: `${engName}|${engNumber}_Day${di+1}`,
                    start: startCoord,
                    end: endCoord,
                    skills,
                    time_window: [shiftStartS, shiftEndS]
                };

                const engProfile = allEngineersData.find(e => String(e.id) === String(tr.getAttribute('data-eng-id')));
                if (engProfile && engProfile.capacity) {
                    vConfig.max_tasks = parseInt(engProfile.capacity, 10);
                }

                if (engProfile && engProfile.breakDuration) {
                    const [bSh, bSm] = (engProfile.breakStart || '12:00').split(':').map(Number);
                    const [bEh, bEm] = (engProfile.breakEnd || '14:00').split(':').map(Number);
                    const breakStartS = Math.floor((dayBaseMs + bSh*3600000 + bSm*60000) / 1000);
                    const breakEndS = Math.floor((dayBaseMs + bEh*3600000 + bEm*60000) / 1000);

                    vConfig.breaks = [{
                        id: 1,
                        time_windows: [[breakStartS, breakEndS]],
                        service: engProfile.breakDuration * 60
                    }];
                }

                vehicles.push(vConfig);
                locations.push(startCoord);
                if (endCoord !== startCoord) locations.push(endCoord);
            }
        });

        // Add job locations to the unified locations list
        const jobs = jobList.jobs;
        
        // Apply load balancing variance if specified
        const varianceInput = document.getElementById('opt-variance')?.value;
        if (varianceInput && vehicles.length > 0) {
            const variance = parseFloat(varianceInput);
            if (!isNaN(variance)) {
                const avgJobs = jobs.length / vehicles.length;
                const maxTasksVariance = Math.max(1, Math.ceil(avgJobs * (1 + (variance / 100))));
                
                vehicles.forEach(v => {
                    if (v.max_tasks !== undefined) {
                        v.max_tasks = Math.min(v.max_tasks, maxTasksVariance);
                    } else {
                        v.max_tasks = maxTasksVariance;
                    }
                });
            }
        }
        // Handle expired jobs & prioritization
        const simStartMs = baseDate.getTime();
        const simEndMs = simStartMs + (7 * 24 * 60 * 60 * 1000); // 7-day horizon
        const simStartS = Math.floor(simStartMs / 1000);
        const simEndS = Math.floor(simEndMs / 1000);

        jobs.forEach(j => {
            // Normal jobs get a higher baseline priority
            j.priority = 50; 
            locations.push(j.location);

            if (j.time_windows && j.time_windows.length > 0) {
                // Find the absolute latest deadline across all time windows for this job
                let maxJobEndTimeS = 0;
                j.time_windows.forEach(tw => {
                    if (tw[1] > maxJobEndTimeS) maxJobEndTimeS = tw[1];
                });

                // If the job's deadline is entirely in the past relative to the simulation start
                if (maxJobEndTimeS < simStartS) {
                    // Set it to the lowest possible priority
                    j.priority = 0; 
                    
                    // Extend its time window so VROOM's mathematical engine doesn't reject it
                    j.time_windows.forEach(tw => {
                        tw[1] = Math.max(tw[1], simEndS);
                    });
                }
            }
        });

        if (vehicles.length === 0) {
            statusEl.innerHTML = '<span style="color:var(--warning);">No active vehicle-days found. Check that at least one day is checked per engineer.</span>';
            return;
        }

        // --- ENFORCE LOAD BALANCING ---
        // VROOM inherently minimizes the number of vehicles used. To ensure jobs are 
        // distributed across all available vehicle-days rather than piled onto one,
        // we calculate a 'fair share' max_tasks limit based on the total vehicle-days.
        // e.g. 25 jobs across 5 vehicle-days → max 6 per day (ceil(25/5) + 1).
        const totalVehicleDays = vehicles.length;
        const fairShare = Math.ceil(jobs.length / totalVehicleDays);
        const balancedLimit = fairShare + 1; // +1 buffer for flexibility

        vehicles.forEach(v => {
            if (v.max_tasks !== undefined) {
                // If user set a profile capacity, we respect it as the absolute maximum, 
                // but we still enforce the balanced limit if it's smaller, 
                // to prevent one vehicle-day from hoarding all jobs.
                v.max_tasks = Math.min(v.max_tasks, balancedLimit);
            } else {
                v.max_tasks = balancedLimit;
            }
        });
        // ------------------------------

        // Read selected strategy from the modal radio buttons
        const strategyRadio = document.querySelector('#strategy-group input[name="strategy"]:checked');
        const strategy = strategyRadio ? strategyRadio.value : 'naive';

        // Build the scenario object matching the backend's expected shape
        const shiftStart = vehicles[0].time_window[0];
        const scenario = {
            vehicles,
            jobs,
            locations,
            shift_start: shiftStart
        };

        statusEl.innerHTML = `<span style="color:var(--text-muted);">Sending ${jobs.length} jobs and ${vehicles.length} vehicle-days to solver (${strategy})...</span>`;
        btn.innerHTML = '<span class="spinner"></span> Optimising...';

        // POST to backend
        const res = await apiFetch('/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                num_engineers: vehicles.length,
                num_jobs: jobs.length,
                strategy: strategy,
                replay_scenario: scenario,
                name: jobList.name || 'Dispatch Run'
            }),
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
            throw new Error(errBody.detail || `Server error ${res.status}`);
        }

        const result = await res.json();

        // Success -- hide modal and render results
        hidePreflightModal();
        switchAppView('map');

        state.currentResult = result;
        renderMap(result);
        populateDaySelector(result);
        populateEngineerSelector(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        applyFilters();
        $('#download-section').style.display = 'block';
        setupAnimation(result);
        await loadHistory();
        updateRemixDropdown();
        // Log dispatch to activity
        await logActivity('dispatch.run', 'dispatch', {
            test_number: result.test_number,
            strategy: result.strategy,
            num_engineers: result.num_engineers || vehicles.length,
            num_jobs: result.num_jobs || jobs.length,
        });

    } catch (err) {
        console.error('Dispatch run failed:', err);
        statusEl.innerHTML = `<span style="color:var(--danger);">Error: ${err.message}</span>`;
    } finally {
        btn.innerHTML = 'Execute route plan \u2192';
        btn.disabled = false;
    }
}

let globalRosterProfiles = [];


async function renderRotaMatrix() {
    const rosterFile = $('#bridge-roster-file').files[0];
    const container = $('#rota-matrix-container');
    const horizonDays = parseInt($('#bridge-horizon-days').value) || 1;
    const globalStart = $('#bridge-shift-start').value;
    const globalEnd = $('#bridge-shift-end').value;

    if (!rosterFile) {
        container.innerHTML = '';
        return;
    }

    try {
        const rosterCsv = await parseCSV(rosterFile);
        
        let validProfiles = [];
        rosterCsv.data.forEach(row => {
            const keys = Object.keys(row);
            if (keys.length === 0) return;
            const nameKey = keys[0]; 
            const name = row[nameKey];
            if (!name || name.trim() === '') return;
            
            const skillKey = keys.find(k => row[k] && typeof row[k] === 'string' && row[k].includes('[') && row[k].includes(']'));
            let skillsArr = [1003];
            if (skillKey) {
                try {
                    skillsArr = JSON.parse(row[skillKey]) || [1003];
                } catch(e) {}
            }
            validProfiles.push({ name: name.trim(), skills: skillsArr });
        });

        if (validProfiles.length === 0) {
            container.innerHTML = '<div style="color: #ef4444; font-size: 12px;">Failed to parse any valid engineers from the CSV.</div>';
            return;
        }

        globalRosterProfiles = validProfiles;

        let tableHtml = `<table class="props-table" style="width: 100%; min-width: 600px; text-align: left; border-collapse: collapse; margin-top: 8px;">
            <thead>
                <tr>
                    <th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.2); font-size: 12px; color: #aaa;">Engineer</th>`;
        
        for (let d = 1; d <= horizonDays; d++) {
            tableHtml += `<th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.2); text-align: center; font-size: 12px; color: #aaa;">Day ${d}</th>`;
        }
        tableHtml += `</tr></thead><tbody>`;

        validProfiles.forEach((p, idx) => {
            tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-engineer-idx="${idx}" data-skills="[${p.skills.join(',')}]">
                <td style="padding: 6px; font-weight: 500; font-size: 11px;">${p.name}</td>`;
            
            for (let d = 1; d <= horizonDays; d++) {
                tableHtml += `<td style="padding: 6px; text-align: center;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <input type="checkbox" class="rota-checkbox" data-day="${d}" data-idx="${idx}" checked style="cursor: pointer;">
                        <div style="display: flex; gap: 2px;">
                            <input type="time" class="rota-time log-select" data-type="start" data-day="${d}" data-idx="${idx}" value="${globalStart}" style="width: 58px; font-size: 10px; padding: 2px;">
                            <span style="font-size: 10px; color: #666;">-</span>
                            <input type="time" class="rota-time log-select" data-type="end" data-day="${d}" data-idx="${idx}" value="${globalEnd}" style="width: 58px; font-size: 10px; padding: 2px;">
                        </div>
                    </div>
                </td>`;
            }
            tableHtml += `</tr>`;
        });
        
        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

    } catch (e) {
        console.error("Failed to render Rota Matrix", e);
    }
}

async function runDataBridge() {
    const jobsFile = $('#bridge-jobs-file').files[0];
    const sitesFile = $('#bridge-sites-file').files[0];

    if (!jobsFile || !sitesFile) {
        alert("Please upload Jobs and Sites CSV files.");
        return;
    }

    const btn = $('#bridge-convert-btn');
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    btn.disabled = true;

    try {
        const [jobsCsv, sitesCsv] = await Promise.all([
            parseCSV(jobsFile),
            parseCSV(sitesFile)
        ]);

        const sitesDict = {};
        sitesCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const latKey = keys.find(k => k.trim().toLowerCase() === 'latitude');
            const lonKey = keys.find(k => k.trim().toLowerCase() === 'longitude');
            const descKey = keys.find(k => k.trim().toLowerCase() === 'description');
            const custKey = keys.find(k => k.trim().toLowerCase() === 'customer');
            const townKey = keys.find(k => k.trim().toLowerCase() === 'town');

            const refVal = refKey ? row[refKey] : null;
            if (refVal) {
                sitesDict[refVal.trim()] = {
                    lat: latKey ? parseFloat(row[latKey]) : NaN,
                    lon: lonKey ? parseFloat(row[lonKey]) : NaN,
                    desc: descKey && row[descKey] ? row[descKey] : '',
                    customer: custKey && row[custKey] ? row[custKey] : '',
                    town: townKey && row[townKey] ? row[townKey] : ''
                };
            }
        });

        const validJobs = [];
        const locations = [];
        let jobIdCounter = 1000;
        const nowMs = Date.now();
        let earliestTwStart = Infinity;

        let noSiteRef = 0, noSiteMap = 0, dateFails = 0;

        jobsCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const typeKey = keys.find(k => k.trim().toLowerCase() === 'type' || k.includes('Type'));
            const startKey = keys.find(k => k.trim().toLowerCase() === 'start window' || k.includes('Start'));
            const endKey = keys.find(k => k.trim().toLowerCase() === 'end window' || k.includes('End'));

            const siteRefRaw = refKey ? row[refKey] : null;
            if (!siteRefRaw) { noSiteRef++; return; }
            const siteRef = siteRefRaw.trim();
            const site = sitesDict[siteRef];
            if (!site || isNaN(site.lat) || isNaN(site.lon)) { noSiteMap++; return; }

            let skillCode = 1003; 
            const upperDesc = site.desc.toUpperCase();
            for (const [mfg, code] of Object.entries(PI_SKILLS)) {
                if (upperDesc.includes(mfg.toUpperCase())) {
                    skillCode = code;
                    break;
                }
            }

            const parseDate = (dStr) => {
                if (!dStr) return null;
                const parts = dStr.trim().split(/\s+/);
                if (parts.length < 2) return null;
                const dParts = parts[0].split(/[\/\-]/);
                if (dParts.length < 3) return null;
                let dd, mm, yyyy;
                if (dParts[0].length === 4) {
                    yyyy = dParts[0]; mm = dParts[1]; dd = dParts[2];
                } else {
                    dd = dParts[0]; mm = dParts[1]; yyyy = dParts[2];
                }
                
                // Fix: ensure time string has exactly HH:MM:SS format
                let tStr = parts[1].trim();
                if (tStr.split(':').length === 2) tStr += ':00'; // Append seconds if missing
                
                const isoStr = `${yyyy.length === 2 ? '20'+yyyy : yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${tStr}Z`;
                const ms = Date.parse(isoStr);
                return isNaN(ms) ? null : Math.floor(ms / 1000);
            };

            const twStart = parseDate(startKey ? row[startKey] : null);
            const twEnd = parseDate(endKey ? row[endKey] : null);
            
            if (!twStart || !twEnd) { dateFails++; return; }
            if (twStart < earliestTwStart) earliestTwStart = twStart;

            const endMs = twEnd * 1000;
            const daysUntilEnd = (endMs - nowMs) / (1000 * 60 * 60 * 24);
            let priority = 50;
            if (daysUntilEnd <= 2) priority = 100;
            else if (daysUntilEnd <= 7) priority = 80;
            else if (daysUntilEnd <= 14) priority = 60;
            else priority = 40;
            
            const loc = [site.lon, site.lat];
            validJobs.push({
                id: jobIdCounter++,
                description: `${siteRef} - ${typeKey && row[typeKey] ? row[typeKey] : 'PI'} [${site.town}]`,
                location: loc,
                skills: [skillCode],
                service: DEFAULT_SERVICE_TIME_S,
                time_windows: [[twStart, twEnd]],
                priority: priority,
                urgency_level: priority >= 80 ? 'critical' : priority >= 60 ? 'high' : 'medium'
            });
        });

        if (validJobs.length === 0) {
            alert(`Parsed 0 jobs! Debug info:\n- Early fails (no Site Ref): ${noSiteRef}\n- Unmapped to sites: ${noSiteMap}\n- Failed Start/End Window dates: ${dateFails}`);
            btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
            btn.disabled = false;
            return;
        }

        const shiftStartVal = $('#bridge-shift-start').value;
        const shiftEndVal = $('#bridge-shift-end').value;
        const horizonDays = parseInt($('#bridge-horizon-days').value) || 1;

        const baseDateMs = earliestTwStart !== Infinity ? earliestTwStart * 1000 : nowMs;
        const baseDate = new Date(baseDateMs);
        baseDate.setUTCHours(0,0,0,0);
        
        const [sh, sm] = shiftStartVal.split(':').map(Number);
        const [eh, em] = shiftEndVal.split(':').map(Number);

        const vehicles = [];
        let engIdCounter = 1;

        // Harvest Fleet from Rota Matrix
        const baseShiftStartMs = baseDate.getTime() + (sh * 3600000 + sm * 60000);

        const trs = document.querySelectorAll('#rota-matrix-container tbody tr');
        if (trs.length === 0) {
            alert("No engineers configured in the Rota Matrix. Please upload an Engineer Roster CSV first.");
            btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
            btn.disabled = false;
            return;
        }

        trs.forEach(tr => {
            const tdElement = tr.querySelector('td');
            if (!tdElement) return;
            
            const name = tdElement.textContent.trim();
            let skills = [1003];
            try { 
                skills = JSON.parse(tr.getAttribute('data-skills')); 
            } catch(e) {
                console.warn("Failed parsing skills from row for", name);
            }

            for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
                const day = dayOffset + 1;
                const checkbox = tr.querySelector(`input[type="checkbox"][data-day="${day}"]`);
                if (!checkbox || !checkbox.checked) continue; // Dispatcher turned off this day

                const startTimeInput = tr.querySelector(`input[data-type="start"][data-day="${day}"]`).value;
                const endTimeInput = tr.querySelector(`input[data-type="end"][data-day="${day}"]`).value;

                let cSh = sh, cSm = sm, cEh = eh, cEm = em;
                if (startTimeInput) [cSh, cSm] = startTimeInput.split(':').map(Number);
                if (endTimeInput) [cEh, cEm] = endTimeInput.split(':').map(Number);

                const dayBaseMs = baseDate.getTime() + (dayOffset * 24 * 60 * 60 * 1000);
                const shiftStartMs = dayBaseMs + (cSh * 3600000 + cSm * 60000);
                const shiftEndMs = dayBaseMs + (cEh * 3600000 + cEm * 60000);

                vehicles.push({
                    id: engIdCounter++,
                    name: `${name}_Day${day}`,
                    start: START_DEPOT,
                    end: START_DEPOT,
                    skills: skills, 
                    time_window: [Math.floor(shiftStartMs / 1000), Math.floor(shiftEndMs / 1000)]
                });
                locations.push(START_DEPOT); 
            }
        });

        validJobs.forEach(j => locations.push(j.location));

        bridgeState.jobs = validJobs;
        bridgeState.vehicles = vehicles;
        bridgeState.locations = locations;
        bridgeState.shift_start = Math.floor(baseShiftStartMs / 1000);

        $('#bridge-metrics').textContent = `${validJobs.length} Jobs, ${vehicles.length} Vehicles mapped.`;
        $('#bridge-export-section').style.display = 'block';

        btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
        btn.disabled = false;
        
    } catch (e) {
        console.error(e);
        alert("Error mapping data: " + e.message);
        btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
        btn.disabled = false;
    }
}

function parseCSV(file) {
    if (typeof Papa === 'undefined') {
        throw new Error("PapaParse library not loaded. Make sure the script is included in HTML.");
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            let text = e.target.result;
            // Clean up null bytes from UTF-16 encoded files read as UTF-8
            if (text.indexOf('\x00') !== -1) {
                text = text.replace(/\x00/g, '');
            }
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: resolve,
                error: reject
            });
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function downloadBridgeJSON(type) {
    if (!bridgeState[type]) return;
    const payload = {};
    payload[type] = bridgeState[type];
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); 
    a.download = `bridge_${type}.json`;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
}

async function injectBridgeToSandbox() {
    if (!bridgeState.jobs || !bridgeState.vehicles) return;
    switchTab('history');
    
    const scenario = {
        vehicles: bridgeState.vehicles,
        jobs: bridgeState.jobs,
        locations: bridgeState.locations,
        skills_map: PI_SKILLS,
        shift_start: bridgeState.shift_start
    };

    state.numEngineers = bridgeState.vehicles.length;
    state.numJobs = bridgeState.jobs.length;

    await runSimulation(scenario);
}

// Initialisation now handled per-project in loadInitialData()


